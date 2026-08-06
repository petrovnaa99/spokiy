/* Рівень зберігання даних: cloud-first через /api/state/:email (Supabase на Vercel,
   SQLite локально через serve.js). Авторизація: /api/auth/* + Bearer-токен сесії.
   localStorage — кеш стану та сесії, не основне сховище. */
window.Store = (function () {
  const ROOT = "spokiy:v1";
  const SESSION = "spokiy:session";
  const TOKEN = "spokiy:token";
  const LOCAL_AUTH = "spokiy:auth";

  /**
   * Поля «Символ внутрішнього відновлення» у profile (JSON у users.data).
   * Додаються лише як нові ключі — наявні дані користувача не видаляються.
   * @typedef {{
   *   recoverySymbolId: string|null,
   *   recoverySymbolName: string|null,
   *   recoveryStage: number,
   *   recoveryProgress: number,
   *   recoveryLastActivityAt: string|null,
   *   recoverySymbolSelectedAt: string|null
   * }} RecoveryProfileFields
   */
  const RECOVERY_PROFILE_DEFAULTS = {
    recoverySymbolId: null,
    recoverySymbolName: null,
    recoveryStage: 0,
    recoveryProgress: 0,
    recoveryLastActivityAt: null,
    recoverySymbolSelectedAt: null
  };

  /** Додає відсутні recovery-поля без перезапису вже збережених значень. */
  function ensureRecoveryFields(profile) {
    if (!profile || typeof profile !== "object") return profile;
    Object.keys(RECOVERY_PROFILE_DEFAULTS).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(profile, key)) {
        profile[key] = RECOVERY_PROFILE_DEFAULTS[key];
      }
    });
    if (typeof profile.recoveryStage !== "number" || Number.isNaN(profile.recoveryStage)) {
      profile.recoveryStage = RECOVERY_PROFILE_DEFAULTS.recoveryStage;
    }
    if (typeof profile.recoveryProgress !== "number" || Number.isNaN(profile.recoveryProgress)) {
      profile.recoveryProgress = RECOVERY_PROFILE_DEFAULTS.recoveryProgress;
    }
    // Синхронізувати етап із прогресом за актуальним каталогом (6 етапів).
    if (profile.recoverySymbolId) {
      const catalog = (typeof window !== "undefined" && window.CONTENT && window.CONTENT.getRecoverySymbolById)
        ? window.CONTENT.getRecoverySymbolById(profile.recoverySymbolId)
        : null;
      if (catalog && window.CONTENT.getRecoveryStageByProgress) {
        const stage = window.CONTENT.getRecoveryStageByProgress(catalog, profile.recoveryProgress || 0);
        if (stage && stage.id) profile.recoveryStage = stage.id;
      }
      // Уніфікована назва без конкретних видів.
      if (profile.recoverySymbolName !== "Деревце") profile.recoverySymbolName = "Деревце";
    }
    return profile;
  }

  /** Денний реєстр нарахувань: state.recoveryAwards[YYYY-MM-DD][action] = ISO timestamp. */
  function ensureRecoveryAwards(st) {
    if (!st) return st;
    if (!st.recoveryAwards || typeof st.recoveryAwards !== "object" || Array.isArray(st.recoveryAwards)) {
      st.recoveryAwards = {};
    }
    return st;
  }

  function dayKeyLocal(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function recoveryDayKey(iso) {
    if (!iso) return dayKeyLocal(new Date());
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return dayKeyLocal(d);
  }

  /** Telegram раніше писав mood×2; на сайті level = тривога 1–10. */
  function normalizeWellbeingMap(wb) {
    const src = wb && typeof wb === "object" && !Array.isArray(wb) ? wb : {};
    const out = {};
    Object.keys(src).forEach((k) => {
      const e = src[k];
      if (!e || typeof e !== "object") return;
      if (typeof e.level !== "number") {
        out[k] = e;
        return;
      }
      if (e.source === "telegram" && e.scale !== "anxiety") {
        out[k] = Object.assign({}, e, {
          level: Math.max(1, Math.min(10, Math.round(11 - e.level))),
          scale: "anxiety"
        });
      } else {
        out[k] = e;
      }
    });
    return out;
  }

  function anxietyOfWellbeing(entry) {
    if (!entry || typeof entry.level !== "number") return null;
    if (entry.source === "telegram" && entry.scale !== "anxiety") {
      return Math.max(1, Math.min(10, Math.round(11 - entry.level)));
    }
    return entry.level;
  }

  function emptyState(profile) {
    return {
      profile: profile ? ensureRecoveryFields(Object.assign({}, profile)) : null,
      entries: [],
      evidence: [],
      resources: {},
      treasure: [],
      tests: [],
      joys: [],
      littleJoys: [],
      friendNotes: [],
      wellbeing: {},
      goodEvents: [],
      gratitude: [],
      achievements: {},
      checkins: {},
      rituals: {},
      /** Денний реєстр нарахувань прогресу символу (анти-подвійний запис). */
      recoveryAwards: {},
      draft: null,
      settings: {
        reminderHour: 9,
        dismissedRedFlag: null,
        songReminder: "",
        /** Чи вже бачив(ла) вікно огляду функцій на вході. */
        welcomeSeen: false,
        /** Тон комунікації: "gentle" | "solid" | null (null = визначити з символу / статі). */
        communicationTone: null,
        ritualDismiss: {},
        reminders: {
          morning: { enabled: false, time: "08:00", days: [0, 1, 2, 3, 4, 5, 6], push: false },
          midday: { enabled: false, time: "14:00", days: [0, 1, 2, 3, 4, 5, 6], hoursAfterMorning: 5, push: false },
          evening: { enabled: false, time: "21:00", days: [0, 1, 2, 3, 4, 5, 6], push: false },
          timezone: "Europe/Kyiv",
          sent: {}
        }
      },
      createdAt: new Date().toISOString()
    };
  }

  function db() {
    try { return JSON.parse(localStorage.getItem(ROOT) || "{}"); }
    catch (e) { return {}; }
  }
  function saveDb(obj) { localStorage.setItem(ROOT, JSON.stringify(obj)); }

  function authHeaders() {
    const t = localStorage.getItem(TOKEN);
    return t ? { Authorization: "Bearer " + t } : {};
  }

  const API = "/api/state";
  let pushTimer = null;
  let pendingSync = false;
  let lastSuccessfulSyncAt = null;
  let pushInFlight = null;

  const Cloud = {
    enabled: (location.protocol === "http:" || location.protocol === "https:"),
    async pull(email) {
      if (!this.enabled || !email) return null;
      try {
        const r = await fetch(API + "/" + encodeURIComponent(email), {
          headers: { Accept: "application/json", ...authHeaders() }
        });
        if (r.status === 401 || r.status === 403) return { forbidden: true };
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.ok && j.data ? j.data : null;
      } catch (e) { return null; }
    },
    push(email, data) {
      if (!this.enabled || !email || !data) return;
      pendingSync = true;
      clearTimeout(pushTimer);
      const payload = JSON.stringify(data);
      pushTimer = setTimeout(() => {
        this.pushNow(email, payload).catch(() => {});
      }, 600);
    },
    async pushNow(email, payloadOrData) {
      if (!this.enabled || !email) return { ok: false, error: "disabled" };
      const payload = typeof payloadOrData === "string"
        ? payloadOrData
        : JSON.stringify(payloadOrData);
      try {
        const r = await fetch(API + "/" + encodeURIComponent(email), {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: payload,
          keepalive: true
        });
        if (!r.ok) {
          pendingSync = true;
          return { ok: false, status: r.status };
        }
        pendingSync = false;
        lastSuccessfulSyncAt = new Date().toISOString();
        try { window.dispatchEvent(new CustomEvent("spokiy:cloud-saved")); } catch (e) {}
        return { ok: true };
      } catch (e) {
        pendingSync = true;
        return { ok: false, error: "network" };
      }
    },
    remove(email) {
      if (!this.enabled || !email) return;
      fetch(API + "/" + encodeURIComponent(email), {
        method: "DELETE",
        headers: { ...authHeaders() }
      }).catch(() => {});
    }
  };

  const Auth = {
    enabled: Cloud.enabled,
    async call(path, opts = {}) {
      const r = await fetch("/api/auth/" + path, {
        method: opts.method || "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeaders(),
          ...(opts.headers || {})
        },
        body: opts.body != null ? JSON.stringify(opts.body) : undefined
      });
      let json = {};
      try { json = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, ...json };
    },
    async register({ email, password, name, gender }) {
      return this.call("register", { method: "POST", body: { email, password, name, gender } });
    },
    async login({ email, password, code }) {
      return this.call("login", { method: "POST", body: { email, password, code } });
    },
    async requestCode(email, purpose) {
      return this.call("request-code", { method: "POST", body: { email, purpose } });
    },
    async resetPassword({ email, code, password }) {
      return this.call("reset-password", { method: "POST", body: { email, code, password } });
    },
    async exists(email) {
      return this.call("exists?email=" + encodeURIComponent(email));
    },

    async telegramStatus() {
      const r = await fetch("/api/telegram/link", {
        headers: { Accept: "application/json", ...authHeaders() }
      });
      let json = {};
      try { json = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, ...json };
    },

    async telegramCreateLink() {
      const r = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", ...authHeaders() }
      });
      let json = {};
      try { json = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, ...json };
    },

    async telegramUnlink() {
      const r = await fetch("/api/telegram/link", {
        method: "DELETE",
        headers: { Accept: "application/json", ...authHeaders() }
      });
      let json = {};
      try { json = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, ...json };
    }
  };

  /* Офлайн-режим file:// — спрощена локальна перевірка пароля */
  const LocalAuth = {
    all() {
      try { return JSON.parse(localStorage.getItem(LOCAL_AUTH) || "{}"); }
      catch (e) { return {}; }
    },
    save(obj) { localStorage.setItem(LOCAL_AUTH, JSON.stringify(obj)); },
    hash(pw) {
      let h = 0;
      const s = String(pw);
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
      return "l" + Math.abs(h).toString(16);
    },
    register({ email, password, name, gender }) {
      const e = email.trim().toLowerCase();
      const all = this.all();
      if (all[e]) return { ok: false, error: "email_taken" };
      all[e] = { hash: this.hash(password), name, gender };
      this.save(all);
      return { ok: true, token: "local-" + e, profile: { email: e, name, gender, provider: "email" } };
    },
    login({ email, password }) {
      const e = email.trim().toLowerCase();
      const rec = this.all()[e];
      if (!rec || rec.hash !== this.hash(password)) return { ok: false, error: "invalid_credentials" };
      return { ok: true, token: "local-" + e, profile: { email: e, name: rec.name, gender: rec.gender, provider: "email" } };
    },
    exists(email) {
      return !!this.all()[email.trim().toLowerCase()];
    }
  };

  async function syncFromCloud(preferRemote) {
    if (!Cloud.enabled || !currentEmail || !state) return { ok: false };
    const remote = await Cloud.pull(currentEmail);
    if (remote && remote.forbidden) {
      logout();
      return { ok: false, error: "forbidden" };
    }
    if (!remote) { Cloud.push(currentEmail, state); return { ok: true }; }
    if (remote.profile && remote.profile.email && remote.profile.email !== currentEmail) {
      return { ok: false, error: "email_mismatch" };
    }

    function mergeCloud(local, rem) {
      const out = Object.assign({}, preferRemote ? rem : local);
      out.profile = Object.assign({}, rem.profile || {}, local.profile || {}, { email: currentEmail });

      const rituals = {};
      const days = new Set([...Object.keys(rem.rituals || {}), ...Object.keys(local.rituals || {})]);
      days.forEach((day) => {
        rituals[day] = {};
        const a = (local.rituals && local.rituals[day]) || {};
        const b = (rem.rituals && rem.rituals[day]) || {};
        new Set([...Object.keys(a), ...Object.keys(b)]).forEach((t) => {
          const L = a[t], R = b[t];
          if (!L) rituals[day][t] = R;
          else if (!R) rituals[day][t] = L;
          else rituals[day][t] = (Date.parse(R.at || 0) || 0) >= (Date.parse(L.at || 0) || 0) ? R : L;
        });
      });
      out.rituals = rituals;

      const byId = {};
      [].concat(rem.entries || [], local.entries || []).forEach((e) => {
        if (!e || !e.id) return;
        const prev = byId[e.id];
        if (!prev) byId[e.id] = e;
        else {
          const pt = Date.parse(prev.updatedAt || prev.createdAt || 0) || 0;
          const et = Date.parse(e.updatedAt || e.createdAt || 0) || 0;
          if (et >= pt) byId[e.id] = e;
        }
      });
      out.entries = Object.values(byId).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

      out.wellbeing = (() => {
        const wbL = normalizeWellbeingMap(local.wellbeing);
        const wbR = normalizeWellbeingMap(rem.wellbeing);
        const wellbeing = Object.assign({}, wbR, wbL);
        new Set([...Object.keys(wbL), ...Object.keys(wbR)]).forEach((k) => {
          const L = wbL[k];
          const R = wbR[k];
          if (!L) wellbeing[k] = R;
          else if (!R) wellbeing[k] = L;
          else {
            const la = anxietyOfWellbeing(L);
            const ra = anxietyOfWellbeing(R);
            wellbeing[k] = (ra == null || (la != null && la >= ra)) ? L : R;
          }
        });
        return wellbeing;
      })();
      out.checkins = Object.assign({}, rem.checkins || {}, local.checkins || {});

      function mergeListById(a, b) {
        const map = {};
        [].concat(a || [], b || []).forEach((item) => {
          if (!item || !item.id) return;
          const prev = map[item.id];
          if (!prev) map[item.id] = item;
          else {
            const pt = Date.parse(prev.date || prev.updatedAt || 0) || 0;
            const et = Date.parse(item.date || item.updatedAt || 0) || 0;
            if (et >= pt) map[item.id] = item;
          }
        });
        return Object.values(map).sort(
          (x, y) => Date.parse(y.date || 0) - Date.parse(x.date || 0)
        );
      }
      out.gratitude = mergeListById(local.gratitude, rem.gratitude);
      out.goodEvents = mergeListById(local.goodEvents, rem.goodEvents);

      // Чернетка: не губити локальний текст, якщо на сервері порожньо або старіше
      const localDraft = local.draft;
      const remoteDraft = rem.draft;
      const localDraftAt = Date.parse((localDraft && localDraft.draftSavedAt) || local.updatedAt || 0) || 0;
      const remoteDraftAt = Date.parse((remoteDraft && remoteDraft.draftSavedAt) || rem.updatedAt || 0) || 0;
      const localHas = localDraft && (String(localDraft.fear || "").trim() || String(localDraft.cause || "").trim());
      const remoteHas = remoteDraft && (String(remoteDraft.fear || "").trim() || String(remoteDraft.cause || "").trim());
      if (localHas && remoteHas) {
        out.draft = remoteDraftAt > localDraftAt ? remoteDraft : localDraft;
        if (
          String(localDraft.fear || "") !== String(remoteDraft.fear || "") &&
          Math.abs(remoteDraftAt - localDraftAt) > 2000
        ) {
          out.__draftConflict = { local: localDraft, remote: remoteDraft };
        }
      } else if (localHas) {
        out.draft = localDraft;
      } else if (remoteHas) {
        out.draft = remoteDraft;
      } else {
        out.draft = localDraft || remoteDraft || null;
      }

      const localT2 = Date.parse(local.updatedAt || 0) || 0;
      const remoteT2 = Date.parse(rem.updatedAt || 0) || 0;
      out.updatedAt = new Date(Math.max(localT2, remoteT2, Date.now())).toISOString();
      return out;
    }

    function entriesConflict(local, rem) {
      const mapL = {};
      (local.entries || []).forEach((e) => { if (e && e.id) mapL[e.id] = e; });
      for (const e of (rem.entries || [])) {
        if (!e || !e.id || !mapL[e.id]) continue;
        const L = mapL[e.id];
        const lt = Date.parse(L.updatedAt || L.createdAt || 0) || 0;
        const rt = Date.parse(e.updatedAt || e.createdAt || 0) || 0;
        if (
          String(L.fear || "") !== String(e.fear || "") &&
          lt && rt &&
          Math.abs(lt - rt) > 1500 &&
          pendingSync
        ) return { id: e.id, local: L, remote: e };
      }
      return null;
    }

    clearTimeout(pushTimer);
    const localSnapshot = JSON.parse(JSON.stringify(state));
    const localT = Date.parse(state.updatedAt || 0) || 0;
    const remoteT = Date.parse(remote.updatedAt || 0) || 0;
    const conflictEntry = (!preferRemote && pendingSync && remoteT > localT)
      ? entriesConflict(state, remote)
      : null;

    if (conflictEntry) {
      try {
        window.dispatchEvent(new CustomEvent("spokiy:sync-conflict", {
          detail: { type: "entry", local: localSnapshot, remote, entry: conflictEntry }
        }));
      } catch (e) {}
      return { ok: false, conflict: true, local: localSnapshot, remote };
    }

    state = mergeCloud(state, remote);
    const draftConflict = state.__draftConflict;
    delete state.__draftConflict;
    if (!state.profile) state.profile = { email: currentEmail };
    state.profile.email = currentEmail;
    ensureRecoveryFields(state.profile);
    ensureRecoveryAwards(state);
    const all = db(); all[currentEmail] = state; saveDb(all);
    try { window.dispatchEvent(new CustomEvent("spokiy:synced")); } catch (e) {}
    if (draftConflict) {
      try {
        window.dispatchEvent(new CustomEvent("spokiy:sync-conflict", {
          detail: { type: "draft", local: localSnapshot, remote, draft: draftConflict }
        }));
      } catch (e) {}
      return { ok: false, conflict: true, local: localSnapshot, remote };
    }
    // Якщо локально були новіші зміни — відправити злитий стан
    if (!preferRemote && localT >= remoteT) Cloud.push(currentEmail, state);
    return { ok: true };
  }

  async function refreshFromCloud(preferRemote) {
    await syncFromCloud(!!preferRemote);
    return state;
  }

  let currentEmail = localStorage.getItem(SESSION) || null;
  let state = null;

  function load() {
    if (!currentEmail) return null;
    const all = db();
    state = all[currentEmail] || emptyState({ email: currentEmail });
    ensureRecoveryAwards(state);
    if (state.wellbeing) state.wellbeing = normalizeWellbeingMap(state.wellbeing);
    if (state.profile) {
      state.profile.email = currentEmail;
      ensureRecoveryFields(state.profile);
    }
    return state;
  }
  if (currentEmail && localStorage.getItem(TOKEN)) { load(); syncFromCloud(); }

  function persist(opts) {
    if (!currentEmail || !state) return;
    const options = opts || {};
    state.updatedAt = new Date().toISOString();
    if (state.profile) state.profile.email = currentEmail;
    const all = db();
    all[currentEmail] = state;
    saveDb(all);
    if (options.localOnly) {
      pendingSync = true;
      return;
    }
    Cloud.push(currentEmail, state);
  }

  function persistLocal() {
    persist({ localOnly: true });
  }

  function establishSession(profile, token, isRegistration) {
    const email = profile.email.trim().toLowerCase();
    localStorage.setItem(TOKEN, token);
    currentEmail = email;
    localStorage.setItem(SESSION, email);
    const all = db();
    const isNewOnDevice = !all[email];

    if (isRegistration || !all[email]) {
      state = emptyState({
        name: profile.name,
        email,
        gender: profile.gender,
        provider: profile.provider || "email",
        picture: profile.picture,
        createdAt: new Date().toISOString()
      });
    } else {
      state = all[email];
      state.profile = Object.assign({}, state.profile, {
        email,
        provider: profile.provider || state.profile.provider || "email"
      });
      if (profile.picture) state.profile.picture = profile.picture;
      if (profile.name) state.profile.name = profile.name;
      if (profile.gender) state.profile.gender = profile.gender;
    }
    ensureRecoveryFields(state.profile);
    persist();
    return syncFromCloud(isNewOnDevice || isRegistration);
  }

  return {
    get state() { return state; },
    isAuthed() { return !!currentEmail && !!state && !!state.profile && !!localStorage.getItem(TOKEN); },
    getToken() { return localStorage.getItem(TOKEN); },

    async register({ email, password, name, gender }) {
      let res;
      if (Auth.enabled) res = await Auth.register({ email, password, name, gender });
      else res = LocalAuth.register({ email, password, name, gender });
      if (!res.ok) return res;
      await establishSession(res.profile, res.token, true);
      return res;
    },

    async loginWithPassword(email, password) {
      let res;
      if (Auth.enabled) res = await Auth.login({ email, password });
      else res = LocalAuth.login({ email, password });
      if (!res.ok) return res;
      await establishSession(res.profile, res.token, false);
      return res;
    },

    async loginWithCode(email, code) {
      if (!Auth.enabled) return { ok: false, error: "code_unavailable" };
      const res = await Auth.login({ email, code });
      if (!res.ok) return res;
      await establishSession(res.profile, res.token, false);
      return res;
    },

    async requestCode(email, purpose) {
      if (!Auth.enabled) return { ok: false, error: "offline" };
      return Auth.requestCode(email, purpose);
    },

    async resetPassword({ email, code, password }) {
      if (!Auth.enabled) return { ok: false, error: "offline" };
      return Auth.resetPassword({ email, code, password });
    },

    async oauthLogin(profile) {
      if (Auth.enabled) {
        const res = await Auth.call("oauth", { method: "POST", body: profile });
        if (!res.ok) return res;
        await establishSession(res.profile, res.token, !!res.isNew);
        return res;
      }
      return { ok: false, error: "offline" };
    },

    async hasAccount(email) {
      if (!email) return false;
      const e = email.trim().toLowerCase();
      if (Auth.enabled) {
        const r = await Auth.exists(e);
        if (r.ok) return !!r.exists;
      }
      return LocalAuth.exists(e) || !!db()[e];
    },

    /** @deprecated використовуй register / loginWithPassword */
    login(profile) {
      return establishSession(profile, localStorage.getItem(TOKEN) || "legacy-" + profile.email, false);
    },

    setGender(gender) {
      if (state && state.profile) { state.profile.gender = gender; persist(); }
    },

    /** Поточні поля символу відновлення з профілю (з дефолтами). */
    getRecovery() {
      if (!state || !state.profile) return Object.assign({}, RECOVERY_PROFILE_DEFAULTS);
      ensureRecoveryFields(state.profile);
      return {
        recoverySymbolId: state.profile.recoverySymbolId,
        recoverySymbolName: state.profile.recoverySymbolName,
        recoveryStage: state.profile.recoveryStage,
        recoveryProgress: state.profile.recoveryProgress,
        recoveryLastActivityAt: state.profile.recoveryLastActivityAt,
        recoverySymbolSelectedAt: state.profile.recoverySymbolSelectedAt
      };
    },

    /**
     * Обрати символ відновлення. Не змінює auth / email / gender.
     * @param {string} symbolId
     * @returns {boolean} false якщо id невідомий
     */
    selectRecoverySymbol(symbolId) {
      if (!state || !state.profile) return false;
      const catalog = (typeof window !== "undefined" && window.CONTENT && window.CONTENT.getRecoverySymbolById)
        ? window.CONTENT.getRecoverySymbolById(symbolId)
        : null;
      if (!catalog) return false;
      ensureRecoveryFields(state.profile);
      const now = new Date().toISOString();
      state.profile.recoverySymbolId = catalog.id;
      state.profile.recoverySymbolName = "Деревце";
      state.profile.recoveryStage = 1;
      state.profile.recoveryProgress = 0;
      state.profile.recoverySymbolSelectedAt = now;
      state.profile.recoveryLastActivityAt = now;
      persist();
      return true;
    },

    /**
     * Нарахувати прогрес за завершену дію турботи.
     * Одна дія = один раз на календарний день; пропуски не віднімають прогрес.
     * @param {"ritual"|"diary"|"breath"|"gratitude"|"wellbeing"|"good"|"past"|"exercise"} action
     * @returns {{
     *   awarded: boolean,
     *   reason?: string,
     *   action?: string,
     *   progress: number,
     *   stage: number,
     *   stageChanged: boolean,
     *   message: string|null
     * }}
     */
    awardRecoveryProgress(action) {
      const empty = () => ({
        awarded: false,
        progress: state && state.profile ? state.profile.recoveryProgress || 0 : 0,
        stage: state && state.profile ? state.profile.recoveryStage || 0 : 0,
        stageChanged: false,
        message: null
      });
      if (!state || !state.profile) return Object.assign(empty(), { reason: "no_session" });
      ensureRecoveryFields(state.profile);
      ensureRecoveryAwards(state);
      if (!state.profile.recoverySymbolId) return Object.assign(empty(), { reason: "no_symbol" });

      const C = (typeof window !== "undefined") ? window.CONTENT : null;
      const allowed = (C && C.RECOVERY_AWARD_ACTIONS) || ["wellbeing", "diary", "breath", "good", "past", "exercise"];
      if (!allowed.includes(action)) return Object.assign(empty(), { reason: "bad_action" });

      const day = recoveryDayKey();
      if (!state.recoveryAwards[day] || typeof state.recoveryAwards[day] !== "object") {
        state.recoveryAwards[day] = {};
      }
      const ledger = state.recoveryAwards[day];
      // Захист від подвійного нарахування (у т.ч. після оновлення сторінки).
      if (ledger[action]) {
        return Object.assign(empty(), { awarded: false, reason: "already_awarded", action });
      }

      const points = (C && C.RECOVERY_POINTS_PER_ACTION) || 3;
      const prevStage = Math.max(1, state.profile.recoveryStage || 1);
      const prevProgress = Math.max(0, state.profile.recoveryProgress || 0);
      const nextProgress = Math.min(100, prevProgress + points);

      // Спочатку фіксуємо дію в реєстрі — навіть якщо далі щось піде не так, повторно не нарахуємо.
      ledger[action] = new Date().toISOString();

      const catalog = (C && C.getRecoverySymbolById)
        ? C.getRecoverySymbolById(state.profile.recoverySymbolId)
        : null;
      let nextStage = prevStage;
      if (catalog && C.getRecoveryStageByProgress) {
        const stageInfo = C.getRecoveryStageByProgress(catalog, nextProgress);
        if (stageInfo && stageInfo.id) nextStage = stageInfo.id;
      }

      state.profile.recoveryProgress = nextProgress;
      state.profile.recoveryStage = nextStage;
      state.profile.recoveryLastActivityAt = new Date().toISOString();
      persist();

      const stageChanged = nextStage > prevStage;
      const message = stageChanged && C && C.getRecoveryStageUpMessage
        ? C.getRecoveryStageUpMessage(nextStage, day)
        : (stageChanged ? "У твоєму внутрішньому просторі з’явилася нова опора." : null);

      const result = {
        awarded: true,
        action,
        progress: nextProgress,
        stage: nextStage,
        stageChanged,
        message
      };
      try {
        if (typeof window !== "undefined" && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent("spokiy:recovery-award", { detail: result }));
        }
      } catch (e) { /* ignore */ }
      return result;
    },

    /** Чи вже нараховано прогрес за дію сьогодні (для UI/тестів). */
    hasRecoveryAwardToday(action) {
      if (!state) return false;
      ensureRecoveryAwards(state);
      const day = recoveryDayKey();
      const ledger = state.recoveryAwards[day];
      return !!(ledger && ledger[action]);
    },

    getRecoveryAwards() {
      if (!state) return {};
      ensureRecoveryAwards(state);
      return state.recoveryAwards;
    },

    /**
     * Оновити прогрес / етап / активність символу (additive patch).
     * @param {{ recoveryStage?: number, recoveryProgress?: number, touchActivity?: boolean }} patch
     */
    updateRecovery(patch) {
      if (!state || !state.profile) return false;
      ensureRecoveryFields(state.profile);
      if (!state.profile.recoverySymbolId) return false;
      const p = patch || {};
      if (typeof p.recoveryStage === "number" && !Number.isNaN(p.recoveryStage)) {
        state.profile.recoveryStage = Math.max(0, Math.floor(p.recoveryStage));
      }
      if (typeof p.recoveryProgress === "number" && !Number.isNaN(p.recoveryProgress)) {
        state.profile.recoveryProgress = Math.max(0, Math.min(100, p.recoveryProgress));
      }
      if (p.touchActivity !== false) {
        state.profile.recoveryLastActivityAt = new Date().toISOString();
      }
      persist();
      return true;
    },

    /**
     * Збережений тон комунікації (незалежно від статі).
     * @returns {"gentle"|"solid"|null}
     */
    getCommunicationTone() {
      if (!state || !state.settings) return null;
      const t = state.settings.communicationTone;
      return t === "gentle" || t === "solid" ? t : null;
    },

    /**
     * Встановити тон комунікації. null скидає до авто (символ / стать).
     * @param {"gentle"|"solid"|null} tone
     */
    setCommunicationTone(tone) {
      if (!state) return false;
      if (!state.settings) state.settings = {};
      if (tone == null || tone === "") {
        state.settings.communicationTone = null;
      } else if (tone === "gentle" || tone === "solid") {
        state.settings.communicationTone = tone;
      } else {
        return false;
      }
      persist();
      return true;
    },

    accountGender(email) {
      const acc = db()[(email || "").trim().toLowerCase()];
      return acc && acc.profile ? acc.profile.gender : null;
    },

    logout() {
      localStorage.removeItem(SESSION);
      localStorage.removeItem(TOKEN);
      currentEmail = null;
      state = null;
    },

    save() { persist(); },
    set(path, value) { state[path] = value; persist(); },

    saveDraft(draft, opts) {
      if (!state) return;
      state.draft = draft ? Object.assign({}, draft, {
        draftSavedAt: (draft && draft.draftSavedAt) || new Date().toISOString()
      }) : null;
      persist(opts && opts.localOnly ? { localOnly: true } : { localOnly: true });
    },
    saveDraftLocal(draft) {
      this.saveDraft(draft, { localOnly: true });
    },
    clearDraft(opts) {
      if (!state) return;
      state.draft = null;
      if (opts && opts.skipPush) persistLocal();
      else persist();
    },
    getDraft() { return state && state.draft; },

    hasPendingSync() { return !!pendingSync; },

    async flushToCloud() {
      if (!currentEmail || !state) return { ok: false, error: "no_session" };
      if (!Cloud.enabled) {
        persistLocal();
        return { ok: true, localOnly: true };
      }
      // Спочатку підтягнути сервер, щоб піймати конфлікти
      const syncRes = await syncFromCloud(false);
      if (syncRes && syncRes.conflict) return syncRes;
      clearTimeout(pushTimer);
      const pushRes = await Cloud.pushNow(currentEmail, state);
      if (pushRes && pushRes.ok) pendingSync = false;
      else pendingSync = true;
      return pushRes;
    },

    async resolveSyncConflict(choice, local, remote) {
      if (!currentEmail || !state) return;
      if (choice === "remote" && remote) {
        state = Object.assign(emptyState(state.profile), remote);
        state.profile = Object.assign({}, remote.profile || {}, { email: currentEmail });
        ensureRecoveryFields(state.profile);
        ensureRecoveryAwards(state);
      } else if (choice === "merge" && local && remote) {
        // Повторно використати merge з syncFromCloud-логіки через тимчасовий стан
        const prev = state;
        state = local;
        const rem = remote;
        const byId = {};
        [].concat(rem.entries || [], local.entries || []).forEach((e) => {
          if (!e || !e.id) return;
          const prevE = byId[e.id];
          if (!prevE) byId[e.id] = e;
          else {
            const a = String(prevE.fear || "");
            const b = String(e.fear || "");
            // Об’єднання: беремо довшу/новішу версію тексту
            const pt = Date.parse(prevE.updatedAt || prevE.createdAt || 0) || 0;
            const et = Date.parse(e.updatedAt || e.createdAt || 0) || 0;
            if (b.length > a.length || et >= pt) byId[e.id] = Object.assign({}, prevE, e, {
              fear: b.length >= a.length ? b : a,
              cause: (e.cause || prevE.cause || ""),
              updatedAt: new Date().toISOString()
            });
          }
        });
        state = Object.assign({}, rem, local, {
          entries: Object.values(byId).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0)),
          rituals: Object.assign({}, rem.rituals || {}, local.rituals || {}),
          wellbeing: Object.assign({}, rem.wellbeing || {}, local.wellbeing || {}),
          checkins: Object.assign({}, rem.checkins || {}, local.checkins || {}),
          draft: (local.draft && (local.draft.fear || local.draft.cause)) ? local.draft : (rem.draft || null),
          profile: Object.assign({}, rem.profile || {}, local.profile || {}, { email: currentEmail }),
          updatedAt: new Date().toISOString()
        });
        ensureRecoveryFields(state.profile);
        ensureRecoveryAwards(state);
        if (!state) state = prev;
      } else if (choice === "local" && local) {
        state = local;
        if (state.profile) state.profile.email = currentEmail;
      }
      pendingSync = true;
      persist();
      clearTimeout(pushTimer);
      await Cloud.pushNow(currentEmail, state);
    },

    addEntry(entry) {
      entry.id = entry.id || ("e" + Date.now() + Math.random().toString(36).slice(2, 6));
      entry.createdAt = entry.createdAt || new Date().toISOString();
      entry.updatedAt = entry.updatedAt || entry.createdAt;
      state.entries.unshift(entry);
      this.markCheckin(entry.createdAt);
      persist();
      // Щоденниковий запис (не calm-сесія) — перший за день.
      if (entry.type !== "calm") this.awardRecoveryProgress("diary");
      return entry;
    },
    updateEntry(id, patch) {
      const e = state.entries.find(x => x.id === id);
      if (e) {
        const becameReviewed = patch && patch.reviewed === true && !e.reviewed;
        Object.assign(e, patch, { updatedAt: new Date().toISOString() });
        persist();
        if (becameReviewed) this.awardRecoveryProgress("past");
      }
      return e;
    },
    /** Прибрати з активного щоденника → «Тіні забутих предків». */
    archiveEntry(id) {
      const e = state.entries.find(x => x.id === id);
      if (!e) return null;
      e.archived = true;
      e.archivedAt = new Date().toISOString();
      e.updatedAt = e.archivedAt;
      persist();
      return e;
    },
    restoreEntry(id) {
      const e = state.entries.find(x => x.id === id);
      if (!e) return null;
      delete e.archived;
      delete e.archivedAt;
      e.updatedAt = new Date().toISOString();
      persist();
      return e;
    },
    /** Остаточне видалення (лише з папки тіней). */
    purgeEntry(id) {
      state.entries = state.entries.filter(x => x.id !== id);
      persist();
    },
    /** Сумісність: «видалити» = архів у тіні. */
    removeEntry(id) { return this.archiveEntry(id); },

    addEvidence(ev) {
      ev.id = "ev" + Date.now() + Math.random().toString(36).slice(2, 5);
      ev.date = ev.date || new Date().toISOString();
      state.evidence.unshift(ev); persist(); return ev;
    },
    removeEvidence(id) { state.evidence = state.evidence.filter(x => x.id !== id); persist(); },

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

    addTreasure(t) {
      t.id = "t" + Date.now() + Math.random().toString(36).slice(2, 5);
      t.date = new Date().toISOString();
      state.treasure.unshift(t); persist(); return t;
    },
    removeTreasure(id) { state.treasure = state.treasure.filter(x => x.id !== id); persist(); },

    addTest(score, meta) {
      const rec = Object.assign({ date: new Date().toISOString(), score }, meta || {});
      state.tests.push(rec);
      persist();
      return rec;
    },

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

    addLittleJoy(category, text) {
      text = (text || "").trim(); if (!text) return;
      if (!Array.isArray(state.littleJoys)) state.littleJoys = [];
      state.littleJoys.unshift({ id: "j" + Date.now() + Math.random().toString(36).slice(2, 5), category: category || "other", text, date: new Date().toISOString() });
      persist();
    },
    removeLittleJoy(id) { state.littleJoys = (state.littleJoys || []).filter(x => x.id !== id); persist(); },
    randomLittleJoys(n = 2) {
      const arr = (state.littleJoys || []).slice();
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr.slice(0, n);
    },

    addFriendNote(situation, advice) {
      situation = (situation || "").trim(); advice = (advice || "").trim();
      if (!situation && !advice) return;
      if (!Array.isArray(state.friendNotes)) state.friendNotes = [];
      state.friendNotes.unshift({ id: "fn" + Date.now() + Math.random().toString(36).slice(2, 5), situation, advice, date: new Date().toISOString() });
      persist();
      // Рекомендована вправа / практика листа другу.
      this.awardRecoveryProgress("exercise");
    },
    removeFriendNote(id) { state.friendNotes = (state.friendNotes || []).filter(x => x.id !== id); persist(); },

    setWellbeing(level, date) {
      const iso = date || new Date().toISOString();
      const d = new Date(iso);
      const dayKey = Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : dayKeyLocal(d);
      if (!state.wellbeing || Array.isArray(state.wellbeing)) state.wellbeing = {};
      state.wellbeing[dayKey] = { level: +level, date: iso, scale: "anxiety" };
      this.markCheckin(iso);
      persist();
      // Перша оцінка стану за день (повторні зміни шкали не дають прогресу).
      this.awardRecoveryProgress("wellbeing");
      return state.wellbeing[dayKey];
    },
    todayWellbeing() {
      if (!state.wellbeing || Array.isArray(state.wellbeing)) state.wellbeing = {};
      state.wellbeing = normalizeWellbeingMap(state.wellbeing);
      return state.wellbeing[dayKeyLocal(new Date())] || null;
    },
    addGoodEvent(text, date) {
      text = (text || "").trim(); if (!text) return null;
      const iso = date || new Date().toISOString();
      const d = new Date(iso);
      const dayKey = Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : dayKeyLocal(d);
      if (!Array.isArray(state.goodEvents)) state.goodEvents = [];
      const ev = { id: "ge" + Date.now() + Math.random().toString(36).slice(2, 5), text, date: iso, dayKey };
      state.goodEvents.unshift(ev);
      persist();
      this.awardRecoveryProgress("good");
      return ev;
    },
    removeGoodEvent(id) { state.goodEvents = (state.goodEvents || []).filter(x => x.id !== id); persist(); },

    addGratitude(text, date) {
      text = (text || "").trim(); if (!text) return null;
      const iso = date || new Date().toISOString();
      const d = new Date(iso);
      const dayKey = Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : dayKeyLocal(d);
      if (!Array.isArray(state.gratitude)) state.gratitude = [];
      const rec = { id: "gr" + Date.now() + Math.random().toString(36).slice(2, 5), text, date: iso, dayKey };
      state.gratitude.unshift(rec);
      persist();
      this.awardRecoveryProgress("gratitude");
      return rec;
    },
    removeGratitude(id) { state.gratitude = (state.gratitude || []).filter(x => x.id !== id); persist(); },

    markCheckin(iso) {
      const d = new Date(iso || Date.now());
      const key = Number.isNaN(d.getTime()) ? dayKeyLocal(new Date()) : dayKeyLocal(d);
      state.checkins[key] = true; persist();
    },

    unlock(id) {
      if (!state.achievements[id]) { state.achievements[id] = new Date().toISOString(); persist(); return true; }
      return false;
    },

    exportJSON() { return JSON.stringify(state, null, 2); },
    importJSON(json) {
      const data = JSON.parse(json);
      if (!data || !data.profile) throw new Error("Невірний формат файлу");
      state = Object.assign(emptyState(state.profile), data);
      state.profile.email = currentEmail;
      ensureRecoveryFields(state.profile);
      ensureRecoveryAwards(state);
      persist();
    },

    deleteAllData() {
      if (!currentEmail) return;
      const email = currentEmail;
      if (Auth.enabled) {
        fetch("/api/telegram/link", { method: "DELETE", headers: authHeaders() }).catch(() => {});
      }
      const all = db();
      delete all[currentEmail];
      saveDb(all);
      Cloud.remove(email);
      this.logout();
    },

    async telegramStatus() {
      if (!Auth.enabled) return { ok: false, error: "offline" };
      return Auth.telegramStatus();
    },

    async telegramCreateLink() {
      if (!Auth.enabled) return { ok: false, error: "offline" };
      return Auth.telegramCreateLink();
    },

    async telegramUnlink() {
      if (!Auth.enabled) return { ok: false, error: "offline" };
      return Auth.telegramUnlink();
    },

    isAdminEmail(email) {
      const list = (typeof window !== "undefined" && window.CONTENT && Array.isArray(window.CONTENT.ADMIN_EMAILS))
        ? window.CONTENT.ADMIN_EMAILS
        : [];
      const e = String(email || "").trim().toLowerCase();
      if (!e) return false;
      if (list.some((x) => String(x).trim().toLowerCase() === e)) return true;
      if (window.SPOKIY_CONFIG && window.SPOKIY_CONFIG.admin) return true;
      return false;
    },

    async fetchAdminOverview() {
      if (!Auth.enabled || !currentEmail) return { ok: false, error: "offline" };
      try {
        const r = await fetch("/api/admin/overview", {
          headers: { Accept: "application/json", ...authHeaders() }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { ok: false, error: (j && j.error) || ("http_" + r.status), status: r.status };
        return j;
      } catch (e) {
        return { ok: false, error: "network" };
      }
    },

    /** Підтягнути стан з хмари (Telegram + сайт) і злити з локальним. */
    refreshFromCloud
  };
})();
