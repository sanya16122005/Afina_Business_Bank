# Архитектура и System Design (Backend + БД + DevOps)

Этот файл содержит подробное описание архитектуры, системных решений и вопросов эксплуатации цифрового банкинга:
- ключевые архитектурные решения и вопросы производительности;
- часто задаваемые вопросы по устройству системы (System Design);
- полезные SQL-запросы для мониторинга и отладки;
- практические сценарии обслуживания и администрирования.

---

## 1) Короткий питч проекта (30-60 секунд)

**Что это:** backend банковской системы на ASP.NET, PostgreSQL, Redis, Docker.  
**Ключевые функции:** аутентификация JWT + 2FA по email, восстановление пароля через код, роли (`Admin`, `Cashier`, `Customer`), операции по счетам и транзакциям, антифрод (ML.NET + Ollama LLM), аудит, SignalR-уведомления по подозрительным операциям, система резервного копирования (Backup/Restore).  
**Стек:** ASP.NET Core, EF Core Migrations, PostgreSQL, Redis, SignalR, Docker Compose, ML.NET, Ollama.

---

## 2) Архитектура: вопросы и ответы

### Вопрос: Почему выбрана такая архитектура?
**Ответ:** разделение по слоям: `Controllers` (HTTP API), `Services` (бизнес-логика), `Data`/EF Core (доступ к БД), `Hubs` (реалтайм). Это упрощает тестирование, замену компонентов и поддержку.

### Вопрос: Где хранится бизнес-логика?
**Ответ:** в `Services` (например, антифрод, email, LLM, транзакционные правила), контроллеры только оркестрируют запрос/ответ.

### Вопрос: Где и как включены роли?
**Ответ:** через JWT claims и `[Authorize(Roles = "...")]` на контроллерах/эндпоинтах.

### Вопрос: Как обеспечивается отказоустойчивость refresh-токенов?
**Ответ:** primary store в Redis, fallback в PostgreSQL (если Redis недоступен).

---

## 3) Docker/инфраструктура: вопросы и ответы

### Вопрос: Какие контейнеры поднимаются?
**Ответ:** `backend`, `postgres`, `redis`. Ollama рекомендуется запускать нативно на хосте (особенно на Mac M4 Pro через Metal) для максимальной производительности, backend подключается через `host.docker.internal`.

### Вопрос: Как запускать?
```bash
docker compose up -d --build
```

### Вопрос: Как смотреть логи?
```bash
docker compose logs backend --tail 200
docker compose logs postgres --tail 200
docker compose logs ollama --tail 200
```

### Вопрос: Что делать, если API не отвечает?
1. `docker compose ps`  
2. проверить `backend` logs  
3. проверить health PostgreSQL  
4. проверить строку подключения и применены ли миграции (`dotnet ef database update`).

---

## 4) БД: таблицы и связи (что проговорить)

Ключевые таблицы (по коду):  
- `users`  
- `clients`  
- `accounts`  
- `transactions`  
- `fraud_alerts`  
- `refresh_tokens`  
- `login_history`  
- `cashier_sessions`  
- `audit_log`  
- `user_addresses`, `user_settings`, `client_addresses`

### Логика связей (объяснение)
- `users` — учетные записи для входа.  
- `clients` — банковские клиенты; обычно связаны с `users` по `UserId` (для customer флоу).  
- `accounts` принадлежат клиентам (`ClientId`).  
- `transactions` ссылаются на счета `FromAccountId`/`ToAccountId`.  
- `fraud_alerts` ссылаются на `transactions`.  
- `refresh_tokens`, `login_history` связаны с `users`.

---

## 5) Мониторинг и диагностика: готовые SQL-запросы

> Ниже приведены полезные SQL-запросы для анализа базы данных в pgAdmin или DBeaver.

### 5.1 Показать все таблицы в схеме
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### 5.2 Показать структуру таблицы `users`
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

### 5.3 Все пользователи + роль + активность + 2FA
```sql
SELECT "Email", "Role", "IsActive", "TwoFactorEnabled", "CreatedAt"
FROM users
ORDER BY "CreatedAt" DESC;
```

### 5.4 Клиенты и количество счетов
```sql
SELECT c."Id",
       COALESCE(c."FirstName" || ' ' || c."LastName", c."CompanyName") AS full_name,
       COUNT(a."Id") AS accounts_count
FROM clients c
LEFT JOIN accounts a ON a."ClientId" = c."Id"
GROUP BY c."Id", full_name
ORDER BY accounts_count DESC, full_name;
```

### 5.5 Активные счета клиента
```sql
SELECT a."AccountNumber", a."AccountType", a."Currency", a."Balance", a."Status"
FROM accounts a
WHERE a."ClientId" = 'PUT-CLIENT-UUID-HERE'
  AND a."Status" = 'Active'
ORDER BY a."OpenedAt" DESC;
```

### 5.6 Последние 20 транзакций с именами владельцев
```sql
SELECT t."Id",
       t."Type",
       t."Status",
       t."Amount",
       t."Currency",
       t."CreatedAt",
       fa."AccountNumber" AS from_acc,
       ta."AccountNumber" AS to_acc
FROM transactions t
LEFT JOIN accounts fa ON fa."Id" = t."FromAccountId"
LEFT JOIN accounts ta ON ta."Id" = t."ToAccountId"
ORDER BY t."CreatedAt" DESC
LIMIT 20;
```

### 5.7 Сумма входящих/исходящих по клиенту
```sql
WITH client_accounts AS (
  SELECT "Id"
  FROM accounts
  WHERE "ClientId" = 'PUT-CLIENT-UUID-HERE'
)
SELECT
  SUM(CASE WHEN t."ToAccountId" IN (SELECT "Id" FROM client_accounts) THEN t."Amount" ELSE 0 END) AS total_in,
  SUM(CASE WHEN t."FromAccountId" IN (SELECT "Id" FROM client_accounts) THEN t."Amount" ELSE 0 END) AS total_out
FROM transactions t
WHERE t."Status" = 'Completed';
```

### 5.8 Подозрительные операции (алерты) за последние 7 дней
```sql
SELECT f."Id" AS alert_id,
       f."AnomalyType",
       f."RiskScore",
       f."Status",
       f."CreatedAt",
       t."Amount",
       t."Currency"
FROM fraud_alerts f
LEFT JOIN transactions t ON t."Id" = f."TransactionId"
WHERE f."CreatedAt" >= NOW() - INTERVAL '7 days'
ORDER BY f."CreatedAt" DESC;
```

### 5.9 Алерты без текста аналитики (проверка LLM fallback)
```sql
SELECT "Id", "AnomalyType", "RiskScore", "CreatedAt"
FROM fraud_alerts
WHERE "TriggerReason" IS NULL OR TRIM("TriggerReason") = ''
ORDER BY "CreatedAt" DESC;
```

### 5.10 Логины пользователя (успех/ошибка)
```sql
SELECT l."CreatedAt", l."Status", l."IpAddress", l."UserAgent"
FROM login_history l
JOIN users u ON u."Id" = l."UserId"
WHERE u."Email" = 'PUT-EMAIL-HERE'
ORDER BY l."CreatedAt" DESC
LIMIT 30;
```

### 5.11 Проверка индексов
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### 5.12 Топ клиентов по сумме оборота
```sql
SELECT c."Id",
       COALESCE(c."FirstName" || ' ' || c."LastName", c."CompanyName") AS full_name,
       SUM(t."Amount") AS turnover
FROM clients c
JOIN accounts a ON a."ClientId" = c."Id"
JOIN transactions t ON t."FromAccountId" = a."Id" OR t."ToAccountId" = a."Id"
WHERE t."Status" = 'Completed'
GROUP BY c."Id", full_name
ORDER BY turnover DESC
LIMIT 10;
```

---

## 6) Особенности проектирования и критические точки

1. **Разница `users` и `clients`:**  
   `users` — логин/роль/2FA; `clients` — банковские данные клиента.

2. **Почему роль поменяли, а 2FA/логин ведет себя "не так":**  
   нужно менять именно `users.Role`, плюс `users.IsActive`, `users.TwoFactorEnabled`, корректный `users.Email`.

3. **Почему приходит fallback по антифроду вместо LLM текста:**  
   timeout, нестандартный payload, недоступность Ollama. Fallback — ожидаемое безопасное поведение.

4. **Почему Redis не обязателен:**  
   сделан fallback в PostgreSQL для refresh token.

5. **Почему fraud alert есть, а операция "не прошла":**  
   suspicious операции переводятся в `Pending`/review и требуют решения.

---

## 7) Anti-fraud + ML + LLM: что спрашивают

### Вопрос: Как считается риск?
**Ответ:** ML.NET модель дает вероятность, сравниваем с порогом `FraudDetection:DefaultRiskScoreThreshold`, дополнительно классифицируем тип аномалии (`HighAmount`, `HighFrequency`, ...).

### Вопрос: Где хранится объяснение?
**Ответ:** в `fraud_alerts.TriggerReason`.

### Вопрос: Как работает realtime?
**Ответ:** после создания алерта отправляем событие в SignalR (`newFraudAlert`).

### Вопрос: Что если Ollama недоступна?
**Ответ:** сервис возвращает шаблонный fallback-текст, чтобы бизнес-процесс не падал.

---

## 8) Аутентификация/JWT/2FA: частые вопросы

### Вопрос: Почему JWT, а не session-cookie?
**Ответ:** stateless API, удобно для SPA/мобилок, роль/claims внутри токена, масштабирование проще.

### Вопрос: Где refresh token?
**Ответ:** Redis (primary) + PostgreSQL (backup), ротация при refresh.

### Вопрос: Как работает 2FA?
**Ответ:** после логина генерируется код, хэш кода хранится в `users.TwoFactorCode`, expiry в `users.TwoFactorCodeExpiry`, отправка на `users.Email`.

### Вопрос: Почему "код отправлен", но письма нет?
**Ответ:** SMTP может принять запрос, но письмо не доставится на несуществующий домен; также проверить SMTP-конфиг и логи отправки.

---

## 9) Сценарии администрирования и типичные задачи

### Сценарий A: "Показать всех кассиров с включенной 2FA"
```sql
SELECT "Email", "Role", "TwoFactorEnabled"
FROM users
WHERE "Role" = 'Cashier' AND "TwoFactorEnabled" = true;
```

### Сценарий B: "Найди клиента по номеру счета"
```sql
SELECT c."Id",
       COALESCE(c."FirstName" || ' ' || c."LastName", c."CompanyName") AS full_name,
       a."AccountNumber"
FROM accounts a
JOIN clients c ON c."Id" = a."ClientId"
WHERE a."AccountNumber" = 'PUT-ACCOUNT-NUMBER';
```

### Сценарий C: "Показать связи таблиц"
```sql
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;
```

### Сценарий D: "Показать подозрительные операции по убыванию риска"
```sql
SELECT "Id", "AnomalyType", "RiskScore", "Status", "CreatedAt"
FROM fraud_alerts
ORDER BY "RiskScore" DESC, "CreatedAt" DESC;
```

### Сценарий E: "Сколько транзакций у клиента за последние 24 часа"
```sql
WITH ca AS (
  SELECT "Id" FROM accounts WHERE "ClientId" = 'PUT-CLIENT-UUID-HERE'
)
SELECT COUNT(*) AS txn_24h
FROM transactions t
WHERE t."CreatedAt" >= NOW() - INTERVAL '24 hours'
  AND (t."FromAccountId" IN (SELECT "Id" FROM ca)
       OR t."ToAccountId" IN (SELECT "Id" FROM ca));
```

---

## 10) Глубокие вопросы по EF Core/PostgreSQL

### Вопрос: Почему не только migrations, а `EnsureCreated`?
**Ответ:** Изначально для dev-старта использовался `EnsureCreated`, но в итоговой версии реализован полноценный механизм миграций (EF Core Migrations) для контроля эволюции схемы и возможности деплоя на пром.

### Вопрос: Какие риски `EnsureCreated`?
**Ответ:** слабее контроль эволюции схемы, сложнее поддержка нескольких окружений.

### Вопрос: Где критично поставить индексы?
**Ответ:** `users.Email` (уникальный), FK поля (`UserId`, `ClientId`, `FromAccountId`, `ToAccountId`, `TransactionId`), поля фильтрации по датам/статусам.

### Вопрос: Что делать при `duplicate key`?
**Ответ:** проверить повторное добавление сущности в EF (`Add`), генерацию ID, транзакции и конкуренцию.

---

## 11) Безопасность: что могут спросить

### Вопрос: Где слабое место в конфиге?
**Ответ:** секреты в `appsettings.json` (например SMTP app password) — лучше env vars/secret manager.

### Вопрос: Что с CORS?
**Ответ:** в dev разрешены localhost origins; в проде список должен быть жестко ограничен.

### Вопрос: SQL injection?
**Ответ:** EF Core LINQ параметризует запросы; сырой SQL нужен аккуратно с параметрами.

### Вопрос: XSS/headers?
**Ответ:** добавлены security headers (`X-Frame-Options`, `CSP`, etc.), но CSP нужно тонко настраивать под фронт.

---

## 12) Чек-лист проверки развертывания

1. `docker compose ps` — все контейнеры up.  
2. `docker compose logs backend --tail 100` — без критических ошибок.  
3. Проверить:
   - логин + 2FA  
   - перевод/депозит  
   - создание fraud alert  
   - получение fraud alerts через API  
   - создание бэкапа и восстановление через Admin-панель
   - сброс пароля (забыли пароль) через email код
4. В pgAdmin подготовить вкладки с:
   - списком таблиц  
   - SQL из раздела 5  
   - FK-связями  
5. Быстро открыть и показать:
   - `Program.cs` (регистрация сервисов, auth, pipeline)  
   - `AuthController` (login/2FA)  
   - `FraudDetectionService` + `LlmService`  

---

## 13) Справочник по теории баз данных (ACID, JOIN, Нормализация)

### Вопрос: "Опиши ACID"
**Ответ:**  
- Atomicity: транзакция либо целиком, либо никак;  
- Consistency: БД из корректного состояния в корректное;  
- Isolation: параллельные транзакции не ломают друг друга;  
- Durability: после commit данные сохраняются.

### Вопрос: "Чем LEFT JOIN отличается от INNER JOIN?"
**Ответ:** `INNER` возвращает только совпавшие строки, `LEFT` — все слева + совпавшие справа.

### Вопрос: "Что такое нормализация?"
**Ответ:** устранение избыточности и аномалий обновления через разбиение на связанные таблицы.

### Вопрос: "Что такое индекс B-tree?"
**Ответ:** структура для ускорения поиска/сортировки по ключу, но увеличивает стоимость INSERT/UPDATE.

### Вопрос: "Почему not null важно?"
**Ответ:** защита целостности данных на уровне БД, меньше невалидных состояний.

---

## 14) Рекомендуемый сценарий тестирования функционала (5-7 минут)

1. Показать `docker compose ps`.  
2. Логин customer -> 2FA flow.  
3. Сделать транзакцию с высокой суммой.  
4. Показать `GET /api/fraud/alerts` и `triggerReason`.  
5. В pgAdmin выполнить:
   - список алертов,
   - join транзакции и счета,
   - связь таблиц через FK запрос.

---

## 15) Рекомендации по написанию ad-hoc SQL-запросов

Алгоритм:
1. Уточнить, из каких таблиц брать данные.  
2. Начать с `SELECT ... FROM ... LIMIT 10`.  
3. Добавить `JOIN` по FK.  
4. Добавить `WHERE`.  
5. Добавить `GROUP BY`/агрегацию при необходимости.  
6. Проверить сортировку и `NULL` (`COALESCE`).

---

Этот справочник поможет быстро сориентироваться в архитектурных деталях проекта и провести диагностику его состояния.
