/* Ранкові / денні / вечірні ритуали на сайті */
window.Rituals = (function () {
  const WORRIES = ["Робота", "Стосунки", "Гроші", "Здоров'я", "Родина", "Самотність", "Інше"];

  const MORNING_MOODS = [
    { id: "very_good", emoji: "🙂", label: "Дуже добре", value: 5 },
    { id: "good", emoji: "😊", label: "Добре", value: 4 },
    { id: "ok", emoji: "😐", label: "Нормально", value: 3 },
    { id: "anxious", emoji: "😔", label: "Тривожно", value: 2 },
    { id: "hard", emoji: "😣", label: "Дуже важко", value: 1 }
  ];

  const DAY_MOODS = [
    { id: "good", emoji: "😊", label: "Добре", value: 4 },
    { id: "ok", emoji: "🙂", label: "Нормально", value: 3 },
    { id: "anxious", emoji: "😔", label: "Тривожно", value: 2 },
    { id: "hard", emoji: "😣", label: "Дуже важко", value: 1 }
  ];

  const DEFAULT_REMINDERS = {
    morning: { enabled: false, time: "08:00", days: [0, 1, 2, 3, 4, 5, 6], push: false },
    midday: { enabled: false, time: "14:00", days: [0, 1, 2, 3, 4, 5, 6], hoursAfterMorning: 5, push: false },
    evening: { enabled: false, time: "21:00", days: [0, 1, 2, 3, 4, 5, 6], push: false },
    timezone: "Europe/Kyiv",
    sent: {}
  };

  let deps = null;
  let reminderTimer = null;
  let morningDraft = null;

  function d() { return deps; }
  function S() { return deps.S.state; }

  function todayKey() {
    return deps.todayKey();
  }

  function ensureState() {
    const st = S();
    if (!st.rituals) st.rituals = {};
    if (!st.settings) st.settings = {};
    if (!st.settings.ritualDismiss) st.settings.ritualDismiss = {};
    if (!st.settings.reminders) st.settings.reminders = JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
    const r = st.settings.reminders;
    ["morning", "midday", "evening"].forEach((k) => {
      if (!r[k]) r[k] = { ...DEFAULT_REMINDERS[k] };
      if (!Array.isArray(r[k].days)) r[k].days = [0, 1, 2, 3, 4, 5, 6];
    });
    if (!r.timezone) r.timezone = DEFAULT_REMINDERS.timezone;
    if (!r.sent) r.sent = {};
    return st;
  }

  function todayRitual() {
    ensureState();
    const k = todayKey();
    return S().rituals[k] || {};
  }

  function saveRitual(type, data) {
    ensureState();
    const k = todayKey();
    S().rituals[k] = S().rituals[k] || {};
    S().rituals[k][type] = Object.assign({}, data, { at: new Date().toISOString(), source: "site" });
    deps.S.markCheckin(new Date().toISOString());
    deps.S.save();
    if (deps.S.awardRecoveryProgress) deps.S.awardRecoveryProgress("ritual");
  }

  function dismissToday(type) {
    ensureState();
    const k = todayKey();
    S().settings.ritualDismiss[k] = S().settings.ritualDismiss[k] || {};
    S().settings.ritualDismiss[k][type] = true;
    deps.S.save();
  }

  function isDismissed(type) {
    ensureState();
    const k = todayKey();
    return !!(S().settings.ritualDismiss[k] && S().settings.ritualDismiss[k][type]);
  }

  function localHour() {
    return new Date().getHours();
  }

  function hoursSince(iso) {
    if (!iso) return Infinity;
    return (Date.now() - Date.parse(iso)) / 3600000;
  }

  function shouldShowMorning() {
    if (todayRitual().morning || isDismissed("morning")) return false;
    return localHour() < 12;
  }

  function shouldShowEvening() {
    if (todayRitual().evening || isDismissed("evening")) return false;
    return localHour() >= 18;
  }

  function shouldShowMidday() {
    const t = todayRitual();
    if (t.midday || isDismissed("midday") || !t.morning) return false;
    const after = S().settings.reminders.midday.hoursAfterMorning || 5;
    return hoursSince(t.morning.at) >= after && localHour() >= 12 && localHour() < 18;
  }

  function moodButtons(moods, prefix) {
    return `<div class="ritual-moods">${moods.map((m) =>
      `<button type="button" class="ritual-mood" data-${prefix}="${m.id}" title="${deps.esc(m.label)}"><span>${m.emoji}</span><small>${deps.esc(m.label)}</small></button>`
    ).join("")}</div>`;
  }

  function starRow(selected) {
    return `<div class="ritual-stars" data-sleep="${selected || 0}">${[1, 2, 3, 4, 5].map((n) =>
      `<button type="button" class="ritual-star ${selected >= n ? "sel" : ""}" data-star="${n}">⭐</button>`
    ).join("")}</div>`;
  }

  function wireStars(root, onPick) {
    let val = +(root.dataset.sleep || 0);
    deps.$$(".ritual-star", root).forEach((b) => {
      b.onclick = () => {
        val = +b.dataset.star;
        root.dataset.sleep = val;
        deps.$$(".ritual-star", root).forEach((x, i) => x.classList.toggle("sel", i < val));
        onPick(val);
      };
    });
    return () => val;
  }

  function worryChips(selected) {
    return `<div class="chip-row ritual-worries">${WORRIES.map((w) =>
      `<button type="button" class="chip ${selected === w ? "sel" : ""}" data-worry="${deps.esc(w)}">${deps.esc(w)}</button>`
    ).join("")}</div>`;
  }

  function offerCalm() {
    deps.openModal(`
      <h2>🧘 Можливо, це допоможе</h2>
      <p class="muted" style="margin:0 0 14px">Короткі кроки — без тиску. Обери один.</p>
      <div class="stack">
        <button class="btn btn-primary btn-block" id="rc-breathe">Дихання 1 хвилина</button>
        <button class="btn btn-ghost btn-block" id="rc-ground">Швидке заземлення</button>
        <button class="btn btn-ghost btn-block" id="rc-write">Записати думки</button>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost btn-sm" data-close>Зараз ні</button>
      </div>`);
    deps.$("#rc-breathe").onclick = () => { deps.closeModal(); deps.startCalm("quick"); };
    deps.$("#rc-ground").onclick = () => { deps.closeModal(); deps.startCalm("quick"); };
    deps.$("#rc-write").onclick = () => { deps.closeModal(); deps.go("new"); };
  }

  function finishMorning() {
    saveRitual("morning", morningDraft);
    morningDraft = null;
    deps.closeModal();
    deps.toast("Гарного дня 🌿", "good");
  }

  function gratitudePrompt(slot) {
    const male = deps.isMale();
    const title = male ? "За що ти сьогодні вдячний?" : "За що ти сьогодні вдячна?";
    const hint = male
      ? "Це одне з важливих заповнень ранку й вечора. Напиши хоча б одну річ — навіть дрібну."
      : "Це одне з важливих заповнень ранку й вечора. Напиши хоча б одну річ — навіть дрібну.";
    const label = male ? "Сьогодні я вдячний за" : "Сьогодні я вдячна за";
    const placeholder = slot === "morning"
      ? (male
        ? "Напр.: за спокійний сон, за нову можливість, за підтримку..."
        : "Напр.: за спокійний сон, за нову можливість, за підтримку...")
      : (male
        ? "Напр.: за розмову, прогулянку, момент тиші, підтримку друга..."
        : "Напр.: за розмову, прогулянку, момент тиші, підтримку подруги...");
    return { title, hint, label, placeholder };
  }

  function persistGratitudeNote(text, source) {
    const t = (text || "").trim();
    if (!t || !deps.S.addGratitude) return;
    deps.S.addGratitude(t);
  }

  function openMorning() {
    morningDraft = { mood: null, sleep: 0, worry: "", gratitude: "", goal: "" };
    let step = 1;
    const totalSteps = 5;
    const sleepTitle = deps.isMale() ? "Як ти спав?" : "Як ти спала?";

    function paint() {
      let body = "";
      if (step === 1) {
        body = `
          <div class="ritual-badge">🌿</div>
          <h2>Доброго ранку</h2>
          <p class="muted">Як ти сьогодні почуваєшся?</p>
          ${moodButtons(MORNING_MOODS, "mm")}`;
      } else if (step === 2) {
        body = `
          <h2>${sleepTitle}</h2>
          <p class="muted">Обери кількість зірок</p>
          ${starRow(morningDraft.sleep)}`;
      } else if (step === 3) {
        body = `
          <h2>Що зараз найбільше турбує?</h2>
          ${worryChips(morningDraft.worry)}`;
      } else if (step === 4) {
        const g = gratitudePrompt("morning");
        body = `
          <div class="ritual-badge">∴</div>
          <h2>${deps.esc(g.title)}</h2>
          <p class="muted">${deps.esc(g.hint)}</p>
          <label class="field" style="margin-top:10px">
            <span>${deps.esc(g.label)}</span>
            <textarea class="quick-input" id="ritual-gratitude" rows="3" placeholder="${deps.esc(g.placeholder)}">${deps.esc(morningDraft.gratitude)}</textarea>
          </label>`;
      } else {
        body = `
          <h2>Яка одна маленька ціль на сьогодні?</h2>
          <input class="quick-input" id="ritual-goal" placeholder="Напр.: прогулянка, одна справа, відпочинок" value="${deps.esc(morningDraft.goal)}" />`;
      }

      deps.openModal(`
        <div class="ritual-modal">${body}
          <div class="row spread" style="margin-top:18px">
            <button class="btn btn-ghost btn-sm" id="rit-skip">Пізніше</button>
            ${step < totalSteps
              ? `<button class="btn btn-primary btn-sm" id="rit-next" ${step === 1 && !morningDraft.mood ? "disabled" : ""}>Далі</button>`
              : `<button class="btn btn-primary" id="rit-done">Почати день →</button>`}
          </div>
        </div>`);

      deps.$("#rit-skip").onclick = () => { dismissToday("morning"); morningDraft = null; deps.closeModal(); };

      if (step === 1) {
        deps.$$("[data-mm]", deps.$("#modal-root")).forEach((b) => b.onclick = () => {
          morningDraft.mood = b.dataset.mm;
          deps.$$("[data-mm]", deps.$("#modal-root")).forEach((x) => x.classList.remove("sel"));
          b.classList.add("sel");
          const n = deps.$("#rit-next"); if (n) n.disabled = false;
        });
        const n = deps.$("#rit-next");
        if (n) n.onclick = () => { if (morningDraft.mood) { step = 2; paint(); } };
      } else if (step === 2) {
        const stars = deps.$(".ritual-stars", deps.$("#modal-root"));
        wireStars(stars, (v) => { morningDraft.sleep = v; });
        deps.$("#rit-next").onclick = () => { step = 3; paint(); };
      } else if (step === 3) {
        deps.$$("[data-worry]", deps.$("#modal-root")).forEach((b) => b.onclick = () => {
          morningDraft.worry = b.dataset.worry;
          step = 4;
          paint();
        });
      } else if (step === 4) {
        const inp = deps.$("#ritual-gratitude");
        deps.$("#rit-next").onclick = () => {
          morningDraft.gratitude = (inp && inp.value || "").trim();
          if (!morningDraft.gratitude) {
            deps.toast(deps.isMale()
              ? "Це важливе заповнення — напиши, за що ти вдячний"
              : "Це важливе заповнення — напиши, за що ти вдячна", "warn");
            if (inp) inp.focus();
            return;
          }
          step = 5;
          paint();
        };
      } else {
        const inp = deps.$("#ritual-goal");
        deps.$("#rit-done").onclick = () => {
          morningDraft.goal = (inp && inp.value || "").trim();
          persistGratitudeNote(morningDraft.gratitude, "morning");
          saveRitual("morning", morningDraft);
          morningDraft = null;
          deps.closeModal();
          deps.openModal(`
            <div style="text-align:center;padding:8px 4px">
              <div style="font-size:36px">❤️</div>
              <p style="font-size:22px;line-height:1.45;font-family:var(--font-hand);margin:12px 0">Дякую ❤️<br>Бажаю тобі спокійного дня.</p>
            </div>
            <div class="row" style="justify-content:center"><button class="btn btn-primary" data-close>Дякую 🌿</button></div>`);
        };
      }
    }
    paint();
  }

  function openMidday() {
    deps.openModal(`
      <h2>Як ти зараз?</h2>
      <p class="muted">Швидка перевірка стану</p>
      ${moodButtons(DAY_MOODS, "mid")}
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost btn-sm" id="mid-skip">Пізніше</button>
      </div>`);
    deps.$("#mid-skip").onclick = () => { dismissToday("midday"); deps.closeModal(); };
    deps.$$("[data-mid]", deps.$("#modal-root")).forEach((b) => b.onclick = () => {
      const mood = b.dataset.mid;
      saveRitual("midday", { mood });
      deps.closeModal();
      deps.toast("Дякую ❤️", "good");
      if (mood === "anxious" || mood === "hard") setTimeout(offerCalm, 400);
    });
  }

  function openEvening() {
    let draft = { mood: null, win: "", hard: "", gratitude: "", helped: "" };
    let step = 1;
    const totalSteps = 5;

    function paint() {
      let body = "";
      if (step === 1) {
        body = `<h2>Як минув день?</h2>${moodButtons(DAY_MOODS, "eve")}`;
      } else if (step === 2) {
        body = `<label class="field"><span>Що сьогодні вдалося?</span><input id="eve-win" class="quick-input" value="${deps.esc(draft.win)}" placeholder="Навіть щось маленьке..." /></label>`;
      } else if (step === 3) {
        body = `<label class="field"><span>Що сьогодні було найважчим?</span><input id="eve-hard" class="quick-input" value="${deps.esc(draft.hard)}" placeholder="Можна одним реченням" /></label>`;
      } else if (step === 4) {
        const g = gratitudePrompt("evening");
        body = `
          <div class="ritual-badge">∴</div>
          <h2>${deps.esc(g.title)}</h2>
          <p class="muted">${deps.esc(g.hint)}</p>
          <label class="field" style="margin-top:10px">
            <span>${deps.esc(g.label)}</span>
            <textarea class="quick-input" id="eve-gratitude" rows="3" placeholder="${deps.esc(g.placeholder)}">${deps.esc(draft.gratitude)}</textarea>
          </label>`;
      } else {
        body = `<label class="field"><span>Що допомогло тобі хоча б трохи?</span><input id="eve-help" class="quick-input" value="${deps.esc(draft.helped)}" placeholder="Прогулянка, музика, друг..." /></label>`;
      }

      deps.openModal(`
        <div class="ritual-modal">${body}
          <div class="row spread" style="margin-top:18px">
            <button class="btn btn-ghost btn-sm" id="eve-skip">Пізніше</button>
            ${step > 1 ? `<button class="btn btn-ghost btn-sm" id="eve-back">←</button>` : "<span></span>"}
            ${step < totalSteps
              ? `<button class="btn btn-primary btn-sm" id="eve-next" ${step === 1 && !draft.mood ? "disabled" : ""}>Далі</button>`
              : `<button class="btn btn-primary btn-sm" id="eve-save">Зберегти</button>`}
          </div>
        </div>`);

      deps.$("#eve-skip").onclick = () => { dismissToday("evening"); deps.closeModal(); };
      const back = deps.$("#eve-back"); if (back) back.onclick = () => { step--; paint(); };

      if (step === 1) {
        deps.$$("[data-eve]", deps.$("#modal-root")).forEach((b) => b.onclick = () => {
          draft.mood = b.dataset.eve;
          step = 2;
          paint();
        });
      } else if (step === 2) {
        deps.$("#eve-next").onclick = () => { draft.win = deps.$("#eve-win").value.trim(); step = 3; paint(); };
      } else if (step === 3) {
        deps.$("#eve-next").onclick = () => { draft.hard = deps.$("#eve-hard").value.trim(); step = 4; paint(); };
      } else if (step === 4) {
        const inp = deps.$("#eve-gratitude");
        deps.$("#eve-next").onclick = () => {
          draft.gratitude = (inp && inp.value || "").trim();
          if (!draft.gratitude) {
            deps.toast(deps.isMale()
              ? "Це важливе заповнення — напиши, за що ти вдячний"
              : "Це важливе заповнення — напиши, за що ти вдячна", "warn");
            if (inp) inp.focus();
            return;
          }
          step = 5;
          paint();
        };
      } else {
        deps.$("#eve-save").onclick = () => {
          draft.helped = deps.$("#eve-help").value.trim();
          persistGratitudeNote(draft.gratitude, "evening");
          saveRitual("evening", draft);
          deps.closeModal();
          const thanks = deps.isMale()
            ? "Дякую ❤️\nТи вже зробив маленький крок для себе."
            : "Дякую ❤️\nТи вже зробила маленький крок для себе.";
          deps.openModal(`
            <div style="text-align:center;padding:8px 4px">
              <p style="font-size:22px;line-height:1.45;font-family:var(--font-hand);margin:0;white-space:pre-line">${deps.esc(thanks)}</p>
            </div>
            <div class="row" style="justify-content:center;margin-top:14px">
              <button class="btn btn-primary" data-close>Дякую 🌿</button>
            </div>`);
        };
      }
    }
    paint();
  }

  function maybePrompt() {
    if (!deps || !deps.S.isAuthed()) return;
    ensureState();
    setTimeout(() => {
      if (shouldShowMorning()) openMorning();
      else if (shouldShowEvening()) openEvening();
      else if (shouldShowMidday()) openMidday();
    }, 600);
  }

  function careDayKeys() {
    ensureState();
    const keys = new Set();
    Object.keys(S().rituals || {}).forEach((k) => {
      const day = S().rituals[k];
      if (day && (day.morning || day.midday || day.evening || day.now)) keys.add(k);
    });
    Object.keys(S().checkins || {}).forEach((k) => keys.add(k));
    const wb = S().wellbeing;
    if (wb && !Array.isArray(wb)) Object.keys(wb).forEach((k) => keys.add(k));
    return [...keys].sort();
  }

  function computeCareDays() {
    return careDayKeys().length;
  }

  function lastCareDay() {
    const keys = careDayKeys();
    return keys.length ? keys[keys.length - 1] : null;
  }

  function careMessage() {
    const total = computeCareDays();
    const last = lastCareDay();
    const tk = todayKey();
    if (last && last !== tk && deps.daysBetween(last, tk) > 1) {
      return deps.isMale() ? "Раді, що ти повернувся ❤️" : "Раді, що ти повернулася ❤️";
    }
    if (total === 0) return deps.isMale() ? "Почни з одного маленького кроку до себе" : "Почни з одного маленького кроку до себе";
    return `Ти приділяєш собі увагу вже ${total} ${deps.pluralUk(total, "день", "дні", "днів")}. 🌿`;
  }

  function moodValue(moodId, morning) {
    if (moodId == null) return null;
    // Сумісність із Telegram: great/ok/anxious/hard + числове value
    const tgMap = { great: 5, very_good: 5, good: 4, ok: 3, anxious: 2, hard: 1 };
    if (Object.prototype.hasOwnProperty.call(tgMap, moodId)) return tgMap[moodId];
    const list = morning ? MORNING_MOODS : DAY_MOODS;
    const m = list.find((x) => x.id === moodId);
    return m ? m.value : null;
  }

  function analyticsData() {
    ensureState();
    const rituals = S().rituals || {};
    const keys = Object.keys(rituals).sort();
    const moods = [];
    const worries = [];
    const helped = [];
    const notes = [];
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    const weekdayCount = [0, 0, 0, 0, 0, 0, 0];

    keys.forEach((k) => {
      const day = rituals[k];
      if (!day || typeof day !== "object") return;
      ["morning", "midday", "evening", "now"].forEach((type) => {
        const r = day[type];
        if (!r || (!r.mood && r.value == null)) return;
        const v = r.value != null ? Number(r.value) : moodValue(r.mood, type === "morning");
        if (v != null && !Number.isNaN(v)) moods.push({ key: k, type, value: v, note: r.note || "", source: r.source || "site" });
        if (r.note) notes.push({ key: k, type, note: r.note, mood: r.mood, value: v, source: r.source || "site" });
        if ((r.mood === "anxious" || r.mood === "hard") || (v != null && v <= 2)) {
          const wd = new Date(k + "T12:00:00").getDay();
          byWeekday[wd] += (r.mood === "hard" || v === 1) ? 2 : 1;
          weekdayCount[wd]++;
        }
      });
      if (day.morning && day.morning.worry) worries.push(day.morning.worry);
      if (day.evening && day.evening.helped) helped.push(day.evening.helped);
    });

    const avgMood = moods.length
      ? +(moods.reduce((s, m) => s + m.value, 0) / moods.length).toFixed(1)
      : null;
    const avgAnxiety = moods.length
      ? +(moods.reduce((s, m) => s + (11 - m.value * 2), 0) / moods.length).toFixed(1)
      : null;

    const topWorries = topMap(worries, 5);
    const topHelped = topMap(helped, 5);
    const worstDays = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((lbl, i) => ({
      label: lbl,
      score: weekdayCount[i] ? +(byWeekday[i] / weekdayCount[i]).toFixed(1) : 0
    })).sort((a, b) => b.score - a.score);

    return { keys, moods, notes: notes.slice(-12).reverse(), avgMood, avgAnxiety, topWorries, topHelped, worstDays };
  }

  function topMap(arr, n) {
    const m = {};
    arr.filter(Boolean).forEach((v) => { m[v] = (m[v] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  function homeRitualCardHTML() {
    const t = todayRitual();
    const h = localHour();
    const items = [];
    if (h < 12 && !t.morning) items.push({ id: "morning", label: "🌿 Ранковий ритуал", sub: "до 1 хв" });
    if (shouldShowMidday()) items.push({ id: "midday", label: "☀ Check-in", sub: "як ти зараз?" });
    if (h >= 18 && !t.evening) items.push({ id: "evening", label: "🌙 Вечірній ритуал", sub: "до 1 хв" });
    if (!items.length) return "";

    return `<div class="card ritual-home-card">
      <div class="card-title">Сьогоднішні ритуали</div>
      <div class="ritual-home-list">${items.map((i) =>
        `<button type="button" class="ritual-home-btn" data-ritual="${i.id}"><b>${i.label}</b><span>${i.sub}</span></button>`
      ).join("")}</div>
    </div>`;
  }

  function wireHomeRituals(root) {
    deps.$$("[data-ritual]", root || document).forEach((b) => b.onclick = () => {
      const t = b.dataset.ritual;
      if (t === "morning") openMorning();
      else if (t === "midday") openMidday();
      else if (t === "evening") openEvening();
    });
  }

  function profileRemindersHTML() {
    ensureState();
    const r = S().settings.reminders;
    const on = (v) => (v ? "✅" : "○");
    const times = ["07:00", "08:00", "09:00", "12:00", "14:00", "18:00", "20:00", "21:00", "22:00"];
    const timeOpts = (sel) => times.map((t) => `<option value="${t}" ${t === sel ? "selected" : ""}>${t}</option>`).join("");

    return `<div class="card" id="reminders-card">
      <div class="card-title">🔔 Нагадування</div>
      <p class="muted">Усі вимкнені за замовчуванням. Push працює, коли сайт відкритий у браузері.</p>
      <div class="reminder-rows">
        <label class="reminder-row"><input type="checkbox" id="rem-mrn" ${r.morning.enabled ? "checked" : ""} /><span>Ранкове</span>
          <select id="rem-mrn-time">${timeOpts(r.morning.time)}</select>
          <label class="rem-push"><input type="checkbox" id="rem-mrn-push" ${r.morning.push ? "checked" : ""} /> Push</label></label>
        <label class="reminder-row"><input type="checkbox" id="rem-mid" ${r.midday.enabled ? "checked" : ""} /><span>Денне</span>
          <select id="rem-mid-time">${timeOpts(r.midday.time)}</select>
          <label class="rem-push"><input type="checkbox" id="rem-mid-push" ${r.midday.push ? "checked" : ""} /> Push</label></label>
        <label class="reminder-row"><input type="checkbox" id="rem-eve" ${r.evening.enabled ? "checked" : ""} /><span>Вечірнє</span>
          <select id="rem-eve-time">${timeOpts(r.evening.time)}</select>
          <label class="rem-push"><input type="checkbox" id="rem-eve-push" ${r.evening.push ? "checked" : ""} /> Push</label></label>
      </div>
      <p class="faint" style="margin:10px 0 0;font-size:12px">Telegram-нагадування — у розділі нижче (опційно).</p>
      <button class="btn btn-primary btn-sm" id="rem-save" type="button" style="margin-top:12px">Зберегти</button>
    </div>`;
  }

  function wireProfileReminders() {
    const save = deps.$("#rem-save");
    if (!save) return;
    save.onclick = () => {
      ensureState();
      const r = S().settings.reminders;
      r.morning.enabled = !!deps.$("#rem-mrn").checked;
      r.morning.time = deps.$("#rem-mrn-time").value;
      r.morning.push = !!deps.$("#rem-mrn-push").checked;
      r.midday.enabled = !!deps.$("#rem-mid").checked;
      r.midday.time = deps.$("#rem-mid-time").value;
      r.midday.push = !!deps.$("#rem-mid-push").checked;
      r.evening.enabled = !!deps.$("#rem-eve").checked;
      r.evening.time = deps.$("#rem-eve-time").value;
      r.evening.push = !!deps.$("#rem-eve-push").checked;
      deps.S.save();
      deps.toast("Нагадування збережено 🌿", "good");
      startReminderScheduler();
    };
  }

  function nowHm() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function parseHm(hm) {
    const [h, m] = String(hm).split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function timeMatch(now, target) {
    return Math.abs(parseHm(now) - parseHm(target)) <= 1;
  }

  function checkBrowserReminders() {
    if (!deps.S.isAuthed()) return;
    ensureState();
    const r = S().settings.reminders;
    const tk = todayKey();
    const now = nowHm();
    const day = new Date().getDay();

    const tryFire = (type, cfg, title, body, openFn) => {
      if (!cfg.enabled || !cfg.days.includes(day)) return;
      const sentKey = `${tk}-${type}`;
      if (r.sent[sentKey]) return;
      if (!timeMatch(now, cfg.time)) return;
      r.sent[sentKey] = true;
      deps.S.save();
      if (cfg.push && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌿</text></svg>" });
      }
      deps.toast(body, "good", 5000);
      setTimeout(openFn, 800);
    };

    tryFire("morning", r.morning, "Спокій 🌿", "Доброго ранку. Як ти сьогодні?", openMorning);
    tryFire("midday", r.midday, "Спокій", "Як зараз твій стан?", openMidday);
    tryFire("evening", r.evening, "Спокій 🌙", "Як минув день?", openEvening);
  }

  function startReminderScheduler() {
    if (reminderTimer) clearInterval(reminderTimer);
    if (!deps.S.isAuthed()) return;
    checkBrowserReminders();
    reminderTimer = setInterval(checkBrowserReminders, 60000);
  }

  function requestPushPermission() {
    if (!("Notification" in window)) return;
    if (!deps || !deps.S || !deps.S.isAuthed() || !deps.S.state) return;
    ensureState();
    const r = S().settings.reminders;
    const wants = !!(r && (r.morning.push || r.midday.push || r.evening.push));
    if (wants && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function dynamicsSectionHTML() {
    if (!deps || !deps.S || !deps.S.state) {
      return `<div class="card analytics-card analytics-span-12"><p class="analytics-none">Дані ритуалів ще підвантажуються.</p></div>`;
    }
    const a = analyticsData();
    if (!a.moods.length) {
      return `<div class="card analytics-card analytics-span-12"><p class="analytics-none">Пройди ранковий або вечірній ритуал — тут з’явиться твоя динаміка. Без медичних висновків: лише твої спостереження.</p></div>`;
    }

    const worryList = a.topWorries.length
      ? a.topWorries.map(([w, c], i) => `<div class="analytics-row"><span>${i + 1}. ${deps.esc(w)}</span><span class="faint">${c} ${deps.pluralUk(c, "раз", "рази", "разів")}</span></div>`).join("")
      : `<p class="analytics-none">Ще немає повторень</p>`;

    const helpList = a.topHelped.length
      ? a.topHelped.map(([w, c]) => `<div class="analytics-row"><span>${deps.esc(w)}</span><span class="faint">${c} ${deps.pluralUk(c, "раз", "рази", "разів")}</span></div>`).join("")
      : `<p class="analytics-none">Заповнюй вечірній ритуал</p>`;

    const typeLabel = { morning: "ранок", midday: "день", evening: "вечір", now: "зараз" };
    const notesList = a.notes && a.notes.length
      ? a.notes.map((n) => {
          const src = n.source === "telegram" ? " · Telegram" : "";
          return `<div class="analytics-row analytics-note"><span><b>${deps.esc(n.key)}</b> · ${deps.esc(typeLabel[n.type] || n.type)}${src}<br>${deps.esc(n.note)}</span></div>`;
        }).join("")
      : `<p class="analytics-none">Описи з бота або ритуалів з’являться тут</p>`;

    const wd = a.worstDays.filter((x) => x.score > 0).slice(0, 3);
    const wdText = wd.length
      ? wd.map((x) => `${x.label} (${x.score})`).join(", ")
      : "поки замало даних";

    return `
      <div class="card analytics-card analytics-metric analytics-span-4">
        <div class="s-ico">∿</div><div class="s-val">${a.avgAnxiety != null ? a.avgAnxiety : "—"}</div>
        <div class="s-lbl">середній рівень напруги</div>
        <div class="s-hint">сайт і Telegram (1–10)</div>
      </div>
      <div class="card analytics-card analytics-metric analytics-span-4">
        <div class="s-ico">😊</div><div class="s-val">${a.avgMood != null ? a.avgMood : "—"}</div>
        <div class="s-lbl">настрій</div>
        <div class="s-hint">середнє за відповідями</div>
      </div>
      <div class="card analytics-card analytics-metric analytics-span-4">
        <div class="s-ico">🌿</div><div class="s-val">${computeCareDays()}</div>
        <div class="s-lbl">днів турботи</div>
        <div class="s-hint">${deps.esc(careMessage())}</div>
      </div>
      <div class="card analytics-card analytics-list analytics-span-6">
        <div class="card-title">Найчастіші причини тривоги</div>${worryList}
      </div>
      <div class="card analytics-card analytics-list analytics-span-6">
        <div class="card-title">Що допомагає найчастіше</div>${helpList}
      </div>
      <div class="card analytics-card analytics-list analytics-span-12">
        <div class="card-title">Описи настрою</div>${notesList}
      </div>
      <div class="card analytics-card analytics-span-12">
        <div class="card-title">Дні тижня, коли напруга найвища</div>
        <p class="muted" style="margin:0">${deps.esc(wdText)}</p>
        <p class="faint" style="margin:8px 0 0;font-size:12px">Це твої спостереження, не медичний висновок.</p>
      </div>`;
  }

  function init(api) {
    deps = api;
    startReminderScheduler();
    requestPushPermission();
  }

  return {
    init,
    maybePrompt,
    openMorning,
    openMidday,
    openEvening,
    careMessage,
    computeCareDays,
    homeRitualCardHTML,
    wireHomeRituals,
    profileRemindersHTML,
    wireProfileReminders,
    startReminderScheduler,
    requestPushPermission,
    dynamicsSectionHTML,
    analyticsData,
    shouldShowMorning,
    shouldShowEvening,
    shouldShowMidday
  };
})();
