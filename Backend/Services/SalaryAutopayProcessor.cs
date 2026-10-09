using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services
{
    public interface ISalaryAutopayProcessor
    {
        Task RunDueAsync(CancellationToken cancellationToken = default);
        Task ProcessSavingsInterestAsync(CancellationToken cancellationToken = default);
    }

    public class SalaryAutopayProcessor : ISalaryAutopayProcessor
    {
        private readonly AppDbContext _db;
        private readonly ILegalEmployerTransferService _transferService;
        private readonly ILogger<SalaryAutopayProcessor> _logger;

        public SalaryAutopayProcessor(
            AppDbContext db,
            ILegalEmployerTransferService transferService,
            ILogger<SalaryAutopayProcessor> logger)
        {
            _db = db;
            _transferService = transferService;
            _logger = logger;
        }

        public async Task RunDueAsync(CancellationToken cancellationToken = default)
        {
            var now = DateTimeOffset.UtcNow;
            var due = await _db.SalaryAutopayRules
                .AsTracking()
                .Where(r => r.IsEnabled && r.NextRunAt <= now)
                .Include(r => r.EmployerEmployee)
                .ThenInclude(e => e.EmployeeClient!)
                .ThenInclude(c => c.Accounts)
                .Include(r => r.FromAccount)
                .Include(r => r.EmployerClient)
                .ToListAsync(cancellationToken);

            foreach (var rule in due)
            {
                try
                {
                    await ProcessOneAsync(rule, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Salary autopay rule {RuleId}", rule.Id);
                    rule.LastError = ex.Message;
                    rule.NextRunAt = DateTimeOffset.UtcNow.AddDays(1);
                    rule.UpdatedAt = DateTimeOffset.UtcNow;
                }

                await _db.SaveChangesAsync(cancellationToken);
            }
        }

        private async Task ProcessOneAsync(SalaryAutopayRule rule, CancellationToken cancellationToken)
        {
            if (!rule.EmployerEmployee.IsActive)
            {
                rule.LastError = "Сотрудник снят с учёта в организации";
                rule.NextRunAt = DateTimeOffset.UtcNow.AddDays(1);
                rule.UpdatedAt = DateTimeOffset.UtcNow;
                return;
            }

            if (rule.FromAccount.ClientId != rule.EmployerClientId)
            {
                rule.LastError = "Счёт списания не принадлежит организации";
                rule.NextRunAt = DateTimeOffset.UtcNow.AddDays(1);
                rule.UpdatedAt = DateTimeOffset.UtcNow;
                return;
            }

            var toAcc = rule.EmployerEmployee.EmployeeClient!.Accounts
                .Where(a => a.Status == "Active")
                .OrderByDescending(a => a.AccountType == "Checking" ? 1 : 0)
                .FirstOrDefault();

            if (toAcc == null)
            {
                rule.LastError = "У сотрудника нет активного счёта для зачисления";
                rule.NextRunAt = DateTimeOffset.UtcNow.AddDays(1);
                rule.UpdatedAt = DateTimeOffset.UtcNow;
                return;
            }

            var employerUserId = rule.EmployerClient.UserId;
            if (!employerUserId.HasValue)
            {
                rule.LastError = "У организации не привязан пользователь";
                rule.NextRunAt = DateTimeOffset.UtcNow.AddDays(1);
                rule.UpdatedAt = DateTimeOffset.UtcNow;
                return;
            }

            var user = await _db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == employerUserId.Value, cancellationToken);
            if (user == null)
            {
                rule.LastError = "Пользователь организации не найден";
                rule.NextRunAt = DateTimeOffset.UtcNow.AddDays(1);
                rule.UpdatedAt = DateTimeOffset.UtcNow;
                return;
            }

            // Идемпотентность + защита от мульти-инстанса: атомарно «занимаем»
            // правило одним UPDATE с условием, что NextRunAt не изменился с
            // момента чтения. Если 0 строк — правило уже взял другой воркер
            // (или прошлый запуск): пропускаем, повторно не платим.
            var dueAt = rule.NextRunAt;
            var provisionalNext = SalaryAutopayScheduleHelper.AdvanceAfterSuccess(rule, DateTimeOffset.UtcNow);
            var claimedAt = DateTimeOffset.UtcNow;

            var claimed = await _db.SalaryAutopayRules
                .Where(r => r.Id == rule.Id && r.IsEnabled && r.NextRunAt == dueAt)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.NextRunAt, provisionalNext)
                    .SetProperty(x => x.UpdatedAt, claimedAt), cancellationToken);

            if (claimed == 0)
            {
                _logger.LogInformation("Salary autopay {RuleId} skipped — claimed by another run/instance", rule.Id);
                return;
            }

            // Синхронизируем трекер с применённым UPDATE.
            rule.NextRunAt = provisionalNext;
            rule.UpdatedAt = claimedAt;

            var req = new TransferRequest(
                rule.FromAccountId,
                rule.Amount,
                rule.Currency,
                toAcc.AccountNumber,
                null,
                string.IsNullOrWhiteSpace(rule.PaymentDescription) ? "Автовыплата зарплаты" : rule.PaymentDescription,
                rule.IncomeKindCode);

            var result = await _transferService.ExecuteTransferAsync(
                employerUserId.Value,
                "LegalEntity",
                req,
                user.FullName,
                ipAddress: null,
                cancellationToken);

            var finished = DateTimeOffset.UtcNow;
            rule.UpdatedAt = finished;

            switch (result.Outcome)
            {
                case BankTransferOutcome.Completed:
                    rule.LastError = null;
                    rule.LastRunAt = finished;
                    // NextRunAt уже сдвинут на следующий период при «занятии»
                    // правила до перевода — повторно не двигаем (иначе пропуск
                    // целого периода).
                    _logger.LogInformation("Salary autopay {RuleId} completed, next at {Next}", rule.Id, rule.NextRunAt);
                    break;
                case BankTransferOutcome.PendingFraud:
                    // Перевод ушёл на проверку антифрода. НЕ ставим ретрай на
                    // завтра: если админ подтвердит — деньги уйдут один раз;
                    // ретрай же привёл бы к повторной выплате. Расписание
                    // остаётся на следующем периоде (уже сдвинуто при «занятии»).
                    rule.LastError = "Отправлено на проверку антифрода — будет зачислено после подтверждения";
                    _logger.LogWarning("Salary autopay {RuleId} pending fraud — no retry to avoid double pay", rule.Id);
                    break;
                default:
                    rule.LastError = result.ErrorDetail ?? "Ошибка перевода";
                    rule.NextRunAt = DateTimeOffset.UtcNow.AddDays(1);
                    _logger.LogWarning("Salary autopay {RuleId} failed: {Err}", rule.Id, rule.LastError);
                    break;
            }
        }

        public async Task ProcessSavingsInterestAsync(CancellationToken cancellationToken = default)
        {
            var now = DateTime.UtcNow;
            
            // Получаем все активные сберегательные счета
            var savingsAccounts = await _db.Accounts
                .Where(a => a.AccountType == "Savings" && a.Status == "Active")
                .ToListAsync(cancellationToken);

            foreach (var account in savingsAccounts)
            {
                var lastCalculation = account.LastInterestAppliedAt ?? account.OpenedAt;
                var elapsed = now - lastCalculation;

                if (elapsed.TotalSeconds <= 0) continue;

                // 7% годовых
                var annualRate = 0.07m;
                var secondsInYear = 365.25m * 24m * 3600m;
                var interest = account.Balance * annualRate * (decimal)elapsed.TotalSeconds / secondsInYear;

                // Начисляем только если накопилось хотя бы 0.01 (1 копейка)
                if (interest >= 0.01m)
                {
                    account.Balance += interest;
                    account.AvailableBalance += interest;
                    account.LastInterestAppliedAt = now;

                    var transaction = new Transaction
                    {
                        Id = Guid.NewGuid(),
                        Reference = $"INT-{DateTime.UtcNow:yyyyMMddHHmmssfff}{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
                        Type = "Interest",
                        Status = "Completed",
                        Amount = interest,
                        Currency = account.Currency,
                        Description = $"Начисление процентов (7% годовых)",
                        ToAccountId = account.Id,
                        Fee = 0,
                        BalanceAfter = account.Balance,
                        CreatedAt = now,
                        CompletedAt = now
                    };

                    _db.Transactions.Add(transaction);
                }
            }

            await _db.SaveChangesAsync(cancellationToken);
        }
    }
}
