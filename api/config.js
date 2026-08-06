"use strict";

/**
 * Публічна конфігурація для клієнта (без секретів).
 * GOOGLE_CLIENT_ID — OAuth 2.0 Web Client ID з Google Cloud Console.
 */
const { bearerToken, createAuthStore } = require("./_auth");
const { configured, rest } = require("./_supabase");
const { isAdminEmail } = require("./_admin");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  let admin = false;
  try {
    const token = bearerToken(req);
    if (token && configured()) {
      const store = createAuthStore(rest, configured());
      const session = await store.getSession(token);
      if (session && isAdminEmail(session.email)) admin = true;
    }
  } catch (e) {
    admin = false;
  }
  res.setHeader("Cache-Control", "private, max-age=30");
  return res.status(200).json({
    ok: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    admin
  });
};
