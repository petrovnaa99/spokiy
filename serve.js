/*
 * Спокій — бекенд «під ключ».
 * Один файл: віддає статичний сайт і надає REST API для збереження даних у SQLite.
 *
 * Запуск:   node serve.js   (або: npm start)
 * Потрібен Node.js >= 22.5 (вбудований модуль node:sqlite, без зовнішніх залежностей).
 *
 * API (дані прив'язані до email користувача):
 *   GET    /api/health            -> { ok: true }
 *   GET    /api/state/:email      -> { ok: true, data: <стан|null>, updatedAt }
 *   PUT    /api/state/:email      тіло = JSON стану -> { ok: true, updatedAt }
 *   DELETE /api/state/:email      -> { ok: true }
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

/* Підхопити локальний .env (без залежностей) */
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  } catch { /* ignore */ }
})();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "spokiy.db");

/* ---------- База даних ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    email      TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_credentials (
    email          TEXT PRIMARY KEY,
    password_hash  TEXT NOT NULL,
    salt           TEXT NOT NULL,
    name           TEXT,
    gender         TEXT,
    created_at     TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token       TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_codes (
    email       TEXT NOT NULL,
    purpose     TEXT NOT NULL,
    code        TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    PRIMARY KEY (email, purpose)
  );
  CREATE TABLE IF NOT EXISTS telegram_users (
    email        TEXT PRIMARY KEY,
    telegram_id  TEXT UNIQUE NOT NULL,
    settings     TEXT NOT NULL DEFAULT '{}',
    bot_state    TEXT NOT NULL DEFAULT '{}',
    linked_at    TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    token       TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used_at     TEXT
  );
  CREATE TABLE IF NOT EXISTS admin_helpers (
    email       TEXT PRIMARY KEY,
    added_by    TEXT,
    created_at  TEXT NOT NULL
  );
`);

const {
  normalizeEmail: normEmail,
  createPasswordRecord,
  verifyPassword,
  createToken,
  createCode,
  sessionExpiry,
  codeExpiry,
  isExpired,
  verifyGoogleIdToken,
  bearerToken,
  devCodeHint
} = require("./api/_auth");

const qCredGet = db.prepare("SELECT * FROM auth_credentials WHERE email = ?");
const qCredUpsert = db.prepare(`
  INSERT INTO auth_credentials (email, password_hash, salt, name, gender, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    password_hash = excluded.password_hash,
    salt = excluded.salt,
    name = COALESCE(excluded.name, auth_credentials.name),
    gender = COALESCE(excluded.gender, auth_credentials.gender)
`);
const qSessionGet = db.prepare("SELECT * FROM auth_sessions WHERE token = ?");
const qSessionIns = db.prepare("INSERT INTO auth_sessions (token, email, expires_at) VALUES (?, ?, ?)");
const qSessionDel = db.prepare("DELETE FROM auth_sessions WHERE token = ?");
const qCodeGet = db.prepare("SELECT * FROM auth_codes WHERE email = ? AND purpose = ?");
const qCodeDel = db.prepare("DELETE FROM auth_codes WHERE email = ? AND purpose = ?");
const qCodeUpsert = db.prepare(`
  INSERT INTO auth_codes (email, purpose, code, expires_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(email, purpose) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at
`);

const qGet = db.prepare("SELECT data, updated_at FROM users WHERE email = ?");
const qUpsert = db.prepare(`
  INSERT INTO users (email, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`);
const qDelete = db.prepare("DELETE FROM users WHERE email = ?");

const { createStore } = require("./api/telegram/_store");
const { processUpdate, runRitualCron } = require("./api/telegram/_handler");
const { getMe, configured: tgConfigured, setWebhook } = require("./api/telegram/_api");
const tgStore = createStore(db);

/* ---------- Допоміжні ---------- */
function normalizeEmail(raw) {
  const e = decodeURIComponent(String(raw || "")).trim().toLowerCase();
  if (!e || e.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return e;
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("payload_too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function bearerFromReq(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  if (!String(h).toLowerCase().startsWith("bearer ")) return null;
  return String(h).slice(7).trim();
}

function assertSession(req, email) {
  const token = bearerFromReq(req);
  if (!token) return { ok: false, status: 401, error: "auth_required" };
  const row = qSessionGet.get(token);
  if (!row || isExpired(row.expires_at) || row.email !== email) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, token };
}

async function handleAuth(req, res, pathname) {
  let body = {};
  if (req.method === "POST") {
    try {
      const raw = await readBody(req, 256 * 1024);
      body = JSON.parse(raw || "{}");
    } catch {
      return sendJSON(res, 400, { ok: false, error: "bad_json" });
    }
  }

  if (pathname === "/api/auth/exists" && req.method === "GET") {
    const email = normEmail(new URL(req.url, `http://${req.headers.host}`).searchParams.get("email"));
    if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });
    return sendJSON(res, 200, { ok: true, exists: !!qCredGet.get(email) });
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    const email = normEmail(body.email);
    const password = body.password;
    const name = String(body.name || "").trim();
    const gender = body.gender;
    if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });
    if (!password || String(password).length < 6) return sendJSON(res, 400, { ok: false, error: "weak_password" });
    if (!name) return sendJSON(res, 400, { ok: false, error: "name_required" });
    if (!gender || !["female", "male"].includes(gender)) return sendJSON(res, 400, { ok: false, error: "gender_required" });
    if (qCredGet.get(email)) return sendJSON(res, 409, { ok: false, error: "email_taken" });
    const { salt, password_hash } = createPasswordRecord(password);
    const created = new Date().toISOString();
    qCredUpsert.run(email, password_hash, salt, name, gender, created);
    const token = createToken();
    const exp = sessionExpiry();
    qSessionIns.run(token, email, exp);
    return sendJSON(res, 200, { ok: true, token, expiresAt: exp, profile: { email, name, gender, provider: "email" } });
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const email = normEmail(body.email);
    const password = body.password;
    const code = String(body.code || "").trim();
    if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });
    const cred = qCredGet.get(email);
    if (!cred) return sendJSON(res, 401, { ok: false, error: "unknown_email" });
    let ok = false;
    if (password) ok = verifyPassword(password, cred.salt, cred.password_hash);
    else if (code) {
      const row = qCodeGet.get(email, "login");
      ok = row && row.code === code && !isExpired(row.expires_at);
      if (ok) qCodeDel.run(email, "login");
    } else return sendJSON(res, 400, { ok: false, error: "password_or_code_required" });
    if (!ok) return sendJSON(res, 401, { ok: false, error: "invalid_credentials" });
    const token = createToken();
    const exp = sessionExpiry();
    qSessionIns.run(token, email, exp);
    return sendJSON(res, 200, {
      ok: true, token, expiresAt: exp,
      profile: { email, name: cred.name || email.split("@")[0], gender: cred.gender || null, provider: "email" }
    });
  }

  if (pathname === "/api/auth/request-code" && req.method === "POST") {
    const email = normEmail(body.email);
    const purpose = body.purpose === "reset" ? "reset" : "login";
    if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });
    const cred = qCredGet.get(email);
    if (!cred) return sendJSON(res, 200, { ok: true, message: "if_account_exists_code_sent" });
    const code = createCode();
    qCodeUpsert.run(email, purpose, code, codeExpiry());
    return sendJSON(res, 200, { ok: true, message: "code_sent", purpose, ...devCodeHint(code) });
  }

  if (pathname === "/api/auth/reset-password" && req.method === "POST") {
    const email = normEmail(body.email);
    const code = String(body.code || "").trim();
    const password = body.password;
    if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });
    if (!code) return sendJSON(res, 400, { ok: false, error: "code_required" });
    if (!password || String(password).length < 6) return sendJSON(res, 400, { ok: false, error: "weak_password" });
    const cred = qCredGet.get(email);
    if (!cred) return sendJSON(res, 401, { ok: false, error: "unknown_email" });
    const row = qCodeGet.get(email, "reset");
    if (!row || row.code !== code || isExpired(row.expires_at)) {
      return sendJSON(res, 401, { ok: false, error: "invalid_code" });
    }
    qCodeDel.run(email, "reset");
    const { salt, password_hash } = createPasswordRecord(password);
    qCredUpsert.run(email, password_hash, salt, cred.name, cred.gender, cred.created_at);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === "/api/auth/oauth" && req.method === "POST") {
    if (body.provider !== "google") return sendJSON(res, 400, { ok: false, error: "bad_request" });
    let email = null;
    let name = "";
    let picture = null;
    const gender = body.gender || null;

    if (body.credential) {
      const payload = await verifyGoogleIdToken(body.credential);
      if (!payload) return sendJSON(res, 401, { ok: false, error: "invalid_google_token" });
      email = normEmail(payload.email);
      name = String(payload.name || (payload.email || "").split("@")[0] || "").trim();
      picture = payload.picture || null;
    } else if (process.env.ALLOW_LEGACY_OAUTH === "1") {
      email = normEmail(body.email);
      name = String(body.name || "").trim();
      picture = body.picture || null;
    } else {
      return sendJSON(res, 400, { ok: false, error: "credential_required" });
    }

    if (!email) return sendJSON(res, 400, { ok: false, error: "bad_request" });
    let cred = qCredGet.get(email);
    if (!cred) {
      const { salt, password_hash } = createPasswordRecord(createToken());
      const created = new Date().toISOString();
      qCredUpsert.run(email, password_hash, salt, name || email.split("@")[0], gender || null, created);
      cred = qCredGet.get(email);
    }
    const token = createToken();
    const exp = sessionExpiry();
    qSessionIns.run(token, email, exp);
    return sendJSON(res, 200, {
      ok: true, token, expiresAt: exp,
      profile: { email, name: cred.name || name, gender: cred.gender || gender, picture, provider: "google" }
    });
  }

  return sendJSON(res, 404, { ok: false, error: "not_found" });
}

async function handleTelegram(req, res, pathname) {
  if (pathname === "/api/telegram/webhook" && req.method === "POST") {
    if (!tgConfigured()) return sendJSON(res, 503, { ok: false, error: "telegram_not_configured" });
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const got = req.headers["x-telegram-bot-api-secret-token"] || "";
      if (got !== secret) return sendJSON(res, 403, { ok: false, error: "invalid_webhook_secret" });
    }
    try {
      const raw = await readBody(req, 512 * 1024);
      const update = JSON.parse(raw || "{}");
      await processUpdate(tgStore, update);
      return sendJSON(res, 200, { ok: true });
    } catch (e) {
      console.error("telegram webhook", e);
      return sendJSON(res, 200, { ok: true });
    }
  }

  if (pathname === "/api/telegram/link") {
    const auth = assertSessionFromPath(req);
    if (!auth.ok) return sendJSON(res, auth.status, { ok: false, error: auth.error });
    const email = auth.email;

    if (req.method === "GET") {
      const row = await tgStore.getByEmail(email);
      let botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
      if (!botUsername && tgConfigured()) {
        try { botUsername = (await getMe()).username || ""; } catch { /* ignore */ }
      }
      let settings = null;
      if (row) {
        try { settings = JSON.parse(row.settings || "{}"); } catch { settings = {}; }
      }
      return sendJSON(res, 200, { ok: true, linked: !!row, botUsername, settings });
    }

    if (req.method === "POST") {
      const { token, expires_at } = await tgStore.createLinkToken(email);
      let botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
      if (!botUsername && tgConfigured()) {
        try { botUsername = (await getMe()).username || ""; } catch { /* ignore */ }
      }
      const startPayload = `link_${token}`;
      return sendJSON(res, 200, {
        ok: true, token, startPayload, botUsername,
        linkUrl: botUsername ? `https://t.me/${botUsername}?start=${startPayload}` : null,
        expiresAt: expires_at
      });
    }

    if (req.method === "DELETE") {
      await tgStore.deleteByEmail(email);
      return sendJSON(res, 200, { ok: true, linked: false });
    }
    return sendJSON(res, 405, { ok: false, error: "method_not_allowed" });
  }

  if (pathname === "/api/telegram/setup-webhook" && req.method === "POST") {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return sendJSON(res, 401, { ok: false, error: "unauthorized" });
    }
    if (!tgConfigured()) return sendJSON(res, 503, { ok: false, error: "telegram_not_configured" });
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookSecret) return sendJSON(res, 400, { ok: false, error: "TELEGRAM_WEBHOOK_SECRET_missing" });
    const host = req.headers.host || `${HOST}:${PORT}`;
    const url = `http://${host}/api/telegram/webhook`;
    try {
      await setWebhook(url, webhookSecret);
      const me = await getMe();
      return sendJSON(res, 200, { ok: true, webhookUrl: url, bot: me });
    } catch (e) {
      return sendJSON(res, 502, { ok: false, error: String(e.message || e) });
    }
  }

  if (pathname === "/api/cron/rituals" && (req.method === "GET" || req.method === "POST")) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return sendJSON(res, 401, { ok: false, error: "unauthorized" });
    }
    if (!tgConfigured()) return sendJSON(res, 503, { ok: false, error: "telegram_not_configured" });
    try {
      const result = await runRitualCron(tgStore);
      return sendJSON(res, 200, result);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: String(e.message || e) });
    }
  }

  return null;
}

function assertSessionFromPath(req) {
  const token = bearerFromReq(req);
  if (!token) return { ok: false, status: 401, error: "auth_required" };
  const row = qSessionGet.get(token);
  if (!row || isExpired(row.expires_at)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, email: row.email, token };
}

/* ---------- API ---------- */
async function handleApi(req, res, pathname) {
  if (pathname === "/api/health") {
    return sendJSON(res, 200, { ok: true, time: new Date().toISOString() });
  }

  if (pathname === "/api/config" && req.method === "GET") {
    let admin = false;
    try {
      const { getSeedAdminEmails } = require("./api/_admin");
      const { normalizeEmail: norm } = require("./api/_auth");
      const token = bearerToken(req);
      if (token) {
        const sessRow = db.prepare("SELECT email, expires_at FROM auth_sessions WHERE token = ?").get(token);
        if (sessRow && !isExpired(sessRow.expires_at)) {
          const e = norm(sessRow.email);
          if (getSeedAdminEmails().includes(e)) admin = true;
          else if (e && db.prepare("SELECT 1 FROM admin_helpers WHERE email = ?").get(e)) admin = true;
        }
      }
    } catch (e) { admin = false; }
    return sendJSON(res, 200, {
      ok: true,
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      admin
    });
  }

  function localAdminSession(req) {
    const { getSeedAdminEmails } = require("./api/_admin");
    const { normalizeEmail: norm } = require("./api/_auth");
    const token = bearerToken(req);
    if (!token) return { ok: false, status: 401, error: "auth_required" };
    const sessRow = db.prepare("SELECT email, expires_at FROM auth_sessions WHERE token = ?").get(token);
    if (!sessRow || isExpired(sessRow.expires_at)) return { ok: false, status: 401, error: "auth_required" };
    const e = norm(sessRow.email);
    const seed = getSeedAdminEmails();
    const isOwner = seed.includes(e);
    const isHelper = !!(e && db.prepare("SELECT 1 FROM admin_helpers WHERE email = ?").get(e));
    if (!isOwner && !isHelper) return { ok: false, status: 403, error: "forbidden" };
    return { ok: true, email: e, isOwner };
  }

  if (pathname === "/api/admin/helpers") {
    try {
      const auth = localAdminSession(req);
      if (!auth.ok) return sendJSON(res, auth.status, { ok: false, error: auth.error });
      const { getSeedAdminEmails } = require("./api/_admin");
      const { normalizeEmail: norm, readJsonBody } = require("./api/_auth");
      const seed = getSeedAdminEmails();

      if (req.method === "GET") {
        const helpers = db.prepare("SELECT email, added_by, created_at FROM admin_helpers ORDER BY created_at ASC").all();
        return sendJSON(res, 200, {
          ok: true,
          owners: seed.map((email) => ({ email, role: "owner", locked: true })),
          helpers: helpers.map((r) => ({
            email: r.email,
            role: "helper",
            locked: false,
            addedBy: r.added_by,
            createdAt: r.created_at
          }))
        });
      }

      if (req.method === "POST") {
        let body = {};
        try {
          const raw = await readBody(req);
          body = JSON.parse(raw || "{}");
        } catch { body = {}; }
        const email = norm(body.email);
        if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });
        if (seed.includes(email)) return sendJSON(res, 400, { ok: false, error: "already_owner" });
        if (db.prepare("SELECT 1 FROM admin_helpers WHERE email = ?").get(email)) {
          return sendJSON(res, 400, { ok: false, error: "already_helper" });
        }
        const at = new Date().toISOString();
        db.prepare("INSERT INTO admin_helpers (email, added_by, created_at) VALUES (?, ?, ?)").run(email, auth.email, at);
        return sendJSON(res, 200, { ok: true, email });
      }

      if (req.method === "DELETE") {
        let body = {};
        try {
          const raw = await readBody(req);
          body = JSON.parse(raw || "{}");
        } catch { body = {}; }
        const q = pathname.includes("?") ? "" : "";
        void q;
        const urlEmail = (() => {
          try {
            const u = new URL(req.url, "http://local");
            return u.searchParams.get("email");
          } catch { return null; }
        })();
        const email = norm(body.email || urlEmail);
        if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });
        if (seed.includes(email)) return sendJSON(res, 400, { ok: false, error: "cannot_remove_owner" });
        db.prepare("DELETE FROM admin_helpers WHERE email = ?").run(email);
        return sendJSON(res, 200, { ok: true, email });
      }

      return sendJSON(res, 405, { ok: false, error: "method_not_allowed" });
    } catch (e) {
      return sendJSON(res, 502, { ok: false, error: "admin_helpers_failed", detail: String(e && e.message || e) });
    }
  }

  if (pathname === "/api/admin/overview" && req.method === "GET") {
    try {
      const auth = localAdminSession(req);
      if (!auth.ok) return sendJSON(res, auth.status, { ok: false, error: auth.error });
      const { getSeedAdminEmails } = require("./api/_admin");
      const seed = getSeedAdminEmails();
      const users = db.prepare("SELECT email, data, updated_at FROM users ORDER BY updated_at DESC LIMIT 40").all();
      const tgSet = new Set();
      try {
        db.prepare("SELECT email FROM telegram_users").all().forEach((r) => tgSet.add(String(r.email).toLowerCase()));
      } catch (e) {}
      const since7 = Date.now() - 7 * 86400000;
      const mapped = users.map((u) => {
        let data = {};
        try { data = JSON.parse(u.data || "{}"); } catch { data = {}; }
        const profile = data.profile && typeof data.profile === "object" ? data.profile : {};
        return {
          email: u.email,
          name: profile.name || String(u.email).split("@")[0],
          updatedAt: u.updated_at,
          telegram: tgSet.has(String(u.email).toLowerCase()),
          recoveryStage: profile.recoveryStage || null
        };
      });
      const helpers = db.prepare("SELECT email, added_by, created_at FROM admin_helpers ORDER BY created_at ASC").all();
      const admins = [
        ...seed.map((email) => ({ email, role: "owner", locked: true })),
        ...helpers.map((r) => ({
          email: r.email,
          role: "helper",
          locked: false,
          addedBy: r.added_by,
          createdAt: r.created_at
        }))
      ];
      return sendJSON(res, 200, {
        ok: true,
        admin: auth.email,
        isOwner: !!auth.isOwner,
        stats: {
          usersTotal: users.length,
          telegramLinked: tgSet.size,
          diaryEntries: null,
          activeLast7Days: mapped.filter((u) => Date.parse(u.updatedAt || 0) >= since7).length,
          telegramBot: tgConfigured(),
          supabase: false
        },
        users: mapped,
        admins,
        note: "Локальний режим (SQLite). Тексти щоденників не показуються."
      });
    } catch (e) {
      return sendJSON(res, 502, { ok: false, error: "admin_overview_failed", detail: String(e && e.message || e) });
    }
  }

  if (pathname.startsWith("/api/telegram/") || pathname === "/api/cron/rituals") {
    const tg = await handleTelegram(req, res, pathname);
    if (tg !== null) return tg;
  }

  if (pathname.startsWith("/api/auth/")) {
    return handleAuth(req, res, pathname);
  }

  const m = pathname.match(/^\/api\/state\/(.+)$/);
  if (!m) return sendJSON(res, 404, { ok: false, error: "not_found" });

  const email = normalizeEmail(m[1]);
  if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });

  const auth = assertSession(req, email);
  if (!auth.ok) return sendJSON(res, auth.status, { ok: false, error: auth.error });

  if (req.method === "GET") {
    const row = qGet.get(email);
    if (!row) return sendJSON(res, 200, { ok: true, data: null });
    let data = null;
    try { data = JSON.parse(row.data); } catch { data = null; }
    return sendJSON(res, 200, { ok: true, data, updatedAt: row.updated_at });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let raw;
    try { raw = await readBody(req); }
    catch { return sendJSON(res, 413, { ok: false, error: "payload_too_large" }); }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return sendJSON(res, 400, { ok: false, error: "bad_json" }); }
    const updatedAt = (parsed && typeof parsed.updatedAt === "string")
      ? parsed.updatedAt
      : new Date().toISOString();
    qUpsert.run(email, JSON.stringify(parsed), updatedAt);
    return sendJSON(res, 200, { ok: true, updatedAt });
  }

  if (req.method === "DELETE") {
    qDelete.run(email);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 405, { ok: false, error: "method_not_allowed" });
}

/* ---------- Статика ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".map": "application/json; charset=utf-8"
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  // Безпечне розв'язання шляху всередині кореня проєкту.
  const resolved = path.normalize(path.join(ROOT, rel));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    return sendJSON(res, 403, { ok: false, error: "forbidden" });
  }
  fs.stat(resolved, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 — не знайдено");
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

/* ---------- Сервер ---------- */
const server = http.createServer((req, res) => {
  let pathname = "/";
  try { pathname = new URL(req.url, `http://${req.headers.host || HOST}`).pathname; }
  catch { pathname = req.url || "/"; }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((e) => {
      sendJSON(res, 500, { ok: false, error: "server_error", detail: String(e && e.message || e) });
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJSON(res, 405, { ok: false, error: "method_not_allowed" });
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Спокій запущено:  http://${HOST}:${PORT}`);
  console.log(`База даних SQLite: ${DB_PATH}`);
});

function shutdown() {
  try { db.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
