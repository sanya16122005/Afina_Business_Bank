using Backend.Data;
using Backend.Hubs;
using Backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// ===== CORS =====
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:3000",
                "http://localhost:3001")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ===== Controllers =====
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddOpenApi();

// ===== Database =====
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"));
    options.ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning));
});

// ===== Redis =====
var redisConnection = builder.Configuration["Redis:Connection"] ?? "redis:6379";
try
{
    var redis = ConnectionMultiplexer.Connect(redisConnection);
    builder.Services.AddSingleton<IConnectionMultiplexer>(redis);
    builder.Services.AddSingleton<IRefreshTokenStore, RedisRefreshTokenStore>();
    Console.WriteLine($"Redis connected: {redisConnection}");
}
catch (Exception ex)
{
    Console.WriteLine($"Redis unavailable ({ex.Message}), refresh tokens will use PostgreSQL only.");
    // Fallback: refresh tokens останутся в PostgreSQL (таблица refresh_tokens)
    builder.Services.AddSingleton<IRefreshTokenStore>(sp =>
        throw new InvalidOperationException("Redis not available"));
}

// ===== JWT Authentication =====
// Жёсткое требование: ключ должен быть в конфиге (минимум 32 байта).
// Никаких дефолтов в коде — иначе клон репо имеет тот же секрет, что и прод.
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
{
    throw new InvalidOperationException(
        "Jwt:Key не задан. Добавь его в appsettings.json или переменную среды Jwt__Key (минимум 32 символа).");
}
if (jwtKey.Length < 32)
{
    throw new InvalidOperationException(
        $"Jwt:Key слишком короткий ({jwtKey.Length} символов). Минимум 32 — для HS256.");
}
var keyBytes = Encoding.UTF8.GetBytes(jwtKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "AfinaApp",
        ValidAudience = builder.Configuration["Jwt:Audience"] ?? "AfinaClient",
        IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
        ClockSkew = TimeSpan.Zero
    };

    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        },

        // Мгновенная блокировка: на каждом запросе проверяем, что
        // учётная запись ещё активна. Без этого заблокированный
        // пользователь работал бы по уже выданному токену до 60 мин.
        OnTokenValidated = async context =>
        {
            var sub = context.Principal?
                .FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

            if (!Guid.TryParse(sub, out var uid))
            {
                context.Fail("Invalid token subject");
                return;
            }

            var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var isActive = await db.Users
                .Where(u => u.Id == uid)
                .Select(u => (bool?)u.IsActive)
                .FirstOrDefaultAsync();

            if (isActive != true)
                context.Fail("Account is blocked or no longer exists");
        }
    };
});

builder.Services.AddAuthorization();

// ===== Rate Limiting =====
// Защита от brute-force: 8 попыток с одного IP за 1 минуту на auth-эндпоинты.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers["Retry-After"] = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            title = "Too many requests",
            status = 429,
            detail = "Слишком много попыток. Повторите через минуту.",
            timestamp = DateTime.UtcNow,
        }, cancellationToken);
    };

    options.AddPolicy("auth-strict", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 8,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

// ===== SignalR =====
builder.Services.AddSignalR();

// ===== Services =====
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<IAccountNumberService, AccountNumberService>();
builder.Services.AddScoped<ITransactionService, TransactionService>();
builder.Services.AddScoped<ILegalEmployerTransferService, LegalEmployerTransferService>();
builder.Services.AddScoped<ISalaryAutopayProcessor, SalaryAutopayProcessor>();
builder.Services.AddSingleton<ILlmService, OllamaLlmService>();
builder.Services.AddSingleton<IFraudDetectionService, FraudDetectionService>();
builder.Services.AddHostedService<LlmWarmupHostedService>();
builder.Services.AddHostedService<SalaryAutopayHostedService>();

var app = builder.Build();

// ===== Apply Migrations =====
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    for (var i = 0; i < 10; i++)
    {
        try
        {
            db.Database.Migrate();
            Console.WriteLine("Database migrations applied successfully.");
            break;
        }
        catch (Npgsql.NpgsqlException ex) when (i < 9)
        {
            var isConnection = ex.Message?.Contains("Connection refused", StringComparison.OrdinalIgnoreCase) == true
                || ex.InnerException?.Message?.Contains("Connection refused", StringComparison.OrdinalIgnoreCase) == true;
            if (!isConnection) throw;
            Console.WriteLine($"Waiting for PostgreSQL... attempt {i + 1}/10");
            Thread.Sleep(2000);
        }
    }

    // Seed or normalize the built-in test accounts so the documented credentials always work.
    var testUsers = new[]
    {
        new
        {
            Email = "admin@afina-bank.demo",
            Password = "AdminSecurePass123!",
            FirstName = "Афина",
            LastName = "Админ",
            PhoneNumber = "+79001112233",
            Role = "Admin",
            IsVerified = true,
            TwoFactorEnabled = false
        },
        new
        {
            Email = "cashier@afina-bank.demo",
            Password = "CashierSecurePass123!",
            FirstName = "Мария",
            LastName = "Кассир",
            PhoneNumber = "+79002223344",
            Role = "Cashier",
            IsVerified = true,
            TwoFactorEnabled = false
        }
    };

    foreach (var testUser in testUsers)
    {
        var user = db.Users.FirstOrDefault(u => u.Email == testUser.Email);

        if (user == null)
        {
            user = new Backend.Models.User
            {
                Id = Guid.NewGuid(),
                Email = testUser.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(testUser.Password),
                FirstName = testUser.FirstName,
                LastName = testUser.LastName,
                PhoneNumber = testUser.PhoneNumber,
                Role = testUser.Role,
                IsActive = true,
                IsVerified = testUser.IsVerified,
                TwoFactorEnabled = testUser.TwoFactorEnabled,
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            db.Users.Add(user);
        }
        else
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(testUser.Password);
            user.FirstName = testUser.FirstName;
            user.LastName = testUser.LastName;
            user.PhoneNumber = testUser.PhoneNumber;
            user.Role = testUser.Role;
            user.IsActive = true;
            user.IsVerified = testUser.IsVerified;
            user.TwoFactorEnabled = testUser.TwoFactorEnabled;
            user.UpdatedAt = DateTimeOffset.Now;
        }

        if (!db.UserSettings.Any(s => s.UserId == user.Id))
        {
            db.UserSettings.Add(new Backend.Models.UserSettings { Id = Guid.NewGuid(), UserId = user.Id });
        }
    }

    db.SaveChanges();
    Console.WriteLine("Seeded or normalized admin and cashier test accounts.");


    // Разовая идемпотентная нормализация старых юрлиц: форма (ООО/ИП/…)
    // больше не дублируется в названии — выносим её в OwnershipForm,
    // а из CompanyName убираем префикс формы и кавычки.
    var knownForms = new[] { "ПАО", "НАО", "ЗАО", "ОАО", "ООО", "НКО", "КФХ", "АО", "ИП", "ПК" };
    var legalClients = db.Clients.Where(c => c.ClientType == "Legal").ToList();
    var normalizedCount = 0;

    foreach (var c in legalClients)
    {
        var name = (c.CompanyName ?? "").Trim();
        if (name.Length == 0) continue;

        var form = (c.OwnershipForm ?? "").Trim();

        // Если форма не задана — пытаемся вытащить её из начала названия.
        if (form.Length == 0)
        {
            form = knownForms.FirstOrDefault(f =>
                name.StartsWith(f + " ", StringComparison.OrdinalIgnoreCase)
                || name.StartsWith(f + " «", StringComparison.OrdinalIgnoreCase)
                || name.StartsWith(f + " \"", StringComparison.OrdinalIgnoreCase)) ?? "";
        }

        var changed = false;

        // Срезаем дублирующийся префикс формы из названия.
        if (form.Length > 0 && name.StartsWith(form, StringComparison.OrdinalIgnoreCase))
        {
            var rest = name.Substring(form.Length).TrimStart(' ', ' ');
            if (rest.Length > 0)
            {
                name = rest;
                changed = true;
            }
        }

        // Убираем обрамляющие кавычки « » или " " / ' '.
        var unq = name;
        if (unq.Length >= 2
            && ((unq[0] == '«' && unq[^1] == '»')
                || (unq[0] == '"' && unq[^1] == '"')
                || (unq[0] == '\'' && unq[^1] == '\'')))
        {
            unq = unq[1..^1].Trim();
        }
        if (unq != name) { name = unq; changed = true; }

        if (form.Length > 0 && !string.Equals(form, c.OwnershipForm, StringComparison.Ordinal))
        {
            c.OwnershipForm = form;
            changed = true;
        }
        if (changed && name != (c.CompanyName ?? "").Trim())
        {
            c.CompanyName = name;
        }
        if (changed)
        {
            c.UpdatedAt = DateTimeOffset.Now;
            normalizedCount++;
        }
    }

    if (normalizedCount > 0)
    {
        db.SaveChanges();
        Console.WriteLine($"Normalized {normalizedCount} legal client name(s): form moved out of CompanyName.");
    }
}

// LLM-прогрев теперь в фоне через LlmWarmupHostedService — старт сервера не блокируется.

// ===== Security Headers (Anti-scraping) =====
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'";
    await next();
});

// ===== Middleware Pipeline =====
app.UseCors("AllowFrontend");

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapHub<FraudHub>("/hubs/fraud");

app.Run();
