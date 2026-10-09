using System;

namespace Backend.Models
{
    /// <summary>
    /// Связь работодателя (клиент с типом Legal) с сотрудником (клиент физлица).
    /// </summary>
    public class EmployerEmployee
    {
        public Guid Id { get; set; }
        public Guid EmployerClientId { get; set; }
        public Guid EmployeeClientId { get; set; }
        public string? Position { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

        public Client EmployerClient { get; set; } = null!;
        public Client EmployeeClient { get; set; } = null!;
    }
}
