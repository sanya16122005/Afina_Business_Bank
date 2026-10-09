using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Backend.Services;
using Backend.Utilities;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/accounts")]
    [Authorize(Roles = "Customer,LegalEntity")]
    public class AccountsController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IAccountNumberService _accNumService;
        private readonly IAuditService _audit;

        public AccountsController(AppDbContext db, IAccountNumberService accNumService, IAuditService audit)
        {
            _db = db;
            _accNumService = accNumService;
            _audit = audit;
        }

        // GET /api/accounts
        [HttpGet]
        public async Task<IActionResult> GetAccounts(
            string? type = null, string? currency = null, string? status = null,
            int page = 1, int pageSize = 20)
        {
            var userId = GetCurrentUserId();
            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client == null)
                return Ok(new { data = Array.Empty<object>(), meta = new PaginationMeta { Total = 0, Page = page, PageSize = pageSize } });

            var query = _db.Accounts
                .Where(a => a.ClientId == client.Id)
                .AsQueryable();

            if (!string.IsNullOrEmpty(type)) query = query.Where(a => a.AccountType == type);
            if (!string.IsNullOrEmpty(currency)) query = query.Where(a => a.Currency == currency);
            if (!string.IsNullOrEmpty(status)) query = query.Where(a => a.Status == status);

            var total = await query.CountAsync();
            var accounts = await query
                .OrderByDescending(a => a.OpenedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Include(a => a.Cards)
                .ToListAsync();

            var data = accounts.Select(a => new
            {
                id = a.Id, accountNumber = a.AccountNumber, accountType = a.AccountType,
                subType = a.SubType, currency = a.Currency, balance = a.Balance,
                availableBalance = a.AvailableBalance, holdAmount = a.HoldAmount,
                status = a.Status, iban = a.Iban, bic = a.Bic,
                openedAt = a.OpenedAt, lastTransactionAt = a.LastTransactionAt,
                interestRate = a.InterestRate, purpose = a.Purpose,
                cardDesign = AccountDesignHelper.Resolve(a.CardDesign, a.AccountType, a.SubType),
                cardCount = a.Cards.Count
            });

            
            var allAccounts = await _db.Accounts
                .Where(a => a.ClientId == client.Id && a.Status == "Active")
                .ToListAsync();

            return Ok(new
            {
                data,
                meta = new PaginationMeta { Total = total, Page = page, PageSize = pageSize },
                summary = new
                {
                    totalBalanceRUB = allAccounts.Where(a => a.Currency == "RUB").Sum(a => a.Balance),
                    totalBalanceUSD = allAccounts.Where(a => a.Currency == "USD").Sum(a => a.Balance),
                    totalBalanceEUR = allAccounts.Where(a => a.Currency == "EUR").Sum(a => a.Balance),
                    activeAccountsCount = allAccounts.Count,
                    totalAccountsCount = await _db.Accounts.CountAsync(a => a.ClientId == client.Id),
                    clientStatus = client.Status,
                    clientBlocked = client.Status != "Active"
                }
            });
        }

        // GET /api/accounts/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetAccount(Guid id)
        {
            var userId = GetCurrentUserId();
            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client == null) return NotFound();

            var account = await _db.Accounts
                .Include(a => a.Cards)
                .Include(a => a.Client)
                .FirstOrDefaultAsync(a => a.Id == id && a.ClientId == client.Id);

            if (account == null) return NotFound();

            
            var recentTx = await _db.Transactions
                .Where(t => t.FromAccountId == id || t.ToAccountId == id)
                .OrderByDescending(t => t.CreatedAt)
                .Take(5)
                .Select(t => new
                {
                    id = t.Id, type = t.Type, amount = t.FromAccountId == id ? -t.Amount : t.Amount,
                    currency = t.Currency, description = t.Description,
                    status = t.Status, createdAt = t.CreatedAt
                })
                .ToListAsync();

            
            var balanceHistory = await GetBalanceHistoryAsync(id, 7);

            
            var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);
            var recentAll = await _db.Transactions
                .Where(t => (t.FromAccountId == id || t.ToAccountId == id) && t.CreatedAt >= thirtyDaysAgo && t.Status == "Completed")
                .ToListAsync();

            return Ok(new
            {
                id = account.Id, accountNumber = account.AccountNumber,
                accountType = account.AccountType, subType = account.SubType,
                currency = account.Currency, balance = account.Balance,
                availableBalance = account.AvailableBalance, holdAmount = account.HoldAmount,
                status = account.Status, iban = account.Iban, bic = account.Bic,
                openedAt = account.OpenedAt, lastTransactionAt = account.LastTransactionAt,
                interestRate = account.InterestRate, purpose = account.Purpose,
                cardDesign = AccountDesignHelper.Resolve(account.CardDesign, account.AccountType, account.SubType),
                owner = new
                {
                    id = client.Id, fullName = client.FullName,
                    email = client.Email, phoneNumber = client.PhoneNumber
                },
                cards = account.Cards.Select(c => new
                {
                    id = c.Id, cardNumber = c.CardNumberMasked, cardType = c.CardType,
                    paymentSystem = c.PaymentSystem, status = c.Status,
                    expiryDate = c.ExpiryDate, isVirtual = c.IsVirtual,
                    dailyLimit = c.DailyLimit, monthlyLimit = c.MonthlyLimit,
                    spentToday = c.SpentToday, spentThisMonth = c.SpentThisMonth
                }),
                recentTransactions = recentTx,
                balanceHistory,
                statistics = new
                {
                    totalIncome = recentAll.Where(t => t.ToAccountId == id).Sum(t => t.Amount),
                    totalExpense = recentAll.Where(t => t.FromAccountId == id).Sum(t => t.Amount),
                    averageBalance = account.Balance, // упрощённо
                    transactionsCount = recentAll.Count
                }
            });
        }

        // POST /api/accounts
        [HttpPost]
        public async Task<IActionResult> CreateAccount([FromBody] CreateAccountRequest req)
        {
            var userId = GetCurrentUserId();
            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);

            
            if (client == null)
            {
                var user = await _db.Users.FindAsync(userId);
                if (user == null) return Unauthorized();

                client = new Client
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ClientType = "Individual",
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    PhoneNumber = user.PhoneNumber,
                    Email = user.Email,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _db.Clients.Add(client);
                await _db.SaveChangesAsync();
            }

            if (client.Status != "Active")
                return Conflict(new { detail = "Client is blocked" });

            var interestRate = req.AccountType == "Savings" ? 7.0m : 0.0m;
            var accountNumber = await _accNumService.GenerateAccountNumberAsync(req.AccountType);

            // Валидация зарплатного счёта
            if (req.IsSalaryAccount)
            {
                if (req.Currency != "RUB")
                    return BadRequest(new { detail = "Salary account can only be in RUB" });
                if (req.AccountType != "Checking" || req.SubType != "Debit")
                    return BadRequest(new { detail = "Salary account must be Checking/Debit" });
                var hasSalary = await _db.Accounts.AnyAsync(a => a.ClientId == client.Id && a.IsSalaryAccount && a.Status == "Active");
                if (hasSalary)
                    return BadRequest(new { detail = "Client already has a salary account" });
            }

            var account = new Account
            {
                Id = Guid.NewGuid(),
                ClientId = client.Id,
                AccountNumber = accountNumber,
                AccountType = req.AccountType,
                SubType = req.AccountType == "Savings" ? null : req.SubType ?? "Debit",
                Currency = req.Currency,
                Balance = req.InitialDeposit,
                AvailableBalance = req.InitialDeposit,
                Status = "Active",
                Iban = _accNumService.GenerateIban(),
                Bic = "BANKRU2MXXX",
                InterestRate = interestRate,
                Purpose = req.IsSalaryAccount ? "Зарплатный" : req.Purpose,
                CardDesign = AccountDesignHelper.Normalize(req.CardDesign, req.AccountType, req.SubType),
                IsSalaryAccount = req.IsSalaryAccount,
                IsFirstWithdrawal = true,
                OpenedAt = DateTime.UtcNow
            };

            _db.Accounts.Add(account);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(userId, client.FullName, "Customer",
                "CreateAccount", $"Account {accountNumber}", account.Id, "Success",
                $"Type: {req.AccountType}/{req.SubType}, Currency: {req.Currency}, Initial: {req.InitialDeposit}");

            return StatusCode(201, new
            {
                id = account.Id, accountNumber = account.AccountNumber,
                accountType = account.AccountType, subType = account.SubType,
                currency = account.Currency, balance = account.Balance,
                availableBalance = account.AvailableBalance, holdAmount = account.HoldAmount,
                status = account.Status, openedAt = account.OpenedAt,
                interestRate = account.InterestRate, purpose = account.Purpose,
                cardDesign = AccountDesignHelper.Resolve(account.CardDesign, account.AccountType, account.SubType),
                message = "Account created successfully"
            });
        }

        // POST /api/accounts/preview
        [HttpPost("preview")]
        public IActionResult PreviewAccount([FromBody] CreateAccountRequest req)
        {
            var interestRate = req.AccountType == "Savings" ? 7.0m : 0.0m;
            var withdrawalFee = req.AccountType == "Savings" ? "2.5% (кроме первого снятия)" : "0%";

            return Ok(new
            {
                accountType = req.AccountType,
                subType = req.AccountType == "Savings" ? (string?)null : req.SubType ?? "Debit",
                currency = req.Currency,
                initialDeposit = req.InitialDeposit,
                purpose = req.Purpose,
                cardDesign = AccountDesignHelper.Normalize(req.CardDesign, req.AccountType, req.SubType),
                interestRate,
                withdrawalFee,
                estimatedAccountNumber = req.AccountType == "Savings" ? "102-XXXXXXXXXX" : "101-XXXXXXXXXX",
                message = "Preview only. Confirm to create account."
            });
        }

        // PUT /api/accounts/{id}/design
        [HttpPut("{id}/design")]
        public async Task<IActionResult> UpdateAccountDesign(Guid id, [FromBody] UpdateAccountDesignRequest req)
        {
            var userId = GetCurrentUserId();
            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client == null) return NotFound();

            var account = await _db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.ClientId == client.Id);
            if (account == null) return NotFound();

            var nextDesign = AccountDesignHelper.Normalize(req.CardDesign, account.AccountType, account.SubType);
            account.CardDesign = nextDesign;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(userId, client.FullName, "Customer",
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

        // GET /api/accounts/lookup
        [HttpGet("lookup")]
        [Authorize]
        public async Task<IActionResult> LookupAccount(string? accountNumber = null, string? phoneNumber = null)
        {
            if (string.IsNullOrWhiteSpace(accountNumber) && string.IsNullOrWhiteSpace(phoneNumber))
            {
                return BadRequest(new
                {
                    detail = "Specify accountNumber or phoneNumber",
                    timestamp = DateTime.UtcNow
                });
            }

            var account = await RecipientLookupHelper.ResolveRecipientAccountAsync(_db, accountNumber, phoneNumber);

            if (account == null)
            {
                var lookupLabel = !string.IsNullOrWhiteSpace(phoneNumber)
                    ? $"phone number '{phoneNumber}'"
                    : $"number '{accountNumber}'";

                return NotFound(new
                {
                    type = "https://tools.ietf.org/html/rfc7231#section-6.5.4",
                    title = "Not Found", status = 404,
                    detail = $"Account with {lookupLabel} not found",
                    timestamp = DateTime.UtcNow
                });
            }

            return Ok(new
            {
                accountNumber = account.AccountNumber,
                ownerName = account.Client?.FullName,
                currency = account.Currency,
                status = account.Status,
                exists = true
            });
        }

        private async Task<List<object>> GetBalanceHistoryAsync(Guid accountId, int days)
        {
            var result = new List<object>();
            var account = await _db.Accounts.FindAsync(accountId);
            if (account == null) return result;

            
            for (int i = days - 1; i >= 0; i--)
            {
                var date = DateTime.UtcNow.Date.AddDays(-i);
                result.Add(new { date = date.ToString("yyyy-MM-dd"), balance = account.Balance });
            }
            return result;
        }

        private Guid GetCurrentUserId() =>
            Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    }
}
