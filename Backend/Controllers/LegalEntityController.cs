using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Backend.Data;
using Backend.DTOs;
using Backend.Models;
using Backend.Services;
using Backend.Utilities;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/legal-entity")]
    [Authorize(Roles = "LegalEntity")]
    public class LegalEntityController : ControllerBase
    {
        private readonly AppDbContext _db;

        public LegalEntityController(AppDbContext db)
        {
            _db = db;
        }

        private Guid GetCurrentUserId() =>
            Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        private async Task<Client?> GetEmployerClientAsync()
        {
            var userId = GetCurrentUserId();
            return await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId && c.ClientType == "Legal");
        }

        // GET /api/legal-entity/employees
        [HttpGet("employees")]
        public async Task<IActionResult> GetEmployees()
        {
            var employer = await GetEmployerClientAsync();
            if (employer == null)
                return Ok(new
                {
                    data = Array.Empty<object>(),
                    meta = new { profileMissing = true, detail = "Профиль организации не найден. Зарегистрируйтесь как юрлицо или обратитесь в поддержку." }
                });

            var rows = await _db.EmployerEmployees
                .AsNoTracking()
                .Where(e => e.EmployerClientId == employer.Id && e.IsActive)
                .Include(e => e.EmployeeClient)
                .ThenInclude(c => c!.Accounts)
                .OrderBy(e => e.EmployeeClient!.LastName)
                .ToListAsync();

            var data = rows.Select(e =>
            {
                var acc = e.EmployeeClient!.Accounts
                    .Where(a => a.Status == "Active")
                    .OrderByDescending(a => a.AccountType == "Checking" ? 1 : 0)
                    .FirstOrDefault();
                return new
                {
                    id = e.Id,
                    employeeClientId = e.EmployeeClientId,
                    fullName = e.EmployeeClient.FullName,
                    email = e.EmployeeClient.Email,
                    phoneNumber = e.EmployeeClient.PhoneNumber,
                    position = e.Position,
                    defaultAccountNumber = acc?.AccountNumber,
                    defaultAccountCurrency = acc?.Currency,
                };
            });

            return Ok(new { data });
        }

        // POST /api/legal-entity/employees
        [HttpPost("employees")]
        public async Task<IActionResult> AddEmployee([FromBody] AddEmployeeRequest req)
        {
            var employer = await GetEmployerClientAsync();
            if (employer == null)
                return UnprocessableEntity(new { detail = "Профиль организации не найден. Невозможно добавить сотрудника." });

            var email = (req.EmployeeEmail ?? "").Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(email))
                return BadRequest(new { detail = "Укажите email сотрудника" });

            var employeeUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email);
            if (employeeUser == null)
                return NotFound(new { detail = "Пользователь с таким email не зарегистрирован в банке" });

            if (employeeUser.Role != "Customer")
                return BadRequest(new { detail = "Сотрудником может быть только клиент — физическое лицо" });

            var employeeClient = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == employeeUser.Id);
            if (employeeClient == null || employeeClient.ClientType != "Individual")
                return BadRequest(new { detail = "У найденного пользователя нет профиля физического лица" });

            if (employeeClient.Id == employer.Id)
                return BadRequest(new { detail = "Нельзя назначить организацию сотрудником самой себе" });

            var existing = await _db.EmployerEmployees
                .FirstOrDefaultAsync(e => e.EmployerClientId == employer.Id && e.EmployeeClientId == employeeClient.Id);

            if (existing != null)
            {
                existing.IsActive = true;
                existing.Position = string.IsNullOrWhiteSpace(req.Position) ? existing.Position : req.Position!.Trim();
                await _db.SaveChangesAsync();
                return Ok(new
                {
                    id = existing.Id,
                    employeeClientId = existing.EmployeeClientId,
                    message = "Сотрудник уже был в списке — запись восстановлена",
                });
            }

            var link = new EmployerEmployee
            {
                Id = Guid.NewGuid(),
                EmployerClientId = employer.Id,
                EmployeeClientId = employeeClient.Id,
                Position = string.IsNullOrWhiteSpace(req.Position) ? null : req.Position.Trim(),
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
            };
            _db.EmployerEmployees.Add(link);
            await _db.SaveChangesAsync();

            return StatusCode(201, new
            {
                id = link.Id,
                employeeClientId = link.EmployeeClientId,
                message = "Сотрудник добавлен",
            });
        }

        // DELETE /api/legal-entity/employees/{id}
        [HttpDelete("employees/{id:guid}")]
        public async Task<IActionResult> RemoveEmployee(Guid id)
        {
            var employer = await GetEmployerClientAsync();
            if (employer == null)
                return UnprocessableEntity(new { detail = "Профиль организации не найден" });

            var row = await _db.EmployerEmployees
                .FirstOrDefaultAsync(e => e.Id == id && e.EmployerClientId == employer.Id);
            if (row == null)
                return NotFound(new { detail = "Запись не найдена" });

            row.IsActive = false;
            await _db.SaveChangesAsync();
            return Ok(new { message = "Сотрудник снят с учёта в вашей организации" });
        }

        // GET /api/legal-entity/salary-autopay
        [HttpGet("salary-autopay")]
        public async Task<IActionResult> GetSalaryAutopayRules()
        {
            var employer = await GetEmployerClientAsync();
            if (employer == null)
                return Ok(new { data = Array.Empty<object>(), meta = new { profileMissing = true } });

            var rows = await _db.SalaryAutopayRules.AsNoTracking()
                .Where(r => r.EmployerClientId == employer.Id)
                .Include(r => r.EmployerEmployee)
                .ThenInclude(e => e.EmployeeClient)
                .OrderBy(r => r.NextRunAt)
                .ToListAsync();

            var data = rows.Select(r => new
            {
                r.Id,
                r.EmployerEmployeeId,
                employeeName = r.EmployerEmployee.EmployeeClient?.FullName,
                r.FromAccountId,
                r.Amount,
                r.Currency,
                r.IncomeKindCode,
                r.Cadence,
                r.DayOfMonth,
                r.DayOfWeek,
                r.RunTimeMinutesUtc,
                r.IsEnabled,
                r.NextRunAt,
                r.LastRunAt,
                r.LastError,
                r.PaymentDescription,
            });

            return Ok(new { data });
        }

        // POST /api/legal-entity/salary-autopay
        [HttpPost("salary-autopay")]
        public async Task<IActionResult> CreateSalaryAutopayRule([FromBody] CreateSalaryAutopayRequest req)
        {
            var employer = await GetEmployerClientAsync();
            if (employer == null)
                return UnprocessableEntity(new { detail = "Профиль организации не найден" });

            if (!SalaryAutopayScheduleHelper.IsValidCadence(req.Cadence))
                return BadRequest(new { detail = "Cadence: Monthly, Weekly или BiWeekly" });
            if (req.Amount <= 0)
                return BadRequest(new { detail = "Сумма должна быть больше нуля" });
            if (req.RunTimeMinutesUtc < 0 || req.RunTimeMinutesUtc > 1439)
                return BadRequest(new { detail = "Время: 0–1439 минут от полуночи по Москве" });
            if (!IncomeKindCodeHelper.IsValid(req.IncomeKindCode))
                return BadRequest(new { detail = "Недопустимый код вида дохода (КВД)" });

            var cadence = SalaryAutopayScheduleHelper.NormalizeCadence(req.Cadence);
            if (cadence == "Monthly" && (req.DayOfMonth is < 1 or > 28))
                return BadRequest(new { detail = "Для ежемесячной выплаты укажите число месяца от 1 до 28 (по московскому календарю)" });
            if ((cadence == "Weekly" || cadence == "BiWeekly") && req.DayOfWeek is < 0 or > 6)
                return BadRequest(new { detail = "Для Weekly/BiWeekly укажите день недели по московскому календарю: 0 (вс) … 6 (сб)" });

            var link = await _db.EmployerEmployees.FirstOrDefaultAsync(e =>
                e.Id == req.EmployerEmployeeId && e.EmployerClientId == employer.Id && e.IsActive);
            if (link == null)
                return BadRequest(new { detail = "Сотрудник не найден или не активен" });

            var fromAcc = await _db.Accounts.FirstOrDefaultAsync(a =>
                a.Id == req.FromAccountId && a.ClientId == employer.Id && a.Status == "Active");
            if (fromAcc == null)
                return BadRequest(new { detail = "Счёт списания не найден или не принадлежит организации" });

            if (await _db.SalaryAutopayRules.AnyAsync(r => r.EmployerEmployeeId == req.EmployerEmployeeId))
                return Conflict(new { detail = "На этого сотрудника уже настроен автоплатёж. Удалите или измените существующий." });

            var now = DateTimeOffset.UtcNow;
            var next = SalaryAutopayScheduleHelper.ComputeInitialNextRun(
                now, cadence, req.DayOfMonth, req.DayOfWeek, req.RunTimeMinutesUtc);

            var rule = new SalaryAutopayRule
            {
                Id = Guid.NewGuid(),
                EmployerClientId = employer.Id,
                EmployerEmployeeId = req.EmployerEmployeeId,
                FromAccountId = req.FromAccountId,
                Amount = req.Amount,
                Currency = string.IsNullOrWhiteSpace(req.Currency) ? "RUB" : req.Currency.Trim().ToUpperInvariant(),
                IncomeKindCode = req.IncomeKindCode.Trim(),
                Cadence = cadence,
                DayOfMonth = req.DayOfMonth,
                DayOfWeek = req.DayOfWeek,
                RunTimeMinutesUtc = req.RunTimeMinutesUtc,
                IsEnabled = true,
                NextRunAt = next,
                PaymentDescription = string.IsNullOrWhiteSpace(req.PaymentDescription) ? null : req.PaymentDescription.Trim(),
                CreatedAt = now,
                UpdatedAt = now,
            };
            _db.SalaryAutopayRules.Add(rule);
            await _db.SaveChangesAsync();

            return StatusCode(201, new { id = rule.Id, nextRunAt = rule.NextRunAt, message = "Автоплатёж создан" });
        }

        // PUT /api/legal-entity/salary-autopay/{id}
        [HttpPut("salary-autopay/{id:guid}")]
        public async Task<IActionResult> UpdateSalaryAutopayRule(Guid id, [FromBody] UpdateSalaryAutopayRequest req)
        {
            var employer = await GetEmployerClientAsync();
            if (employer == null)
                return UnprocessableEntity(new { detail = "Профиль организации не найден" });

            var rule = await _db.SalaryAutopayRules.FirstOrDefaultAsync(r => r.Id == id && r.EmployerClientId == employer.Id);
            if (rule == null)
                return NotFound();

            if (req.FromAccountId.HasValue)
            {
                var acc = await _db.Accounts.FirstOrDefaultAsync(a =>
                    a.Id == req.FromAccountId && a.ClientId == employer.Id && a.Status == "Active");
                if (acc == null) return BadRequest(new { detail = "Счёт списания недоступен" });
                rule.FromAccountId = req.FromAccountId.Value;
            }
            if (req.Amount.HasValue)
            {
                if (req.Amount.Value <= 0) return BadRequest(new { detail = "Сумма должна быть больше нуля" });
                rule.Amount = req.Amount.Value;
            }
            if (!string.IsNullOrWhiteSpace(req.Currency))
                rule.Currency = req.Currency.Trim().ToUpperInvariant();
            if (!string.IsNullOrWhiteSpace(req.IncomeKindCode))
            {
                if (!IncomeKindCodeHelper.IsValid(req.IncomeKindCode))
                    return BadRequest(new { detail = "Недопустимый КВД" });
                rule.IncomeKindCode = req.IncomeKindCode.Trim();
            }
            if (!string.IsNullOrWhiteSpace(req.Cadence))
            {
                if (!SalaryAutopayScheduleHelper.IsValidCadence(req.Cadence))
                    return BadRequest(new { detail = "Cadence: Monthly, Weekly или BiWeekly" });
                rule.Cadence = SalaryAutopayScheduleHelper.NormalizeCadence(req.Cadence);
            }
            if (req.DayOfMonth.HasValue) rule.DayOfMonth = req.DayOfMonth;
            if (req.DayOfWeek.HasValue) rule.DayOfWeek = req.DayOfWeek;
            if (req.RunTimeMinutesUtc.HasValue)
            {
                var m = req.RunTimeMinutesUtc.Value;
                if (m < 0 || m > 1439) return BadRequest(new { detail = "Время: 0–1439 минут от полуночи по Москве" });
                rule.RunTimeMinutesUtc = m;
            }
            if (req.IsEnabled.HasValue)
                rule.IsEnabled = req.IsEnabled.Value;
            if (req.PaymentDescription != null)
                rule.PaymentDescription = string.IsNullOrWhiteSpace(req.PaymentDescription) ? null : req.PaymentDescription.Trim();

            var cadence = SalaryAutopayScheduleHelper.NormalizeCadence(rule.Cadence);
            if (cadence == "Monthly" && (rule.DayOfMonth is null or < 1 or > 28))
                return BadRequest(new { detail = "Укажите число месяца 1–28 (по Москве) для ежемесячного режима" });
            if ((cadence == "Weekly" || cadence == "BiWeekly") && (rule.DayOfWeek is null or < 0 or > 6))
                return BadRequest(new { detail = "Укажите день недели 0–6 (по Москве) для еженедельного режима" });

            rule.NextRunAt = SalaryAutopayScheduleHelper.ComputeInitialNextRun(
                DateTimeOffset.UtcNow, cadence, rule.DayOfMonth, rule.DayOfWeek, rule.RunTimeMinutesUtc);
            rule.UpdatedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { id = rule.Id, nextRunAt = rule.NextRunAt, message = "Сохранено" });
        }

        // DELETE /api/legal-entity/salary-autopay/{id}
        [HttpDelete("salary-autopay/{id:guid}")]
        public async Task<IActionResult> DeleteSalaryAutopayRule(Guid id)
        {
            var employer = await GetEmployerClientAsync();
            if (employer == null)
                return UnprocessableEntity(new { detail = "Профиль организации не найден" });

            var rule = await _db.SalaryAutopayRules.FirstOrDefaultAsync(r => r.Id == id && r.EmployerClientId == employer.Id);
            if (rule == null)
                return NotFound();

            _db.SalaryAutopayRules.Remove(rule);
            await _db.SaveChangesAsync();
            return Ok(new { message = "Автоплатёж удалён" });
        }
    }
}
