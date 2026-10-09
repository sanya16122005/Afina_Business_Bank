# Афина Банк — Цифровой Банкинг (Портфолио-Проект)

Полнофункциональный банковский веб-сервис: фронтенд на React 19, бэкенд на ASP.NET Core 10, PostgreSQL для данных, Redis для refresh-токенов, Ollama (локальный LLM) для объяснения антифрод-алертов и ML.NET для самой антифрод-модели. Всё поднимается одним `docker compose up`.

> Демонстрационный портфолио-проект. Не для продакшена — секреты должны задаваться через переменные окружения, но архитектура максимально приближена к боевой.

---

## Содержание

1. [Что внутри](#что-внутри)
2. [Скриншот архитектуры](#скриншот-архитектуры)
3. [Стек технологий](#стек-технологий)
4. [Быстрый запуск](#быстрый-запуск)
5. [Демо-аккаунты](#демо-аккаунты)
6. [Слои системы](#слои-системы)
   - [Frontend](#frontend-react-19--cra)
   - [Backend](#backend-aspnet-core-10)
   - [PostgreSQL](#postgresql)
   - [Redis](#redis)
   - [Ollama / LLM](#ollama--llm)
7. [Безопасность](#безопасность)
8. [Аутентификация и 2FA](#аутентификация-и-2fa)
9. [Бизнес-логика](#бизнес-логика)
10. [Антифрод](#антифрод)
11. [Кассовые сеансы](#кассовые-сеансы)
12. [Аудит и реалтайм-уведомления](#аудит-и-реалтайм-уведомления)
13. [Конфигурация](#конфигурация)
14. [API-эндпоинты](#api-эндпоинты)
15. [Запуск без Docker](#запуск-без-docker)
16. [Структура репозитория](#структура-репозитория)
17. [Что дальше](#что-дальше)
18. [Дочерние README и доки](#дочерние-readme-и-доки)

---

## Что внутри

| Подсистема | Что делает | Где живёт |
| --- | --- | --- |
| Лендинг + публичный API | Главная страница банка, тарифы, FAQ | `frontend/src/pages/public/`, `Backend/Controllers/PublicController.cs` |
| Аутентификация + 2FA | Регистрация, JWT-логин, email-код, refresh-токены | `frontend/src/pages/auth/`, `Backend/Controllers/AuthController.cs` |
| Личный кабинет клиента | Дашборд, счета, переводы, история, профиль | `frontend/src/pages/customer/`, `Backend/Controllers/{Accounts,Transactions,Customer}Controller.cs` |
| Рабочее место кассира | Сеансы, клиенты, операции, отчёты, антифрод | `frontend/src/pages/cashier/`, `Backend/Controllers/CashierController.cs` |
| Админ-панель | Пользователи, аудит, аналитика, антифрод | `frontend/src/pages/admin/`, `Backend/Controllers/{Admin,Fraud}Controller.cs` |
| Антифрод | ML.NET-модель (`fraud_model.zip`) + порог риска + LLM-объяснение | `Backend/Services/FraudDetectionService.cs`, `Backend/Services/LlmService.cs` |
| Реалтайм-уведомления | SignalR-хаб для антифрод-алертов | `Backend/Hubs/FraudHub.cs`, `frontend/src/hooks/useFraudAlertsRealtime.js` |
| Email | Отправка кодов 2FA через Gmail SMTP (MailKit) | `Backend/Services/EmailService.cs` |
| Аудит | Лог всех значимых действий пользователей | `Backend/Services/AuditService.cs` |

---

## Скриншот архитектуры

```
                     ┌──────────────────────────────────────┐
                     │            Browser (React 19)        │
                     │  • lazy routes / Suspense            │
                     │  • Toast / Modal a11y / 2FA modal    │
                     │  • SignalR client → /hubs/fraud      │
                     └───────────────┬──────────────────────┘
                                     │  HTTPS (JWT Bearer)
                                     ▼
              ┌─────────────────────────────────────────────────┐
              │          ASP.NET Core 10 (Backend)              │
              │  Controllers │ Services │ EF Core │ SignalR     │
              │  • JWT auth + rate-limit "auth-strict" (8/мин)  │
              │  • Anti-scraping headers                        │
              │  • Hosted: LlmWarmupHostedService               │
              └─────┬─────────────┬──────────────┬─────────────┘
                    │             │              │
            ┌───────▼─────┐  ┌────▼─────┐  ┌─────▼──────┐
            │ PostgreSQL  │  │  Redis   │  │  Ollama    │
            │  (bankdb)   │  │ refresh  │  │  qwen3.5:2b│
            │  EF Core    │  │  tokens  │  │  (LLM)     │
            └─────────────┘  └──────────┘  └────────────┘
```

Bridge между сервисами — `docker-compose.yml` в корне.

---

## Стек технологий

### Frontend (`frontend/`)

| Слой | Что используется | Зачем |
| --- | --- | --- |
| UI | **React 19**, react-router-dom 7 | SPA с лениво-загружаемыми роутами |
| Сборка | **react-scripts 5** (Create React App) | Простая dev-серверная сборка без webpack-конфига |
| Стили | **Sass** (SCSS), CSS custom properties | Дизайн-токены + темы (light/dark/system) |
| HTTP | **axios** + интерцепторы | JWT в заголовке + auto-refresh на 401 |
| Realtime | **@microsoft/signalr** | Push антифрод-алертов |
| Иконки | **lucide-react** | Tree-shakeable SVG иконки |
| Экспорт | **xlsx** | Excel-выгрузка операций и отчётов |
| Тесты | @testing-library/react | Базовый набор (минимально) |

### Backend (`Backend/`)

| Слой | Что используется | Зачем |
| --- | --- | --- |
| Платформа | **.NET 10** (ASP.NET Core, Web API) | Контроллеры + DI |
| ORM | **EF Core 10** + **Npgsql** | PostgreSQL, `EnsureCreated()` для dev |
| Хеширование паролей | **BCrypt.Net-Next** | Соль + work factor |
| Аутентификация | **Microsoft.AspNetCore.Authentication.JwtBearer** | HS256, 32-байтный ключ обязателен |
| Валидация | **FluentValidation.AspNetCore** | Доменные правила в DTO |
| Email | **MailKit** | Отправка 2FA-кодов через SMTP |
| Realtime | **SignalR** (встроен в ASP.NET) | WebSocket-хаб для фронта |
| Кэш / refresh tokens | **StackExchange.Redis** | Быстрый lookup, fallback на PostgreSQL |
| ML | **Microsoft.ML** + **ML.FastTree** | Антифрод-модель, бинарный классификатор |
| LLM | Локальная **Ollama** (`qwen3.5:2b`) | Объяснение фрод-алертов человеческим языком |
| Rate limiting | Встроенный AspNetCore RateLimiting | 8 попыток/мин на auth-эндпоинты |
| OpenAPI | Microsoft.AspNetCore.OpenApi | Документация в dev-режиме |

### Инфраструктура

| Сервис | Образ | Порт хоста | Назначение |
| --- | --- | --- | --- |
| frontend | `node` (CRA dev server из Dockerfile) | `3000` | UI |
| backend | `mcr.microsoft.com/dotnet/aspnet:10` | `8000` (→ контейнерный 5000) | API + SignalR |
| postgres | `postgres:15` | `5433` (→ 5432) | Основная БД |
| redis | `redis:7-alpine` | `6379` | Refresh-токены |
| ollama | `ollama/ollama:latest` | `11434` | Локальный LLM-инференс |

---

## Быстрый запуск

```bash
# 1. Из корня репозитория
docker compose up -d --build

# 2. Подождать 30–60 секунд (Postgres healthcheck + первая загрузка Ollama-модели)

# 3. Открыть фронт
open http://localhost:3000
```

Что произойдёт:

1. PostgreSQL поднимется и пройдёт healthcheck.
2. Backend дождётся БД, выполнит `EnsureCreated()` + ALTER TABLE для пары новых колонок, создаст две инфраструктурные учётки (admin и cashier) — больше никаких данных не сеется.
3. Backend в фоне (`LlmWarmupHostedService`) прогреет Ollama: загрузит `qwen3.5:2b` (~1.5 ГБ при первом старте).
4. Frontend поднимется на 3000, проксируя API-запросы через `REACT_APP_API_URL=http://localhost:8000`.

Логин — см. [Демо-аккаунты](#демо-аккаунты).

### Остановка

```bash
docker compose down                 # сохраняет volumes
docker compose down -v              # вычищает Postgres/Redis/Ollama-данные тоже
```

---

## Демо-аккаунты

Бэкенд при старте создаёт **только** две инфраструктурные учётки. Никаких демо-клиентов и предзаготовленной истории операций нет — БД стартует чистой:

| Роль | Email | Пароль | 2FA | Что доступно |
| --- | --- | --- | --- | --- |
| Admin | `admin@afina-bank.demo` | `AdminSecurePass123!` | выкл | `/admin`, аудит, антифрод, юзеры |
| Cashier | `cashier@afina-bank.demo` | `CashierSecurePass123!` | выкл | `/cashier`, операции, отчёты |

Клиентов регистрируйте через `/register` или из кассирского интерфейса (`/cashier/clients`). Для клиентов 2FA включена по умолчанию — код придёт на email. Если SMTP не настроен (или используется демо Gmail), код можно подсмотреть в логах backend.

---

## Слои системы

### Frontend (React 19 + CRA)

См. [frontend/README.md](frontend/README.md) для исчерпывающего описания.

Кратко:

- **Маршрутизация** — `react-router-dom 7`, ленивые `React.lazy` чанки, `<PrivateRoute roles=[...]>` для role-based guards.
- **Состояние** — три React-контекста: `AuthContext` (юзер, токены, 2FA), `ToastContext` (глобальные уведомления, стабилизирован через `useMemo`), `ThemeContext` (light/dark/system, персистится в localStorage).
- **HTTP-клиент** — единый axios-инстанс (`src/api/auth.js`) с двумя интерцепторами:
  - request: подкладывает `Authorization: Bearer <token>`,
  - response: ловит 401, дёргает `/auth/refresh`, очередью повторяет упавшие запросы.
- **2FA-флоу** — pending-token + email-код, кулдаун 60 с на повторную отправку, persist в localStorage чтобы не спамить email.
- **Дизайн-система** — `src/components/ui/`: `Modal` (focus trap + restore), `ConfirmModal`, `TwoFactorModal`, `Toast`, `Spinner`, `Skeleton`, `EmptyState`, `DropdownSelect` (полная клавиатурная навигация).
- **Production-сборка** — `npm run build` в `frontend/build/`, статика без Node-зависимостей.

### Backend (ASP.NET Core 10)

Точка входа: [`Backend/Program.cs`](Backend/Program.cs). Pipeline настраивается линейно — CORS → Controllers → DbContext → Redis → JWT → RateLimiting → SignalR → Services → middleware.

**Контроллеры** ([`Backend/Controllers/`](Backend/Controllers/)):

| Контроллер | Endpoints | Роль |
| --- | --- | --- |
| `AuthController` | login, register, verify-2fa, resend-2fa, refresh, logout, change-password, login-history | Anonymous + JWT |
| `PublicController` | about, tariffs, faq | Anonymous |
| `AccountsController` | список / детали / открытие / lookup / preview | Customer |
| `TransactionsController` | history + transfer | Customer |
| `CustomerController` | dashboard | Customer |
| `CashierController` | сеансы, клиенты, deposit/withdraw/transfer, отчёты | Cashier |
| `AdminController` | пользователи, аудит, аналитика | Admin |
| `FraudController` | список алертов, разрешение, блокировка | Cashier + Admin |

**Сервисы** ([`Backend/Services/`](Backend/Services/)):

| Сервис | Что делает |
| --- | --- |
| `EmailService` | MailKit SMTP, отправка 2FA-кодов |
| `AuditService` | пишет в `audit_log` все значимые действия |
| `AccountNumberService` | генерация номеров счетов по схеме `101-Xxxxxxxxxx` (Checking) / `102-` (Savings) |
| `TransactionService` | генерация reference + расчёт комиссий (см. [бизнес-логика](#бизнес-логика)) |
| `FraudDetectionService` | загрузка `fraud_model.zip`, ML-проверка, уведомление фронта через SignalR |
| `LlmService` (`OllamaLlmService`) | HTTP-запрос в Ollama для генерации объяснения алерта |
| `LlmWarmupHostedService` | при старте — фоновая загрузка/прогрев модели в Ollama, чтобы первый алерт не ждал минуту |
| `RedisRefreshTokenStore` | основное хранилище refresh-токенов; PostgreSQL — backup |

**Хабы** ([`Backend/Hubs/`](Backend/Hubs/)):

- `FraudHub` (`/hubs/fraud`) — клиенты-админы и кассиры подписываются, бэк рассылает `OnNewAlert` / `OnAlertUpdated`.

**Доменные модели** ([`Backend/Models/`](Backend/Models/)):

- `User` (+ `UserSettings`, `UserAddress`, `LoginHistory`, `RefreshToken`)
- `Client` (+ `ClientAddress`)
- `Account` (+ `Card`)
- `Transaction`
- `CashierSession`
- `FraudAlert`
- `AuditLog`

### PostgreSQL

- Версия: **15**.
- Подключение: `Host=postgres;Port=5432;Database=bankdb;Username=postgres;Password=postgres`.
- Схема создаётся через `db.Database.EnsureCreated()` — без миграций. Это сознательно сделано для демонстрационного запуска:
  - **Плюс:** zero-config старт, любой девелопер одним `docker compose up` получает чистую рабочую БД.
  - **Минус:** изменения схемы требуют сноса БД (`docker compose down -v`) или ручного `ALTER TABLE`. В `Program.cs` есть пара `ALTER TABLE IF EXISTS` для совместимости.
- Таблицы: `users`, `user_addresses`, `user_settings`, `login_history`, `refresh_tokens`, `clients`, `client_addresses`, `accounts`, `cards`, `transactions`, `cashier_sessions`, `fraud_alerts`, `audit_log`.

### Redis

- Версия: **7-alpine**, AOF включён (`--appendonly yes`).
- Назначение: хранение refresh-токенов с TTL = `Jwt:RefreshTokenExpiresInDays` (по умолчанию 7 дней).
- Если Redis недоступен — `RedisRefreshTokenStore` падает в exception, бэк ловит, использует только PostgreSQL-таблицу `refresh_tokens` как backup. Старт сервера не блокируется.

### Ollama / LLM

- Образ: `ollama/ollama:latest`, том `ollamadata` для весов модели.
- Модель: **`qwen3.5:2b`** (~1.5 ГБ).
- Использование: после ML-классификации `FraudDetectionService` зовёт LLM с краткой выжимкой фактов транзакции и просит сгенерировать человеческое объяснение для оператора.
- Прогрев: `LlmWarmupHostedService` в фоне после старта бэка делает первый pull/generate, чтобы первый реальный алерт не ждал десятки секунд.
- Если Ollama недоступна — антифрод продолжает работать, но в `triggerReason` будет краткое ML-сообщение без LLM-расшифровки.

---

## Безопасность

| Что | Как реализовано |
| --- | --- |
| Хеширование паролей | `BCrypt.Net.BCrypt.HashPassword` — соль + work factor по умолчанию |
| JWT | HS256, симметричный ключ из `Jwt:Key` (минимум 32 байта, проверка при старте) |
| Refresh tokens | Guid, хранятся в Redis (primary) + PostgreSQL (fallback), TTL 7 дней |
| Rate limit | Политика `auth-strict`: 8 запросов/мин с одного IP на `/auth/login`, `/auth/verify-2fa`, `/auth/resend-2fa`, `/auth/register`. На превышение — HTTP 429 + `Retry-After: 60` |
| 2FA | 6-значный код, BCrypt-хэш в `users.TwoFactorCode`, TTL 5 мин (`TwoFactor:CodeExpirationMinutes`) |
| Anti-scraping headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy`, `CSP: default-src 'self'` |
| CORS | Whitelist `localhost:3000/3001/5173`, `AllowCredentials` |
| SignalR auth | JWT через query-string (`?access_token=...`) для WebSocket-соединений |
| Audit | Все значимые действия (логин, регистрация, операции, изменения статусов) пишутся в `audit_log` с IP/UA |
| Validation | FluentValidation + ручные проверки в контроллерах (email формат, пароль ≥ N символов, телефон по regex) |

**Известные ограничения (демо-версии):**
- `Jwt:Key` лежит в `appsettings.json` — в проде надо в env / Vault.
- App Password Gmail в `appsettings.json` — то же самое.
- Refresh token хранится в localStorage фронта (потенциально уязвимо к XSS) — в проде стоило бы в httpOnly cookie.
- Mock-логин включается флагом `REACT_APP_ENABLE_MOCK=true` (только в dev-сборке, вырезается DCE из production).

---

## Аутентификация и 2FA

Полная цепочка для клиента:

```
Browser                          Backend                         Email
  │                                 │                              │
  │  POST /api/auth/login           │                              │
  │  {email, password}              │                              │
  │ ──────────────────────────────► │                              │
  │                                 │ BCrypt.Verify(password)      │
  │                                 │ user.TwoFactorEnabled = true │
  │                                 │ ✱ generate 6-digit code      │
  │                                 │ ✱ store BCrypt(code) +       │
  │                                 │   pendingToken (Guid)        │
  │                                 │ ✱ EmailService.Send(code)   ─┼─► afina.business.bank@gmail.com
  │  200 {requiresTwoFactor: true,  │                              │
  │       pendingToken,             │                              │
  │       expiresInMinutes: 5}      │                              │
  │ ◄────────────────────────────── │                              │
  │                                 │                              │
  │  ✱ persist {email, pendingToken,│                              │
  │     expiresAt, lastSentAt}      │                              │
  │     in localStorage             │                              │
  │                                 │                              │
  │  POST /api/auth/verify-2fa      │                              │
  │  {pendingToken, code}           │                              │
  │ ──────────────────────────────► │ BCrypt.Verify(code)          │
  │                                 │ ✱ clear TwoFactorCode        │
  │                                 │ ✱ create RefreshToken in     │
  │                                 │   Redis + Postgres           │
  │                                 │ ✱ generate JWT               │
  │  200 {token, refreshToken,      │                              │
  │       user: {...}}              │                              │
  │ ◄────────────────────────────── │                              │
  │                                 │                              │
  │  Authorization: Bearer <jwt>    │                              │
  │  на всех последующих запросах   │                              │
```

**Особенности на фронте:**
- Если в localStorage уже есть валидный (не истёкший) `pendingToken` для того же email — фронт **не дёргает** `/login` повторно, переиспользует код.
- 60-секундный кулдаун на «Отправить повторно», `lastSentAt` персистится.

**При 401 на любом защищённом запросе** — axios-интерцептор автоматически дёргает `/auth/refresh` с refresh-токеном, обновляет JWT и повторяет упавший запрос.

---

## Бизнес-логика

### Счета

- Тип: `Checking` (расчётный) / `Savings` (сберегательный).
- Подтип (для Checking): `Debit` / `Credit`.
- Валюты: `RUB`, `USD`, `EUR`.
- Каждый счёт имеет `accountNumber` (`101-...` для Checking, `102-...` для Savings), IBAN, BIC, дизайн карты, статус.
- Один счёт у клиента может быть зарплатным (`IsSalaryAccount = true`) — без комиссий, только RUB.

### Комиссии (`TransactionService.CalculateFee`)

| Сценарий | Комиссия |
| --- | --- |
| Зарплатный счёт | 0% |
| Snavings, **первое** снятие/перевод | 0% |
| Savings, последующие операции | 2.5% |
| Checking / Credit с уходом в минус | 0.2% |
| Checking / Debit (внутренний перевод) | 0% |

### Переводы

- Внутренний (между счетами одного банка) — мгновенный, бесплатный.
- Поиск получателя: по номеру счёта (`101-...`, `102-...`) или по телефону.
- На сумму > порога антифрода или при подозрительном паттерне → транзакция уходит в `Pending` (HTTP 202), создаётся `FraudAlert`, кассир/админ должен подтвердить или заблокировать.

---

## Антифрод

Двухступенчатая проверка перед коммитом транзакции:

1. **Эвристика** (быстрые проверки в `FraudDetectionService`):
   - `HighAmountThresholdMultiplier = 10.0` — сумма > 10× средней по счёту.
   - `HighFrequencyThreshold = 10` за `HighFrequencyWindowHours = 1` — слишком много операций.
   - Редкая геолокация / необычный паттерн (если есть данные).

2. **ML-модель** (`fraud_model.zip` в корне `Backend/`):
   - Бинарный классификатор на ML.NET FastTree.
   - Фичи: amount, hourOfDay, transactionsLast24h, accountBalance, avgTransactionAmount, maxPreviousAmount, accountType.
   - Если `Probability >= DefaultRiskScoreThreshold (0.7)` — alert.

3. **LLM-объяснение** (`OllamaLlmService`):
   - Если первые два шага дали алерт — формируется prompt с фактами транзакции, отправляется в Ollama (`qwen3.5:2b`).
   - LLM генерирует короткий и полный текст для оператора (`triggerReason` + `triggerReasonFull`).
   - Записывается в `fraud_alerts`.

4. **Уведомление фронта**:
   - `IHubContext<FraudHub>` рассылает событие `OnNewAlert` всем подписанным клиентам.
   - Админ-дашборд (`/admin`) и страница антифрода (`/admin/fraud`) обновляются без перезагрузки.

5. **Resolution**:
   - Кассир/админ открывает `/admin/fraud` или `/cashier/fraud`.
   - Видит карточку алерта с риск-скором, причиной (короткой и полной), реквизитами.
   - Кнопка `Resolved` (подтвердить — транзакция проходит) или `Blocked` (отменить).
   - `POST /api/fraud/alerts/{id}/resolve` обновляет статус, шлёт `OnAlertUpdated` через SignalR, пишет в audit.

---

## Кассовые сеансы

`CashierSession` — рабочая смена кассира. Без активной сессии операции запрещены.

- **Открытие:** автоматическое при первом обращении кассира к API в течение дня (`POST /api/cashier/sessions`).
- **Жизненный цикл:** `Active` → `Closed`. Все депозиты, снятия, переводы привязаны к `cashierSessionId`.
- **Z-отчёт** (`GET /api/cashier/sessions/{id}/report`) — сводка операций за смену с суммами по типам.
- **Закрытие:** кнопка «Завершить сеанс» в `/cashier` (с подтверждением через ConfirmModal), `POST /api/cashier/sessions/{id}/end`. После этого операции до открытия новой смены недоступны.
- **Frontend-хук** `useCashierSession()` оборачивает всё это в reactive-state и предоставляет фронту `session`, `loading`, `error`, `endSession()`.

---

## Аудит и реалтайм-уведомления

### AuditLog

Каждое значимое действие пишется в `audit_log`:

```
{
  userId, userFullName, role,
  actionType,              // "Login", "Transfer", "OpenAccount", "ResolveFraud", ...
  targetType, targetId,    // что меняли
  result,                  // "Success" / "Failed"
  ipAddress, userAgent,
  details,                 // свободный комментарий
  timestamp
}
```

Просмотр: `/admin/audit`. Удалять записи нельзя через UI — только append.

### SignalR

- Хаб `/hubs/fraud` (см. `Backend/Hubs/FraudHub.cs`).
- Авторизация JWT через query-string: `?access_token=...` (см. `OnMessageReceived` в `Program.cs`).
- Frontend подключается через `useFraudAlertsRealtime({ enabled, onNewAlert, onAlertUpdated })`.
- Backend рассылает: `OnNewAlert(alertPayload)`, `OnAlertUpdated(alertPayload)`.
- Состояния соединения на фронте: `connecting | connected | reconnecting | error | disabled`. На дашборде админа — индикатор «Live · онлайн / нет связи».

---

## Конфигурация

### Backend (`Backend/appsettings.json` + переменные окружения)

| Ключ | Дефолт | Описание |
| --- | --- | --- |
| `ConnectionStrings:DefaultConnection` | `Host=postgres;Port=5432;Database=bankdb;Username=postgres;Password=postgres` | EF Core / Npgsql |
| `Redis:Connection` | `redis:6379` | StackExchange.Redis |
| `Jwt:Key` | (обязателен, ≥32 символа) | HS256 ключ — **обязателен** для старта |
| `Jwt:Issuer` | `AfinaApp` | iss |
| `Jwt:Audience` | `AfinaClient` | aud |
| `Jwt:ExpiresInMinutes` | `60` | время жизни access-токена |
| `Jwt:RefreshTokenExpiresInDays` | `7` | TTL refresh-токена |
| `Email:SmtpHost/Port` | `smtp.gmail.com` / `587` | MailKit SMTP |
| `Email:SenderEmail` | `support@your-bank-domain.com` | from-адрес |
| `Email:AppPassword` | `xxxx xxxx xxxx xxxx` | Gmail App Password |
| `TwoFactor:CodeLength` | `6` | длина кода |
| `TwoFactor:CodeExpirationMinutes` | `5` | TTL кода |
| `FraudDetection:HighAmountThresholdMultiplier` | `10.0` | сумма > N× средней = подозрительно |
| `FraudDetection:HighFrequencyThreshold` | `10` | операций |
| `FraudDetection:HighFrequencyWindowHours` | `1` | за час |
| `FraudDetection:DefaultRiskScoreThreshold` | `0.7` | порог ML-вероятности для алерта |
| `Llm:OllamaUrl` | `http://ollama:11434` | URL Ollama |
| `Llm:ModelName` | `qwen3.5:2b` | имя модели |
| `Llm:TimeoutSeconds` | `300` | таймаут запроса к LLM |

ENV-вариант: подставь через docker-compose или `dotnet user-secrets`. Например `Jwt__Key=...` (двойное подчёркивание).

### Frontend (`frontend/.env.local`)

| Ключ | Дефолт | Описание |
| --- | --- | --- |
| `REACT_APP_API_URL` | пусто (CRA proxy на 5000) | Явный URL бэка, если фронт развёрнут отдельно |
| `REACT_APP_ENABLE_MOCK` | `false` | Mock-fallback для логина (только в dev-сборке) |

---

## API-эндпоинты

Полный список — в [Backend/README.md](Backend/README.md). Кратко:

- **Public:** `/api/public/{about, tariffs, faq}`
- **Auth:** `/api/auth/{login, verify-2fa, resend-2fa, register, refresh, logout, change-password, login-history}`
- **Customer:** `/api/customer/dashboard`, `/api/users/{profile, settings}`, `/api/accounts/*`, `/api/transactions/*`
- **Cashier:** `/api/cashier/{sessions, clients, accounts, transactions/*}/...`
- **Admin:** `/api/admin/{users, audit, analytics}/...`
- **Fraud:** `/api/fraud/alerts/{...}` (Cashier + Admin)
- **SignalR:** `/hubs/fraud`

OpenAPI-документация в dev-режиме: `http://localhost:8000/openapi/v1.json`.

---

## Запуск без Docker

### Требования

- .NET 10 SDK
- Node.js 20+
- PostgreSQL 15 (локально на 5432)
- Redis 7 (опционально — будет fallback на Postgres)
- Ollama (опционально — без него работает антифрод без LLM-объяснения)

### Шаги

```bash
# 1. PostgreSQL: создать БД
psql -U postgres -c "CREATE DATABASE bankdb;"

# 2. Backend
cd Backend
# Поменять в appsettings.json: "Host=postgres" → "Host=localhost"
# Поменять "Redis:Connection" → "localhost:6379" если Redis локально
dotnet run
# → http://localhost:5000

# 3. Frontend (в отдельном терминале)
cd frontend
npm install
npm start
# → http://localhost:3000 (proxy на :5000 уже настроен в package.json)

# 4. Ollama (опционально)
# Установить с ollama.ai и запустить:
ollama serve &
ollama pull qwen3.5:2b
```

---

## Структура репозитория

```
coursework-frontend/
├── docker-compose.yml         ← оркестрация всех сервисов
├── README.md                  ← этот файл
├── BACKEND_COMPARISON_REPORT.md
├── BANK.sln                   ← .NET solution (объединяет Backend и тесты)
├── afina-brand-snippets.html  ← брендбук (логотип, цвета, типографика)
│
├── Backend/                   ← ASP.NET Core 10
│   ├── Backend.csproj
│   ├── Program.cs             ← composition root
│   ├── appsettings.json
│   ├── Dockerfile
│   ├── Controllers/           ← REST endpoints
│   ├── Services/              ← бизнес-логика, ML, LLM, audit
│   ├── Models/                ← User, Account, Transaction, FraudAlert, ...
│   ├── DTOs/                  ← request/response records
│   ├── Hubs/                  ← FraudHub (SignalR)
│   ├── Data/                  ← AppDbContext (EF Core)
│   ├── Utilities/             ← хелперы
│   ├── fraud_model.zip        ← ML.NET FastTree модель
│   ├── SYSTEM_DESIGN.md       ← архитектурный справочник и ответы на вопросы
│   └── README.md              ← API + примеры curl
│
└── frontend/                  ← React 19 SPA
    ├── package.json
    ├── Dockerfile
    ├── public/
    ├── src/
    │   ├── App.jsx
    │   ├── api/               ← axios-обёртки
    │   ├── components/
    │   │   ├── ErrorBoundary.jsx
    │   │   ├── layout/
    │   │   └── ui/            ← Modal, Toast, Spinner, DropdownSelect, ...
    │   ├── constants/         ← общие лейблы / иконки
    │   ├── context/           ← Auth, Toast, Theme
    │   ├── hooks/             ← useCashierSession, useFraudAlertsRealtime, useDebouncedValue
    │   ├── pages/{public,auth,customer,cashier,admin}/
    │   ├── styles/            ← main.scss + partials
    │   ├── utils/             ← format, transactionUtils, fraudAlerts, accountDesign
    │   └── data/mockData.js   ← mock-fallback (только dev)
    └── README.md              ← подробно по фронту
```

---

## Что дальше

Несколько направлений, которые можно развить (отсортировано по приоритету):

| # | Что | Цена | Польза |
| --- | --- | --- | --- |
| 1 | EF Core migrations вместо `EnsureCreated()` | M | Любое изменение схемы без сноса БД |
| 2 | Trusted-device 2FA (час кулдаун после успешной 2FA) | M | UX: нет email-кода на каждый логин |
| 3 | httpOnly cookie вместо localStorage для refresh-токена | M | Защита от XSS-кражи сессии |
| 4 | `Jwt:Key` и SMTP-пароль в env / dotnet user-secrets | S | Не палить секреты в репо |
| 5 | Юнит-тесты для `TransactionService`, `FraudDetectionService` | M | Безопасный рефакторинг |
| 6 | Health-check endpoints (`/healthz`, `/ready`) | S | Корректные restart-полиси в docker / k8s |
| 7 | OpenTelemetry / структурированные логи | M | Реальная наблюдаемость |
| 8 | Frontend: общий `<DataTable>` компонент | M | Дедуп таблиц во всех ролевых страницах |

---

## Дочерние README и доки

- [`frontend/README.md`](frontend/README.md) — подробная документация фронтенда (стек, маршруты, контексты, дизайн-система, a11y, перформанс).
- [`Backend/README.md`](Backend/README.md) — список API-эндпоинтов с примерами `curl`.
- [`Backend/SYSTEM_DESIGN.md`](Backend/SYSTEM_DESIGN.md) — архитектурный справочник, описание решений и эксплуатации.
- [`afina-brand-snippets.html`](afina-brand-snippets.html) — брендбук: логотип, цвета, типографика.

---

## Лицензия

Демонстрационный портфолио-проект. Используйте на своё усмотрение в ознакомительных и некоммерческих целях.



---


