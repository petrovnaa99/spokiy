/*
 * Vercel serverless: перевірка стану та конфігурації Supabase.
 * GET /api/health -> { ok, supabase: true|false, time }
 */
"use strict";

const { configured } = require("./_supabase");

module.exports = (req, res) => {
  res.status(200).json({ ok: true, supabase: configured(), time: new Date().toISOString() });
};
