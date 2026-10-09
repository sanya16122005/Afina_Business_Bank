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
    [Route("api/transactions")]
    [Authorize]
    public class TransactionsController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly ILegalEmployerTransferService _transferService;

        public TransactionsController(AppDbContext db, ILegalEmployerTransferService transferService)
        {
            _db = db;
            _transferService = transferService;
        }

        // GET /api/transactions
        [HttpGet]
        public async Task<IActionResult> GetTransactions(
            Guid? accountId = null, int page = 1, int pageSize = 20,
            string? startDate = null, string? endDate = null, string? type = null)
        {
            var userId = GetCurrentUserId();
            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client == null) return Ok(new { data = Array.Empty<object>(), meta = new PaginationMeta() });

            var clientAccountIds = await _db.Accounts
                .Where(a => a.ClientId == client.Id)
                .Select(a => a.Id)
                .ToListAsync();

            var query = _db.Transactions
                .Where(t => clientAccountIds.Contains(t.FromAccountId ?? Guid.Empty) ||
                            clientAccountIds.Contains(t.ToAccountId ?? Guid.Empty))
                .AsQueryable();

            if (accountId.HasValue)
                query = query.Where(t => t.FromAccountId == accountId || t.ToAccountId == accountId);
            if (!string.IsNullOrEmpty(type))
                query = query.Where(t => t.Type == type);
            if (DateTimeQueryParser.TryParseUtcDateTime(startDate, out var start))
                query = query.Where(t => t.CreatedAt >= start);
            if (DateTimeQueryParser.TryParseUtcDateTime(endDate, out var end))
                query = query.Where(t => t.CreatedAt <= end.AddDays(1));

            var total = await query.CountAsync();
            var transactions = await query
                .OrderByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Include(t => t.FromAccount).ThenInclude(a => a!.Client)
                .Include(t => t.ToAccount).ThenInclude(a => a!.Client)
                .ToListAsync();

            var fromEmployerIds = transactions
                .Where(t => t.ToAccount?.ClientId == client.Id && t.Type == "Transfer" && t.FromAccount != null)
                .Select(t => t.FromAccount!.ClientId)
                .Distinct()
                .ToList();

            var assignedEmployerClientIds = fromEmployerIds.Count == 0
                ? new HashSet<Guid>()
                : (await _db.EmployerEmployees.AsNoTracking()
                    .Where(e => e.EmployeeClientId == client.Id && e.IsActive && fromEmployerIds.Contains(e.EmployerClientId))
                    .Select(e => e.EmployerClientId)
                    .ToListAsync()).ToHashSet();

            var data = transactions.Select(t =>
            {
                var isIncomingTransfer = t.Type == "Transfer" && t.ToAccount?.ClientId == client.Id;
                var fromCl = t.FromAccount?.Client;
                var fromLegal = fromCl?.ClientType == "Legal";
                var fromAssignedEmployer = isIncomingTransfer && t.FromAccount != null
                    && assignedEmployerClientIds.Contains(t.FromAccount.ClientId);

                // КВД / «назначение перевода» относится только к выплатам
                // юрлица или работодателя сотруднику в штате. Для обычных
                // переводов между физлицами эти поля не отдаём, иначе у
                // клиента-физлица всплывает «юрлицовая» плашка.
                var isPayrollContext = isIncomingTransfer && (fromLegal || fromAssignedEmployer);
                var kindTitle = isPayrollContext ? IncomeKindCodeHelper.GetTitle(t.IncomeKindCode) : null;
                var exposedIncomeKindCode = isPayrollContext ? t.IncomeKindCode : null;

                object? incomingPayroll = null;
                if (isPayrollContext)
                {
                    var orgName = fromLegal ? (fromCl!.CompanyName ?? fromCl.FullName) : (fromCl?.FullName);
                    incomingPayroll = new
                    {
                        counterpartyName = orgName,
                        isFromLegalEntity = fromLegal,
                        isFromEmployerInYourStaff = fromAssignedEmployer,
                        incomeKindCode = t.IncomeKindCode,
                        incomeKindTitle = kindTitle,
                        summary = IncomeKindCodeHelper.BuildIncomingTransferSummary(fromLegal, fromAssignedEmployer, orgName, t.IncomeKindCode, kindTitle),
                    };
                }

                var isStrictlyIncomingTransfer = t.Type == "Transfer"
                    && t.ToAccountId.HasValue
                    && clientAccountIds.Contains(t.ToAccountId.Value)
                    && (!t.FromAccountId.HasValue || !clientAccountIds.Contains(t.FromAccountId.Value));
                decimal? balanceAfterForClient = isStrictlyIncomingTransfer ? null : t.BalanceAfter;

                var isExchange = t.Type == "Exchange";

                return new
                {
                    id = t.Id, type = t.Type, status = t.Status,
                    amount = t.Amount, currency = t.Currency,
                    counterAmount = t.CounterAmount,
                    counterCurrency = t.CounterCurrency,
                    exchangeRateCbr = t.ExchangeRateCbr,
                    exchangeRateApplied = t.ExchangeRateApplied,
                    description = t.Description,
                    exchangeSummary = isExchange && t.CounterAmount.HasValue
                        ? $"{t.Amount:F2} {t.Currency} → {t.CounterAmount:F2} {t.CounterCurrency}"
                        : null,
                    fromAccount = t.FromAccount != null ? new
                    {
                        id = t.FromAccountId, accountNumber = t.FromAccount.AccountNumber,
                        ownerName = t.FromAccount.Client?.FullName
                    } : null,
                    toAccount = t.ToAccount != null ? new
                    {
                        id = t.ToAccountId, accountNumber = t.ToAccount.AccountNumber,
                        ownerName = t.ToAccount.Client?.FullName
                    } : null,
                    fee = t.Fee, balanceAfter = balanceAfterForClient,
                    reference = t.Reference,
                    merchant = !string.IsNullOrEmpty(t.MerchantName) ? new
                    {
                        name = t.MerchantName, category = t.MerchantCategory,
                        location = t.MerchantLocation
                    } : null,
                    location = t.Location, cardLastDigits = t.CardLastDigits,
                    incomeKindCode = exposedIncomeKindCode,
                    incomeKindTitle = kindTitle,
                    incomingPayroll,
                    createdAt = t.CreatedAt, completedAt = t.CompletedAt
                };
            });

            // Summary
            var allTx = await _db.Transactions
                .Where(t => (accountId.HasValue
                    ? (t.FromAccountId == accountId || t.ToAccountId == accountId)
                    : (clientAccountIds.Contains(t.FromAccountId ?? Guid.Empty) ||
                       clientAccountIds.Contains(t.ToAccountId ?? Guid.Empty)))
                    && t.Status == "Completed")
                .ToListAsync();

            return Ok(new
            {
                data,
                meta = new PaginationMeta { Total = total, Page = page, PageSize = pageSize },
                summary = new
                {
                    totalIncome = allTx.Where(t => clientAccountIds.Contains(t.ToAccountId ?? Guid.Empty)).Sum(t => t.Amount),
                    totalExpense = allTx.Where(t => clientAccountIds.Contains(t.FromAccountId ?? Guid.Empty)).Sum(t => t.Amount),
                    totalFees = allTx.Sum(t => t.Fee),
                    netAmount = allTx.Where(t => clientAccountIds.Contains(t.ToAccountId ?? Guid.Empty)).Sum(t => t.Amount)
                               - allTx.Where(t => clientAccountIds.Contains(t.FromAccountId ?? Guid.Empty)).Sum(t => t.Amount),
                    transactionsCount = total
                }
            });
        }

        // POST /api/transactions/transfer
        [HttpPost("transfer")]
        [Authorize(Roles = "Customer,LegalEntity")]
        public async Task<IActionResult> Transfer([FromBody] TransferRequest req)
        {
            var userId = GetCurrentUserId();
            var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "Customer";
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();

            var result = await _transferService.ExecuteTransferAsync(userId, role, req, user?.FullName, ip);

            return result.Outcome switch
            {
                BankTransferOutcome.Completed => StatusCode(result.HttpStatus ?? 201, result.Body),
                BankTransferOutcome.PendingFraud => StatusCode(result.HttpStatus ?? 202, result.Body),
                _ => result.HttpStatus switch
                {
                    400 => BadRequest(result.Body ?? new { detail = result.ErrorDetail }),
                    401 => Unauthorized(),
                    403 => Forbid(),
                    404 => NotFound(new { detail = result.ErrorDetail }),
                    409 => Conflict(new { detail = result.ErrorDetail }),
                    422 => UnprocessableEntity(result.Body ?? new { detail = result.ErrorDetail }),
                    _ => BadRequest(new { detail = result.ErrorDetail ?? "Transfer failed" }),
                },
            };
        }

        private Guid GetCurrentUserId() =>
            Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    }
}
