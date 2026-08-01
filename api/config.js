"use strict";

/**
 * Публічна конфігурація для клієнта (без секретів).
 * GOOGLE_CLIENT_ID — OAuth 2.0 Web Client ID з Google Cloud Console.
 */
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).json({
    ok: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || ""
  });
};
