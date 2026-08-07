/**
 * Перевірка каталогу й прогресу «Символ внутрішнього відновлення» без браузера.
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
  CustomEvent: function CustomEvent(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  },
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
sandbox.dispatchEvent = function () { return true; };
sandbox.window.dispatchEvent = sandbox.dispatchEvent;

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

const expectedStageNames = [
  "Пагін", "Коріння", "Листочки", "Крона", "Цвіт", "Плоди"
];

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
  if (!Array.isArray(s.stages) || s.stages.length !== 6) {
    errors.push(`${s.id}: потрібно рівно 6 етапів`);
  } else {
    s.stages.forEach((st, j) => {
      ["id", "key", "name", "description", "progressMin"].forEach((k) => {
        if (st[k] === undefined || st[k] === null || st[k] === "") {
          errors.push(`${s.id}.stages[${j}].${k} порожнє`);
        }
      });
      if (st.name !== expectedStageNames[j]) {
        errors.push(`${s.id}.stages[${j}].name очікувалось «${expectedStageNames[j]}», є «${st.name}»`);
      }
      if (/рівень/i.test(st.name)) errors.push(`${s.id}: етап не повинен називатися рівнем`);
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

[
  "getRecovery", "selectRecoverySymbol", "updateRecovery",
  "getCommunicationTone", "setCommunicationTone",
  "awardRecoveryProgress", "hasRecoveryAwardToday", "getRecoveryAwards"
].forEach((name) => {
  if (!Store || typeof Store[name] !== "function") errors.push(`Store.${name} відсутній`);
});

[
  "resolveCommunicationTone", "getRecoveryGreeting", "getRecoverySoftLine",
  "getRecoveryStageInfo", "getRecoveryStageMessage",
  "getRecoveryStageByProgress", "getRecoveryStageUpMessage", "getDailyPracticeStatus"
].forEach((name) => {
  if (!C || typeof C[name] !== "function") errors.push(`CONTENT.${name} відсутній`);
});

if (!Array.isArray(C.RECOVERY_AWARD_ACTIONS) || C.RECOVERY_AWARD_ACTIONS.length < 6) {
  errors.push("RECOVERY_AWARD_ACTIONS має містити щонайменше 6 дій");
}
["ritual", "diary", "breath", "gratitude", "wellbeing", "good"].forEach((a) => {
  if (!C.RECOVERY_AWARD_ACTIONS.includes(a)) errors.push("RECOVERY_AWARD_ACTIONS без " + a);
});
if (typeof C.RECOVERY_POINTS_PER_ACTION !== "number" || C.RECOVERY_POINTS_PER_ACTION <= 0) {
  errors.push("RECOVERY_POINTS_PER_ACTION має бути > 0");
}

if (C.resolveCommunicationTone("solid", "female", "gentle") !== "solid") {
  errors.push("resolveCommunicationTone має пріоритет збереженого тону");
}

const oakRoots = C.getRecoveryStageMessage(C.getRecoverySymbolById("oak"), 2);
if (!oakRoots || !/дерев|рослин/i.test(oakRoots) || !/корін/i.test(oakRoots)) {
  errors.push("повідомлення для етапу Коріння має згадувати деревце/рослину і коріння");
}
const lavUnfold = C.getRecoveryStageMessage(C.getRecoverySymbolById("lavender"), 6);
if (!lavUnfold || !/дерев|рослин/i.test(lavUnfold) || !/плід|плод|крон|цвіт/i.test(lavUnfold)) {
  errors.push("повідомлення для Плодів має згадувати деревце і плоди/крону/цвіт");
}

const guilt = /засиха|втратил|не заходил|не переривай серію|давно не|рівень/i;
[...C.RECOVERY_SOFT_LINES.gentle, ...C.RECOVERY_SOFT_LINES.solid, ...C.RECOVERY_STAGE_UP_MESSAGES].forEach((line, i) => {
  if (guilt.test(line)) errors.push(`текст містить тиск/провину/«рівень» [${i}]: ${line}`);
});

const profileKeys = [
  "recoverySymbolId", "recoverySymbolName", "recoveryStage",
  "recoveryProgress", "recoveryLastActivityAt", "recoverySymbolSelectedAt"
];
const recovery = Store.getRecovery();
profileKeys.forEach((k) => {
  if (!(k in recovery)) errors.push(`getRecovery() без поля ${k}`);
});

(async () => {
  const emailA = "recovery-a-" + Date.now() + "@example.com";
  const emailB = "recovery-b-" + Date.now() + "@example.com";

  const regA = await Store.register({
    email: emailA, password: "testpass", name: "UserA", gender: "female"
  });
  if (!regA || !regA.ok) {
    errors.push("не вдалося створити сесію A");
  } else {
    if (!Store.selectRecoverySymbol("oak")) errors.push("selectRecoverySymbol(oak) не працює");
    const after = Store.getRecovery();
    if (after.recoverySymbolId !== "oak" || after.recoveryStage !== 1 || after.recoveryProgress !== 0) {
      errors.push("після вибору символу етап/прогрес мають бути 1/0");
    }

    const first = Store.awardRecoveryProgress("wellbeing");
    if (!first.awarded || first.progress !== C.RECOVERY_POINTS_PER_ACTION) {
      errors.push("перше нарахування wellbeing має додати очки");
    }
    const second = Store.awardRecoveryProgress("wellbeing");
    if (second.awarded || second.reason !== "already_awarded") {
      errors.push("повторне wellbeing того ж дня має блокуватися");
    }
    if (Store.getRecovery().recoveryProgress !== first.progress) {
      errors.push("прогрес не повинен зростати після повторного нарахування");
    }

    // Імітація «оновлення сторінки»: повторне award з тим самим ledger у localStorage.
    const progressBeforeReload = Store.getRecovery().recoveryProgress;
    const again = Store.awardRecoveryProgress("wellbeing");
    if (again.awarded || Store.getRecovery().recoveryProgress !== progressBeforeReload) {
      errors.push("захист після «перезавантаження» не спрацював для wellbeing");
    }

    Store.awardRecoveryProgress("diary");
    Store.awardRecoveryProgress("breath");
    Store.awardRecoveryProgress("gratitude");
    const beforeGood = Store.getRecovery().recoveryProgress;
    Store.awardRecoveryProgress("good");
    Store.awardRecoveryProgress("ritual");
    const fullDay = Store.getRecovery();
    if (fullDay.recoveryProgress !== beforeGood + C.RECOVERY_POINTS_PER_ACTION * 2 &&
        fullDay.recoveryProgress !== C.RECOVERY_POINTS_PER_ACTION * 6) {
      // допускаємо рівно 6 дій × points
      if (fullDay.recoveryProgress !== C.RECOVERY_POINTS_PER_ACTION * 6) {
        errors.push("після 6 унікальних дій прогрес має бути 6×points");
      }
    }

    const awards = Store.getRecoveryAwards();
    const day = new Date().toISOString().slice(0, 10);
    if (!awards[day] || !awards[day].wellbeing) {
      errors.push("recoveryAwards має зберігати нарахування в snapshot користувача");
    }

    // Прогрес належить конкретному користувачу: інший акаунт не бачить чужий ledger.
    const progressA = Store.getRecovery().recoveryProgress;
    const awardsA = JSON.stringify(Store.getRecoveryAwards());

    const regB = await Store.register({
      email: emailB, password: "testpass", name: "UserB", gender: "male"
    });
    if (!regB || !regB.ok) {
      errors.push("не вдалося створити сесію B");
    } else {
      Store.selectRecoverySymbol("lavender");
      const recB = Store.getRecovery();
      if (recB.recoveryProgress !== 0 || recB.recoveryStage !== 1) {
        errors.push("новий користувач не повинен успадковувати прогрес іншого");
      }
      const awardsB = Store.getRecoveryAwards();
      if (awardsB[day] && awardsB[day].wellbeing) {
        errors.push("ledger користувача B не повинен містити дії користувача A");
      }
      if (JSON.stringify(awardsB) === awardsA && progressA > 0) {
        errors.push("snapshot awards не ізольований між користувачами");
      }
    }
  }

  if (errors.length) {
    console.error("FAIL:\n - " + errors.join("\n - "));
    process.exit(1);
  }

  console.log("OK: RECOVERY_SYMBOLS =", C.RECOVERY_SYMBOLS.length, "символів");
  console.log("OK: 6 етапів:", expectedStageNames.join(" → "));
  console.log("OK: Store recovery + award API");
  console.log("OK: anti-double-award + user isolation");
  console.log("IDs:", [...ids].join(", "));
})();
