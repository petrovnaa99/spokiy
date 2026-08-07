"use strict";
/**
 * Offline-first захист даних «Спокій»:
 * — durable чернетки (IndexedDB + fallback localStorage)
 * — автозбереження з debounce
 * — банер offline / sync
 * — beforeunload
 * — відновлення після аварії
 * — м’яке оновлення версії сайту
 * — підказка при конфлікті записів
 */
window.Safeguard = (function () {
  const IDB_NAME = "spokiy-safeguard";
  const IDB_STORE = "kv";
  const LS_PREFIX = "spokiy:sg:";
  const BUILD_META = 'meta[name="spokiy-build"]';
  const DEBOUNCE_MS = 2500;
  const MAX_INTERVAL_MS = 5000;
  const VERSION_POLL_MS = 5 * 60 * 1000;

  let deps = null;
  let dbPromise = null;
  let draftTimer = null;
  let draftInterval = null;
  let lastDraftWrite = 0;
  let pendingDraft = null;
  let dirty = false;
  let syncing = false;
  let lastOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  let updateAvailable = false;
  let updatePrompted = false;
  let editingRoute = false;
  let conflictOpen = false;
  let recoveryAsked = false;
  let bootBuild = null;

  function email() {
    try {
      return (deps && deps.S && deps.S.state && deps.S.state.profile && deps.S.state.profile.email)
        || localStorage.getItem("spokiy:session")
        || "";
    } catch (e) { return ""; }
  }

  function key(name) {
    const e = email() || "_anon";
    return name + ":" + e;
  }

  function openIdb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }

  async function idbGet(k) {
    const db = await openIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(k);
        req.onsuccess = () => resolve(req.result == null ? null : req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function idbSet(k, value) {
    const db = await openIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, k);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  async function idbDel(k) {
    const db = await openIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(k);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  function lsGet(k) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + k);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function lsSet(k, value) {
    try {
      localStorage.setItem(LS_PREFIX + k, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }

  function lsDel(k) {
    try { localStorage.removeItem(LS_PREFIX + k); return true; }
    catch (e) { return false; }
  }

  async function durableGet(name) {
    const k = key(name);
    const fromIdb = await idbGet(k);
    if (fromIdb != null) return fromIdb;
    return lsGet(k);
  }

  async function durableSet(name, value) {
    const k = key(name);
    lsSet(k, value);
    await idbSet(k, value);
    return true;
  }

  async function durableDel(name) {
    const k = key(name);
    lsDel(k);
    await idbDel(k);
  }

  function draftHasContent(d) {
    if (!d || typeof d !== "object") return false;
    return !!(String(d.fear || "").trim() || String(d.cause || "").trim());
  }

  function setBanner(kind, text) {
    const el = document.getElementById("connectivity-banner");
    if (!el) return;
    if (!kind) {
      el.className = "connectivity-banner hidden";
      el.textContent = "";
      el.setAttribute("aria-hidden", "true");
      return;
    }
    el.className = "connectivity-banner connectivity-banner--" + kind;
    el.textContent = text;
    el.setAttribute("aria-hidden", "false");
  }

  function isOnline() {
    return typeof navigator === "undefined" ? true : !!navigator.onLine;
  }

  function setDirty(v) {
    dirty = !!v;
    try {
      window.dispatchEvent(new CustomEvent("spokiy:dirty", { detail: { dirty } }));
    } catch (e) {}
  }

  function hasUnsaved() {
    if (dirty) return true;
    if (pendingDraft && draftHasContent(pendingDraft)) return true;
    if (deps && deps.S && typeof deps.S.hasPendingSync === "function" && deps.S.hasPendingSync()) return true;
    const d = deps && deps.S && deps.S.getDraft && deps.S.getDraft();
    return draftHasContent(d);
  }

  async function writeDraftNow(form) {
    if (!form) return;
    const payload = Object.assign({}, form, {
      draftSavedAt: new Date().toISOString(),
      sourceDevice: "web"
    });
    pendingDraft = payload;
    lastDraftWrite = Date.now();
    await durableSet("draft", payload);
    if (deps && deps.S && deps.S.saveDraftLocal) deps.S.saveDraftLocal(payload);
    else if (deps && deps.S && deps.S.saveDraft) deps.S.saveDraft(payload, { localOnly: true });
    setDirty(true);
  }

  function scheduleDraftSave(form) {
    pendingDraft = form;
    setDirty(true);
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { writeDraftNow(form); }, DEBOUNCE_MS);
    if (!draftInterval) {
      draftInterval = setInterval(() => {
        if (!pendingDraft) return;
        if (Date.now() - lastDraftWrite >= MAX_INTERVAL_MS) writeDraftNow(pendingDraft);
      }, 1000);
    }
  }

  async function clearDraftDurable() {
    clearTimeout(draftTimer);
    pendingDraft = null;
    await durableDel("draft");
    if (deps && deps.S && deps.S.clearDraft) deps.S.clearDraft({ skipPush: false });
    setDirty(false);
  }

  async function getDurableDraft() {
    return durableGet("draft");
  }

  async function flushToServer(opts) {
    const options = opts || {};
    if (!deps || !deps.S) return { ok: false, error: "no_store" };
    if (!isOnline()) {
      setBanner("offline", "Немає підключення до Інтернету. Запис тимчасово збережено на вашому пристрої.");
      return { ok: false, error: "offline" };
    }
    if (syncing) return { ok: false, error: "busy" };
    syncing = true;
    if (!options.silent) setBanner("sync", "Синхронізуємо запис…");
    try {
      if (pendingDraft) await writeDraftNow(pendingDraft);
      const res = await deps.S.flushToCloud();
      if (res && res.conflict) {
        setBanner(null);
        await offerConflict(res);
        return res;
      }
      if (res && res.ok) {
        setDirty(false);
        if (options.afterEntrySave) await durableDel("draft");
        if (options.announceRestore) {
          setBanner("ok", "Підключення відновлено. Запис успішно синхронізовано.");
          setTimeout(() => {
            if (isOnline()) setBanner(null);
          }, 3500);
        } else if (!options.silent) {
          setBanner(null);
        }
        maybeOfferUpdate();
        return res;
      }
      setBanner("offline", "Немає підключення до Інтернету. Запис тимчасово збережено на вашому пристрої.");
      return res || { ok: false };
    } catch (e) {
      setBanner("offline", "Немає підключення до Інтернету. Запис тимчасово збережено на вашому пристрої.");
      return { ok: false, error: "network" };
    } finally {
      syncing = false;
    }
  }

  async function offerConflict(res) {
    if (conflictOpen || !deps || !deps.openModal) return;
    conflictOpen = true;
    const local = res.local;
    const remote = res.remote;
    deps.openModal(`
      <h2>Різні версії записів</h2>
      <p class="muted" style="margin:0 0 12px;line-height:1.55">
        Цей акаунт змінювали на іншому пристрої. Обери, яку версію залишити — нічого не перезапишемо мовчки.
      </p>
      <div class="stack" style="gap:10px">
        <button type="button" class="btn btn-primary btn-block" id="sg-keep-local">Залишити версію з цього пристрою</button>
        <button type="button" class="btn btn-ghost btn-block" id="sg-keep-remote">Залишити серверну версію</button>
        <button type="button" class="btn btn-accent btn-block" id="sg-merge">Об’єднати зміни</button>
      </div>`);
    const finish = async (choice) => {
      conflictOpen = false;
      deps.closeModal();
      if (deps.S && deps.S.resolveSyncConflict) {
        await deps.S.resolveSyncConflict(choice, local, remote);
        if (deps.toast) deps.toast("Версію збережено 🌿", "good");
        try { window.dispatchEvent(new CustomEvent("spokiy:synced")); } catch (e) {}
      }
    };
    const a = document.getElementById("sg-keep-local");
    const b = document.getElementById("sg-keep-remote");
    const c = document.getElementById("sg-merge");
    if (a) a.onclick = () => finish("local");
    if (b) b.onclick = () => finish("remote");
    if (c) c.onclick = () => finish("merge");
  }

  async function offerRecovery() {
    if (recoveryAsked) return;
    recoveryAsked = true;
    const durable = await getDurableDraft();
    if (!draftHasContent(durable)) return;
    const current = deps && deps.S && deps.S.getDraft ? deps.S.getDraft() : null;
    const same =
      current &&
      String(current.fear || "") === String(durable.fear || "") &&
      String(current.cause || "") === String(durable.cause || "");
    if (same && draftHasContent(current)) return;
    if (!deps || !deps.openModal) return;

    deps.openModal(`
      <h2>Ми знайшли незбережену чернетку</h2>
      <p class="muted" style="margin:0 0 10px;line-height:1.55">
        Схоже, попередній сеанс перервався. Можна відновити текст або видалити чернетку.
      </p>
      <div class="item" style="margin-bottom:12px">
        <div class="item-body">${deps.esc((durable.fear || durable.cause || "").slice(0, 220))}</div>
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" id="sg-draft-del">Видалити</button>
        <button type="button" class="btn btn-primary" id="sg-draft-restore">Відновити</button>
      </div>`);
    const del = document.getElementById("sg-draft-del");
    const restore = document.getElementById("sg-draft-restore");
    if (del) del.onclick = async () => {
      await clearDraftDurable();
      if (deps.S && deps.S.clearDraft) deps.S.clearDraft();
      deps.closeModal();
      if (deps.toast) deps.toast("Чернетку видалено");
    };
    if (restore) restore.onclick = async () => {
      if (deps.S && deps.S.saveDraftLocal) deps.S.saveDraftLocal(durable);
      else if (deps.S && deps.S.saveDraft) deps.S.saveDraft(durable, { localOnly: true });
      pendingDraft = durable;
      setDirty(true);
      deps.closeModal();
      if (deps.toast) deps.toast("Чернетку відновлено 🌿", "good");
      if (deps.go) deps.go("new");
    };
  }

  function readBootBuild() {
    const m = document.querySelector(BUILD_META);
    return m ? String(m.getAttribute("content") || "").trim() : "";
  }

  async function fetchRemoteBuild() {
    try {
      const r = await fetch("/index.html?_sg=" + Date.now(), { cache: "no-store", headers: { Accept: "text/html" } });
      if (!r.ok) return null;
      const text = await r.text();
      const m = text.match(/name=["']spokiy-build["']\s+content=["']([^"']+)["']/i)
        || text.match(/content=["']([^"']+)["']\s+name=["']spokiy-build["']/i);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  function offerUpdateModal() {
    if (!deps || !deps.openModal || updatePrompted) return;
    updatePrompted = true;
    deps.openModal(`
      <h2>Доступне оновлення Спокою</h2>
      <p class="muted" style="margin:0 0 14px;line-height:1.55">
        Можна завершити редагування. Оновлення застосуємо лише після збереження даних.
      </p>
      <div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" id="sg-upd-later">Пізніше</button>
        <button type="button" class="btn btn-primary" id="sg-upd-now">Оновити зараз</button>
      </div>`);
    const later = document.getElementById("sg-upd-later");
    const now = document.getElementById("sg-upd-now");
    if (later) later.onclick = () => { deps.closeModal(); };
    if (now) now.onclick = async () => {
      deps.closeModal();
      const res = await flushToServer({ silent: false });
      if (res && res.ok) reloadAfterSave();
      else if (deps.toast) deps.toast("Спочатку дочекайся синхронізації запису", "warn");
    };
  }

  function maybeOfferUpdate() {
    if (!updateAvailable) return;
    if (editingRoute && hasUnsaved()) return;
    offerUpdateModal();
  }

  async function checkVersion() {
    if (!bootBuild) return;
    const remote = await fetchRemoteBuild();
    if (!remote || remote === bootBuild) return;
    updateAvailable = true;
    if (!hasUnsaved() && !editingRoute) offerUpdateModal();
  }

  function onOffline() {
    lastOnline = false;
    setBanner("offline", "Немає підключення до Інтернету. Запис тимчасово збережено на вашому пристрої.");
  }

  async function onOnline() {
    const wasOffline = !lastOnline;
    lastOnline = true;
    if (!wasOffline && !hasUnsaved()) {
      setBanner(null);
      return;
    }
    await flushToServer({ announceRestore: true });
  }

  function onBeforeUnload(e) {
    if (!hasUnsaved()) return;
    // Сучасні браузери ігнорують власний текст і показують системне вікно
    // мовою інтерфейсу браузера (не сайту). Текст нижче — лише для старих браузерів.
    e.preventDefault();
    e.returnValue = "У вас є незбережені зміни. Ви дійсно хочете залишити сторінку?";
    return e.returnValue;
  }

  /** Навмисне перезавантаження після збереження — без системного діалогу. */
  function reloadAfterSave() {
    dirty = false;
    pendingDraft = null;
    location.reload();
  }

  function setEditingRoute(isEditing) {
    editingRoute = !!isEditing;
    if (!editingRoute) maybeOfferUpdate();
  }

  function init(api) {
    deps = api || {};
    bootBuild = readBootBuild();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    if (!isOnline()) onOffline();
    setTimeout(() => { offerRecovery().catch(() => {}); }, 700);
    setTimeout(() => { checkVersion().catch(() => {}); }, 8000);
    setInterval(() => { checkVersion().catch(() => {}); }, VERSION_POLL_MS);
  }

  function handleConflictEvent(detail) {
    if (!detail || !detail.local || !detail.remote) return;
    offerConflict({ conflict: true, local: detail.local, remote: detail.remote });
  }

  return {
    init,
    scheduleDraftSave,
    writeDraftNow,
    clearDraftDurable,
    getDurableDraft,
    flushToServer,
    hasUnsaved,
    setEditingRoute,
    setDirty,
    draftHasContent,
    isOnline,
    setBanner,
    handleConflictEvent
  };
})();
