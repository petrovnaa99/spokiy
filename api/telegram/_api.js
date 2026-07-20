"use strict";

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || "";

function configured() {
  return !!BOT_TOKEN();
}

async function tgCall(method, body) {
  const token = BOT_TOKEN();
  if (!token) throw new Error("telegram_not_configured");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await r.json();
  if (!json.ok) throw new Error(json.description || "telegram_api_error");
  return json.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: extra.parseMode || undefined,
    reply_markup: extra.replyMarkup || undefined,
    disable_web_page_preview: true
  });
}

async function answerCallback(callbackQueryId, text) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text || undefined,
    show_alert: false
  });
}

async function getMe() {
  return tgCall("getMe", {});
}

async function setWebhook(url, secretToken) {
  return tgCall("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"]
  });
}

module.exports = {
  configured,
  sendMessage,
  answerCallback,
  getMe,
  setWebhook,
  tgCall
};
