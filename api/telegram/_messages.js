"use strict";

const DEFAULT_SETTINGS = {
  morning: { enabled: false, time: "08:00", days: [0, 1, 2, 3, 4, 5, 6] },
  midday: { enabled: false, time: "14:00", days: [0, 1, 2, 3, 4, 5, 6], hoursAfterMorning: 5 },
  evening: { enabled: false, time: "21:00", days: [0, 1, 2, 3, 4, 5, 6] },
  timezone: "Europe/Kyiv"
};

const MOODS = {
  great: { emoji: "😊", label: "Добре", value: 5 },
  ok: { emoji: "🙂", label: "Нормально", value: 4 },
  anxious: { emoji: "😔", label: "Тривожно", value: 2 },
  hard: { emoji: "😣", label: "Дуже важко", value: 1 }
};

const DAY_LABELS = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function siteUrl() {
  const u = process.env.SITE_URL || process.env.VERCEL_URL;
  if (!u) return "https://example.com";
  return u.startsWith("http") ? u.replace(/\/$/, "") : `https://${u.replace(/\/$/, "")}`;
}

/** Банка Monobank / інше посилання на оплату. */
function paymentUrl() {
  return process.env.PAYMENT_URL || "https://send.monobank.ua/jar/5463k5JUAN";
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🌿 Відкрити Спокій", url: siteUrl() }],
      [
        { text: "😊 Як я зараз?", callback_data: "act:now" },
        { text: "🧘 Швидко заспокоїтися", callback_data: "act:calm" }
      ],
      [{ text: "₴ Оплата та доступ", callback_data: "act:pay" }],
      [{ text: "⚙️ Налаштування", callback_data: "set:menu" }]
    ]
  };
}

function paymentKeyboard() {
  const rows = [];
  const pay = paymentUrl();
  if (pay) rows.push([{ text: "💳 Перейти до оплати", url: pay }]);
  rows.push([{ text: "ℹ️ Деталі на сайті", url: `${siteUrl()}/?route=payment` }]);
  rows.push([{ text: "← Назад", callback_data: "menu:home" }]);
  return { inline_keyboard: rows };
}

function moodRow(prefix) {
  return Object.entries(MOODS).map(([k, m]) => ({
    text: m.emoji,
    callback_data: `${prefix}:${k}`
  }));
}

function calmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧘 Дихання", url: `${siteUrl()}/?sos=breath` }],
      [{ text: "🌳 Заземлення", url: `${siteUrl()}/?sos=ground` }],
      [{ text: "📝 Записати думки", url: `${siteUrl()}/?route=new` }],
      [{ text: "← Назад", callback_data: "menu:home" }]
    ]
  };
}

function settingsMenu(settings) {
  const s = settings || DEFAULT_SETTINGS;
  const on = (v) => (v ? "✅" : "○");
  return {
    inline_keyboard: [
      [{ text: `${on(s.morning.enabled)} Ранкові`, callback_data: "set:mrn:toggle" }],
      [{ text: `${on(s.midday.enabled)} Денні`, callback_data: "set:mid:toggle" }],
      [{ text: `${on(s.evening.enabled)} Вечірні`, callback_data: "set:eve:toggle" }],
      [{ text: `🕐 Час ранку: ${s.morning.time}`, callback_data: "set:mrn:time" }],
      [{ text: `🕐 Час дня: ${s.midday.time}`, callback_data: "set:mid:time" }],
      [{ text: `🕐 Час вечора: ${s.evening.time}`, callback_data: "set:eve:time" }],
      [{ text: `📅 Дні: ${formatDays(s.morning.days)}`, callback_data: "set:days" }],
      [{ text: `🌍 Часовий пояс: ${s.timezone}`, callback_data: "set:tz" }],
      [{ text: "← Назад", callback_data: "menu:home" }]
    ]
  };
}

function formatDays(days) {
  const d = Array.isArray(days) ? days : DEFAULT_SETTINGS.morning.days;
  if (d.length === 7) return "щодня";
  return d.map((i) => DAY_LABELS[i] || i).join(", ");
}

function timePickKeyboard(prefix) {
  const times = ["07:00", "08:00", "09:00", "10:00", "12:00", "14:00", "18:00", "20:00", "21:00", "22:00"];
  const rows = [];
  for (let i = 0; i < times.length; i += 2) {
    rows.push(times.slice(i, i + 2).map((t) => ({
      text: t,
      callback_data: `${prefix}:time:${t}`
    })));
  }
  rows.push([{ text: "← Назад", callback_data: "set:menu" }]);
  return { inline_keyboard: rows };
}

function timezoneKeyboard() {
  const zones = ["Europe/Kyiv", "Europe/Warsaw", "Europe/Berlin", "UTC"];
  return {
    inline_keyboard: [
      ...zones.map((z) => [{ text: z, callback_data: `set:tz:${z}` }]),
      [{ text: "← Назад", callback_data: "set:menu" }]
    ]
  };
}

function daysToggleKeyboard(settings) {
  const days = settings.morning.days || DEFAULT_SETTINGS.morning.days;
  return {
    inline_keyboard: [
      ...DAY_LABELS.map((lbl, i) => [{
        text: `${days.includes(i) ? "✅" : "○"} ${lbl}`,
        callback_data: `set:day:${i}`
      }]),
      [{ text: "Готово", callback_data: "set:menu" }]
    ]
  };
}

const TEXT = {
  startWelcome: `Привіт 🌿

Я допоможу тобі стежити за своїм емоційним станом.

Разом ми будемо проходити короткі ранкові, денні та вечірні ритуали.

Усе займає менше хвилини.`,

  linkedWelcome: `Акаунт підключено ✅

Тепер я можу надсилати нагадування та зберігати твої відповіді.

У налаштуваннях можна увімкнути ранкові, денні та вечірні повідомлення.`,

  needLink: "Спочатку підключи Telegram на сайті «Спокій»: Профіль → Підключити Telegram 🌿",

  morningPrompt: `🌿

Доброго ранку.

Як ти сьогодні?`,

  morningThanks: `Дякую ❤️

Бажаю тобі спокійного дня.`,

  middayPrompt: "Як зараз твій стан?",

  eveningPrompt: "Як минув день?",

  eveningThanks: "Дякую.\n\nДо зустрічі завтра 🌿",

  calmIntro: "Ось кілька коротких кроків, які можуть допомогти прямо зараз:",

  invalidLink: "Посилання застаріло або вже використане. Створи нове на сайті в розділі Профіль.",

  alreadyLinkedOther: "Цей Telegram вже привʼязаний до іншого акаунта.",

  openSiteBtn: "Відкрити сайт",

  paymentInfo: `₴ Оплата та доступ

«Спокій» можна користуватися безкоштовно.

Підтримка проєкту — добровільна: допомагає розвивати сервіс і не впливає на доступ до функцій.

Оплата не обовʼязкова. Сервіс не замінює професійну психологічну чи медичну допомогу.`
};

module.exports = {
  DEFAULT_SETTINGS,
  MOODS,
  DAY_LABELS,
  TEXT,
  siteUrl,
  paymentUrl,
  mainMenuKeyboard,
  paymentKeyboard,
  moodRow,
  calmKeyboard,
  settingsMenu,
  timePickKeyboard,
  timezoneKeyboard,
  daysToggleKeyboard,
  formatDays
};
