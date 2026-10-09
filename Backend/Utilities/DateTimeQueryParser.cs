using System.Globalization;

namespace Backend.Utilities
{
    internal static class DateTimeQueryParser
    {
        private const DateTimeStyles ParseStyles =
            DateTimeStyles.AllowWhiteSpaces |
            DateTimeStyles.AssumeUniversal |
            DateTimeStyles.AdjustToUniversal;

        public static bool TryParseUtcDateTime(string? value, out DateTime utcDateTime)
        {
            if (DateTime.TryParse(value, CultureInfo.InvariantCulture, ParseStyles, out var parsed))
            {
                utcDateTime = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
                return true;
            }

            utcDateTime = default;
            return false;
        }

        public static bool TryParseUtcDate(string? value, out DateTime utcDate)
        {
            if (DateTime.TryParse(value, CultureInfo.InvariantCulture, ParseStyles, out var parsed))
            {
                utcDate = DateTime.SpecifyKind(parsed.Date, DateTimeKind.Utc);
                return true;
            }

            utcDate = default;
            return false;
        }
    }
}