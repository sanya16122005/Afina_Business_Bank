using Microsoft.EntityFrameworkCore;
using Backend.Models;

namespace Backend.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users { get; set; }
        public DbSet<UserAddress> UserAddresses { get; set; }
        public DbSet<UserSettings> UserSettings { get; set; }
        public DbSet<LoginHistory> LoginHistories { get; set; }
        public DbSet<RefreshToken> RefreshTokens { get; set; }
        public DbSet<Client> Clients { get; set; }
        public DbSet<ClientAddress> ClientAddresses { get; set; }
        public DbSet<Account> Accounts { get; set; }
        public DbSet<Card> Cards { get; set; }
        public DbSet<Transaction> Transactions { get; set; }
        public DbSet<EmployerEmployee> EmployerEmployees { get; set; }
        public DbSet<SalaryAutopayRule> SalaryAutopayRules { get; set; }
        public DbSet<CashierSession> CashierSessions { get; set; }
        public DbSet<FraudAlert> FraudAlerts { get; set; }
        public DbSet<AuditLog> AuditLogs { get; set; }


        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            
            modelBuilder.Entity<User>(e =>
            {
                e.ToTable("users");
                e.Property(x => x.Id).HasColumnName("Id");
                e.Property(x => x.Email).HasColumnName("Email");
                e.Property(x => x.PasswordHash).HasColumnName("PasswordHash");
                e.Property(x => x.FirstName).HasColumnName("FirstName");
                e.Property(x => x.LastName).HasColumnName("LastName");
                e.Property(x => x.PhoneNumber).HasColumnName("PhoneNumber");
                e.Property(x => x.DateOfBirth).HasColumnName("DateOfBirth");
                e.Property(x => x.Role).HasColumnName("Role");
                e.Property(x => x.IsActive).HasColumnName("IsActive");
                e.Property(x => x.IsVerified).HasColumnName("IsVerified");
                e.Property(x => x.EmailVerified).HasColumnName("EmailVerified");
                e.Property(x => x.PhoneVerified).HasColumnName("PhoneVerified");
                e.Property(x => x.TwoFactorEnabled).HasColumnName("TwoFactorEnabled");
                e.Property(x => x.TwoFactorCode).HasColumnName("TwoFactorCode");
                e.Property(x => x.TwoFactorCodeExpiry).HasColumnName("TwoFactorCodeExpiry");
                e.Property(x => x.PendingLoginToken).HasColumnName("PendingLoginToken");
                e.Property(x => x.PasswordResetCode).HasColumnName("PasswordResetCode");
                e.Property(x => x.PasswordResetCodeExpiry).HasColumnName("PasswordResetCodeExpiry");
                e.Property(x => x.CreatedAt).HasColumnName("CreatedAt");
                e.Property(x => x.UpdatedAt).HasColumnName("UpdatedAt");
                e.Property(x => x.LastLoginAt).HasColumnName("LastLoginAt");
                e.Ignore(x => x.FullName);
                e.HasIndex(x => x.Email).IsUnique();
            });

            modelBuilder.Entity<UserAddress>(e =>
            {
                e.ToTable("user_addresses");
            });

            modelBuilder.Entity<UserSettings>(e =>
            {
                e.ToTable("user_settings");
                e.Property(x => x.Id).HasColumnName("Id");
                e.Property(x => x.UserId).HasColumnName("UserId");
                e.Property(x => x.Language).HasColumnName("Language");
                e.Property(x => x.Currency).HasColumnName("Currency");
                e.Property(x => x.Theme).HasColumnName("Theme");
                e.Property(x => x.NotifyEmail).HasColumnName("NotifyEmail");
                e.Property(x => x.NotifyPush).HasColumnName("NotifyPush");
                e.Property(x => x.NotifySms).HasColumnName("NotifySms");
            });

            modelBuilder.Entity<LoginHistory>().ToTable("login_history");
            modelBuilder.Entity<RefreshToken>().ToTable("refresh_tokens");

            modelBuilder.Entity<Client>(e =>
            {
                e.ToTable("clients");
                e.Ignore(x => x.FullName);
                e.HasIndex(x => x.Email);
                e.HasIndex(x => x.PhoneNumber);
            });

            modelBuilder.Entity<ClientAddress>().ToTable("client_addresses");

            modelBuilder.Entity<Account>(e =>
            {
                e.ToTable("accounts");
                e.HasIndex(x => x.AccountNumber).IsUnique();
                e.Property(x => x.CardDesign).HasColumnName("CardDesign");
            });

            modelBuilder.Entity<Card>().ToTable("cards");
            modelBuilder.Entity<Transaction>(e =>
            {
                e.ToTable("transactions");
                e.HasIndex(x => x.Reference);
                e.Property(x => x.IncomeKindCode).HasMaxLength(10);
            });

            modelBuilder.Entity<EmployerEmployee>(e =>
            {
                e.ToTable("employer_employees");
                e.HasIndex(x => new { x.EmployerClientId, x.EmployeeClientId }).IsUnique();
                e.HasOne(x => x.EmployerClient)
                    .WithMany()
                    .HasForeignKey(x => x.EmployerClientId)
                    .OnDelete(DeleteBehavior.Restrict);
                e.HasOne(x => x.EmployeeClient)
                    .WithMany()
                    .HasForeignKey(x => x.EmployeeClientId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<SalaryAutopayRule>(e =>
            {
                e.ToTable("salary_autopay_rules");
                e.HasIndex(x => x.EmployerClientId);
                e.HasIndex(x => new { x.EmployerEmployeeId }).IsUnique();
                e.Property(x => x.Amount).HasPrecision(18, 2);
                e.Property(x => x.Currency).HasMaxLength(8);
                e.Property(x => x.Cadence).HasMaxLength(16);
                e.Property(x => x.IncomeKindCode).HasMaxLength(10);
                e.Property(x => x.PaymentDescription).HasMaxLength(500);
                e.HasOne(x => x.EmployerClient)
                    .WithMany()
                    .HasForeignKey(x => x.EmployerClientId)
                    .OnDelete(DeleteBehavior.Cascade);
                e.HasOne(x => x.EmployerEmployee)
                    .WithMany()
                    .HasForeignKey(x => x.EmployerEmployeeId)
                    .OnDelete(DeleteBehavior.Cascade);
                e.HasOne(x => x.FromAccount)
                    .WithMany()
                    .HasForeignKey(x => x.FromAccountId)
                    .OnDelete(DeleteBehavior.Restrict);
            });
            modelBuilder.Entity<CashierSession>().ToTable("cashier_sessions");
            modelBuilder.Entity<FraudAlert>().ToTable("fraud_alerts");
            modelBuilder.Entity<FraudAlert>().Property(x => x.TriggerReason).HasColumnName("TriggerReason");
            modelBuilder.Entity<FraudAlert>().Property(x => x.TriggerReasonFull).HasColumnName("TriggerReasonFull");
            modelBuilder.Entity<AuditLog>().ToTable("audit_log");



            // ===== Relationships =====

            // User -> Address (1:1)
            modelBuilder.Entity<User>()
                .HasOne(u => u.Address)
                .WithOne(a => a.User)
                .HasForeignKey<UserAddress>(a => a.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // User -> Settings (1:1)
            modelBuilder.Entity<User>()
                .HasOne(u => u.Settings)
                .WithOne(s => s.User)
                .HasForeignKey<UserSettings>(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // User -> LoginHistory (1:N)
            modelBuilder.Entity<User>()
                .HasMany(u => u.LoginHistory)
                .WithOne(l => l.User)
                .HasForeignKey(l => l.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // User -> RefreshTokens (1:N)
            modelBuilder.Entity<User>()
                .HasMany(u => u.RefreshTokens)
                .WithOne(r => r.User)
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Client -> Address (1:1)
            modelBuilder.Entity<Client>()
                .HasOne(c => c.Address)
                .WithOne(a => a.Client)
                .HasForeignKey<ClientAddress>(a => a.ClientId)
                .OnDelete(DeleteBehavior.Cascade);

            // Client -> Accounts (1:N)
            modelBuilder.Entity<Client>()
                .HasMany(c => c.Accounts)
                .WithOne(a => a.Client)
                .HasForeignKey(a => a.ClientId)
                .OnDelete(DeleteBehavior.Restrict);

            // Account -> Cards (1:N)
            modelBuilder.Entity<Account>()
                .HasMany(a => a.Cards)
                .WithOne(c => c.Account)
                .HasForeignKey(c => c.AccountId)
                .OnDelete(DeleteBehavior.Cascade);

            // Transaction -> Accounts (two FK)
            modelBuilder.Entity<Transaction>()
                .HasOne(t => t.FromAccount)
                .WithMany(a => a.OutgoingTransactions)
                .HasForeignKey(t => t.FromAccountId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Transaction>()
                .HasOne(t => t.ToAccount)
                .WithMany(a => a.IncomingTransactions)
                .HasForeignKey(t => t.ToAccountId)
                .OnDelete(DeleteBehavior.Restrict);

            // Transaction -> CashierSession
            modelBuilder.Entity<Transaction>()
                .HasOne(t => t.CashierSession)
                .WithMany(s => s.Transactions)
                .HasForeignKey(t => t.CashierSessionId)
                .OnDelete(DeleteBehavior.SetNull);

            // FraudAlert -> Transaction
            modelBuilder.Entity<FraudAlert>()
                .HasOne(f => f.Transaction)
                .WithOne()
                .HasForeignKey<FraudAlert>(f => f.TransactionId)
                .OnDelete(DeleteBehavior.Cascade);

            // AuditLog -> User
            modelBuilder.Entity<AuditLog>()
                .HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            // CashierSession -> User
            modelBuilder.Entity<CashierSession>()
                .HasOne(cs => cs.CashierUser)
                .WithMany()
                .HasForeignKey(cs => cs.CashierUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // FraudAlert -> Resolver (User)
            modelBuilder.Entity<FraudAlert>()
                .HasOne(f => f.Resolver)
                .WithMany()
                .HasForeignKey(f => f.ResolvedBy)
                .OnDelete(DeleteBehavior.SetNull);

            
            modelBuilder.Entity<Account>().Property(a => a.Balance).HasPrecision(18, 2);
            modelBuilder.Entity<Account>().Property(a => a.AvailableBalance).HasPrecision(18, 2);
            modelBuilder.Entity<Account>().Property(a => a.HoldAmount).HasPrecision(18, 2);
            modelBuilder.Entity<Account>().Property(a => a.InterestRate).HasPrecision(8, 4);
            modelBuilder.Entity<Transaction>().Property(t => t.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<Transaction>().Property(t => t.Fee).HasPrecision(18, 2);
            modelBuilder.Entity<Transaction>().Property(t => t.FeePercent).HasPrecision(8, 4);
            modelBuilder.Entity<Transaction>().Property(t => t.BalanceAfter).HasPrecision(18, 2);
            modelBuilder.Entity<Transaction>().Property(t => t.CounterAmount).HasPrecision(18, 2);
            modelBuilder.Entity<Transaction>().Property(t => t.ExchangeRateCbr).HasPrecision(18, 6);
            modelBuilder.Entity<Transaction>().Property(t => t.ExchangeRateApplied).HasPrecision(18, 6);
            modelBuilder.Entity<FraudAlert>().Property(f => f.RiskScore).HasPrecision(5, 4);
            modelBuilder.Entity<Card>().Property(c => c.DailyLimit).HasPrecision(18, 2);
            modelBuilder.Entity<Card>().Property(c => c.MonthlyLimit).HasPrecision(18, 2);
            modelBuilder.Entity<Card>().Property(c => c.SpentToday).HasPrecision(18, 2);
            modelBuilder.Entity<Card>().Property(c => c.SpentThisMonth).HasPrecision(18, 2);
        }
    }
}
