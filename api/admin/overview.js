"use strict";

const { configured, rest } = require("../_supabase");
const { assertAdmin, resolveAdminEmails, isSeedAdmin } = require("../_admin");
const { configured: tgConfigured } = require("../telegram/_api");
const { normalizeEmail } = require("../_auth");

async function countTable(table) {
  const r = await rest(`${table}?select=email`, {
    headers: { Prefer: "count=exact", Range: "0-0" }
  });
  if (!r.ok) return null;
  const range = r.headers.get("content-range") || r.headers.get("Content-Range") || "";
  const m = String(range).match(/\/(\d+|\*)/);
  if (m && m[1] !== "*") return Number(m[1]);
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : null;
}

async function countRows(table, select = "id") {
  const r = await rest(`${table}?select=${select}`, {
    headers: { Prefer: "count=exact", Range: "0-0" }
  });
  if (!r.ok) return null;
  const range = r.headers.get("content-range") || r.headers.get("Content-Range") || "";
  const m = String(range).match(/\/(\d+|\*)/);
  if (m && m[1] !== "*") return Number(m[1]);
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = await assertAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  if (!configured()) {
    return res.status(503).json({ ok: false, error: "supabase_not_configured" });
  }

  try {
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const [usersTotal, tgLinked, diaryTotal, recentUsersRes, tgRowsRes] = await Promise.all([
      countTable("users"),
      countTable("telegram_users"),
      countRows("diary_entries", "id"),
      rest(`users?select=email,updated_at,profile&order=updated_at.desc&limit=40`),
      rest(`telegram_users?select=email,linked_at&limit=500`)
    ]);

    const recentUsers = recentUsersRes.ok ? await recentUsersRes.json() : [];
    const tgRows = tgRowsRes.ok ? await tgRowsRes.json() : [];
    const tgSet = new Set((tgRows || []).map((r) => String(r.email || "").toLowerCase()));

    const active7 = (recentUsers || []).filter((u) => {
      const t = Date.parse(u.updated_at || 0);
      return t && t >= Date.parse(since7);
    }).length;

    const users = (recentUsers || []).map((u) => {
      const email = String(u.email || "");
      const profile = u.profile && typeof u.profile === "object" ? u.profile : {};
      return {
        email,
        name: profile.name || email.split("@")[0] || "—",
        updatedAt: u.updated_at || null,
        telegram: tgSet.has(email.toLowerCase()),
        recoveryStage: profile.recoveryStage || null
      };
    });

    const resolved = await resolveAdminEmails();
    const admins = [
      ...resolved.seed.map((email) => ({ email, role: "owner", locked: true })),
      ...resolved.helpers.map((r) => ({
        email: normalizeEmail(r.email),
        role: "helper",
        locked: false,
        addedBy: r.added_by || null,
        createdAt: r.created_at || null
      }))
    ];

    return res.status(200).json({
      ok: true,
      admin: auth.email,
      isOwner: isSeedAdmin(auth.email),
      stats: {
        usersTotal: usersTotal ?? users.length,
        telegramLinked: tgLinked ?? tgSet.size,
        diaryEntries: diaryTotal,
        activeLast7Days: active7,
        telegramBot: tgConfigured(),
        supabase: true
      },
      users,
      admins,
      note: "Тексти щоденників тут не показуються — лише службова статистика."
    });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: "admin_overview_failed",
      detail: String(e && e.message || e)
    });
  }
};
