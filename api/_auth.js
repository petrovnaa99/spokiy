"use strict";

const crypto = require("crypto");

const SESSION_DAYS = 30;
const CODE_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (!e || e.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return e;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, password_hash: hashPassword(password, salt) };
}

function verifyPassword(password, salt, passwordHash) {
  try {
    const a = Buffer.from(hashPassword(password, salt), "hex");
    const b = Buffer.from(passwordHash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
}

function codeExpiry() {
  return new Date(Date.now() + CODE_TTL_MS).toISOString();
}

function isExpired(iso) {
  return !iso || Date.parse(iso) < Date.now();
}

/**
 * Перевірка Google ID token (GIS credential) через tokeninfo.
 * @param {string} credential
 * @returns {Promise<object|null>} payload з email, name, picture…
 */
async function verifyGoogleIdToken(credential) {
  const token = String(credential || "").trim();
  if (!token || token.length < 40) return null;
  try {
    const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token);
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || !data.email) return null;
    const expectedAud = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    if (expectedAud && data.aud !== expectedAud) return null;
    if (String(data.email_verified) === "false") return null;
    return data;
  } catch {
    return null;
  }
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function bearerToken(req) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!h || !String(h).toLowerCase().startsWith("bearer ")) return null;
  return String(h).slice(7).trim();
}

function devCodeHint(code) {
  return process.env.DEV_AUTH_HINT === "1" || process.env.NODE_ENV === "development" ? { devCode: code } : {};
}

function createAuthStore(rest, configured) {
  const CREDS = "auth_credentials";
  const SESSIONS = "auth_sessions";
  const CODES = "auth_codes";

  async function sb(method, path, opts = {}) {
    const r = await rest(path, { method, ...opts });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: r.ok, status: r.status, json, text };
  }

  return {
    configured,
    async getCredential(email) {
      const r = await sb("GET", `${CREDS}?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
      if (!r.ok) throw new Error(`auth_credentials ${r.status}`);
      return (r.json && r.json[0]) || null;
    },
    async upsertCredential(row) {
      const r = await sb("POST", `${CREDS}?on_conflict=email`, {
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row)
      });
      if (!r.ok) throw new Error(`auth_credentials upsert ${r.status}: ${r.text}`);
    },
    async createSession(email, token) {
      const expires_at = sessionExpiry();
      const r = await sb("POST", SESSIONS, {
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ token, email, expires_at })
      });
      if (!r.ok) throw new Error(`auth_sessions insert ${r.status}`);
      return { token, expires_at };
    },
    async getSession(token) {
      const r = await sb("GET", `${SESSIONS}?token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
      if (!r.ok) throw new Error(`auth_sessions ${r.status}`);
      const row = r.json && r.json[0];
      if (!row || isExpired(row.expires_at)) return null;
      return row;
    },
    async deleteSession(token) {
      await sb("DELETE", `${SESSIONS}?token=eq.${encodeURIComponent(token)}`);
    },
    async setCode(email, purpose, code) {
      const c = code || createCode();
      const expires_at = codeExpiry();
      await sb("DELETE", `${CODES}?email=eq.${encodeURIComponent(email)}&purpose=eq.${encodeURIComponent(purpose)}`);
      const r = await sb("POST", CODES, {
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ email, purpose, code: c, expires_at })
      });
      if (!r.ok) throw new Error(`auth_codes insert ${r.status}`);
      return { code: c, expires_at };
    },
    async verifyCode(email, purpose, code) {
      const r = await sb("GET", `${CODES}?email=eq.${encodeURIComponent(email)}&purpose=eq.${encodeURIComponent(purpose)}&select=*&limit=1`);
      if (!r.ok) throw new Error(`auth_codes ${r.status}`);
      const row = r.json && r.json[0];
      if (!row || row.code !== code || isExpired(row.expires_at)) return false;
      await sb("DELETE", `${CODES}?email=eq.${encodeURIComponent(email)}&purpose=eq.${encodeURIComponent(purpose)}`);
      return true;
    },
    async emailExists(email) {
      const cred = await this.getCredential(email);
      return !!cred;
    }
  };
}

module.exports = {
  normalizeEmail,
  hashPassword,
  createPasswordRecord,
  verifyPassword,
  createToken,
  createCode,
  sessionExpiry,
  codeExpiry,
  isExpired,
  verifyGoogleIdToken,
  readJsonBody,
  bearerToken,
  devCodeHint,
  createAuthStore,
  SESSION_DAYS,
  CODE_TTL_MS
};
