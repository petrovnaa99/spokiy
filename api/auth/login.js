"use strict";

const { configured, rest } = require("../_supabase");
const {
  normalizeEmail, verifyPassword, createToken, readJsonBody, createAuthStore
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
  const code = body && String(body.code || "").trim();

  if (!email) return res.status(400).json({ ok: false, error: "bad_email" });

  const store = createAuthStore(rest, true);
  try {
    const cred = await store.getCredential(email);
    if (!cred) return res.status(401).json({ ok: false, error: "unknown_email" });

    let ok = false;
    if (password) {
      ok = verifyPassword(password, cred.salt, cred.password_hash);
    } else if (code) {
      ok = await store.verifyCode(email, "login", code);
    } else {
      return res.status(400).json({ ok: false, error: "password_or_code_required" });
    }
    if (!ok) return res.status(401).json({ ok: false, error: "invalid_credentials" });

    const token = createToken();
    const session = await store.createSession(email, token);
    return res.status(200).json({
      ok: true,
      token: session.token,
      expiresAt: session.expires_at,
      profile: {
        email,
        name: cred.name || email.split("@")[0],
        gender: cred.gender || null,
        provider: "email"
      }
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "auth_error", detail: String(e.message || e) });
  }
};
