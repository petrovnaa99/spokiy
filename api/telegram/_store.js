"use strict";

const { configured: sbConfigured, rest } = require("../_supabase");
const { createToken, isExpired } = require("../_auth");
const { DEFAULT_SETTINGS } = require("./_messages");

const TG_USERS = "telegram_users";
const TG_TOKENS = "telegram_link_tokens";
const USERS = "users";

const LINK_TTL_MS = 15 * 60 * 1000;

function mergeSettings(raw) {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!raw || typeof raw !== "object") return base;
  for (const k of ["morning", "midday", "evening"]) {
    if (raw[k] && typeof raw[k] === "object") Object.assign(base[k], raw[k]);
  }
  if (raw.timezone) base.timezone = raw.timezone;
  return base;
}

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function buildTelegramDiaryEntry(thought, data, dayKey) {
  const at = new Date().toISOString();
  const moodVal = Number(data && data.value);
  const mood = Number.isFinite(moodVal) ? moodVal : 0;
  const anxiety = Number.isFinite(moodVal) ? Math.max(1, Math.min(10, 11 - moodVal * 2)) : 5;
  return {
    id: "tg" + Date.now() + Math.random().toString(36).slice(2, 6),
    type: "diary",
    fear: String(thought).trim().slice(0, 800),
    cause: "",
    trigger: "",
    category: "",
    thought: "",
    situation: "",
    anxiety,
    mood,
    energy: 0,
    helped: [],
    reviewed: false,
    openDate: null,
    source: "telegram",
    dayKey,
    createdAt: at,
    updatedAt: at
  };
}

function applyWellbeingAndCheckin(state, dayKey, data, at) {
  const moodVal = Number(data && data.value);
  if (Number.isFinite(moodVal) && moodVal >= 1 && moodVal <= 5) {
    if (!state.wellbeing) state.wellbeing = {};
    // На сайті wellbeing.level = тривога 1–10 (більше = гірше). Mood 5 → 1, mood 1 → 9.
    const level = Math.max(1, Math.min(10, Math.round(11 - moodVal * 2)));
    const prev = state.wellbeing[dayKey];
    if (!prev || typeof prev.level !== "number" || level >= prev.level) {
      state.wellbeing[dayKey] = { level, date: at, source: "telegram", scale: "anxiety" };
    }
  }
  if (!state.checkins) state.checkins = {};
  state.checkins[dayKey] = true;
}

function ensureStateArrays(state, email) {
  if (!state || typeof state !== "object") state = {};
  if (!state.profile) {
    state.profile = { email, name: String(email || "").split("@")[0], gender: null, provider: "email" };
  }
  if (!state.rituals) state.rituals = {};
  if (!Array.isArray(state.entries)) state.entries = [];
  if (!state.wellbeing || Array.isArray(state.wellbeing)) state.wellbeing = {};
  if (!state.checkins) state.checkins = {};
  if (!Array.isArray(state.gratitude)) state.gratitude = [];
  if (!Array.isArray(state.goodEvents)) state.goodEvents = [];
  return state;
}

function appendGratitude(state, text, dayKey, at) {
  const t = String(text || "").trim().slice(0, 800);
  if (!t) return null;
  const rec = {
    id: "gr" + Date.now() + Math.random().toString(36).slice(2, 5),
    text: t,
    date: at,
    dayKey,
    source: "telegram"
  };
  state.gratitude.unshift(rec);
  return rec;
}

function appendGoodEvent(state, text, dayKey, at) {
  const t = String(text || "").trim().slice(0, 800);
  if (!t) return null;
  const rec = {
    id: "ge" + Date.now() + Math.random().toString(36).slice(2, 5),
    text: t,
    date: at,
    dayKey,
    source: "telegram"
  };
  state.goodEvents.unshift(rec);
  return rec;
}

/**
 * Застосувати щоденну нотатку до snapshot стану.
 * kind: ritual | wellbeing | gratitude | good | diary
 */
function applyDailyNoteToState(state, kind, payload = {}) {
  const email = (state.profile && state.profile.email) || payload.email || "";
  state = ensureStateArrays(state, email);
  const at = new Date().toISOString();
  const dayKey = payload.dayKey || at.slice(0, 10);
  let diaryEntry = null;

  if (kind === "ritual") {
    const ritualType = payload.ritualType || "now";
    if (!state.rituals[dayKey]) state.rituals[dayKey] = {};
    const data = Object.assign({}, payload.data || {});
    state.rituals[dayKey][ritualType] = { ...data, at, source: "telegram" };
    applyWellbeingAndCheckin(state, dayKey, data, at);
    if (data.gratitude) appendGratitude(state, data.gratitude, dayKey, at);
    const thought = payload.diaryThought ? String(payload.diaryThought).trim() : "";
    if (thought) {
      diaryEntry = buildTelegramDiaryEntry(thought, data, dayKey);
      state.entries.unshift(diaryEntry);
    }
  } else if (kind === "wellbeing") {
    const level = Math.max(1, Math.min(10, Math.round(Number(payload.level) || 5)));
    state.wellbeing[dayKey] = { level, date: at, source: "telegram", scale: "anxiety" };
    state.checkins[dayKey] = true;
  } else if (kind === "gratitude") {
    appendGratitude(state, payload.text, dayKey, at);
    state.checkins[dayKey] = true;
  } else if (kind === "good") {
    appendGoodEvent(state, payload.text, dayKey, at);
    state.checkins[dayKey] = true;
  } else if (kind === "diary") {
    const moodVal = Number(payload.mood);
    const anxiety = Number.isFinite(Number(payload.anxiety))
      ? Math.max(1, Math.min(10, Math.round(Number(payload.anxiety))))
      : (Number.isFinite(moodVal) ? Math.max(1, Math.min(10, 11 - moodVal * 2)) : 5);
    diaryEntry = buildTelegramDiaryEntry(payload.text || "", { value: moodVal }, dayKey);
    diaryEntry.anxiety = anxiety;
    if (Number.isFinite(moodVal)) diaryEntry.mood = moodVal;
    state.entries.unshift(diaryEntry);
    state.checkins[dayKey] = true;
    const prev = state.wellbeing[dayKey];
    if (!prev || typeof prev.level !== "number" || anxiety >= prev.level) {
      state.wellbeing[dayKey] = { level: anxiety, date: at, source: "telegram", scale: "anxiety" };
    }
  }

  state.updatedAt = at;
  return { state, diaryEntry, at };
}

async function insertDiaryRow(sb, email, diaryEntry) {
  if (!diaryEntry) return;
  const row = {
    id: diaryEntry.id,
    user_email: email,
    type: "diary",
    fear: diaryEntry.fear,
    thought: null,
    situation: null,
    category: null,
    cause: null,
    trigger: null,
    anxiety: diaryEntry.anxiety,
    mood: diaryEntry.mood,
    energy: null,
    support_methods: null,
    review: null,
    payload: diaryEntry,
    created_at: diaryEntry.createdAt,
    updated_at: diaryEntry.updatedAt
  };
  const ins = await sb("POST", "diary_entries", {
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row)
  });
  if (!ins.ok) throw new Error(`diary_entries insert ${ins.status}: ${ins.text}`);
}

/* ---------- Supabase backend ---------- */
function createSupabaseStore() {
  async function sb(method, path, opts = {}) {
    const r = await rest(path, { method, ...opts });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: r.ok, status: r.status, json, text };
  }

  return {
    backend: "supabase",

    async getByTelegramId(telegramId) {
      const r = await sb("GET", `${TG_USERS}?telegram_id=eq.${telegramId}&select=*&limit=1`);
      if (!r.ok) throw new Error(`telegram_users ${r.status}`);
      return (r.json && r.json[0]) || null;
    },

    async getByEmail(email) {
      const r = await sb("GET", `${TG_USERS}?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
      if (!r.ok) throw new Error(`telegram_users ${r.status}`);
      return (r.json && r.json[0]) || null;
    },

    async upsertUser(row) {
      const payload = {
        email: row.email,
        telegram_id: row.telegram_id,
        settings: row.settings || DEFAULT_SETTINGS,
        bot_state: row.bot_state || {},
        linked_at: row.linked_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const r = await sb("POST", `${TG_USERS}?on_conflict=email`, {
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error(`telegram_users upsert ${r.status}: ${r.text}`);
      return (r.json && r.json[0]) || payload;
    },

    async updateUser(email, patch) {
      const r = await sb("PATCH", `${TG_USERS}?email=eq.${encodeURIComponent(email)}`, {
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
      });
      if (!r.ok) throw new Error(`telegram_users patch ${r.status}`);
      return (r.json && r.json[0]) || null;
    },

    async deleteByEmail(email) {
      await sb("DELETE", `${TG_USERS}?email=eq.${encodeURIComponent(email)}`);
    },

    async createLinkToken(email) {
      const token = createToken().slice(0, 59);
      const expires_at = new Date(Date.now() + LINK_TTL_MS).toISOString();
      await sb("DELETE", `${TG_TOKENS}?email=eq.${encodeURIComponent(email)}&used_at=is.null`);
      const r = await sb("POST", TG_TOKENS, {
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ token, email, expires_at })
      });
      if (!r.ok) throw new Error(`telegram_link_tokens ${r.status}`);
      return { token, expires_at };
    },

    async consumeLinkToken(token, telegramId) {
      const r = await sb("GET", `${TG_TOKENS}?token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
      if (!r.ok || !r.json || !r.json[0]) return { ok: false, error: "invalid_token" };
      const row = r.json[0];
      if (row.used_at) return { ok: false, error: "token_used" };
      if (isExpired(row.expires_at)) return { ok: false, error: "token_expired" };

      const existing = await this.getByTelegramId(telegramId);
      if (existing && existing.email !== row.email) {
        return { ok: false, error: "telegram_taken" };
      }
      const byEmail = await this.getByEmail(row.email);
      if (byEmail && String(byEmail.telegram_id) !== String(telegramId)) {
        return { ok: false, error: "email_taken" };
      }

      await sb("PATCH", `${TG_TOKENS}?token=eq.${encodeURIComponent(token)}`, {
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ used_at: new Date().toISOString() })
      });

      await this.upsertUser({
        email: row.email,
        telegram_id: telegramId,
        settings: byEmail ? mergeSettings(byEmail.settings) : DEFAULT_SETTINGS,
        bot_state: byEmail ? parseJson(byEmail.bot_state, {}) : {},
        linked_at: byEmail ? byEmail.linked_at : new Date().toISOString()
      });

      return { ok: true, email: row.email };
    },

    async listLinkedUsers() {
      const r = await sb("GET", `${TG_USERS}?select=*`);
      if (!r.ok) throw new Error(`telegram_users list ${r.status}`);
      return r.json || [];
    },

    async syncRitualToUserData(email, dayKey, ritualType, data, opts = {}) {
      const r = await sb("GET", `${USERS}?email=eq.${encodeURIComponent(email)}&select=data,profile&limit=1`);
      if (!r.ok) throw new Error(`users get ${r.status}: ${r.text}`);
      let state = (r.json && r.json[0] && parseJson(r.json[0].data, null)) || {};
      if (!state.profile) {
        const cred = await sb("GET", `auth_credentials?email=eq.${encodeURIComponent(email)}&select=name,gender&limit=1`);
        const c = cred.json && cred.json[0];
        state.profile = {
          email,
          name: (c && c.name) || email.split("@")[0],
          gender: (c && c.gender) || null,
          provider: "email"
        };
      }
      const applied = applyDailyNoteToState(state, "ritual", {
        email,
        dayKey,
        ritualType,
        data,
        diaryThought: opts && opts.diaryThought
      });
      state = applied.state;
      const up = await sb("POST", `${USERS}?on_conflict=email`, {
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          email,
          profile: state.profile || { email },
          data: state,
          updated_at: applied.at
        })
      });
      if (!up.ok) throw new Error(`users upsert ${up.status}: ${up.text}`);
      await insertDiaryRow(sb, email, applied.diaryEntry);
      return { ok: true, diaryId: applied.diaryEntry ? applied.diaryEntry.id : null };
    },

    async syncDailyNote(email, kind, payload = {}) {
      const r = await sb("GET", `${USERS}?email=eq.${encodeURIComponent(email)}&select=data,profile&limit=1`);
      if (!r.ok) throw new Error(`users get ${r.status}: ${r.text}`);
      let state = (r.json && r.json[0] && parseJson(r.json[0].data, null)) || {};
      if (!state.profile) {
        state.profile = { email, name: email.split("@")[0], gender: null, provider: "email" };
      }
      const applied = applyDailyNoteToState(state, kind, Object.assign({ email }, payload));
      state = applied.state;
      const up = await sb("POST", `${USERS}?on_conflict=email`, {
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          email,
          profile: state.profile || { email },
          data: state,
          updated_at: applied.at
        })
      });
      if (!up.ok) throw new Error(`users upsert ${up.status}: ${up.text}`);
      await insertDiaryRow(sb, email, applied.diaryEntry);
      return { ok: true, diaryId: applied.diaryEntry ? applied.diaryEntry.id : null };
    }
  };
}

/* ---------- SQLite backend (serve.js) ---------- */
function createSqliteStore(db) {
  const qGetByTg = db.prepare("SELECT * FROM telegram_users WHERE telegram_id = ?");
  const qGetByEmail = db.prepare("SELECT * FROM telegram_users WHERE email = ?");
  const qUpsert = db.prepare(`
    INSERT INTO telegram_users (email, telegram_id, settings, bot_state, linked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      telegram_id = excluded.telegram_id,
      settings = excluded.settings,
      bot_state = excluded.bot_state,
      linked_at = COALESCE(telegram_users.linked_at, excluded.linked_at),
      updated_at = excluded.updated_at
  `);
  const qPatch = db.prepare(`
    UPDATE telegram_users SET settings = ?, bot_state = ?, updated_at = ? WHERE email = ?
  `);
  const qDel = db.prepare("DELETE FROM telegram_users WHERE email = ?");
  const qTokenGet = db.prepare("SELECT * FROM telegram_link_tokens WHERE token = ?");
  const qTokenIns = db.prepare(`
    INSERT INTO telegram_link_tokens (token, email, expires_at, used_at) VALUES (?, ?, ?, NULL)
  `);
  const qTokenDelOpen = db.prepare("DELETE FROM telegram_link_tokens WHERE email = ? AND used_at IS NULL");
  const qTokenUse = db.prepare("UPDATE telegram_link_tokens SET used_at = ? WHERE token = ?");
  const qList = db.prepare("SELECT * FROM telegram_users");
  const qUserData = db.prepare("SELECT data FROM users WHERE email = ?");
  const qUserDataUp = db.prepare("UPDATE users SET data = ?, updated_at = ? WHERE email = ?");
  const qUserUpsert = db.prepare(`
    INSERT INTO users (email, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `);

  return {
    backend: "sqlite",

    async getByTelegramId(telegramId) {
      return qGetByTg.get(String(telegramId)) || null;
    },

    async getByEmail(email) {
      return qGetByEmail.get(email) || null;
    },

    async upsertUser(row) {
      const now = new Date().toISOString();
      qUpsert.run(
        row.email,
        String(row.telegram_id),
        JSON.stringify(row.settings || DEFAULT_SETTINGS),
        JSON.stringify(row.bot_state || {}),
        row.linked_at || now,
        now
      );
      return this.getByEmail(row.email);
    },

    async updateUser(email, patch) {
      const cur = await this.getByEmail(email);
      if (!cur) return null;
      const settings = patch.settings != null ? patch.settings : parseJson(cur.settings, DEFAULT_SETTINGS);
      const bot_state = patch.bot_state != null ? patch.bot_state : parseJson(cur.bot_state, {});
      const now = new Date().toISOString();
      qPatch.run(JSON.stringify(settings), JSON.stringify(bot_state), now, email);
      return this.getByEmail(email);
    },

    async deleteByEmail(email) {
      qDel.run(email);
    },

    async createLinkToken(email) {
      qTokenDelOpen.run(email);
      const token = createToken().slice(0, 59);
      const expires_at = new Date(Date.now() + LINK_TTL_MS).toISOString();
      qTokenIns.run(token, email, expires_at);
      return { token, expires_at };
    },

    async consumeLinkToken(token, telegramId) {
      const row = qTokenGet.get(token);
      if (!row) return { ok: false, error: "invalid_token" };
      if (row.used_at) return { ok: false, error: "token_used" };
      if (isExpired(row.expires_at)) return { ok: false, error: "token_expired" };

      const existing = await this.getByTelegramId(telegramId);
      if (existing && existing.email !== row.email) {
        return { ok: false, error: "telegram_taken" };
      }
      const byEmail = await this.getByEmail(row.email);
      if (byEmail && String(byEmail.telegram_id) !== String(telegramId)) {
        return { ok: false, error: "email_taken" };
      }

      qTokenUse.run(new Date().toISOString(), token);
      await this.upsertUser({
        email: row.email,
        telegram_id: String(telegramId),
        settings: byEmail ? mergeSettings(parseJson(byEmail.settings, null)) : DEFAULT_SETTINGS,
        bot_state: byEmail ? parseJson(byEmail.bot_state, {}) : {},
        linked_at: byEmail ? byEmail.linked_at : new Date().toISOString()
      });
      return { ok: true, email: row.email };
    },

    async listLinkedUsers() {
      return qList.all();
    },

    async syncRitualToUserData(email, dayKey, ritualType, data, opts = {}) {
      const row = qUserData.get(email);
      let state = {};
      if (row) {
        try { state = JSON.parse(row.data || "{}"); } catch { state = {}; }
      }
      if (!state.profile) {
        state.profile = { email, name: email.split("@")[0], gender: null, provider: "email" };
      }
      const applied = applyDailyNoteToState(state, "ritual", {
        email,
        dayKey,
        ritualType,
        data,
        diaryThought: opts && opts.diaryThought
      });
      qUserUpsert.run(email, JSON.stringify(applied.state), applied.at);
      return { ok: true };
    },

    async syncDailyNote(email, kind, payload = {}) {
      const row = qUserData.get(email);
      let state = {};
      if (row) {
        try { state = JSON.parse(row.data || "{}"); } catch { state = {}; }
      }
      if (!state.profile) {
        state.profile = { email, name: email.split("@")[0], gender: null, provider: "email" };
      }
      const applied = applyDailyNoteToState(state, kind, Object.assign({ email }, payload));
      qUserUpsert.run(email, JSON.stringify(applied.state), applied.at);
      return { ok: true };
    }
  };
}

function createStore(localDb) {
  if (localDb) return createSqliteStore(localDb);
  if (sbConfigured()) return createSupabaseStore();
  return null;
}

function normalizeUserRow(row) {
  if (!row) return null;
  return {
    email: row.email,
    telegram_id: row.telegram_id,
    settings: mergeSettings(parseJson(row.settings, null)),
    bot_state: parseJson(row.bot_state, {}),
    linked_at: row.linked_at,
    updated_at: row.updated_at
  };
}

module.exports = {
  createStore,
  normalizeUserRow,
  mergeSettings,
  parseJson,
  LINK_TTL_MS
};
