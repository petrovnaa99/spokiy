"use strict";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() {
  return !!(SUPABASE_URL && SERVICE_KEY);
}

function rest(query, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

module.exports = { configured, rest };
