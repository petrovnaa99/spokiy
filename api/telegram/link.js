"use strict";

const { configured, rest } = require("../_supabase");
const { bearerToken, createAuthStore } = require("../_auth");
const { createStore } = require("../telegram/_store");
const { getMe } = require("../telegram/_api");
const { LINK_TTL_MS } = require("../telegram/_store");

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

async function sessionEmail(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const store = createAuthStore(rest, configured());
  const session = await store.getSession(token);
  return session ? session.email : null;
}

module.exports = async (req, res) => {
  const store = createStore();
  if (!store) {
    return res.status(503).json({ ok: false, error: "store_not_configured" });
  }

  if (req.method === "GET") {
    const email = await sessionEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    const row = await store.getByEmail(email);
    let botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
    if (!botUsername && configured()) {
      try { botUsername = (await getMe()).username || ""; } catch { /* ignore */ }
    }
    return res.status(200).json({
      ok: true,
      linked: !!row,
      botUsername,
      settings: row ? (typeof row.settings === "string" ? JSON.parse(row.settings) : row.settings) : null
    });
  }

  if (req.method === "POST") {
    const email = await sessionEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });

    const body = readJsonBody(req) || {};
    if (body.action === "unlink") {
      await store.deleteByEmail(email);
      return res.status(200).json({ ok: true, linked: false });
    }

    const { token, expires_at } = await store.createLinkToken(email);
    let botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
    if (!botUsername && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const me = await getMe();
        botUsername = me.username || "";
      } catch { /* ignore */ }
    }
    const startPayload = `link_${token}`;
    const linkUrl = botUsername
      ? `https://t.me/${botUsername}?start=${startPayload}`
      : null;

    return res.status(200).json({
      ok: true,
      token,
      startPayload,
      linkUrl,
      botUsername,
      expiresAt: expires_at,
      expiresInSec: Math.round(LINK_TTL_MS / 1000)
    });
  }

  if (req.method === "DELETE") {
    const email = await sessionEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: "auth_required" });
    await store.deleteByEmail(email);
    return res.status(200).json({ ok: true, linked: false });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
};
