"use strict";

const { configured, rest } = require("./_supabase");
const { normalizeEmail, bearerToken, createAuthStore } = require("./_auth");
const { assertAdmin } = require("./_admin");

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return await new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => { d += c; });
    req.on("end", () => {
      try { resolve(JSON.parse(d || "null")); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

async function assertUser(req) {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: "auth_required" };
  if (!configured()) return { ok: false, status: 503, error: "supabase_not_configured" };
  const store = createAuthStore(rest, configured());
  const session = await store.getSession(token);
  if (!session || !session.email) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, email: normalizeEmail(session.email), name: session.name || null };
}

function cleanMessage(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function cleanKind(raw) {
  const k = String(raw || "feedback").trim().toLowerCase();
  const allowed = ["feedback", "wish", "bug", "other"];
  return allowed.includes(k) ? k : "feedback";
}

module.exports = async (req, res) => {
  if (!configured()) {
    return res.status(503).json({ ok: false, error: "supabase_not_configured" });
  }

  if (req.method === "POST") {
    const auth = await assertUser(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const body = await readBody(req);
    const message = cleanMessage(body && body.message);
    const kind = cleanKind(body && body.kind);
    if (message.length < 5) {
      return res.status(400).json({ ok: false, error: "message_too_short" });
    }
    if (message.length > 4000) {
      return res.status(400).json({ ok: false, error: "message_too_long" });
    }

    const row = {
      email: auth.email,
      name: auth.name || (body && body.name) || null,
      kind,
      message
    };

    const r = await rest("site_feedback", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const missing = /relation|does not exist|PGRST/i.test(text);
      return res.status(missing ? 503 : 500).json({
        ok: false,
        error: missing ? "db_missing" : "db_error",
        detail: text.slice(0, 200)
      });
    }
    const rows = await r.json().catch(() => []);
    const saved = Array.isArray(rows) ? rows[0] : rows;
    return res.status(200).json({
      ok: true,
      id: saved && saved.id,
      createdAt: saved && saved.created_at
    });
  }

  if (req.method === "GET") {
    const auth = await assertAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const limit = Math.min(100, Math.max(1, Number(req.query && req.query.limit) || 40));
    const r = await rest(
      `site_feedback?select=id,email,name,kind,message,created_at,read_at&order=created_at.desc&limit=${limit}`
    );
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const missing = /relation|does not exist|PGRST/i.test(text);
      return res.status(missing ? 503 : 500).json({
        ok: false,
        error: missing ? "db_missing" : "db_error",
        items: []
      });
    }
    const rows = await r.json().catch(() => []);
    return res.status(200).json({
      ok: true,
      items: (Array.isArray(rows) ? rows : []).map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name || null,
        kind: row.kind || "feedback",
        message: row.message || "",
        createdAt: row.created_at || null,
        readAt: row.read_at || null
      }))
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
};
