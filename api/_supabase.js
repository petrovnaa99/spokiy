"use strict";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() {
  return !!(SUPABASE_URL && SERVICE_KEY);
}

/** Нові sb_secret_ ключі — лише apikey; legacy JWT service_role — apikey + Bearer. */
function authHeaders(extra = {}) {
  const key = SERVICE_KEY || "";
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    ...extra
  };
  if (key && !key.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function rest(query, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
}

module.exports = { configured, rest, authHeaders };
