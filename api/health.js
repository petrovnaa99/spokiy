/*
 * Vercel serverless: перевірка стану та конфігурації Supabase.
 * GET /api/health -> { ok, supabase: true|false, time }
 */
"use strict";

module.exports = (req, res) => {
  const configured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  res.status(200).json({ ok: true, supabase: configured, time: new Date().toISOString() });
};
