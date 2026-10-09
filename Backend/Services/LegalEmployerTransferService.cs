using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Backend.Utilities;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services
{
    public enum BankTransferOutcome
    {
        Completed,
        PendingFraud,
        Failed,
    }

    public record BankTransferResult(
        BankTransferOutcome Outcome,
        string? ErrorDetail,
        int? HttpStatus,
        object? Body);

    public interface ILegalEmployerTransferService
    {
        /// <summary>Выполняет перевод для ролей Customer или LegalEntity (как POST /api/transactions/transfer).</summary>
        Task<BankTransferResult> ExecuteTransferAsync(
            Guid userId,
            string userRole,
            TransferRequest req,
            string? userFullName,
            string? ipAddress,
            CancellationToken cancellationToken = default);
    }

    public class LegalEmployerTransferService : ILegalEmployerTransferService
    {
        private readonly AppDbContext _db;
        private readonly ITransactionService _txnService;
        private readonly IFraudDetectionService _fraudService;
        private readonly IAuditService _audit;

        public LegalEmployerTransferService(
            AppDbContext db,
            ITransactionService txnService,
            IFraudDetectionService fraudService,
            IAuditService audit)
        {
            _db = db;
            _txnService = txnService;
            _fraudService = fraudService;
            _audit = audit;
        }

        public async Task<BankTransferResult> ExecuteTransferAsync(
            Guid userId,
            string userRole,
            TransferRequest req,
            string? userFullName,
            string? ipAddress,
            CancellationToken cancellationToken = default)
        {
            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId, cancellationToken);
            if (client == null)
                return new BankTransferResult(BankTransferOutcome.Failed, "Client profile not found", 401, null);
            if (client.Status != "Active")
                return new BankTransferResult(BankTransferOutcome.Failed, "Client is blocked", 409, null);

            var fromAccount = await _db.Accounts
                .Include(a => a.Client)
                .FirstOrDefaultAsync(a => a.Id == req.FromAccountId && a.ClientId == client.Id, cancellationToken);

            if (string.IsNullOrWhiteSpace(req.ToAccountNumber) && string.IsNullOrWhiteSpace(req.ToPhoneNumber))
                return new BankTransferResult(BankTransferOutcome.Failed, "Recipient account number or phone number is required", 400, null);

            var toAccount = await RecipientLookupHelper.ResolveRecipientAccountAsync(
                _db, req.ToAccountNumber, req.ToPhoneNumber);

            if (fromAccount == null)
                return new BankTransferResult(BankTransferOutcome.Failed, "Source account not found", 404, null);
            if (fromAccount.Status != "Active")
                return new BankTransferResult(BankTransferOutcome.Failed, "Source account is not active", 400, null);
            if (toAccount == null)
            {
                var recipientLabel = !string.IsNullOrWhiteSpace(req.ToPhoneNumber)
                    ? $"phone number '{req.ToPhoneNumber}'"
                    : $"number '{req.ToAccountNumber}'";
                return new BankTransferResult(BankTransferOutcome.Failed, $"Account with {recipientLabel} not found", 404, null);
            }
            if (toAccount.Status != "Active")
                return new BankTransferResult(BankTransferOutcome.Failed, "Recipient account is not active", 409, null);
            if (toAccount.Client?.Status != "Active")
                return new BankTransferResult(BankTransferOutcome.Failed, "Recipient client is blocked", 409, null);

            if (!string.Equals(req.Currency, fromAccount.Currency, StringComparison.OrdinalIgnoreCase))
            {
                return new BankTransferResult(BankTransferOutcome.Failed,
                    "Валюта операции должна совпадать с валютой счёта списания", 400, null);
            }

            if (!string.Equals(fromAccount.Currency, toAccount.Currency, StringComparison.OrdinalIgnoreCase))
            {
                return new BankTransferResult(BankTransferOutcome.Failed,
                    "Перевод между счетами в разных валютах невозможен", 400, null);
            }

            string? incomeKindCode = null;
            if (userRole == "LegalEntity")
            {
                if (client.ClientType != "Legal")
                    return new BankTransferResult(BankTransferOutcome.Failed, "Профиль не является организацией", 409, null);
                if (!IncomeKindCodeHelper.IsValid(req.IncomeKindCode))
                    return new BankTransferResult(BankTransferOutcome.Failed,
                        "Для выплаты сотруднику укажите код вида дохода (КВД): 2000, 2001, 2002, 2003, 2006, 2010, 2012, 2013, 2300 или 2530",
                        400,
                        new
                        {
                            errors = new { incomeKindCode = new[] { "Обязательное поле для юридического лица" } }
                        });
                var isEmployee = await _db.EmployerEmployees.AnyAsync(e =>
                    e.EmployerClientId == client.Id
                    && e.EmployeeClientId == toAccount.ClientId
                    && e.IsActive, cancellationToken);
                if (!isEmployee)
                    return new BankTransferResult(BankTransferOutcome.Failed, "Перевод возможен только на счёт назначенного сотрудника", 400, null);
                incomeKindCode = req.IncomeKindCode!.Trim();
            }
            else if (userRole == "Customer")
            {
                // КВД (код вида дохода) — атрибут выплат юрлица/работодателя.
                // Обычный перевод физлица его не несёт, даже если код пришёл
                // в запросе, иначе у получателя-физлица всплывает «юрлицовая»
                // плашка назначения перевода.
                incomeKindCode = null;
            }
            else
                return new BankTransferResult(BankTransferOutcome.Failed, "Forbidden", 403, null);

            var feeCalc = _txnService.CalculateFee(fromAccount, req.Amount, "Transfer");
            var totalDebit = req.Amount + feeCalc.FeeAmount;

            if (fromAccount.SubType != "Credit" && fromAccount.AvailableBalance < totalDebit)
            {
                return new BankTransferResult(BankTransferOutcome.Failed, "Insufficient funds for this transaction", 422, new
                {
                    title = "Insufficient Funds",
                    status = 422,
                    detail = "Insufficient funds for this transaction",
                    errors = new { amount = new[] { $"Requested amount {totalDebit:F2} {req.Currency} exceeds available balance {fromAccount.AvailableBalance:F2} {req.Currency}" } },
                    context = new { requestedAmount = totalDebit, availableBalance = fromAccount.AvailableBalance, currency = req.Currency, accountNumber = fromAccount.AccountNumber },
                    timestamp = DateTime.UtcNow
                });
            }

            var description = userRole == "LegalEntity"
                ? (string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim())
                : null;

            var transaction = new Transaction
            {
                Id = Guid.NewGuid(),
                Reference = _txnService.GenerateReference(),
                Type = "Transfer",
                Status = "Completed",
                Amount = req.Amount,
                Currency = req.Currency,
                Description = description,
                FromAccountId = fromAccount.Id,
                ToAccountId = toAccount.Id,
                Fee = feeCalc.FeeAmount,
                FeePercent = feeCalc.FeePercent,
                FeeReason = feeCalc.FeeReason,
                IncomeKindCode = incomeKindCode,
                CreatedAt = DateTime.UtcNow,
                CompletedAt = DateTime.UtcNow
            };

            _db.Transactions.Add(transaction);

            var isOwnAccountsTransfer = fromAccount.ClientId == toAccount.ClientId;

            if (isOwnAccountsTransfer)
            {
                fromAccount.Balance -= totalDebit;
                fromAccount.AvailableBalance -= totalDebit;
                toAccount.Balance += req.Amount;
                toAccount.AvailableBalance += req.Amount;
                transaction.BalanceAfter = fromAccount.Balance;
                fromAccount.LastTransactionAt = DateTime.UtcNow;
                toAccount.LastTransactionAt = DateTime.UtcNow;
                if (fromAccount.AccountType == "Savings") fromAccount.IsFirstWithdrawal = false;
                await _db.SaveChangesAsync(cancellationToken);

                var auditRoleOwn = userRole == "LegalEntity" ? "LegalEntity" : "Customer";
                await _audit.LogAsync(userId, userFullName ?? client.FullName, auditRoleOwn,
                    "Transfer", $"Account {fromAccount.AccountNumber}", fromAccount.Id, "Success",
                    $"Own accounts: {req.Amount} {req.Currency} -> {toAccount.AccountNumber}",
                    req, ipAddress);

                return new BankTransferResult(BankTransferOutcome.Completed, null, 201, new
                {
                    id = transaction.Id,
                    type = transaction.Type,
                    status = transaction.Status,
                    amount = transaction.Amount,
                    currency = transaction.Currency,
                    fromAccount = new { id = fromAccount.Id, accountNumber = fromAccount.AccountNumber, balanceAfter = fromAccount.Balance },
                    toAccount = new { accountNumber = toAccount.AccountNumber, ownerName = toAccount.Client?.FullName },
                    fee = transaction.Fee,
                    reference = transaction.Reference,
                    createdAt = transaction.CreatedAt,
                    completedAt = transaction.CompletedAt,
                    message = "Transfer completed successfully",
                });
            }

            await _db.SaveChangesAsync(cancellationToken);

            var fraudResult = await _fraudService.CheckTransactionAsync(transaction, fromAccount);

            if (fraudResult.IsSuspicious)
            {
                transaction.Status = "Pending";
                fromAccount.HoldAmount += totalDebit;
                fromAccount.AvailableBalance -= totalDebit;
                await _db.SaveChangesAsync(cancellationToken);

                return new BankTransferResult(BankTransferOutcome.PendingFraud, null, 202, new
                {
                    id = transaction.Id,
                    type = transaction.Type,
                    status = "Pending",
                    amount = transaction.Amount,
                    currency = transaction.Currency,
                    description = transaction.Description,
                    anomalyType = fraudResult.AnomalyType,
                    riskScore = fraudResult.RiskScore,
                    triggerReason = fraudResult.TriggerReason,
                    triggerReasonFull = fraudResult.TriggerReasonFull,
                    message = "Transaction is under review by fraud detection system"
                });
            }

            fromAccount.Balance -= totalDebit;
            fromAccount.AvailableBalance -= totalDebit;
            toAccount.Balance += req.Amount;
            toAccount.AvailableBalance += req.Amount;

            transaction.BalanceAfter = fromAccount.Balance;
            fromAccount.LastTransactionAt = DateTime.UtcNow;
            toAccount.LastTransactionAt = DateTime.UtcNow;

            if (fromAccount.Balance < 0) fromAccount.Client.IsDebtor = true;
            if (fromAccount.AccountType == "Savings") fromAccount.IsFirstWithdrawal = false;

            await _db.SaveChangesAsync(cancellationToken);

            var auditRole = userRole == "LegalEntity" ? "LegalEntity" : "Customer";
            await _audit.LogAsync(userId, userFullName ?? client.FullName, auditRole,
                "Transfer", $"Account {fromAccount.AccountNumber}", fromAccount.Id, "Success",
                $"Amount: {req.Amount} {req.Currency} -> {toAccount.AccountNumber}",
                req, ipAddress);

            return new BankTransferResult(BankTransferOutcome.Completed, null, 201, new
            {
                id = transaction.Id,
                type = transaction.Type,
                status = transaction.Status,
                amount = transaction.Amount,
                currency = transaction.Currency,
                description = transaction.Description,
                fromAccount = new { id = fromAccount.Id, accountNumber = fromAccount.AccountNumber, balanceAfter = fromAccount.Balance },
                toAccount = new { accountNumber = toAccount.AccountNumber, ownerName = toAccount.Client?.FullName },
                fee = transaction.Fee,
                reference = transaction.Reference,
                incomeKindCode = transaction.IncomeKindCode,
                createdAt = transaction.CreatedAt,
                completedAt = transaction.CompletedAt,
                message = "Transfer completed successfully"
            });
        }
    }
}
