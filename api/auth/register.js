"use strict";

const { configured, rest } = require("../_supabase");
const {
  normalizeEmail, createPasswordRecord, verifyPassword, createToken,
  readJsonBody, devCodeHint, createAuthStore
} = require("../_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!configured()) return res.status(500).json({ ok: false, error: "supabase_not_configured" });

  const body = readJsonBody(req);
  const email = normalizeEmail(body && body.email);
  const password = body && body.password;
  const name = body && String(body.name || "").trim();
  const gender = body && body.gender;

  if (!email) return res.status(400).json({ ok: false, error: "bad_email" });
  if (!password || String(password).length < 6) {
    return res.status(400).json({ ok: false, error: "weak_password" });
  }
  if (!name) return res.status(400).json({ ok: false, error: "name_required" });
  if (!gender || !["female", "male"].includes(gender)) {
    return res.status(400).json({ ok: false, error: "gender_required" });
  }

  const store = createAuthStore(rest, true);
  try {
    if (await store.emailExists(email)) {
      return res.status(409).json({ ok: false, error: "email_taken" });
    }
    const { salt, password_hash } = createPasswordRecord(password);
    await store.upsertCredential({
      email, salt, password_hash, name, gender,
      created_at: new Date().toISOString()
    });
    const token = createToken();
    const session = await store.createSession(email, token);
    return res.status(200).json({
      ok: true,
      token: session.token,
      expiresAt: session.expires_at,
      profile: { email, name, gender, provider: "email" }
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "auth_error", detail: String(e.message || e) });
  }
};
