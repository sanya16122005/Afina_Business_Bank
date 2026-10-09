using Microsoft.ML;
using Microsoft.ML.Data;
using Backend.Data;
using Backend.Models;
using Backend.Utilities;
using Backend.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services
{
    public interface IFraudDetectionService
    {
        Task<FraudCheckResult> CheckTransactionAsync(Transaction transaction, Account account);
    }

    public class FraudCheckResult
    {
        public bool IsSuspicious { get; set; }
        public decimal RiskScore { get; set; }
        public string? AnomalyType { get; set; }
        public string? TriggerReason { get; set; }
        public string? TriggerReasonFull { get; set; }
    }

    public class TransactionMlInput
    {
        public float Amount { get; set; }
        public float HourOfDay { get; set; }
        public float TransactionsLast24h { get; set; }
        public float AccountBalance { get; set; }
        public float AvgTransactionAmount { get; set; }
        public float MaxPreviousAmount { get; set; }
        public string AccountType { get; set; } = "";
    }

    public class FraudMlPrediction
    {
        [ColumnName("PredictedLabel")] public bool IsFraud { get; set; }
        [ColumnName("Score")] public float RawScore { get; set; }
        [ColumnName("Probability")] public float Probability { get; set; }
    }

    public class FraudDetectionService : IFraudDetectionService
    {
        private readonly PredictionEngine<TransactionMlInput, FraudMlPrediction>? _predictionEngine;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHubContext<FraudHub> _fraudHub;
        private readonly ILlmService _llmService;
        private readonly ILogger<FraudDetectionService> _logger;
        private readonly decimal _riskThreshold;

        public FraudDetectionService(
            IServiceScopeFactory scopeFactory,
            IHubContext<FraudHub> fraudHub,
            ILlmService llmService,
            IConfiguration config,
            ILogger<FraudDetectionService> logger)
        {
            _scopeFactory = scopeFactory;
            _fraudHub = fraudHub;
            _llmService = llmService;
            _logger = logger;
            _riskThreshold = decimal.Parse(config["FraudDetection:DefaultRiskScoreThreshold"] ?? "0.7");

            var mlContext = new MLContext();
            string? modelPath = null;
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "fraud_model.zip"),
                "fraud_model.zip",
                Path.Combine(Directory.GetCurrentDirectory(), "fraud_model.zip")
            };

            foreach (var path in candidates)
            {
                if (File.Exists(path)) { modelPath = path; break; }
            }

            if (modelPath == null)
            {
                logger.LogError("fraud_model.zip not found!");
                _predictionEngine = null;
                return;
            }

            var model = mlContext.Model.Load(modelPath, out _);
            _predictionEngine = mlContext.Model.CreatePredictionEngine<TransactionMlInput, FraudMlPrediction>(model);
            logger.LogInformation("ML.NET fraud model loaded from {Path}", modelPath);
        }

        public async Task<FraudCheckResult> CheckTransactionAsync(Transaction transaction, Account account)
        {
            var result = new FraudCheckResult { IsSuspicious = false, RiskScore = 0.0m };

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                if (await ShouldSkipFraudCheckAsync(db, transaction))
                {
                    _logger.LogInformation(
                        "Fraud check skipped for transaction {TransactionId}: payroll / employer–employee corridor",
                        transaction.Id);
                    return result;
                }

                if (_predictionEngine == null) return result;

                var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);
                var oneDayAgo = DateTime.UtcNow.AddDays(-1);

                var recentTxns = await db.Transactions
                    .Where(t => (t.FromAccountId == account.Id || t.ToAccountId == account.Id)
                        && t.CreatedAt >= thirtyDaysAgo && t.Status == "Completed"
                        && t.Id != transaction.Id)
                    .ToListAsync();

                var txnLast24h = recentTxns.Count(t => t.CreatedAt >= oneDayAgo);
                var avgAmount = recentTxns.Any() ? (float)recentTxns.Average(t => t.Amount) : (float)transaction.Amount;
                var maxPrev = recentTxns.Any() ? (float)recentTxns.Max(t => t.Amount) : 0f;

                var input = new TransactionMlInput
                {
                    Amount = (float)transaction.Amount,
                    HourOfDay = DateTime.UtcNow.Hour,
                    TransactionsLast24h = txnLast24h,
                    AccountBalance = (float)account.Balance,
                    AvgTransactionAmount = avgAmount,
                    MaxPreviousAmount = maxPrev,
                    AccountType = account.AccountType
                };

                // ===== ML.NET предсказание =====
                var prediction = _predictionEngine.Predict(input);
                var modelProbability = Math.Clamp(prediction.Probability, 0.0f, 1.0f);
                var calibratedModelRisk = 0.35m + ((decimal)modelProbability * 0.45m);
                result.RiskScore = calibratedModelRisk;
                result.IsSuspicious = prediction.IsFraud && modelProbability >= (float)_riskThreshold;

                var heuristicReasons = new List<string>();
                var heuristicRisk = 0.0m;

                if (transaction.Amount >= 500000m)
                {
                    heuristicReasons.Add("large_absolute_amount");
                    heuristicRisk = Math.Max(heuristicRisk, 0.9m);
                }

                if (txnLast24h >= 10)
                {
                    heuristicReasons.Add("high_frequency");
                    heuristicRisk = Math.Max(heuristicRisk, 0.85m);
                }

                if (recentTxns.Any() && transaction.Amount > (decimal)avgAmount * 5m && transaction.Amount >= 100000m)
                {
                    heuristicReasons.Add("amount_far_above_average");
                    heuristicRisk = Math.Max(heuristicRisk, 0.8m);
                }

                if (account.AvailableBalance > 0 && transaction.Amount >= account.AvailableBalance * 0.5m)
                {
                    heuristicReasons.Add("large_share_of_balance");
                    heuristicRisk = Math.Max(heuristicRisk, 0.82m);
                }

                if (heuristicReasons.Count > 0 && (!result.IsSuspicious || heuristicRisk > result.RiskScore))
                {
                    result.IsSuspicious = true;
                    result.RiskScore = Math.Max(result.RiskScore, heuristicRisk);

                    var bonus = Math.Min(0.03m * Math.Max(heuristicReasons.Count - 1, 0), 0.05m);
                    result.RiskScore = Math.Min(result.RiskScore + bonus, 0.95m);

                    if (heuristicReasons.Contains("high_frequency"))
                        result.AnomalyType = "HighFrequency";
                    else if (heuristicReasons.Contains("large_absolute_amount") || heuristicReasons.Contains("amount_far_above_average") || heuristicReasons.Contains("large_share_of_balance"))
                        result.AnomalyType = "HighAmount";
                    else
                        result.AnomalyType = "SuspiciousPattern";

                    _logger.LogInformation(
                        "Heuristic fraud trigger for transaction {Id}: {Reasons}",
                        transaction.Id,
                        string.Join(", ", heuristicReasons));
                }

                if (result.IsSuspicious)
                {
                    result.RiskScore = Math.Min(Math.Max(result.RiskScore, 0.05m), 0.95m);

                    // Определяем тип аномалии
                    if (string.IsNullOrEmpty(result.AnomalyType) && transaction.Amount > (decimal)avgAmount * 10)
                        result.AnomalyType = "HighAmount";
                    else if (string.IsNullOrEmpty(result.AnomalyType) && txnLast24h > 10)
                        result.AnomalyType = "HighFrequency";
                    else if (string.IsNullOrEmpty(result.AnomalyType) && DateTime.UtcNow.Hour >= 0 && DateTime.UtcNow.Hour <= 4)
                        result.AnomalyType = "RareGeolocation";
                    else if (string.IsNullOrEmpty(result.AnomalyType))
                        result.AnomalyType = "SuspiciousPattern";

                    // ===== LLM постобработка (Qwen3.5-2.0B через Ollama) =====
                    result.TriggerReasonFull = await _llmService.GenerateFraudDescriptionAsync(
                        transaction.Amount, transaction.Currency, result.AnomalyType,
                        result.RiskScore, (decimal)avgAmount, txnLast24h,
                        account.AccountType, account.Client?.FullName);
                    result.TriggerReason = GetShortFallbackReason(result.AnomalyType);

                    // Создаём алерт
                    var alert = new FraudAlert
                    {
                        Id = $"alert-{DateTime.UtcNow:yyyyMMddHHmmss}{Guid.NewGuid().ToString("N")[..8]}",
                        TransactionId = transaction.Id,
                        AnomalyType = result.AnomalyType,
                        RiskScore = result.RiskScore,
                        Status = "PendingReview",
                        TriggerReason = result.TriggerReason,
                        TriggerReasonFull = result.TriggerReasonFull,
                        CreatedAt = DateTime.UtcNow
                    };

                    db.FraudAlerts.Add(alert);
                    await db.SaveChangesAsync();

                    // SignalR push
                    await _fraudHub.Clients.All.SendAsync("newFraudAlert", new
                    {
                        alertId = alert.Id,
                        transactionId = transaction.Id,
                        anomalyType = alert.AnomalyType,
                        riskScore = alert.RiskScore,
                        accountNumber = account.AccountNumber,
                        ownerFullName = account.Client?.FullName,
                        amount = transaction.Amount,
                        currency = transaction.Currency,
                        createdAt = alert.CreatedAt,
                        triggerReason = alert.TriggerReason,
                        triggerReasonFull = alert.TriggerReasonFull ?? alert.TriggerReason,
                        notificationText = alert.TriggerReason ?? GetShortFallbackReason(alert.AnomalyType)
                    });

                    _logger.LogWarning("FRAUD ALERT: {Id} | {Amount} {Currency} | Score={Score:P1} | {Type}",
                        alert.Id, transaction.Amount, transaction.Currency, result.RiskScore, result.AnomalyType);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ML fraud check error for transaction {Id}", transaction.Id);
            }

            return result;
        }

        /// <summary>
        /// Не применять ML/эвристики к зарплатным переводам с кодом дохода и к переводам от работодателя
        /// на счёт сотрудника, назначенного в штате (в т.ч. несколько организаций у одного лица).
        /// </summary>
        private static async Task<bool> ShouldSkipFraudCheckAsync(AppDbContext db, Transaction transaction)
        {
            if (transaction.Type == "Exchange") return true;
            if (transaction.Type != "Transfer") return false;
            if (!transaction.FromAccountId.HasValue || !transaction.ToAccountId.HasValue) return false;

            var fromClientId = await db.Accounts.AsNoTracking()
                .Where(a => a.Id == transaction.FromAccountId.Value)
                .Select(a => a.ClientId)
                .FirstOrDefaultAsync();
            var toClientId = await db.Accounts.AsNoTracking()
                .Where(a => a.Id == transaction.ToAccountId.Value)
                .Select(a => a.ClientId)
                .FirstOrDefaultAsync();

            if (fromClientId == Guid.Empty || toClientId == Guid.Empty) return false;

            if (fromClientId == toClientId) return true;

            var isEmployerToAssignedEmployee = await db.EmployerEmployees.AsNoTracking()
                .AnyAsync(e => e.EmployerClientId == fromClientId
                    && e.EmployeeClientId == toClientId
                    && e.IsActive);
            if (isEmployerToAssignedEmployee) return true;

            if (IncomeKindCodeHelper.IsValid(transaction.IncomeKindCode)) return true;

            return false;
        }

        private static string GetShortFallbackReason(string? anomalyType)
        {
            return anomalyType switch
            {
                "HighAmount" => "Крупная сумма",
                "HighFrequency" => "Частые операции",
                "RareGeolocation" => "Редкая геолокация",
                "SuspiciousPattern" => "Подозрительный шаблон",
                _ => "Подозрительная операция",
            };
        }
    }
}
