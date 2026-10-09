using Backend.Models;

namespace Backend.Services
{
    public interface ITransactionService
    {
        string GenerateReference();
        FeeCalculation CalculateFee(Account account, decimal amount, string operationType);
    }

    public class FeeCalculation
    {
        public decimal FeePercent { get; set; }
        public decimal FeeAmount { get; set; }
        public string? FeeReason { get; set; }
        public bool IsFirstWithdrawal { get; set; }
    }

    public class TransactionService : ITransactionService
    {
        public string GenerateReference()
        {
            // Guid suffix вместо new Random(): при одновременных операциях
            // несколько Random(), засеянных одним тиком таймера, давали одинаковый
            // reference — отсюда дубли в отчётах и коллизии React-ключей в таблице.
            return $"TXN-{DateTime.UtcNow:yyyyMMddHHmmssfff}{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";
        }

        public FeeCalculation CalculateFee(Account account, decimal amount, string operationType)
        {
            var result = new FeeCalculation
            {
                FeePercent = 0,
                FeeAmount = 0,
                IsFirstWithdrawal = account.IsFirstWithdrawal
            };

            if (operationType == "Withdrawal" || operationType == "Transfer")
            {
                // Зарплатный счёт — без комиссий
                if (account.IsSalaryAccount)
                {
                    result.FeeReason = "Salary account — no fee";
                    return result;
                }

                if (account.AccountType == "Savings")
                {
                    // Сберегательный: 2.5% кроме первого снятия
                    if (!account.IsFirstWithdrawal)
                    {
                        result.FeePercent = 2.5m;
                        result.FeeAmount = Math.Round(amount * 0.025m, 2);
                        result.FeeReason = "Savings account withdrawal (not first)";
                    }
                    else
                    {
                        result.FeeReason = "First savings withdrawal — no fee";
                        result.IsFirstWithdrawal = true;
                    }
                }
                else if (account.AccountType == "Checking" && account.SubType == "Credit")
                {
                    //Кредит 0.2% при отрицательном балансе
                    if (account.Balance < 0 || (account.Balance - amount) < 0)
                    {
                        result.FeePercent = 0.2m;
                        result.FeeAmount = Math.Round(amount * 0.002m, 2);
                        result.FeeReason = "Credit account withdrawal with negative balance";
                    }
                }
                //0% внутренний, 1% внешний 
            }

            return result;
        }
    }
}
