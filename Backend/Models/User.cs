using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models
{
    public class User
    {
        public Guid Id { get; set; }
        public string Email { get; set; }
        public string PasswordHash { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }

        [NotMapped]
        public string FullName => $"{FirstName} {LastName}";

        public string PhoneNumber { get; set; }
        public DateTime? DateOfBirth { get; set; }
        public string Role { get; set; } 
        public bool IsActive { get; set; } = true;
        public bool IsVerified { get; set; } = false;
        public bool EmailVerified { get; set; } = false;
        public bool PhoneVerified { get; set; } = false;

        
        public bool TwoFactorEnabled { get; set; } = true;
        public string? TwoFactorCode { get; set; }
        public DateTime? TwoFactorCodeExpiry { get; set; }
        public Guid? PendingLoginToken { get; set; }

        // Password reset
        public string? PasswordResetCode { get; set; }
        public DateTime? PasswordResetCodeExpiry { get; set; }

        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.Now;
        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.Now;
        public DateTime? LastLoginAt { get; set; }

        
        public UserAddress? Address { get; set; }
        public UserSettings? Settings { get; set; }
        public ICollection<LoginHistory> LoginHistory { get; set; } = new List<LoginHistory>();
        public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    }

    public class UserAddress
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string? Country { get; set; }
        public string? City { get; set; }
        public string? Street { get; set; }
        public string? Building { get; set; }
        public string? Apartment { get; set; }
        public string? PostalCode { get; set; }
        public User User { get; set; } = null!;
    }

    public class UserSettings
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string Language { get; set; } = "ru";
        public string Currency { get; set; } = "RUB";
        public string Theme { get; set; } = "light";
        public bool NotifyEmail { get; set; } = true;
        public bool NotifyPush { get; set; } = true;
        public bool NotifySms { get; set; } = false;
        public User User { get; set; } = null!;
    }

    public class LoginHistory
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string? IpAddress { get; set; }
        public string? UserAgent { get; set; }
        public string? Location { get; set; }
        public string Status { get; set; } = "Success";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public User User { get; set; } = null!;
    }

    public class RefreshToken
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public Guid Token { get; set; }
        public DateTime ExpiresAt { get; set; }
        public bool IsRevoked { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public User User { get; set; } = null!;
    }
}
