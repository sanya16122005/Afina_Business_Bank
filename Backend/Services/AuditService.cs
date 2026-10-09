using Backend.Data;
using Backend.Models;
using System.Text.Json;

namespace Backend.Services
{
    public interface IAuditService
    {
        Task LogAsync(Guid? userId, string? userFullName, string? role,
            string actionType, string? targetObject, Guid? targetObjectId,
            string result, string? details = null, object? requestPayload = null,
            string? ipAddress = null, string? userAgent = null);
    }

    public class AuditService : IAuditService
    {
        private readonly AppDbContext _db;

        public AuditService(AppDbContext db)
        {
            _db = db;
        }

        public async Task LogAsync(Guid? userId, string? userFullName, string? role,
            string actionType, string? targetObject, Guid? targetObjectId,
            string result, string? details = null, object? requestPayload = null,
            string? ipAddress = null, string? userAgent = null)
        {
            var audit = new AuditLog
            {
                Id = $"audit-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid().ToString()[..8]}",
                UserId = userId,
                UserFullName = userFullName,
                Role = role,
                ActionType = actionType,
                TargetObject = targetObject,
                TargetObjectId = targetObjectId,
                Result = result,
                Details = details,
                RequestPayload = requestPayload != null
                    ? JsonSerializer.Serialize(requestPayload, new JsonSerializerOptions { WriteIndented = false })
                    : null,
                IpAddress = ipAddress,
                UserAgent = userAgent,
                CreatedAt = DateTime.UtcNow
            };

            _db.AuditLogs.Add(audit);
            await _db.SaveChangesAsync();
        }
    }
}
