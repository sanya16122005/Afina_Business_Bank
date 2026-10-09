# Афина Банк — Frontend

SPA на React 19 для демонстрационного проекта «Цифровой банкинг АФИНА». Один интерфейс обслуживает три роли — клиента, кассира и администратора — поверх общего ASP.NET Core бэкенда.

> Этот README описывает только `frontend/`. Бэкенд и docker-compose живут в корне репозитория.

---

## Содержание

1. [Что внутри](#что-внутри)
2. [Стек](#стек)
3. [Запуск](#запуск)
4. [Переменные окружения](#переменные-окружения)
5. [Архитектура](#архитектура)
6. [Маршруты и роли](#маршруты-и-роли)
7. [Аутентификация и 2FA](#аутентификация-и-2fa)
8. [Работа с API](#работа-с-api)
9. [Реактивные обновления (SignalR)](#реактивные-обновления-signalr)
10. [State management и контексты](#state-management-и-контексты)
11. [UI-дизайн-система](#ui-дизайн-система)
12. [Темы (светлая / тёмная / системная)](#темы-светлая--тёмная--системная)
13. [Доступность (a11y)](#доступность-a11y)
14. [Производительность](#производительность)
15. [Mock-режим для разработки](#mock-режим-для-разработки)
16. [Соглашения и стиль кода](#соглашения-и-стиль-кода)
17. [Структура каталога](#структура-каталога)
18. [Известные ограничения](#известные-ограничения)

---

## Что внутри

- **Публичный сайт:** лендинг АФИНА БАНК с формой входа.
- **Аутентификация:** регистрация, логин, 2FA через email-код с таймером истечения и кулдауном на повторную отправку.
- **Личный кабинет клиента:** дашборд с балансами в RUB/USD/EUR, список и детали счетов, история операций с фильтрами и поиском, переводы между счетами, профиль с темой и настройками.
- **Рабочее место кассира:** статус кассового сеанса, поиск и операции по клиентам (открытие счетов, депозиты, выдачи, переводы), ежедневные отчёты, антифрод-лента.
- **Панель администратора:** ключевые метрики, антифрод (с короткой LLM-сводкой и полным выводом), журнал аудита, аналитика по операциям, управление пользователями.
- **Реалтайм-обновления антифрода** через SignalR — алерты появляются в дашборде без обновления страницы.
- **Унифицированная UX-надстройка:** глобальные toast-уведомления, confirm-модалки, скелетоны загрузки, empty states, единый Spinner.
- **Тёмная тема + системная** — переключается из шапки или профиля, переключатель плавающий.

---

## Стек

| Слой | Что используется |
| --- | --- |
| UI | React 19, react-router-dom 7, react-scripts 5 (CRA) |
| Стили | SCSS (sass), компонентные BEM-классы, дизайн-токены через CSS custom properties |
| HTTP | axios + интерцепторы (auto-refresh JWT) |
| Realtime | @microsoft/signalr |
| Иконки | lucide-react |
| Экспорт | xlsx (для отчётов кассира) |
| Тестирование | @testing-library/react (set up, тесты пока минимальны) |

---

## Запуск

### Локально (без Docker)

```bash
cd frontend
npm install
npm start
```

Открой `http://localhost:3000`. Бэкенд должен быть поднят на `http://localhost:5000` (CRA-proxy в `package.json`).

### Через docker-compose (из корня репозитория)

```bash
docker compose up -d --build backend frontend
```

Фронтенд собирается из `frontend/Dockerfile`. После изменений исходников контейнер нужно пересобирать (`--build`).

### Сборка production

```bash
cd frontend
npm run build
```

Результат — статика в `frontend/build/`, готовая для любого статического хостинга.

---

## Переменные окружения

Создай `.env.local` в `frontend/` (CRA автоматически подхватит):

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `REACT_APP_API_URL` | пусто (используется CRA-proxy) | Явный адрес бэкенда. Указывай, если фронт развёрнут отдельно. |
| `REACT_APP_ENABLE_MOCK` | `false` | Включает mock-fallback для логина (только для dev-сборки, в production вырезается DCE). |

Все переменные должны начинаться с `REACT_APP_` — это требование CRA.

---

## Архитектура

```
src/
├── App.jsx              ← роуты + role-based PrivateRoute + Suspense fallback
├── index.js             ← bootstrap (ReactDOM.createRoot)
├── api/                 ← axios-обёртки над REST-эндпоинтами
├── components/
│   ├── ErrorBoundary.jsx
│   ├── layout/          ← Layout, Sidebar, Header, GlassBackground
│   └── ui/              ← дизайн-система (Modal, Spinner, Toast и т.д.)
├── constants/           ← разделяемые константы (валюты, статусы, тип-иконки)
├── context/             ← AuthContext, ThemeContext, ToastContext
├── data/                ← mockData.js (только для разработки)
├── hooks/               ← useCashierSession, useFraudAlertsRealtime
├── pages/
│   ├── public/          ← LandingPage
│   ├── auth/            ← LoginPage, RegisterPage
│   ├── customer/        ← Dashboard, Accounts, Transactions, Transfer, Profile
│   ├── cashier/         ← Dashboard, Clients, Operations, Reports, Fraud
│   └── admin/           ← Dashboard, Users, Audit, Analytics, Fraud
├── styles/              ← main.scss (агрегатор) + partials
└── utils/               ← format, transactionUtils, fraudAlerts, accountDesign, cashierSession
```

**Ключевые принципы:**

- Все роуты, кроме публичных, обёрнуты в `<PrivateRoute roles=[...]>`. Если у пользователя нет нужной роли — редирект на `/login`.
- Маршруты лениво-загружаемые (`React.lazy`) — бандл разбит по ролям, на главную грузится только нужное.
- Состояние сессии (user + JWT + refreshToken) хранится в `localStorage`, чтобы перезагрузка не выбивала пользователя.
- API-запросы идут через инстанс axios с двумя интерцепторами: подкладывает `Authorization: Bearer <token>` и автоматически рефрешит токен на 401.

---

## Маршруты и роли

| Путь | Роль | Что делает |
| --- | --- | --- |
| `/` | — | Лендинг |
| `/login` | — | Логин + 2FA |
| `/register` | — | Регистрация клиента |
| `/dashboard` | Customer | Сводка балансов, последние операции |
| `/accounts` | Customer | Список счетов + открытие нового |
| `/accounts/:id` | Customer | Детали счёта, выписка |
| `/transactions` | Customer | История с фильтрами и поиском |
| `/transfer` | Customer | Перевод между своими счетами |
| `/profile` | Customer | Профиль, тема, изменение пароля |
| `/cashier` | Cashier | Дашборд с кассовым сеансом и поиском клиентов |
| `/cashier/clients` | Cashier | Все клиенты |
| `/cashier/clients/:id` | Cashier | Карточка клиента + операции |
| `/cashier/ops` | Cashier | Все операции за смену |
| `/cashier/reports` | Cashier | Z-отчёты, экспорт XLSX |
| `/cashier/fraud` | Cashier | Антифрод-лента кассира |
| `/admin` | Admin | Метрики, антифрод-лента, аудит |
| `/admin/users` | Admin | CRUD пользователей |
| `/admin/audit` | Admin | Журнал событий |
| `/admin/analytics` | Admin | Статистика |
| `/admin/fraud` | Admin | Управление антифрод-алертами |

---

## Аутентификация и 2FA

Поток логина устроен так:

1. **`POST /api/auth/login`** с email/password.
2. Если у юзера включён 2FA, бэк возвращает `requiresTwoFactor: true`, `pendingToken`, `expiresInMinutes` и **отправляет код на email**.
3. Фронтенд показывает `TwoFactorModal` и **сохраняет** `{email, pendingToken, expiresAt, lastSentAt}` в `localStorage` (ключ `afina_pending_2fa`).
4. **`POST /api/auth/verify-2fa`** с кодом → бэк возвращает `token + refreshToken + user`. Сохранённый pending очищается.

### Кулдаун повторной отправки

- Кнопка «Отправить код повторно» внутри `TwoFactorModal` блокируется на **60 секунд** после каждой отправки.
- Метка времени `lastSentAt` хранится в localStorage — если юзер закрыл модалку и сразу открыл логин, он увидит правильный остаток таймера, а не свежий 60-секундный.
- Если кулдаун ещё активен и юзер всё-таки нажимает «отправить», `AuthContext.resend2fa` отвечает `{ ok: false, retryAfterSeconds: N }` без обращения к бэку.

### Переиспользование кода между попытками входа

Если код уже был запрошен и не истёк (по дефолту 5 минут):

- При повторной попытке логина с тем же email **бэкенд не дёргается**, новое письмо не отправляется.
- `AuthContext.login` сразу возвращает сохранённый `pendingToken` и оставшееся время.
- Это убирает спам писем при «случайно перезагрузил страницу» / «ввёл пароль ещё раз».

### Refresh-токен

- При 401 на любом запросе (кроме `/auth/login` и `/auth/refresh`) axios-интерцептор:
  1. блокирует все параллельные запросы,
  2. вызывает `POST /api/auth/refresh` с `refreshToken`,
  3. сохраняет новый JWT, повторяет исходный запрос.
- Если refresh не удался → редирект на `/login` с очисткой localStorage.

---

## Работа с API

Базовый URL: `${REACT_APP_API_URL}/api` (или CRA-proxy на `http://localhost:5000`).

| Файл | Что внутри |
| --- | --- |
| `src/api/auth.js` | login, verify-2fa, resend-2fa, register, refresh, logout, change-password, login-history + общий axios-инстанс с интерцепторами |
| `src/api/accounts.js` | getAccounts, createAccount, getProfile, updateProfile, deposit/withdraw |
| `src/api/transactions.js` | getTransactions, transfer |
| `src/api/cashier.js` | getClients, openSession, closeSession, sessionOps, отчёты |
| `src/api/admin.js` | getAnalytics, getAuditLog, getFraudAlerts, управление пользователями |
| `src/api/response.js` | Хелперы `getResponseList(r)` / `getResponseData(r)` — нормализуют ответы вида `{data: ...}`, `{items: ...}`, прямого массива и т.д. |

---

## Реактивные обновления (SignalR)

Хук `useFraudAlertsRealtime` подключается к хабу `/hubs/fraud`:

- Подписки: `OnNewAlert`, `OnAlertUpdated`.
- Состояния соединения: `connecting | connected | reconnecting | error | disabled`.
- Дашборд админа отображает индикатор `Live · онлайн/нет связи` рядом с заголовком.
- При получении нового алерта список обновляется in-place + дотягивается актуальная аналитика.

---

## State management и контексты

Без Redux. Глобальное состояние делится на три провайдера:

### `AuthContext`

- `user`, `token`, `login`, `verify2fa`, `resend2fa`, `register`, `logout`, `refreshUser`, `syncUser`.
- Хранит сессию в localStorage (`afina_user`, `token`, `refreshToken`, `afina_pending_2fa`).
- Mock-fallback для разработки (включается `REACT_APP_ENABLE_MOCK=true` + только в dev-сборке).

### `ToastContext`

- API: `toast.success(msg)`, `toast.danger(msg)`, `toast.warning`, `toast.info`, `toast.promise(p, opts)`.
- Глобальный стек тостов рендерится через провайдер, `aria-live="polite"`.
- Рекомендуется использовать `toast.danger` для всех неудачных API-запросов вместо «тихих» catch.
- Объект `toast` стабилизирован через `useMemo` — можно безопасно класть в depencies useEffect/useCallback.

### `ThemeContext`

- `light | dark | system`.
- Сохраняется в localStorage, применяется через `data-theme` на `<html>`.
- Реагирует на `prefers-color-scheme` если выбрано «system».

### Локальные хуки

- `useCashierSession()` — состояние смены кассира с авто-открытием.
- `useFraudAlertsRealtime({...})` — SignalR-подписка с автоповтором.

---

## UI-дизайн-система

Все переиспользуемые компоненты лежат в `src/components/ui/`:

| Компонент | Назначение |
| --- | --- |
| `Modal` | Базовая модалка с focus trap, focus restore, ESC-закрытием, `role="dialog" aria-modal` |
| `ConfirmModal` | Подтверждение действия поверх Modal — для удаления, завершения смены и т.д. |
| `TwoFactorModal` | OTP-инпут на 6 цифр, таймер истечения, таймер кулдауна resend |
| `Toast` (через ToastContext) | Глобальные уведомления, авто-dismiss через 4 с |
| `Spinner` | Inline-спиннер для кнопок; принимает `label`, чтобы озвучиться скринридером |
| `Skeleton` | Заглушки во время загрузки + `Skeleton.Card`, `Skeleton.Lines` |
| `EmptyState` | «Тут пока ничего нет» с иконкой, заголовком, подсказкой и опциональным action |
| `DropdownSelect` | Селект через portal, поддерживает клавиатурную навигацию (↑↓, Home/End, Enter/Space, Esc) |
| `Badge`, `Card`, `Button`, `Table` | Тонкие обёртки над дизайн-токенами |
| `AfinaLogo` | Брендовая «А»-метка |
| `AccountDesignPicker` | Палитра дизайнов карт счёта |
| `ThemeToggle` | Переключатель светлой/тёмной/системной темы |

### Общие константы

`src/constants/accounts.js` экспортирует:

- `CURRENCY_SYMBOL` — `{ RUB: '₽', USD: '$', EUR: '€' }`
- `ACCOUNT_TYPE_LABEL`, `ACCOUNT_SUBTYPE_LABEL` — тексты типов счетов
- `ACCOUNT_STATUS_TONE`, `ACCOUNT_STATUS_LABEL` — статус-маппинги
- `TRANSACTION_TYPE_ICON` — компоненты иконок lucide для каждого типа транзакции
- `TRANSACTION_TYPE_LABEL` — человеческие названия

Используй их вместо локальных дубликатов — все клиентские страницы уже на этом.

### Хелперы форматирования

`src/utils/format.js` — единое форматирование дат, денег, телефонов и процентов с локалью `ru-RU`. Используй вместо ручных `toLocaleDateString`.

---

## Темы (светлая / тёмная / системная)

- Управляется через `ThemeContext` + атрибут `data-theme` на `<html>`.
- Все цвета — CSS-токены, объявлены в `src/styles/_variables.scss` и переопределены под `[data-theme="dark"]`.
- Переключатель `ThemeToggle floating` рендерится в `App.jsx` поверх роутов, виден всегда.
- Поддерживается `prefers-reduced-motion` — анимации отключаются, если пользователь так настроил.

---

## Доступность (a11y)

Что уже сделано:

- **Modal** — focus trap (Tab/Shift+Tab крутятся внутри), focus restore при закрытии, ESC-закрытие, `role="dialog" aria-modal="true" aria-label`.
- **DropdownSelect** — полноценная клавиатурная навигация (↑↓, Home/End, Enter, Esc, Tab закрывает), `aria-haspopup`, `aria-expanded`, `aria-activedescendant`, `role="listbox"/option"`.
- **Spinner** — по умолчанию декоративный (`aria-hidden`); если рендерится один (без соседнего текста), передай `label` — будет `role="status" aria-label="..."`.
- **Toast-стек** — `role="region" aria-live="polite"`.
- **2FA-инпуты** — `inputMode="numeric"`, `autoComplete="one-time-code"`, авто-фокус на первом, паст всех 6 цифр работает.
- **Иконочные кнопки** — везде где нет видимого текста, есть `aria-label`.

Что остаётся (не критично для демо-проекта): полноценная страница `prefers-contrast`, ARIA-описания таблиц, ручное тестирование с NVDA/VoiceOver.

---

## Производительность

- **Code splitting:** все страницы загружаются через `React.lazy` — на лендинге грузится только лендинг.
- **`Suspense` fallback** — лёгкий лоадер `RouteFallback`, виден меньше секунды.
- **`useMemo`** — на тяжёлых страницах клиента (Dashboard, Accounts, Transactions): мемоизированы фильтрация, сводки и подсчёты доходов/расходов.
- **`useCallback`** — на колбэках, передаваемых в дочерние мемоизированные компоненты.
- **`Promise.allSettled`** — параллельные загрузки данных не ломаются, если упал один из эндпоинтов; ошибки показываются точечно через toast.
- **Контексты стабильны** — `ToastContext` оборачивает API в `useMemo`, чтобы не триггерить re-renders консьюмеров.
- **Cancelled flag** — все async-загрузки в useEffect помечены флагом `cancelled`, чтобы не было setState на размонтированном компоненте.

---

## Mock-режим для разработки

Если бэкенд не поднят, можно работать с моковыми данными:

```bash
echo "REACT_APP_ENABLE_MOCK=true" >> frontend/.env.local
npm start
```

- Mock-аккаунты определены в `src/data/mockData.js` (Customer, Cashier, Admin).
- Логин для Customer всё равно проходит через 2FA-модалку (любой 6-значный код принимается).
- Mock-ветка вырезается webpack DCE из production-сборки — в проде секреты не попадут.

---

## Соглашения и стиль кода

- **Расширения:** UI-компоненты и контексты — `.jsx`; утилиты, константы, хуки — `.js`.
- **Импорты:** абсолютные пути не используются (нет `jsconfig`), всегда относительные.
- **Naming:** `PascalCase` для компонентов, `camelCase` для функций/переменных, `UPPER_SNAKE_CASE` для констант, `_underscore.scss` для SCSS partials.
- **State:** локальный `useState`/`useReducer` по умолчанию; глобальное только в контекстах.
- **Стили:** пиши в SCSS, не в `style={{}}`. Inline-стиль допустим только для одноразовых динамических значений (например, ширина скелета).
- **Ошибки API:** не используй `.catch(() => {})`. Минимум — `toast.danger('понятное сообщение')`.
- **Date:** через хелперы `formatDate` / `formatDateTime` из `utils/format.js`.
- **Деньги:** через `formatMoney(value, currency)` или `CURRENCY_SYMBOL` для коротких отображений.

---

## Структура каталога

```
frontend/
├── public/                  ← favicon, манифест, статические ассеты
├── src/
│   ├── api/                 ← axios-клиенты
│   ├── assets/              ← изображения, SVG
│   ├── components/
│   │   ├── ErrorBoundary.jsx
│   │   ├── layout/          ← Layout, Sidebar, Header, GlassBackground
│   │   └── ui/              ← дизайн-система (см. выше)
│   ├── constants/
│   │   └── accounts.js      ← общие константы валют/статусов/иконок
│   ├── context/             ← AuthContext, ThemeContext, ToastContext
│   ├── data/                ← mockData.js
│   ├── hooks/               ← useCashierSession, useFraudAlertsRealtime
│   ├── pages/
│   │   ├── public/          ← LandingPage
│   │   ├── auth/            ← LoginPage, RegisterPage
│   │   ├── customer/        ← Dashboard, Accounts, AccountDetail, Transactions, Transfer, Profile
│   │   ├── cashier/         ← Dashboard, Clients, ClientDetail, Operations, Reports, Fraud
│   │   └── admin/           ← Dashboard, Users, Audit, Analytics, Fraud
│   ├── styles/
│   │   ├── main.scss        ← главный агрегатор
│   │   ├── _variables.scss  ← дизайн-токены
│   │   ├── _utilities.scss  ← u-mb-*, u-mt-*, u-text-* и т.п.
│   │   ├── _extras.scss     ← Spinner, EmptyState, мобильные правила
│   │   └── _mixins.scss
│   ├── utils/
│   │   ├── format.js
│   │   ├── transactionUtils.js
│   │   ├── fraudAlerts.js
│   │   ├── accountDesign.js
│   │   └── cashierSession.js
│   ├── App.jsx
│   └── index.js
├── Dockerfile
├── package.json
└── README.md                ← этот файл
```

---

## Известные ограничения

- **Тесты** есть только базовые (testing-library настроен), полного покрытия нет — это демонстрационный проект, не продакшн.
- **Нет SSR** — обычный CRA SPA.
- **Refresh-токен в localStorage** — в проде стоило бы сложить в httpOnly cookie, но это требует доработки бэка.
- **Mock-fallback** включается флагом — в production вырезается, но не оставляйте `REACT_APP_ENABLE_MOCK=true` в prod-окружении.
- **Один trusted-device на 2FA** не реализован (фича обсуждалась, отложена) — каждая новая сессия требует код, кроме случая «тот же email в течение жизни уже выпущенного pending».

---

## Лицензия

Демонстрационный портфолио-проект. Использование на своё усмотрение.
