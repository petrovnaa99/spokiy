"use strict";

const { setWebhook, configured, getMe } = require("./_api");
const { siteUrl } = require("./_messages");

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function verifySetupSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!verifySetupSecret(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!configured()) {
    return res.status(503).json({ ok: false, error: "telegram_not_configured" });
  }

  const body = readJsonBody(req) || {};
  const base = siteUrl();
  const webhookUrl = body.url || `${base}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(400).json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET_missing" });
  }

  try {
    const result = await setWebhook(webhookUrl, secret);
    const me = await getMe();
    return res.status(200).json({
      ok: true,
      webhookUrl,
      result,
      bot: { id: me.id, username: me.username, first_name: me.first_name }
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
};
