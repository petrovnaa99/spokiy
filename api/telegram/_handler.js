"use strict";

const { sendMessage, answerCallback } = require("./_api");
const { normalizeUserRow } = require("./_store");
const {
  TEXT, MOODS, WORRIES, siteUrl, mainMenuKeyboard, notesMenuKeyboard, paymentKeyboard,
  noteChoiceKeyboard, moodRow, calmKeyboard, settingsMenu, timePickKeyboard, timezoneKeyboard,
  daysToggleKeyboard, sleepKeyboard, worryKeyboard, wellbeingKeyboard, anxietyKeyboard,
  skipOrCancelKeyboard, cancelKeyboard
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

function clearPending(bot_state) {
  delete bot_state.pendingFlow;
  delete bot_state.pendingNote;
}

function newFlow(kind, dayKey, extra = {}) {
  return {
    kind,
    dayKey,
    step: extra.step || "start",
    data: extra.data || {},
    awaitingText: !!extra.awaitingText,
    expiresAt: Date.now() + 30 * 60 * 1000
  };
}

function flowExpired(flow) {
  return !flow || (flow.expiresAt && Date.now() > flow.expiresAt);
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

async function sendNotesMenu(chatId) {
  await sendMessage(chatId, TEXT.notesMenu, { replyMarkup: notesMenuKeyboard() });
}

async function sendMorning(chatId, timezone) {
  await sendMessage(chatId, TEXT.morningPromptText(timezone || "Europe/Kyiv"), {
    replyMarkup: { inline_keyboard: [moodRow("mrn")] }
  });
}

async function sendMidday(chatId) {
  await sendMessage(chatId, TEXT.middayPrompt, {
    replyMarkup: { inline_keyboard: [moodRow("mid")] }
  });
}

async function startEveningFlow(store, user, chatId) {
  const settings = user.settings;
  const bot_state = user.bot_state;
  const dayKey = todayKeyInTz(settings.timezone);
  bot_state.pendingFlow = newFlow("evening", dayKey, {
    step: "pleasant1",
    data: { pleasantThings: [] },
    awaitingText: true
  });
  bot_state.pendingFlow.expiresAt = Date.now() + 30 * 60 * 1000;
  await saveUser(store, user.email, settings, bot_state);
  await sendMessage(chatId, TEXT.eveningPrompt, { replyMarkup: cancelKeyboard() });
  await promptEveningPleasant(store, user, chatId, 1);
}

async function promptEveningPleasant(store, user, chatId, n) {
  const flow = user.bot_state.pendingFlow;
  if (!flow) return;
  flow.step = `pleasant${n}`;
  flow.awaitingText = true;
  flow.expiresAt = Date.now() + 30 * 60 * 1000;
  await saveUser(store, user.email, user.settings, user.bot_state);
  const prompts = [TEXT.eveningPleasant1, TEXT.eveningPleasant2, TEXT.eveningPleasant3];
  await sendMessage(chatId, prompts[n - 1], {
    replyMarkup: n === 3 ? skipOrCancelKeyboard() : cancelKeyboard()
  });
}

async function startRitualFlow(store, user, chatId, ritual) {
  const settings = user.settings;
  const bot_state = user.bot_state;
  const dayKey = todayKeyInTz(settings.timezone);
  bot_state.pendingFlow = newFlow(ritual, dayKey, { step: "mood", data: {} });
  await saveUser(store, user.email, settings, bot_state);
  if (ritual === "morning") await sendMorning(chatId, settings.timezone);
  else if (ritual === "midday") await sendMidday(chatId);
  else if (ritual === "evening") await startEveningFlow(store, user, chatId);
  else {
    await sendMessage(chatId, TEXT.nowPrompt, {
      replyMarkup: { inline_keyboard: [moodRow("now")] }
    });
  }
}

async function promptMorningSleep(chatId) {
  await sendMessage(chatId, TEXT.morningSleep, { replyMarkup: sleepKeyboard() });
}

async function promptMorningWorry(chatId) {
  await sendMessage(chatId, TEXT.morningWorry, { replyMarkup: worryKeyboard() });
}

async function promptMorningGratitude(store, user, chatId) {
  user.bot_state.pendingFlow.step = "gratitude";
  user.bot_state.pendingFlow.awaitingText = true;
  user.bot_state.pendingFlow.expiresAt = Date.now() + 30 * 60 * 1000;
  await saveUser(store, user.email, user.settings, user.bot_state);
  await sendMessage(chatId, TEXT.morningGratitude, { replyMarkup: cancelKeyboard() });
}

async function promptMorningGoal(store, user, chatId) {
  user.bot_state.pendingFlow.step = "goal";
  user.bot_state.pendingFlow.awaitingText = true;
  user.bot_state.pendingFlow.expiresAt = Date.now() + 30 * 60 * 1000;
  await saveUser(store, user.email, user.settings, user.bot_state);
  await sendMessage(chatId, TEXT.morningGoal, { replyMarkup: skipOrCancelKeyboard() });
}

async function finishMoodFlow(store, user, chatId, ritual, moodKey) {
  if (ritual === "morning") {
    await sendMessage(chatId, TEXT.morningThanks, {
      replyMarkup: {
        inline_keyboard: [
          [{ text: TEXT.openSiteBtn, url: siteUrl() }],
          [{ text: "📝 Ще нотатка", callback_data: "notes:menu" }]
        ]
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

async function saveRitualAndFinish(store, user, chatId, diaryThought) {
  const settings = user.settings;
  const bot_state = user.bot_state;
  const flow = bot_state.pendingFlow;
  if (!flow || !flow.kind || !flow.dayKey) return false;
  const ritual = flow.kind;
  const data = Object.assign({}, flow.data || {});
  const log = getDayLog(bot_state, flow.dayKey);
  if (ritual === "morning") bot_state.lastMorningAt = new Date().toISOString();
  data.at = new Date().toISOString();
  log[ritual] = { ...(log[ritual] || {}), ...data };
  const moodKey = data.mood;
  clearPending(bot_state);
  await saveUser(store, user.email, settings, bot_state);
  try {
    await store.syncRitualToUserData(user.email, flow.dayKey, ritual, data, {
      diaryThought: diaryThought || null
    });
  } catch (err) {
    console.error("syncRitualToUserData failed", err && err.message ? err.message : err);
    await sendMessage(chatId, "Не вдалося зберегти на сайт. Спробуй ще раз за хвилину 🌿", {
      replyMarkup: mainMenuKeyboard()
    });
    return true;
  }
  await sendMessage(chatId, TEXT.flowSaved);
  await finishMoodFlow(store, user, chatId, ritual, moodKey);
  return true;
}

/** Після вибору настрою — повний ритуал або коротка нотатка */
async function afterMoodAnswer(store, user, ritual, moodKey, chatId) {
  const mood = MOODS[moodKey];
  const settings = user.settings;
  const bot_state = user.bot_state;
  const dayKey = todayKeyInTz(settings.timezone);
  const log = getDayLog(bot_state, dayKey);
  if (ritual === "morning") bot_state.lastMorningAt = new Date().toISOString();

  const data = {
    mood: moodKey,
    value: mood.value,
    label: mood.label,
    at: new Date().toISOString()
  };
  log[ritual] = { ...(log[ritual] || {}), ...data };

  // Повний ранок / вечір — багатокроковий flow
  if (ritual === "morning") {
    bot_state.pendingFlow = newFlow("morning", dayKey, { step: "sleep", data });
    await saveUser(store, user.email, settings, bot_state);
    try {
      await store.syncRitualToUserData(user.email, dayKey, ritual, data);
    } catch (err) {
      console.error("syncRitualToUserData mood failed", err && err.message ? err.message : err);
    }
    await promptMorningSleep(chatId);
    return;
  }

  if (ritual === "evening") {
    await startEveningFlow(store, user, chatId);
    return;
  }

  // День / зараз — настрій + опційна думка (як раніше)
  bot_state.pendingFlow = newFlow(ritual, dayKey, {
    step: "note_choice",
    data,
    awaitingText: false
  });
  // сумісність зі старим pendingNote
  bot_state.pendingNote = {
    ritual,
    dayKey,
    moodKey,
    value: mood.value,
    awaitingText: false,
    expiresAt: Date.now() + 15 * 60 * 1000
  };
  await saveUser(store, user.email, settings, bot_state);
  try {
    await store.syncRitualToUserData(user.email, dayKey, ritual, data);
  } catch (err) {
    console.error("syncRitualToUserData mood failed", err && err.message ? err.message : err);
  }
  await sendMessage(chatId, TEXT.askMoodNote, { replyMarkup: noteChoiceKeyboard() });
}

async function applyMoodNote(store, user, chatId, noteText) {
  const settings = user.settings;
  const bot_state = user.bot_state;
  const pending = bot_state.pendingNote || (bot_state.pendingFlow && bot_state.pendingFlow.step === "note_choice"
    ? {
        ritual: bot_state.pendingFlow.kind,
        dayKey: bot_state.pendingFlow.dayKey,
        moodKey: bot_state.pendingFlow.data && bot_state.pendingFlow.data.mood,
        awaitingText: bot_state.pendingFlow.awaitingText
      }
    : null);
  if (!pending || !pending.ritual || !pending.dayKey) return false;
  if (pending.expiresAt && Date.now() > pending.expiresAt) {
    clearPending(bot_state);
    await saveUser(store, user.email, settings, bot_state);
    return false;
  }
  const log = getDayLog(bot_state, pending.dayKey);
  const ritual = pending.ritual;
  const entry = { ...(log[ritual] || {}), ...(bot_state.pendingFlow && bot_state.pendingFlow.data) };
  const note = String(noteText || "").trim().slice(0, 800);
  if (note) entry.note = note;
  entry.at = new Date().toISOString();
  log[ritual] = entry;
  const moodKey = entry.mood || pending.moodKey;
  clearPending(bot_state);
  await saveUser(store, user.email, settings, bot_state);
  try {
    await store.syncRitualToUserData(user.email, pending.dayKey, ritual, entry, {
      diaryThought: note || null
    });
  } catch (err) {
    console.error("syncRitualToUserData failed", err && err.message ? err.message : err);
    await sendMessage(chatId, "Не вдалося зберегти на сайт. Спробуй ще раз за хвилину 🌿", {
      replyMarkup: mainMenuKeyboard()
    });
    return true;
  }
  await sendMessage(chatId, note ? TEXT.noteSaved : TEXT.noteSkipped);
  await finishMoodFlow(store, user, chatId, ritual, moodKey);
  return true;
}

async function handleFlowText(store, user, chatId, text) {
  const bot_state = user.bot_state;
  const flow = bot_state.pendingFlow;
  if (!flow || flowExpired(flow) || !flow.awaitingText) return false;

  const value = String(text || "").trim().slice(0, 800);
  const step = flow.step;

  if (flow.kind === "morning") {
    if (step === "gratitude") {
      if (!value) {
        await sendMessage(chatId, "Напиши хоча б кілька слів вдячності 🌿");
        return true;
      }
      flow.data.gratitude = value;
      await promptMorningGoal(store, user, chatId);
      return true;
    }
    if (step === "goal") {
      if (value) flow.data.goal = value;
      flow.awaitingText = false;
      await saveUser(store, user.email, user.settings, bot_state);
      await saveRitualAndFinish(store, user, chatId, null);
      return true;
    }
  }

  if (flow.kind === "evening") {
    const pleasantStep = /^pleasant(\d)$/.exec(step);
    if (pleasantStep) {
      const n = Number(pleasantStep[1]);
      if (!value && n === 1) {
        await sendMessage(chatId, "Напиши хоча б одну приємну річ 🌿");
        return true;
      }
      if (!flow.data.pleasantThings) flow.data.pleasantThings = [];
      if (value) flow.data.pleasantThings.push(value);
      if (n < 3) {
        await promptEveningPleasant(store, user, chatId, n + 1);
        return true;
      }
      flow.awaitingText = false;
      await saveUser(store, user.email, user.settings, bot_state);
      await saveRitualAndFinish(store, user, chatId, null);
      return true;
    }
  }

  if (flow.kind === "gratitude" && step === "text") {
    if (!value) {
      await sendMessage(chatId, "Напиши текст вдячності 🌿");
      return true;
    }
    clearPending(bot_state);
    await saveUser(store, user.email, user.settings, bot_state);
    try {
      await store.syncDailyNote(user.email, "gratitude", { dayKey: flow.dayKey, text: value });
    } catch (err) {
      console.error("syncDailyNote gratitude", err);
      await sendMessage(chatId, "Не вдалося зберегти. Спробуй ще раз 🌿", { replyMarkup: mainMenuKeyboard() });
      return true;
    }
    await sendMessage(chatId, TEXT.gratitudeSaved, { replyMarkup: notesMenuKeyboard() });
    return true;
  }

  if (flow.kind === "good" && step === "text") {
    if (!value) {
      await sendMessage(chatId, "Напиши хорошу подію 🌿");
      return true;
    }
    clearPending(bot_state);
    await saveUser(store, user.email, user.settings, bot_state);
    try {
      await store.syncDailyNote(user.email, "good", { dayKey: flow.dayKey, text: value });
    } catch (err) {
      console.error("syncDailyNote good", err);
      await sendMessage(chatId, "Не вдалося зберегти. Спробуй ще раз 🌿", { replyMarkup: mainMenuKeyboard() });
      return true;
    }
    await sendMessage(chatId, TEXT.goodSaved, { replyMarkup: notesMenuKeyboard() });
    return true;
  }

  if (flow.kind === "diary" && step === "text") {
    if (!value) {
      await sendMessage(chatId, "Напиши свої думки 🌿");
      return true;
    }
    flow.data.text = value;
    flow.step = "anxiety";
    flow.awaitingText = false;
    await saveUser(store, user.email, user.settings, bot_state);
    await sendMessage(chatId, TEXT.diaryAnxiety, { replyMarkup: anxietyKeyboard() });
    return true;
  }

  // mid/now note text
  if (flow.step === "note_text" || (bot_state.pendingNote && bot_state.pendingNote.awaitingText)) {
    return applyMoodNote(store, user, chatId, value);
  }

  return false;
}

async function handleFlowSkip(store, user, chatId) {
  const flow = user.bot_state.pendingFlow;
  if (!flow || flowExpired(flow)) {
    await sendNotesMenu(chatId);
    return;
  }

  if (flow.kind === "morning") {
    if (flow.step === "sleep") {
      flow.step = "worry";
      await saveUser(store, user.email, user.settings, user.bot_state);
      await promptMorningWorry(chatId);
      return;
    }
    if (flow.step === "worry") {
      await promptMorningGratitude(store, user, chatId);
      return;
    }
    if (flow.step === "goal") {
      flow.awaitingText = false;
      await saveUser(store, user.email, user.settings, user.bot_state);
      await saveRitualAndFinish(store, user, chatId, null);
      return;
    }
  }

  if (flow.kind === "evening") {
    const pleasantStep = /^pleasant(\d)$/.exec(flow.step);
    if (pleasantStep && Number(pleasantStep[1]) === 3) {
      flow.awaitingText = false;
      await saveUser(store, user.email, user.settings, user.bot_state);
      await saveRitualAndFinish(store, user, chatId, null);
      return;
    }
  }

  await sendMessage(chatId, "Цей крок не можна пропустити — напиши відповідь ✍️", { replyMarkup: cancelKeyboard() });
}

async function startStandalone(store, user, chatId, kind) {
  const dayKey = todayKeyInTz(user.settings.timezone);
  const bot_state = user.bot_state;

  if (kind === "wellbeing") {
    bot_state.pendingFlow = newFlow("wellbeing", dayKey, { step: "level" });
    await saveUser(store, user.email, user.settings, bot_state);
    await sendMessage(chatId, TEXT.wellbeingPrompt, { replyMarkup: wellbeingKeyboard() });
    return;
  }

  if (kind === "gratitude") {
    bot_state.pendingFlow = newFlow("gratitude", dayKey, { step: "text", awaitingText: true });
    await saveUser(store, user.email, user.settings, bot_state);
    await sendMessage(chatId, TEXT.gratitudePrompt, { replyMarkup: cancelKeyboard() });
    return;
  }

  if (kind === "good") {
    bot_state.pendingFlow = newFlow("good", dayKey, { step: "text", awaitingText: true });
    await saveUser(store, user.email, user.settings, bot_state);
    await sendMessage(chatId, TEXT.goodPrompt, { replyMarkup: cancelKeyboard() });
    return;
  }

  if (kind === "diary") {
    bot_state.pendingFlow = newFlow("diary", dayKey, { step: "text", awaitingText: true, data: {} });
    await saveUser(store, user.email, user.settings, bot_state);
    await sendMessage(chatId, TEXT.diaryPrompt, { replyMarkup: cancelKeyboard() });
  }
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

  if (data === "notes:menu") {
    clearPending(bot_state);
    await saveUser(store, user.email, settings, bot_state);
    await sendNotesMenu(chatId);
    return;
  }

  if (data === "nt:mrn") {
    await startRitualFlow(store, user, chatId, "morning");
    return;
  }
  if (data === "nt:mid") {
    await startRitualFlow(store, user, chatId, "midday");
    return;
  }
  if (data === "nt:eve") {
    await startRitualFlow(store, user, chatId, "evening");
    return;
  }
  if (data === "nt:now") {
    await startRitualFlow(store, user, chatId, "now");
    return;
  }
  if (data === "nt:well") {
    await startStandalone(store, user, chatId, "wellbeing");
    return;
  }
  if (data === "nt:gr") {
    await startStandalone(store, user, chatId, "gratitude");
    return;
  }
  if (data === "nt:good") {
    await startStandalone(store, user, chatId, "good");
    return;
  }
  if (data === "nt:diary") {
    await startStandalone(store, user, chatId, "diary");
    return;
  }

  if (data === "flow:skip") {
    await handleFlowSkip(store, user, chatId);
    return;
  }

  if (data.startsWith("sl:")) {
    const flow = bot_state.pendingFlow;
    if (!flow || flow.kind !== "morning" || flow.step !== "sleep") {
      await sendNotesMenu(chatId);
      return;
    }
    const sleep = Math.max(1, Math.min(5, +data.slice(3) || 0));
    flow.data.sleep = sleep;
    flow.step = "worry";
    await saveUser(store, user.email, settings, bot_state);
    await promptMorningWorry(chatId);
    return;
  }

  if (data.startsWith("wr:")) {
    const flow = bot_state.pendingFlow;
    if (!flow || flow.kind !== "morning" || flow.step !== "worry") {
      await sendNotesMenu(chatId);
      return;
    }
    const code = data.slice(3);
    flow.data.worry = WORRIES[code] || code;
    await saveUser(store, user.email, settings, bot_state);
    await promptMorningGratitude(store, user, chatId);
    return;
  }

  if (data.startsWith("wb:")) {
    const flow = bot_state.pendingFlow;
    const level = Math.max(1, Math.min(10, +data.slice(3) || 0));
    if (!flow || flow.kind !== "wellbeing") {
      await sendNotesMenu(chatId);
      return;
    }
    const dayKey = flow.dayKey || todayKeyInTz(settings.timezone);
    clearPending(bot_state);
    await saveUser(store, user.email, settings, bot_state);
    try {
      await store.syncDailyNote(user.email, "wellbeing", { dayKey, level });
    } catch (err) {
      console.error("syncDailyNote wellbeing", err);
      await sendMessage(chatId, "Не вдалося зберегти. Спробуй ще раз 🌿", { replyMarkup: mainMenuKeyboard() });
      return;
    }
    await sendMessage(chatId, TEXT.wellbeingSaved, { replyMarkup: notesMenuKeyboard() });
    return;
  }

  // diary anxiety (reuse wb: only for wellbeing — diary uses same keyboard but check kind)
  // Actually anxietyKeyboard uses wb: — conflict. Use anx: instead for diary.
  if (data.startsWith("anx:")) {
    const flow = bot_state.pendingFlow;
    const anxiety = Math.max(1, Math.min(10, +data.slice(4) || 5));
    if (!flow || flow.kind !== "diary" || !flow.data || !flow.data.text) {
      await sendNotesMenu(chatId);
      return;
    }
    const dayKey = flow.dayKey || todayKeyInTz(settings.timezone);
    const text = flow.data.text;
    clearPending(bot_state);
    await saveUser(store, user.email, settings, bot_state);
    try {
      await store.syncDailyNote(user.email, "diary", { dayKey, text, anxiety });
    } catch (err) {
      console.error("syncDailyNote diary", err);
      await sendMessage(chatId, "Не вдалося зберегти. Спробуй ще раз 🌿", { replyMarkup: mainMenuKeyboard() });
      return;
    }
    await sendMessage(chatId, TEXT.diarySaved, { replyMarkup: notesMenuKeyboard() });
    return;
  }

  if (data === "note:skip") {
    await applyMoodNote(store, user, chatId, "");
    return;
  }

  if (data === "note:write") {
    const pending = bot_state.pendingNote;
    const flow = bot_state.pendingFlow;
    if (!pending && !(flow && flow.step === "note_choice")) {
      await sendMessage(chatId, "Спочатку обери настрій 🌿", { replyMarkup: mainMenuKeyboard() });
      return;
    }
    if (pending) {
      bot_state.pendingNote = {
        ...pending,
        awaitingText: true,
        expiresAt: Date.now() + 15 * 60 * 1000
      };
    }
    if (flow) {
      flow.step = "note_text";
      flow.awaitingText = true;
      flow.expiresAt = Date.now() + 15 * 60 * 1000;
    }
    await saveUser(store, user.email, settings, bot_state);
    await sendMessage(chatId, TEXT.askMoodNotePrompt, { replyMarkup: cancelKeyboard() });
    return;
  }

  if (data === "act:now") {
    await startRitualFlow(store, user, chatId, "now");
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

  const raw = await store.getByTelegramId(telegramId);
  const user = raw ? (normalizeUserRow(raw) || raw) : null;

  if (user && text && !text.startsWith("/")) {
    const flow = user.bot_state && user.bot_state.pendingFlow;
    const pending = user.bot_state && user.bot_state.pendingNote;
    if (flow && flow.awaitingText && !flowExpired(flow)) {
      await handleFlowText(store, user, chatId, text);
      return;
    }
    if (pending && pending.awaitingText) {
      await applyMoodNote(store, user, chatId, text);
      return;
    }
  }

  if (text === "/settings" || text === "⚙️ Налаштування") {
    const linked = await requireLinked(store, chatId, telegramId);
    if (!linked) return;
    await sendMessage(chatId, "Налаштування нагадувань", { replyMarkup: settingsMenu(linked.settings) });
    return;
  }

  if (text === "/notes" || text === "📝 Щоденні нотатки") {
    const linked = await requireLinked(store, chatId, telegramId);
    if (!linked) return;
    await sendNotesMenu(chatId);
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
      await sendMorning(chatId, tz);
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
      await startEveningFlow(store, user, chatId);
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
  startEveningFlow
};
