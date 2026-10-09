using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Utilities
{
    public static class RecipientLookupHelper
    {
        public static string NormalizeDigits(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            return new string(value.Where(char.IsDigit).ToArray());
        }

        public static IReadOnlyList<string> GetPhoneLookupVariants(string? phoneNumber)
        {
            var digits = NormalizeDigits(phoneNumber);
            if (string.IsNullOrEmpty(digits)) return Array.Empty<string>();

            var variants = new List<string> { digits };

            if (digits.Length == 10)
            {
                variants.Add($"7{digits}");
                variants.Add($"8{digits}");
                return variants.Distinct().ToArray();
            }

            if (digits.Length == 11 && (digits[0] == '7' || digits[0] == '8'))
            {
                var alternateFirstDigit = digits[0] == '7' ? '8' : '7';
                var alternate = alternateFirstDigit + digits[1..];
                if (!variants.Contains(alternate))
                {
                    variants.Add(alternate);
                }
            }

            return variants;
        }

        public static Task<Account?> ResolveRecipientAccountAsync(AppDbContext db, string? accountNumber, string? phoneNumber)
        {
            if (!string.IsNullOrWhiteSpace(phoneNumber))
            {
                return ResolveByPhoneNumberAsync(db, phoneNumber);
            }

            if (!string.IsNullOrWhiteSpace(accountNumber))
            {
                return ResolveByAccountNumberAsync(db, accountNumber);
            }

            return Task.FromResult<Account?>(null);
        }

        private static Task<Account?> ResolveByAccountNumberAsync(AppDbContext db, string accountNumber)
        {
            var normalizedAccountNumber = NormalizeDigits(accountNumber);
            if (string.IsNullOrEmpty(normalizedAccountNumber)) return Task.FromResult<Account?>(null);

            return db.Accounts
                .Include(a => a.Client)
                .FirstOrDefaultAsync(a =>
                    a.AccountNumber != null &&
                    a.AccountNumber.Replace("-", "").Replace(" ", "") == normalizedAccountNumber);
        }

        private static Task<Account?> ResolveByPhoneNumberAsync(AppDbContext db, string phoneNumber)
        {
            var phoneVariants = GetPhoneLookupVariants(phoneNumber);
            if (phoneVariants.Count == 0) return Task.FromResult<Account?>(null);

            return db.Accounts
                .Include(a => a.Client)
                .Where(a =>
                    a.Client.PhoneNumber != null &&
                    phoneVariants.Contains(
                        a.Client.PhoneNumber
                            .Replace("+", "")
                            .Replace(" ", "")
                            .Replace("-", "")
                            .Replace("(", "")
                            .Replace(")", "")))
                .OrderByDescending(a => a.Status == "Active")
                .ThenByDescending(a => a.IsSalaryAccount)
                .ThenByDescending(a => a.AccountType == "Checking")
                .ThenBy(a => a.OpenedAt)
                .FirstOrDefaultAsync();
        }
    }
}