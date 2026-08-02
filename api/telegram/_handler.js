"use strict";

const { sendMessage, answerCallback } = require("./_api");
const { normalizeUserRow, mergeSettings, parseJson } = require("./_store");
const {
  TEXT, MOODS, siteUrl, mainMenuKeyboard, paymentKeyboard, noteChoiceKeyboard, moodRow, calmKeyboard,
  settingsMenu, timePickKeyboard, timezoneKeyboard, daysToggleKeyboard
} = require("./_messages");

function todayKeyInTz(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function nowInTz(timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false
    }).formatToParts(new Date());
    const map = {};
    parts.forEach((p) => { if (p.type !== "literal") map[p.type] = p.value; });
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      time: `${map.hour}:${map.minute}`,
      day: wdMap[map.weekday] ?? new Date().getDay()
    };
  } catch {
    const d = new Date();
    return {
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      day: d.getDay()
    };
  }
}

function parseHm(hm) {
  const [h, m] = String(hm || "08:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function timeWithinWindow(nowHm, targetHm, windowMin = 14) {
  const diff = Math.abs(parseHm(nowHm) - parseHm(targetHm));
  return diff <= windowMin;
}

function getDayLog(botState, dayKey) {
  const st = botState || {};
  if (!st.days) st.days = {};
  if (!st.days[dayKey]) st.days[dayKey] = {};
  return st.days[dayKey];
}

async function saveUser(store, email, settings, bot_state) {
  await store.updateUser(email, { settings, bot_state });
}

async function handleLinkStart(store, chatId, token, telegramId) {
  const res = await store.consumeLinkToken(token, telegramId);
  if (!res.ok) {
    const msg = {
      invalid_token: TEXT.invalidLink,
      token_used: TEXT.invalidLink,
      token_expired: TEXT.invalidLink,
      telegram_taken: TEXT.alreadyLinkedOther,
      email_taken: "Цей акаунт уже підключено до іншого Telegram."
    };
    await sendMessage(chatId, msg[res.error] || TEXT.invalidLink, {
      replyMarkup: { inline_keyboard: [[{ text: siteUrl(), url: siteUrl() }]] }
    });
    return;
  }
  await sendMessage(chatId, TEXT.linkedWelcome, { replyMarkup: mainMenuKeyboard() });
}

async function requireLinked(store, chatId, telegramId) {
  const row = normalizeUserRow(await store.getByTelegramId(telegramId));
  if (!row) {
    await sendMessage(chatId, TEXT.needLink, {
      replyMarkup: { inline_keyboard: [[{ text: "🌿 Відкрити Спокій", url: siteUrl() }]] }
    });
    return null;
  }
  return row;
}

async function sendMorning(chatId) {
  await sendMessage(chatId, TEXT.morningPrompt, {
    replyMarkup: { inline_keyboard: [moodRow("mrn")] }
  });
}

async function sendMidday(chatId) {
  await sendMessage(chatId, TEXT.middayPrompt, {
    replyMarkup: { inline_keyboard: [moodRow("mid")] }
  });
}

async function sendEvening(chatId) {
  await sendMessage(chatId, TEXT.eveningPrompt, {
    replyMarkup: { inline_keyboard: [moodRow("eve")] }
  });
}

async function afterMoodAnswer(store, user, ritual, moodKey, chatId) {
  const mood = MOODS[moodKey];
  const settings = user.settings;
  const bot_state = user.bot_state;
  const dayKey = todayKeyInTz(settings.timezone);
  const log = getDayLog(bot_state, dayKey);
  if (ritual === "morning") bot_state.lastMorningAt = new Date().toISOString();
  log[ritual] = {
    ...(log[ritual] || {}),
    mood: moodKey,
    value: mood.value,
    label: mood.label,
    at: new Date().toISOString()
  };
  // Чекаємо вибору: записати думки / пропустити (текст ще не приймаємо)
  bot_state.pendingNote = {
    ritual,
    dayKey,
    moodKey,
    value: mood.value,
    awaitingText: false,
    expiresAt: Date.now() + 15 * 60 * 1000
  };
  await saveUser(store, user.email, settings, bot_state);
  await store.syncRitualToUserData(user.email, dayKey, ritual, log[ritual]);
  await sendMessage(chatId, TEXT.askMoodNote, { replyMarkup: noteChoiceKeyboard() });
}

async function finishMoodFlow(store, user, chatId, ritual, moodKey) {
  if (ritual === "morning") {
    await sendMessage(chatId, TEXT.morningThanks, {
      replyMarkup: {
        inline_keyboard: [[{ text: TEXT.openSiteBtn, url: siteUrl() }]]
      }
    });
    return;
  }
  if (ritual === "evening") {
    await sendMessage(chatId, TEXT.eveningThanks, { replyMarkup: mainMenuKeyboard() });
    return;
  }
  if ((ritual === "midday" || ritual === "now") && (moodKey === "anxious" || moodKey === "hard")) {
    await sendMessage(chatId, TEXT.calmIntro, { replyMarkup: calmKeyboard() });
    return;
  }
  await sendMessage(chatId, "Дякую ❤️", { replyMarkup: mainMenuKeyboard() });
}

async function applyMoodNote(store, user, chatId, noteText) {
  const settings = user.settings;
  const bot_state = user.bot_state;
  const pending = bot_state.pendingNote;
  if (!pending || !pending.ritual || !pending.dayKey) return false;
  if (pending.expiresAt && Date.now() > pending.expiresAt) {
    delete bot_state.pendingNote;
    await saveUser(store, user.email, settings, bot_state);
    return false;
  }
  const log = getDayLog(bot_state, pending.dayKey);
  const ritual = pending.ritual;
  const entry = { ...(log[ritual] || {}) };
  const note = String(noteText || "").trim().slice(0, 800);
  if (note) entry.note = note;
  entry.at = new Date().toISOString();
  log[ritual] = entry;
  const moodKey = entry.mood || pending.moodKey;
  delete bot_state.pendingNote;
  await saveUser(store, user.email, settings, bot_state);
  await store.syncRitualToUserData(user.email, pending.dayKey, ritual, entry, {
    diaryThought: note || null
  });
  await sendMessage(chatId, note ? TEXT.noteSaved : TEXT.noteSkipped);
  await finishMoodFlow(store, user, chatId, ritual, moodKey);
  return true;
}

async function handleCallback(store, cb) {
  const data = cb.data || "";
  const chatId = cb.message.chat.id;
  const telegramId = cb.from.id;
  await answerCallback(cb.id);

  if (data === "menu:home") {
    await sendMessage(chatId, "Головне меню 🌿", { replyMarkup: mainMenuKeyboard() });
    return;
  }

  if (data === "act:pay") {
    await sendMessage(chatId, TEXT.paymentInfo, { replyMarkup: paymentKeyboard() });
    return;
  }

  const user = await requireLinked(store, chatId, telegramId);
  if (!user) return;

  const settings = user.settings;
  let bot_state = user.bot_state;

  if (data === "note:skip") {
    await applyMoodNote(store, user, chatId, "");
    return;
  }

  if (data === "note:write") {
    const pending = bot_state.pendingNote;
    if (!pending) {
      await sendMessage(chatId, "Спочатку обери настрій 🌿", { replyMarkup: mainMenuKeyboard() });
      return;
    }
    bot_state.pendingNote = {
      ...pending,
      awaitingText: true,
      expiresAt: Date.now() + 15 * 60 * 1000
    };
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, TEXT.askMoodNotePrompt);
    return;
  }

  if (data === "act:now") {
    await sendMessage(chatId, "Як ти зараз?", {
      replyMarkup: { inline_keyboard: [moodRow("now")] }
    });
    return;
  }
  if (data === "act:calm") {
    await sendMessage(chatId, TEXT.calmIntro, { replyMarkup: calmKeyboard() });
    return;
  }
  if (data === "set:menu") {
    await sendMessage(chatId, "Налаштування нагадувань", { replyMarkup: settingsMenu(settings) });
    return;
  }

  if (data.startsWith("set:mrn:toggle")) {
    settings.morning.enabled = !settings.morning.enabled;
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, `Ранкові: ${settings.morning.enabled ? "увімкнено ✅" : "вимкнено"}`, {
      replyMarkup: settingsMenu(settings)
    });
    return;
  }
  if (data.startsWith("set:mid:toggle")) {
    settings.midday.enabled = !settings.midday.enabled;
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, `Денні: ${settings.midday.enabled ? "увімкнено ✅" : "вимкнено"}`, {
      replyMarkup: settingsMenu(settings)
    });
    return;
  }
  if (data.startsWith("set:eve:toggle")) {
    settings.evening.enabled = !settings.evening.enabled;
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, `Вечірні: ${settings.evening.enabled ? "увімкнено ✅" : "вимкнено"}`, {
      replyMarkup: settingsMenu(settings)
    });
    return;
  }
  if (data === "set:mrn:time") {
    await sendMessage(chatId, "Обери час ранкового нагадування:", { replyMarkup: timePickKeyboard("set:mrn") });
    return;
  }
  if (data === "set:mid:time") {
    await sendMessage(chatId, "Обери час денного нагадування:", { replyMarkup: timePickKeyboard("set:mid") });
    return;
  }
  if (data === "set:eve:time") {
    await sendMessage(chatId, "Обери час вечірнього нагадування:", { replyMarkup: timePickKeyboard("set:eve") });
    return;
  }
  if (data.startsWith("set:mrn:time:")) {
    settings.morning.time = data.split(":").slice(3).join(":");
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, `Ранок: ${settings.morning.time} ✅`, { replyMarkup: settingsMenu(settings) });
    return;
  }
  if (data.startsWith("set:mid:time:")) {
    settings.midday.time = data.split(":").slice(3).join(":");
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, `День: ${settings.midday.time} ✅`, { replyMarkup: settingsMenu(settings) });
    return;
  }
  if (data.startsWith("set:eve:time:")) {
    settings.evening.time = data.split(":").slice(3).join(":");
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, `Вечір: ${settings.evening.time} ✅`, { replyMarkup: settingsMenu(settings) });
    return;
  }
  if (data === "set:days") {
    await sendMessage(chatId, "Обери дні для нагадувань:", { replyMarkup: daysToggleKeyboard(settings) });
    return;
  }
  if (data.startsWith("set:day:")) {
    const d = +data.split(":")[2];
    const days = settings.morning.days.slice();
    const idx = days.indexOf(d);
    if (idx >= 0) days.splice(idx, 1); else days.push(d);
    days.sort((a, b) => a - b);
    settings.morning.days = days;
    settings.midday.days = days.slice();
    settings.evening.days = days.slice();
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, "Дні оновлено", { replyMarkup: daysToggleKeyboard(settings) });
    return;
  }
  if (data === "set:tz") {
    await sendMessage(chatId, "Обери часовий пояс:", { replyMarkup: timezoneKeyboard() });
    return;
  }
  if (data.startsWith("set:tz:")) {
    settings.timezone = data.slice("set:tz:".length);
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, `Часовий пояс: ${settings.timezone} ✅`, { replyMarkup: settingsMenu(settings) });
    return;
  }

  const moodMatch = data.match(/^(mrn|mid|eve|now):(\w+)$/);
  if (moodMatch) {
    const ritual = { mrn: "morning", mid: "midday", eve: "evening", now: "now" }[moodMatch[1]];
    const moodKey = moodMatch[2];
    if (!MOODS[moodKey]) return;
    await afterMoodAnswer(store, user, ritual, moodKey, chatId);
  }
}

async function handleMessage(store, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const text = (msg.text || "").trim();

  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    const payload = parts[1];
    if (payload && payload.startsWith("link_")) {
      await handleLinkStart(store, chatId, payload.slice(5), telegramId);
      return;
    }
    const linked = await store.getByTelegramId(telegramId);
    await sendMessage(chatId, linked ? TEXT.linkedWelcome : TEXT.startWelcome, {
      replyMarkup: mainMenuKeyboard()
    });
    return;
  }

  const user = await store.getByTelegramId(telegramId);
  const pending = user && user.bot_state && user.bot_state.pendingNote;
  if (pending && pending.awaitingText && text && !text.startsWith("/")) {
    await applyMoodNote(store, normalizeUserRow(user) || user, chatId, text);
    return;
  }

  if (text === "/settings" || text === "⚙️ Налаштування") {
    const linked = await requireLinked(store, chatId, telegramId);
    if (!linked) return;
    await sendMessage(chatId, "Налаштування нагадувань", { replyMarkup: settingsMenu(linked.settings) });
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(chatId, "Обери дію на клавіатурі нижче 🌿", { replyMarkup: mainMenuKeyboard() });
    return;
  }

  if (user) {
    await sendMessage(chatId, "Обери дію на клавіатурі нижче 🌿", { replyMarkup: mainMenuKeyboard() });
  }
}

async function processUpdate(store, update) {
  if (update.callback_query) {
    await handleCallback(store, update.callback_query);
    return { ok: true };
  }
  if (update.message) {
    await handleMessage(store, update.message);
    return { ok: true };
  }
  return { ok: true, skipped: true };
}

async function runRitualCron(store) {
  const users = await store.listLinkedUsers();
  let sent = 0;
  for (const raw of users) {
    const user = normalizeUserRow(raw);
    if (!user) continue;
    const { settings, bot_state, email, telegram_id: chatId } = user;
    const tz = settings.timezone;
    const dayKey = todayKeyInTz(tz);
    const { time, day } = nowInTz(tz);
    const log = getDayLog(bot_state, dayKey);
    let changed = false;

    if (settings.morning.enabled && settings.morning.days.includes(day) &&
        !log.morning?.sent && timeWithinWindow(time, settings.morning.time)) {
      await sendMorning(chatId);
      log.morning = { ...(log.morning || {}), sent: true, sentAt: new Date().toISOString() };
      changed = true;
      sent++;
    }

    if (settings.midday.enabled && settings.midday.days.includes(day) &&
        log.morning?.at && !log.midday?.sent) {
      const morningAt = Date.parse(log.morning.at);
      const hoursAfter = settings.midday.hoursAfterMorning || 5;
      const due = morningAt + hoursAfter * 3600000;
      const useFixed = timeWithinWindow(time, settings.midday.time);
      const useAfter = Date.now() >= due && Date.now() < due + 20 * 60000;
      if (useFixed || useAfter) {
        await sendMidday(chatId);
        log.midday = { sent: true, sentAt: new Date().toISOString() };
        changed = true;
        sent++;
      }
    }

    if (settings.evening.enabled && settings.evening.days.includes(day) &&
        !log.evening?.sent && timeWithinWindow(time, settings.evening.time)) {
      await sendEvening(chatId);
      log.evening = { sent: true, sentAt: new Date().toISOString() };
      changed = true;
      sent++;
    }

    if (changed) {
      if (!bot_state.days) bot_state.days = {};
      bot_state.days[dayKey] = log;
      await saveUser(store, email, settings, bot_state);
    }
  }
  return { ok: true, sent, users: users.length };
}

module.exports = {
  processUpdate,
  runRitualCron,
  todayKeyInTz,
  nowInTz,
  sendMorning,
  sendMidday,
  sendEvening
};
