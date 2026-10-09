using Backend.Data;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services
{
    public interface IAccountNumberService
    {
        Task<string> GenerateAccountNumberAsync(string accountType);
        string GenerateIban();
    }

    public class AccountNumberService : IAccountNumberService
    {
        private readonly AppDbContext _db;

        public AccountNumberService(AppDbContext db)
        {
            _db = db;
        }


        public async Task<string> GenerateAccountNumberAsync(string accountType)
        {
            var prefix = accountType == "Savings" ? "102" : "101";
            string accountNumber;
            do
            {
                var random = new Random(); 
                var number = random.NextInt64(1000000000, 9999999999);
                accountNumber = $"{prefix}-{number:D10}";
            }
            while (await _db.Accounts.AnyAsync(a => a.AccountNumber == accountNumber));

            return accountNumber;
        }

        public string GenerateIban()
        {
            var random = new Random();
            var digits = string.Concat(Enumerable.Range(0, 22).Select(_ => random.Next(0, 10)));
            return $"RU{digits}";
        }
    }
}
