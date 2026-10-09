using Backend.Models;

namespace Backend.Services
{
    /// <summary>
    ///
    /// Расписание автоплатежей: календарь и «минуты от полуночи» задаются в часовом поясе Europe/Moscow.
    /// <see cref="SalaryAutopayRule.RunTimeMinutesUtc"/> исторически так названо в БД — хранит именно минуты от полуночи по Москве (0–1439).
    /// </summary>
    public static class SalaryAutopayScheduleHelper
    {
        public static readonly string[] AllowedCadences = { "Monthly", "Weekly", "BiWeekly" };

        public static bool IsValidCadence(string? cadence) =>
            !string.IsNullOrWhiteSpace(cadence) && AllowedCadences.Contains(cadence.Trim(), StringComparer.OrdinalIgnoreCase);

        public static string NormalizeCadence(string cadence) => cadence.Trim() switch
        {
            var c when string.Equals(c, "Monthly", StringComparison.OrdinalIgnoreCase) => "Monthly",
            var c when string.Equals(c, "Weekly", StringComparison.OrdinalIgnoreCase) => "Weekly",
            var c when string.Equals(c, "BiWeekly", StringComparison.OrdinalIgnoreCase) => "BiWeekly",
            _ => cadence.Trim()
        };

        private static TimeZoneInfo GetMoscowTimeZone()
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Europe/Moscow");
            }
            catch
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Russian Standard Time");
            }
        }

        /// <summary>Календарная дата (год-месяц-день) + минуты от полуночи по Москве → момент в UTC.</summary>
        public static DateTimeOffset MoscowWallClockToUtc(int year, int month, int day, int runMinutesFromMidnightMoscow)
        {
            var tz = GetMoscowTimeZone();
            var h = runMinutesFromMidnightMoscow / 60;
            var mi = runMinutesFromMidnightMoscow % 60;
            var local = new DateTime(year, month, day, h, mi, 0, DateTimeKind.Unspecified);
            var utc = TimeZoneInfo.ConvertTimeToUtc(local, tz);
            return new DateTimeOffset(utc, TimeSpan.Zero);
        }

        /// <summary>Первый запуск строго после nowUtc.</summary>
        public static DateTimeOffset ComputeInitialNextRun(
            DateTimeOffset nowUtc,
            string cadence,
            int? dayOfMonth,
            int? dayOfWeek,
            int runMinutesMoscow)
        {
            cadence = NormalizeCadence(cadence);
            return cadence switch
            {
                "Monthly" => NextMonthlyOccurrence(nowUtc, dayOfMonth!.Value, runMinutesMoscow),
                "Weekly" => NextWeeklyOccurrence(nowUtc, (DayOfWeek)dayOfWeek!.Value, runMinutesMoscow),
                "BiWeekly" => NextWeeklyOccurrence(nowUtc, (DayOfWeek)dayOfWeek!.Value, runMinutesMoscow),
                _ => nowUtc.AddDays(1)
            };
        }

        public static DateTimeOffset AdvanceAfterSuccess(SalaryAutopayRule rule, DateTimeOffset completedUtc)
        {
            var cadence = NormalizeCadence(rule.Cadence);
            var tz = GetMoscowTimeZone();
            var completedMsk = TimeZoneInfo.ConvertTimeFromUtc(completedUtc.UtcDateTime, tz);
            var mskDate = completedMsk.Date;

            return cadence switch
            {
                "Monthly" => AddOneMoscowMonthOnDay(completedUtc, rule.DayOfMonth!.Value, rule.RunTimeMinutesUtc),
                "Weekly" => MoscowWallClockToUtc(
                    mskDate.AddDays(7).Year,
                    mskDate.AddDays(7).Month,
                    mskDate.AddDays(7).Day,
                    rule.RunTimeMinutesUtc),
                "BiWeekly" => MoscowWallClockToUtc(
                    mskDate.AddDays(14).Year,
                    mskDate.AddDays(14).Month,
                    mskDate.AddDays(14).Day,
                    rule.RunTimeMinutesUtc),
                _ => completedUtc.AddDays(1)
            };
        }

        private static DateTimeOffset NextMonthlyOccurrence(DateTimeOffset nowUtc, int dayDom, int runMinutesMoscow)
        {
            var tz = GetMoscowTimeZone();
            var nowMsk = TimeZoneInfo.ConvertTimeFromUtc(nowUtc.UtcDateTime, tz);

            for (var addM = 0; addM <= 36; addM++)
            {
                var monthStart = new DateTime(nowMsk.Year, nowMsk.Month, 1).AddMonths(addM);
                var y = monthStart.Year;
                var mo = monthStart.Month;
                var dim = DateTime.DaysInMonth(y, mo);
                var day = Math.Min(dayDom, dim);
                var candUtc = MoscowWallClockToUtc(y, mo, day, runMinutesMoscow);
                if (candUtc > nowUtc) return candUtc;
            }

            return nowUtc.AddMonths(1);
        }

        private static DateTimeOffset NextWeeklyOccurrence(DateTimeOffset nowUtc, DayOfWeek dow, int runMinutesMoscow)
        {
            var tz = GetMoscowTimeZone();
            var nowMsk = TimeZoneInfo.ConvertTimeFromUtc(nowUtc.UtcDateTime, tz);
            var date = nowMsk.Date;
            var todayDow = date.DayOfWeek;
            var daysUntil = ((int)dow - (int)todayDow + 7) % 7;
            var candDate = date.AddDays(daysUntil);
            var candUtc = MoscowWallClockToUtc(candDate.Year, candDate.Month, candDate.Day, runMinutesMoscow);
            if (candUtc <= nowUtc)
            {
                candDate = candDate.AddDays(7);
                candUtc = MoscowWallClockToUtc(candDate.Year, candDate.Month, candDate.Day, runMinutesMoscow);
            }

            return candUtc;
        }

        private static DateTimeOffset AddOneMoscowMonthOnDay(DateTimeOffset completedUtc, int dayDom, int runMinutesMoscow)
        {
            var tz = GetMoscowTimeZone();
            var msk = TimeZoneInfo.ConvertTimeFromUtc(completedUtc.UtcDateTime, tz);
            var nextFirst = new DateTime(msk.Year, msk.Month, 1).AddMonths(1);
            var y = nextFirst.Year;
            var mo = nextFirst.Month;
            var dim = DateTime.DaysInMonth(y, mo);
            var day = Math.Min(dayDom, dim);
            return MoscowWallClockToUtc(y, mo, day, runMinutesMoscow);
        }
    }
}
