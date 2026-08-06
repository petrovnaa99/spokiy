"use strict";

const { normalizeEmail, readJsonBody } = require("../_auth");
const { configured } = require("../_supabase");
const {
  assertAdmin,
  resolveAdminEmails,
  addHelperEmail,
  removeHelperEmail,
  isSeedAdmin
} = require("../_admin");

module.exports = async (req, res) => {
  if (!configured()) {
    return res.status(503).json({ ok: false, error: "supabase_not_configured" });
  }

  const auth = await assertAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  if (req.method === "GET") {
    const resolved = await resolveAdminEmails();
    return res.status(200).json({
      ok: true,
      owners: resolved.seed.map((email) => ({ email, role: "owner", locked: true })),
      helpers: resolved.helpers.map((r) => ({
        email: normalizeEmail(r.email),
        role: "helper",
        locked: false,
        addedBy: r.added_by || null,
        createdAt: r.created_at || null
      }))
    });
  }

  if (req.method === "POST") {
    const body = readJsonBody(req) || {};
    const email = normalizeEmail(body.email);
    if (!email) return res.status(400).json({ ok: false, error: "bad_email" });
    const result = await addHelperEmail(email, auth.email);
    if (!result.ok) {
      const status = result.error === "db_error" ? 502 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json({ ok: true, email: result.email });
  }

  if (req.method === "DELETE") {
    const body = readJsonBody(req) || {};
    const q = req.query && req.query.email;
    const email = normalizeEmail(body.email || q);
    if (!email) return res.status(400).json({ ok: false, error: "bad_email" });
    if (isSeedAdmin(email)) {
      return res.status(400).json({ ok: false, error: "cannot_remove_owner" });
    }
    const result = await removeHelperEmail(email);
    if (!result.ok) {
      const status = result.error === "db_error" ? 502 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json({ ok: true, email: result.email });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
};
