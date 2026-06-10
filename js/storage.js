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
      wellbeing: {},                        // щоденна шкала самопочуття { YYYY-MM-DD: { level, date } }
      goodEvents: [],                       // хороші події дня { id, text, date, dayKey }
      gratitude: [],                        // вдячність дня { id, text, date, dayKey }
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

  /* ---- Хмарна синхронізація з бекендом SQLite (serve.js) ----
     Працює лише коли сайт відкрито через http(s). При відкритті файлу напряму
     (file://) або без сервера тихо вмикається офлайн-режим (тільки localStorage). */
  const API = "/api/state";
  let pushTimer = null;
  const Cloud = {
    enabled: (location.protocol === "http:" || location.protocol === "https:"),
    async pull(email) {
      if (!this.enabled || !email) return null;
      try {
        const r = await fetch(API + "/" + encodeURIComponent(email), { headers: { Accept: "application/json" } });
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.ok && j.data ? j.data : null;
      } catch (e) { return null; }
    },
    push(email, data) {
      if (!this.enabled || !email || !data) return;
      clearTimeout(pushTimer);
      const payload = JSON.stringify(data);
      pushTimer = setTimeout(() => {
        fetch(API + "/" + encodeURIComponent(email), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true
        }).catch(() => {});
      }, 600);
    },
    remove(email) {
      if (!this.enabled || !email) return;
      fetch(API + "/" + encodeURIComponent(email), { method: "DELETE" }).catch(() => {});
    }
  };

  // Підтягнути дані акаунта з бекенда. Перемагає новіша версія (за updatedAt).
  // preferRemote=true — акаунт щойно створено на цьому пристрої: якщо в базі вже
  // є дані цього email, вони важливіші за порожній локальний стан.
  async function syncFromCloud(preferRemote) {
    if (!Cloud.enabled || !currentEmail || !state) return;
    const remote = await Cloud.pull(currentEmail);
    if (!remote) { Cloud.push(currentEmail, state); return; }
    const localT = Date.parse(state.updatedAt || 0) || 0;
    const remoteT = Date.parse(remote.updatedAt || 0) || 0;
    if (preferRemote || remoteT > localT) {
      clearTimeout(pushTimer); // скасувати відкладене відправлення застарілого стану
      state = remote;
      const all = db(); all[currentEmail] = state; saveDb(all);
      try { window.dispatchEvent(new CustomEvent("spokiy:synced")); } catch (e) {}
    } else if (localT > remoteT) {
      Cloud.push(currentEmail, state);
    }
  }

  let currentEmail = localStorage.getItem(SESSION) || null;
  let state = null;

  function load() {
    if (!currentEmail) return null;
    const all = db();
    state = all[currentEmail] || emptyState();
    return state;
  }
  if (currentEmail) { load(); syncFromCloud(); }

  function persist() {
    if (!currentEmail || !state) return;
    state.updatedAt = new Date().toISOString();
    const all = db();
    all[currentEmail] = state;
    saveDb(all);
    Cloud.push(currentEmail, state);
  }

  return {
    get state() { return state; },
    isAuthed() { return !!currentEmail && !!state && !!state.profile; },

    login(profile) {
      currentEmail = profile.email.trim().toLowerCase();
      localStorage.setItem(SESSION, currentEmail);
      const all = db();
      const isNewOnDevice = !all[currentEmail];
      if (all[currentEmail]) {
        state = all[currentEmail];
        // оновити ім'я/провайдера/стать/аватар, якщо змінилися
        const patch = { name: profile.name, provider: profile.provider };
        if (profile.gender) patch.gender = profile.gender;
        if (profile.picture) patch.picture = profile.picture;
        state.profile = Object.assign({}, state.profile, patch);
      } else {
        state = emptyState({ ...profile, email: currentEmail, createdAt: new Date().toISOString() });
      }
      persist();
      // На новому пристрої дані з бази важливіші за щойно створений порожній стан.
      syncFromCloud(isNewOnDevice);
      return state;
    },

    setGender(gender) {
      if (state && state.profile) { state.profile.gender = gender; persist(); }
    },

    hasAccount(email) {
      if (!email) return false;
      return !!db()[email.trim().toLowerCase()];
    },
    accountGender(email) {
      const acc = db()[(email || "").trim().toLowerCase()];
      return acc && acc.profile ? acc.profile.gender : null;
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
    addTest(score, meta) {
      const rec = Object.assign({ date: new Date().toISOString(), score }, meta || {});
      state.tests.push(rec);
      persist();
      return rec;
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

    // ---- Щоденне самопочуття + хороші події ----
    setWellbeing(level, date) {
      const iso = date || new Date().toISOString();
      const dayKey = iso.slice(0, 10);
      if (!state.wellbeing || Array.isArray(state.wellbeing)) state.wellbeing = {};
      state.wellbeing[dayKey] = { level: +level, date: iso };
      this.markCheckin(iso);
      persist();
      return state.wellbeing[dayKey];
    },
    todayWellbeing() {
      if (!state.wellbeing || Array.isArray(state.wellbeing)) state.wellbeing = {};
      return state.wellbeing[new Date().toISOString().slice(0, 10)] || null;
    },
    addGoodEvent(text, date) {
      text = (text || "").trim(); if (!text) return null;
      const iso = date || new Date().toISOString();
      const dayKey = iso.slice(0, 10);
      if (!Array.isArray(state.goodEvents)) state.goodEvents = [];
      const ev = { id: "ge" + Date.now() + Math.random().toString(36).slice(2, 5), text, date: iso, dayKey };
      state.goodEvents.unshift(ev);
      persist();
      return ev;
    },
    removeGoodEvent(id) {
      state.goodEvents = (state.goodEvents || []).filter(x => x.id !== id); persist();
    },

    addGratitude(text, date) {
      text = (text || "").trim(); if (!text) return null;
      const iso = date || new Date().toISOString();
      const dayKey = iso.slice(0, 10);
      if (!Array.isArray(state.gratitude)) state.gratitude = [];
      const rec = { id: "gr" + Date.now() + Math.random().toString(36).slice(2, 5), text, date: iso, dayKey };
      state.gratitude.unshift(rec);
      persist();
      return rec;
    },
    removeGratitude(id) {
      state.gratitude = (state.gratitude || []).filter(x => x.id !== id); persist();
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
      const email = currentEmail;
      const all = db();
      delete all[currentEmail];
      saveDb(all);
      Cloud.remove(email);
      this.logout();
    }
  };
})();
