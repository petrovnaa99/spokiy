/*
 * Vercel serverless: Supabase як основне сховище стану користувача.
 * Той самий контракт, що й локальний serve.js (SQLite):
 *
 *   GET    /api/state/:email   -> { ok, data: <стан|null>, updatedAt }
 *   PUT    /api/state/:email   тіло = JSON стану -> { ok, updatedAt }
 *   DELETE /api/state/:email   -> { ok }
 *
 * Для MVP зберігаємо повний snapshot у public.users.data (щоб не ламати
 * фронтенд), але записи/докази/підтримку також mirror-имо в нормальні таблиці.
 * Доступ до Supabase — лише на сервері, через service_role ключ (клієнт ключів не бачить).
 *
 * Потрібні змінні середовища (Vercel → Project → Settings → Environment Variables):
 *   SUPABASE_URL                — напр. https://abcd.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service_role ключ із Supabase (Settings → API)
 */
"use strict";

const { configured, rest } = require("../_supabase");
const USERS_TABLE = "users";
const ENTRIES_TABLE = "diary_entries";
const EVIDENCE_TABLE = "evidence_records";
const SUPPORT_TABLE = "support_resources";

function normalizeEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (!e || e.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return e;
}

function iso(raw) {
  const d = raw ? new Date(raw) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function entryToRow(email, entry) {
  return {
    id: String(entry.id || `e${Date.now()}`),
    user_email: email,
    type: entry.type || "diary",
    fear: entry.fear || null,
    thought: entry.thought || null,
    situation: entry.situation || null,
    category: entry.category || null,
    cause: entry.cause || null,
    trigger: entry.trigger || null,
    anxiety: typeof entry.anxiety === "number" ? entry.anxiety : null,
    mood: typeof entry.mood === "number" ? entry.mood : null,
    energy: typeof entry.energy === "number" ? entry.energy : null,
    support_methods: entry.supportMethods || entry.support || null,
    review: entry.review || null,
    payload: entry,
    created_at: iso(entry.createdAt),
    updated_at: iso(entry.updatedAt || entry.createdAt)
  };
}

function rowToEntry(row) {
  return {
    ...(row.payload || {}),
    id: row.id,
    type: row.type,
    fear: row.fear,
    thought: row.thought,
    situation: row.situation,
    category: row.category,
    cause: row.cause,
    trigger: row.trigger,
    anxiety: row.anxiety,
    mood: row.mood,
    energy: row.energy,
    supportMethods: row.support_methods,
    review: row.review,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function evidenceToRow(email, item) {
  return {
    id: String(item.id || `ev${Date.now()}`),
    user_email: email,
    fear: item.fear || null,
    real_result: item.realResult || null,
    conclusion: item.conclusion || null,
    payload: item,
    created_at: iso(item.date)
  };
}

function rowToEvidence(row) {
  return {
    ...(row.payload || {}),
    id: row.id,
    fear: row.fear,
    realResult: row.real_result,
    conclusion: row.conclusion,
    date: row.created_at
  };
}

function resourcesToRows(email, resources) {
  return Object.entries(resources || {}).map(([name, r]) => ({
    user_email: email,
    name,
    uses: Number(r && r.uses) || 0,
    sum_effect: Number(r && r.sumEffect) || 0,
    updated_at: new Date().toISOString()
  }));
}

function rowsToResources(rows) {
  const out = {};
  arr(rows).forEach((r) => { out[r.name] = { uses: r.uses || 0, sumEffect: r.sum_effect || 0 }; });
  return out;
}

async function tableRows(table, email, select = "*", extra = "") {
  const query = `${table}?user_email=eq.${encodeURIComponent(email)}&select=${select}${extra}`;
  const r = await rest(query);
  if (!r.ok) throw new Error(`supabase ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function replaceRows(table, email, rows) {
  const del = await rest(`${table}?user_email=eq.${encodeURIComponent(email)}`, { method: "DELETE" });
  if (!del.ok) throw new Error(`supabase ${table} delete ${del.status}: ${await del.text()}`);
  if (!rows.length) return;
  const ins = await rest(table, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows)
  });
  if (!ins.ok) throw new Error(`supabase ${table} insert ${ins.status}: ${await ins.text()}`);
}

async function writeNormalized(email, data) {
  await replaceRows(ENTRIES_TABLE, email, arr(data.entries).map((e) => entryToRow(email, e)));
  await replaceRows(EVIDENCE_TABLE, email, arr(data.evidence).map((e) => evidenceToRow(email, e)));
  await replaceRows(SUPPORT_TABLE, email, resourcesToRows(email, data.resources));
}

async function readNormalized(email, snapshot) {
  const state = snapshot && typeof snapshot === "object" ? snapshot : null;
  if (!state) return null;
  const [entries, evidence, resources] = await Promise.all([
    tableRows(ENTRIES_TABLE, email, "*", "&order=created_at.desc"),
    tableRows(EVIDENCE_TABLE, email, "*", "&order=created_at.desc"),
    tableRows(SUPPORT_TABLE, email)
  ]);
  return {
    ...state,
    entries: entries.length ? entries.map(rowToEntry) : arr(state.entries),
    evidence: evidence.length ? evidence.map(rowToEvidence) : arr(state.evidence),
    resources: resources.length ? rowsToResources(resources) : (state.resources || {})
  };
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
  if (!configured()) {
    return res.status(500).json({ ok: false, error: "supabase_not_configured" });
  }

  const email = normalizeEmail(req.query && req.query.email);
  if (!email) return res.status(400).json({ ok: false, error: "bad_email" });
  const eq = `email=eq.${encodeURIComponent(email)}`;

  try {
    if (req.method === "GET") {
      const r = await rest(`${USERS_TABLE}?${eq}&select=data,updated_at`);
      if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
      const rows = await r.json();
      if (!rows.length) return res.status(200).json({ ok: true, data: null });
      const data = await readNormalized(email, rows[0].data);
      return res.status(200).json({ ok: true, data, updatedAt: rows[0].updated_at });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const data = await readBody(req);
      if (!data || typeof data !== "object") return res.status(400).json({ ok: false, error: "bad_json" });
      const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
      const r = await rest(`${USERS_TABLE}?on_conflict=email`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ email, profile: data.profile || {}, data, updated_at: updatedAt })
      });
      if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
      await writeNormalized(email, data);
      return res.status(200).json({ ok: true, updatedAt });
    }

    if (req.method === "DELETE") {
      await Promise.all([
        replaceRows(ENTRIES_TABLE, email, []),
        replaceRows(EVIDENCE_TABLE, email, []),
        replaceRows(SUPPORT_TABLE, email, [])
      ]);
      const r = await rest(`${USERS_TABLE}?${eq}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT, POST, DELETE");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "supabase_error", detail: String(e && e.message || e) });
  }
};
