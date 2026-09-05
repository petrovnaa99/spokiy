"use strict";



const { configured, rest } = require("../_supabase");

const { normalizeEmail, readJsonBody, devCodeHint, createAuthStore } = require("../_auth");

const { mailConfigured, sendAuthCodeEmail } = require("../_mail");



module.exports = async (req, res) => {

  if (req.method !== "POST") {

    res.setHeader("Allow", "POST");

    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  }

  if (!configured()) return res.status(500).json({ ok: false, error: "supabase_not_configured" });



  const body = readJsonBody(req);

  const email = normalizeEmail(body && body.email);

  const purpose = body && body.purpose === "reset" ? "reset" : "login";



  if (!email) return res.status(400).json({ ok: false, error: "bad_email" });



  const store = createAuthStore(rest, true);

  try {

    const cred = await store.getCredential(email);

    if (!cred) {

      // Не розкриваємо, чи існує email

      return res.status(200).json({ ok: true, message: "if_account_exists_code_sent" });

    }



    const allowDevHint = process.env.DEV_AUTH_HINT === "1" || process.env.NODE_ENV === "development";

    if (!mailConfigured() && !allowDevHint) {

      return res.status(503).json({ ok: false, error: "email_not_configured" });

    }



    const { code } = await store.setCode(email, purpose, undefined);



    if (mailConfigured()) {

      const sent = await sendAuthCodeEmail({ to: email, code, purpose });

      if (!sent.ok) {

        return res.status(502).json({

          ok: false,

          error: sent.error || "email_send_failed",

          detail: sent.detail

        });

      }

    }



    return res.status(200).json({

      ok: true,

      message: "code_sent",

      purpose,

      ...devCodeHint(code)

    });

  } catch (e) {

    return res.status(502).json({ ok: false, error: "auth_error", detail: String(e.message || e) });

  }

};


