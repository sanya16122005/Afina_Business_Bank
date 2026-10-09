using System;

namespace Backend.Models
{
    /// <summary>
    /// Расписание автоматической выплаты зарплаты сотруднику (юрлицо → назначенный сотрудник).
    /// День месяца / день недели и время суток задаются в часовом поясе Москвы (Europe/Moscow).
    /// </summary>
    public class SalaryAutopayRule
    {
        public Guid Id { get; set; }
        public Guid EmployerClientId { get; set; }
        public Guid EmployerEmployeeId { get; set; }
        public Guid FromAccountId { get; set; }

        public decimal Amount { get; set; }
        public string Currency { get; set; } = "RUB";
        public string IncomeKindCode { get; set; } = "";

        /// <summary>Monthly | Weekly | BiWeekly</summary>
        public string Cadence { get; set; } = "Monthly";

        /// <summary>День месяца 1–28 (для Monthly).</summary>
        public int? DayOfMonth { get; set; }

        /// <summary>День недели: 0 = воскресенье … 6 = суббота (как System.DayOfWeek).</summary>
        public int? DayOfWeek { get; set; }

        /// <summary>Минуты от полуночи по Москве (0–1439). Имя поля в БД историческое.</summary>
        public int RunTimeMinutesUtc { get; set; }

        public bool IsEnabled { get; set; } = true;

        public DateTimeOffset NextRunAt { get; set; }
        public DateTimeOffset? LastRunAt { get; set; }
        public string? LastError { get; set; }

        public string? PaymentDescription { get; set; }

        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

        public Client EmployerClient { get; set; } = null!;
        public EmployerEmployee EmployerEmployee { get; set; } = null!;
        public Account FromAccount { get; set; } = null!;
    }
}
