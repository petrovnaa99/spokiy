"use strict";

/**
 * One-off: copy telegram_users.bot_state mood/notes into users.data
 * so site analytics can show already-saved Telegram thoughts.
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) throw new Error("missing .env");
  fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) return;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  });
}

loadEnv();

const { rest } = require("../api/_supabase");
const {
  buildTelegramDiaryEntry,
  applyWellbeingAndCheckin
} = (() => {
  // reuse helpers via requiring store internals — duplicate minimal logic
  return {
    buildTelegramDiaryEntry(thought, data, dayKey) {
      const at = new Date().toISOString();
      const moodVal = Number(data && data.value);
      const mood = Number.isFinite(moodVal) ? moodVal : 0;
      const anxiety = Number.isFinite(moodVal) ? Math.max(1, Math.min(10, 11 - moodVal * 2)) : 5;
      return {
        id: "tgbf" + Date.now() + Math.random().toString(36).slice(2, 6),
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
    },
    applyWellbeingAndCheckin(state, dayKey, data, at) {
      const moodVal = Number(data && data.value);
      if (Number.isFinite(moodVal) && moodVal >= 1 && moodVal <= 5) {
        if (!state.wellbeing) state.wellbeing = {};
        const level = Math.max(1, Math.min(10, Math.round(moodVal * 2)));
        const prev = state.wellbeing[dayKey];
        if (!prev || typeof prev.level !== "number" || level >= prev.level) {
          state.wellbeing[dayKey] = { level, date: at, source: "telegram" };
        }
      }
      if (!state.checkins) state.checkins = {};
      state.checkins[dayKey] = true;
    }
  };
})();

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

async function sb(method, pathQuery, opts = {}) {
  const r = await rest(pathQuery, { method, ...opts });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { ok: r.ok, status: r.status, json, text };
}

async function main() {
  const tg = await sb("GET", "telegram_users?select=email,bot_state");
  if (!tg.ok) throw new Error("telegram_users " + tg.status + " " + tg.text);
  const users = await sb("GET", "users?select=email");
  console.log("telegram_users:", (tg.json || []).length, "users rows:", (users.json || []).length);

  for (const row of tg.json || []) {
    const email = row.email;
    const bot = parseJson(row.bot_state, {});
    const days = bot.days && typeof bot.days === "object" ? bot.days : {};
    const dayKeys = Object.keys(days);
    if (!dayKeys.length) {
      console.log(email, "no days in bot_state — skip");
      continue;
    }

    const ur = await sb("GET", `users?email=eq.${encodeURIComponent(email)}&select=data,profile&limit=1`);
    let state = (ur.json && ur.json[0] && parseJson(ur.json[0].data, null)) || {};
    if (!state || typeof state !== "object") state = {};
    if (!state.profile) state.profile = { email, name: email.split("@")[0], gender: null, provider: "email" };
    if (!state.rituals) state.rituals = {};
    if (!Array.isArray(state.entries)) state.entries = [];
    if (!state.wellbeing) state.wellbeing = {};
    if (!state.checkins) state.checkins = {};

    let changed = 0;
    for (const dayKey of dayKeys) {
      const log = days[dayKey] || {};
      for (const ritual of ["morning", "midday", "evening", "now"]) {
        const data = log[ritual];
        if (!data || typeof data !== "object") continue;
        if (!state.rituals[dayKey]) state.rituals[dayKey] = {};
        const existing = state.rituals[dayKey][ritual];
        const at = data.at || new Date().toISOString();
        // Prefer bot note if missing on site
        if (!existing || (data.note && !existing.note) || !existing.source) {
          state.rituals[dayKey][ritual] = { ...existing, ...data, at, source: "telegram" };
          applyWellbeingAndCheckin(state, dayKey, data, at);
          changed++;
        }
        if (data.note) {
          const already = state.entries.some(
            (e) => e && e.source === "telegram" && e.dayKey === dayKey && e.fear === String(data.note).trim()
          );
          if (!already) {
            state.entries.unshift(buildTelegramDiaryEntry(data.note, data, dayKey));
            changed++;
          }
        }
      }
    }

    if (!changed) {
      console.log(email, "already synced");
      continue;
    }

    const at = new Date().toISOString();
    state.updatedAt = at;
    const up = await sb("POST", "users?on_conflict=email", {
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        email,
        profile: state.profile,
        data: state,
        updated_at: at
      })
    });
    if (!up.ok) {
      console.error(email, "upsert failed", up.status, up.text);
      continue;
    }
    console.log(email, "backfilled changes:", changed);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
