"use strict";

const { configured, rest } = require("../_supabase");
const {
  normalizeEmail, createPasswordRecord, readJsonBody, createAuthStore
} = require("../_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!configured()) return res.status(500).json({ ok: false, error: "supabase_not_configured" });

  const body = readJsonBody(req);
  const email = normalizeEmail(body && body.email);
  const code = body && String(body.code || "").trim();
  const password = body && body.password;

  if (!email) return res.status(400).json({ ok: false, error: "bad_email" });
  if (!code) return res.status(400).json({ ok: false, error: "code_required" });
  if (!password || String(password).length < 6) {
    return res.status(400).json({ ok: false, error: "weak_password" });
  }

  const store = createAuthStore(rest, true);
  try {
    const cred = await store.getCredential(email);
    if (!cred) return res.status(401).json({ ok: false, error: "unknown_email" });
    const valid = await store.verifyCode(email, "reset", code);
    if (!valid) return res.status(401).json({ ok: false, error: "invalid_code" });

    const { salt, password_hash } = createPasswordRecord(password);
    await store.upsertCredential({
      email,
      salt,
      password_hash,
      name: cred.name,
      gender: cred.gender,
      created_at: cred.created_at || new Date().toISOString()
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "auth_error", detail: String(e.message || e) });
  }
};
