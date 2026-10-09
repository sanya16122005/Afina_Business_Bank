using StackExchange.Redis;
using System.Text.Json;

namespace Backend.Services
{
    public interface IRefreshTokenStore
    {
        Task SaveAsync(Guid token, Guid userId, TimeSpan expiry);
        Task<Guid?> GetUserIdAsync(Guid token);
        Task RevokeAsync(Guid token);
    }
    public class RedisRefreshTokenStore : IRefreshTokenStore
    {
        private readonly IConnectionMultiplexer _redis;
        private readonly ILogger<RedisRefreshTokenStore> _logger;
        private const string KeyPrefix = "refresh:";

        public RedisRefreshTokenStore(IConnectionMultiplexer redis, ILogger<RedisRefreshTokenStore> logger)
        {
            _redis = redis;
            _logger = logger;
        }

        public async Task SaveAsync(Guid token, Guid userId, TimeSpan expiry)
        {
            try
            {
                var db = _redis.GetDatabase();
                var key = $"{KeyPrefix}{token}";
                await db.StringSetAsync(key, userId.ToString(), expiry);
                _logger.LogDebug("Refresh token saved to Redis: {Token}", token);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to save refresh token to Redis");
                throw;
            }
        }

        public async Task<Guid?> GetUserIdAsync(Guid token)
        {
            try
            {
                var db = _redis.GetDatabase();
                var key = $"{KeyPrefix}{token}";
                var value = await db.StringGetAsync(key);

                if (value.IsNullOrEmpty) return null;

                return Guid.Parse(value.ToString());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get refresh token from Redis");
                return null;
            }
        }

        public async Task RevokeAsync(Guid token)
        {
            try
            {
                var db = _redis.GetDatabase();
                var key = $"{KeyPrefix}{token}";
                await db.KeyDeleteAsync(key);
                _logger.LogDebug("Refresh token revoked in Redis: {Token}", token);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to revoke refresh token in Redis");
            }
        }
    }
}
