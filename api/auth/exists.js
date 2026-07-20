"use strict";

const { configured, rest } = require("../_supabase");
const { normalizeEmail, createAuthStore } = require("../_auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!configured()) return res.status(500).json({ ok: false, error: "supabase_not_configured" });

  const email = normalizeEmail(req.query && req.query.email);
  if (!email) return res.status(400).json({ ok: false, error: "bad_email" });

  const store = createAuthStore(rest, true);
  try {
    const exists = await store.emailExists(email);
    return res.status(200).json({ ok: true, exists });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "auth_error", detail: String(e.message || e) });
  }
};
