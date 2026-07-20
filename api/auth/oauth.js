"use strict";

const { configured, rest } = require("../_supabase");
const {
  normalizeEmail, createPasswordRecord, createToken, readJsonBody, createAuthStore
} = require("../_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!configured()) return res.status(500).json({ ok: false, error: "supabase_not_configured" });

  const body = readJsonBody(req);
  const email = normalizeEmail(body && body.email);
  const name = String(body && body.name || "").trim();
  const gender = body && body.gender;
  const picture = body && body.picture;
  const provider = body && body.provider;

  if (!email || provider !== "google") {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

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
