namespace Backend.DTOs
{
    // ========== AUTH ==========
    public record RegisterRequest(
        string Email, string Password, string ConfirmPassword,
        string FirstName, string LastName, string PhoneNumber, DateTime? DateOfBirth);

    public record LoginRequest(string Email, string Password);
    public record TwoFactorVerifyRequest(Guid PendingToken, string Code);
    public record LogoutRequest(Guid RefreshToken);
    public record RefreshRequest(Guid RefreshToken);
    public record ChangePasswordRequest(string CurrentPassword, string NewPassword, string ConfirmNewPassword);
    public record ForgotPasswordRequest(string Email);
    public record ResetPasswordRequest(string Email, string Code, string NewPassword, string ConfirmNewPassword);

    // ========== PROFILE ==========
    public record UpdateProfileRequest(
        string? FirstName, string? LastName, string? PhoneNumber, AddressDto? Address);

    public record UpdateSettingsRequest(
        string? Language, string? Currency, NotificationsDto? Notifications);

    public record AddressDto(
        string? Country, string? City, string? Street,
        string? Building, string? Apartment, string? PostalCode);

    public record NotificationsDto(bool Email, bool Push, bool Sms);

    // ========== ACCOUNTS ==========
    public record CreateAccountRequest(
        string AccountType, string? SubType, string Currency,
        decimal InitialDeposit, string? Purpose, bool IsSalaryAccount = false, string? CardDesign = null);

    public record UpdateAccountDesignRequest(string CardDesign);

    // ========== TRANSACTIONS ==========
    public record TransferRequest(
        Guid FromAccountId, decimal Amount, string Currency,
        string? ToAccountNumber = null, string? ToPhoneNumber = null,
        string? Description = null,
        string? IncomeKindCode = null);

    public record RegisterLegalEntityRequest(
        string Email, string Password, string ConfirmPassword,
        string PhoneNumber,
        string CompanyName, string OwnershipForm, string? LegalAddress,
        string DirectorFirstName, string DirectorLastName,
        DateTime? DateOfBirth);

    public record AddEmployeeRequest(string EmployeeEmail, string? Position);

    /// <summary>Автовыплата зарплаты. День месяца / недели и время — по московскому времени.</summary>
    public record CreateSalaryAutopayRequest(
        Guid EmployerEmployeeId,
        Guid FromAccountId,
        decimal Amount,
        string Currency,
        string IncomeKindCode,
        string Cadence,
        int? DayOfMonth,
        int? DayOfWeek,
        int RunTimeMinutesUtc,
        string? PaymentDescription);

    public record UpdateSalaryAutopayRequest(
        Guid? FromAccountId,
        decimal? Amount,
        string? Currency,
        string? IncomeKindCode,
        string? Cadence,
        int? DayOfMonth,
        int? DayOfWeek,
        int? RunTimeMinutesUtc,
        bool? IsEnabled,
        string? PaymentDescription);

    // ========== CASHIER ==========
    public record StartSessionRequest(string CashierFullName);
    public record EndSessionRequest(bool Confirm);

    public record CreateClientRequest(
        string ClientType,
        // Физлицо
        string? FirstName, string? LastName, DateTime? DateOfBirth,
        string? Gender, string? PhotoBase64,
        // Юрлицо
        string? CompanyName, string? LegalAddress, string? OwnershipForm,
        string? DirectorFullName, string? AccountantFullName,
        // Общие
        string? PhoneNumber, string? Email, AddressDto? Address);

    public record UpdateClientRequest(
        string ClientType,
        string? FirstName, string? LastName,
        string? PhoneNumber, string? Email,
        string? CompanyName, string? LegalAddress, string? OwnershipForm,
        string? DirectorFullName, string? AccountantFullName,
        AddressDto? Address);

    public record CashierOpenAccountRequest(
        Guid ClientId, string AccountType, string? SubType,
        string Currency, decimal InitialDeposit, string? Purpose, bool IsSalaryAccount = false, string? CardDesign = null);

    public record CashierCloseAccountRequest(string ConfirmAccountNumber);

    public record CashierDepositRequest(
        Guid AccountId, decimal Amount, string Currency,
        string? Description, string SessionId);

    public record CashierWithdrawRequest(
        Guid AccountId, decimal Amount, string Currency,
        string? Description, string SessionId);

    public record CashierTransferRequest(
        Guid FromAccountId, string ToAccountNumber,
        decimal Amount, string Currency,
        string? Description, string SessionId,
        string? IncomeKindCode = null);

    // ========== ADMIN ==========
    public record CreateUserRequest(
        string Email, string Password, string FirstName,
        string LastName, string PhoneNumber, DateTime? DateOfBirth, string Role);

    public record UpdateUserRequest(
        string? Email, string? FirstName, string? LastName,
        string? PhoneNumber, DateTime? DateOfBirth,
        string? Role, bool? IsActive,
        bool? IsVerified, bool? EmailVerified,
        bool? PhoneVerified);

    public record ChangeRoleRequest(string NewRole);
    public record ChangeStatusRequest(string Action); // Block, Unblock

    // ========== FRAUD ==========
    public record ResolveFraudAlertRequest(string Decision, string? Comment); // Confirmed, Blocked

    // ========== PAGINATION ==========
    public class PaginationMeta
    {
        public int Total { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages => (int)Math.Ceiling((double)Total / PageSize);
        public bool HasNextPage => Page < TotalPages;
        public bool HasPreviousPage => Page > 1;
    }
}
