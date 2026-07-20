"use strict";

const { createStore } = require("./_store");
const { processUpdate } = require("./_handler");
const { configured } = require("./_api");

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => { d += c; });
    req.on("end", () => {
      try { resolve(JSON.parse(d || "{}")); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

function verifyWebhookSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  const got = req.headers["x-telegram-bot-api-secret-token"] ||
    req.headers["X-Telegram-Bot-Api-Secret-Token"];
  return got === expected;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!configured()) {
    return res.status(503).json({ ok: false, error: "telegram_not_configured" });
  }
  if (!verifyWebhookSecret(req)) {
    return res.status(403).json({ ok: false, error: "invalid_webhook_secret" });
  }

  const store = createStore();
  if (!store) {
    return res.status(503).json({ ok: false, error: "store_not_configured" });
  }

  try {
    const update = await readBody(req);
    if (!update) return res.status(400).json({ ok: false, error: "bad_json" });
    await processUpdate(store, update);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("telegram webhook error", e);
    return res.status(200).json({ ok: true, error: String(e.message || e) });
  }
};
