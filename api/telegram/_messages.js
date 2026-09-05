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

const WORRIES = {
  job: "Робота",
  rel: "Стосунки",
  money: "Гроші",
  health: "Здоров'я",
  fam: "Родина",
  alone: "Самотність",
  other: "Інше"
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
      [{ text: "📝 Щоденні нотатки", callback_data: "notes:menu" }],
      [
        { text: "😊 Як я зараз?", callback_data: "act:now" },
        { text: "🧘 Швидко заспокоїтися", callback_data: "act:calm" }
      ],
      [{ text: "₴ Оплата та доступ", callback_data: "act:pay" }],
      [{ text: "⚙️ Налаштування", callback_data: "set:menu" }]
    ]
  };
}

function notesMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🌅 Ранок", callback_data: "nt:mrn" },
        { text: "☀️ День", callback_data: "nt:mid" }
      ],
      [
        { text: "🌙 Вечір", callback_data: "nt:eve" },
        { text: "😊 Зараз", callback_data: "nt:now" }
      ],
      [
        { text: "📊 Самопочуття 1–10", callback_data: "nt:well" },
        { text: "🙏 Вдячність", callback_data: "nt:gr" }
      ],
      [
        { text: "✨ Хороша подія", callback_data: "nt:good" },
        { text: "📝 Думки", callback_data: "nt:diary" }
      ],
      [{ text: "← Назад", callback_data: "menu:home" }]
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

function sleepKeyboard() {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5].map((n) => ({ text: `${"★".repeat(n)}`, callback_data: `sl:${n}` })),
      [{ text: "Пропустити", callback_data: "flow:skip" }],
      [{ text: "← Скасувати", callback_data: "notes:menu" }]
    ]
  };
}

function worryKeyboard() {
  const entries = Object.entries(WORRIES);
  const rows = [];
  for (let i = 0; i < entries.length; i += 2) {
    rows.push(entries.slice(i, i + 2).map(([k, label]) => ({
      text: label,
      callback_data: `wr:${k}`
    })));
  }
  rows.push([{ text: "Пропустити", callback_data: "flow:skip" }]);
  rows.push([{ text: "← Скасувати", callback_data: "notes:menu" }]);
  return { inline_keyboard: rows };
}

function wellbeingKeyboard() {
  const rows = [];
  for (let i = 1; i <= 10; i += 5) {
    rows.push(
      [i, i + 1, i + 2, i + 3, i + 4].map((n) => ({
        text: String(n),
        callback_data: `wb:${n}`
      }))
    );
  }
  rows.push([{ text: "← Скасувати", callback_data: "notes:menu" }]);
  return { inline_keyboard: rows };
}

function anxietyKeyboard() {
  const rows = [];
  for (let i = 1; i <= 10; i += 5) {
    rows.push(
      [i, i + 1, i + 2, i + 3, i + 4].map((n) => ({
        text: String(n),
        callback_data: `anx:${n}`
      }))
    );
  }
  rows.push([{ text: "← Скасувати", callback_data: "notes:menu" }]);
  return { inline_keyboard: rows };
}

function skipOrCancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Пропустити", callback_data: "flow:skip" }],
      [{ text: "← Скасувати", callback_data: "notes:menu" }]
    ]
  };
}

function cancelKeyboard() {
  return {
    inline_keyboard: [[{ text: "← Скасувати", callback_data: "notes:menu" }]]
  };
}

function calmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧘 Дихання", url: `${siteUrl()}/?sos=breath` }],
      [{ text: "🌳 Заземлення", url: `${siteUrl()}/?sos=ground` }],
      [{ text: "📝 Записати думки", callback_data: "nt:diary" }],
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

У налаштуваннях можна увімкнути ранкові, денні та вечірні повідомлення.

Або одразу: «Щоденні нотатки» — усі позиції, як на сайті.`,

  needLink: "Спочатку підключи Telegram на сайті «Спокій»: Профіль → Підключити Telegram 🌿",

  notesMenu: `📝 Щоденні нотатки

Обери, що хочеш записати — усе потрапить у загальну статистику на сайті.`,

  morningPrompt: `🌿

Доброго ранку.

Як ти сьогодні?`,

  morningSleep: "Як ти спав(ла)? Оціни сон зірочками:",

  morningWorry: "Що найбільше турбує сьогодні?",

  morningGratitude: "За що ти вдячний(на) сьогодні? Напиши одним-двома реченнями ✍️",

  morningGoal: "Яка одна маленька мета на сьогодні? (можна пропустити)",

  morningThanks: `Дякую ❤️

Бажаю тобі спокійного дня.`,

  middayPrompt: "Як зараз твій стан?",

  eveningPrompt: "🌙 Напиши 3 приємні речі, які сьогодні відбулися",

  eveningPleasant1: "1/3 — що приємного сталося сьогодні? Навіть дрібниця ✍️",

  eveningPleasant2: "2/3 — ще одна приємна річ дня ✍️",

  eveningPleasant3: "3/3 — третя приємна річ (можна пропустити) ✍️",

  eveningThanks: "Дякую.\n\nЗаписи вже в «Приємні речі дня» на сайті 🌿\n\nДо зустрічі завтра",

  nowPrompt: "Як ти зараз?",

  wellbeingPrompt: `📊 Самопочуття

Оціни рівень напруги / тривоги від 1 до 10
(1 — спокійно, 10 — дуже важко)`,

  wellbeingSaved: "Самопочуття збережено ✅ Воно вже в аналітиці.",

  gratitudePrompt: "🙏 За що ти вдячний(на) зараз? Напиши коротко ✍️",

  gratitudeSaved: "Вдячність збережено 🌿",

  goodPrompt: "✨ Яка хороша подія сьогодні? Навіть дрібниця ✍️",

  goodSaved: "Хорошу подію збережено ✅",

  diaryPrompt: "📝 Що тебе турбує або хочеш записати? Напиши одним-двома реченнями ✍️",

  diaryAnxiety: "Який зараз рівень тривоги (1–10)?",

  diarySaved: "Запис збережено 🌿 Він уже в аналітиці на сайті.",

  calmIntro: "Ось кілька коротких кроків, які можуть допомогти прямо зараз:",

  askMoodNote: `Настрій збережено.

Хочеш коротко записати думки? Вони потраплять у аналітику на сайті.`,

  askMoodNotePrompt: `Напиши свої думки одним-двома реченнями ✍️`,

  noteSaved: "Думки збережено 🌿 Вони вже в аналітиці на сайті.",

  noteSkipped: "Добре. Настрій збережено ❤️",

  flowSaved: "Збережено ✅ Усе вже на сайті в статистиці.",

  flowCancelled: "Добре, скасовано. Можеш обрати іншу нотатку будь-коли.",

  invalidLink: "Посилання застаріло або вже використане. Створи нове на сайті в розділі Профіль.",

  alreadyLinkedOther: "Цей Telegram вже привʼязаний до іншого акаунта.",

  openSiteBtn: "Відкрити сайт",

  writeThoughtsBtn: "Записати думки",

  skipNoteBtn: "Пропустити",

  paymentInfo: `₴ Оплата та доступ

«Спокій» можна користуватися безкоштовно.

Підтримка проєкту — добровільна: допомагає розвивати сервіс і не впливає на доступ до функцій.

Оплата не обовʼязкова. Сервіс не замінює професійну психологічну чи медичну допомогу.`
};

function noteChoiceKeyboard() {
  return {
    inline_keyboard: [[
      { text: TEXT.writeThoughtsBtn, callback_data: "note:write" },
      { text: TEXT.skipNoteBtn, callback_data: "note:skip" }
    ]]
  };
}

function noteSkipKeyboard() {
  return noteChoiceKeyboard();
}

module.exports = {
  DEFAULT_SETTINGS,
  MOODS,
  WORRIES,
  DAY_LABELS,
  TEXT,
  siteUrl,
  paymentUrl,
  mainMenuKeyboard,
  notesMenuKeyboard,
  paymentKeyboard,
  noteChoiceKeyboard,
  noteSkipKeyboard,
  moodRow,
  sleepKeyboard,
  worryKeyboard,
  wellbeingKeyboard,
  anxietyKeyboard,
  skipOrCancelKeyboard,
  cancelKeyboard,
  calmKeyboard,
  settingsMenu,
  timePickKeyboard,
  timezoneKeyboard,
  daysToggleKeyboard,
  formatDays
};
