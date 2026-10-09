namespace Backend.Models
{
    /// <summary>Настройки банковской маржи при обмене валют (одна строка, Id = 1).</summary>
    public class BankExchangeSettings
    {
        public int Id { get; set; } = 1;

        /// <summary>Наценка при продаже валюты клиенту, % (a в K_sell = K_CB * (1 + a/100)).</summary>
        public decimal SellMarginPercent { get; set; } = 2.0m;

        /// <summary>Скидка при покупке валюты у клиента, % (b в K_buy = K_CB * (1 - b/100)).</summary>
        public decimal BuyDiscountPercent { get; set; } = 2.0m;

        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}
