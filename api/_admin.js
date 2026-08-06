"use strict";

const { normalizeEmail, bearerToken, createAuthStore } = require("./_auth");
const { configured, rest } = require("./_supabase");
const fileAdmins = require("./admin-emails");

function getSeedAdminEmails() {
  const fromEnv = String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const fromFile = (Array.isArray(fileAdmins) ? fileAdmins : [])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...fromEnv, ...fromFile])];
}

/** @deprecated sync without DB — use resolveAdminEmails / isAdminEmailAsync */
function getAdminEmails() {
  return getSeedAdminEmails();
}

async function listHelperEmailsFromDb() {
  if (!configured()) return [];
  try {
    const r = await rest("admin_helpers?select=email,added_by,created_at&order=created_at.asc");
    if (!r.ok) return [];
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function resolveAdminEmails() {
  const seed = getSeedAdminEmails();
  const helpers = await listHelperEmailsFromDb();
  const helperEmails = helpers
    .map((r) => normalizeEmail(r.email))
    .filter(Boolean);
  return {
    seed,
    helpers,
    all: [...new Set([...seed, ...helperEmails])]
  };
}

async function isAdminEmailAsync(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  const { all } = await resolveAdminEmails();
  return all.includes(e);
}

function isAdminEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  return getSeedAdminEmails().includes(e);
}

function isSeedAdmin(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  return getSeedAdminEmails().includes(e);
}

async function assertAdmin(req) {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: "auth_required" };
  if (!configured()) return { ok: false, status: 503, error: "supabase_not_configured" };
  const store = createAuthStore(rest, configured());
  const session = await store.getSession(token);
  if (!session || !session.email) return { ok: false, status: 401, error: "auth_required" };
  if (!(await isAdminEmailAsync(session.email))) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, email: session.email };
}

async function addHelperEmail(email, addedBy) {
  const e = normalizeEmail(email);
  if (!e) return { ok: false, error: "bad_email" };
  if (isSeedAdmin(e)) return { ok: false, error: "already_owner" };
  const { all } = await resolveAdminEmails();
  if (all.includes(e)) return { ok: false, error: "already_helper" };
  const row = {
    email: e,
    added_by: normalizeEmail(addedBy) || null,
    created_at: new Date().toISOString()
  };
  const r = await rest("admin_helpers?on_conflict=email", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row)
  });
  if (!r.ok) {
    const text = await r.text();
    return { ok: false, error: "db_error", detail: text, status: r.status };
  }
  return { ok: true, email: e };
}

async function removeHelperEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return { ok: false, error: "bad_email" };
  if (isSeedAdmin(e)) return { ok: false, error: "cannot_remove_owner" };
  const r = await rest(`admin_helpers?email=eq.${encodeURIComponent(e)}`, {
    method: "DELETE"
  });
  if (!r.ok) {
    const text = await r.text();
    return { ok: false, error: "db_error", detail: text, status: r.status };
  }
  return { ok: true, email: e };
}

module.exports = {
  getAdminEmails,
  getSeedAdminEmails,
  resolveAdminEmails,
  listHelperEmailsFromDb,
  isAdminEmail,
  isAdminEmailAsync,
  isSeedAdmin,
  assertAdmin,
  addHelperEmail,
  removeHelperEmail
};
