using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Backend.Utilities;
using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/cashier")]
    [Authorize(Roles = "Cashier")]
    public class CashierController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IAccountNumberService _accNumService;
        private readonly ITransactionService _txnService;
        private readonly IFraudDetectionService _fraudService;
        private readonly IAuditService _audit;

        public CashierController(AppDbContext db, IAccountNumberService accNumService,
            ITransactionService txnService, IFraudDetectionService fraudService, IAuditService audit)
        {
            _db = db;
            _accNumService = accNumService;
            _txnService = txnService;
            _fraudService = fraudService;
            _audit = audit;
        }

        

        // POST /api/cashier/sessions
        [HttpPost("sessions")]
        public async Task<IActionResult> StartSession([FromBody] StartSessionRequest req)
        {
            var userId = GetCurrentUserId();
            var existing = await _db.CashierSessions.FirstOrDefaultAsync(s => s.CashierUserId == userId && s.Status == "Active");
            if (existing != null)
                return BadRequest(new { detail = "You already have an active session", sessionId = existing.Id });

            var sessionId = $"sess-{DateTime.UtcNow:yyyyMMddHHmmssfff}";
            var session = new CashierSession
            {
                Id = sessionId,
                CashierUserId = userId,
                CashierFullName = req.CashierFullName,
                Status = "Active",
                StartedAt = DateTime.UtcNow
            };

            _db.CashierSessions.Add(session);
            await _db.SaveChangesAsync();

            var totalAccounts = await _db.Accounts.CountAsync(a => a.Status == "Active");
            var systemBalance = await GetSystemBalanceAsync();

            await _audit.LogAsync(userId, req.CashierFullName, "Cashier",
                "StartSession", "Session", null, "Success", $"Session {sessionId} started");

            return StatusCode(201, new
            {
                sessionId, cashierFullName = session.CashierFullName,
                cashierUserId = userId, startedAt = session.StartedAt,
                status = session.Status,
                statusPanel = new
                {
                    totalAccountsInSystem = totalAccounts,
                    totalSystemBalance = systemBalance,
                    totalDepositsCurrentSession = 0.0m
                },
                message = "Session started successfully"
            });
        }

        // GET /api/cashier/sessions/{id}/status
        [HttpGet("sessions/{id}/status")]
        public async Task<IActionResult> GetSessionStatus(string id)
        {
            var session = await _db.CashierSessions.FirstOrDefaultAsync(s => s.Id == id);
            if (session == null) return NotFound();

            var sessionDeposits = await _db.Transactions
                .Where(t => t.CashierSessionId == id && t.Type == "Deposit" && t.Status == "Completed")
                .SumAsync(t => t.Amount);

            var totalAccounts = await _db.Accounts.CountAsync(a => a.Status == "Active");

            return Ok(new
            {
                sessionId = session.Id, cashierFullName = session.CashierFullName,
                startedAt = session.StartedAt, status = session.Status,
                totalAccountsInSystem = totalAccounts,
                totalSystemBalance = await GetSystemBalanceAsync(),
                totalDepositsCurrentSession = sessionDeposits
            });
        }

        // POST /api/cashier/sessions/{id}/end
        [HttpPost("sessions/{id}/end")]
        public async Task<IActionResult> EndSession(string id, [FromBody] EndSessionRequest req)
        {
            if (!req.Confirm) return BadRequest(new { detail = "Confirmation required" });

            var session = await _db.CashierSessions.FirstOrDefaultAsync(s => s.Id == id);
            if (session == null) return NotFound();
            if (session.Status != "Active") return BadRequest(new { detail = "Session is not active" });

            session.Status = "Closed";
            session.EndedAt = DateTime.UtcNow;

            var txns = await _db.Transactions
                .Where(t => t.CashierSessionId == id && t.Status == "Completed")
                .ToListAsync();

            await _db.SaveChangesAsync();

            return Ok(new
            {
                sessionId = session.Id, cashierFullName = session.CashierFullName,
                startedAt = session.StartedAt, endedAt = session.EndedAt,
                status = session.Status,
                finalStatistics = new
                {
                    totalDeposits = txns.Where(t => t.Type == "Deposit").Sum(t => t.Amount),
                    totalWithdrawals = txns.Where(t => t.Type == "Withdrawal").Sum(t => t.Amount),
                    totalTransfers = txns.Where(t => t.Type == "Transfer").Sum(t => t.Amount),
                    totalFees = txns.Sum(t => t.Fee),
                    transactionsCount = txns.Count
                },
                message = "Session ended successfully"
            });
        }

        

        // GET /api/cashier/clients
        [HttpGet("clients")]
        public async Task<IActionResult> GetClients(
            string? type = null, bool? isDebtor = null,
            string? search = null, int page = 1, int pageSize = 20)
        {
            var query = _db.Clients.AsQueryable();

            if (!string.IsNullOrEmpty(type)) query = query.Where(c => c.ClientType == type);
            if (isDebtor.HasValue) query = query.Where(c => c.IsDebtor == isDebtor.Value);
            if (!string.IsNullOrEmpty(search))
                query = query.Where(c =>
                    (c.FirstName != null && c.FirstName.Contains(search)) ||
                    (c.LastName != null && c.LastName.Contains(search)) ||
                    (c.CompanyName != null && c.CompanyName.Contains(search)) ||
                    (c.PhoneNumber != null && c.PhoneNumber.Contains(search)));

            var total = await query.CountAsync();
            var clients = await query
                .OrderByDescending(c => c.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                data = clients.Select(c => new
                {
                    id = c.Id, clientType = c.ClientType,
                    fullName = c.FullName, phoneNumber = c.PhoneNumber,
                    status = c.Status, isDebtor = c.IsDebtor
                }),
                meta = new PaginationMeta { Total = total, Page = page, PageSize = pageSize }
            });
        }

        // GET /api/cashier/clients/{id}
        [HttpGet("clients/{id}")]
        public async Task<IActionResult> GetClient(Guid id)
        {
            var client = await _db.Clients
                .Include(c => c.Accounts)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (client == null) return NotFound();

            var clientAccountIds = client.Accounts.Select(a => a.Id).ToList();
            var recentTransactions = await _db.Transactions
                .Where(t => clientAccountIds.Contains(t.FromAccountId ?? Guid.Empty) ||
                            clientAccountIds.Contains(t.ToAccountId ?? Guid.Empty))
                .Include(t => t.FromAccount)
                .Include(t => t.ToAccount)
                .OrderByDescending(t => t.CreatedAt)
                .Take(5)
                .ToListAsync();

            var response = new Dictionary<string, object?>
            {
                ["id"] = client.Id, ["clientType"] = client.ClientType,
                ["phoneNumber"] = client.PhoneNumber, ["email"] = client.Email,
                ["isDebtor"] = client.IsDebtor, ["status"] = client.Status,
                ["createdAt"] = client.CreatedAt,
                ["fullName"] = client.FullName,
                ["accounts"] = client.Accounts
                    .OrderByDescending(a => a.OpenedAt)
                    .Select(a => new
                {
                    id = a.Id, accountNumber = a.AccountNumber, accountType = a.AccountType,
                    subType = a.SubType, currency = a.Currency, balance = a.Balance,
                    availableBalance = a.AvailableBalance, status = a.Status,
                    cardDesign = AccountDesignHelper.Resolve(a.CardDesign, a.AccountType, a.SubType),
                    openedAt = a.OpenedAt, lastTransactionAt = a.LastTransactionAt
                }),
                ["totalBalance"] = client.Accounts
                    .Where(a => a.Status != "Closed")
                    .GroupBy(a => a.Currency)
                    .ToDictionary(g => g.Key, g => g.Sum(a => a.Balance))
            };

            response["recentTransactions"] = recentTransactions.Select(t =>
            {
                var isOutgoing = clientAccountIds.Contains(t.FromAccountId ?? Guid.Empty);
                return new
                {
                    id = t.Id,
                    type = t.Type,
                    amount = isOutgoing ? -t.Amount : t.Amount,
                    currency = t.Currency,
                    description = t.Description ?? t.Type,
                    reference = t.Reference,
                    createdAt = t.CreatedAt,
                    accountNumber = isOutgoing
                        ? t.FromAccount?.AccountNumber
                        : t.ToAccount?.AccountNumber
                };
            }).ToList();

            if (client.ClientType == "Individual")
            {
                response["firstName"] = client.FirstName;
                response["lastName"] = client.LastName;
                response["dateOfBirth"] = client.DateOfBirth;
                response["gender"] = client.Gender;
                response["photoUrl"] = client.PhotoUrl;
            }
            else
            {
                response["companyName"] = client.CompanyName;
                response["legalAddress"] = client.LegalAddress;
                response["ownershipForm"] = client.OwnershipForm;
                response["directorFullName"] = client.DirectorFullName;
            }

            return Ok(response);
        }

        // PATCH /api/cashier/clients/{id}/status
        [HttpPatch("clients/{id}/status")]
        public async Task<IActionResult> ChangeClientStatus(Guid id, [FromBody] ChangeStatusRequest req)
        {
            if (req.Action != "Block" && req.Action != "Unblock")
                return BadRequest(new { detail = "Unsupported client status action" });

            var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == id);
            if (client == null) return NotFound();

            client.Status = req.Action == "Block" ? "Blocked" : "Active";
            client.UpdatedAt = DateTimeOffset.Now;
            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            var actionName = req.Action == "Block" ? "BlockClient" : "UnblockClient";
            await _audit.LogAsync(userId, null, "Cashier",
                actionName, $"Client {client.FullName}", client.Id, "Success",
                $"{client.FullName} {(client.Status == "Active" ? "разблокирован" : "заблокирован")}");

            return Ok(new
            {
                clientId = client.Id,
                fullName = client.FullName,
                status = client.Status,
                updatedAt = client.UpdatedAt,
                message = client.Status == "Active"
                    ? "Client unblocked successfully"
                    : "Client blocked successfully"
            });
        }

        // POST /api/cashier/clients
        [HttpPost("clients")]
        public async Task<IActionResult> CreateClient([FromBody] CreateClientRequest req)
        {
            
            if (!string.IsNullOrEmpty(req.Email) && await _db.Clients.AnyAsync(c => c.Email == req.Email))
                return BadRequest(new { errors = new { email = new[] { "Email already exists" } } });
            if (!string.IsNullOrEmpty(req.Email) && await _db.Users.AnyAsync(u => u.Email == req.Email))
                return BadRequest(new { errors = new { email = new[] { "Email уже используется учётной записью" } } });
            if (!string.IsNullOrEmpty(req.PhoneNumber) && await _db.Clients.AnyAsync(c => c.PhoneNumber == req.PhoneNumber))
                return BadRequest(new { errors = new { phoneNumber = new[] { "Phone number already registered" } } });

            var client = new Client
            {
                Id = Guid.NewGuid(),
                ClientType = req.ClientType,
                FirstName = req.FirstName, LastName = req.LastName,
                DateOfBirth = req.DateOfBirth.HasValue
                    ? DateTime.SpecifyKind(req.DateOfBirth.Value.Date, DateTimeKind.Utc)
                    : null,
                Gender = req.Gender,
                CompanyName = req.CompanyName, LegalAddress = req.LegalAddress,
                OwnershipForm = req.OwnershipForm,
                DirectorFullName = req.DirectorFullName,
                AccountantFullName = req.AccountantFullName,
                PhoneNumber = req.PhoneNumber, Email = req.Email,
                Status = "Active", CreatedAt = DateTimeOffset.Now, UpdatedAt = DateTimeOffset.Now
            };

            
            if (!string.IsNullOrEmpty(req.PhotoBase64))
            {
                client.PhotoUrl = $"/uploads/clients/{client.Id}.jpg";
                
            }

            _db.Clients.Add(client);

            if (req.Address != null)
            {
                _db.ClientAddresses.Add(new ClientAddress
                {
                    Id = Guid.NewGuid(), ClientId = client.Id,
                    Country = req.Address.Country, City = req.Address.City,
                    Street = req.Address.Street, Building = req.Address.Building,
                    Apartment = req.Address.Apartment, PostalCode = req.Address.PostalCode
                });
            }

            // Создаём учётную запись для входа: клиент-физлицо с email
            // получает логин (роль Customer). Так он появляется в админке
            // и может входить в личный кабинет. Личность подтверждена
            // кассиром лично, поэтому без 2FA на почту и сразу verified.
            string? tempPassword = null;
            if (client.ClientType == "Individual" && !string.IsNullOrWhiteSpace(req.Email))
            {
                tempPassword = GenerateTempPassword();
                var loginUser = new User
                {
                    Id = Guid.NewGuid(),
                    Email = req.Email!.Trim(),
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword),
                    FirstName = req.FirstName ?? "",
                    LastName = req.LastName ?? "",
                    PhoneNumber = req.PhoneNumber ?? "",
                    Role = "Customer",
                    IsActive = true,
                    IsVerified = true,
                    EmailVerified = false,
                    TwoFactorEnabled = false,
                    CreatedAt = DateTimeOffset.Now,
                    UpdatedAt = DateTimeOffset.Now
                };
                _db.Users.Add(loginUser);
                _db.UserSettings.Add(new UserSettings { Id = Guid.NewGuid(), UserId = loginUser.Id });
                client.UserId = loginUser.Id;
            }

            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            await _audit.LogAsync(userId, null, "Cashier",
                "CreateClient", $"Client {client.FullName}", client.Id, "Success",
                tempPassword != null ? "Создан логин (роль Customer)" : "Без логина");

            return StatusCode(201, new
            {
                id = client.Id, clientType = client.ClientType,
                fullName = client.FullName, phoneNumber = client.PhoneNumber,
                email = client.Email, status = client.Status,
                createdAt = client.CreatedAt,
                loginCreated = tempPassword != null,
                loginEmail = tempPassword != null ? client.Email : null,
                temporaryPassword = tempPassword,
                message = tempPassword != null
                    ? "Клиент зарегистрирован. Передайте клиенту логин и временный пароль."
                    : "Client registered successfully"
            });
        }

        // Временный пароль для выданного кассиром логина: ≥12 символов,
        // гарантированно с заглавной, строчной, цифрой и спецсимволом
        // (соответствует политике паролей при последующей смене).
        private static string GenerateTempPassword()
        {
            const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
            const string lower = "abcdefghijkmnpqrstuvwxyz";
            const string digit = "23456789";
            const string special = "!@#$%^&*";
            const string all = upper + lower + digit + special;

            using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
            char Pick(string set)
            {
                var b = new byte[1];
                rng.GetBytes(b);
                return set[b[0] % set.Length];
            }

            var chars = new List<char> { Pick(upper), Pick(lower), Pick(digit), Pick(special) };
            for (var i = 0; i < 8; i++) chars.Add(Pick(all));

            for (var i = chars.Count - 1; i > 0; i--)
            {
                var b = new byte[1];
                rng.GetBytes(b);
                var j = b[0] % (i + 1);
                (chars[i], chars[j]) = (chars[j], chars[i]);
            }

            return new string(chars.ToArray());
        }

        // PUT /api/cashier/clients/{id}
        [HttpPut("clients/{id}")]
        public async Task<IActionResult> UpdateClient(Guid id, [FromBody] UpdateClientRequest req)
        {
            var client = await _db.Clients.Include(c => c.Address).FirstOrDefaultAsync(c => c.Id == id);
            if (client == null) return NotFound();

            if (!string.IsNullOrEmpty(req.FirstName)) client.FirstName = req.FirstName;
            if (!string.IsNullOrEmpty(req.LastName)) client.LastName = req.LastName;
            if (!string.IsNullOrEmpty(req.PhoneNumber)) client.PhoneNumber = req.PhoneNumber;
            if (!string.IsNullOrEmpty(req.Email)) client.Email = req.Email;
            if (!string.IsNullOrEmpty(req.CompanyName)) client.CompanyName = req.CompanyName;
            if (!string.IsNullOrEmpty(req.LegalAddress)) client.LegalAddress = req.LegalAddress;
            if (!string.IsNullOrEmpty(req.OwnershipForm)) client.OwnershipForm = req.OwnershipForm;
            if (!string.IsNullOrEmpty(req.DirectorFullName)) client.DirectorFullName = req.DirectorFullName;
            if (!string.IsNullOrEmpty(req.AccountantFullName)) client.AccountantFullName = req.AccountantFullName;
            client.UpdatedAt = DateTimeOffset.Now;

            if (req.Address != null)
            {
                if (client.Address == null)
                {
                    client.Address = new ClientAddress { Id = Guid.NewGuid(), ClientId = client.Id };
                    _db.ClientAddresses.Add(client.Address);
                }
                client.Address.Country = req.Address.Country;
                client.Address.City = req.Address.City;
                client.Address.Street = req.Address.Street;
                client.Address.Building = req.Address.Building;
                client.Address.Apartment = req.Address.Apartment;
                client.Address.PostalCode = req.Address.PostalCode;
            }

            await _db.SaveChangesAsync();

            return Ok(new
            {
                id = client.Id, fullName = client.FullName,
                updatedAt = client.UpdatedAt,
                message = "Client updated successfully"
            });
        }

        // DELETE /api/cashier/clients/{id}
        [HttpDelete("clients/{id}")]
        public async Task<IActionResult> DeleteClient(Guid id)
        {
            var client = await _db.Clients.Include(c => c.Accounts).FirstOrDefaultAsync(c => c.Id == id);
            if (client == null) return NotFound();

            var activeAccounts = client.Accounts.Count(a => a.Status == "Active");
            if (activeAccounts > 0)
                return Conflict(new
                {
                    title = "Conflict", status = 409,
                    detail = "Cannot delete client with active accounts",
                    context = new { activeAccountsCount = activeAccounts },
                    timestamp = DateTime.UtcNow
                });

            _db.Clients.Remove(client);
            await _db.SaveChangesAsync();

            return Ok(new { message = "Client deleted successfully", deletedAt = DateTime.UtcNow });
        }

        

        // POST /api/cashier/accounts
        [HttpPost("accounts")]
        public async Task<IActionResult> OpenAccount([FromBody] CashierOpenAccountRequest req)
        {
            var client = await _db.Clients.FindAsync(req.ClientId);
            if (client == null) return NotFound(new { detail = "Client not found" });
            if (client.Status != "Active") return Conflict(new { detail = "Client is blocked" });

            var interestRate = req.AccountType == "Savings" ? 7.0m : 0.0m;
            var accountNumber = await _accNumService.GenerateAccountNumberAsync(req.AccountType);

            // Валидация зарплатного счёта
            if (req.IsSalaryAccount)
            {
                if (req.Currency != "RUB")
                    return BadRequest(new { detail = "Salary account can only be in RUB" });
                if (req.AccountType != "Checking" || req.SubType != "Debit")
                    return BadRequest(new { detail = "Salary account must be Checking/Debit" });
                var hasSalary = await _db.Accounts.AnyAsync(a => a.ClientId == req.ClientId && a.IsSalaryAccount && a.Status == "Active");
                if (hasSalary)
                    return BadRequest(new { detail = "Client already has a salary account" });
            }

            var account = new Account
            {
                Id = Guid.NewGuid(), ClientId = req.ClientId,
                AccountNumber = accountNumber,
                AccountType = req.AccountType,
                SubType = req.AccountType == "Savings" ? null : req.SubType ?? "Debit",
                Currency = req.Currency,
                Balance = req.InitialDeposit, AvailableBalance = req.InitialDeposit,
                Status = "Active",
                Iban = _accNumService.GenerateIban(), Bic = "BANKRU2MXXX",
                InterestRate = interestRate,
                Purpose = req.IsSalaryAccount ? "Зарплатный" : req.Purpose,
                CardDesign = AccountDesignHelper.Normalize(req.CardDesign, req.AccountType, req.SubType),
                IsSalaryAccount = req.IsSalaryAccount,
                IsFirstWithdrawal = true, OpenedAt = DateTime.UtcNow
            };

            _db.Accounts.Add(account);
            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            await _audit.LogAsync(userId, null, "Cashier",
                "OpenAccount", $"Account {accountNumber}", account.Id, "Success",
                $"Client: {client.FullName}, Type: {req.AccountType}, Currency: {req.Currency}");

            return StatusCode(201, new
            {
                id = account.Id, accountNumber, accountType = account.AccountType,
                subType = account.SubType, currency = account.Currency,
                balance = account.Balance, availableBalance = account.AvailableBalance,
                status = account.Status, openedAt = account.OpenedAt,
                interestRate = account.InterestRate, purpose = account.Purpose,
                cardDesign = AccountDesignHelper.Resolve(account.CardDesign, account.AccountType, account.SubType),
                clientId = client.Id, clientFullName = client.FullName,
                message = "Account opened successfully"
            });
        }

        // PUT /api/cashier/accounts/{id}/design
        [HttpPut("accounts/{id}/design")]
        public async Task<IActionResult> UpdateAccountDesign(Guid id, [FromBody] UpdateAccountDesignRequest req)
        {
            var account = await _db.Accounts.Include(a => a.Client).FirstOrDefaultAsync(a => a.Id == id);
            if (account == null) return NotFound();

            var nextDesign = AccountDesignHelper.Normalize(req.CardDesign, account.AccountType, account.SubType);
            account.CardDesign = nextDesign;
            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            await _audit.LogAsync(userId, User.FindFirst("firstName")?.Value + " " + User.FindFirst("lastName")?.Value, "Cashier",
                "UpdateAccountDesign", $"Account {account.AccountNumber}", account.Id, "Success",
                $"CardDesign: {nextDesign}");

            return Ok(new
            {
                id = account.Id,
                accountNumber = account.AccountNumber,
                cardDesign = nextDesign,
                message = "Account design updated successfully"
            });
        }

        // DELETE /api/cashier/accounts/{id}
        [HttpDelete("accounts/{id}")]
        public async Task<IActionResult> CloseAccount(Guid id, [FromBody] CashierCloseAccountRequest req)
        {
            var account = await _db.Accounts.FindAsync(id);
            if (account == null) return NotFound();

            if (account.Status == "Closed")
                return Conflict(new { detail = "Счёт уже закрыт" });

            if (account.AccountNumber != req.ConfirmAccountNumber)
                return BadRequest(new { detail = "Account number confirmation does not match" });

            if (account.Balance != 0)
                return UnprocessableEntity(new
                {
                    title = "Cannot Close Account", status = 422,
                    detail = "Cannot close account with non-zero balance",
                    context = new { accountNumber = account.AccountNumber, currentBalance = account.Balance, currency = account.Currency },
                    timestamp = DateTime.UtcNow
                });

            account.Status = "Closed";
            account.ClosedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            var closeUserId = GetCurrentUserId();
            await _audit.LogAsync(closeUserId, null, "Cashier",
                "CloseAccount", $"Account {account.AccountNumber}", account.Id, "Success",
                "Счёт закрыт");

            return Ok(new
            {
                accountId = account.Id, accountNumber = account.AccountNumber,
                status = account.Status, closedAt = account.ClosedAt,
                message = "Account closed successfully"
            });
        }

        // PATCH /api/cashier/accounts/{id}/status — заморозка / разморозка.
        // Заморозка обратима: операции по счёту запрещены, но его можно
        // разморозить. Закрытый счёт замораживать/размораживать нельзя.
        [HttpPatch("accounts/{id}/status")]
        public async Task<IActionResult> ChangeAccountStatus(Guid id, [FromBody] ChangeStatusRequest req)
        {
            if (req.Action != "Freeze" && req.Action != "Unfreeze")
                return BadRequest(new { detail = "Unsupported account status action" });

            var account = await _db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
            if (account == null) return NotFound(new { detail = "Account not found" });

            if (account.Status == "Closed")
                return Conflict(new { detail = "Счёт закрыт — изменить статус нельзя" });

            if (req.Action == "Freeze")
            {
                if (account.Status == "Frozen")
                    return Conflict(new { detail = "Счёт уже заморожен" });
                account.Status = "Frozen";
            }
            else
            {
                if (account.Status != "Frozen")
                    return Conflict(new { detail = "Счёт не заморожен" });
                account.Status = "Active";
            }

            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            var actionName = req.Action == "Freeze" ? "FreezeAccount" : "UnfreezeAccount";
            await _audit.LogAsync(userId, null, "Cashier",
                actionName, $"Account {account.AccountNumber}", account.Id, "Success",
                account.Status == "Frozen" ? "Счёт заморожен" : "Счёт разморожен");

            return Ok(new
            {
                accountId = account.Id,
                accountNumber = account.AccountNumber,
                status = account.Status,
                message = account.Status == "Frozen"
                    ? "Account frozen successfully"
                    : "Account unfrozen successfully"
            });
        }

        

        // POST /api/cashier/transactions/deposit
        [HttpPost("transactions/deposit")]
        public async Task<IActionResult> Deposit([FromBody] CashierDepositRequest req)
        {
            var account = await _db.Accounts.Include(a => a.Client).FirstOrDefaultAsync(a => a.Id == req.AccountId);
            if (account == null) return NotFound(new { detail = "Account not found" });
            if (account.Client?.Status != "Active") return Conflict(new { detail = "Client is blocked" });
            if (AccountUnavailableReason(account) is string depositBlock)
                return Conflict(new { detail = depositBlock });

            var transaction = new Transaction
            {
                Id = Guid.NewGuid(), Reference = _txnService.GenerateReference(),
                Type = "Deposit", Status = "Pending",
                Amount = req.Amount, Currency = req.Currency,
                Description = req.Description, ToAccountId = account.Id,
                Fee = 0, CashierSessionId = req.SessionId,
                CashierFullName = User.FindFirst("firstName")?.Value + " " + User.FindFirst("lastName")?.Value,
                CreatedAt = DateTime.UtcNow
            };

            _db.Transactions.Add(transaction);
            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            var fraudResult = await _fraudService.CheckTransactionAsync(transaction, account);

            if (fraudResult.IsSuspicious)
            {
                await _audit.LogAsync(userId, transaction.CashierFullName, "Cashier",
                    "Deposit", $"Account {account.AccountNumber}", account.Id, "PendingReview",
                    $"Amount: {req.Amount} {req.Currency}, Risk: {fraudResult.RiskScore:P1}", req);

                return StatusCode(202, new
                {
                    transactionId = transaction.Reference, type = transaction.Type,
                    status = transaction.Status, amount = transaction.Amount,
                    currency = transaction.Currency, description = transaction.Description,
                    account = new
                    {
                        accountNumber = account.AccountNumber, accountType = account.AccountType,
                        subType = account.SubType, ownerFullName = account.Client?.FullName
                    },
                    balanceAfter = account.Balance,
                    cashierFullName = transaction.CashierFullName,
                    sessionId = req.SessionId, fee = 0m,
                    reference = transaction.Reference,
                    createdAt = transaction.CreatedAt,
                    anomalyType = fraudResult.AnomalyType,
                    riskScore = fraudResult.RiskScore,
                    triggerReason = fraudResult.TriggerReason,
                    triggerReasonFull = fraudResult.TriggerReasonFull,
                    message = "Deposit sent for fraud review"
                });
            }

            await using (var tx = await _db.Database.BeginTransactionAsync())
            {
                await LockAccountsAsync(account.Id);
                await _db.Entry(account).ReloadAsync();

                account.Balance += req.Amount;
                account.AvailableBalance += req.Amount;
                account.LastTransactionAt = DateTime.UtcNow;
                transaction.Status = "Completed";
                transaction.CompletedAt = DateTime.UtcNow;
                transaction.BalanceAfter = account.Balance;

                if (account.Balance >= 0 && account.Client.IsDebtor)
                {
                    var allAccounts = await _db.Accounts
                        .Where(a => a.ClientId == account.ClientId && a.Status == "Active")
                        .ToListAsync();
                    if (allAccounts.All(a => a.Balance >= 0))
                        account.Client.IsDebtor = false;
                }

                await _db.SaveChangesAsync();
                await tx.CommitAsync();
            }

            await _audit.LogAsync(userId, transaction.CashierFullName, "Cashier",
                "Deposit", $"Account {account.AccountNumber}", account.Id, "Success",
                $"Amount: {req.Amount} {req.Currency}", req);

            return StatusCode(201, new
            {
                transactionId = transaction.Reference, type = transaction.Type,
                status = transaction.Status, amount = transaction.Amount,
                currency = transaction.Currency, description = transaction.Description,
                account = new
                {
                    accountNumber = account.AccountNumber, accountType = account.AccountType,
                    subType = account.SubType, ownerFullName = account.Client?.FullName
                },
                balanceAfter = account.Balance,
                cashierFullName = transaction.CashierFullName,
                sessionId = req.SessionId, fee = 0m,
                reference = transaction.Reference,
                createdAt = transaction.CreatedAt,
                message = "Deposit completed successfully"
            });
        }

        // POST /api/cashier/transactions/withdraw
        [HttpPost("transactions/withdraw")]
        public async Task<IActionResult> Withdraw([FromBody] CashierWithdrawRequest req)
        {
            var account = await _db.Accounts.Include(a => a.Client).FirstOrDefaultAsync(a => a.Id == req.AccountId);
            if (account == null) return NotFound(new { detail = "Account not found" });
            if (account.Client?.Status != "Active") return Conflict(new { detail = "Client is blocked" });
            if (AccountUnavailableReason(account) is string withdrawBlock)
                return Conflict(new { detail = withdrawBlock });

            var feeCalc = _txnService.CalculateFee(account, req.Amount, "Withdrawal");
            var totalDebit = req.Amount + feeCalc.FeeAmount;

            
            if (account.SubType != "Credit" && account.AvailableBalance < totalDebit)
                return UnprocessableEntity(new
                {
                    title = "Insufficient Funds", status = 422,
                    detail = "Insufficient funds",
                    context = new { requestedAmount = totalDebit, availableBalance = account.AvailableBalance },
                    timestamp = DateTime.UtcNow
                });

            var transaction = new Transaction
            {
                Id = Guid.NewGuid(), Reference = _txnService.GenerateReference(),
                Type = "Withdrawal", Status = "Pending",
                Amount = req.Amount, Currency = req.Currency,
                Description = req.Description, FromAccountId = account.Id,
                Fee = feeCalc.FeeAmount, FeePercent = feeCalc.FeePercent,
                FeeReason = feeCalc.FeeReason,
                CashierSessionId = req.SessionId,
                CashierFullName = User.FindFirst("firstName")?.Value + " " + User.FindFirst("lastName")?.Value,
                CreatedAt = DateTime.UtcNow
            };

            _db.Transactions.Add(transaction);
            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            var fraudResult = await _fraudService.CheckTransactionAsync(transaction, account);

            await using var tx = await _db.Database.BeginTransactionAsync();
            await LockAccountsAsync(account.Id);
            await _db.Entry(account).ReloadAsync();

            // Повторная проверка средств под блокировкой строки: между ранней
            // проверкой и этим моментом баланс мог изменить другой кассир/процесс.
            if (account.SubType != "Credit" && account.AvailableBalance < totalDebit)
            {
                await tx.RollbackAsync();
                return UnprocessableEntity(new
                {
                    title = "Insufficient Funds", status = 422,
                    detail = "Insufficient funds",
                    context = new { requestedAmount = totalDebit, availableBalance = account.AvailableBalance },
                    timestamp = DateTime.UtcNow
                });
            }

            if (fraudResult.IsSuspicious)
            {
                account.HoldAmount += totalDebit;
                account.AvailableBalance -= totalDebit;
                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                await _audit.LogAsync(userId, transaction.CashierFullName, "Cashier",
                    "Withdrawal", $"Account {account.AccountNumber}", account.Id, "PendingReview",
                    $"Amount: {req.Amount} {req.Currency}, Fee: {feeCalc.FeeAmount}, Risk: {fraudResult.RiskScore:P1}", req);

                return StatusCode(202, new
                {
                    transactionId = transaction.Reference, type = transaction.Type,
                    status = transaction.Status, amount = transaction.Amount,
                    currency = transaction.Currency, description = transaction.Description,
                    account = new
                    {
                        accountNumber = account.AccountNumber, accountType = account.AccountType,
                        subType = account.SubType, ownerFullName = account.Client?.FullName
                    },
                    feeDetails = new
                    {
                        feePercent = feeCalc.FeePercent, feeAmount = feeCalc.FeeAmount,
                        isFirstWithdrawal = feeCalc.IsFirstWithdrawal, feeReason = feeCalc.FeeReason
                    },
                    amountToIssue = req.Amount,
                    balanceAfter = account.Balance,
                    cashierFullName = transaction.CashierFullName,
                    sessionId = req.SessionId, reference = transaction.Reference,
                    createdAt = transaction.CreatedAt,
                    anomalyType = fraudResult.AnomalyType,
                    riskScore = fraudResult.RiskScore,
                    triggerReason = fraudResult.TriggerReason,
                    triggerReasonFull = fraudResult.TriggerReasonFull,
                    message = "Withdrawal sent for fraud review"
                });
            }

            account.Balance -= totalDebit;
            account.AvailableBalance -= totalDebit;
            account.LastTransactionAt = DateTime.UtcNow;
            transaction.Status = "Completed";
            transaction.CompletedAt = DateTime.UtcNow;
            transaction.BalanceAfter = account.Balance;

            if (account.Balance < 0) account.Client.IsDebtor = true;
            if (account.AccountType == "Savings") account.IsFirstWithdrawal = false;

            await _db.SaveChangesAsync();
            await tx.CommitAsync();

            await _audit.LogAsync(userId, transaction.CashierFullName, "Cashier",
                "Withdrawal", $"Account {account.AccountNumber}", account.Id, "Success",
                $"Amount: {req.Amount} {req.Currency}, Fee: {feeCalc.FeeAmount}", req);

            return StatusCode(201, new
            {
                transactionId = transaction.Reference, type = transaction.Type,
                status = transaction.Status, amount = transaction.Amount,
                currency = transaction.Currency, description = transaction.Description,
                account = new
                {
                    accountNumber = account.AccountNumber, accountType = account.AccountType,
                    subType = account.SubType, ownerFullName = account.Client?.FullName
                },
                feeDetails = new
                {
                    feePercent = feeCalc.FeePercent, feeAmount = feeCalc.FeeAmount,
                    isFirstWithdrawal = feeCalc.IsFirstWithdrawal, feeReason = feeCalc.FeeReason
                },
                amountToIssue = req.Amount,
                balanceAfter = account.Balance,
                cashierFullName = transaction.CashierFullName,
                sessionId = req.SessionId, reference = transaction.Reference,
                createdAt = transaction.CreatedAt,
                message = "Withdrawal completed successfully"
            });
        }

        // POST /api/cashier/transactions/transfer
        [HttpPost("transactions/transfer")]
        public async Task<IActionResult> Transfer([FromBody] CashierTransferRequest req)
        {
            var fromAccount = await _db.Accounts.Include(a => a.Client).FirstOrDefaultAsync(a => a.Id == req.FromAccountId);
            if (fromAccount == null) return NotFound(new { detail = "Source account not found" });

            var toAccount = await _db.Accounts.Include(a => a.Client).FirstOrDefaultAsync(a => a.AccountNumber == req.ToAccountNumber);
            if (toAccount == null) return NotFound(new { detail = $"Account '{req.ToAccountNumber}' not found" });
            if (fromAccount.Client?.Status != "Active" || toAccount.Client?.Status != "Active")
                return Conflict(new { detail = "Client is blocked" });
            if (AccountUnavailableReason(fromAccount) is string fromBlock)
                return Conflict(new { detail = $"Счёт списания: {fromBlock}" });
            if (AccountUnavailableReason(toAccount) is string toBlock)
                return Conflict(new { detail = $"Счёт получателя: {toBlock}" });

            if (!string.Equals(req.Currency, fromAccount.Currency, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { detail = "Валюта операции должна совпадать с валютой счёта списания" });

            if (!string.Equals(fromAccount.Currency, toAccount.Currency, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { detail = "Перевод между счетами в разных валютах невозможен" });

            var feeCalc = _txnService.CalculateFee(fromAccount, req.Amount, "Transfer");
            var totalDebit = req.Amount + feeCalc.FeeAmount;

            if (fromAccount.SubType != "Credit" && fromAccount.AvailableBalance < totalDebit)
                return UnprocessableEntity(new { title = "Insufficient Funds", detail = "Insufficient funds" });

            string? incomeKindCode = null;
            if (!string.IsNullOrWhiteSpace(req.IncomeKindCode))
            {
                if (!IncomeKindCodeHelper.IsValid(req.IncomeKindCode))
                    return BadRequest(new { detail = "Недопустимый код вида дохода (КВД)" });
                incomeKindCode = req.IncomeKindCode.Trim();
            }

            var transaction = new Transaction
            {
                Id = Guid.NewGuid(), Reference = _txnService.GenerateReference(),
                Type = "Transfer", Status = "Pending",
                Amount = req.Amount, Currency = req.Currency,
                Description = req.Description,
                FromAccountId = fromAccount.Id, ToAccountId = toAccount.Id,
                Fee = feeCalc.FeeAmount, FeePercent = feeCalc.FeePercent,
                IncomeKindCode = incomeKindCode,
                CashierSessionId = req.SessionId,
                CashierFullName = User.FindFirst("firstName")?.Value + " " + User.FindFirst("lastName")?.Value,
                CreatedAt = DateTime.UtcNow
            };

            _db.Transactions.Add(transaction);
            await _db.SaveChangesAsync();

            var userId = GetCurrentUserId();
            var fraudResult = await _fraudService.CheckTransactionAsync(transaction, fromAccount);

            await using var tx = await _db.Database.BeginTransactionAsync();
            await LockAccountsAsync(fromAccount.Id, toAccount.Id);
            await _db.Entry(fromAccount).ReloadAsync();
            await _db.Entry(toAccount).ReloadAsync();

            // Повторная проверка средств под блокировкой строк обоих счетов.
            if (fromAccount.SubType != "Credit" && fromAccount.AvailableBalance < totalDebit)
            {
                await tx.RollbackAsync();
                return UnprocessableEntity(new { title = "Insufficient Funds", detail = "Insufficient funds" });
            }

            if (fraudResult.IsSuspicious)
            {
                fromAccount.HoldAmount += totalDebit;
                fromAccount.AvailableBalance -= totalDebit;
                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                await _audit.LogAsync(userId, transaction.CashierFullName, "Cashier",
                    "Transfer", $"Account {fromAccount.AccountNumber}", fromAccount.Id, "PendingReview",
                    $"Amount: {req.Amount} {req.Currency}, Fee: {feeCalc.FeeAmount}, Risk: {fraudResult.RiskScore:P1}, To: {toAccount.AccountNumber}", req);

                return StatusCode(202, new
                {
                    transactionId = transaction.Reference, type = transaction.Type,
                    status = transaction.Status, amount = transaction.Amount,
                    currency = transaction.Currency, description = transaction.Description,
                    incomeKindCode = transaction.IncomeKindCode,
                    fromAccount = new { accountNumber = fromAccount.AccountNumber, ownerFullName = fromAccount.Client?.FullName, balanceAfter = fromAccount.Balance },
                    toAccount = new { accountNumber = toAccount.AccountNumber, ownerFullName = toAccount.Client?.FullName },
                    fee = transaction.Fee, cashierFullName = transaction.CashierFullName,
                    sessionId = req.SessionId, reference = transaction.Reference,
                    createdAt = transaction.CreatedAt, completedAt = transaction.CompletedAt,
                    anomalyType = fraudResult.AnomalyType,
                    riskScore = fraudResult.RiskScore,
                    triggerReason = fraudResult.TriggerReason,
                    triggerReasonFull = fraudResult.TriggerReasonFull,
                    message = "Transfer sent for fraud review"
                });
            }

            fromAccount.Balance -= totalDebit;
            fromAccount.AvailableBalance -= totalDebit;
            toAccount.Balance += req.Amount;
            toAccount.AvailableBalance += req.Amount;
            fromAccount.LastTransactionAt = DateTime.UtcNow;
            toAccount.LastTransactionAt = DateTime.UtcNow;
            transaction.Status = "Completed";
            transaction.CompletedAt = DateTime.UtcNow;
            transaction.BalanceAfter = fromAccount.Balance;

            if (fromAccount.Balance < 0) fromAccount.Client.IsDebtor = true;

            await _db.SaveChangesAsync();
            await tx.CommitAsync();

            await _audit.LogAsync(userId, transaction.CashierFullName, "Cashier",
                "Transfer", $"Account {fromAccount.AccountNumber}", fromAccount.Id, "Success",
                $"Amount: {req.Amount} {req.Currency} -> {toAccount.AccountNumber}", req);

            return StatusCode(201, new
            {
                transactionId = transaction.Reference, type = transaction.Type,
                status = transaction.Status, amount = transaction.Amount,
                currency = transaction.Currency, description = transaction.Description,
                incomeKindCode = transaction.IncomeKindCode,
                fromAccount = new { accountNumber = fromAccount.AccountNumber, ownerFullName = fromAccount.Client?.FullName, balanceAfter = fromAccount.Balance },
                toAccount = new { accountNumber = toAccount.AccountNumber, ownerFullName = toAccount.Client?.FullName },
                fee = transaction.Fee, cashierFullName = transaction.CashierFullName,
                sessionId = req.SessionId, reference = transaction.Reference,
                createdAt = transaction.CreatedAt, completedAt = transaction.CompletedAt,
                message = "Transfer completed successfully"
            });
        }

        

        // GET /api/cashier/sessions/{id}/deposits
        [HttpGet("sessions/{id}/deposits")]
        public async Task<IActionResult> GetSessionDeposits(string id, int page = 1, int pageSize = 20)
        {
            var query = _db.Transactions
                .Where(t => t.CashierSessionId == id && t.Type == "Deposit" && t.Status == "Completed")
                .Include(t => t.ToAccount).ThenInclude(a => a!.Client)
                .OrderByDescending(t => t.CreatedAt);

            var total = await query.CountAsync();
            var data = await query.Skip((page - 1) * pageSize).Take(pageSize)
                .Select(t => new
                {
                    transactionId = t.Reference, cashierFullName = t.CashierFullName,
                    createdAt = t.CreatedAt, ownerFullName = t.ToAccount!.Client!.FirstName + " " + t.ToAccount.Client.LastName,
                    accountNumber = t.ToAccount.AccountNumber, accountType = t.ToAccount.AccountType,
                    type = t.Type, amount = t.Amount, currency = t.Currency, description = t.Description
                })
                .ToListAsync();

            return Ok(new
            {
                data,
                meta = new PaginationMeta { Total = total, Page = page, PageSize = pageSize },
                summary = new
                {
                    totalDepositsAmount = await _db.Transactions
                        .Where(t => t.CashierSessionId == id && t.Type == "Deposit" && t.Status == "Completed")
                        .SumAsync(t => t.Amount),
                    currency = "RUB"
                }
            });
        }

        // GET /api/cashier/sessions/{id}/report
        [HttpGet("sessions/{id}/report")]
        public async Task<IActionResult> GetSessionReport(string id)
        {
            var session = await _db.CashierSessions.FirstOrDefaultAsync(s => s.Id == id);
            if (session == null) return NotFound();

            var txns = await _db.Transactions
                .Where(t => t.CashierSessionId == id && t.Status == "Completed")
                .Include(t => t.FromAccount)
                .Include(t => t.ToAccount)
                .ToListAsync();

            return Ok(new
            {
                sessionId = session.Id, cashierFullName = session.CashierFullName,
                startedAt = session.StartedAt,
                reportGeneratedAt = DateTime.UtcNow,
                status = session.Status,
                statistics = new
                {
                    totalDeposits = txns.Where(t => t.Type == "Deposit").Sum(t => t.Amount),
                    totalWithdrawals = txns.Where(t => t.Type == "Withdrawal").Sum(t => t.Amount),
                    totalTransfers = txns.Where(t => t.Type == "Transfer").Sum(t => t.Amount),
                    totalFees = txns.Sum(t => t.Fee),
                    transactionsCount = txns.Count
                }
            });
        }


        // GET /api/cashier/reports/transactions
        [HttpGet("reports/transactions")]
        public async Task<IActionResult> GetReportTransactions(
            string scope = "session",
            string? sessionId = null,
            string? startDate = null,
            string? endDate = null)
        {
            var normalizedScope = (scope ?? "session").Trim().ToLowerInvariant();
            var isSessionScope = normalizedScope == "session";
            var isOverallScope = normalizedScope == "overall" || normalizedScope == "all";

            if (!isSessionScope && !isOverallScope)
                return BadRequest(new { detail = "Unsupported report scope" });

            IQueryable<Transaction> query = _db.Transactions.AsNoTracking();
            DateTime start;
            DateTime endExclusive;

            if (isSessionScope)
            {
                if (string.IsNullOrWhiteSpace(sessionId))
                    return BadRequest(new { detail = "sessionId is required for session reports" });

                var session = await _db.CashierSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId);
                if (session == null) return NotFound(new { detail = "Session not found" });

                start = DateTimeQueryParser.TryParseUtcDate(startDate, out var parsedStart)
                    ? parsedStart.Date
                    : session.StartedAt;
                endExclusive = DateTimeQueryParser.TryParseUtcDate(endDate, out var parsedEnd)
                    ? parsedEnd.Date.AddDays(1)
                    : DateTime.UtcNow.Date.AddDays(1);

                query = query.Where(t => t.CashierSessionId == sessionId && t.CreatedAt >= start && t.CreatedAt < endExclusive);
            }
            else
            {
                start = DateTimeQueryParser.TryParseUtcDate(startDate, out var parsedStart)
                    ? parsedStart.Date
                    : DateTime.UtcNow.Date.AddDays(-30);
                endExclusive = DateTimeQueryParser.TryParseUtcDate(endDate, out var parsedEnd)
                    ? parsedEnd.Date.AddDays(1)
                    : DateTime.UtcNow.Date.AddDays(1);

                query = query.Where(t => t.CreatedAt >= start && t.CreatedAt < endExclusive);
            }

            var transactions = await query
                .Include(t => t.FromAccount).ThenInclude(a => a!.Client)
                .Include(t => t.ToAccount).ThenInclude(a => a!.Client)
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();

            var completedTransactions = transactions.Where(t => t.Status == "Completed").ToList();

            var data = transactions.Select(t =>
            {
                var primaryAccount = t.Type == "Deposit"
                    ? t.ToAccount
                    : t.FromAccount ?? t.ToAccount;

                return new
                {
                    id = t.Id,
                    transactionId = t.Reference,
                    type = t.Type,
                    status = t.Status,
                    amount = t.Amount,
                    currency = t.Currency,
                    description = t.Description,
                    fee = t.Fee,
                    balanceAfter = t.BalanceAfter,
                    createdAt = t.CreatedAt,
                    completedAt = t.CompletedAt,
                    cashierSessionId = t.CashierSessionId,
                    cashierFullName = t.CashierFullName,
                    clientFullName = primaryAccount?.Client?.FullName,
                    clientType = primaryAccount?.Client?.ClientType,
                    accountNumber = primaryAccount?.AccountNumber,
                    fromAccountNumber = t.FromAccount?.AccountNumber,
                    toAccountNumber = t.ToAccount?.AccountNumber
                };
            }).ToList();

            return Ok(new
            {
                scope = normalizedScope,
                period = new
                {
                    startDate = start.ToString("yyyy-MM-dd"),
                    endDate = endExclusive.AddDays(-1).ToString("yyyy-MM-dd"),
                    sessionId
                },
                data,
                meta = new PaginationMeta
                {
                    Total = data.Count,
                    Page = 1,
                    PageSize = data.Count == 0 ? 1 : data.Count
                },
                summary = new
                {
                    totalTransactions = transactions.Count,
                    completedTransactions = completedTransactions.Count,
                    pendingTransactions = transactions.Count(t => t.Status == "Pending" || t.Status == "PendingReview"),
                    blockedTransactions = transactions.Count(t => t.Status == "Blocked"),
                    totalDeposits = completedTransactions.Where(t => t.Type == "Deposit").Sum(t => t.Amount),
                    totalWithdrawals = completedTransactions.Where(t => t.Type == "Withdrawal").Sum(t => t.Amount),
                    totalTransfers = completedTransactions.Where(t => t.Type == "Transfer").Sum(t => t.Amount),
                    totalFees = completedTransactions.Sum(t => t.Fee)
                }
            });
        }
        

        // Причина недоступности счёта для операций (или null, если доступен).
        private static string? AccountUnavailableReason(Account? a) => a?.Status switch
        {
            "Active" => null,
            "Frozen" => "Счёт заморожен — операции недоступны",
            "Closed" => "Счёт закрыт — операции недоступны",
            null => "Счёт не найден",
            _ => "Счёт недоступен"
        };

        // Блокируем строки счетов (SELECT ... FOR UPDATE) на время денежной
        // операции. Без этого одновременные действия нескольких пользователей
        // приводили к гонкам: оба проходили проверку баланса и счёт уходил в
        // минус, либо обновления баланса терялись. Порядок захвата фиксирован
        // (ORDER BY "Id") — иначе встречные переводы давали взаимоблокировку.
        private async Task LockAccountsAsync(params Guid?[] accountIds)
        {
            var ids = accountIds
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .OrderBy(id => id)
                .ToArray();

            if (ids.Length == 0) return;

            await _db.Database.ExecuteSqlRawAsync(
                "SELECT 1 FROM accounts WHERE \"Id\" = ANY({0}) ORDER BY \"Id\" FOR UPDATE",
                new object[] { ids });
        }

        private async Task<Dictionary<string, decimal>> GetSystemBalanceAsync()
        {
            var balances = await _db.Accounts
                .Where(a => a.Status == "Active")
                .GroupBy(a => a.Currency)
                .Select(g => new { Currency = g.Key, Total = g.Sum(a => a.Balance) })
                .ToListAsync();

            return balances.ToDictionary(b => b.Currency, b => b.Total);
        }

        private IActionResult? EnsureActiveClient(Client? client)
        {
            if (client == null)
                return NotFound(new { detail = "Client not found" });

            if (client.Status != "Active")
                return Conflict(new { detail = "Client is blocked" });

            return null;
        }

        private Guid GetCurrentUserId() =>
            Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    }
}
