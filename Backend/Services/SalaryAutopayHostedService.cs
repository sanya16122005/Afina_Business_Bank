namespace Backend.Services
{
    /// <summary>Периодически выполняет автовыплаты зарплаты (время сервера, UTC).</summary>
    public class SalaryAutopayHostedService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<SalaryAutopayHostedService> _logger;
        private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

        public SalaryAutopayHostedService(IServiceScopeFactory scopeFactory, ILogger<SalaryAutopayHostedService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var processor = scope.ServiceProvider.GetRequiredService<ISalaryAutopayProcessor>();
                    await processor.RunDueAsync(stoppingToken);
                    await processor.ProcessSavingsInterestAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "SalaryAutopayHostedService tick failed");
                }

                try
                {
                    await Task.Delay(Interval, stoppingToken);
                }
                catch (TaskCanceledException)
                {
                    break;
                }
            }
        }
    }
}
