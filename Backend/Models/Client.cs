using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models
{
    public class Client
    {
        public Guid Id { get; set; }
        public Guid? UserId { get; set; }
        public string ClientType { get; set; } = "Individual"; 

        
        public string? FirstName { get; set; }
        public string? LastName { get; set; }

        [NotMapped]
        public string FullName => ClientType == "Individual"
            ? $"{FirstName} {LastName}".Trim()
            : ComposeLegalName(OwnershipForm, CompanyName);

        // Форма + название без дублирования. Старые записи, где форма уже
        // зашита в название («ООО «Ромашка»»), не префиксуем повторно.
        private static string ComposeLegalName(string? form, string? name)
        {
            var n = (name ?? "").Trim();
            var f = (form ?? "").Trim();
            if (string.IsNullOrEmpty(f)) return n;
            if (string.IsNullOrEmpty(n)) return f;
            return n.StartsWith(f, StringComparison.OrdinalIgnoreCase) ? n : $"{f} {n}";
        }

        public DateTime? DateOfBirth { get; set; }
        public string? Gender { get; set; }
        public string? PhotoUrl { get; set; }

        
        public string? CompanyName { get; set; }
        public string? LegalAddress { get; set; }
        public string? OwnershipForm { get; set; }
        public string? DirectorFullName { get; set; }
        public string? AccountantFullName { get; set; }

        
        public string? PhoneNumber { get; set; }
        public string? Email { get; set; }
        public bool IsDebtor { get; set; } = false;
        public string Status { get; set; } = "Active";
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.Now;
        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.Now;

        
        public User? User { get; set; }
        public ClientAddress? Address { get; set; }
        public ICollection<Account> Accounts { get; set; } = new List<Account>();
    }

    public class ClientAddress
    {
        public Guid Id { get; set; }
        public Guid ClientId { get; set; }
        public string? Country { get; set; }
        public string? City { get; set; }
        public string? Street { get; set; }
        public string? Building { get; set; }
        public string? Apartment { get; set; }
        public string? PostalCode { get; set; }
        public Client Client { get; set; } = null!;
    }
}
