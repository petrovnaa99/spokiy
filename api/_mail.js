"use strict";

/**
 * Transactional email for auth codes (Resend HTTP API — no npm deps).
 *
 * Env:
 *   RESEND_API_KEY  — required to send
 *   MAIL_FROM       — optional, default: Спокій <noreply@spokiy.me>
 *   SITE_URL        — optional, used in email body
 */

function mailConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

function mailFrom() {
  const raw = String(process.env.MAIL_FROM || "").trim();
  return raw || "Спокій <noreply@spokiy.me>";
}

function siteUrl() {
  const raw = String(process.env.SITE_URL || "https://spokiy.me").trim().replace(/\/+$/, "");
  return raw || "https://spokiy.me";
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAuthCodeEmail({ code, purpose }) {
  const isReset = purpose === "reset";
  const title = isReset ? "Код для зміни пароля" : "Код для входу";
  const lead = isReset
    ? "Ти просиш змінити пароль у «Спокої». Ось одноразовий код:"
    : "Ти просиш увійти в «Спокій» без пароля. Ось одноразовий код:";
  const safeCode = escapeHtml(code);
  const url = escapeHtml(siteUrl());

  const text = [
    title,
    "",
    lead,
    "",
    String(code),
    "",
    "Код дійсний 10 хвилин. Якщо ти не просив(ла) цей лист — просто ігноруй його.",
    "",
    url
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff4ea;font-family:Segoe UI,Arial,sans-serif;color:#142033;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff4ea;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:18px;border:1px solid #e8dfd4;padding:28px 24px;">
        <tr><td>
          <div style="font-size:28px;font-weight:700;color:#0a2248;margin:0 0 6px;">Спокій</div>
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0a2248;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#4a5d73;">${escapeHtml(lead)}</p>
          <div style="letter-spacing:0.28em;font-size:32px;font-weight:700;text-align:center;padding:16px 12px;border-radius:14px;background:#f4f7fb;color:#0a2248;border:1px solid #d9e2ef;">${safeCode}</div>
          <p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7a8aa0;">Код дійсний <strong>10 хвилин</strong>. Якщо ти не просив(ла) цей лист — просто ігноруй його.</p>
          <p style="margin:14px 0 0;font-size:13px;"><a href="${url}" style="color:#2f6fed;text-decoration:none;">${url}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: `${title}: ${code}`, text, html };
}

/**
 * @param {{ to: string, code: string, purpose?: string }} opts
 * @returns {Promise<{ ok: true, id?: string } | { ok: false, error: string, detail?: string }>}
 */
async function sendAuthCodeEmail(opts) {
  const to = String(opts && opts.to || "").trim().toLowerCase();
  const code = String(opts && opts.code || "").trim();
  const purpose = opts && opts.purpose === "reset" ? "reset" : "login";
  if (!to || !code) return { ok: false, error: "bad_request" };

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return { ok: false, error: "email_not_configured" };

  const { subject, text, html } = buildAuthCodeEmail({ code, purpose });

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [to],
        subject,
        text,
        html
      })
    });
    const raw = await r.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
    if (!r.ok) {
      const detail = (json && (json.message || json.error)) || raw || String(r.status);
      return { ok: false, error: "email_send_failed", detail: String(detail).slice(0, 300) };
    }
    return { ok: true, id: json && json.id };
  } catch (e) {
    return { ok: false, error: "email_send_failed", detail: String(e && e.message || e).slice(0, 300) };
  }
}

module.exports = {
  mailConfigured,
  mailFrom,
  sendAuthCodeEmail,
  buildAuthCodeEmail
};
