using System;

namespace Backend.Models
{
    public class Transaction
    {
        public Guid Id { get; set; }
        public string Reference { get; set; } = "";
        public string Type { get; set; } = "Transfer"; 
        public string Status { get; set; } = "Pending";
        public decimal Amount { get; set; }
        public string Currency { get; set; } = "RUB";
        public string? Description { get; set; }
        public Guid? FromAccountId { get; set; }
        public Guid? ToAccountId { get; set; }
        public decimal Fee { get; set; } = 0;
        public decimal FeePercent { get; set; } = 0;
        public string? FeeReason { get; set; }
        public decimal? BalanceAfter { get; set; }
        public string? Location { get; set; }
        public string? MerchantName { get; set; }
        public string? MerchantCategory { get; set; }
        public string? MerchantLocation { get; set; }
        public string? CardLastDigits { get; set; }
        public string? CashierSessionId { get; set; }
        public string? CashierFullName { get; set; }
        /// <summary>Код вида дохода (для учёта выплат физлицам, отражения в 6‑НДФЛ и др.).</summary>
        public string? IncomeKindCode { get; set; }
        /// <summary>Сумма зачисления при обмене валют (в валюте счёта получателя).</summary>
        public decimal? CounterAmount { get; set; }
        public string? CounterCurrency { get; set; }
        public decimal? ExchangeRateCbr { get; set; }
        public decimal? ExchangeRateApplied { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? CompletedAt { get; set; }

        
        public Account? FromAccount { get; set; }
        public Account? ToAccount { get; set; }
        public CashierSession? CashierSession { get; set; }
    }

    public class CashierSession
    {
        public string Id { get; set; } = "";
        public Guid CashierUserId { get; set; }
        public string CashierFullName { get; set; } = "";
        public string Status { get; set; } = "Active";
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EndedAt { get; set; }

        
        public User CashierUser { get; set; } = null!;
        public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    }

    public class FraudAlert
    {
        public string Id { get; set; } = "";
        public Guid TransactionId { get; set; }
        public string AnomalyType { get; set; } = "HighAmount"; 
        public decimal RiskScore { get; set; }
        public string Status { get; set; } = "PendingReview"; 
        public string? TriggerReason { get; set; }
        public string? TriggerReasonFull { get; set; }
        public string? Decision { get; set; } 
        public string? Comment { get; set; }
        public string? ResolvedByName { get; set; }
        public Guid? ResolvedBy { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        
        public Transaction Transaction { get; set; } = null!;
        public User? Resolver { get; set; }
    }

    public class AuditLog
    {
        public string Id { get; set; } = "";
        public Guid? UserId { get; set; }
        public string? UserFullName { get; set; }
        public string? Role { get; set; }
        public string ActionType { get; set; } = "";
        public string? TargetObject { get; set; }
        public Guid? TargetObjectId { get; set; }
        public string Result { get; set; } = "Success";
        public string? IpAddress { get; set; }
        public string? UserAgent { get; set; }
        public string? RequestPayload { get; set; }
        public string? Details { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public User? User { get; set; }
    }
}
