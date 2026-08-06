"use strict";

const { normalizeEmail, bearerToken, createAuthStore } = require("./_auth");
const { configured, rest } = require("./_supabase");
const fileAdmins = require("./admin-emails");

function getAdminEmails() {
  const fromEnv = String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const fromFile = (Array.isArray(fileAdmins) ? fileAdmins : [])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...fromEnv, ...fromFile])];
}

function isAdminEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  return getAdminEmails().includes(e);
}

async function assertAdmin(req) {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: "auth_required" };
  if (!configured()) return { ok: false, status: 503, error: "supabase_not_configured" };
  const store = createAuthStore(rest, configured());
  const session = await store.getSession(token);
  if (!session || !session.email) return { ok: false, status: 401, error: "auth_required" };
  if (!isAdminEmail(session.email)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, email: session.email };
}

module.exports = {
  getAdminEmails,
  isAdminEmail,
  assertAdmin
};
