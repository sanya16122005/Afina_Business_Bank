using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/public")]
    public class PublicController : ControllerBase
    {
        // GET /api/public/about
        [HttpGet("about")]
        public IActionResult GetAbout()
        {
            return Ok(new
            {
                bankName = "Афина",
                foundedYear = 2010,
                description = "Надёжный цифровой банк для физических и юридических лиц",
                license = "Лицензия ЦБ РФ №1234 от 01.03.2010",
                contacts = new
                {
                    phone = "+7 (800) 555-35-35",
                    email = "support@afina.ru",
                    address = "г. Москва, ул. Финансовая 1"
                },
                advantages = new object[]
                {
                    new { icon = "shield", title = "Безопасность", description = "Двухфакторная аутентификация и шифрование данных" },
                    new { icon = "percent", title = "Выгодные проценты", description = "До 7% годовых на сберегательном счёте" },
                    new { icon = "mobile", title = "Удобство", description = "Полное управление счетами онлайн" }
                }
            });
        }

        // GET /api/public/tariffs
        [HttpGet("tariffs")]
        public IActionResult GetTariffs()
        {
            return Ok(new
            {
                accounts = new object[]
                {
                    new
                    {
                        type = "Checking", subType = "Debit", interestRate = 0.0,
                        withdrawalFee = "0%", transferFeeInternal = "0%", transferFeeExternal = "1%",
                        description = "Дебитный чековый счёт"
                    },
                    new
                    {
                        type = "Checking", subType = "Credit", interestRate = 0.0,
                        withdrawalFeeOnNegativeBalance = "0.2%",
                        description = "Кредитный чековый счёт. Комиссия 0.2% при снятии при отрицательном балансе"
                    },
                    new
                    {
                        type = "Savings", subType = (string?)null, interestRate = 7.0,
                        withdrawalFee = "2.5% (кроме первого снятия)",
                        description = "Сберегательный счёт с начислением процентов"
                    }
                },
                currencies = new[] { "RUB", "USD", "EUR" }
            });
        }

        // GET /api/public/faq
        [HttpGet("faq")]
        public IActionResult GetFaq()
        {
            return Ok(new
            {
                data = new object[]
                {
                    new { id = "faq-001", question = "Как открыть счёт?", answer = "Зарегистрируйтесь на сайте и перейдите в раздел «Счета» → «Открыть новый счёт»." },
                    new { id = "faq-002", question = "Какая комиссия за перевод?", answer = "Переводы между своими счетами и клиентам банка — бесплатно. Внешние переводы — 1%." },
                    new { id = "faq-003", question = "Как закрыть счёт?", answer = "Баланс счёта должен быть равен нулю. Обратитесь к кассиру или обратитесь в поддержку." },
                    new { id = "faq-004", question = "Как работает двухфакторная аутентификация?", answer = "При входе на ваш email отправляется 6-значный код, который нужно ввести для подтверждения." },
                    new { id = "faq-005", question = "Что такое сберегательный счёт?", answer = "Счёт с начислением 7% годовых. Первое снятие — бесплатно, далее комиссия 2.5%." }
                }
            });
        }
    }
}
