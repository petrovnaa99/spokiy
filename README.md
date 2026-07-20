# Спокій — щоденник тривожності

Веб-застосунок (HTML/CSS/JS) без збірки. Дані користувача зберігаються в
**Supabase** через serverless API (`/api/state/:email`). Локально працює
SQLite через `serve.js`.

| Середовище | База | API | Запуск |
|------------|------|-----|--------|
| **Локально** | **SQLite** (`data/spokiy.db`) | `serve.js` (Node) | `npm start` |
| **Vercel** | **Supabase** (Postgres) | serverless-функції в `api/` | push у GitHub |

Клієнт (`js/storage.js`) працює cloud-first: при `http(s)` на хостингу йде
запит до `/api/state/:email`. `localStorage` використовується як кеш/офлайн-резерв.

## Вимоги

- **Node.js ≥ 22.5** (перевірка: `node -v`)

## Локально

```bash
npm start
```

Сайт відкриється: **http://127.0.0.1:3000**

> Відкривай саме через сервер (`http://...`), а не файл `index.html` напряму.

### Змінні (опційно)

| Змінна    | За замовчуванням   | Опис                      |
|-----------|--------------------|---------------------------|
| `PORT`    | `3000`             | Порт сервера              |
| `HOST`    | `127.0.0.1`        | Адреса прослуховування    |
| `DB_PATH` | `./data/spokiy.db` | Шлях до SQLite            |

## Де зберігаються дані

**Для користувача:**

- Записи зберігаються **автоматично** під твоїм акаунтом (email).
- На іншому пристрої — увійди під тим самим email, дані підтягнуться.
- У профілі: **«Завантажити копію даних»** або **«Експорт у PDF»**.

**Для розробника:** Supabase на Vercel, SQLite локально — схема в `supabase/schema.sql` та `api/state/[email].js`.

## REST API

| Метод    | Шлях                  | Опис                        |
|----------|-----------------------|-----------------------------|
| `GET`    | `/api/health`         | Перевірка стану сервера     |
| `GET`    | `/api/state/:email`   | Отримати дані користувача   |
| `PUT`    | `/api/state/:email`   | Зберегти дані (тіло = JSON) |
| `DELETE` | `/api/state/:email`   | Видалити всі дані           |

## Деплой на Vercel + Supabase

1. Виконай [`supabase/schema.sql`](supabase/schema.sql) у Supabase SQL Editor.
2. Додай у Vercel env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (див. [`.env.example`](.env.example)).
3. Запуш зміни в GitHub — Vercel задеployить автоматично (або `npx vercel --prod`).
4. Перевір: `GET https://<домен>/api/health` → `{ "ok": true, "supabase": true }`

Telegram-бот: інструкція в [`docs/TELEGRAM.md`](docs/TELEGRAM.md).

## Резервна копія

- **На сайті:** профіль → «Завантажити копію даних» або «Експорт у PDF».
- **Локально (розробник):** файл `data/spokiy.db`.