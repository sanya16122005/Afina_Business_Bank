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
    [Route("api/admin")]
    [Authorize(Roles = "Admin")]
    public class AdminController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IAuditService _audit;
        private readonly IConfiguration _config;
        private readonly IWebHostEnvironment _env;

        public AdminController(AppDbContext db, IAuditService audit, IConfiguration config, IWebHostEnvironment env)
        {
            _db = db;
            _audit = audit;
            _config = config;
            _env = env;
        }

        // ===== BACKUP / RESTORE =====

        // POST /api/admin/backup
        [HttpPost("backup")]
        public async Task<IActionResult> BackupDatabase()
        {
            try
            {
                var connString = _config.GetConnectionString("DefaultConnection") ?? "";
                var connBuilder = new Npgsql.NpgsqlConnectionStringBuilder(connString);

                var backupDir = Path.Combine(_env.ContentRootPath, "Backups");
                Directory.CreateDirectory(backupDir);
                var fileName = $"backup_{DateTime.UtcNow:yyyyMMdd_HHmmss}.sql";
                var filePath = Path.Combine(backupDir, fileName);

                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "pg_dump",
                    Arguments = $"-h {connBuilder.Host} -p {connBuilder.Port} -U {connBuilder.Username} -d {connBuilder.Database} -F p -f \"{filePath}\"",
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                psi.Environment["PGPASSWORD"] = connBuilder.Password;

                using var process = System.Diagnostics.Process.Start(psi);
                if (process == null)
                    return StatusCode(500, new { detail = "Не удалось запустить pg_dump" });

                var stderr = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                    return StatusCode(500, new { detail = $"pg_dump error: {stderr}" });

                var adminId = GetCurrentUserId();
                await _audit.LogAsync(adminId, null, "Admin",
                    "Backup", "Database", null, "Success",
                    $"Backup created: {fileName}");

                return Ok(new { message = "Резервная копия создана", fileName, createdAt = DateTime.UtcNow });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { detail = $"Backup failed: {ex.Message}" });
            }
        }

        // POST /api/admin/restore
        [HttpPost("restore")]
        public async Task<IActionResult> RestoreDatabase([FromQuery] string fileName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(fileName))
                    return BadRequest(new { detail = "Не указано имя файла резервной копии" });

                // Prevent path traversal
                fileName = Path.GetFileName(fileName);
                var backupDir = Path.Combine(_env.ContentRootPath, "Backups");
                var filePath = Path.Combine(backupDir, fileName);

                if (!System.IO.File.Exists(filePath))
                    return NotFound(new { detail = $"Файл резервной копии не найден: {fileName}" });

                var connString = _config.GetConnectionString("DefaultConnection") ?? "";
                var connBuilder = new Npgsql.NpgsqlConnectionStringBuilder(connString);

                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "psql",
                    Arguments = $"-h {connBuilder.Host} -p {connBuilder.Port} -U {connBuilder.Username} -d {connBuilder.Database} -f \"{filePath}\"",
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                psi.Environment["PGPASSWORD"] = connBuilder.Password;

                using var process = System.Diagnostics.Process.Start(psi);
                if (process == null)
                    return StatusCode(500, new { detail = "Не удалось запустить psql" });

                var stderr = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                    return StatusCode(500, new { detail = $"Restore error: {stderr}" });

                var adminId = GetCurrentUserId();
                await _audit.LogAsync(adminId, null, "Admin",
                    "Restore", "Database", null, "Success",
                    $"Database restored from: {fileName}");

                return Ok(new { message = "База данных восстановлена", fileName, restoredAt = DateTime.UtcNow });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { detail = $"Restore failed: {ex.Message}" });
            }
        }

        // GET /api/admin/backups
        [HttpGet("backups")]
        public IActionResult ListBackups()
        {
            var backupDir = Path.Combine(_env.ContentRootPath, "Backups");
            if (!Directory.Exists(backupDir))
                return Ok(new { data = Array.Empty<object>() });

            var files = Directory.GetFiles(backupDir, "*.sql")
                .Select(f => new FileInfo(f))
                .OrderByDescending(f => f.CreationTimeUtc)
                .Select(f => new
                {
                    fileName = f.Name,
                    sizeBytes = f.Length,
                    createdAt = f.CreationTimeUtc
                })
                .ToArray();

            return Ok(new { data = files });
        }

        

        // GET /api/admin/users
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers(
            string? role = null, string? status = null, int page = 1, int pageSize = 20)
        {
            var query = _db.Users.AsQueryable();

            if (!string.IsNullOrEmpty(role)) query = query.Where(u => u.Role == role);
            if (status == "Active") query = query.Where(u => u.IsActive);
            else if (status == "Blocked") query = query.Where(u => !u.IsActive);

            var total = await query.CountAsync();
            var users = await query
                .OrderByDescending(u => u.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                data = users.Select(u => new
                {
                    id = u.Id, fullName = u.FullName, email = u.Email,
                    firstName = u.FirstName, lastName = u.LastName,
                    phoneNumber = u.PhoneNumber, dateOfBirth = u.DateOfBirth,
                    role = u.Role, status = u.IsActive ? "Active" : "Blocked",
                    isActive = u.IsActive, isVerified = u.IsVerified,
                    emailVerified = u.EmailVerified, phoneVerified = u.PhoneVerified,
                    twoFactorEnabled = u.TwoFactorEnabled,
                    createdAt = u.CreatedAt, lastLoginAt = u.LastLoginAt
                }),
                meta = new PaginationMeta { Total = total, Page = page, PageSize = pageSize }
            });
        }

        // POST /api/admin/users
        [HttpPost("users")]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest req)
        {
            if (await _db.Users.AnyAsync(u => u.Email == req.Email))
                return BadRequest(new { errors = new { email = new[] { "Email already exists" } } });

            if (string.Equals(req.Role, "LegalEntity", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new
                {
                    errors = new { role = new[] { "Роль «юридическое лицо» доступна только через регистрацию организации (/api/auth/register-legal)" } }
                });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = req.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                FirstName = req.FirstName, LastName = req.LastName,
                PhoneNumber = req.PhoneNumber,
                DateOfBirth = req.DateOfBirth.HasValue
                    ? DateTime.SpecifyKind(req.DateOfBirth.Value.Date, DateTimeKind.Utc)
                    : null,
                Role = req.Role, IsActive = true, IsVerified = true,
                TwoFactorEnabled = true,
                CreatedAt = DateTimeOffset.Now, UpdatedAt = DateTimeOffset.Now
            };

            _db.Users.Add(user);
            _db.UserSettings.Add(new UserSettings { Id = Guid.NewGuid(), UserId = user.Id });
            await _db.SaveChangesAsync();

            var adminId = GetCurrentUserId();
            await _audit.LogAsync(adminId, null, "Admin",
                "CreateUser", $"User {user.FullName}", user.Id, "Success",
                $"Role: {req.Role}, Email: {req.Email}");

            return StatusCode(201, new
            {
                userId = user.Id, email = user.Email,
                fullName = user.FullName, role = user.Role,
                status = "Active", createdAt = user.CreatedAt,
                message = "User created successfully"
            });
        }

        // PATCH /api/admin/users/{id}/role
        [HttpPatch("users/{id}/role")]
        public async Task<IActionResult> ChangeRole(Guid id, [FromBody] ChangeRoleRequest req)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound();

            var previousRole = user.Role;
            user.Role = req.NewRole;
            user.UpdatedAt = DateTimeOffset.Now;
            await _db.SaveChangesAsync();

            var adminId = GetCurrentUserId();
            await _audit.LogAsync(adminId, null, "Admin",
                "ChangeRole", $"User {user.FullName}", user.Id, "Success",
                $"{previousRole} -> {req.NewRole}");

            return Ok(new
            {
                userId = user.Id, fullName = user.FullName, email = user.Email,
                previousRole, newRole = req.NewRole,
                updatedAt = user.UpdatedAt,
                message = "User role updated successfully"
            });
        }

        // PATCH /api/admin/users/{id}/status
        [HttpPatch("users/{id}/status")]
        public async Task<IActionResult> ChangeStatus(Guid id, [FromBody] ChangeStatusRequest req)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound();

            // Админ не может заблокировать сам себя — иначе он мгновенно
            // потеряет доступ и не сможет разблокироваться.
            if (req.Action == "Block" && id == GetCurrentUserId())
                return BadRequest(new { detail = "Нельзя заблокировать собственную учётную запись" });

            user.IsActive = req.Action == "Unblock";
            user.UpdatedAt = DateTimeOffset.Now;

            // При блокировке завершаем активные сессии — отзываем refresh-токены,
            // иначе пользователь продолжит молча продлевать сессию по уже
            // выданному токену (до 7 дней).
            if (!user.IsActive)
            {
                var activeTokens = await _db.RefreshTokens
                    .Where(t => t.UserId == id && !t.IsRevoked)
                    .ToListAsync();
                foreach (var t in activeTokens) t.IsRevoked = true;
            }

            await _db.SaveChangesAsync();

            var adminId = GetCurrentUserId();
            var action = req.Action == "Block" ? "BlockUser" : "UnblockUser";
            await _audit.LogAsync(adminId, null, "Admin",
                action, $"User {user.FullName}", user.Id, "Success",
                $"{user.FullName} {(user.IsActive ? "разблокирован" : "заблокирован")}");

            return Ok(new
            {
                userId = user.Id, fullName = user.FullName,
                status = user.IsActive ? "Active" : "Blocked",
                updatedAt = user.UpdatedAt,
                message = user.IsActive ? "User unblocked successfully" : "User blocked successfully"
            });
        }

        // PUT /api/admin/users/{id}
        [HttpPut("users/{id}")]
        public async Task<IActionResult> UpdateUser(Guid id, [FromBody] UpdateUserRequest req)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound();

            var errors = new Dictionary<string, string[]>();

            if (!string.IsNullOrWhiteSpace(req.Email)
                && await _db.Users.AnyAsync(u => u.Email == req.Email && u.Id != id))
            {
                errors["email"] = new[] { "Email already exists" };
            }

            if (!string.IsNullOrWhiteSpace(req.Role)
                && req.Role is not ("Admin" or "Cashier" or "Customer" or "LegalEntity"))
            {
                errors["role"] = new[] { "Unsupported role" };
            }

            if (errors.Count > 0)
            {
                return BadRequest(new
                {
                    title = "Validation failed",
                    status = 400,
                    detail = "One or more validation errors occurred.",
                    errors,
                    timestamp = DateTime.UtcNow
                });
            }

            if (!string.IsNullOrWhiteSpace(req.Email)) user.Email = req.Email;
            if (!string.IsNullOrWhiteSpace(req.FirstName)) user.FirstName = req.FirstName;
            if (!string.IsNullOrWhiteSpace(req.LastName)) user.LastName = req.LastName;
            if (!string.IsNullOrWhiteSpace(req.PhoneNumber)) user.PhoneNumber = req.PhoneNumber;
            if (req.DateOfBirth.HasValue)
                user.DateOfBirth = DateTime.SpecifyKind(req.DateOfBirth.Value.Date, DateTimeKind.Utc);
            if (!string.IsNullOrWhiteSpace(req.Role)) user.Role = req.Role;
            if (req.IsActive.HasValue) user.IsActive = req.IsActive.Value;
            if (req.IsVerified.HasValue) user.IsVerified = req.IsVerified.Value;
            if (req.EmailVerified.HasValue) user.EmailVerified = req.EmailVerified.Value;
            if (req.PhoneVerified.HasValue) user.PhoneVerified = req.PhoneVerified.Value;

            user.UpdatedAt = DateTimeOffset.Now;
            await _db.SaveChangesAsync();

            var adminId = GetCurrentUserId();
            await _audit.LogAsync(adminId, null, "Admin",
                "UpdateUser", $"User {user.FullName}", user.Id, "Success",
                $"Email: {user.Email}, Role: {user.Role}, Active: {user.IsActive}");

            return Ok(new
            {
                userId = user.Id,
                firstName = user.FirstName,
                lastName = user.LastName,
                fullName = user.FullName,
                email = user.Email,
                phoneNumber = user.PhoneNumber,
                dateOfBirth = user.DateOfBirth,
                role = user.Role,
                status = user.IsActive ? "Active" : "Blocked",
                isActive = user.IsActive,
                isVerified = user.IsVerified,
                emailVerified = user.EmailVerified,
                phoneVerified = user.PhoneVerified,
                twoFactorEnabled = user.TwoFactorEnabled,
                updatedAt = user.UpdatedAt,
                message = "User updated successfully"
            });
        }

        // DELETE /api/admin/users/{id}
        [HttpDelete("users/{id}")]
        public async Task<IActionResult> DeleteUser(Guid id)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound();

            _db.Users.Remove(user);
            await _db.SaveChangesAsync();

            var adminId = GetCurrentUserId();
            await _audit.LogAsync(adminId, null, "Admin",
                "DeleteUser", $"User {user.FullName}", id, "Success");

            return Ok(new { message = "User deleted successfully", deletedAt = DateTime.UtcNow });
        }

        

        // GET /api/admin/audit
        [HttpGet("audit")]
        public async Task<IActionResult> GetAuditLogs(
            string? startDate = null, string? endDate = null,
            string? userId = null, string? actionType = null,
            int page = 1, int pageSize = 20)
        {
            var query = _db.AuditLogs.AsQueryable();

            if (DateTimeQueryParser.TryParseUtcDateTime(startDate, out var start))
                query = query.Where(a => a.CreatedAt >= start);
            if (DateTimeQueryParser.TryParseUtcDateTime(endDate, out var end))
                query = query.Where(a => a.CreatedAt <= end.AddDays(1));
            if (!string.IsNullOrEmpty(userId) && Guid.TryParse(userId, out var uid))
                query = query.Where(a => a.UserId == uid);
            if (!string.IsNullOrEmpty(actionType))
                query = query.Where(a => a.ActionType == actionType);

            var total = await query.CountAsync();
            var data = await query
                .OrderByDescending(a => a.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(a => new
                {
                    id = a.Id, timestamp = a.CreatedAt,
                    userId = a.UserId, userFullName = a.UserFullName,
                    role = a.Role, actionType = a.ActionType,
                    targetObject = a.TargetObject, targetObjectId = a.TargetObjectId,
                    result = a.Result, ipAddress = a.IpAddress,
                    details = a.Details
                })
                .ToListAsync();

            return Ok(new
            {
                data,
                meta = new PaginationMeta { Total = total, Page = page, PageSize = pageSize }
            });
        }

        // GET /api/admin/audit/{id}
        [HttpGet("audit/{id}")]
        public async Task<IActionResult> GetAuditLog(string id)
        {
            var log = await _db.AuditLogs.FirstOrDefaultAsync(a => a.Id == id);
            if (log == null) return NotFound();

            return Ok(new
            {
                id = log.Id, timestamp = log.CreatedAt,
                userId = log.UserId, userFullName = log.UserFullName,
                role = log.Role, actionType = log.ActionType,
                targetObject = log.TargetObject, targetObjectId = log.TargetObjectId,
                result = log.Result, ipAddress = log.IpAddress,
                userAgent = log.UserAgent,
                requestPayload = log.RequestPayload != null
                    ? System.Text.Json.JsonSerializer.Deserialize<object>(log.RequestPayload)
                    : null,
                details = log.Details
            });
        }

        

        // GET /api/admin/analytics
        [HttpGet("analytics")]
        public async Task<IActionResult> GetAnalytics(string? startDate = null, string? endDate = null)
        {
            var start = DateTimeQueryParser.TryParseUtcDateTime(startDate, out var s)
                ? s
                : DateTime.UtcNow.AddDays(-30);
            var end = DateTimeQueryParser.TryParseUtcDateTime(endDate, out var e)
                ? e.AddDays(1)
                : DateTime.UtcNow;

            var transactions = await _db.Transactions
                .AsNoTracking()
                .Where(t => t.CreatedAt >= start && t.CreatedAt <= end)
                .ToListAsync();

            var completedTransactions = transactions.Where(t => t.Status == "Completed").ToList();
            var transactionIds = transactions.Select(t => t.Id).ToList();

            var alerts = transactionIds.Count == 0
                ? new List<FraudAlert>()
                : await _db.FraudAlerts
                    .AsNoTracking()
                    .Where(a => transactionIds.Contains(a.TransactionId))
                    .ToListAsync();

            var alertsByTransactionId = alerts.ToDictionary(alert => alert.TransactionId);

            var recentTransactions = await _db.Transactions
                .AsNoTracking()
                .Where(t => t.CreatedAt >= start && t.CreatedAt <= end)
                .Include(t => t.FromAccount).ThenInclude(account => account!.Client)
                .Include(t => t.ToAccount).ThenInclude(account => account!.Client)
                .OrderByDescending(t => t.CreatedAt)
                .Take(18)
                .ToListAsync();

            var startOffset = new DateTimeOffset(start, TimeSpan.Zero);
            var endOffset = new DateTimeOffset(end, TimeSpan.Zero);
            var clientRegistrations = await _db.Clients
                .Where(c => c.CreatedAt >= startOffset && c.CreatedAt <= endOffset)
                .GroupBy(c => c.CreatedAt.Date)
                .Select(g => new { date = g.Key, count = g.Count() })
                .OrderBy(g => g.date)
                .ToListAsync();

            var activeSessions = await _db.CashierSessions.CountAsync(s => s.Status == "Active");

            return Ok(new
            {
                period = new { startDate = start.ToString("yyyy-MM-dd"), endDate = end.ToString("yyyy-MM-dd") },
                operationsStats = new
                {
                    totalTransactionsCount = transactions.Count,
                    completedTransactionsCount = completedTransactions.Count,
                    pendingTransactionsCount = transactions.Count(t => t.Status == "Pending" || t.Status == "PendingReview"),
                    blockedTransactionsCount = transactions.Count(t => t.Status == "Blocked"),
                    depositCount = transactions.Count(t => t.Type == "Deposit"),
                    withdrawalCount = transactions.Count(t => t.Type == "Withdrawal"),
                    transferCount = transactions.Count(t => t.Type == "Transfer"),
                    totalDeposits = completedTransactions.Where(t => t.Type == "Deposit").Sum(t => t.Amount),
                    totalWithdrawals = completedTransactions.Where(t => t.Type == "Withdrawal").Sum(t => t.Amount),
                    totalTransfers = completedTransactions.Where(t => t.Type == "Transfer").Sum(t => t.Amount),
                    totalFees = completedTransactions.Sum(t => t.Fee),
                    averageAmount = completedTransactions.Count > 0 ? completedTransactions.Average(t => t.Amount) : 0m,
                    maxAmount = completedTransactions.Count > 0 ? completedTransactions.Max(t => t.Amount) : 0m
                },
                modelStats = new
                {
                    reviewedCount = alerts.Count,
                    pendingCount = alerts.Count(alert => alert.Status == "PendingReview"),
                    resolvedCount = alerts.Count(alert => alert.Status == "Resolved"),
                    blockedCount = alerts.Count(alert => alert.Status == "Blocked"),
                    highRiskCount = alerts.Count(alert => alert.RiskScore >= 0.8m),
                    averageRisk = alerts.Count > 0 ? Math.Round(alerts.Average(alert => alert.RiskScore) * 100m, 1) : 0m
                },
                activeCashierSessions = activeSessions,
                clientRegistrations = clientRegistrations.Select(r => new
                {
                    date = r.date.ToString("yyyy-MM-dd"), r.count
                }),
                totalClients = await _db.Clients.CountAsync(),
                totalAccounts = await _db.Accounts.CountAsync(),
                totalIndividualClients = await _db.Clients.CountAsync(c => c.ClientType == "Individual"),
                totalLegalClients = await _db.Clients.CountAsync(c => c.ClientType == "Legal"),
                recentTransactions = recentTransactions.Select(t => new
                {
                    id = t.Id,
                    reference = t.Reference,
                    type = t.Type,
                    status = t.Status,
                    amount = t.Amount,
                    currency = t.Currency,
                    description = t.Description,
                    fee = t.Fee,
                    feePercent = t.FeePercent,
                    feeReason = t.FeeReason,
                    balanceAfter = t.BalanceAfter,
                    location = t.Location,
                    merchantName = t.MerchantName,
                    merchantCategory = t.MerchantCategory,
                    merchantLocation = t.MerchantLocation,
                    cardLastDigits = t.CardLastDigits,
                    cashierSessionId = t.CashierSessionId,
                    cashierFullName = t.CashierFullName,
                    createdAt = t.CreatedAt,
                    completedAt = t.CompletedAt,
                    fromAccount = t.FromAccount != null ? new
                    {
                        id = t.FromAccount.Id,
                        accountNumber = t.FromAccount.AccountNumber,
                        currency = t.FromAccount.Currency,
                        ownerFullName = t.FromAccount.Client?.FullName,
                        clientType = t.FromAccount.Client?.ClientType
                    } : null,
                    toAccount = t.ToAccount != null ? new
                    {
                        id = t.ToAccount.Id,
                        accountNumber = t.ToAccount.AccountNumber,
                        currency = t.ToAccount.Currency,
                        ownerFullName = t.ToAccount.Client?.FullName,
                        clientType = t.ToAccount.Client?.ClientType
                    } : null,
                    model = alertsByTransactionId.TryGetValue(t.Id, out var alert) && alert != null ? new
                    {
                        id = alert!.Id,
                        anomalyType = alert!.AnomalyType,
                        riskScore = alert!.RiskScore,
                        status = alert!.Status,
                        triggerReason = alert!.TriggerReason,
                        triggerReasonFull = alert!.TriggerReasonFull ?? alert!.TriggerReason
                    } : null
                })
            });
        }

        private Guid GetCurrentUserId() =>
            Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    }
}
