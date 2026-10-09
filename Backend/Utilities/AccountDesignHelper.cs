using System;

namespace Backend.Utilities
{
    public static class AccountDesignHelper
    {
        public const string Classic = "classic";
        public const string White = "white";
        public const string Virtual = "virtual";
        public const string Dual = "dual";
        public const string Premium = "premium";

        public static string GetDefault(string accountType, string? subType = null)
        {
            if (string.Equals(accountType, "Savings", StringComparison.OrdinalIgnoreCase))
                return Virtual;

            if (string.Equals(subType, "Credit", StringComparison.OrdinalIgnoreCase))
                return White;

            return Classic;
        }

        public static string Normalize(string? design, string accountType, string? subType = null)
        {
            var value = design?.Trim().ToLowerInvariant();
            return value is Classic or White or Virtual or Dual or Premium
                ? value
                : GetDefault(accountType, subType);
        }

        public static string Resolve(string? design, string accountType, string? subType = null) =>
            Normalize(design, accountType, subType);
    }
}