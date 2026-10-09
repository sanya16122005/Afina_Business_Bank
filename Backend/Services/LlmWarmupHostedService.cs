namespace Backend.Services
{
    /// <summary>
    /// Прогревает LLM (Ollama) фоном после старта приложения, чтобы не блокировать
    /// готовность HTTP-сервера. Если Ollama недоступен или таймаутит — лог + забыли.
    /// </summary>
    public class LlmWarmupHostedService : BackgroundService
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<LlmWarmupHostedService> _logger;

        public LlmWarmupHostedService(IServiceProvider services, ILogger<LlmWarmupHostedService> logger)
        {
            _services = services;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Чуть подождём, чтобы стартовали Ollama-контейнер и DI-граф.
            try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); }
            catch (TaskCanceledException) { return; }

            using var scope = _services.CreateScope();
            try
            {
                var llm = scope.ServiceProvider.GetRequiredService<ILlmService>();
                await llm.GenerateFraudDescriptionAsync(
                    amount: 1000m,
                    currency: "RUB",
                    anomalyType: "Warmup",
                    riskScore: 0.01m,
                    avgAmount: 900m,
                    txnLast24h: 1,
                    accountType: "Checking",
                    ownerName: "warmup");
                _logger.LogInformation("LLM warmup completed.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "LLM warmup skipped due to startup error.");
            }
        }
    }
}
