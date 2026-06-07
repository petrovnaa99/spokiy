/* Рівень зберігання даних: автозбереження в localStorage, чернетки, експорт/імпорт.
   Дані прив'язані до email користувача (мультипрофіль на одному пристрої). */
window.Store = (function () {
  const ROOT = "spokiy:v1";
  const SESSION = "spokiy:session";

  function emptyState(profile) {
    return {
      profile: profile || null,            // { name, email, provider, createdAt }
      entries: [],                          // записи щоденника та листи
      evidence: [],                         // банк доказів
      resources: {},                        // { name: { uses, sumEffect } }
      treasure: [],                         // скарбничка підтримки
      tests: [],                            // тести тривожності { date, score }
      joys: [],                             // що приносить радість { name, date }
      littleJoys: [],                       // мої маленькі радощі { id, category, text, date }
      friendNotes: [],                      // практика «порада подрузі» { id, situation, advice, date }
      achievements: {},                     // { id: ISOдата }
      checkins: {},                         // { 'YYYY-MM-DD': true } для серій
      draft: null,                          // незавершений запис
      settings: { reminderHour: 9, dismissedRedFlag: null, songReminder: "" },
      createdAt: new Date().toISOString()
    };
  }

  function db() {
    try { return JSON.parse(localStorage.getItem(ROOT) || "{}"); }
    catch (e) { return {}; }
  }
  function saveDb(obj) { localStorage.setItem(ROOT, JSON.stringify(obj)); }

  let currentEmail = localStorage.getItem(SESSION) || null;
  let state = null;

  function load() {
    if (!currentEmail) return null;
    const all = db();
    state = all[currentEmail] || emptyState();
    return state;
  }
  if (currentEmail) load();

  function persist() {
    if (!currentEmail || !state) return;
    const all = db();
    all[currentEmail] = state;
    saveDb(all);
  }

  return {
    get state() { return state; },
    isAuthed() { return !!currentEmail && !!state && !!state.profile; },

    login(profile) {
      currentEmail = profile.email.trim().toLowerCase();
      localStorage.setItem(SESSION, currentEmail);
      const all = db();
      if (all[currentEmail]) {
        state = all[currentEmail];
        // оновити ім'я/провайдера, якщо змінилися
        state.profile = Object.assign({}, state.profile, { name: profile.name, provider: profile.provider });
      } else {
        state = emptyState({ ...profile, email: currentEmail, createdAt: new Date().toISOString() });
      }
      persist();
      return state;
    },

    logout() {
      localStorage.removeItem(SESSION);
      currentEmail = null; state = null;
    },

    // Загальне збереження після будь-якої зміни
    save() { persist(); },

    set(path, value) {
      state[path] = value; persist();
    },

    // ---- Чернетка незавершеного запису ----
    saveDraft(draft) { state.draft = draft; persist(); },
    clearDraft() { state.draft = null; persist(); },
    getDraft() { return state.draft; },

    // ---- Записи ----
    addEntry(entry) {
      entry.id = entry.id || ("e" + Date.now() + Math.random().toString(36).slice(2, 6));
      entry.createdAt = entry.createdAt || new Date().toISOString();
      state.entries.unshift(entry);
      this.markCheckin(entry.createdAt);
      persist();
      return entry;
    },
    updateEntry(id, patch) {
      const e = state.entries.find(x => x.id === id);
      if (e) { Object.assign(e, patch); persist(); }
      return e;
    },
    removeEntry(id) {
      state.entries = state.entries.filter(x => x.id !== id); persist();
    },

    // ---- Банк доказів ----
    addEvidence(ev) {
      ev.id = "ev" + Date.now() + Math.random().toString(36).slice(2, 5);
      ev.date = ev.date || new Date().toISOString();
      state.evidence.unshift(ev); persist(); return ev;
    },
    removeEvidence(id) { state.evidence = state.evidence.filter(x => x.id !== id); persist(); },

    // ---- Ресурси (рейтинг ефективності) ----
    addResourceUse(name, effectiveness) {
      name = name.trim(); if (!name) return;
      const r = state.resources[name] || { uses: 0, sumEffect: 0 };
      r.uses += 1;
      if (typeof effectiveness === "number") r.sumEffect += effectiveness;
      state.resources[name] = r; persist();
    },
    resourceRanking() {
      return Object.entries(state.resources)
        .map(([name, r]) => ({ name, uses: r.uses, avg: r.uses ? +(r.sumEffect / r.uses).toFixed(1) : 0 }))
        .sort((a, b) => (b.avg * 2 + b.uses) - (a.avg * 2 + a.uses));
    },

    // ---- Скарбничка ----
    addTreasure(t) {
      t.id = "t" + Date.now() + Math.random().toString(36).slice(2, 5);
      t.date = new Date().toISOString();
      state.treasure.unshift(t); persist(); return t;
    },
    removeTreasure(id) { state.treasure = state.treasure.filter(x => x.id !== id); persist(); },

    // ---- Тести ----
    addTest(score) {
      state.tests.push({ date: new Date().toISOString(), score });
      persist();
    },

    // ---- Радість (джерела радості) ----
    addJoy(name) {
      name = (name || "").trim(); if (!name) return;
      if (!Array.isArray(state.joys)) state.joys = [];
      state.joys.unshift({ name, date: new Date().toISOString() });
      if (state.joys.length > 200) state.joys = state.joys.slice(0, 200);
      persist();
    },
    joyRanking() {
      const m = {};
      (state.joys || []).forEach(j => { m[j.name] = (m[j.name] || 0) + 1; });
      return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    },

    // ---- Мої маленькі радощі (книги, фільми, музика, прогулянки, хобі, своє) ----
    addLittleJoy(category, text) {
      text = (text || "").trim(); if (!text) return;
      if (!Array.isArray(state.littleJoys)) state.littleJoys = [];
      state.littleJoys.unshift({ id: "j" + Date.now() + Math.random().toString(36).slice(2, 5), category: category || "other", text, date: new Date().toISOString() });
      persist();
    },
    removeLittleJoy(id) {
      state.littleJoys = (state.littleJoys || []).filter(x => x.id !== id); persist();
    },
    randomLittleJoys(n = 2) {
      const arr = (state.littleJoys || []).slice();
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr.slice(0, n);
    },

    // ---- Практика «Якби це сталося у моєї кращої подруги» ----
    addFriendNote(situation, advice) {
      situation = (situation || "").trim(); advice = (advice || "").trim();
      if (!situation && !advice) return;
      if (!Array.isArray(state.friendNotes)) state.friendNotes = [];
      state.friendNotes.unshift({ id: "fn" + Date.now() + Math.random().toString(36).slice(2, 5), situation, advice, date: new Date().toISOString() });
      persist();
    },
    removeFriendNote(id) {
      state.friendNotes = (state.friendNotes || []).filter(x => x.id !== id); persist();
    },

    // ---- Серії (check-ins) ----
    markCheckin(iso) {
      const d = new Date(iso || Date.now());
      const key = d.toISOString().slice(0, 10);
      state.checkins[key] = true; persist();
    },

    // ---- Досягнення ----
    unlock(id) {
      if (!state.achievements[id]) { state.achievements[id] = new Date().toISOString(); persist(); return true; }
      return false;
    },

    // ---- Експорт / Імпорт ----
    exportJSON() {
      return JSON.stringify(state, null, 2);
    },
    importJSON(json) {
      const data = JSON.parse(json);
      if (!data || !data.profile) throw new Error("Невірний формат файлу");
      // зберігаємо під поточним email (перенесення на цей пристрій)
      state = Object.assign(emptyState(state.profile), data);
      state.profile.email = currentEmail;
      persist();
    },

    deleteAllData() {
      if (!currentEmail) return;
      const all = db();
      delete all[currentEmail];
      saveDb(all);
      this.logout();
    }
  };
})();
