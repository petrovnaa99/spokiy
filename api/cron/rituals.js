"use strict";

const { createStore } = require("../telegram/_store");
const { runRitualCron } = require("../telegram/_handler");
const { configured } = require("../telegram/_api");

function verifyCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (String(auth) === `Bearer ${secret}`) return true;
  const q = req.query && req.query.secret;
  return q === secret;
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!verifyCron(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!configured()) {
    return res.status(503).json({ ok: false, error: "telegram_not_configured" });
  }

  const store = createStore();
  if (!store) {
    return res.status(503).json({ ok: false, error: "store_not_configured" });
  }

  try {
    const result = await runRitualCron(store);
    return res.status(200).json(result);
  } catch (e) {
    console.error("cron rituals error", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
