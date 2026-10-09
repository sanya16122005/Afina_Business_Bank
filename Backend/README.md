# Банк Афина — Backend (Standalone Test)

## Быстрый запуск (Docker)

```bash
# 1. Перейти в папку проекта
cd afina-test

# 2. Запустить всё одной командой
docker-compose up --build

# 3. Готово! API доступно на http://localhost:5000
```

## Запуск без Docker (локально)

### Требования:
- .NET 10 SDK
- PostgreSQL (запущен на localhost:5432)

```bash
# 1. Создать БД
psql -U postgres -c "CREATE DATABASE bankdb;"

# 2. Перейти в Backend
cd afina-test/Backend

# 3. Поменять строку подключения в appsettings.json:
#    "Host=postgres" → "Host=localhost"

# 4. Запустить
dotnet run
```

## Учётки для входа

При первом старте бэк автоматически создаёт две инфраструктурные учётки:

| Роль | Email | Пароль |
| --- | --- | --- |
| Admin | `admin@afina-bank.demo` | `AdminSecurePass123!` |
| Cashier | `cashier@afina-bank.demo` | `CashierSecurePass123!` |

Обе с выключенной 2FA — чтобы можно было сразу зайти и продолжить регистрацию клиентов через `/api/auth/register`. Клиентских данных по умолчанию нет.

## Тестирование API

### 1. Регистрация клиента
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@test.com",
    "password": "TestPass123!",
    "confirmPassword": "TestPass123!",
    "firstName": "Иван",
    "lastName": "Тестов",
    "phoneNumber": "+79001234567"
  }'
```

### 2. Логин (вернёт pendingToken для 2FA или сразу токен)
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@afina-bank.demo",
    "password": "AdminSecurePass123!"
  }'
```
> Для admin/cashier 2FA отключена — сразу получите JWT токен.

### 3. Любой защищённый эндпоинт
```bash
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer ВСТАВЬТЕ_ТОКЕН_СЮДА"
```

### 4. Публичные эндпоинты (без авторизации)
```bash
curl http://localhost:5000/api/public/about
curl http://localhost:5000/api/public/tariffs
curl http://localhost:5000/api/public/faq
```

## Полный список эндпоинтов

### Публичные (без авторизации)
- `GET  /api/public/about` — Информация о банке
- `GET  /api/public/tariffs` — Тарифы
- `GET  /api/public/faq` — FAQ

### Аутентификация
- `POST /api/auth/register` — Регистрация
- `POST /api/auth/login` — Вход (шаг 1)
- `POST /api/auth/verify-2fa` — Подтверждение 2FA (шаг 2)
- `POST /api/auth/resend-2fa` — Повторная отправка кода
- `POST /api/auth/refresh` — Обновление токена
- `POST /api/auth/logout` — Выход
- `PUT  /api/auth/change-password` — Смена пароля
- `GET  /api/auth/login-history` — История входов

### Клиент (Customer)
- `GET  /api/customer/dashboard` — Главная панель
- `GET  /api/users/profile` — Профиль
- `PUT  /api/users/profile` — Обновить профиль
- `PUT  /api/users/settings` — Обновить настройки
- `GET  /api/accounts` — Список счетов
- `GET  /api/accounts/{id}` — Детали счёта
- `POST /api/accounts` — Открыть счёт
- `POST /api/accounts/preview` — Предпросмотр
- `GET  /api/accounts/lookup?accountNumber=` — Поиск счёта
- `GET  /api/transactions` — История транзакций
- `POST /api/transactions/transfer` — Перевод

### Кассир (Cashier)
- `POST /api/cashier/sessions` — Начать сеанс
- `GET  /api/cashier/sessions/{id}/status` — Статус сеанса
- `POST /api/cashier/sessions/{id}/end` — Завершить сеанс
- `GET  /api/cashier/clients` — Список клиентов
- `GET  /api/cashier/clients/{id}` — Карточка клиента
- `POST /api/cashier/clients` — Регистрация клиента
- `PUT  /api/cashier/clients/{id}` — Обновить клиента
- `DELETE /api/cashier/clients/{id}` — Удалить клиента
- `POST /api/cashier/accounts` — Открыть счёт клиенту
- `DELETE /api/cashier/accounts/{id}` — Закрыть счёт
- `POST /api/cashier/transactions/deposit` — Пополнение
- `POST /api/cashier/transactions/withdraw` — Снятие
- `POST /api/cashier/transactions/transfer` — Перевод
- `GET  /api/cashier/sessions/{id}/deposits` — Поступления сеанса
- `GET  /api/cashier/sessions/{id}/report` — Отчёт по сеансу

### Администратор (Admin)
- `GET  /api/admin/users` — Список пользователей
- `POST /api/admin/users` — Создать пользователя
- `PATCH /api/admin/users/{id}/role` — Изменить роль
- `PATCH /api/admin/users/{id}/status` — Блок/разблок
- `DELETE /api/admin/users/{id}` — Удалить
- `GET  /api/admin/audit` — Журнал аудита
- `GET  /api/admin/audit/{id}` — Детали события
- `GET  /api/admin/analytics` — Аналитика

### Антифрод (Cashier + Admin)
- `GET  /api/fraud/alerts` — Подозрительные операции
- `GET  /api/fraud/alerts/{id}` — Детали алерта
- `POST /api/fraud/alerts/{id}/resolve` — Решение по алерту

### SignalR (WebSocket)
- `/hubs/fraud` — Push-уведомления о новых алертах

## Настройка Gmail 2FA
В `appsettings.json` заменить:
```json
"Email": {
  "SenderEmail": "ваш-email@gmail.com",
  "AppPassword": "xxxx xxxx xxxx xxxx"
}
```
Как получить App Password: Google Account → Security → 2-Step Verification → App passwords

## Переход на основной проект
Когда тест пройден — для интеграции в основной проект:
1. Скопировать всё из `Backend/` в ваш `Backend/`
2. Удалить старую папку `Migrations/`
3. Выполнить: `dotnet ef migrations add InitialCreate`
4. Запустить: `docker-compose up --build`
