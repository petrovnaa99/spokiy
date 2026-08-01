"use strict";

const { configured, rest } = require("../_supabase");
const {
  normalizeEmail, createPasswordRecord, createToken, readJsonBody, createAuthStore, verifyGoogleIdToken
} = require("../_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!configured()) return res.status(500).json({ ok: false, error: "supabase_not_configured" });

  const body = readJsonBody(req) || {};
  const provider = body.provider;
  if (provider !== "google") {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

  let email = null;
  let name = "";
  let picture = null;
  const gender = body.gender || null;

  if (body.credential) {
    const payload = await verifyGoogleIdToken(body.credential);
    if (!payload) return res.status(401).json({ ok: false, error: "invalid_google_token" });
    email = normalizeEmail(payload.email);
    name = String(payload.name || payload.email.split("@")[0] || "").trim();
    picture = payload.picture || null;
  } else {
    // Сумісність зі старим клієнтом (менш безпечно) — лише якщо явно дозволено.
    if (process.env.ALLOW_LEGACY_OAUTH !== "1") {
      return res.status(400).json({ ok: false, error: "credential_required" });
    }
    email = normalizeEmail(body.email);
    name = String(body.name || "").trim();
    picture = body.picture || null;
  }

  if (!email) return res.status(400).json({ ok: false, error: "bad_request" });

  const store = createAuthStore(rest, true);
  try {
    let cred = await store.getCredential(email);
    const wasNew = !cred;
    if (!cred) {
      const { salt, password_hash } = createPasswordRecord(createToken());
      await store.upsertCredential({
        email, salt, password_hash,
        name: name || email.split("@")[0],
        gender: gender || null,
        created_at: new Date().toISOString()
      });
      cred = await store.getCredential(email);
    } else if (name && !cred.name) {
      await store.upsertCredential({
        email,
        salt: cred.salt,
        password_hash: cred.password_hash,
        name,
        gender: cred.gender || gender,
        created_at: cred.created_at
      });
      cred.name = name;
    }

    const token = createToken();
    const session = await store.createSession(email, token);
    return res.status(200).json({
      ok: true,
      token: session.token,
      expiresAt: session.expires_at,
      profile: {
        email,
        name: cred.name || name || email.split("@")[0],
        gender: cred.gender || gender || null,
        picture: picture || null,
        provider: "google"
      },
      isNew: wasNew
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "auth_error", detail: String(e.message || e) });
  }
};
