using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Backend.Data;
using Backend.Models;
using Backend.DTOs;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IConfiguration _config;
        private readonly IEmailService _emailService;
        private readonly IAuditService _audit;
        private readonly IRefreshTokenStore? _redisTokenStore;

        public AuthController(AppDbContext db, IConfiguration config,
            IEmailService emailService, IAuditService audit,
            IServiceProvider serviceProvider)
        {
            _db = db;
            _config = config;
            _emailService = emailService;
            _audit = audit;
            // Redis может быть недоступен — берём через try
            try { _redisTokenStore = serviceProvider.GetService<IRefreshTokenStore>(); }
            catch { _redisTokenStore = null; }
        }

        // POST /api/auth/register
        [HttpPost("register")]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            var errors = new Dictionary<string, string[]>();

            // Нормализуем e-mail так же, как register-legal и как LoginPage его
            // шлёт (trim + lower). Иначе «User@X» при регистрации и «user@x» при
            // входе не совпадали (логин регистрозависим) — пользователь не мог
            // войти, а проверка уникальности пропускала дубли в разном регистре.
            var email = req.Email?.Trim().ToLowerInvariant() ?? "";

            if (string.IsNullOrWhiteSpace(email))
                errors["email"] = new[] { "Email is required" };
            else if (await _db.Users.AnyAsync(u => u.Email == email))
                errors["email"] = new[] { "Email already exists" };
            else if (await _db.Clients.AnyAsync(c => c.Email == email))
                errors["email"] = new[] { "Email already exists" };

            var passwordError = ValidatePasswordComplexity(req.Password);
            if (passwordError != null)
                errors["password"] = new[] { passwordError };

            if (req.Password != req.ConfirmPassword)
                errors["confirmPassword"] = new[] { "Passwords do not match" };

            if (!string.IsNullOrEmpty(req.PhoneNumber) && !System.Text.RegularExpressions.Regex
                    .IsMatch(req.PhoneNumber, @"^\+?[0-9]{10,15}$"))
                errors["phoneNumber"] = new[] { "Invalid phone number format" };
            else if (!string.IsNullOrEmpty(req.PhoneNumber) && await _db.Clients.AnyAsync(c => c.PhoneNumber == req.PhoneNumber))
                errors["phoneNumber"] = new[] { "Phone number already exists" };

            if (errors.Count > 0)
                return BadRequest(new
                {
                    type = "https://tools.ietf.org/html/rfc7231#section-6.5.1",
                    title = "Validation failed",
                    status = 400,
                    detail = "One or more validation errors occurred.",
                    errors,
                    timestamp = DateTime.UtcNow
                });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                FirstName = req.FirstName?.Trim(),
                LastName = req.LastName?.Trim(),
                PhoneNumber = req.PhoneNumber,
                DateOfBirth = req.DateOfBirth.HasValue
                    ? DateTime.SpecifyKind(req.DateOfBirth.Value.Date, DateTimeKind.Utc)
                    : null,
                Role = "Customer",
                IsActive = true,
                IsVerified = false,
                TwoFactorEnabled = true,
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            _db.Users.Add(user);
            _db.UserSettings.Add(new UserSettings { Id = Guid.NewGuid(), UserId = user.Id });
            _db.Clients.Add(new Client
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                ClientType = "Individual",
                FirstName = user.FirstName,
                LastName = user.LastName,
                PhoneNumber = user.PhoneNumber,
                Email = user.Email,
                Status = "Active",
                IsDebtor = false,
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(user.Id, user.FullName, user.Role,
                "Register", "User", user.Id, "Success",
                $"New user registered: {user.Email}",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent: Request.Headers.UserAgent.ToString());

            return StatusCode(201, new
            {
                userId = user.Id,
                email = user.Email,
                firstName = user.FirstName,
                lastName = user.LastName,
                role = user.Role,
                message = "Registration successful",
                createdAt = user.CreatedAt
            });
        }

        // POST /api/auth/register-legal — регистрация представителя юрлица / ИП
        [HttpPost("register-legal")]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> RegisterLegal([FromBody] RegisterLegalEntityRequest req)
        {
            var errors = new Dictionary<string, string[]>();

            var email = req.Email?.Trim().ToLowerInvariant() ?? "";

            if (string.IsNullOrWhiteSpace(email))
                errors["email"] = new[] { "Email is required" };
            else if (await _db.Users.AnyAsync(u => u.Email == email))
                errors["email"] = new[] { "Email already exists" };
            else if (await _db.Clients.AnyAsync(c => c.Email == email))
                errors["email"] = new[] { "Email already exists" };

            var passwordError = ValidatePasswordComplexity(req.Password);
            if (passwordError != null)
                errors["password"] = new[] { passwordError };

            if (req.Password != req.ConfirmPassword)
                errors["confirmPassword"] = new[] { "Passwords do not match" };

            if (!string.IsNullOrEmpty(req.PhoneNumber) && !System.Text.RegularExpressions.Regex
                    .IsMatch(req.PhoneNumber, @"^\+?[0-9]{10,15}$"))
                errors["phoneNumber"] = new[] { "Invalid phone number format" };
            else if (!string.IsNullOrEmpty(req.PhoneNumber) && await _db.Clients.AnyAsync(c => c.PhoneNumber == req.PhoneNumber))
                errors["phoneNumber"] = new[] { "Phone number already exists" };

            if (string.IsNullOrWhiteSpace(req.CompanyName))
                errors["companyName"] = new[] { "Укажите наименование организации или ИП" };
            if (string.IsNullOrWhiteSpace(req.OwnershipForm))
                errors["ownershipForm"] = new[] { "Укажите форму собственности (например ИП или ООО)" };
            if (string.IsNullOrWhiteSpace(req.DirectorFirstName))
                errors["directorFirstName"] = new[] { "Укажите имя представителя" };
            if (string.IsNullOrWhiteSpace(req.DirectorLastName))
                errors["directorLastName"] = new[] { "Укажите фамилию представителя" };

            if (errors.Count > 0)
                return BadRequest(new
                {
                    type = "https://tools.ietf.org/html/rfc7231#section-6.5.1",
                    title = "Validation failed",
                    status = 400,
                    detail = "One or more validation errors occurred.",
                    errors,
                    timestamp = DateTime.UtcNow
                });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                FirstName = req.DirectorFirstName.Trim(),
                LastName = req.DirectorLastName.Trim(),
                PhoneNumber = req.PhoneNumber,
                DateOfBirth = req.DateOfBirth.HasValue
                    ? DateTime.SpecifyKind(req.DateOfBirth.Value.Date, DateTimeKind.Utc)
                    : null,
                Role = "LegalEntity",
                IsActive = true,
                IsVerified = false,
                TwoFactorEnabled = true,
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            var directorFullName = $"{user.LastName} {user.FirstName}".Trim();

            _db.Users.Add(user);
            _db.UserSettings.Add(new UserSettings { Id = Guid.NewGuid(), UserId = user.Id });
            _db.Clients.Add(new Client
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                ClientType = "Legal",
                CompanyName = req.CompanyName.Trim(),
                LegalAddress = string.IsNullOrWhiteSpace(req.LegalAddress) ? null : req.LegalAddress.Trim(),
                OwnershipForm = req.OwnershipForm.Trim(),
                DirectorFullName = directorFullName,
                PhoneNumber = user.PhoneNumber,
                Email = user.Email,
                Status = "Active",
                IsDebtor = false,
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(user.Id, user.FullName, user.Role,
                "RegisterLegal", "User", user.Id, "Success",
                $"Legal entity registered: {req.CompanyName}, {user.Email}",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent: Request.Headers.UserAgent.ToString());

            return StatusCode(201, new
            {
                userId = user.Id,
                email = user.Email,
                firstName = user.FirstName,
                lastName = user.LastName,
                role = user.Role,
                companyName = req.CompanyName.Trim(),
                message = "Регистрация организации успешна",
                createdAt = user.CreatedAt
            });
        }

        // POST /api/auth/login
        [HttpPost("login")]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email);

            if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            {
                
                if (user != null)
                {
                    _db.LoginHistories.Add(new LoginHistory
                    {
                        Id = Guid.NewGuid(),
                        UserId = user.Id,
                        IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                        UserAgent = Request.Headers.UserAgent.ToString(),
                        Status = "Failed",
                        CreatedAt = DateTime.UtcNow
                    });
                    await _db.SaveChangesAsync();
                }

                return Unauthorized(new
                {
                    type = "https://tools.ietf.org/html/rfc7235#section-3.1",
                    title = "Unauthorized",
                    status = 401,
                    detail = "Invalid email or password",
                    timestamp = DateTime.UtcNow
                });
            }

            if (!user.IsActive)
                return Unauthorized(new
                {
                    title = "Unauthorized", status = 401,
                    detail = "Account is blocked",
                    timestamp = DateTime.UtcNow
                });

            
            if (user.TwoFactorEnabled)
            {
                var codeLength = int.Parse(_config["TwoFactor:CodeLength"] ?? "6");
                var codeExpiry = int.Parse(_config["TwoFactor:CodeExpirationMinutes"] ?? "5");

                var code = GenerateNumericCode(codeLength);
                var pendingToken = Guid.NewGuid();

                user.TwoFactorCode = BCrypt.Net.BCrypt.HashPassword(code);
                user.TwoFactorCodeExpiry = DateTime.UtcNow.AddMinutes(codeExpiry);
                user.PendingLoginToken = pendingToken;
                await _db.SaveChangesAsync();

                
                await _emailService.SendTwoFactorCodeAsync(user.Email, code);

                return Ok(new
                {
                    requiresTwoFactor = true,
                    pendingToken,
                    message = "Two-factor code sent to your email",
                    expiresInMinutes = codeExpiry
                });
            }

           
            return await CompleteLoginAsync(user);
        }

        // POST /api/auth/verify-2fa
        [HttpPost("verify-2fa")]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> VerifyTwoFactor([FromBody] TwoFactorVerifyRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.PendingLoginToken == req.PendingToken);

            if (user == null)
                return Unauthorized(new { detail = "Invalid verification token", timestamp = DateTime.UtcNow });

            if (user.TwoFactorCodeExpiry < DateTime.UtcNow)
            {
                user.TwoFactorCode = null;
                user.TwoFactorCodeExpiry = null;
                user.PendingLoginToken = null;
                await _db.SaveChangesAsync();
                return Unauthorized(new { detail = "Verification code has expired", timestamp = DateTime.UtcNow });
            }

            if (!BCrypt.Net.BCrypt.Verify(req.Code, user.TwoFactorCode))
                return Unauthorized(new { detail = "Invalid verification code", timestamp = DateTime.UtcNow });

            
            user.TwoFactorCode = null;
            user.TwoFactorCodeExpiry = null;
            user.PendingLoginToken = null;
            await _db.SaveChangesAsync();

            return await CompleteLoginAsync(user);
        }

        // POST /api/auth/resend-2fa
        [HttpPost("resend-2fa")]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> ResendTwoFactor([FromBody] ResendTwoFactorRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.PendingLoginToken == req.PendingToken);
            if (user == null)
                return NotFound(new { detail = "Invalid token" });

            var codeLength = int.Parse(_config["TwoFactor:CodeLength"] ?? "6");
            var codeExpiry = int.Parse(_config["TwoFactor:CodeExpirationMinutes"] ?? "5");
            var code = GenerateNumericCode(codeLength);

            user.TwoFactorCode = BCrypt.Net.BCrypt.HashPassword(code);
            user.TwoFactorCodeExpiry = DateTime.UtcNow.AddMinutes(codeExpiry);
            await _db.SaveChangesAsync();

            await _emailService.SendTwoFactorCodeAsync(user.Email, code);

            return Ok(new { message = "New code sent", expiresInMinutes = codeExpiry });
        }

        // POST /api/auth/refresh
        [HttpPost("refresh")]
        public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
        {
            User? user = null;

            // Пробуем Redis
            if (_redisTokenStore != null)
            {
                var userId = await _redisTokenStore.GetUserIdAsync(req.RefreshToken);
                if (userId.HasValue)
                {
                    await _redisTokenStore.RevokeAsync(req.RefreshToken);
                    user = await _db.Users.FindAsync(userId.Value);
                }
            }

            // Fallback на PostgreSQL
            if (user == null)
            {
                var dbToken = await _db.RefreshTokens
                    .Include(t => t.User)
                    .FirstOrDefaultAsync(t => t.Token == req.RefreshToken && !t.IsRevoked);

                if (dbToken == null || dbToken.ExpiresAt < DateTime.UtcNow)
                    return Unauthorized(new
                    {
                        type = "https://tools.ietf.org/html/rfc7235#section-3.1",
                        title = "Unauthorized", status = 401,
                        detail = "Refresh token is invalid or expired",
                        timestamp = DateTime.UtcNow
                    });

                dbToken.IsRevoked = true;
                user = dbToken.User;
            }

            if (user == null)
                return Unauthorized(new { detail = "Refresh token is invalid or expired" });

            // Заблокированный пользователь не должен продлевать сессию.
            // Без этой проверки блок админом не завершал активную сессию —
            // пользователь молча рефрешил токен до истечения refresh (7 дней).
            if (!user.IsActive)
            {
                await _db.SaveChangesAsync(); // фиксируем отзыв предъявленного токена
                return Unauthorized(new
                {
                    title = "Unauthorized", status = 401,
                    detail = "Учётная запись заблокирована",
                    timestamp = DateTime.UtcNow
                });
            }

            var newRefreshToken = Guid.NewGuid();
            var refreshDays = int.Parse(_config["Jwt:RefreshTokenExpiresInDays"] ?? "7");

            // Сохраняем новый refresh token в Redis + PostgreSQL
            if (_redisTokenStore != null)
            {
                await _redisTokenStore.SaveAsync(newRefreshToken, user.Id, TimeSpan.FromDays(refreshDays));
            }

            _db.RefreshTokens.Add(new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Token = newRefreshToken,
                ExpiresAt = DateTime.UtcNow.AddDays(refreshDays)
            });
            await _db.SaveChangesAsync();

            return Ok(new
            {
                token = GenerateJwtToken(user),
                refreshToken = newRefreshToken,
                expiresIn = int.Parse(_config["Jwt:ExpiresInMinutes"] ?? "60") * 60,
                tokenType = "Bearer"
            });
        }

        // POST /api/auth/logout
        [HttpPost("logout")]
        public async Task<IActionResult> Logout([FromBody] LogoutRequest req)
        {
            // Удаляем из Redis
            if (_redisTokenStore != null)
            {
                await _redisTokenStore.RevokeAsync(req.RefreshToken);
            }

            // Удаляем из PostgreSQL
            var token = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.Token == req.RefreshToken);
            if (token != null)
            {
                token.IsRevoked = true;
                await _db.SaveChangesAsync();
            }
            return Ok(new { message = "Logged out successfully" });
        }

        // PUT /api/auth/change-password
        [Authorize]
        [HttpPut("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
        {
            var userId = GetCurrentUserId();
            var user = await _db.Users.FindAsync(userId);
            if (user == null) return NotFound();

            if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
                return BadRequest(new
                {
                    errors = new { currentPassword = new[] { "Current password is incorrect" } },
                    timestamp = DateTime.UtcNow
                });

            if (req.NewPassword != req.ConfirmNewPassword)
                return BadRequest(new
                {
                    errors = new { confirmNewPassword = new[] { "Passwords do not match" } },
                    timestamp = DateTime.UtcNow
                });

            var passwordError = ValidatePasswordComplexity(req.NewPassword);
            if (passwordError != null)
                return BadRequest(new
                {
                    errors = new { newPassword = new[] { passwordError } },
                    timestamp = DateTime.UtcNow
                });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            user.UpdatedAt = DateTimeOffset.Now;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(userId, user.FullName, user.Role,
                "ChangePassword", "User", userId, "Success",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

            return Ok(new { message = "Password changed successfully", updatedAt = user.UpdatedAt });
        }

        // GET /api/auth/login-history
        [Authorize]
        [HttpGet("login-history")]
        public async Task<IActionResult> GetLoginHistory(int page = 1, int pageSize = 10)
        {
            var userId = GetCurrentUserId();
            var query = _db.LoginHistories
                .Where(l => l.UserId == userId)
                .OrderByDescending(l => l.CreatedAt);

            var total = await query.CountAsync();
            var data = await query.Skip((page - 1) * pageSize).Take(pageSize)
                .Select(l => new
                {
                    id = l.Id,
                    ipAddress = l.IpAddress,
                    userAgent = l.UserAgent,
                    location = l.Location,
                    status = l.Status,
                    createdAt = l.CreatedAt
                })
                .ToListAsync();

            return Ok(new
            {
                data,
                meta = new PaginationMeta
                {
                    Total = total, Page = page, PageSize = pageSize
                }
            });
        }

        

        // POST /api/auth/forgot-password
        [HttpPost("forgot-password")]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
        {
            // Всегда возвращаем 200 чтобы не раскрывать существование email
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email);
            if (user == null)
                return Ok(new { message = "Если аккаунт существует, код отправлен на вашу почту" });

            var codeLength = int.Parse(_config["TwoFactor:CodeLength"] ?? "6");
            var codeExpiry = int.Parse(_config["TwoFactor:CodeExpirationMinutes"] ?? "5");
            var code = GenerateNumericCode(codeLength);

            user.PasswordResetCode = BCrypt.Net.BCrypt.HashPassword(code);
            user.PasswordResetCodeExpiry = DateTime.UtcNow.AddMinutes(codeExpiry);
            await _db.SaveChangesAsync();

            await _emailService.SendPasswordResetCodeAsync(user.Email, code);

            return Ok(new { message = "Если аккаунт существует, код отправлен на вашу почту", expiresInMinutes = codeExpiry });
        }

        // POST /api/auth/reset-password
        [HttpPost("reset-password")]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email);
            if (user == null)
                return BadRequest(new { detail = "Неверный email или код", timestamp = DateTime.UtcNow });

            if (string.IsNullOrEmpty(user.PasswordResetCode) || user.PasswordResetCodeExpiry == null)
                return BadRequest(new { detail = "Код сброса не был запрошен", timestamp = DateTime.UtcNow });

            if (user.PasswordResetCodeExpiry < DateTime.UtcNow)
            {
                user.PasswordResetCode = null;
                user.PasswordResetCodeExpiry = null;
                await _db.SaveChangesAsync();
                return BadRequest(new { detail = "Код сброса истёк. Запросите новый", timestamp = DateTime.UtcNow });
            }

            if (!BCrypt.Net.BCrypt.Verify(req.Code, user.PasswordResetCode))
                return BadRequest(new { detail = "Неверный код подтверждения", timestamp = DateTime.UtcNow });

            if (req.NewPassword != req.ConfirmNewPassword)
                return BadRequest(new { errors = new { confirmNewPassword = new[] { "Пароли не совпадают" } }, timestamp = DateTime.UtcNow });

            var passwordError = ValidatePasswordComplexity(req.NewPassword);
            if (passwordError != null)
                return BadRequest(new { errors = new { newPassword = new[] { passwordError } }, timestamp = DateTime.UtcNow });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            user.PasswordResetCode = null;
            user.PasswordResetCodeExpiry = null;
            user.UpdatedAt = DateTimeOffset.Now;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(user.Id, user.FullName, user.Role,
                "ResetPassword", "User", user.Id, "Success",
                "Password reset via email code",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

            return Ok(new { message = "Пароль успешно изменён", updatedAt = user.UpdatedAt });
        }

        private async Task<IActionResult> CompleteLoginAsync(User user)
        {
            user.LastLoginAt = DateTime.UtcNow;

            
            _db.LoginHistories.Add(new LoginHistory
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                UserAgent = Request.Headers.UserAgent.ToString(),
                Status = "Success",
                CreatedAt = DateTime.UtcNow
            });

            var refreshToken = Guid.NewGuid();
            var refreshDays = int.Parse(_config["Jwt:RefreshTokenExpiresInDays"] ?? "7");

            // Сохраняем refresh token в Redis (primary) и PostgreSQL (backup)
            if (_redisTokenStore != null)
            {
                await _redisTokenStore.SaveAsync(refreshToken, user.Id, TimeSpan.FromDays(refreshDays));
            }

            _db.RefreshTokens.Add(new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Token = refreshToken,
                ExpiresAt = DateTime.UtcNow.AddDays(refreshDays)
            });

            await _db.SaveChangesAsync();

            await _audit.LogAsync(user.Id, user.FullName, user.Role,
                "Login", "User", user.Id, "Success",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

            
            var permissions = GetPermissionsForRole(user.Role);

            var response = new Dictionary<string, object?>
            {
                ["token"] = GenerateJwtToken(user),
                ["refreshToken"] = refreshToken,
                ["expiresIn"] = int.Parse(_config["Jwt:ExpiresInMinutes"] ?? "60") * 60,
                ["tokenType"] = "Bearer",
                ["user"] = new
                {
                    id = user.Id,
                    email = user.Email,
                    firstName = user.FirstName,
                    lastName = user.LastName,
                    fullName = user.FullName,
                    phoneNumber = user.PhoneNumber,
                    role = user.Role,
                    isActive = user.IsActive,
                    isVerified = user.IsVerified,
                    createdAt = user.CreatedAt,
                    lastLoginAt = user.LastLoginAt
                }
            };

            if (permissions != null)
                ((IDictionary<string, object?>)response)["user"] = new
                {
                    id = user.Id,
                    email = user.Email,
                    firstName = user.FirstName,
                    lastName = user.LastName,
                    fullName = user.FullName,
                    phoneNumber = user.PhoneNumber,
                    role = user.Role,
                    permissions,
                    isActive = user.IsActive,
                    isVerified = user.IsVerified,
                    createdAt = user.CreatedAt,
                    lastLoginAt = user.LastLoginAt
                };

            return Ok(response);
        }

        private string[] ? GetPermissionsForRole(string role) => role switch
        {
            "Admin" => new[]
            {
                "users:read", "users:write", "users:delete",
                "accounts:read", "accounts:write",
                "transactions:read", "transactions:manage",
                "reports:read", "settings:manage",
                "fraud:read", "fraud:manage"
            },
            "Cashier" => new[]
            {
                "accounts:read", "accounts:open", "accounts:close",
                "transactions:read", "transactions:create",
                "deposits:create", "withdrawals:create", "transfers:create",
                "clients:read", "clients:write",
                "fraud:read", "fraud:manage",
                "sessions:manage"
            },
            _ => null
        };

        private string GenerateJwtToken(User user)
        {
            // Program.cs уже падает на старте, если Jwt:Key пуст — здесь дефолт не нужен.
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role),
                new Claim("firstName", user.FirstName),
                new Claim("lastName", user.LastName)
            };

            var expiresMinutes = int.Parse(_config["Jwt:ExpiresInMinutes"] ?? "60");

            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"] ?? "AfinaApp",
                audience: _config["Jwt:Audience"] ?? "AfinaClient",
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        // Возвращает текст ошибки или null, если пароль валиден.
        // Минимум 8 символов, хотя бы одна цифра, одна буква, один не-буквенно-цифровой символ.
        private static string? ValidatePasswordComplexity(string? password)
        {
            if (string.IsNullOrEmpty(password) || password.Length < 8)
                return "Пароль должен быть не короче 8 символов";
            if (!password.Any(char.IsDigit))
                return "Пароль должен содержать хотя бы одну цифру";
            if (!password.Any(char.IsLetter))
                return "Пароль должен содержать хотя бы одну букву";
            if (password.All(char.IsLetterOrDigit))
                return "Пароль должен содержать хотя бы один спецсимвол";
            return null;
        }

        private static string GenerateNumericCode(int length)
        {
            // Криптостойкий генератор — `new Random()` предсказуем по времени запуска.
            var digits = new char[length];
            for (var i = 0; i < length; i++)
            {
                digits[i] = (char)('0' + System.Security.Cryptography.RandomNumberGenerator.GetInt32(0, 10));
            }
            return new string(digits);
        }

        private Guid GetCurrentUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier);
            return Guid.Parse(claim!.Value);
        }
    }

    public record ResendTwoFactorRequest(Guid PendingToken);
}
