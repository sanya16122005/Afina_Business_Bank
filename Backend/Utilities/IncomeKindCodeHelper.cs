using System.Collections.Generic;

namespace Backend.Utilities
{
    /// <summary>
    /// Коды дохода физлица (порядок отражения в отчётности по НДФЛ). Справочно по классификатору доходов.
    /// </summary>
    public static class IncomeKindCodeHelper
    {
        private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
        {
            "2000", "2001", "2002", "2003", "2006", "2010", "2012", "2013", "2300", "2530"
        };

        public static bool IsValid(string? code)
        {
            if (string.IsNullOrWhiteSpace(code)) return false;
            return Allowed.Contains(code.Trim());
        }

        public static string? GetTitle(string? code)
        {
            if (!IsValid(code)) return null;
            var c = code!.Trim();
            foreach (var (k, title) in SalaryAndRemunerationOptions)
            {
                if (k == c) return title;
            }
            return null;
        }

        public static IReadOnlyList<(string Code, string Title)> SalaryAndRemunerationOptions { get; } =
            new List<(string, string)>
            {
                ("2000", "Зарплата за выполнение трудовых и иных обязанностей"),
                ("2001", "Вознаграждение директора и аналогичные выплаты"),
                ("2002", "Премия по трудовому/коллективному договору"),
                ("2003", "Выплаты из чистой прибыли, целевых поступлений (юбилейные и т.п.)"),
                ("2006", "Районный коэффициент и северные надбавки"),
                ("2010", "Вознаграждение по ГПХ (кроме авторских)"),
                ("2012", "Отпускные"),
                ("2013", "Компенсация за неиспользованный отпуск"),
                ("2300", "Пособие по ВН за первые 3 дня (за счёт работодателя)"),
                ("2530", "Зарплата в натуральной форме"),
            };

        /// <summary>Краткая подпись для входящего перевода (зарплата / организация / код дохода).</summary>
        public static string? BuildIncomingTransferSummary(
            bool fromLegal, bool fromAssignedEmployer, string? counterpartyName, string? code, string? kindTitle)
        {
            if (fromLegal && fromAssignedEmployer)
            {
                var tail = !string.IsNullOrEmpty(kindTitle) ? $" — {kindTitle}" : (!string.IsNullOrEmpty(code) ? $" (код {code})" : "");
                return $"Поступление от организации «{counterpartyName}»{tail}";
            }
            if (fromLegal)
            {
                var tail = !string.IsNullOrEmpty(kindTitle) ? $" — {kindTitle}" : (!string.IsNullOrEmpty(code) ? $" (код {code})" : "");
                return $"Поступление от «{counterpartyName}»{tail}";
            }
            if (!string.IsNullOrEmpty(kindTitle))
                return $"Входящий перевод — {kindTitle}" + (!string.IsNullOrEmpty(code) ? $" (код {code})" : "");
            if (!string.IsNullOrEmpty(code))
                return $"Входящий перевод с кодом вида дохода {code}";
            return null;
        }
    }
}
