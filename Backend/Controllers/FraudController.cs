using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Backend.Data;
using Backend.DTOs;
using Backend.Hubs;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/fraud")]
    [Authorize(Roles = "Cashier,Admin")]
    public class FraudController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IAuditService _audit;
        private readonly IHubContext<FraudHub> _fraudHub;

        public FraudController(AppDbContext db, IAuditService audit, IHubContext<FraudHub> fraudHub)
        {
            _db = db;
            _audit = audit;
            _fraudHub = fraudHub;
        }

        // GET /api/fraud/alerts
        [HttpGet("alerts")]
        public async Task<IActionResult> GetAlerts(
            string? status = null, string? anomalyType = null,
            int page = 1, int pageSize = 20)
        {
            var query = _db.FraudAlerts
                .Include(f => f.Transaction)
                    .ThenInclude(t => t.FromAccount).ThenInclude(a => a!.Client)
                .Include(f => f.Transaction)
                    .ThenInclude(t => t.ToAccount).ThenInclude(a => a!.Client)
                .AsQueryable();

            if (!string.IsNullOrEmpty(status)) query = query.Where(f => f.Status == status);
            if (!string.IsNullOrEmpty(anomalyType)) query = query.Where(f => f.AnomalyType == anomalyType);

            var total = await query.CountAsync();
            var alerts = await query
                .OrderByDescending(f => f.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToListAsync();

            var data = alerts.Select(f =>
            {
                var account = f.Transaction?.FromAccount ?? f.Transaction?.ToAccount;
                return new
                {
                    alertId = f.Id, transactionId = f.TransactionId,
                    createdAt = f.CreatedAt,
                    account = account != null ? new
                    {
                        accountNumber = account.AccountNumber,
                        ownerFullName = account.Client?.FullName
                    } : null,
                    amount = f.Transaction?.Amount ?? 0,
                    currency = f.Transaction?.Currency ?? "RUB",
                    anomalyType = f.AnomalyType,
                    riskScore = f.RiskScore,
                    status = f.Status,
                    triggerReason = f.TriggerReason,
                    triggerReasonFull = f.TriggerReasonFull ?? f.TriggerReason
                };
            });

            return Ok(new
            {
                data,
                meta = new PaginationMeta { Total = total, Page = page, PageSize = pageSize }
            });
        }

        // GET /api/fraud/alerts/{id}
        [HttpGet("alerts/{id}")]
        public async Task<IActionResult> GetAlert(string id)
        {
            var alert = await _db.FraudAlerts
                .Include(f => f.Transaction)
                    .ThenInclude(t => t.FromAccount).ThenInclude(a => a!.Client)
                .Include(f => f.Transaction)
                    .ThenInclude(t => t.ToAccount).ThenInclude(a => a!.Client)
                .FirstOrDefaultAsync(f => f.Id == id);

            if (alert == null) return NotFound();

            var account = alert.Transaction?.FromAccount ?? alert.Transaction?.ToAccount;

            // История клиента
            Guid? accountId = account?.Id;
            var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);
            var clientHistory = accountId.HasValue
                ? await _db.Transactions
                    .Where(t => (t.FromAccountId == accountId || t.ToAccountId == accountId)
                        && t.CreatedAt >= thirtyDaysAgo && t.Status == "Completed")
                    .ToListAsync()
                : new List<Transaction>();

            return Ok(new
            {
                alertId = alert.Id, transactionId = alert.TransactionId,
                createdAt = alert.CreatedAt,
                anomalyType = alert.AnomalyType,
                riskScore = alert.RiskScore,
                status = alert.Status,
                transaction = alert.Transaction != null ? new
                {
                    type = alert.Transaction.Type,
                    amount = alert.Transaction.Amount,
                    currency = alert.Transaction.Currency,
                    accountNumber = account?.AccountNumber,
                    accountType = account?.AccountType,
                    subType = account?.SubType,
                    ownerFullName = account?.Client?.FullName,
                    cashierFullName = alert.Transaction.CashierFullName,
                    description = alert.Transaction.Description,
                    createdAt = alert.Transaction.CreatedAt
                } : null,
                triggerReason = alert.TriggerReason,
                triggerReasonFull = alert.TriggerReasonFull ?? alert.TriggerReason,
                clientHistory = new
                {
                    averageTransactionAmount = clientHistory.Any() ? clientHistory.Average(t => t.Amount) : 0m,
                    maxPreviousAmount = clientHistory.Any() ? clientHistory.Max(t => t.Amount) : 0m,
                    transactionsLast30Days = clientHistory.Count
                },
                comment = alert.Comment
            });
        }

        // POST /api/fraud/alerts/{id}/resolve
        [HttpPost("alerts/{id}/resolve")]
        public async Task<IActionResult> ResolveAlert(string id, [FromBody] ResolveFraudAlertRequest req)
        {
            var alert = await _db.FraudAlerts.FirstOrDefaultAsync(f => f.Id == id);
            if (alert == null) return NotFound();

            var userId = GetCurrentUserId();
            var user = await _db.Users.FindAsync(userId);

            // Идемпотентность: повторный resolve того же алерта (двойной клик,
            // два администратора одновременно) не должен повторно двигать деньги
            // и слать дубль-уведомление.
            if (alert.Status != "PendingReview")
            {
                var resolvedTxn = await _db.Transactions
                    .Include(t => t.FromAccount).ThenInclude(a => a!.Client)
                    .Include(t => t.ToAccount).ThenInclude(a => a!.Client)
                    .FirstOrDefaultAsync(t => t.Id == alert.TransactionId);
                var resolvedAccount = resolvedTxn?.FromAccount ?? resolvedTxn?.ToAccount;

                return Ok(new
                {
                    alertId = alert.Id, transactionId = alert.TransactionId,
                    decision = alert.Decision, status = alert.Status,
                    resolvedBy = alert.ResolvedByName, resolvedAt = alert.ResolvedAt,
                    comment = alert.Comment,
                    message = "Alert already resolved"
                });
            }

            await using var dbTx = await _db.Database.BeginTransactionAsync();

            var transaction = await _db.Transactions
                .Include(t => t.FromAccount).ThenInclude(a => a!.Client)
                .Include(t => t.ToAccount).ThenInclude(a => a!.Client)
                .FirstOrDefaultAsync(t => t.Id == alert.TransactionId);

            // Блокируем строки задействованных счетов на время правки баланса,
            // чтобы параллельный resolve / кассовая операция не применились дважды.
            var lockIds = new[] { transaction?.FromAccountId, transaction?.ToAccountId }
                .Where(gid => gid.HasValue)
                .Select(gid => gid!.Value)
                .Distinct()
                .OrderBy(gid => gid)
                .ToArray();
            if (lockIds.Length > 0)
            {
                await _db.Database.ExecuteSqlRawAsync(
                    "SELECT 1 FROM accounts WHERE \"Id\" = ANY({0}) ORDER BY \"Id\" FOR UPDATE",
                    new object[] { lockIds });
                if (transaction?.FromAccount != null) await _db.Entry(transaction.FromAccount).ReloadAsync();
                if (transaction?.ToAccount != null) await _db.Entry(transaction.ToAccount).ReloadAsync();
            }

            var account = transaction?.FromAccount ?? transaction?.ToAccount;

            alert.Decision = req.Decision;
            alert.Status = req.Decision == "Blocked" ? "Blocked" : "Resolved";
            alert.Comment = req.Comment;
            alert.ResolvedBy = userId;
            alert.ResolvedByName = user?.FullName;
            alert.ResolvedAt = DateTime.UtcNow;

            if (transaction != null && transaction.Status == "Pending")
            {
                if (req.Decision == "Blocked")
                {
                    transaction.Status = "Blocked";
                    // Вернуть hold
                    if (transaction.FromAccount != null)
                    {
                        transaction.FromAccount.HoldAmount -= transaction.Amount + transaction.Fee;
                        transaction.FromAccount.AvailableBalance += transaction.Amount + transaction.Fee;
                    }
                }
                else if (req.Decision == "Confirmed"
                    && transaction.ToAccount != null
                    && transaction.ToAccount.Status != "Active")
                {
                    // Пока операция ждала проверки, счёт-получатель заморозили
                    // или закрыли. Зачислять туда нельзя — операцию возвращаем:
                    // удержание снимаем с отправителя, баланс не трогаем.
                    transaction.Status = "Blocked";
                    if (transaction.FromAccount != null)
                    {
                        transaction.FromAccount.HoldAmount -= transaction.Amount + transaction.Fee;
                        transaction.FromAccount.AvailableBalance += transaction.Amount + transaction.Fee;
                    }
                }
                else if (req.Decision == "Confirmed")
                {
                    transaction.Status = "Completed";
                    transaction.CompletedAt = DateTime.UtcNow;
                    // Списать деньги и зачислить получателю
                    if (transaction.FromAccount != null)
                    {
                        transaction.FromAccount.Balance -= transaction.Amount + transaction.Fee;
                        transaction.FromAccount.HoldAmount -= transaction.Amount + transaction.Fee;
                        transaction.FromAccount.LastTransactionAt = DateTime.UtcNow;
                        transaction.BalanceAfter = transaction.FromAccount.Balance;
                        if (transaction.FromAccount.Balance < 0 && transaction.FromAccount.Client != null)
                            transaction.FromAccount.Client.IsDebtor = true;
                        if (transaction.FromAccount.AccountType == "Savings")
                            transaction.FromAccount.IsFirstWithdrawal = false;
                    }
                    if (transaction.ToAccount != null)
                    {
                        transaction.ToAccount.Balance += transaction.Amount;
                        transaction.ToAccount.AvailableBalance += transaction.Amount;
                        transaction.ToAccount.LastTransactionAt = DateTime.UtcNow;
                        if (transaction.FromAccount == null)
                            transaction.BalanceAfter = transaction.ToAccount.Balance;
                    }
                }
            }

            await _db.SaveChangesAsync();
            await dbTx.CommitAsync();

            await _fraudHub.Clients.All.SendAsync("fraudAlertUpdated", new
            {
                alertId = alert.Id,
                transactionId = alert.TransactionId,
                anomalyType = alert.AnomalyType,
                riskScore = alert.RiskScore,
                status = alert.Status,
                decision = alert.Decision,
                resolvedBy = alert.ResolvedByName,
                resolvedAt = alert.ResolvedAt,
                comment = alert.Comment,
                triggerReason = alert.TriggerReason,
                triggerReasonFull = alert.TriggerReasonFull ?? alert.TriggerReason,
                accountNumber = account?.AccountNumber,
                ownerFullName = account?.Client?.FullName,
                amount = transaction?.Amount ?? 0m,
                currency = transaction?.Currency ?? "RUB",
                createdAt = alert.CreatedAt
            });

            await _audit.LogAsync(userId, user?.FullName, user?.Role,
                $"FraudAlert{req.Decision}", $"Alert {id}", null, "Success",
                $"Alert {id}: {req.Decision}. {req.Comment}");

            return Ok(new
            {
                alertId = alert.Id, transactionId = alert.TransactionId,
                decision = alert.Decision, status = alert.Status,
                resolvedBy = user?.FullName, resolvedAt = alert.ResolvedAt,
                comment = alert.Comment,
                message = req.Decision == "Blocked"
                    ? "Transaction blocked successfully"
                    : "Alert resolved successfully"
            });
        }

        private Guid GetCurrentUserId() =>
            Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    }
}
