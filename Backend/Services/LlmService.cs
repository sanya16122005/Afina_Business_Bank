using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Backend.Services
{
    public interface ILlmService
    {
        Task<string> GenerateFraudDescriptionAsync(
            decimal amount, string currency, string anomalyType,
            decimal riskScore, decimal avgAmount, int txnLast24h,
            string accountType, string? ownerName);
    }

    /// <summary>
    /// Сервис постобработки fraud-алертов через локальную LLM (Qwen3.5-2.0B в Ollama).
    /// При недоступности LLM или таймауте — возвращает шаблонный текст.
    /// </summary>
    public class OllamaLlmService : ILlmService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<OllamaLlmService> _logger;
        private readonly string _ollamaUrl;
        private readonly string _modelName;
        private readonly int _timeoutSeconds;

        public OllamaLlmService(IConfiguration config, ILogger<OllamaLlmService> logger)
        {
            _logger = logger;
            _ollamaUrl = config["Llm:OllamaUrl"] ?? "http://ollama:11434";
            _modelName = config["Llm:ModelName"] ?? "qwen3.5:2b";
            _timeoutSeconds = int.Parse(config["Llm:TimeoutSeconds"] ?? "15");

            _httpClient = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(_timeoutSeconds)
            };
            _httpClient.DefaultRequestHeaders.Add("ngrok-skip-browser-warning", "true");
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");
        }

        public async Task<string> GenerateFraudDescriptionAsync(
            decimal amount, string currency, string anomalyType,
            decimal riskScore, decimal avgAmount, int txnLast24h,
            string accountType, string? ownerName)
        {
            var fallback = BuildFallbackDescription(
                amount, currency, anomalyType, riskScore, avgAmount, txnLast24h, accountType, ownerName);

            try
            {
                var prompt = $@"Ты — аналитик антифрод-системы банка ""Афина"". Составь короткое, но полноценное объяснение подозрительной операции на русском языке, 3-4 предложения. Используй только предоставленные данные, не выдумывай.

Данные операции:
- Клиент: {ownerName ?? "неизвестен"}
- Сумма: {amount:N0} {currency}
- Тип аномалии: {anomalyType}
- Вероятность мошенничества: {riskScore:P0}
- Средний чек клиента за 30 дней: {avgAmount:N0} {currency}
- Операций за последние 24 часа: {txnLast24h}
- Тип счёта: {accountType}

Опиши, что именно подозрительно, насколько это отклоняется от нормы, и какие действия рекомендуются кассиру.";

                var requestBody = new
                {
                    model = _modelName,
                    stream = false,
                    think = false,
                    messages = new object[]
                    {
                        new
                        {
                            role = "system",
                            content = "Ты аналитик антифрод-системы банка. Отвечай только на русском и только по переданным данным. Не показывай внутренние рассуждения."
                        },
                        new
                        {
                            role = "user",
                            content = prompt
                        }
                    },
                    options = new
                    {
                        temperature = 0.3,
                        num_predict = 120
                    }
                };

                var json = JsonSerializer.Serialize(requestBody);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_ollamaUrl}/api/chat", content);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Ollama returned {Status}, using fallback", response.StatusCode);
                    return fallback;
                }

                var responseJson = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<JsonElement>(responseJson);

                // 1) /api/chat format
                if (result.TryGetProperty("message", out var messageNode)
                    && messageNode.TryGetProperty("content", out var llmResponse))
                {
                    var text = llmResponse.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(text))
                    {
                        _logger.LogInformation("LLM generated fraud description ({Len} chars)", text.Length);
                        return text;
                    }
                }

                // 2) /api/generate format (or compatibility responses)
                if (result.TryGetProperty("response", out var generateResponse))
                {
                    var text = generateResponse.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(text))
                    {
                        _logger.LogInformation("LLM generated fraud description ({Len} chars)", text.Length);
                        return text;
                    }
                }

                _logger.LogWarning("LLM returned empty/unknown payload, using fallback");
                return fallback;
            }
            catch (TaskCanceledException)
            {
                _logger.LogWarning("LLM timeout ({Timeout}s), using fallback", _timeoutSeconds);
                return fallback;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning("LLM unavailable: {Message}, using fallback", ex.Message);
                return fallback;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "LLM error, using fallback");
                return fallback;
            }
        }

        private static string BuildFallbackDescription(
            decimal amount, string currency, string anomalyType,
            decimal riskScore, decimal avgAmount, int txnLast24h,
            string accountType, string? ownerName)
        {
            return anomalyType switch
            {
                "HighAmount" => $"Операция клиента {ownerName ?? "неизвестен"} выглядит подозрительно: сумма {amount:N0} {currency} заметно выше среднего чека {avgAmount:N0} {currency}. Вероятность мошенничества оценивается в {riskScore:P0}. Для счёта типа {accountType} рекомендуется ручная проверка перед завершением операции.",
                "HighFrequency" => $"Операция клиента {ownerName ?? "неизвестен"} попала под антифрод из-за высокой частоты действий: за последние 24 часа выполнено {txnLast24h} операций. Такое поведение отличается от обычного профиля клиента и требует дополнительной проверки. Вероятность мошенничества оценивается в {riskScore:P0}.",
                "RareGeolocation" => $"Операция клиента {ownerName ?? "неизвестен"} выглядит нетипично по профилю антифрода. Тип аномалии связан с редкой геолокацией или необычным сценарием проведения операции. Вероятность мошенничества оценивается в {riskScore:P0}, поэтому требуется ручная проверка.",
                "SuspiciousPattern" => $"Операция клиента {ownerName ?? "неизвестен"} выглядит подозрительно по совокупности признаков. Сумма {amount:N0} {currency}, средний чек {avgAmount:N0} {currency} и профиль счёта {accountType} не совпадают с обычным поведением. Вероятность мошенничества оценивается в {riskScore:P0}, поэтому операция должна быть проверена вручную.",
                _ => $"Операция клиента {ownerName ?? "неизвестен"} отмечена антифрод-системой как подозрительная. Сумма {amount:N0} {currency}, средний чек {avgAmount:N0} {currency} и число операций за сутки ({txnLast24h}) указывают на отклонение от нормы. Вероятность мошенничества оценивается в {riskScore:P0}, поэтому рекомендуется ручная проверка.",
            };
        }
    }
}
