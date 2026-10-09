using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Backend.Utilities;

namespace Backend.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api")]
    public class CustomerController : ControllerBase
    {
        private readonly AppDbContext _db;

        public CustomerController(AppDbContext db)
        {
            _db = db;
        }

        // GET /api/customer/dashboard
        [HttpGet("customer/dashboard")]
        [Authorize(Roles = "Customer,LegalEntity")]
        public async Task<IActionResult> GetDashboard()
        {
            var userId = GetCurrentUserId();
            var user = await _db.Users.FindAsync(userId);
            if (user == null) return Unauthorized();

            var client = await _db.Clients
                .Include(c => c.Accounts)
                .FirstOrDefaultAsync(c => c.UserId == userId);

            var accounts = client?.Accounts?.Where(a => a.Status == "Active").ToList() ?? new List<Account>();
            var accountIds = accounts.Select(a => a.Id).ToList();

            var lastTxEntities = await _db.Transactions
                .Where(t => accountIds.Contains(t.FromAccountId ?? Guid.Empty) || accountIds.Contains(t.ToAccountId ?? Guid.Empty))
                .OrderByDescending(t => t.CreatedAt)
                .Take(5)
                .Include(t => t.FromAccount).ThenInclude(a => a!.Client)
                .Include(t => t.ToAccount).ThenInclude(a => a!.Client)
                .ToListAsync();

            HashSet<Guid> assignedEmployerClientIds = new();
            if (client != null && lastTxEntities.Count > 0)
            {
                var fromEmployerIds = lastTxEntities
                    .Where(t => t.ToAccount?.ClientId == client.Id && t.Type == "Transfer" && t.FromAccount != null)
                    .Select(t => t.FromAccount!.ClientId)
                    .Distinct()
                    .ToList();
                if (fromEmployerIds.Count > 0)
                {
                    assignedEmployerClientIds = (await _db.EmployerEmployees.AsNoTracking()
                        .Where(e => e.EmployeeClientId == client.Id && e.IsActive && fromEmployerIds.Contains(e.EmployerClientId))
                        .Select(e => e.EmployerClientId)
                        .ToListAsync()).ToHashSet();
                }
            }

            var lastTx = lastTxEntities.Select(t =>
            {
                var signedAmount = accountIds.Contains(t.FromAccountId ?? Guid.Empty) ? -t.Amount : t.Amount;
                object? incomingPayroll = null;
                if (client != null && t.Type == "Transfer" && t.ToAccount?.ClientId == client.Id
                    && (t.FromAccount?.Client?.ClientType == "Legal" || !string.IsNullOrEmpty(t.IncomeKindCode)))
                {
                    var fromCl = t.FromAccount?.Client;
                    var fromLegal = fromCl?.ClientType == "Legal";
                    var fromAssigned = t.FromAccount != null && assignedEmployerClientIds.Contains(t.FromAccount.ClientId);
                    var orgName = fromLegal ? (fromCl!.CompanyName ?? fromCl.FullName) : fromCl?.FullName;
                    var kindTitle = IncomeKindCodeHelper.GetTitle(t.IncomeKindCode);
                    incomingPayroll = new
                    {
                        counterpartyName = orgName,
                        isFromLegalEntity = fromLegal,
                        isFromEmployerInYourStaff = fromAssigned,
                        incomeKindCode = t.IncomeKindCode,
                        incomeKindTitle = kindTitle,
                        summary = IncomeKindCodeHelper.BuildIncomingTransferSummary(fromLegal, fromAssigned, orgName, t.IncomeKindCode, kindTitle),
                    };
                }

                return new
                {
                    id = t.Id,
                    type = t.Type,
                    amount = signedAmount,
                    currency = t.Currency,
                    description = t.Description,
                    status = t.Status,
                    createdAt = t.CreatedAt,
                    incomingPayroll,
                };
            }).ToList();

            return Ok(new
            {
                user = new { id = user.Id, fullName = user.FullName, role = user.Role },
                accountsSummary = new
                {
                    totalBalanceRUB = accounts.Where(a => a.Currency == "RUB").Sum(a => a.Balance),
                    totalBalanceUSD = accounts.Where(a => a.Currency == "USD").Sum(a => a.Balance),
                    totalBalanceEUR = accounts.Where(a => a.Currency == "EUR").Sum(a => a.Balance),
                    activeAccountsCount = accounts.Count,
                    totalAccountsCount = client?.Accounts?.Count ?? 0
                },
                lastTransactions = lastTx,
                quickActions = new[] { "Transfer", "Deposit", "History" },
                legalEntity = client != null && client.ClientType == "Legal"
                    ? new
                    {
                        companyName = client.CompanyName,
                        ownershipForm = client.OwnershipForm,
                        legalAddress = client.LegalAddress,
                    }
                    : null
            });
        }

        // GET /api/users/profile
        [HttpGet("users/profile")]
        public async Task<IActionResult> GetProfile()
        {
            var userId = GetCurrentUserId();
            var user = await _db.Users
                .Include(u => u.Settings)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null) return Unauthorized();

            var client = await _db.Clients
                .Include(c => c.Accounts)
                .FirstOrDefaultAsync(c => c.UserId == userId);

            var accounts = client?.Accounts?.Where(a => a.Status == "Active").ToList() ?? new List<Account>();

            return Ok(new
            {
                id = user.Id, email = user.Email,
                firstName = user.FirstName, lastName = user.LastName,
                fullName = user.FullName, phoneNumber = user.PhoneNumber,
                dateOfBirth = user.DateOfBirth,
                age = user.DateOfBirth.HasValue
                    ? (int)((DateTime.UtcNow - user.DateOfBirth.Value).TotalDays / 365.25)
                    : (int?)null,
                role = user.Role,
                isActive = user.IsActive, isVerified = user.IsVerified,
                emailVerified = user.EmailVerified, phoneVerified = user.PhoneVerified,
                twoFactorEnabled = user.TwoFactorEnabled,
                createdAt = user.CreatedAt, updatedAt = user.UpdatedAt,
                lastLoginAt = user.LastLoginAt,
                accountsCount = accounts.Count,
                cardsCount = accounts.Sum(a => a.Id != Guid.Empty ? 0 : 0), // будет вычислено ниже
                totalBalance = new
                {
                    RUB = accounts.Where(a => a.Currency == "RUB").Sum(a => a.Balance),
                    USD = accounts.Where(a => a.Currency == "USD").Sum(a => a.Balance),
                    EUR = accounts.Where(a => a.Currency == "EUR").Sum(a => a.Balance)
                },
                client = client == null ? null : new
                {
                    clientType = client.ClientType,
                    companyName = client.CompanyName,
                    ownershipForm = client.OwnershipForm,
                    legalAddress = client.LegalAddress,
                    directorFullName = client.DirectorFullName,
                },
                settings = user.Settings != null ? new
                {
                    language = user.Settings.Language, currency = user.Settings.Currency,
                    notifications = new
                    {
                        email = user.Settings.NotifyEmail,
                        push = user.Settings.NotifyPush,
                        sms = user.Settings.NotifySms
                    }
                } : null
            });
        }

        // PUT /api/users/profile
        [HttpPut("users/profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
        {
            var userId = GetCurrentUserId();
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return Unauthorized();

            if (!string.IsNullOrEmpty(req.FirstName)) user.FirstName = req.FirstName;
            if (!string.IsNullOrEmpty(req.LastName)) user.LastName = req.LastName;
            if (!string.IsNullOrEmpty(req.PhoneNumber)) user.PhoneNumber = req.PhoneNumber;
            user.UpdatedAt = DateTimeOffset.Now;

            await _db.SaveChangesAsync();

            return Ok(new
            {
                id = user.Id, email = user.Email,
                firstName = user.FirstName, lastName = user.LastName,
                fullName = user.FullName, phoneNumber = user.PhoneNumber,
                twoFactorEnabled = user.TwoFactorEnabled,
                updatedAt = user.UpdatedAt,
                message = "Profile updated successfully"
            });
        }

        // PUT /api/users/settings
        [HttpPut("users/settings")]
        public async Task<IActionResult> UpdateSettings([FromBody] UpdateSettingsRequest req)
        {
            var userId = GetCurrentUserId();
            var settings = await _db.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId);

            if (settings == null)
            {
                settings = new UserSettings { Id = Guid.NewGuid(), UserId = userId };
                _db.UserSettings.Add(settings);
            }

            if (!string.IsNullOrEmpty(req.Language)) settings.Language = req.Language;
            if (!string.IsNullOrEmpty(req.Currency)) settings.Currency = req.Currency;
            if (req.Notifications != null)
            {
                settings.NotifyEmail = req.Notifications.Email;
                settings.NotifyPush = req.Notifications.Push;
                settings.NotifySms = req.Notifications.Sms;
            }

            await _db.SaveChangesAsync();

            return Ok(new
            {
                settings = new
                {
                    language = settings.Language, currency = settings.Currency,
                    notifications = new
                    {
                        email = settings.NotifyEmail,
                        push = settings.NotifyPush,
                        sms = settings.NotifySms
                    }
                },
                updatedAt = DateTime.UtcNow,
                message = "Settings updated successfully"
            });
        }

        private Guid GetCurrentUserId() =>
            Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    }
}
