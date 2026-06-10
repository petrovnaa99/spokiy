/*
 * Спокій — бекенд «під ключ».
 * Один файл: віддає статичний сайт і надає REST API для збереження даних у SQLite.
 *
 * Запуск:   node serve.js   (або: npm start)
 * Потрібен Node.js >= 22.5 (вбудований модуль node:sqlite, без зовнішніх залежностей).
 *
 * API (дані прив'язані до email користувача):
 *   GET    /api/health            -> { ok: true }
 *   GET    /api/state/:email      -> { ok: true, data: <стан|null>, updatedAt }
 *   PUT    /api/state/:email      тіло = JSON стану -> { ok: true, updatedAt }
 *   DELETE /api/state/:email      -> { ok: true }
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "spokiy.db");

/* ---------- База даних ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    email      TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const qGet = db.prepare("SELECT data, updated_at FROM users WHERE email = ?");
const qUpsert = db.prepare(`
  INSERT INTO users (email, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`);
const qDelete = db.prepare("DELETE FROM users WHERE email = ?");

/* ---------- Допоміжні ---------- */
function normalizeEmail(raw) {
  const e = decodeURIComponent(String(raw || "")).trim().toLowerCase();
  if (!e || e.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return e;
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("payload_too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ---------- API ---------- */
async function handleApi(req, res, pathname) {
  if (pathname === "/api/health") {
    return sendJSON(res, 200, { ok: true, time: new Date().toISOString() });
  }

  const m = pathname.match(/^\/api\/state\/(.+)$/);
  if (!m) return sendJSON(res, 404, { ok: false, error: "not_found" });

  const email = normalizeEmail(m[1]);
  if (!email) return sendJSON(res, 400, { ok: false, error: "bad_email" });

  if (req.method === "GET") {
    const row = qGet.get(email);
    if (!row) return sendJSON(res, 200, { ok: true, data: null });
    let data = null;
    try { data = JSON.parse(row.data); } catch { data = null; }
    return sendJSON(res, 200, { ok: true, data, updatedAt: row.updated_at });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let raw;
    try { raw = await readBody(req); }
    catch { return sendJSON(res, 413, { ok: false, error: "payload_too_large" }); }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return sendJSON(res, 400, { ok: false, error: "bad_json" }); }
    const updatedAt = (parsed && typeof parsed.updatedAt === "string")
      ? parsed.updatedAt
      : new Date().toISOString();
    qUpsert.run(email, JSON.stringify(parsed), updatedAt);
    return sendJSON(res, 200, { ok: true, updatedAt });
  }

  if (req.method === "DELETE") {
    qDelete.run(email);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 405, { ok: false, error: "method_not_allowed" });
}

/* ---------- Статика ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".map": "application/json; charset=utf-8"
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  // Безпечне розв'язання шляху всередині кореня проєкту.
  const resolved = path.normalize(path.join(ROOT, rel));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    return sendJSON(res, 403, { ok: false, error: "forbidden" });
  }
  fs.stat(resolved, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 — не знайдено");
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

/* ---------- Сервер ---------- */
const server = http.createServer((req, res) => {
  let pathname = "/";
  try { pathname = new URL(req.url, `http://${req.headers.host || HOST}`).pathname; }
  catch { pathname = req.url || "/"; }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((e) => {
      sendJSON(res, 500, { ok: false, error: "server_error", detail: String(e && e.message || e) });
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJSON(res, 405, { ok: false, error: "method_not_allowed" });
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Спокій запущено:  http://${HOST}:${PORT}`);
  console.log(`База даних SQLite: ${DB_PATH}`);
});

function shutdown() {
  try { db.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
