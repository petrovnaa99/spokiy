/*
 * Vercel serverless: збереження стану користувача у Supabase (Postgres).
 * Той самий контракт, що й локальний serve.js (SQLite):
 *
 *   GET    /api/state/:email   -> { ok, data: <стан|null>, updatedAt }
 *   PUT    /api/state/:email   тіло = JSON стану -> { ok, updatedAt }
 *   DELETE /api/state/:email   -> { ok }
 *
 * Дані лежать у таблиці public.users (email, data jsonb, updated_at).
 * Доступ до Supabase — лише на сервері, через service_role ключ (клієнт ключів не бачить).
 *
 * Потрібні змінні середовища (Vercel → Project → Settings → Environment Variables):
 *   SUPABASE_URL                — напр. https://abcd.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service_role ключ із Supabase (Settings → API)
 */
"use strict";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = "users";

function rest(query, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

function normalizeEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (!e || e.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return e;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return await new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => { d += c; });
    req.on("end", () => { try { resolve(JSON.parse(d || "null")); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: "supabase_not_configured" });
  }

  const email = normalizeEmail(req.query && req.query.email);
  if (!email) return res.status(400).json({ ok: false, error: "bad_email" });
  const eq = `email=eq.${encodeURIComponent(email)}`;

  try {
    if (req.method === "GET") {
      const r = await rest(`${TABLE}?${eq}&select=data,updated_at`);
      if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
      const rows = await r.json();
      if (!rows.length) return res.status(200).json({ ok: true, data: null });
      return res.status(200).json({ ok: true, data: rows[0].data, updatedAt: rows[0].updated_at });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const data = await readBody(req);
      if (!data || typeof data !== "object") return res.status(400).json({ ok: false, error: "bad_json" });
      const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
      const r = await rest(`${TABLE}?on_conflict=email`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ email, data, updated_at: updatedAt })
      });
      if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true, updatedAt });
    }

    if (req.method === "DELETE") {
      const r = await rest(`${TABLE}?${eq}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT, POST, DELETE");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "supabase_error", detail: String(e && e.message || e) });
  }
};
