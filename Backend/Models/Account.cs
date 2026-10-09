using System;

namespace Backend.Models
{
    public class Account
    {
        public Guid Id { get; set; }
        public Guid ClientId { get; set; }
        public string AccountNumber { get; set; } = "";
        public string AccountType { get; set; } = "Checking"; 
        public string? SubType { get; set; }     
        public string Currency { get; set; } = "RUB"; 
        public decimal Balance { get; set; } = 0;
        public decimal AvailableBalance { get; set; } = 0;
        public decimal HoldAmount { get; set; } = 0;
        public string Status { get; set; } = "Active";
        public string? Iban { get; set; }
        public string? Bic { get; set; } = "BANKRU2MXXX";
        public decimal InterestRate { get; set; } = 0;
        public string? Purpose { get; set; }
        public string? CardDesign { get; set; } = "classic";
        public bool IsFirstWithdrawal { get; set; } = true;
        public bool IsSalaryAccount { get; set; } = false; // Зарплатный счёт (один на клиента, только RUB, без комиссий) 
        public DateTime OpenedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LastInterestAppliedAt { get; set; }
        public DateTime? ClosedAt { get; set; }
        public DateTime? LastTransactionAt { get; set; }

        
        public Client Client { get; set; } = null!;
        public ICollection<Card> Cards { get; set; } = new List<Card>();
        public ICollection<Transaction> OutgoingTransactions { get; set; } = new List<Transaction>();
        public ICollection<Transaction> IncomingTransactions { get; set; } = new List<Transaction>();
    }

    public class Card
    {
        public Guid Id { get; set; }
        public Guid AccountId { get; set; }
        public string CardNumberMasked { get; set; } = "";
        public string CardType { get; set; } = "Debit";
        public string PaymentSystem { get; set; } = "Visa";
        public string Status { get; set; } = "Active";
        public DateTime ExpiryDate { get; set; }
        public bool IsVirtual { get; set; } = false;
        public decimal DailyLimit { get; set; } = 100000;
        public decimal MonthlyLimit { get; set; } = 500000;
        public decimal SpentToday { get; set; } = 0;
        public decimal SpentThisMonth { get; set; } = 0;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public Account Account { get; set; } = null!;
    }
}
