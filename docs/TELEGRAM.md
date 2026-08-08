# Telegram-бот «Спокій» — розгортання

Бот надсилає короткі ранкові, денні та вечірні нагадування і повертає користувача на сайт.

## 1. BotFather

1. Відкрий [@BotFather](https://t.me/BotFather) у Telegram.
2. Надішли `/newbot`.
3. Вкажи ім'я (наприклад **Спокій**) та username (наприклад **SpokiyCareBot**).
4. Збережи **token** — він потрібен як `TELEGRAM_BOT_TOKEN`.
5. (Опційно) `/setdescription` — короткий опис бота.

## 2. Supabase

1. Відкрий **Supabase Dashboard → SQL Editor**.
2. Виконай нові таблиці з файлу `supabase/schema.sql` (блок `telegram_users` та `telegram_link_tokens`).
3. Переконайся, що вже існують таблиці `auth_credentials` та `users`.

## 3. Vercel — змінні середовища

**Project → Settings → Environment Variables:**

| Змінна | Опис |
|--------|------|
| `SUPABASE_URL` | URL проєкту Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (не anon!) |
| `TELEGRAM_BOT_TOKEN` | Token від BotFather |
| `TELEGRAM_BOT_USERNAME` | Username бота без `@` |
| `TELEGRAM_WEBHOOK_SECRET` | Довільний секрет (32+ символів) |
| `CRON_SECRET` | Довільний секрет для cron |
| `SITE_URL` | `https://spokiy.me` |

## 4. Деплой

```bash
git push origin main
```

Після деплою Vercel автоматично підхопить `api/telegram/*` та cron з `vercel.json`.

## 5. Реєстрація webhook

Один раз після деплою (заміни домен і секрет):

```bash
curl -X POST "https://spokiy.me/api/telegram/setup-webhook" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Або вручну через Telegram API:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://spokiy.me/api/telegram/webhook" \
  -d "secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET"
```

Перевірка:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## 6. Cron

У `vercel.json` налаштовано запуск **`/api/cron/rituals` кожні 15 хвилин**.

Cron надсилає Authorization: Bearer CRON_SECRET автоматично (Vercel Cron).

Ручна перевірка:

```bash
curl "https://spokiy.me/api/cron/rituals" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## 7. Підключення користувача

1. Користувач входить на сайт.
2. **Профіль → Підключити Telegram**.
3. Сайт створює одноразовий token (15 хв).
4. Відкривається `https://t.me/BOT?start=link_TOKEN`.
5. Користувач натискає **Start** — `telegram_id` зберігається в `telegram_users`.

## 8. Налаштування нагадувань

У боті: **⚙️ Налаштування**

- Ранкові / денні / вечірні — увімкнути або вимкнути
- Час кожного нагадування
- Дні тижня
- Часовий пояс (за замовчуванням `Europe/Kyiv`)

Усі нагадування **вимкнені** після першого підключення.

## 9. Локальна розробка

```bash
cp .env.example .env
# заповни TELEGRAM_* та CRON_SECRET

node serve.js
```

Локально webhook потребує публічного URL (ngrok):

```bash
ngrok http 3000
# setup-webhook з URL ngrok
```

## 10. Безпека

- Токени **тільки** в env, ніколи в коді чи git.
- Webhook перевіряє заголовок `X-Telegram-Bot-Api-Secret-Token`.
- Cron захищений `CRON_SECRET`.
- Link token — одноразовий, 15 хвилин.
- Особисті дані в Telegram не показуються — лише власні відповіді користувача.

## API

| Метод | Шлях | Опис |
|-------|------|------|
| POST | `/api/telegram/webhook` | Webhook Telegram |
| GET | `/api/telegram/link` | Статус підключення (Bearer) |
| POST | `/api/telegram/link` | Створити link token (Bearer) |
| DELETE | `/api/telegram/link` | Відключити Telegram (Bearer) |
| GET/POST | `/api/cron/rituals` | Cron нагадувань |
| POST | `/api/telegram/setup-webhook` | Одноразова реєстрація webhook |
