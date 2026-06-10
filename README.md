# Спокій — щоденник тривожності

Веб-застосунок (HTML/CSS/JS) із бекендом «під ключ». Два режими роботи, **спільний
контракт API** (`/api/state/:email`), фронтенд однаковий в обох:

| Режим | Сховище | Хто обробляє `/api/...` | Коли |
|-------|---------|-------------------------|------|
| **Локальний** | **SQLite** (`data/spokiy.db`) | `serve.js` (Node) | розробка/тестування |
| **Vercel** | **Supabase** (Postgres) | serverless-функції в `api/` | прод-деплой |

Фронтенд (`js/storage.js`) в обох випадках просто ходить на `/api/state/:email`,
тож код сайту змінювати не треба — змінюється лише те, хто стоїть за цими шляхами.

## Вимоги

- **Node.js ≥ 22.5** (перевірити: `node -v`)

## Запуск

```bash
npm start
```

або

```bash
node serve.js
```

Після запуску відкрий у браузері: **http://127.0.0.1:3000**

> Важливо: відкривай саме через адресу сервера (`http://...`), а не файл `index.html`
> напряму. При відкритті через `file://` синхронізація з базою вимикається і дані
> зберігаються лише в `localStorage` браузера.

### Налаштування (необов'язково)

Змінні середовища:

| Змінна    | За замовчуванням      | Опис                                  |
|-----------|-----------------------|---------------------------------------|
| `PORT`    | `3000`                | Порт сервера                          |
| `HOST`    | `127.0.0.1`           | Адреса прослуховування                |
| `DB_PATH` | `./data/spokiy.db`    | Шлях до файлу бази SQLite             |

Приклад (PowerShell):

```powershell
$env:PORT=8080; node serve.js
```

## Як зберігаються дані

- Дані кожного акаунта прив'язані до **email** і лежать у таблиці `users`
  (`email`, `data` — JSON стану, `updated_at`).
- Файл бази: `data/spokiy.db` (створюється автоматично; у `.gitignore`).
- Фронтенд працює офлайн на `localStorage`, а у фоні синхронізується з бекендом:
  при вході підтягує дані акаунта, після кожної зміни — зберігає (перемагає
  новіша версія за `updatedAt`).

## REST API

| Метод    | Маршрут               | Опис                                  |
|----------|-----------------------|---------------------------------------|
| `GET`    | `/api/health`         | Перевірка стану сервера               |
| `GET`    | `/api/state/:email`   | Отримати стан акаунта                 |
| `PUT`    | `/api/state/:email`   | Зберегти стан (тіло = JSON)           |
| `DELETE` | `/api/state/:email`   | Видалити всі дані акаунта             |

## Деплой на Vercel із Supabase

На Vercel немає постійного диска, тож SQLite там не підходить — дані зберігаються
у **Supabase** (Postgres). Локально все лишається на SQLite.

**1. Створити проєкт Supabase** → у `SQL Editor` виконати вміст файлу
[`supabase/schema.sql`](supabase/schema.sql) (створить таблицю `public.users`).

**2. Взяти ключі** у Supabase: `Project Settings → API`:
- `Project URL` → змінна `SUPABASE_URL`
- `service_role` ключ → змінна `SUPABASE_SERVICE_ROLE_KEY` (секретний, лише сервер)

**3. У Vercel** (`Project → Settings → Environment Variables`) додати обидві змінні
для оточень Production/Preview. Шаблон — у [`.env.example`](.env.example).

**4. Задеплоїти** (Vercel сам підхопить статику з кореня й функції з `api/`):

```bash
npx vercel        # перший деплой / прев'ю
npx vercel --prod # прод
```

> Перевірка після деплою: `GET https://<домен>/api/health` має повернути
> `{ "ok": true, "supabase": true }`. Якщо `supabase: false` — змінні середовища
> не задані або деплой не перечитав їх (передеплой після додавання змінних).

### Які файли за що відповідають

| Файл | Призначення |
|------|-------------|
| `serve.js` | Локальний сервер + SQLite (НЕ використовується на Vercel) |
| `api/state/[email].js` | Vercel-функція: GET/PUT/DELETE стану в Supabase |
| `api/health.js` | Vercel-функція: статус + чи налаштовано Supabase |
| `supabase/schema.sql` | SQL для створення таблиці в Supabase |
| `vercel.json` | Конфіг функцій Vercel |
| `.env.example` | Перелік потрібних ключів |

### Потрібні ключі (тільки для Vercel/Supabase)

| Ключ | Де взяти | Де задати |
|------|----------|-----------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | Vercel → Env Variables |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | Vercel → Env Variables |

Локальний запуск цих ключів **не потребує** — він на SQLite.

## Резервне копіювання

- Локально: скопіювати файл `data/spokiy.db` (краще зупинивши сервер).
- Supabase: бекапи в дашборді Supabase або експорт таблиці `public.users`.
