/**
 * Перевірка каталогу «Символ внутрішнього відновлення» без браузера.
 * Запуск: node scripts/validate-recovery.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(root, "js", "content.js"), "utf8");
const storageSrc = fs.readFileSync(path.join(root, "js", "storage.js"), "utf8");

const mem = Object.create(null);
const localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem(k, v) { mem[k] = String(v); },
  removeItem(k) { delete mem[k]; }
};

const sandbox = {
  console,
  localStorage,
  location: { protocol: "file:" },
  fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
  CustomEvent: function CustomEvent() {},
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error,
  setTimeout,
  clearTimeout,
  encodeURIComponent
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(contentSrc, sandbox, { filename: "content.js" });
vm.runInContext(storageSrc, sandbox, { filename: "storage.js" });

const C = sandbox.CONTENT;
const Store = sandbox.Store;
if (!C || !C.RECOVERY_SYMBOLS) {
  console.error("FAIL: CONTENT.RECOVERY_SYMBOLS відсутній");
  process.exit(1);
}

const required = [
  "id", "name", "shortDescription", "meaning", "phrase",
  "visualStyle", "availableToAll", "stages", "illustrationPath"
];
const ids = new Set();
const errors = [];

C.RECOVERY_SYMBOLS.forEach((s, i) => {
  required.forEach((k) => {
    if (s[k] === undefined || s[k] === null || s[k] === "") {
      errors.push(`symbol[${i}].${k} порожнє`);
    }
  });
  if (ids.has(s.id)) errors.push(`дубль id: ${s.id}`);
  ids.add(s.id);
  if (s.visualStyle !== "gentle" && s.visualStyle !== "solid") {
    errors.push(`${s.id}: visualStyle має бути gentle|solid`);
  }
  if (s.availableToAll !== true) errors.push(`${s.id}: availableToAll має бути true`);
  if (!Array.isArray(s.stages) || s.stages.length < 1) {
    errors.push(`${s.id}: потрібен список етапів`);
  } else {
    s.stages.forEach((st, j) => {
      ["id", "key", "name", "description", "progressMin"].forEach((k) => {
        if (st[k] === undefined || st[k] === null || st[k] === "") {
          errors.push(`${s.id}.stages[${j}].${k} порожнє`);
        }
      });
    });
  }
  if (typeof s.illustrationPath !== "string" || !s.illustrationPath.includes(s.id)) {
    errors.push(`${s.id}: illustrationPath має містити id символу`);
  }
});

const expected = ["lavender", "magnolia", "olive", "oak", "cedar", "bonsai"];
expected.forEach((id) => {
  if (!ids.has(id)) errors.push(`відсутній символ: ${id}`);
});

const orderedMale = C.orderRecoverySymbolsForGender("male");
const orderedFemale = C.orderRecoverySymbolsForGender("female");
if (orderedMale.length !== C.RECOVERY_SYMBOLS.length || orderedFemale.length !== C.RECOVERY_SYMBOLS.length) {
  errors.push("orderForGender не повинен ховати символи");
}
if (orderedMale[0].visualStyle !== "solid") errors.push("для male першим має бути solid");
if (orderedFemale[0].visualStyle !== "gentle") errors.push("для female першим має бути gentle");

["getRecovery", "selectRecoverySymbol", "updateRecovery"].forEach((name) => {
  if (!Store || typeof Store[name] !== "function") errors.push(`Store.${name} відсутній`);
});

const profileKeys = [
  "recoverySymbolId", "recoverySymbolName", "recoveryStage",
  "recoveryProgress", "recoveryLastActivityAt", "recoverySymbolSelectedAt"
];
const recovery = Store.getRecovery();
profileKeys.forEach((k) => {
  if (!(k in recovery)) errors.push(`getRecovery() без поля ${k}`);
});

if (errors.length) {
  console.error("FAIL:\n - " + errors.join("\n - "));
  process.exit(1);
}

console.log("OK: RECOVERY_SYMBOLS =", C.RECOVERY_SYMBOLS.length, "символів");
console.log("OK: Store recovery API присутній");
console.log("IDs:", [...ids].join(", "));
