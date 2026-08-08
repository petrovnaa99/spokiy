/* Спокій — основна логіка додатку */
(function () {
  const C = window.CONTENT;
  const S = window.Store;

  /* ===================== Утиліти ===================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  function dayKeyLocal(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const todayKey = () => dayKeyLocal(new Date());
  const uid = () => Math.random().toString(36).slice(2, 9);

  /* ===================== КОНФІГУРАЦІЯ ===================== */
  // Google Client ID підтягується з /api/config (env GOOGLE_CLIENT_ID) або window.SPOKIY_CONFIG.
  let GOOGLE_CLIENT_ID = (window.SPOKIY_CONFIG && window.SPOKIY_CONFIG.googleClientId) || "";

  // Резервне хмарне збереження. Працює з будь-яким REST-сховищем (JSONBin, Supabase, власний бекенд).
  // endpoint має приймати GET (повернути JSON) та PUT (зберегти тіло). Якщо порожнє — використовується файловий бекап.
  const CLOUD = { endpoint: "", headers: {} };

  /* ===================== ГЕНДЕРНА ЛОКАЛІЗАЦІЯ ===================== */
  // Базові тексти написані в жіночому роді. Для чоловіка перетворюємо на льоту.
  const UA_LET = "А-Яа-яЇїІіЄєҐґʼ'’";
  const G_PHRASES = [
    ["з твоєю подругою", "з твоїм другом"],
    ["твоєю подругою", "твоїм другом"],
    ["своєю подругою", "своїм другом"],
    ["що б ти їй порадила", "що б ти йому порадив"],
    ["їй порадила", "йому порадив"],
    ["у твоєї кращої подруги", "у твого кращого друга"],
    ["твоєї кращої подруги", "твого кращого друга"],
    ["у моєї кращої подруги", "у мого кращого друга"],
    ["з моєю кращою подругою", "з моїм другом"],
    ["моєї кращої подруги", "мого кращого друга"],
    ["Порада подрузі", "Лист другові"],
    ["порада подрузі", "лист другові"],
    ["очима доброї подруги", "очима доброго друга"],
    ["доброї подруги", "доброго друга"],
    ["кращої подруги", "кращого друга"],
    ["найкращій подрузі", "найкращому другу"],
    ["сильною чи ідеальною", "сильним чи ідеальним"],
    ["сама собі", "сам собі"],
    ["Ти не сама", "Ти не сам"],
    ["ти не сама", "ти не сам"],
    ["побудь сама", "побудь сам"],
    ["як фахівчині", "як фахівця"]
  ];
  const G_WORDS = [
    // дієслова минулого часу
    ["зробила","зробив"],["зробилася","зробився"],["повернулася","повернувся"],["подбала","подбав"],["подбали","подбав"],
    ["змогла","зміг"],["відчула","відчув"],["обрала","обрав"],["почала","почав"],["хотіла","хотів"],["пройшла","пройшов"],
    ["навчилася","навчився"],["була","був"],["стала","став"],["прийшла","прийшов"],["знайшла","знайшов"],
    ["впоралася","впорався"],["впоралась","впорався"],["засмутилася","засмутився"],["втомилася","втомився"],
    ["заспокоїлася","заспокоївся"],["зосередилася","зосередився"],["пишалася","пишався"],["зрозуміла","зрозумів"],
    ["сказала","сказав"],["написала","написав"],["помітила","помітив"],["дозволила","дозволив"],["відпочила","відпочив"],
    ["поговорила","поговорив"],["почула","почув"],["забувала","забував"],["дочекалася","дочекався"],["спробувала","спробував"],["вирішила","вирішив"],
    ["переживала","переживав"],["карала","карав"],["доросла","дорослий"],["мала","мав"],
    // прикметники / стани (називний)
    ["сама","сам"],["готова","готовий"],["впевнена","впевнений"],["вдячна","вдячний"],["відкрита","відкритий"],
    ["спокійна","спокійний"],["цінна","цінний"],["винна","винен"],["зобов'язана","зобов'язаний"],["зобовʼязана","зобовʼязаний"],
    ["сильна","сильний"],["щаслива","щасливий"],["вільна","вільний"],["гідна","гідний"],["варта","вартий"],
    ["достатня","достатній"],["важлива","важливий"],["потрібна","потрібний"],["здатна","здатний"],["рада","радий"],
    ["втомлена","втомлений"],["налаштована","налаштований"],["самотня","самотній"],
    // прикметники в орудному (-ою → -им)
    ["сильною","сильним"],["ідеальною","ідеальним"],["впевненою","впевненим"],["спокійною","спокійним"],
    ["вдячною","вдячним"],["відкритою","відкритим"],["готовою","готовим"],["щасливою","щасливим"],["вільною","вільним"],["м'якою","м'яким"],
    // дружба
    ["подругою","другом"],["подрузі","другу"],["подругу","друга"],["подруга","друг"]
  ];
  let _gWordRe = null;
  function buildGenderRe() {
    const map = {};
    G_WORDS.forEach(([f, m]) => { map[f.toLowerCase()] = m; });
    const keys = G_WORDS.map(p => p[0]).sort((a, b) => b.length - a.length).map(escapeRe);
    _gWordRe = { re: new RegExp("(?<![" + UA_LET + "])(" + keys.join("|") + ")(?![" + UA_LET + "])", "gi"), map };
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function matchCase(src, repl) {
    if (src && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase())
      return repl.charAt(0).toUpperCase() + repl.slice(1);
    return repl;
  }
  function genderize(text) {
    if (!text || isMale() !== true) return text;
    let out = String(text);
    G_PHRASES.forEach(([f, m]) => {
      if (out.indexOf(f) !== -1) out = out.split(f).join(m);
    });
    if (!_gWordRe) buildGenderRe();
    out = out.replace(_gWordRe.re, (full) => {
      const repl = _gWordRe.map[full.toLowerCase()];
      return repl ? matchCase(full, repl) : full;
    });
    return out;
  }
  function isMale() {
    return !!(S.state && S.state.profile && S.state.profile.gender === "male");
  }
  function applyGenderTheme() {
    const gender = S.state && S.state.profile && S.state.profile.gender;
    if (gender) document.documentElement.setAttribute("data-gender", gender);
    else document.documentElement.removeAttribute("data-gender");

    // Глобальна гамма: gentle / solid (тон комунікації незалежний від статі)
    let tone = null;
    try {
      const stored = S.getCommunicationTone ? S.getCommunicationTone() : null;
      const rec = S.getRecovery ? S.getRecovery() : null;
      const sym = rec && rec.recoverySymbolId ? C.getRecoverySymbolById(rec.recoverySymbolId) : null;
      tone = C.resolveCommunicationTone
        ? C.resolveCommunicationTone(stored, gender, sym && sym.visualStyle)
        : (stored || (gender === "male" ? "solid" : "gentle"));
    } catch (e) {
      tone = gender === "male" ? "solid" : "gentle";
    }
    if (tone === "solid" || tone === "gentle") {
      document.documentElement.setAttribute("data-tone", tone);
    } else {
      document.documentElement.removeAttribute("data-tone");
    }
  }
  function uiText(text) {
    const calmMap = {
      "🌿": "◇", "🍃": "◇", "🌤️": "◌", "💗": "♡", "💚": "♡", "🤍": "♡", "💞": "♡",
      "🌱": "◇", "💝": "♡", "🌟": "✧", "✨": "✧", "🫁": "◌", "🌍": "◎", "🫧": "○",
      "🌈": "◇", "🏆": "△", "🔥": "△", "🎉": "✧", "🛡️": "◇", "🛡": "◇", "💪": "△",
      "🧭": "⌁", "🧪": "∿", "⚙️": "⚙", "👤": "ID", "💾": "□", "☁️": "☁", "🔒": "◇",
      "📚": "§", "📜": "≡", "📄": "□", "🖨️": "□", "🗑": "×", "⬇️": "↓", "⬆️": "↑",
      "☺": "•", "🙂": "•", "😟": "!", "📈": "↑", "📉": "↓"
    };
    const maleMap = {
      "🌿": "◆", "🍃": "◆", "🌤️": "▣", "💗": "■", "💚": "◆", "🤍": "□", "💞": "■",
      "🛡️": "▣", "🛡": "▣", "💪": "▲", "🌱": "◆", "💝": "▣", "🌟": "◆", "✨": "◆",
      "🫁": "◌", "🌍": "◎", "🫧": "○", "🌈": "▣", "🏆": "▲", "🔥": "▲", "🎉": "▲",
      "🧭": "⌁", "🧪": "∿", "⚙️": "⚙", "👤": "ID", "💾": "▣", "☁️": "☁", "🔒": "▣",
      "📚": "§", "📜": "≡", "📄": "□", "🖨️": "□", "🗑": "×", "⬇️": "↓", "⬆️": "↑",
      "☺": "•", "🙂": "•", "😟": "!", "📈": "↑", "📉": "↓"
    };
    const map = isMale() ? maleMap : calmMap;
    return String(text).replace(/🌤️|🛡️|⚙️|☁️|🖨️|⬇️|⬆️|[🌿🍃💗💚🤍💞🛡💪🌱💝🌟✨🫁🌍🫧🌈🏆🔥🎉🧭🧪👤💾🔒📚📜📄🗑☺🙂😟📈📉]/g, m => map[m] || m);
  }
  function genderizeDOM(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentNode;
        if (p && (p.tagName === "SCRIPT" || p.tagName === "STYLE" || p.tagName === "TEXTAREA")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let cur;
    while ((cur = walker.nextNode())) nodes.push(cur);
    nodes.forEach(n => {
      const next = uiText(genderize(n.nodeValue));
      if (next !== n.nodeValue) n.nodeValue = next;
    });
    $$("[placeholder],[title],[aria-label],[alt]", root).forEach(el => {
      ["placeholder", "title", "aria-label", "alt"].forEach(attr => {
        if (!el.hasAttribute(attr)) return;
        const prev = el.getAttribute(attr);
        const next = uiText(genderize(prev));
        if (next !== prev) el.setAttribute(attr, next);
      });
    });
  }

  const MONTHS = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
  function fmtDate(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtDateTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b).setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0)) / 86400000);
  }
  function pluralUk(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function toast(msg, type = "", ms = 3800) {
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.innerHTML = `<span>${uiText(genderize(msg))}</span>`;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; setTimeout(() => t.remove(), 300); }, ms);
  }

  function confetti() {
    const wrap = document.createElement("div");
    wrap.className = "confetti";
    const colors = ["#2fae8e","#5cc9aa","#e0a050","#df7081","#67c89a","#8fd6b8"];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement("i");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.6 + Math.random() * 1.6) + "s";
      c.style.animationDelay = (Math.random() * .4) + "s";
      c.style.transform = `rotate(${Math.random()*360}deg)`;
      wrap.appendChild(c);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 3600);
  }

  /* ===================== Модальні вікна ===================== */
  let pendingAfterModal = null;

  function openModal(html) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal" style="position:relative">${html}<button class="modal-x" data-close>×</button></div>`;
    root.classList.remove("hidden");
    genderizeDOM(root);
    root.onclick = (e) => { if (e.target === root || e.target.hasAttribute("data-close")) closeModal(); };
  }
  function closeModal() {
    const r = $("#modal-root");
    r.classList.add("hidden");
    r.innerHTML = "";
    const next = pendingAfterModal;
    if (typeof next !== "function") return;
    // Якщо одразу відкривається інша модалка (подяка після ритуалу) — почекати наступного закриття.
    setTimeout(() => {
      const root = $("#modal-root");
      const stillOpen = root && !root.classList.contains("hidden") && root.innerHTML.trim();
      if (stillOpen) return;
      pendingAfterModal = null;
      next();
    }, 280);
  }
  function runAfterModal(fn) {
    if (typeof fn !== "function") return;
    const root = $("#modal-root");
    const open = root && !root.classList.contains("hidden") && root.innerHTML.trim();
    if (open) pendingAfterModal = fn;
    else fn();
  }

  function confirmModal(title, text, onYes, yesLabel = "Так", danger = false) {
    openModal(`
      <h2>${esc(title)}</h2>
      <p class="muted" style="line-height:1.55">${esc(text)}</p>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn btn-ghost" data-close>Скасувати</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="cm-yes">${esc(yesLabel)}</button>
      </div>`);
    $("#cm-yes").onclick = () => { closeModal(); onYes(); };
  }

  // М'яка фраза-підтримка після завершеного запису
  function closerModal(onClose) {
    const phrase = randomCloser();
    openModal(`
      <div style="text-align:center;padding:6px 4px">
        <div style="font-size:40px">🌿</div>
        <p style="font-size:23px;line-height:1.4;font-family:var(--font-hand);margin:12px 0 6px">${esc(phrase)}</p>
      </div>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn btn-primary" id="closer-ok">Дякую 💚</button>
      </div>`);
    $("#closer-ok").onclick = () => { closeModal(); if (onClose) onClose(); };
  }

  /* ===================== Навігація ===================== */
  const NAV = [
    { id: "home", icon: "☀", label: "Сьогодні" },
    { id: "sos", icon: "◎", label: "SOS", action: true },
    { id: "history", icon: "≡", label: "Щоденник" },
    { id: "analytics", icon: "∿", label: "Моя динаміка" },
    { id: "support", icon: "♡", label: "Опора" },
    { id: "info", icon: "ℹ", label: "Інформація", meta: true },
    { id: "faq", icon: "?", label: "FAQ", meta: true },
    { id: "privacy", icon: "◌", label: "Конфіденційність", meta: true }
  ];
  /** Мобільне нижнє меню — лише робочі пункти (довідка в «Інформації»). */
  const BOTTOM_NAV = NAV.filter((n) => !n.meta);
  const SUPPORT_ROUTES = ["support", "resources", "friend", "treasure", "library", "joys", "gratitude", "evidence", "profile", "admin"];
  const INFO_ROUTES = ["info", "payment", "privacy", "faq"];
  const ROUTE_TITLES = {
    home: "Сьогодні", history: "Щоденник", analytics: "Моя динаміка", support: "Опора",
    new: "Новий запис", types: "Типи тривоги", typeTest: "Розбір ситуації", reminders: "Нагадування",
    evidence: "Банк доказів", resources: "Мої ресурси", treasure: "Скарбничка", joys: "Мої радощі",
    good: "Хороші події", gratitude: "Вдячність", friend: "Порада подрузі", library: "Бібліотека",
    achievements: "Прогрес", profile: "Профіль", recoverySelect: "Твоє деревце",
    info: "Інформація", payment: "Оплата", privacy: "Конфіденційність", faq: "FAQ", admin: "Адмін"
  };

  let route = "home";
  let routeParam = null;
  let affTimer = null;
  let songCurrent = null;

  function randomAff(exclude) {
    const list = (isMale() && C.MALE_AFFIRMATIONS && C.MALE_AFFIRMATIONS.length) ? C.MALE_AFFIRMATIONS : C.AFFIRMATIONS;
    if (list.length <= 1) return list[0];
    let a;
    do { a = list[Math.floor(Math.random() * list.length)]; } while (a === exclude);
    return a;
  }

  function randomCloser() {
    const list = (C.CALM && C.CALM.closers) || [];
    if (!list.length) return "";
    return list[Math.floor(Math.random() * list.length)];
  }

  /* ===================== ІНСТРУКЦІЯ / ВІКНО НА ВХОДІ ===================== */
  let welcomeFollowUp = null;
  let tourState = null;

  function shouldShowWelcome() {
    if (!S.state || !S.state.settings) return true;
    return !S.state.settings.welcomeSeen;
  }

  function shouldShowTour() {
    if (!S.state || !S.state.settings) return true;
    if (S.state.settings.tourSeen) return false;
    // Старі акаунти (вже бачили вітання до появи туру) — не нав'язуємо автоматично
    if (S.state.settings.welcomeSeen) return false;
    return true;
  }

  function markWelcomeSeen() {
    if (!S.state) return;
    if (!S.state.settings) S.state.settings = {};
    S.state.settings.welcomeSeen = true;
    S.save();
  }

  function markTourSeen() {
    if (!S.state) return;
    if (!S.state.settings) S.state.settings = {};
    S.state.settings.tourSeen = true;
    S.save();
  }

  function welcomeFeaturesHTML() {
    const groups = C.WELCOME_FEATURES || [];
    return `
      <div class="welcome-groups">
        ${groups.map((g) => `
          <section class="welcome-group">
            <h3 class="welcome-group-title">${esc(g.title)}</h3>
            <div class="welcome-grid">
              ${(g.items || []).map((i) => `
                <article class="welcome-card">
                  <div class="welcome-ico">${esc(i.ico)}</div>
                  <div class="welcome-card-body">
                    <b>${esc(i.t)}</b>
                    <p>${esc(i.d)}</p>
                  </div>
                </article>`).join("")}
            </div>
          </section>`).join("")}
      </div>`;
  }

  function finishWelcomeModal() {
    markWelcomeSeen();
    const follow = welcomeFollowUp;
    welcomeFollowUp = null;
    closeModal();
    if (!follow) return;
    setTimeout(() => {
      if (follow.thenOnboarding || follow.thenTour) {
        // force: welcomeAlready marked — без цього тур одразу скасовується
        startSiteTour({
          force: true,
          thenWellbeing: true,
          thenPracticeGuide: !!follow.thenPracticeGuide
        });
      } else if (follow.thenPracticeGuide) {
        setTimeout(() => runAfterModal(openPracticeGuide), 400);
      }
    }, 320);
  }

  /** Окреме вікно на вході: повний огляд функцій сайту. */
  function openWelcomeFeatures(opts) {
    const options = opts || {};
    welcomeFollowUp = {
      thenOnboarding: !!options.thenOnboarding,
      thenTour: options.thenTour !== false && !!options.thenOnboarding,
      thenPracticeGuide: !!options.thenPracticeGuide
    };
    openModal(`
      <div class="welcome-modal">
        <p class="welcome-eyebrow">Ласкаво просимо</p>
        <h2>Що на тебе чекає в «Спокої»</h2>
        <p class="muted welcome-lead">Це особистий простір самопідтримки: музика для настрою, записи, аналіз стану, дихання й тепла опора — без оцінок і без потреби писати багато.</p>
        ${welcomeFeaturesHTML()}
        <p class="welcome-footer">Тут не треба бути сильною чи ідеальною. Достатньо одного маленького кроку до себе.</p>
        <div class="row welcome-actions">
          <button type="button" class="btn btn-primary" id="welcome-start">Далі — коротке навчання</button>
          <button type="button" class="btn btn-ghost" id="welcome-skip-tour">Пропустити навчання</button>
        </div>
      </div>`);
    const modal = $(".modal", $("#modal-root"));
    if (modal) modal.classList.add("modal--welcome");
    const start = $("#welcome-start");
    if (start) start.onclick = () => finishWelcomeModal();
    const skip = $("#welcome-skip-tour");
    if (skip) skip.onclick = () => {
      markWelcomeSeen();
      markTourSeen();
      welcomeFollowUp = null;
      closeModal();
      setTimeout(() => startOnboarding(), 280);
    };
    const root = $("#modal-root");
    root.onclick = (e) => {
      if (e.target === root || e.target.hasAttribute("data-close")) finishWelcomeModal();
    };
  }

  function tourSteps() {
    const mobile = window.matchMedia("(max-width: 880px)").matches;
    const steps = [
      {
        key: mobile ? "topbar-profile" : "nav-profile",
        title: "Твій акаунт",
        text: mobile
          ? "Профіль угорі: ім’я, Telegram, експорт і навчання ще раз."
          : "Акаунт угорі зліва: профіль, дані, Telegram і налаштування."
      },
      {
        key: mobile ? "bn-home" : "nav-home",
        title: "Сьогодні",
        text: "Головна дня: деревце, ритуали й швидкі кроки турботи."
      },
      {
        key: "music",
        title: "Музика",
        text: "Смуга вгорі: рекомендована пісня. «Слухати» — знайти на YouTube."
      },
      {
        key: "mood",
        title: "Настрій",
        text: "Блок «Як ти зараз?»: стан дня, підказки й продовження маленьким кроком."
      },
      {
        key: mobile ? "bn-sos" : "nav-sos",
        title: "SOS",
        text: "Коли накриває — коротке дихання прямо зараз, без довгих записів."
      },
      {
        key: mobile ? "bn-history" : "nav-history",
        title: "Щоденник",
        text: "Усі записи в одному місці. Прибрані — у «Тіні забутих предків»."
      },
      {
        key: mobile ? "bn-analytics" : "nav-analytics",
        title: "Моя динаміка",
        text: "Настрій і тривога з сайту та Telegram — зміни в часі."
      },
      {
        key: mobile ? "bn-support" : "nav-support",
        title: "Опора",
        text: "Ресурси, вдячність, скарбничка, докази й бібліотека."
      },
      {
        key: mobile ? "bn-info" : "nav-info",
        title: "Інформація",
        text: "Путівник, оплата й доступ — якщо треба згадати, як користуватися."
      }
    ];
    if (!mobile) {
      steps.push({
        key: "nav-faq",
        title: "FAQ",
        text: "Правила простору, часті питання та форма для відгуку чи побажання."
      });
      steps.push({
        key: "nav-privacy",
        title: "Конфіденційність",
        text: "Політика: що зберігається, де лежать дані й як ти ними керуєш."
      });
    } else {
      steps.push({
        key: "topbar-profile",
        title: "Конфіденційність і FAQ",
        text: "Політика та FAQ — у профілі й у розділі «Інформація»."
      });
    }
    return steps;
  }

  function tourTargetVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  function tourTargetEl(key) {
    if (key === "topbar-profile") {
      const el = $("#topbar-profile");
      return tourTargetVisible(el) ? el : null;
    }
    // SOS: лише видима кнопка з data-route=sos (не бренд і не прихований bottom-nav)
    if (key === "nav-sos" || key === "bn-sos") {
      const candidates = [
        document.querySelector('#nav button[data-route="sos"]'),
        document.querySelector('#bottom-nav button[data-route="sos"]'),
        document.querySelector('#nav [data-tour="nav-sos"]'),
        document.querySelector('#bottom-nav [data-tour="bn-sos"]')
      ];
      for (let i = 0; i < candidates.length; i++) {
        if (tourTargetVisible(candidates[i])) return candidates[i];
      }
      return null;
    }
    if (key && key.indexOf("nav-") === 0) {
      const el = document.querySelector("#nav [data-tour=\"" + key + "\"]")
        || document.querySelector("aside.sidebar [data-tour=\"" + key + "\"]");
      return tourTargetVisible(el) ? el : null;
    }
    if (key && key.indexOf("bn-") === 0) {
      const el = document.querySelector("#bottom-nav [data-tour=\"" + key + "\"]");
      return tourTargetVisible(el) ? el : null;
    }
    const el = document.querySelector("[data-tour=\"" + key + "\"]");
    return tourTargetVisible(el) ? el : null;
  }

  function endSiteTour(opts) {
    const options = opts || {};
    const root = $("#tour-root");
    if (root) {
      root.classList.add("hidden");
      root.innerHTML = "";
      root.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("tour-active");
    window.removeEventListener("resize", onTourReposition);
    tourState = null;
    markTourSeen();
    if (options.thenWellbeing) setTimeout(() => startOnboarding(), 350);
    if (options.thenPracticeGuide) {
      setTimeout(() => runAfterModal(openPracticeGuide), options.thenWellbeing ? 1200 : 400);
    }
  }

  function onTourReposition() {
    if (tourState) paintTourStep(tourState.index, true);
  }

  function startSiteTour(opts) {
    const options = opts || {};
    if (!shouldShowTour() && !options.force) {
      if (options.thenWellbeing) startOnboarding();
      return;
    }
    closeModal();
    // Завжди малюємо «Сьогодні», щоб музика/настрій і контент були на місці
    applyGo("home");
    // render() уже викликає mountSongBar — без повторного insert
    tourState = {
      index: 0,
      thenWellbeing: !!options.thenWellbeing,
      thenPracticeGuide: !!options.thenPracticeGuide
    };
    document.body.classList.add("tour-active");
    window.addEventListener("resize", onTourReposition);
    requestAnimationFrame(() => {
      setTimeout(() => paintTourStep(0), 60);
    });
  }

  function paintTourStep(index, quiet) {
    if (!tourState) return;
    const steps = tourSteps();
    if (index < 0 || index >= steps.length) {
      endSiteTour(tourState);
      return;
    }
    tourState.index = index;
    const step = steps[index];
    const root = $("#tour-root");
    if (!root) return;

    // Кроки на головній: лише переконатися, що смуга музики одна (без дублікатів)
    if ((step.key === "music" || step.key === "mood") && route === "home") {
      mountSongBar();
    }

    let el = tourTargetEl(step.key);
    if (step.key === "music" && !el) {
      mountSongBar();
      el = tourTargetEl("music");
    }
    // nearest + auto: щоб координати підсвітки збігалися з реальною кнопкою (без «плаваючого» scroll)
    if (el && el.scrollIntoView && !quiet) {
      try { el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" }); } catch (e) {}
    }

    // Повторно взяти елемент після можливого re-render навігації
    el = tourTargetEl(step.key) || el;
    const rect = el && tourTargetVisible(el) ? el.getBoundingClientRect() : null;
    const pad = 10;
    const spot = rect && rect.width > 2 && rect.height > 2
      ? {
          top: Math.max(6, rect.top - pad),
          left: Math.max(6, rect.left - pad),
          width: Math.min(window.innerWidth - 12, rect.width + pad * 2),
          height: Math.min(window.innerHeight - 12, rect.height + pad * 2)
        }
      : { top: Math.max(24, window.innerHeight * 0.2), left: Math.max(24, window.innerWidth * 0.5 - 140), width: 280, height: 64 };

    const mobile = window.matchMedia("(max-width: 880px)").matches;
    const cardW = Math.min(300, window.innerWidth - 24);
    let cardTop;
    let cardLeft;
    let arrowSide;
    if (mobile) {
      const preferAbove = spot.top > window.innerHeight * 0.42;
      cardTop = preferAbove
        ? Math.max(12, spot.top - 178)
        : Math.min(window.innerHeight - 210, spot.top + spot.height + 22);
      cardLeft = Math.max(12, Math.min(window.innerWidth - cardW - 12, spot.left + spot.width / 2 - cardW / 2));
      arrowSide = preferAbove ? "down" : "up";
    } else {
      const rightOf = spot.left + spot.width + 20;
      if (rightOf + cardW < window.innerWidth - 12) {
        cardLeft = rightOf;
        arrowSide = "left";
      } else if (spot.left - cardW - 20 > 12) {
        cardLeft = spot.left - cardW - 20;
        arrowSide = "right";
      } else {
        cardLeft = Math.max(12, Math.min(window.innerWidth - cardW - 12, spot.left));
        arrowSide = spot.top > window.innerHeight * 0.5 ? "down" : "up";
        cardTop = arrowSide === "down"
          ? Math.max(12, spot.top - 178)
          : Math.min(window.innerHeight - 210, spot.top + spot.height + 22);
      }
      if (cardTop == null) {
        cardTop = Math.max(16, Math.min(window.innerHeight - 220, spot.top + spot.height / 2 - 72));
      }
    }

    const isLast = index === steps.length - 1;
    const spotCx = spot.left + spot.width / 2;
    const spotCy = spot.top + spot.height / 2;
    const cardCx = cardLeft + cardW / 2;
    const cardCy = cardTop + 70;
    const dx = spotCx - cardCx;
    const dy = spotCy - cardCy;
    const dist = Math.max(36, Math.hypot(dx, dy) - 28);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    root.innerHTML = `
      <div class="tour-backdrop" data-tour-skip></div>
      <div class="tour-spotlight" style="top:${spot.top}px;left:${spot.left}px;width:${spot.width}px;height:${spot.height}px"></div>
      <div class="tour-guide-arrow" style="top:${cardCy}px;left:${cardCx}px;width:${dist}px;transform:rotate(${angle}deg)" aria-hidden="true">
        <span class="tour-guide-shaft"></span>
        <span class="tour-guide-head"></span>
      </div>
      <div class="tour-card tour-arrow-${arrowSide}" style="top:${cardTop}px;left:${cardLeft}px" role="dialog" aria-labelledby="tour-title">
        <div class="tour-card-arrow" aria-hidden="true"></div>
        <p class="tour-step">${index + 1} з ${steps.length}</p>
        <h3 id="tour-title">${esc(step.title)}</h3>
        <p>${esc(step.text)}</p>
        <div class="tour-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="tour-skip">Пропустити</button>
          <div class="row" style="gap:8px">
            ${index > 0 ? `<button type="button" class="btn btn-ghost btn-sm" id="tour-prev">Назад</button>` : ""}
            <button type="button" class="btn btn-primary btn-sm" id="tour-next">${isLast ? "Готово" : "Далі"}</button>
          </div>
        </div>
      </div>`;

    const skip = $("#tour-skip");
    if (skip) skip.onclick = () => endSiteTour(tourState);
    $$("[data-tour-skip]", root).forEach((b) => {
      b.onclick = () => endSiteTour(tourState);
    });
    const prev = $("#tour-prev");
    if (prev) prev.onclick = () => paintTourStep(index - 1);
    const next = $("#tour-next");
    if (next) next.onclick = () => {
      if (isLast) endSiteTour(tourState);
      else paintTourStep(index + 1);
    };
  }

  function openGuide() {
    openWelcomeFeatures({ thenOnboarding: false });
  }

  function paymentContentHTML(opts) {
    const pay = C.PAYMENT || {};
    const compact = !!(opts && opts.compact);
    const plans = Array.isArray(pay.plans) ? pay.plans : [];
    const payUrl = (pay.payUrl || "").trim();
    return `
      ${compact ? "" : `<p class="muted" style="margin:0 0 14px;line-height:1.55">${esc(pay.intro || "")}</p>`}
      <div class="payment-plans">
        ${plans.map((p) => `
          <article class="payment-plan">
            <div class="payment-plan-top">
              <h3>${esc(p.name || "")}</h3>
              ${p.badge ? `<span class="payment-badge">${esc(p.badge)}</span>` : ""}
            </div>
            <div class="payment-price">
              <b>${esc(p.price || "")}</b>
              ${p.period ? `<span>${esc(p.period)}</span>` : ""}
            </div>
            <ul class="payment-features">
              ${(p.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}
            </ul>
          </article>`).join("")}
      </div>
      ${pay.requisites ? `<div class="payment-requisites"><b>Як оплатити / підтримати</b><p>${esc(pay.requisites)}</p></div>` : ""}
      ${payUrl ? `<a class="btn btn-primary btn-block" id="payment-pay-link" href="${esc(payUrl)}" target="_blank" rel="noopener noreferrer">${esc(pay.payLabel || "Перейти до оплати")}</a>` : ""}
      ${pay.note ? `<p class="payment-note">${esc(pay.note)}</p>` : ""}
      ${pay.contactHint ? `<p class="faint" style="margin:8px 0 0;font-size:12.5px;line-height:1.45">${esc(pay.contactHint)}</p>` : ""}
    `;
  }

  function openPaymentInfo() {
    const pay = C.PAYMENT || {};
    openModal(`
      <h2>${esc(pay.title || "Оплата")}</h2>
      <div class="payment-modal-body">
        ${paymentContentHTML({ compact: false })}
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button type="button" class="btn btn-ghost btn-sm" data-close>Закрити</button>
      </div>`);
  }

  function openPrivacyInfo() {
    const priv = C.PRIVACY || {};
    const sections = Array.isArray(priv.sections) ? priv.sections : [];
    openModal(`
      <h2>${esc(priv.title || "Конфіденційність")}</h2>
      <div class="privacy-modal-body">
        <p class="muted" style="margin:0 0 12px;line-height:1.55">${esc(priv.intro || "")}</p>
        ${sections.map((s) => `
          <div class="privacy-modal-block">
            <b>${esc(s.title || "")}</b>
            <p>${esc(s.body || "")}</p>
          </div>`).join("")}
        ${priv.footer ? `<p class="faint" style="margin-top:10px;font-size:12.5px">${esc(priv.footer)}</p>` : ""}
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button type="button" class="btn btn-ghost btn-sm" data-close>Закрити</button>
      </div>`);
  }

  function openFaqInfo() {
    const faq = C.FAQ || {};
    const items = Array.isArray(faq.items) ? faq.items : [];
    const rules = Array.isArray(faq.rules) ? faq.rules : [];
    openModal(`
      <h2>${esc(faq.title || "FAQ")}</h2>
      <div class="faq-modal-body">
        <p class="muted" style="margin:0 0 12px;line-height:1.55">${esc(faq.intro || "")}</p>
        <b>${esc(faq.rulesTitle || "Правила")}</b>
        <ul class="faq-rules-list" style="margin:8px 0 14px">
          ${rules.map((r) => `<li>${esc(r)}</li>`).join("")}
        </ul>
        ${items.map((it) => `
          <div class="privacy-modal-block">
            <b>${esc(it.q || "")}</b>
            <p>${esc(it.a || "")}</p>
          </div>`).join("")}
        <p class="faint" style="margin-top:10px;font-size:12.5px">Залишити відгук можна після входу: Інформація → FAQ і відгук.</p>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button type="button" class="btn btn-ghost btn-sm" data-close>Закрити</button>
      </div>`);
  }

  function viewPayment() {
    const pay = C.PAYMENT || {};
    $("#view").innerHTML = `
      <div class="page-head">
        <h1>${esc(pay.title || "Оплата")}</h1>
        <p>Умови доступу та способи оплати</p>
      </div>
      <div class="card payment-page">
        ${paymentContentHTML({ compact: false })}
      </div>
      <button class="btn btn-ghost btn-sm" id="payment-back" type="button" style="margin-top:12px">← Назад до інформації</button>`;
    const back = $("#payment-back");
    if (back) back.onclick = () => go("info");
  }

  function viewPrivacy() {
    const priv = C.PRIVACY || {};
    const sections = Array.isArray(priv.sections) ? priv.sections : [];
    $("#view").innerHTML = `
      <div class="page-head">
        <h1>${esc(priv.title || "Конфіденційність")}</h1>
        <p>${esc(priv.intro || "")}</p>
      </div>
      <div class="card privacy-page">
        ${sections.map((s) => `
          <div class="privacy-block">
            <h3>${esc(s.title || "")}</h3>
            <p>${esc(s.body || "")}</p>
          </div>`).join("")}
        ${priv.footer ? `<p class="faint" style="margin-top:12px;font-size:12.5px">${esc(priv.footer)}</p>` : ""}
      </div>
      <button class="btn btn-ghost btn-sm" id="privacy-back" type="button" style="margin-top:12px">← Назад до інформації</button>`;
    const back = $("#privacy-back");
    if (back) back.onclick = () => go("info");
  }

  function viewFaq() {
    const faq = C.FAQ || {};
    const items = Array.isArray(faq.items) ? faq.items : [];
    const rules = Array.isArray(faq.rules) ? faq.rules : [];
    const types = Array.isArray(faq.feedbackTypes) ? faq.feedbackTypes : [
      { id: "feedback", label: "Відгук" },
      { id: "wish", label: "Побажання" }
    ];
    $("#view").innerHTML = `
      <div class="page-head">
        <h1>${esc(faq.title || "FAQ")}</h1>
        <p>${esc(faq.intro || "")}</p>
      </div>

      <div class="card faq-rules">
        <h2 class="faq-section-title">${esc(faq.rulesTitle || "Правила простору")}</h2>
        <ul class="faq-rules-list">
          ${rules.map((r) => `<li>${esc(r)}</li>`).join("")}
        </ul>
      </div>

      <div class="card faq-list" style="margin-top:14px">
        <h2 class="faq-section-title">Часті питання</h2>
        <div class="faq-accordion" id="faq-accordion">
          ${items.map((it, i) => `
            <details class="faq-item" ${i === 0 ? "open" : ""}>
              <summary>${esc(it.q || "")}</summary>
              <p>${esc(it.a || "")}</p>
            </details>`).join("")}
        </div>
      </div>

      <div class="card faq-feedback" style="margin-top:14px" id="faq-feedback">
        <h2 class="faq-section-title">${esc(faq.feedbackTitle || "Відгук або побажання")}</h2>
        <p class="muted" style="margin:0 0 12px;line-height:1.5">${esc(faq.feedbackLead || "")}</p>
        <label class="field"><span>Тип</span>
          <select id="fb-kind">
            ${types.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}
          </select>
        </label>
        <label class="field" style="margin-top:10px"><span>Повідомлення</span>
          <textarea id="fb-message" rows="5" maxlength="4000" placeholder="Що сподобалось, що заважає або яку функцію хотілось би…"></textarea>
        </label>
        <p class="faint" style="margin:6px 0 0;font-size:12px">${esc(faq.feedbackHint || "")}</p>
        <div class="row" style="justify-content:flex-end;margin-top:12px;gap:8px">
          <button type="button" class="btn btn-primary" id="fb-send">Надіслати</button>
        </div>
      </div>

      <button class="btn btn-ghost btn-sm" id="faq-back" type="button" style="margin-top:12px">← Назад до інформації</button>`;

    const back = $("#faq-back");
    if (back) back.onclick = () => go("info");
    const send = $("#fb-send");
    if (send) {
      send.onclick = async () => {
        const kind = ($("#fb-kind") && $("#fb-kind").value) || "feedback";
        const message = ($("#fb-message") && $("#fb-message").value || "").trim();
        if (message.length < 5) {
          toast(faq.feedbackHint || "Напиши трохи докладніше", "warn");
          return;
        }
        send.disabled = true;
        const res = await S.submitFeedback({
          kind,
          message,
          name: (S.state.profile && S.state.profile.name) || null
        });
        send.disabled = false;
        if (!res.ok) {
          const map = {
            message_too_short: "Напиши трохи докладніше",
            message_too_long: "Повідомлення задовге",
            db_missing: "Сервер ще не готовий прийняти відгук. Напиши пізніше або на email підтримки.",
            db_error: "Не вдалося зберегти. Спробуй ще раз.",
            offline: "Потрібен інтернет і вхід в акаунт",
            network: "Немає з’єднання"
          };
          toast(map[res.error] || "Не вдалося надіслати", "warn");
          return;
        }
        if ($("#fb-message")) $("#fb-message").value = "";
        toast(faq.feedbackThanks || "Дякуємо за повідомлення", "good");
      };
    }
  }

  async function viewAdmin() {
    const p = S.state.profile || {};
    const allowed = S.isAdminEmail(p.email);
    $("#view").innerHTML = `
      <div class="page-head">
        <h1>Адмін-панель</h1>
        <p>Службова статистика сервісу. Тексти щоденників тут не показуються.</p>
      </div>
      <div class="card" id="admin-body"><p class="muted">Завантаження…</p></div>
      <button class="btn btn-ghost btn-sm" id="admin-back" type="button" style="margin-top:12px">← До профілю</button>`;
    const back = $("#admin-back");
    if (back) back.onclick = () => go("profile");

    if (!allowed && !(window.SPOKIY_CONFIG && window.SPOKIY_CONFIG.admin)) {
      $("#admin-body").innerHTML = `
        <p class="muted">Цей розділ лише для адміністратора.</p>
        <p class="faint" style="margin-top:8px;font-size:12.5px;line-height:1.45">
          Увійди з email власника або додай свій email у <code>api/admin-emails.js</code>
          і в Vercel → <code>ADMIN_EMAILS</code>, потім онови сторінку.
        </p>`;
      return;
    }

    const res = await S.fetchAdminOverview();
    if (!res.ok) {
      $("#admin-body").innerHTML = `
        <p class="muted">Не вдалося відкрити адмінку (${esc(res.error || "помилка")}).</p>
        <p class="faint" style="margin-top:8px;font-size:12.5px;line-height:1.45">
          Перевір, що твій email є в списку адмінів на сервері, і що ти онлайн.
        </p>`;
      return;
    }

    const st = res.stats || {};
    const users = Array.isArray(res.users) ? res.users : [];
    const admins = Array.isArray(res.admins) ? res.admins : [];
    const helperErr = (code) => ({
      bad_email: "Введи коректну пошту",
      already_owner: "Ця пошта вже власник",
      already_helper: "Ця пошта вже в списку помічників",
      cannot_remove_owner: "Власника прибрати не можна",
      db_error: "Не вдалося зберегти в базі. Можливо, ще немає таблиці admin_helpers у Supabase.",
      network: "Немає з’єднання"
    }[code] || code || "Помилка");

    $("#admin-body").innerHTML = `
      <p class="faint" style="margin:0 0 12px;font-size:12px">Акаунт: ${esc(res.admin || p.email || "")}</p>
      <div class="admin-stats">
        <div class="admin-stat"><b>${st.usersTotal ?? "—"}</b><span>користувачів</span></div>
        <div class="admin-stat"><b>${st.telegramLinked ?? "—"}</b><span>Telegram</span></div>
        <div class="admin-stat"><b>${st.diaryEntries ?? "—"}</b><span>записів</span></div>
        <div class="admin-stat"><b>${st.activeLast7Days ?? "—"}</b><span>активні за 7 днів</span></div>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin:12px 0">
        <span class="pill ${st.supabase ? "pill-green" : "pill-red"}">Supabase ${st.supabase ? "ok" : "ні"}</span>
        <span class="pill ${st.telegramBot ? "pill-green" : "pill-violet"}">Бот ${st.telegramBot ? "налаштований" : "вимкнений"}</span>
      </div>
      ${res.note ? `<p class="faint" style="font-size:12.5px;margin:0 0 12px">${esc(res.note)}</p>` : ""}

      <div class="card-title" style="margin-top:8px">Помічники адміна</div>
      <p class="muted" style="margin:0 0 10px;font-size:13px;line-height:1.45">
        Додай пошту людини, яка матиме доступ до цієї панелі. Вона має увійти на сайт із цієї пошти.
      </p>
      <div class="admin-helper-add row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <input type="email" id="admin-helper-email" class="quick-input" placeholder="email@example.com" style="flex:1;min-width:180px" />
        <button type="button" class="btn btn-primary btn-sm" id="admin-helper-add">Додати</button>
      </div>
      <div class="admin-helper-list" id="admin-helper-list">
        ${admins.length ? admins.map((a) => `
          <div class="admin-user-row">
            <div>
              <b>${esc(a.email)}</b>
              <div class="faint" style="font-size:12px">${a.role === "owner" ? "Власник" : "Помічник"}${a.addedBy ? " · додав(ла) " + esc(a.addedBy) : ""}</div>
            </div>
            <div class="admin-user-meta">
              ${a.locked
                ? `<span class="pill pill-violet">закріплено</span>`
                : `<button type="button" class="btn btn-ghost btn-sm" data-remove-helper="${esc(a.email)}">Прибрати</button>`}
            </div>
          </div>`).join("") : `<p class="analytics-none">Поки лише ти в списку</p>`}
      </div>

      <div class="card-title" style="margin-top:18px">Останні акаунти</div>
      <div class="admin-user-list">
        ${users.length ? users.map((u) => `
          <div class="admin-user-row">
            <div>
              <b>${esc(u.name || "—")}</b>
              <div class="faint" style="font-size:12px">${esc(u.email)}</div>
            </div>
            <div class="admin-user-meta">
              ${u.telegram ? `<span class="pill pill-green">TG</span>` : ""}
              <span class="faint">${u.updatedAt ? fmtDateTime(u.updatedAt) : "—"}</span>
            </div>
          </div>`).join("") : `<p class="analytics-none">Поки немає даних</p>`}
      </div>

      <div class="card-title" style="margin-top:18px">Відгуки та побажання</div>
      <div id="admin-feedback-list"><p class="muted">Завантаження…</p></div>

      <button class="btn btn-ghost btn-sm" id="admin-refresh" type="button" style="margin-top:12px">Оновити</button>`;

    const refresh = $("#admin-refresh");
    if (refresh) refresh.onclick = () => viewAdmin();

    const kindLabel = { feedback: "Відгук", wish: "Побажання", bug: "Помилка", other: "Інше" };
    S.fetchFeedbackAdmin(30).then((fb) => {
      const box = $("#admin-feedback-list");
      if (!box) return;
      if (!fb.ok) {
        box.innerHTML = `<p class="faint" style="font-size:12.5px;line-height:1.45">
          ${fb.error === "db_missing"
            ? "Таблиця site_feedback ще не створена в Supabase. Запусти supabase/site_feedback.sql."
            : "Не вдалося завантажити відгуки (" + esc(fb.error || "помилка") + ")."}
        </p>`;
        return;
      }
      const items = Array.isArray(fb.items) ? fb.items : [];
      box.innerHTML = items.length ? items.map((it) => `
        <div class="admin-feedback-row">
          <div class="admin-feedback-top">
            <span class="pill pill-violet">${esc(kindLabel[it.kind] || it.kind || "Відгук")}</span>
            <span class="faint">${it.createdAt ? fmtDateTime(it.createdAt) : "—"}</span>
          </div>
          <p class="admin-feedback-msg">${esc(it.message || "")}</p>
          <div class="faint" style="font-size:12px">${esc(it.name || "—")} · ${esc(it.email || "")}</div>
        </div>`).join("") : `<p class="analytics-none">Поки немає відгуків</p>`;
    });

    const addBtn = $("#admin-helper-add");
    const emailInp = $("#admin-helper-email");
    if (addBtn && emailInp) {
      const doAdd = async () => {
        const email = emailInp.value.trim();
        if (!email) { toast("Введи пошту помічника", "warn"); return; }
        addBtn.disabled = true;
        const out = await S.addAdminHelper(email);
        addBtn.disabled = false;
        if (!out.ok) {
          toast(helperErr(out.error), "warn");
          return;
        }
        toast("Помічника додано ✅", "good");
        viewAdmin();
      };
      addBtn.onclick = doAdd;
      emailInp.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
    }
    $$("[data-remove-helper]", $("#admin-body")).forEach((b) => {
      b.onclick = () => confirmModal(
        "Прибрати помічника?",
        "Ця пошта більше не матиме доступу до адмін-панелі.",
        async () => {
          const out = await S.removeAdminHelper(b.dataset.removeHelper);
          if (!out.ok) {
            toast(helperErr(out.error), "warn");
            return;
          }
          toast("Помічника прибрано", "good");
          viewAdmin();
        },
        "Прибрати",
        true
      );
    });
  }

  /* ===================== ТЕМА (день / ніч) ===================== */
  const THEME_KEY = "spokiy:theme";
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    refreshSongBar();
  }
  function themeToggleHTML() {
    const dark = currentTheme() === "dark";
    return `<button class="theme-toggle" id="theme-toggle" title="Змінити тему">
      <span class="tt-ico">${dark ? "☀️" : "🌙"}</span><span>${dark ? "День" : "Ніч"}</span>
    </button>`;
  }

  /* ===================== МУЗИКА НАСТРОЮ ===================== */
  function randomSong(exclude) {
    const list = C.SONGS || [];
    if (list.length <= 1) return list[0] || "";
    let s;
    do { s = list[Math.floor(Math.random() * list.length)]; } while (s === exclude);
    return s;
  }
  function currentSongText() {
    if (!songCurrent) songCurrent = randomSong();
    return songCurrent;
  }
  function switchSong(dir = 1) {
    const list = C.SONGS || [];
    if (!list.length) return;
    let idx = list.indexOf(currentSongText());
    if (idx < 0) idx = 0;
    songCurrent = list[(idx + dir + list.length) % list.length];
    refreshSongBar();
  }
  function openSongSearch() {
    window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(currentSongText()), "_blank");
  }
  function songBarHTML() {
    const song = currentSongText();
    return `
      <div class="song-bar" id="song-bar" data-tour="music">
        <span class="song-ico">♪</span>
        <div class="song-main">
          <div class="song-label">Рекомендована позитивна іноземна музика</div>
          <div class="song-name" id="song-name">${esc(song)}</div>
        </div>
        <div class="song-actions">
          <button class="song-btn ghost song-round" id="song-prev" title="Попередня рекомендація">‹</button>
          <button class="song-btn" id="song-listen" title="Знайти й послухати">Слухати</button>
          <button class="song-btn ghost song-round" id="song-next" title="Наступна рекомендація">›</button>
          ${themeToggleHTML()}
        </div>
      </div>`;
  }
  function wireSongBar() {
    const prev = $("#song-prev");
    if (prev) prev.onclick = () => switchSong(-1);
    const listen = $("#song-listen");
    if (listen) listen.onclick = openSongSearch;
    const next = $("#song-next");
    if (next) next.onclick = () => switchSong(1);
    const theme = $("#theme-toggle");
    if (theme) theme.onclick = toggleTheme;
  }
  function refreshSongBar() {
    const view = $("#view");
    const bars = view ? $$(".song-bar", view) : $$(".song-bar");
    if (!bars.length) { mountSongBar(); return; }
    // Залишити одну смугу, оновити її вміст
    bars.slice(1).forEach((el) => el.remove());
    bars[0].outerHTML = songBarHTML();
    wireSongBar();
  }
  function mountSongBar() {
    const view = $("#view");
    if (!view) return;
    const bars = $$(".song-bar", view);
    if (bars.length) {
      bars.slice(1).forEach((el) => el.remove());
      const bar = bars[0];
      if (bar && !bar.id) bar.id = "song-bar";
      if (bar && !bar.getAttribute("data-tour")) bar.setAttribute("data-tour", "music");
      wireSongBar();
      return;
    }
    view.insertAdjacentHTML("afterbegin", songBarHTML());
    wireSongBar();
  }
  function openSongModal() {
    const cur = (S.state.settings.songReminder || "").trim();
    openModal(`
      <h2>♪ Моя пісня настрою</h2>
      <p class="muted" style="margin:0 0 12px;line-height:1.55">Запиши пісню, що завжди підіймає тобі настрій. Вона з'являтиметься вгорі — щоб захотілося її ввімкнути.</p>
      <label class="field"><span>Пісня та виконавець</span>
        <input id="song-input" type="text" value="${esc(cur)}" placeholder="для музики яка підіймає настрій" />
      </label>
      <div class="row" style="justify-content:flex-end;margin-top:16px;gap:8px">
        ${cur ? `<button class="btn btn-ghost" id="song-del">Прибрати</button>` : ""}
        <button class="btn btn-primary" id="song-save">Зберегти</button>
      </div>`);
    const inp = $("#song-input");
    setTimeout(() => inp && inp.focus(), 60);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") $("#song-save").click(); });
    $("#song-save").onclick = () => {
      const v = $("#song-input").value.trim();
      S.state.settings.songReminder = v; S.save(); closeModal(); refreshSongBar();
      if (v) toast("Твоя пісня тепер вгорі 🎶", "good");
    };
    const del = $("#song-del");
    if (del) del.onclick = () => { S.state.settings.songReminder = ""; S.save(); closeModal(); refreshSongBar(); };
  }

  function pendingReminders() {
    const tk = todayKey();
    return activeEntries().filter(e => !e.reviewed && e.openDate && e.openDate <= tk);
  }

  function renderNav() {
    const nav = $("#nav");
    let html = "";
    let metaStarted = false;
    NAV.forEach((n) => {
      if (n.meta && !metaStarted) {
        metaStarted = true;
        html += `<div class="nav-divider" role="separator" aria-hidden="true"><span>Довідка</span></div>`;
      }
      const active = navItemActive(n.id);
      const cls = "nav-item"
        + (active ? " active" : "")
        + (n.action ? " nav-sos" : "")
        + (n.meta ? " nav-meta" : "");
      html += `<button class="${cls}" data-route="${n.id}" data-tour="nav-${n.id}" type="button">
        <span class="ico">${n.icon}</span><span>${uiText(genderize(n.label))}</span></button>`;
    });
    nav.innerHTML = html;
    $$(".nav-item", nav).forEach(b => b.onclick = () => {
      closeSidebar();
      if (b.dataset.route === "sos") { startCalm("quick"); return; }
      go(b.dataset.route);
    });
    genderizeDOM(nav);

    const p = S.state.profile;
    const initials = (p.name || p.email || "?").trim().charAt(0).toUpperCase();
    const chip = $("#user-chip");
    if (chip) {
      chip.setAttribute("data-tour", "nav-profile");
      chip.innerHTML = `
        <div class="user-avatar">${esc(initials)}</div>
        <div class="user-meta"><b>${esc(p.name || "Користувач")}</b><span>${esc(p.email)}</span></div>`;
      chip.onclick = () => { closeSidebar(); go("profile"); };
    }

    renderBottomNav();
  }

  function renderBottomNav() {
    const bar = $("#bottom-nav");
    if (!bar) return;
    bar.innerHTML = BOTTOM_NAV.map(n => {
      const active = n.action ? false : navItemActive(n.id);
      const cls = "bottom-nav-item" + (active ? " active" : "") + (n.action ? " bottom-nav-sos" : "");
      return `<button class="${cls}" type="button" data-route="${n.id}" data-tour="bn-${n.id}">
        <span class="bn-ico">${n.icon}</span><span class="bn-lbl">${uiText(genderize(n.label))}</span></button>`;
    }).join("");
    $$(".bottom-nav-item", bar).forEach(b => b.onclick = () => {
      if (b.dataset.route === "sos") { startCalm("quick"); return; }
      go(b.dataset.route);
    });
    genderizeDOM(bar);
  }

  function navItemActive(id) {
    if (id === "support") return SUPPORT_ROUTES.includes(route);
    if (id === "info") return INFO_ROUTES.includes(route);
    return route === id;
  }

  function needsRecoverySelect() {
    if (!S.state || !S.state.profile) return false;
    return !S.getRecovery().recoverySymbolId;
  }

  function syncRecoveryGateChrome() {
    const app = $("#app");
    if (!app) return;
    app.classList.toggle("app--recovery-gate", route === "recoverySelect");
  }

  function go(r, param = null) {
    if (needsRecoverySelect() && r !== "recoverySelect") {
      r = "recoverySelect";
      param = null;
    }
    const leaveNew = route === "new" && r !== "new";
    if (leaveNew && window.Safeguard && Safeguard.hasUnsaved()) {
      confirmModal(
        "Незбережені зміни",
        "У вас є незбережені зміни. Ви дійсно хочете залишити сторінку?",
        () => applyGo(r, param),
        "Залишити"
      );
      return;
    }
    applyGo(r, param);
  }

  function applyGo(r, param = null) {
    const prevRoute = route;
    route = r; routeParam = param;
    const title = ROUTE_TITLES[r] || NAV.find(n => n.id === r)?.label || "Спокій";
    $("#topbar-title").textContent = uiText(genderize(title));
    syncRecoveryGateChrome();
    renderNav();
    render();
    if (window.Safeguard) Safeguard.setEditingRoute(r === "new");
    if (r === "analytics" && prevRoute !== "analytics" && S.refreshFromCloud) {
      S.refreshFromCloud().catch(() => {});
    }
    $("#view").scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }

  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); }

  /* ===================== Аналітика-обчислення ===================== */
  function dayKeyFromIso(iso) {
    if (!iso) return todayKey();
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return dayKeyLocal(d);
  }

  function isArchivedEntry(e) { return !!(e && e.archived); }
  function activeEntries() { return (S.state.entries || []).filter(e => !isArchivedEntry(e)); }
  function shadowedEntries() {
    return (S.state.entries || [])
      .filter(isArchivedEntry)
      .sort((a, b) => Date.parse(b.archivedAt || b.updatedAt || 0) - Date.parse(a.archivedAt || a.updatedAt || 0));
  }

  /** Тривога 1–10 з wellbeing (сайт). Telegram раніше писав mood×2 — нормалізуємо. */
  function wellbeingAnxiety(wbEntry) {
    if (!wbEntry || typeof wbEntry.level !== "number") return null;
    if (wbEntry.source === "telegram" && wbEntry.scale !== "anxiety") {
      // legacy: mood×2 (більше = краще) → anxiety
      return Math.max(1, Math.min(10, 11 - wbEntry.level));
    }
    return wbEntry.level;
  }

  /** Унікальні дні з активністю: запис, оцінка стану, ритуал (сайт/Telegram) або check-in */
  function activityDayKeys() {
    const keys = new Set();
    activeEntries().forEach(e => {
      if (e.createdAt) keys.add(dayKeyFromIso(e.createdAt));
      if (e.dayKey) keys.add(String(e.dayKey).slice(0, 10));
    });
    const wb = S.state.wellbeing;
    if (wb && !Array.isArray(wb)) Object.keys(wb).forEach(k => keys.add(k));
    Object.keys(S.state.checkins || {}).forEach(k => keys.add(k));
    const rituals = S.state.rituals || {};
    Object.keys(rituals).forEach((k) => {
      const day = rituals[k];
      if (day && (day.morning || day.midday || day.evening || day.now)) keys.add(k);
    });
    return [...keys].sort();
  }

  function telegramCheckinStats() {
    const rituals = S.state.rituals || {};
    let marks = 0;
    let notes = 0;
    const days = new Set();
    Object.keys(rituals).forEach((k) => {
      const day = rituals[k] || {};
      ["morning", "midday", "evening", "now"].forEach((type) => {
        const r = day[type];
        if (!r) return;
        if (r.source === "telegram" || r.note || r.value != null || r.mood) {
          if (r.source === "telegram") {
            marks++;
            days.add(k);
            if (r.note) notes++;
          }
        }
      });
    });
    activeEntries().forEach((e) => {
      if (e && e.source === "telegram") {
        marks++;
        if (e.dayKey) days.add(String(e.dayKey).slice(0, 10));
        else if (e.createdAt) days.add(dayKeyFromIso(e.createdAt));
      }
    });
    return { marks, notes, days: days.size };
  }

  /** Рівень напруги 1–10 з ритуалу/Telegram (value 1–5 або mood id). */
  function ritualTensionLevel(ritual) {
    if (!ritual) return null;
    let v = ritual.value != null ? Number(ritual.value) : null;
    if (v == null || Number.isNaN(v)) {
      const map = { great: 5, very_good: 5, good: 4, ok: 3, anxious: 2, hard: 1 };
      if (ritual.mood && Object.prototype.hasOwnProperty.call(map, ritual.mood)) v = map[ritual.mood];
    }
    if (v == null || Number.isNaN(v)) return null;
    return Math.max(1, Math.min(10, Math.round(11 - v * 2)));
  }

  function ritualDayTension(dayKey) {
    const day = (S.state.rituals || {})[dayKey];
    if (!day) return null;
    let best = null;
    ["morning", "midday", "evening", "now"].forEach((type) => {
      const level = ritualTensionLevel(day[type]);
      if (level == null) return;
      best = best == null ? level : Math.max(best, level);
    });
    return best;
  }

  function computeStreak() {
    const keys = new Set(activityDayKeys());
    let streak = 0;
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    if (!keys.has(dayKeyLocal(d))) d.setDate(d.getDate() - 1);
    while (keys.has(dayKeyLocal(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function filledDays() { return activityDayKeys().length; }

  function totalDiaryEntries() {
    return activeEntries().filter(e => e.type !== "letter").length;
  }

  function last7DayLevels() {
    const anxietyByDay = {};
    activeEntries().forEach(e => {
      if (typeof e.anxiety !== "number") return;
      const k = e.dayKey ? String(e.dayKey).slice(0, 10) : dayKeyFromIso(e.createdAt);
      anxietyByDay[k] = Math.max(anxietyByDay[k] || 0, e.anxiety);
    });
    const wb = S.state.wellbeing && !Array.isArray(S.state.wellbeing) ? S.state.wellbeing : {};
    const wd = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const k = dayKeyLocal(d);
      const ritualLvl = ritualDayTension(k);
      const wbLvl = wellbeingAnxiety(wb[k]);
      // Ритуал/Telegram mood — пріоритетніше за сирий wellbeing, щоб не плутати шкалу
      const level = anxietyByDay[k]
        ?? (ritualLvl != null ? ritualLvl : null)
        ?? wbLvl;
      out.push({ key: k, level, label: wd[d.getDay()] });
    }
    return out;
  }

  function topCounts(arr, n = 3) {
    const m = {};
    arr.filter(Boolean).forEach(v => { const k = v.trim(); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  function avgAnxiety(entries) {
    const v = entries.filter(e => typeof e.anxiety === "number");
    return v.length ? +(v.reduce((s, e) => s + e.anxiety, 0) / v.length).toFixed(1) : null;
  }
  function entriesInLastDays(days) {
    const since = Date.now() - days * 86400000;
    return activeEntries().filter(e => new Date(e.createdAt).getTime() >= since);
  }

  /* Червоні прапорці: 5 днів поспіль з тривогою 8-10 (за останніми днями) */
  function checkRedFlag() {
    const byDay = {};
    activeEntries().forEach(e => {
      if (typeof e.anxiety !== "number") return;
      const k = e.dayKey ? String(e.dayKey).slice(0, 10) : dayKeyFromIso(e.createdAt);
      byDay[k] = Math.max(byDay[k] || 0, e.anxiety);
    });
    const days = Object.keys(byDay).sort().reverse();
    if (days.length < 5) return false;
    let consec = 0, prev = null;
    for (const k of days) {
      if (prev === null || daysBetween(k, prev) === 1) {
        if (byDay[k] >= 8) consec++; else break;
      } else break;
      prev = k;
    }
    return consec >= 5;
  }

  /* ===================== Досягнення ===================== */
  function checkAchievements(silent = false) {
    const newly = [];
    const streak = computeStreak();
    const ev = S.state.evidence.length;
    const letters = activeEntries().some(e => e.type === "letter");
    const filled = filledDays();
    const map = {
      streak7: streak >= 7, streak14: streak >= 14, streak30: streak >= 30,
      firstEvidence: ev >= 1, evidence10: ev >= 10,
      firstLetter: letters, firstMonth: filled >= 30
    };
    for (const id in map) if (map[id] && S.unlock(id)) newly.push(id);
    if (!silent && newly.length) {
      newly.forEach(id => {
        const a = C.ACHIEVEMENTS.find(x => x.id === id);
        toast(`🎉 Досягнення: <b>${a.title}</b> — ${a.desc}`, "celebrate", 6000);
      });
      confetti();
    }
    return newly;
  }

  /* ===================== Спільні UI-компоненти ===================== */
  function scaleField(name, max, value, cls = "") {
    let html = `<div class="scale ${cls}" data-scale="${name}">`;
    for (let i = 1; i <= max; i++) html += `<button type="button" data-v="${i}" class="${value === i ? "sel" : ""}">${i}</button>`;
    html += `</div>`;
    return html;
  }
  function wireScale(root, name, onPick) {
    const wrap = $(`[data-scale="${name}"]`, root);
    if (!wrap) return;
    $$("button", wrap).forEach(b => b.onclick = () => {
      $$("button", wrap).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); onPick(+b.dataset.v);
    });
  }

  function emptyBlock(icon, text) {
    return `<div class="empty"><div class="em-ico">${icon}</div><div>${esc(text)}</div></div>`;
  }

  function wellbeingLabel(level) {
    if (level >= 8) return "дуже тривожно";
    if (level >= 7) return "висока тривога";
    if (level >= 5) return "помірна напруга";
    if (level >= 3) return "спокійніше за середнє";
    return "спокійно";
  }

  function homeWellbeingCard() {
    const today = S.todayWellbeing();
    const level = today ? today.level : null;
    const song = currentSongText();
    const angle = level == null ? -90 : -90 + ((level - 1) / 9) * 180;
    const meterLabel = level == null ? "обери рівень" : wellbeingLabel(level);
    const scale = Array.from({ length: 10 }, (_, i) => {
      const v = i + 1;
      return `<button class="well-btn ${level === v ? "sel" : ""}" data-well="${v}">${v}</button>`;
    }).join("");
    let recommendation = `
      <div class="well-result muted">
        Обери рівень на спідометрі: <b>1</b> — майже спокійно, <b>10</b> — напруга на максимумі. Це не тест, а швидкий замір стану.
      </div>`;

    if (level != null && level >= 7) {
      recommendation = `
        <div class="well-result high">
          <b>Схоже, напруга зараз висока.</b>
          <p>Не потрібно розбирати все одразу. Спершу стабілізуй нервову систему, а потім можна пройти м'який тест про тип тривоги.</p>
          <div class="row" style="gap:8px;margin-top:10px">
            <button class="btn btn-primary btn-sm" id="well-types">Перейти до тестів</button>
            <button class="btn btn-ghost btn-sm" id="well-sos">SOS-заспокоєння</button>
          </div>
        </div>`;
    } else if (level != null && level <= 4) {
      recommendation = `
        <div class="well-result calm">
          <b>Сьогодні стан досить спокійний.</b>
          <p>Увімкни музику, яка піднімає настрій, і зафіксуй щось приємне. Гарний день можна зробити ще кращим маленькими теплими ситуаціями — це стане опорою проти майбутніх тривог.</p>
          <div class="song-mini">
            <span>Рекомендація:</span><b>${esc(song)}</b>
            <button class="btn btn-ghost btn-sm" id="well-player">Слухати</button>
          </div>
          <div class="row" style="gap:8px;margin-top:10px">
            <input id="good-home-input" class="quick-input" placeholder="Що приємного або цікавого сьогодні сталося?" />
            <button class="btn btn-primary btn-sm" id="good-home-save">Зберегти</button>
          </div>
        </div>`;
    } else if (level != null) {
      recommendation = `
        <div class="well-result mid">
          <b>Стан середній: ${esc(wellbeingLabel(level))}.</b>
          <p>Можна обрати один маленький крок: записати думку, увімкнути музику або зберегти приємну подію дня.</p>
          <div class="row" style="gap:8px;margin-top:10px">
            <input id="good-home-input" class="quick-input" placeholder="Маленька хороша подія сьогодні..." />
            <button class="btn btn-primary btn-sm" id="good-home-save">Зберегти</button>
            <button class="btn btn-ghost btn-sm" id="well-player">Слухати музику</button>
          </div>
        </div>`;
    }

    return `
      <div class="card wellbeing-card">
        <div class="row spread" style="align-items:flex-start;gap:12px">
          <div>
            <div class="card-title" style="margin:0">Спідометр напруги</div>
            <p class="muted" style="margin:6px 0 0">Швидко виміряй рівень тривоги й напруги перед будь-якими практиками.</p>
          </div>
          ${level != null ? `<span class="pill ${level >= 7 ? "pill-red" : level <= 4 ? "pill-green" : "pill-warn"}">${level}/10 · ${esc(wellbeingLabel(level))}</span>` : ""}
        </div>
        <div class="tension-meter ${level == null ? "meter-empty" : ""}" style="--needle-angle:${angle}deg">
          <div class="meter-arc">
            <div class="meter-needle"></div>
            <div class="meter-hub"></div>
            <div class="meter-value">
              <strong>${level == null ? "—" : level}</strong>
              <span>${esc(meterLabel)}</span>
            </div>
          </div>
          <div class="meter-labels"><span>1 · спокій</span><span>10 · максимум</span></div>
        </div>
        <div class="well-scale meter-scale">${scale}</div>
        ${recommendation}
        <div class="row" style="justify-content:flex-end;margin-top:12px">
          <button class="btn btn-ghost btn-sm" id="well-good">Хороші події та календар</button>
        </div>
      </div>`;
  }

  function wireWellbeingCard() {
    $$(".well-btn", $("#view")).forEach(b => b.onclick = () => {
      S.setWellbeing(+b.dataset.well);
      render();
    });
    const types = $("#well-types"); if (types) types.onclick = () => go("types");
    const sos = $("#well-sos"); if (sos) sos.onclick = () => startCalm("quick");
    const player = $("#well-player"); if (player) player.onclick = openSongSearch;
    const good = $("#well-good"); if (good) good.onclick = () => go("good");
    const save = $("#good-home-save");
    if (save) save.onclick = () => {
      const input = $("#good-home-input");
      const text = input.value.trim();
      if (!text) { toast("Напиши хоча б одну приємну подію", "warn"); return; }
      S.addGoodEvent(text);
      input.value = "";
      toast("Збережено в хороші події 🙂", "good");
      render();
    };
  }

  /* ===================== ГОЛОВНА (СЬОГОДНІ) ===================== */
  function monthRouteInfo() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${y}-${m}`;
    const day = now.getDate();
    const daysInMonth = new Date(y, now.getMonth() + 1, 0).getDate();
    const monthDays = activityDayKeys().filter(k => k.startsWith(prefix)).length;
    return { day, daysInMonth, monthDays, pct: Math.min(100, Math.round((monthDays / day) * 100)) };
  }

  function weekDynamics() {
    return last7DayLevels().map(d => ({ ...d, label: d.key.slice(8) }));
  }

  function lastUnfinishedTask() {
    const draft = S.getDraft();
    if (draft && (draft.fear || draft.cause)) {
      return { kind: "draft", title: "Незавершений запис дня", text: (draft.fear || draft.cause || "").slice(0, 72), action: () => go("new") };
    }
    const pend = pendingReminders();
    if (pend.length) {
      return { kind: "reminder", title: "Час відкрити запис", text: (pend[0].fear || "").slice(0, 72), action: () => go("reminders") };
    }
    if (testState && testState.typeId) {
      return { kind: "test", title: "Незавершений розбір", text: "Тест типу тривоги ще не завершено", action: () => go("typeTest", testState.typeId) };
    }
    return null;
  }

  function selfSupportMomentsCount() {
    const reviewed = activeEntries().filter(e => e.reviewed).length;
    const evidence = S.state.evidence.length;
    const achievements = Object.keys(S.state.achievements || {}).length;
    const wellbeingDays = S.state.wellbeing && !Array.isArray(S.state.wellbeing) ? Object.keys(S.state.wellbeing).length : 0;
    return reviewed + evidence + achievements + wellbeingDays;
  }

  function continueHomeAction() {
    const task = lastUnfinishedTask();
    if (task) { task.action(); return; }
    // Якщо є рекомендований крок догляду — спочатку він (м’яко, без примусу).
    const practice = dailyPracticeStatus();
    const next = practice.items.find((x) => !x.done);
    if (next) {
      openPracticeStep(next.id);
      return;
    }
    const last = activeEntries()[0];
    if (last && !last.reviewed) { go("history"); return; }
    go("new");
  }

  /** Відкрити ритуал за часом доби (не вечір о 14:00). */
  function openRecommendedRitual() {
    if (!window.Rituals) return;
    const h = new Date().getHours();
    if (h < 12) {
      Rituals.openMorning();
      return;
    }
    if (h < 18) {
      if (typeof Rituals.shouldShowMidday === "function" && Rituals.shouldShowMidday()) {
        Rituals.openMidday();
        return;
      }
      if (typeof Rituals.shouldShowMorning === "function" && Rituals.shouldShowMorning()) {
        Rituals.openMorning();
        return;
      }
      // Вдень без ранкового ритуалу — короткий check-in, не вечірній розбір.
      Rituals.openMidday();
      return;
    }
    Rituals.openEvening();
  }

  function openPracticeStep(id) {
    if (id === "ritual") openRecommendedRitual();
    else if (id === "diary") go("new");
    else if (id === "breath") startCalm("quick");
    else if (id === "gratitude") go("gratitude");
  }

  function practiceChipLabel(item) {
    if (item.id === "ritual") return "Ритуал";
    if (item.id === "diary") return "Щоденник";
    if (item.id === "breath") return "Дихання";
    if (item.id === "gratitude") return "Вдячність";
    return item.title;
  }

  function todayNextStepHint(practice) {
    if (!practice) return "";
    if (practice.complete) {
      return "Сьогодні деревце вже отримало повний догляд. Можна просто побути з собою.";
    }
    const next = practice.items.find((x) => !x.done);
    if (!next) return "";
    return "Сьогодні можна почати з: «" + practiceChipLabel(next) + "». Це рекомендація, не обов’язок.";
  }

  function weekBarsHTML(days) {
    return `<div class="week-bars">${days.map(d => {
      const h = d.level == null ? 8 : Math.max(12, Math.round((d.level / 10) * 100));
      const cls = d.level == null ? "empty" : d.level >= 7 ? "high" : d.level <= 4 ? "low" : "mid";
      return `<div class="week-bar-col" title="${d.level == null ? "немає запису" : d.level + "/10"}">
        <i class="week-bar-fill ${cls}" style="height:${h}%"></i><span>${d.label}</span></div>`;
    }).join("")}</div>`;
  }

  /** Тон комунікації: збережений у settings, інакше стиль символу, інакше стать. */
  function communicationTone() {
    const stored = S.getCommunicationTone ? S.getCommunicationTone() : null;
    const rec = S.getRecovery();
    const sym = rec.recoverySymbolId ? C.getRecoverySymbolById(rec.recoverySymbolId) : null;
    const gender = S.state && S.state.profile ? S.state.profile.gender : null;
    return C.resolveCommunicationTone(stored, gender, sym && sym.visualStyle);
  }

  function recoverySymbolSvg(id, opts) {
    if (window.RecoveryArt && typeof window.RecoveryArt.svg === "function") {
      return window.RecoveryArt.svg(id, opts || {});
    }
    const common = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg ${common} stroke-width="1.5"><circle cx="40" cy="40" r="18"/><path d="M40 58V28"/></svg>`;
  }

  function wireRecoveryArt(root, opts) {
    if (!root || !window.RecoveryArt) return;
    const art = root.querySelector(".recovery-home-art, .recovery-card-art") || root;
    RecoveryArt.bindPress(art);
    RecoveryArt.observeVisibility(art);
    if (opts && opts.stage != null) RecoveryArt.setStage(art, opts.stage);
  }

  function dailyPracticeStatus() {
    const ritualToday = !!(window.Rituals && (() => {
      try {
        const t = Store.state && Store.state.rituals && Store.state.rituals[todayKey()];
        return t && (t.morning || t.evening);
      } catch (e) { return false; }
    })());
    return C.getDailyPracticeStatus({
      hasAward: (action) => !!(S.hasRecoveryAwardToday && S.hasRecoveryAwardToday(action)),
      hasRitualToday: ritualToday
    });
  }

  function openPracticeGuide() {
    const status = dailyPracticeStatus();
    const next = status.items.find((x) => !x.done);
    openModal(`
      <h2>Путівник турботи про деревце</h2>
      <p class="muted" style="margin:0 0 14px;line-height:1.55">
        Це <b>рекомендований</b> порядок на сьогодні, не обов’язок. Можна пропустити крок або змінити послідовність —
        деревце росте від турботи, а не від ідеальності.
      </p>
      ${next ? `<p class="practice-next-banner">Зараз зручно почати з кроку «${esc(practiceChipLabel(next))}»</p>` : ""}
      <div class="practice-guide-list">
        ${status.items.map((item, i) => `
          <div class="practice-guide-item ${item.done ? "is-done" : ""}">
            <div class="practice-guide-num">${item.done ? "✓" : (i + 1)}</div>
            <div>
              <b>${esc(item.title)}</b>
              <p>${esc(item.desc)}</p>
              <span class="practice-guide-state">${item.done
                ? "Сьогодні вже є"
                : "Рекомендовано сьогодні"}</span>
            </div>
          </div>`).join("")}
      </div>
      <p class="muted" style="margin:16px 0 0;line-height:1.5;font-size:13.5px">
        Вдячність у ранковому чи вечірньому ритуалі також рахується. Якщо зробиш усі чотири кроки — деревце отримає повний догляд. Якщо ні — теж добре: завтра можна продовжити.
      </p>
      <div class="row" style="justify-content:flex-end;margin-top:14px;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-close type="button">Зрозуміло</button>
        <button class="btn btn-primary btn-sm" id="practice-guide-start" type="button">${next ? "Почати з цього кроку" : "Добре"}</button>
      </div>`);
    const start = $("#practice-guide-start");
    if (start) start.onclick = () => {
      closeModal();
      if (!next) return;
      openPracticeStep(next.id);
    };
  }

  function maybeCelebratePracticeComplete() {
    const status = dailyPracticeStatus();
    if (!status.complete) return;
    const key = "spokiy:practice-complete:" + todayKey();
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch (e) {}
    toast("Сьогодні деревце отримало повний догляд. Дякуємо за турботу 🌿", "good", 4800);
  }

  function recoveryHomeBlockHTML() {
    const rec = S.getRecovery();
    if (!rec.recoverySymbolId) return "";
    const symbol = C.getRecoverySymbolById(rec.recoverySymbolId);
    if (!symbol) return "";
    const tone = communicationTone();
    const stage = C.getRecoveryStageInfo(symbol, rec.recoveryStage || 1);
    const greeting = C.getRecoveryGreeting(tone);
    const soft = C.getRecoverySoftLine(tone, todayKey());
    const message = C.getRecoveryStageMessage(symbol, rec.recoveryStage || 1);
    const stageName = stage ? stage.name : "Початок";
    const stageId = rec.recoveryStage || 1;
    const practice = dailyPracticeStatus();
    const stageDesc = stage && stage.description ? stage.description : "";
    const nextHint = todayNextStepHint(practice);
    return `
      <section class="recovery-home recovery-home--${tone}" aria-label="Внутрішнє деревце відновлення">
        <p class="recovery-home-greet">${esc(greeting)}</p>
        <p class="recovery-home-soft">${esc(soft)}</p>
        <div class="recovery-home-art" data-recovery-art="1" aria-hidden="true">${recoverySymbolSvg(symbol.id, {
          stage: stageId,
          style: symbol.visualStyle,
          animate: true
        })}</div>
        <p class="recovery-home-plant">Твоє деревце</p>
        <p class="recovery-home-stage">Етап · ${esc(stageName)}</p>
        ${stageDesc ? `<p class="recovery-home-stage-desc">${esc(stageDesc)}</p>` : ""}
        <p class="recovery-home-msg">${esc(message)}</p>
        <div class="practice-today" aria-label="Рекомендований догляд на сьогодні">
          <div class="practice-today-head">
            <span>Догляд сьогодні · ${practice.doneCount}/${practice.total}</span>
            <button type="button" class="practice-today-guide" id="practice-guide-btn">Путівник</button>
          </div>
          ${nextHint ? `<p class="practice-today-next">${esc(nextHint)}</p>` : ""}
          <div class="practice-today-chips">
            ${practice.items.map((item) => `
              <button type="button" class="practice-chip ${item.done ? "is-done" : ""}" data-practice="${esc(item.id)}" title="${esc(item.desc)}">
                <i>${item.done ? "✓" : "○"}</i>
                <span>${esc(practiceChipLabel(item))}</span>
              </button>`).join("")}
          </div>
          <p class="practice-today-note">Рекомендовано, не обов’язково. Деревце росте від турботи в твоєму темпі.</p>
        </div>
        <button type="button" class="btn recovery-home-care" id="recovery-care-btn">Подбати про себе</button>
      </section>`;
  }

  function openWellbeingCheck() {
    const scale = Array.from({ length: 10 }, (_, i) =>
      `<button class="well-btn" type="button" data-care-well="${i + 1}">${i + 1}</button>`).join("");
    openModal(`
      <h2>Як ти зараз? ${uiText("🌿")}</h2>
      <p class="muted" style="margin:0 0 14px;line-height:1.55">
        Оціни свій рівень тривоги: <b>1</b> — спокійно, <b>10</b> — напруга на максимумі.
        Без оцінок і правильних відповідей — лише чесний замір стану.
      </p>
      <div class="well-scale">${scale}</div>
      <div class="row spread" style="margin-top:8px;color:var(--ink-faint);font-size:12px;font-weight:700">
        <span>1 · спокій</span><span>10 · максимум</span>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost btn-sm" data-close type="button">Пізніше</button>
      </div>`);
    $$("#modal-root [data-care-well]").forEach(b => b.onclick = () => {
      const v = +b.dataset.careWell;
      S.setWellbeing(v);
      closeModal();
      render();
      if (v >= 7) {
        confirmModal(uiText("Дякую за чесність 🌿"),
          "Не треба нічого розбирати одразу. Можна почати з короткої дихальної практики.",
          () => startCalm("quick"), "Так, дихати");
      } else {
        toast("Записано. Сьогодні достатньо навіть одного кроку", "good");
      }
    });
  }

  function openRecoveryCareMenu() {
    const tone = communicationTone();
    const soft = C.getRecoverySoftLine(tone, todayKey() + "-care");
    const practice = dailyPracticeStatus();
    const actions = [
      { id: "ritual", title: "Ранкове / вечірнє заповнення", desc: "Рекомендовано першим · короткий ритуал дня" },
      { id: "diary", title: "Записати думки", desc: "Рекомендовано · один рядок уже має значення" },
      { id: "breath", title: "Дихальна практика", desc: "Рекомендовано · м’яке заспокоєння тіла" },
      { id: "gratitude", title: isMale() ? "Записати вдячність" : "Записати вдячність", desc: "Рекомендовано · за що ти сьогодні вдячний / вдячна" },
      { id: "well", title: "Перевірити свій стан", desc: "За бажанням · короткий замір напруги" },
      { id: "good", title: "Додати хороший момент дня", desc: "За бажанням · зафіксувати щось тепле" },
      { id: "past", title: "Повернутися до минулої тривоги", desc: "За бажанням · чи справдилася вона" }
    ];
    openModal(`
      <h2>Подбати про себе</h2>
      <p class="muted" style="margin:0 0 10px;line-height:1.55">${esc(soft)}</p>
      <p class="muted" style="margin:0 0 14px;line-height:1.45;font-size:13.5px">
        Перші чотири кроки — рекомендований догляд за деревцем (${practice.doneCount}/${practice.total} сьогодні). Решта — за бажанням.
      </p>
      <div class="recovery-care-list">
        ${actions.map(a => {
          const done = practice.items.some((p) => p.id === a.id && p.done);
          return `
          <button type="button" class="recovery-care-item ${done ? "is-done" : ""}" data-care="${a.id}">
            <b>${done ? "✓ " : ""}${esc(a.title)}</b>
            <span>${esc(a.desc)}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="row" style="justify-content:space-between;margin-top:12px;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="care-open-guide" type="button">Путівник</button>
        <button class="btn btn-ghost btn-sm" data-close type="button">Закрити</button>
      </div>`);
    const guideBtn = $("#care-open-guide");
    if (guideBtn) guideBtn.onclick = () => { closeModal(); openPracticeGuide(); };
    $$("#modal-root [data-care]").forEach(b => b.onclick = () => {
      const id = b.dataset.care;
      closeModal();
      if (id === "well") openWellbeingCheck();
      else if (id === "diary") go("new");
      else if (id === "breath") startCalm("quick");
      else if (id === "gratitude") go("gratitude");
      else if (id === "good") go("good");
      else if (id === "past") go(pendingReminders().length ? "reminders" : "history");
      else if (id === "ritual") openRecommendedRitual();
    });
  }

  function viewHome() {
    const routeInfo = monthRouteInfo();
    const lastEntry = activeEntries()[0] || null;
    const unfinished = lastUnfinishedTask();
    const week = weekDynamics();
    const tip = randomAff();
    const supportCount = selfSupportMomentsCount();
    const todayWell = S.todayWellbeing();
    const pend = pendingReminders();

    let alert = "";
    if (checkRedFlag() && S.state.settings.dismissedRedFlag !== todayKey()) {
      alert = `<div class="today-alert banner banner-red">
        <div class="b-ico">!</div>
        <div style="flex:1"><b>Складний період</b><p>Останні дні тривога висока. Можливо, варто звернутися до близької людини або спеціаліста.</p></div>
        <button class="btn btn-sm btn-ghost" id="dismiss-red">Зрозуміло</button>
      </div>`;
    } else if (pend.length) {
      alert = `<div class="today-alert banner banner-warn">
        <div class="b-ico">!</div>
        <div style="flex:1"><b>${pend.length} ${pluralUk(pend.length, "запис", "записи", "записів")} чекають відкриття</b></div>
        <button class="btn btn-sm btn-primary" data-route="reminders">Відкрити</button>
      </div>`;
    }

    const sub = todayWell
      ? `Сьогодні ${todayWell.level}/10 · ${wellbeingLabel(todayWell.level)}`
      : (isMale() ? "Без тиску. Один крок за раз." : "Достатньо одного маленького кроку до себе.");

    const careBanner = window.Rituals ? `
        <div class="care-banner">
          <span class="care-banner-ico">🌿</span>
          <div class="care-banner-text">${esc(Rituals.careMessage())}</div>
        </div>` : "";

    const ritualCard = window.Rituals ? Rituals.homeRitualCardHTML() : "";
    const recoveryBlock = recoveryHomeBlockHTML();

    $("#view").innerHTML = `
      <div class="today-page">
        ${alert}
        ${careBanner}
        ${ritualCard}
        ${recoveryBlock}
        <header class="today-head" data-tour="mood">
          <h1>Як ти зараз?</h1>
          <p>${esc(sub)}</p>
        </header>

        <div class="today-actions">
          <button class="today-action today-action-sos" id="ta-sos" type="button">
            <span class="ta-ico">SOS</span><span class="ta-title">Мені тривожно зараз</span>
          </button>
          <button class="today-action" id="ta-diary" type="button">
            <span class="ta-ico">+</span><span class="ta-title">Зробити запис дня</span>
          </button>
          <button class="today-action" id="ta-situation" type="button">
            <span class="ta-ico">⌁</span><span class="ta-title">Розібрати ситуацію</span>
          </button>
        </div>

        <div class="today-blocks">
          <div class="today-tile">
            <div class="today-tile-label">Місячний маршрут</div>
            <div class="today-tile-main">День ${routeInfo.day} з ${routeInfo.daysInMonth}</div>
            <div class="bar today-bar"><i style="width:${routeInfo.pct}%"></i></div>
            <div class="today-tile-meta">${routeInfo.monthDays} ${pluralUk(routeInfo.monthDays, "день", "дні", "днів")} із записами</div>
          </div>

          <div class="today-tile">
            <div class="today-tile-label">Останній запис</div>
            ${lastEntry
              ? `<div class="today-tile-main today-tile-clamp">${esc((lastEntry.fear || "").slice(0, 80))}</div>
                 <div class="today-tile-meta">${fmtDate(lastEntry.createdAt)} · ${lastEntry.anxiety ? lastEntry.anxiety + "/10" : "запис"}</div>`
              : `<div class="today-tile-main muted">Ще немає записів</div><div class="today-tile-meta">Почни з одного рядка про страх</div>`}
          </div>

          <div class="today-tile">
            <div class="today-tile-label">Незавершена вправа</div>
            ${unfinished
              ? `<div class="today-tile-main today-tile-clamp">${esc(unfinished.title)}</div>
                 <div class="today-tile-meta today-tile-clamp">${esc(unfinished.text)}</div>`
              : `<div class="today-tile-main muted">Немає незавершеного</div><div class="today-tile-meta">Можна відпочити або зробити новий крок</div>`}
          </div>

          <div class="today-tile today-tile-wide">
            <div class="today-tile-label">Стан за 7 днів</div>
            ${weekBarsHTML(week)}
          </div>

          <div class="today-tile">
            <div class="today-tile-label">${isMale() ? "Підказка дня" : "Персональна підказка"}</div>
            <p class="today-tip">${esc(tip)}</p>
          </div>

          <div class="today-tile">
            <div class="today-tile-label">Моменти самопідтримки</div>
            <div class="today-tile-main today-tile-num">${supportCount}</div>
            <div class="today-tile-meta">завершених кроків і опор</div>
          </div>
        </div>

        <button class="btn btn-primary btn-block today-continue" id="today-continue" type="button">Продовжити</button>
      </div>`;

    $("#ta-sos").onclick = () => startCalm("quick");
    $("#ta-diary").onclick = () => go("new");
    $("#ta-situation").onclick = () => startCalm("full");
    $("#today-continue").onclick = continueHomeAction;
    const careBtn = $("#recovery-care-btn");
    if (careBtn) careBtn.onclick = openRecoveryCareMenu;
    const guideBtn = $("#practice-guide-btn");
    if (guideBtn) guideBtn.onclick = openPracticeGuide;
    $$("[data-practice]", $("#view")).forEach((b) => {
      b.onclick = () => openPracticeStep(b.dataset.practice);
    });
    const homeArt = $(".recovery-home-art", $("#view"));
    if (homeArt && window.RecoveryArt) {
      RecoveryArt.bindPress(homeArt);
      RecoveryArt.observeVisibility(homeArt);
    }
    if (unfinished) {
      const tiles = $$(".today-tile", $("#view"));
      if (tiles[2]) { tiles[2].classList.add("is-clickable"); tiles[2].onclick = unfinished.action; }
    }
    if (lastEntry) {
      const tiles = $$(".today-tile", $("#view"));
      if (tiles[1]) { tiles[1].classList.add("is-clickable"); tiles[1].onclick = () => go("history"); }
    }
    $$("[data-route]", $("#view")).forEach(b => b.onclick = () => go(b.dataset.route));
    const dr = $("#dismiss-red");
    if (dr) dr.onclick = () => { S.state.settings.dismissedRedFlag = todayKey(); S.save(); render(); };
    if (window.Rituals) Rituals.wireHomeRituals($("#view"));
  }

  function viewSupport() {
    const links = [
      { route: "resources", icon: "◌", title: "Мої ресурси", desc: "Що допомагає заспокоїтися" },
      { route: "friend", icon: "✉", title: isMale() ? "Лист другові" : "Порада подрузі", desc: "Погляд на ситуацію з теплом" },
      { route: "gratitude", icon: "∴", title: isMale() ? "За що я вдячний" : "За що я вдячна", desc: "Короткі нотатки опори" },
      { route: "joys", icon: "◇", title: "Мої радощі", desc: "Книги, музика, прогулянки" },
      { route: "treasure", icon: "□", title: "Скарбничка", desc: "Теплі слова та перемоги" },
      { route: "evidence", icon: "✓", title: "Банк доказів", desc: "Страхи, що не справдилися" },
      { route: "library", icon: "§", title: "Бібліотека", desc: "Короткі статті про тривогу" },
      { route: "types", icon: "⌁", title: "Типи тривоги", desc: "М'які тести та розбір" }
    ];
    $("#view").innerHTML = `
      <div class="page-head"><h1>Опора</h1><p>Практики та інструменти, які допомагають повернутися до спокою.</p></div>
      <div class="support-grid">
        ${links.map(l => `
          <button class="support-link" type="button" data-route="${l.route}">
            <span class="support-ico">${l.icon}</span>
            <span class="support-body"><b>${esc(l.title)}</b><span>${esc(l.desc)}</span></span>
          </button>`).join("")}
      </div>`;
    $$("[data-route]", $("#view")).forEach(b => b.onclick = () => go(b.dataset.route));
  }

  function viewInfo() {
    const practice = dailyPracticeStatus();
    const next = practice.items.find((x) => !x.done);
    const cards = [
      {
        id: "today",
        icon: "1",
        title: "Що зробити сьогодні",
        desc: next
          ? ("Рекомендований наступний крок: «" + practiceChipLabel(next) + "». Можна почати з путівника.")
          : "Сьогодні догляд уже повний. Можна просто переглянути путівник."
      },
      {
        id: "guide",
        icon: "2",
        title: "Що є на сайті",
        desc: "Повний огляд функцій: музика, записи, аналіз, дихання, опора й зручності."
      },
      {
        id: "payment",
        icon: "3",
        title: "Оплата та доступ",
        desc: "Умови доступу до сервісу та інформація про оплату чи підтримку."
      },
      {
        id: "privacy",
        icon: "4",
        title: "Конфіденційність",
        desc: "Що зберігається, де лежать дані і як ти ними керуєш."
      },
      {
        id: "faq",
        icon: "?",
        title: "FAQ і відгук",
        desc: "Правила простору, часті питання та форма для відгуку чи побажання."
      }
    ];
    $("#view").innerHTML = `
      <div class="page-head">
        <h1>Інформація</h1>
        <p>Крок на сьогодні, огляд функцій, оплата, конфіденційність і FAQ.</p>
      </div>
      <div class="support-grid">
        ${cards.map(c => `
          <button class="support-link" type="button" data-info="${c.id}">
            <span class="support-ico">${c.icon}</span>
            <span class="support-body"><b>${esc(c.title)}</b><span>${esc(c.desc)}</span></span>
          </button>`).join("")}
      </div>`;
    $$("[data-info]", $("#view")).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.info;
        if (id === "today") openPracticeGuide();
        else if (id === "guide") openGuide();
        else if (id === "payment") go("payment");
        else if (id === "privacy") go("privacy");
        else if (id === "faq") go("faq");
      };
    });
  }

  /* ===================== Внутрішнє деревце відновлення ===================== */
  function viewRecoverySelect() {
    const tone = communicationTone();
    const plantId = "lavender";
    const symbol = C.getRecoverySymbolById(plantId);
    $("#view").innerHTML = `
      <section class="recovery-select recovery-select--${tone} recovery-select--plant" aria-labelledby="recovery-select-title">
        <div class="recovery-select-head">
          <h1 id="recovery-select-title">Тут росте твоє деревце</h1>
          <p>Вона змінюватиметься разом із тобою і згодом зможе дати гарний цвіт. Без назв і порівнянь — лише тихий простір турботи.</p>
        </div>
        <div class="recovery-plant-hero">
          <div class="recovery-home-art recovery-plant-hero-art" data-recovery-art="1" aria-hidden="true">${recoverySymbolSvg(plantId, {
            stage: 1,
            style: symbol ? symbol.visualStyle : "gentle",
            animate: true
          })}</div>
          <p class="recovery-plant-hero-note">Деревце росте від щоденної турботи: ритуал, запис, дихання й вдячність. Це рекомендовано, не обов’язково.</p>
          <button type="button" class="btn btn-primary" id="plant-start">Почати шлях</button>
          <button type="button" class="btn btn-ghost" id="plant-guide" style="margin-top:8px">Як це працює</button>
        </div>
      </section>`;

    const art = $(".recovery-plant-hero-art", $("#view"));
    if (art && window.RecoveryArt) {
      RecoveryArt.bindPress(art);
      RecoveryArt.observeVisibility(art);
    }
    const start = $("#plant-start");
    if (start) start.onclick = () => {
      if (!S.selectRecoverySymbol(plantId)) {
        toast("Не вдалося зберегти. Спробуй ще раз.", "warn");
        return;
      }
      toast(uiText("Деревце з тобою. Це твій перший крок 🌿"), "good");
      go("home");
      if (shouldShowWelcome()) {
        openWelcomeFeatures({ thenOnboarding: true, thenPracticeGuide: true });
      } else if (shouldShowTour()) {
        startSiteTour({ thenWellbeing: true, thenPracticeGuide: true });
      } else {
        startOnboarding();
        setTimeout(() => runAfterModal(openPracticeGuide), 900);
      }
    };
    const guide = $("#plant-guide");
    if (guide) guide.onclick = () => openPracticeGuide();
  }

  /* ===================== ТИПИ ТРИВОЖНОСТІ ===================== */
  function viewTypes() {
    $("#view").innerHTML = `
      <div class="page-head"><h1>🧭 Типи тривожності</h1><p>Тривога буває різною. Обери свою — і пройди м'який тест, який підкаже й заспокоїть.</p></div>
      <div class="lib-grid">
        ${C.ANXIETY_TYPES.map(t => `
          <button class="lib-card" data-type="${t.id}">
            <div class="lib-ico">${t.icon}</div>
            <h3>${esc(t.title)}</h3>
            <p>${esc(t.desc)}</p>
            <span class="chip" style="margin-top:12px;background:var(--primary-soft);color:var(--primary-d);border-color:transparent">Пройти заспокійливий тест →</span>
          </button>`).join("")}
      </div>`;
    $$("[data-type]", $("#view")).forEach(b => b.onclick = () => go("typeTest", b.dataset.type));
  }

  /* Заспокійливий тест за типом: кожен варіант дає пораду, що заспокоює.
     Кроки оновлюються «на місці» (без перемальовування всієї сторінки) — без мерехтіння. */
  let testState = null;
  function viewTypeTest() {
    const type = C.ANXIETY_TYPES.find(t => t.id === routeParam);
    if (!type) { go("types"); return; }
    if (!testState || testState.typeId !== type.id) testState = { typeId: type.id, step: 0, picked: null };
    $("#view").innerHTML = `
      <button class="btn btn-ghost btn-sm" id="tt-back">← До типів</button>
      <div id="tt-stage" class="tt-stage" style="margin-top:14px"></div>`;
    $("#tt-back").onclick = () => { testState = null; go("types"); };
    paintType(type, false);
  }

  // Оновлення лише сцени тесту з плавним переходом
  function paintType(type, animate) {
    const stage = $("#tt-stage"); if (!stage) return;
    const total = type.questions.length;
    const step = testState.step;
    let html, wire;
    if (step >= total) {
      if (!testState.friendDone) { html = friendStepHTML(type); wire = () => wireFriendStep(type); }
      else { html = testOutroHTML(type); wire = () => wireTestOutro(type); }
    } else {
      html = testStepHTML(type, step); wire = () => wireTestStep(type, step);
    }
    const apply = () => {
      stage.innerHTML = html;
      wire();
      genderizeDOM(stage);
      stage.style.opacity = "1";
    };
    if (animate) { stage.style.opacity = "0"; setTimeout(apply, 140); }
    else apply();
  }

  function testStepHTML(type, step) {
    const total = type.questions.length;
    const q = type.questions[step];
    const picked = testState.picked;
    return `
      <div class="page-head"><h1>${type.icon} ${esc(type.title)}</h1>
        <p>${step === 0 ? esc(type.intro) : "Дихай спокійно. Кожна відповідь — це турбота про себе."}</p></div>
      <div class="card">
        <div class="row spread" style="margin-bottom:6px"><span class="faint">Питання ${step + 1} з ${total}</span></div>
        <div class="bar" style="margin-bottom:16px"><i style="width:${Math.round((step) / total * 100)}%"></i></div>
        <div class="card-title" style="font-size:25px">${esc(q.q)}</div>
        <div class="stack" id="tt-options" style="margin-top:8px">
          ${q.options.map((o, i) => `
            <button class="opt ${picked === i ? "sel" : ""}" data-opt="${i}">
              <span class="opt-dot"></span><span>${esc(o.label)}</span>
            </button>`).join("")}
        </div>
        <div id="tt-advice">${picked != null ? adviceCard(q.options[picked].advice) : ""}</div>
        <div class="row spread" style="margin-top:18px">
          <button class="btn btn-ghost btn-sm" id="tt-prev" ${step === 0 ? "disabled" : ""}>← Назад</button>
          <button class="btn btn-primary" id="tt-next" ${picked == null ? "disabled" : ""}>${step + 1 === total ? "Завершити 🌿" : "Далі →"}</button>
        </div>
      </div>
      ${type.id === "finances" && step === 0 ? financeToolkitHTML() : ""}`;
  }

  function wireTestStep(type, step) {
    const q = type.questions[step];
    if (type.id === "finances" && step === 0) wireFinanceToolkit($("#tt-stage"));
    $("#tt-prev").onclick = () => { if (testState.step > 0) { testState.step--; testState.picked = null; paintType(type, true); } };
    $("#tt-next").onclick = () => {
      if (testState.picked == null) return;
      testState.step++; testState.picked = null; paintType(type, true);
    };
    $$("[data-opt]", $("#tt-stage")).forEach(b => b.onclick = () => {
      testState.picked = +b.dataset.opt;
      $$(".opt", $("#tt-stage")).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
      const adv = $("#tt-advice"); adv.innerHTML = adviceCard(q.options[testState.picked].advice); genderizeDOM(adv);
      $("#tt-next").disabled = false;
    });
  }

  function adviceCard(text) {
    return `<div class="advice"><div class="advice-ico">🌿</div><div>${esc(text)}</div></div>`;
  }

  // Питання про подругу після кожного тесту + повернення підтримки собі
  function friendStepHTML(type) {
    const revealed = !!testState.friendRevealed;
    return `
      <div class="page-head"><h1>${type.icon} Останній крок 🤍</h1>
        <p>Іноді найдобріші слова ми бережемо для інших. Спробуймо інакше.</p></div>
      <div class="card">
        <div class="card-title" style="font-size:23px">${esc(C.CALM.friendQuestion)}</div>
        <textarea id="friend-answer" class="calm-input" style="color:var(--ink);background:var(--surface-2);border:1px solid var(--line)" rows="3" placeholder="Напиши так, ніби говориш найдорожчій людині...">${esc(testState.friendAnswer || "")}</textarea>
        ${revealed ? `<div class="advice" style="margin-top:14px"><div class="advice-ico">💚</div><div style="font-family:var(--font-hand);font-size:21px">${esc(C.CALM.friendSelf)}</div></div>` : ""}
        <div class="row spread" style="margin-top:18px">
          <button class="btn btn-ghost btn-sm" id="friend-skip">Пропустити</button>
          ${revealed
            ? `<button class="btn btn-primary" id="friend-go">Далі 🌿</button>`
            : `<button class="btn btn-primary" id="friend-reveal">Готово</button>`}
        </div>
      </div>`;
  }
  function wireFriendStep(type) {
    const ta = $("#friend-answer");
    ta.oninput = () => { testState.friendAnswer = ta.value; };
    $("#friend-skip").onclick = () => { testState.friendDone = true; paintType(type, true); };
    if (testState.friendRevealed) $("#friend-go").onclick = () => { testState.friendDone = true; paintType(type, true); };
    else $("#friend-reveal").onclick = () => { testState.friendRevealed = true; paintType(type, true); };
  }

  function testOutroHTML(type) {
    const aff = randomAff();
    return `
      <div class="page-head"><h1>${type.icon} Ти молодець 🤍</h1></div>
      <div class="card" style="background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;border:none">
        <p style="font-size:22px;line-height:1.5;margin:0 0 14px;font-family:var(--font-hand)">${esc(type.outro)}</p>
        <p style="opacity:.92;margin:0;font-size:16px">Афірмація для тебе: «${esc(aff)}»</p>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-title">Хочеш закріпити спокій?</div>
          <div class="stack">
            <button class="btn btn-accent btn-block" id="o-crisis">🫁 Дихальна вправа та заземлення</button>
            <button class="btn btn-ghost btn-block" id="o-save">💝 Зберегти ці слова у скарбничку</button>
            <button class="btn btn-ghost btn-block" id="o-entry">Записати, що відчуваю зараз</button>
          </div>
        </div>
        <div class="card"><div class="card-title">Що далі?</div>
          <div class="stack">
            <button class="btn btn-primary btn-block" id="o-again">↺ Пройти тест ще раз</button>
            <button class="btn btn-ghost btn-block" id="o-types">🧭 Інші типи тривоги</button>
          </div>
          <p class="muted" style="margin-top:10px;font-size:13px">Тривога завжди тимчасова. Повертайся сюди щоразу, коли потрібна опора.</p>
        </div>
      </div>
      ${type.id === "post-event" ? postEventToolkitHTML() : ""}
      ${type.id === "finances" ? financeToolkitHTML() : ""}`;
  }
  function wireTestOutro(type) {
    // Завершення рекомендованого розбору / вправи (один раз на день через реєстр).
    if (testState && !testState.recoveryExerciseAwarded) {
      testState.recoveryExerciseAwarded = true;
      if (S.awardRecoveryProgress) S.awardRecoveryProgress("exercise");
    }
    $("#o-crisis").onclick = () => openCrisis();
    $("#o-save").onclick = () => { S.addTreasure({ type: "affirmation", content: type.outro }); toast("Додано у скарбничку 💝", "good"); };
    $("#o-entry").onclick = () => { testState = null; go("new"); };
    $("#o-again").onclick = () => { testState = { typeId: type.id, step: 0, picked: null }; paintType(type, true); };
    $("#o-types").onclick = () => { testState = null; go("types"); };
    if (type.id === "post-event") wirePostEventToolkit($("#tt-stage"));
    if (type.id === "finances") wireFinanceToolkit($("#tt-stage"));
  }

  function postEventToolkitHTML() {
    return `
      <div class="card fin-toolkit" style="margin-top:16px">
        <div class="card-title">Протокол: «я сказала щось не те»</div>
        <p class="muted" style="margin-top:0">
          Це CBT-схема для післяситуаційного прокручування: спершу факти, потім одна дія, потім завершення циклу.
        </p>
        <div class="fin-tool-grid">
          <div class="fin-tool">
            <b>1. Назви петлю</b>
            <p>«Я зараз руміную, а не вирішую проблему». Назва процесу зменшує його силу.</p>
          </div>
          <div class="fin-tool">
            <b>2. Факти vs припущення</b>
            <p>Факт: що реально було сказано/зроблено. Припущення: «вони точно подумали...».</p>
          </div>
          <div class="fin-tool">
            <b>3. Одна корекція</b>
            <p>Якщо є реальна помилка — коротко уточнити або вибачитись. Якщо доказів нема — не писати зайве.</p>
          </div>
          <div class="fin-tool">
            <b>4. Закрити цикл</b>
            <p>10 хвилин на запис думок, потім дія тілом: вода, прогулянка, душ, проста справа.</p>
          </div>
        </div>
        <div class="advice" style="margin-top:14px">
          <div class="advice-ico">◇</div>
          <div><b>Фраза для зупинки:</b> «Я перевірила факти. Якщо потрібна дія — я зроблю одну дію. Якщо ні — я повертаюсь у своє життя».</div>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button class="btn btn-primary btn-sm" id="post-event-entry">Записати ситуацію в щоденник</button>
        </div>
      </div>`;
  }

  function wirePostEventToolkit(root) {
    const btn = $("#post-event-entry", root);
    if (btn) btn.onclick = () => { testState = null; go("new"); };
  }

  /* ===================== ФІНАНСОВИЙ НАБІР ===================== */
  function financeToolkitHTML() {
    return `
      <div class="card fin-toolkit">
        <div class="card-title">Фінансовий потік</div>
        <p class="muted" style="margin:-4px 0 14px">Перемкни фокус зі страху нестачі на спокій і можливості.</p>
        <div class="fin-grid">
          <button class="fin-btn fin-flow" data-fin="mindset"><span class="fin-ico">01</span><b>Тест грошового потоку</b><span>Перенаправ думки на вищий рівень</span></button>
          <button class="fin-btn" data-fin="aff"><span class="fin-ico">02</span><b>Грошові афірмації</b><span>Заземлення та достаток</span></button>
          <button class="fin-btn" data-fin="tips"><span class="fin-ico">03</span><b>Що реально працює</b><span>Поради психологів і фінансистів</span></button>
        </div>
      </div>`;
  }
  function wireFinanceToolkit(root) {
    $$("[data-fin]", root).forEach(b => b.onclick = () => {
      const k = b.dataset.fin;
      if (k === "mindset") openFinanceMindset();
      else if (k === "aff") openFinanceAffirmations();
      else openFinanceTips();
    });
  }

  function openFinanceTips() {
    const tips = C.FINANCE.tips;
    openModal(`
      <h2>📚 Що реально працює з грошима</h2>
      <p class="muted" style="margin:0 0 14px">Коротко й по суті — від психологів і фінансистів.</p>
      <div class="stack">
        ${tips.map(t => `
          <div class="fin-tip">
            <div class="fin-tip-ico">${t.icon}</div>
            <div><b>${esc(t.title)}</b>
              <p style="margin:4px 0 6px;line-height:1.5">${esc(t.text)}</p>
              <span class="pill pill-green">${esc(t.source)}</span>
            </div>
          </div>`).join("")}
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:16px" data-close>Зрозуміло, дякую</button>`);
  }

  let finAffShown = null;
  function pickFinAff() {
    const list = C.FINANCE.affirmations;
    let a; do { a = list[Math.floor(Math.random() * list.length)]; } while (a === finAffShown && list.length > 1);
    finAffShown = a; return a;
  }
  function openFinanceAffirmations() {
    const render = () => {
      const a = pickFinAff();
      openModal(`
        <h2>💸 Грошова афірмація</h2>
        <div class="fin-aff">${esc(a)}</div>
        <div class="row" style="justify-content:center;gap:10px;margin-top:18px">
          <button class="btn btn-primary" id="fa-next">↻ Інша</button>
          <button class="btn btn-ghost" id="fa-save">💝 Зберегти</button>
        </div>
        <p class="muted" style="text-align:center;margin-top:12px;font-size:13px">Прочитай повільно, поклавши руку на серце. Дозволь словам осісти.</p>`);
      $("#fa-next").onclick = render;
      $("#fa-save").onclick = () => { S.addTreasure({ type: "affirmation", content: a }); toast("Додано у скарбничку 💝", "good"); };
    };
    render();
  }

  let finState = null;
  function openFinanceMindset() {
    finState = { step: 0, picked: null, flow: 0 };
    renderFinanceMindset();
  }
  function renderFinanceMindset() {
    const T = C.FINANCE.mindsetTest;
    const total = T.questions.length;
    if (finState.step >= total) { renderFinanceResult(); return; }
    const q = T.questions[finState.step];
    const picked = finState.picked;
    openModal(`
      <h2>🌊 Тест грошового потоку</h2>
      ${finState.step === 0 ? `<p class="muted" style="margin:0 0 12px;line-height:1.5">${esc(T.intro)}</p>` : ""}
      <div class="row spread" style="margin-bottom:6px"><span class="faint">Крок ${finState.step + 1} з ${total}</span></div>
      <div class="bar" style="margin-bottom:14px"><i style="width:${Math.round(finState.step / total * 100)}%"></i></div>
      <div style="font-weight:700;font-size:17px;margin-bottom:10px">${esc(q.q)}</div>
      <div class="stack" id="fm-options">
        ${q.options.map((o, i) => `<button class="opt ${picked === i ? "sel" : ""}" data-opt="${i}"><span class="opt-dot"></span><span>${esc(o.label)}</span></button>`).join("")}
      </div>
      <div id="fm-reframe">${picked != null ? adviceCard(q.options[picked].reframe) : ""}</div>
      <div class="row spread" style="margin-top:16px">
        <button class="btn btn-ghost btn-sm" id="fm-prev" ${finState.step === 0 ? "disabled" : ""}>← Назад</button>
        <button class="btn btn-primary" id="fm-next" ${picked == null ? "disabled" : ""}>${finState.step + 1 === total ? "Дізнатися результат 🌊" : "Далі →"}</button>
      </div>`);
    $$("[data-opt]", $("#modal-root")).forEach(b => b.onclick = () => {
      finState.picked = +b.dataset.opt;
      $$(".opt", $("#modal-root")).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
      $("#fm-reframe").innerHTML = adviceCard(q.options[finState.picked].reframe);
      $("#fm-next").disabled = false;
    });
    $("#fm-prev").onclick = () => { if (finState.step > 0) { finState.step--; finState.picked = null; renderFinanceMindset(); } };
    $("#fm-next").onclick = () => {
      if (finState.picked == null) return;
      if (q.options[finState.picked].flow) finState.flow++;
      finState.step++; finState.picked = null; renderFinanceMindset();
    };
  }
  function renderFinanceResult() {
    const T = C.FINANCE.mindsetTest;
    const res = T.results.find(r => finState.flow >= r.min && finState.flow <= r.max) || T.results[T.results.length - 1];
    confetti();
    openModal(`
      <div style="text-align:center">
        <div style="font-size:46px">🌊</div>
        <h2 style="margin:6px 0">${esc(res.title)}</h2>
        <div class="pill pill-violet" style="display:inline-block;margin-bottom:10px">Потік: ${finState.flow} з ${T.questions.length}</div>
        <p style="line-height:1.6;margin:0 0 14px">${esc(res.text)}</p>
        <div class="fin-aff" style="margin:0 0 4px">${esc(res.aff)}</div>
      </div>
      <div class="row" style="justify-content:center;gap:10px;margin-top:16px">
        <button class="btn btn-ghost" id="fr-save">💝 Зберегти афірмацію</button>
        <button class="btn btn-primary" id="fr-again">↺ Пройти ще раз</button>
      </div>
      <button class="btn btn-block btn-ghost" style="margin-top:10px" data-close>Готово 🌿</button>`);
    $("#fr-save").onclick = () => { S.addTreasure({ type: "affirmation", content: res.aff }); toast("Додано у скарбничку 💝", "good"); };
    $("#fr-again").onclick = () => { finState = { step: 0, picked: null, flow: 0 }; renderFinanceMindset(); };
  }

  /* ===================== НОВИЙ ЗАПИС ===================== */
  let form = null;
  function freshForm() {
    return { type: "diary", anxiety: 0, mood: 0, energy: 0, fear: "", cause: "", trigger: "", category: "", helped: [], openDate: defaultOpenDate() };
  }
  function defaultOpenDate() {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  function viewNew() {
    // відновлення чернетки (Store + durable Safeguard)
    if (!form) form = S.getDraft() || freshForm();
    if (window.Safeguard) Safeguard.setEditingRoute(true);

    const catChips = C.CATEGORIES.map(c => `<button type="button" class="chip ${form.category===c?"sel":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    const trigChips = C.TRIGGERS.map(t => `<button type="button" class="chip ${form.trigger===t?"sel":""}" data-trig="${esc(t)}">${esc(t)}</button>`).join("");
    const helpChips = C.RESOURCE_SUGGESTIONS.map(h => `<button type="button" class="chip ${form.helped.includes(h)?"sel":""}" data-help="${esc(h)}">${esc(h)}</button>`).join("");

    $("#view").innerHTML = `
      <div class="page-head"><h1>Новий запис</h1><p>Усе зберігається автоматично на пристрої. Після збереження — синхронізується з хмарою.</p></div>

      <div class="card">
        <div class="row" style="margin-bottom:18px">
          <button type="button" class="chip ${form.type==="diary"?"sel":""}" data-type="diary">📓 Запис тривоги</button>
          <button type="button" class="chip ${form.type==="letter"?"sel":""}" data-type="letter">✉️ Лист собі в майбутнє</button>
        </div>

        <div class="stack">
          <div>
            <label class="field"><span>Що мене тривожить? Чого я боюся?</span>
            <textarea id="f-fear" placeholder="Опиши свій страх або хвилювання...">${esc(form.fear)}</textarea></label>
          </div>

          <div class="grid grid-3">
            <div><div class="field"><span>Рівень тривоги (1–10)</span></div>${scaleField("anxiety",10,form.anxiety)}
              <div class="scale-legend"><span>спокій</span><span>паніка</span></div></div>
            <div><div class="field"><span>Настрій (1–5)</span></div>${scaleField("mood",5,form.mood,"mood")}
              <div class="scale-legend"><span>погано</span><span>чудово</span></div></div>
            <div><div class="field"><span>Енергія (1–5)</span></div>${scaleField("energy",5,form.energy,"mood")}
              <div class="scale-legend"><span>виснаження</span><span>бадьорість</span></div></div>
          </div>

          <div>
            <label class="field"><span>Причина тривоги (своїми словами)</span>
            <input id="f-cause" type="text" placeholder="Напр.: очікую відповіді на повідомлення" value="${esc(form.cause)}"></label>
          </div>

          <div><div class="field"><span>Тригер</span></div><div class="chip-row" id="trig-row">${trigChips}</div></div>
          <div><div class="field"><span>Категорія</span></div><div class="chip-row" id="cat-row">${catChips}</div></div>
          <div><div class="field"><span>Що сьогодні допомогло заспокоїтися?</span></div><div class="chip-row" id="help-row">${helpChips}</div></div>

          <div>
            <label class="field"><span>🔔 День відкриття — коли нагадати й перевірити, чи справдився страх?</span>
            <input id="f-open" type="date" value="${esc(form.openDate)}"></label>
          </div>
        </div>

        <div class="row spread" style="margin-top:20px">
          <button class="btn btn-ghost" id="f-clear">Очистити чернетку</button>
          <button class="btn btn-primary" id="f-save">Зберегти запис</button>
        </div>
      </div>`;

    const root = $("#view");
    const persistDraft = () => {
      if (window.Safeguard) Safeguard.scheduleDraftSave(form);
      else S.saveDraft(form, { localOnly: true });
    };

    $("#f-fear").oninput = (e) => { form.fear = e.target.value; persistDraft(); };
    $("#f-cause").oninput = (e) => { form.cause = e.target.value; persistDraft(); };
    $("#f-open").onchange = (e) => { form.openDate = e.target.value; persistDraft(); };

    wireScale(root, "anxiety", v => { form.anxiety = v; persistDraft(); });
    wireScale(root, "mood", v => { form.mood = v; persistDraft(); });
    wireScale(root, "energy", v => { form.energy = v; persistDraft(); });

    $$("[data-type]", root).forEach(b => b.onclick = () => { form.type = b.dataset.type; persistDraft(); viewNew(); });
    $$("[data-cat]", root).forEach(b => b.onclick = () => { form.category = form.category===b.dataset.cat?"":b.dataset.cat; persistDraft(); viewNew(); });
    $$("[data-trig]", root).forEach(b => b.onclick = () => { form.trigger = form.trigger===b.dataset.trig?"":b.dataset.trig; persistDraft(); viewNew(); });
    $$("[data-help]", root).forEach(b => b.onclick = () => {
      const h = b.dataset.help;
      form.helped = form.helped.includes(h) ? form.helped.filter(x=>x!==h) : [...form.helped, h];
      persistDraft(); viewNew();
    });

    $("#f-clear").onclick = () => confirmModal("Очистити чернетку?", "Введені дані буде видалено.", async () => {
      if (window.Safeguard) await Safeguard.clearDraftDurable();
      else S.clearDraft();
      form = freshForm();
      viewNew();
      toast("Чернетку очищено");
    });

    $("#f-save").onclick = async () => {
      if (!form.fear.trim()) { toast("Опиши, що тебе тривожить 🙏", "warn"); return; }
      if (!form.anxiety) { toast("Обери рівень тривоги", "warn"); return; }
      if (window.Safeguard) await Safeguard.writeDraftNow(form);
      const entry = S.addEntry({
        type: form.type, anxiety: form.anxiety, mood: form.mood, energy: form.energy,
        fear: form.fear.trim(), cause: form.cause.trim(), trigger: form.trigger, category: form.category,
        helped: form.helped.slice(), openDate: form.openDate, reviewed: false
      });
      form.helped.forEach(h => S.addResourceUse(h, form.mood || 3));
      const wasLetter = form.type === "letter";
      S.clearDraft({ skipPush: true });
      if (window.Safeguard) {
        const syncRes = await Safeguard.flushToServer({ afterEntrySave: true, silent: false });
        if (syncRes && syncRes.ok) await Safeguard.clearDraftDurable();
        else if (window.Safeguard && !Safeguard.isOnline()) {
          toast("Запис збережено на пристрої. Синхронізуємо, коли з’явиться Інтернет.", "warn");
        }
      } else {
        S.clearDraft();
      }
      form = null;
      if (window.Safeguard) Safeguard.setEditingRoute(false);
      checkAchievements();
      toast(wasLetter ? "Лист збережено ✉️" : "Запис збережено 🌿", "good");
      closerModal(() => go("home"));
      void entry;
    };
  }

  /* ===================== НАГАДУВАННЯ / ВІДКРИТТЯ ===================== */
  function viewReminders() {
    const pend = pendingReminders();
    const upcoming = activeEntries().filter(e => !e.reviewed && e.openDate && e.openDate > todayKey())
      .sort((a, b) => a.openDate.localeCompare(b.openDate));

    $("#view").innerHTML = `
      <div class="page-head"><h1>Нагадування</h1><p>Повернись до своїх страхів і подивіться, що сталося насправді.</p></div>
      <h2 class="section-title">Час відкрити (${pend.length})</h2>
      <div id="pend-list">${pend.length ? "" : emptyBlock("☀️", "Немає записів для відкриття. Усе під контролем.")}</div>
      ${upcoming.length ? `<h2 class="section-title">Заплановані відкриття</h2>
        <div>${upcoming.map(e => `<div class="item"><div class="item-head">
          <div><div>${e.type==="letter"?"✉️ Лист":"📓 Запис"}: ${esc((e.fear||"").slice(0,80))}</div>
          <div class="item-date">Відкриття ${fmtDate(e.openDate)} · через ${Math.max(0,daysBetween(todayKey(), e.openDate))} ${pluralUk(Math.max(0,daysBetween(todayKey(), e.openDate)),"день","дні","днів")}</div></div>
        </div></div>`).join("")}</div>` : ""}
    `;

    const list = $("#pend-list");
    pend.forEach(e => {
      const card = document.createElement("div");
      card.className = "item";
      card.innerHTML = `
        <div class="item-head">
          <div><span class="pill pill-violet">${e.type==="letter"?"Лист собі":"Запис тривоги"}</span>
          <div class="item-date" style="margin-top:6px">Створено ${fmtDate(e.createdAt)}</div></div>
        </div>
        <div class="item-body"><b>Тоді я боялася:</b><br>${esc(e.fear)}</div>
        <div class="stack" style="margin-top:14px">
          <div>
            <div class="field"><span>Чи справдився мій страх?</span></div>
            <div class="row" data-q="cameTrue">
              <button type="button" class="chip" data-v="no">Ні, не справдився</button>
              <button type="button" class="chip" data-v="partly">Частково</button>
              <button type="button" class="chip" data-v="yes">Так, справдився</button>
            </div>
          </div>
          <label class="field"><span>Що сталося насправді?</span><textarea data-f="whatHappened" placeholder="Опиши реальний результат..."></textarea></label>
          <label class="field"><span>Чого мене навчила ця ситуація?</span><textarea data-f="lesson" placeholder="Висновок, урок..."></textarea></label>
          <label class="field"><span>Що б я сказала собі тоді?</span><textarea data-f="toSelf" placeholder="Слова підтримки собі в минуле..."></textarea></label>
          <div class="row spread">
            <button class="btn btn-ghost btn-sm" data-del>Видалити запис</button>
            <button class="btn btn-primary" data-save>Завершити відкриття</button>
          </div>
        </div>`;

      let answer = { cameTrue: null };
      $$('[data-q="cameTrue"] .chip', card).forEach(b => b.onclick = () => {
        $$('[data-q="cameTrue"] .chip', card).forEach(x => x.classList.remove("sel"));
        b.classList.add("sel"); answer.cameTrue = b.dataset.v;
      });
      $("[data-save]", card).onclick = () => {
        if (!answer.cameTrue) { toast("Обери, чи справдився страх", "warn"); return; }
        const review = {
          cameTrue: answer.cameTrue,
          whatHappened: $('[data-f="whatHappened"]', card).value.trim(),
          lesson: $('[data-f="lesson"]', card).value.trim(),
          toSelf: $('[data-f="toSelf"]', card).value.trim(),
          reviewedAt: new Date().toISOString()
        };
        S.updateEntry(e.id, { reviewed: true, review });
        // якщо страх не справдився — у банк доказів
        if (answer.cameTrue === "no" || answer.cameTrue === "partly") {
          S.addEvidence({
            fear: e.fear,
            realResult: review.whatHappened || (answer.cameTrue === "partly" ? "Справдилося лише частково" : "Страх не справдився"),
            conclusion: review.lesson || ""
          });
          toast("Додано до Банку доказів 🛡️", "good");
        }
        checkAchievements();
        go("reminders");
      };
      $("[data-del]", card).onclick = () => confirmModal(
        "Прибрати запис?",
        "Він потрапить у папку «Тіні забутих предків» унизу щоденника. Звідти можна повернути або видалити назавжди.",
        () => { S.archiveEntry(e.id); toast("У тінях забутих предків 🌑", "good"); go("history"); },
        "Прибрати",
        true
      );

      list.appendChild(card);
    });
  }

  /* ===================== БАНК ДОКАЗІВ ===================== */
  function viewEvidence() {
    const ev = S.state.evidence;
    $("#view").innerHTML = `
      <div class="page-head"><h1>🛡️ Банк доказів</h1><p>Твоя особиста колекція доказів того, що страхи не завжди стають реальністю.</p></div>
      ${ev.length ? `<div class="banner banner-violet"><div class="b-ico">💪</div><div><b>${ev.length} ${pluralUk(ev.length,"доказ","докази","доказів")}, що тривога часто помиляється</b><p>Перечитуй це, коли страх знову намагається переконати тебе у найгіршому.</p></div></div>` : ""}
      <div id="ev-list">${ev.length ? ev.map(x => `
        <div class="item">
          <div class="item-head"><span class="pill pill-red">Страх</span><span class="item-date">${fmtDate(x.date)}</span></div>
          <div class="item-body">${esc(x.fear)}</div>
          <div style="margin-top:10px"><span class="pill pill-green">Реальність</span><div class="item-body">${esc(x.realResult)}</div></div>
          ${x.conclusion ? `<div style="margin-top:10px"><span class="pill pill-violet">Висновок</span><div class="item-body">${esc(x.conclusion)}</div></div>` : ""}
          <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn btn-ghost btn-sm" data-del="${x.id}">Видалити</button></div>
        </div>`).join("") : emptyBlock("🛡️", "Банк ще порожній. Коли ти відкриєш запис і страх не справдиться — доказ з'явиться тут автоматично.")}</div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost btn-sm" id="add-ev">+ Додати доказ вручну</button></div>
    `;
    $$("[data-del]", $("#view")).forEach(b => b.onclick = () => confirmModal("Видалити доказ?", "", () => { S.removeEvidence(b.dataset.del); go("evidence"); }, "Видалити", true));
    $("#add-ev").onclick = () => {
      openModal(`<h2>Додати доказ</h2>
        <div class="stack" style="margin-top:12px">
          <label class="field"><span>Страх</span><textarea id="m-fear" placeholder="Чого я боялася"></textarea></label>
          <label class="field"><span>Реальний результат</span><textarea id="m-real" placeholder="Що сталося насправді"></textarea></label>
          <label class="field"><span>Висновок</span><textarea id="m-conc" placeholder="Чого це навчило"></textarea></label>
          <button class="btn btn-primary" id="m-save">Зберегти</button>
        </div>`);
      $("#m-save").onclick = () => {
        const fear = $("#m-fear").value.trim();
        if (!fear) { toast("Опиши страх", "warn"); return; }
        S.addEvidence({ fear, realResult: $("#m-real").value.trim() || "Не справдився", conclusion: $("#m-conc").value.trim() });
        closeModal(); checkAchievements(); go("evidence");
      };
    };
  }

  /* ===================== МОЇ РЕСУРСИ ===================== */
  function viewResources() {
    const ranking = S.resourceRanking();
    const maxUses = Math.max(1, ...ranking.map(r => r.uses));
    $("#view").innerHTML = `
      <div class="page-head"><h1>🌱 Мої ресурси</h1><p>Те, що допомагає саме тобі, та наскільки це ефективно.</p></div>
      <div class="card">
        <div class="card-title">Додати ресурс або відмітити, що допомогло</div>
        <div class="chip-row" id="res-sugg">${C.RESOURCE_SUGGESTIONS.map(s=>`<button class="chip" data-res="${esc(s)}">+ ${esc(s)}</button>`).join("")}</div>
        <div class="row" style="margin-top:12px">
          <input id="res-custom" type="text" placeholder="Свій метод заспокоєння..." class="field" style="flex:1;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2)">
          <button class="btn btn-primary" id="res-add">Додати</button>
        </div>
      </div>
      <h2 class="section-title">Рейтинг ефективності</h2>
      <div class="card">
        ${ranking.length ? ranking.map((r,i)=>`
          <div style="padding:10px 0;border-bottom:${i<ranking.length-1?"1px solid var(--line)":"none"}">
            <div class="row spread"><b>${["🥇","🥈","🥉"][i]||"🌿"} ${esc(r.name)}</b><span class="faint">${r.uses} ${pluralUk(r.uses,"раз","рази","разів")} · ефект ${r.avg||"–"}/5</span></div>
            <div class="bar" style="margin-top:8px"><i style="width:${Math.round(r.uses/maxUses*100)}%"></i></div>
          </div>`).join("") : emptyBlock("🌱","Поки порожньо. Відмічай, що допомагає тобі заспокоїтися — і тут з'явиться твій особистий рейтинг.")}
      </div>`;
    $$("[data-res]", $("#view")).forEach(b => b.onclick = () => { S.addResourceUse(b.dataset.res, 4); toast(`«${b.dataset.res}» додано 🌱`, "good"); go("resources"); });
    $("#res-add").onclick = () => {
      const v = $("#res-custom").value.trim();
      if (!v) return;
      S.addResourceUse(v, 4); go("resources");
    };
  }

  /* ===================== СКАРБНИЧКА ===================== */
  const TREASURE_TYPES = [
    { v: "quote", label: "Цитата", icon: "❝" },
    { v: "affirmation", label: "Афірмація", icon: "🌟" },
    { v: "photo", label: "Фото моменту", icon: "📷" },
    { v: "achievement", label: "Досягнення", icon: "🏅" },
    { v: "message", label: "Тепле повідомлення", icon: "✉" },
    { v: "memory", label: "Спогад", icon: "🌈" },
    { v: "victory", label: "Перемога над тривогою", icon: "🏆" }
  ];
  function treasureLabel(v) { return (TREASURE_TYPES.find(t => t.v === v) || { label: v }).label; }

  function viewTreasure() {
    const t = S.state.treasure;
    $("#view").innerHTML = `
      <div class="page-head"><h1>💝 Скарбничка підтримки</h1><p>Збирай те, що зігріває й нагадує, хто ти насправді.</p></div>
      <div class="card">
        <div class="card-title">Додати у скарбничку</div>
        <div class="grid grid-2">
          <label class="field"><span>Тип</span>
            <select id="t-type">${TREASURE_TYPES.map(x=>`<option value="${x.v}">${x.icon} ${x.label}</option>`).join("")}</select></label>
          <label class="field"><span>Фото (необов'язково)</span><input id="t-photo" type="file" accept="image/*"></label>
        </div>
        <label class="field" style="margin-top:12px"><span>Текст</span><textarea id="t-text" placeholder="Цитата, спогад, тепле слово..."></textarea></label>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" id="t-add">Зберегти</button></div>
      </div>
      <h2 class="section-title">Моя колекція (${t.length})</h2>
      <div class="gallery" id="t-gallery">
        ${t.length ? t.map(x=>`
          <div class="t-card">
            <button class="t-del" data-del="${x.id}">🗑</button>
            ${x.image ? `<img src="${x.image}" alt="">` : ""}
            <div class="t-body"><div class="t-type">${esc(treasureLabel(x.type))}</div>
            ${x.content ? `<div class="t-content">${esc(x.content)}</div>` : ""}</div>
          </div>`).join("") : emptyBlock("💝","Скарбничка порожня. Додай першу теплу думку чи фото.")}
      </div>`;

    let imageData = null;
    $("#t-photo").onchange = (e) => {
      const file = e.target.files[0]; if (!file) { imageData = null; return; }
      const reader = new FileReader();
      reader.onload = () => { imageData = reader.result; };
      reader.readAsDataURL(file);
    };
    $("#t-add").onclick = () => {
      const type = $("#t-type").value;
      const content = $("#t-text").value.trim();
      if (!content && !imageData) { toast("Додай текст або фото", "warn"); return; }
      S.addTreasure({ type, content, image: imageData });
      toast("Додано у скарбничку 💝", "good"); go("treasure");
    };
    $$("[data-del]", $("#view")).forEach(b => b.onclick = () => confirmModal("Видалити елемент?", "", () => { S.removeTreasure(b.dataset.del); go("treasure"); }, "Видалити", true));
  }

  /* ===================== КРИЗОВИЙ РЕЖИМ ===================== */
  let breathTimer = null;
  function openCrisis() {
    const ov = $("#crisis-overlay");
    const aff = randomAff();
    const lastFears = S.state.evidence.slice(0, 5);
    const ranking = S.resourceRanking().slice(0, 3);
    const treasures = S.state.treasure;
    const randTreasure = treasures.length ? treasures[Math.floor(Math.random() * treasures.length)] : null;

    ov.innerHTML = `
      <div class="crisis-wrap">
        <div class="crisis-top">
          <h2 style="margin:0">Ти в безпеці. Дихаймо разом 🤍</h2>
          <button class="crisis-close" id="crisis-close">×</button>
        </div>

        <div class="crisis-card">
          <h3>🫁 ${C.BREATHING.name}</h3>
          <div class="sub">${C.BREATHING.desc}</div>
          <div class="breath-stage"><div class="breath-ball" id="breath-ball">Натисни «Почати»</div></div>
          <div class="row" style="justify-content:center"><button class="btn" style="background:#fff;color:#1f9579" id="breath-btn">Почати дихати</button></div>
        </div>

        <div class="crisis-card g54321">
          <h3>🌍 Техніка заземлення 5-4-3-2-1</h3>
          <div class="sub" style="margin-bottom:6px">Торкнись кожного пункту, коли виконаєш його.</div>
          ${C.GROUNDING.map((g,i)=>`<div class="g-step" data-g="${i}"><div class="g-num">${g.n}</div><div>Назви <b>${g.n}</b> ${esc(g.text)}</div></div>`).join("")}
        </div>

        <div class="crisis-card">
          <h3>🌟 Афірмація</h3>
          <p style="font-size:18px;line-height:1.5;margin:0">${esc(aff)}</p>
        </div>

        <div class="crisis-card">
          <h3>🛡️ Згадай: ці страхи не справдилися</h3>
          ${lastFears.length ? lastFears.map(f=>`<div class="crisis-step"><b>Боялася:</b> ${esc(f.fear)}<br><b>А сталося:</b> ${esc(f.realResult)}</div>`).join("") : `<div class="sub">Тут з'являться твої докази, коли ти почнете вести щоденник. А поки що — просто дозволь собі видихнути.</div>`}
        </div>

        ${ranking.length ? `<div class="crisis-card"><h3>🌱 Що тобі допомагає</h3>
          ${ranking.map(r=>`<div class="crisis-step">${esc(r.name)} <span style="opacity:.7">· допомагало ${r.uses} ${pluralUk(r.uses,"раз","рази","разів")}</span></div>`).join("")}
          <div class="sub" style="margin-top:8px">Можливо, варто спробувати щось із цього прямо зараз.</div></div>` : ""}

        ${randTreasure ? `<div class="crisis-card"><h3>💝 Зі скарбнички підтримки</h3>
          ${randTreasure.image ? `<img class="treasure-photo" src="${randTreasure.image}" alt="">` : ""}
          ${randTreasure.content ? `<p style="font-size:17px;line-height:1.5">${esc(randTreasure.content)}</p>` : ""}</div>` : ""}

        <div class="row" style="justify-content:center;margin-top:8px">
          <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="crisis-newentry">Записати, що відчуваю</button>
          <button class="btn" style="background:#fff;color:#1f9579" id="crisis-done">Мені вже легше 🤍</button>
        </div>
      </div>`;
    ov.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    genderizeDOM(ov);

    // 5-4-3-2-1
    $$(".g-step", ov).forEach(s => s.onclick = () => s.classList.toggle("done"));

    // дихання
    const ball = $("#breath-ball", ov);
    const btn = $("#breath-btn", ov);
    let running = false, idx = 0;
    function stopBreath() { running = false; clearTimeout(breathTimer); ball.className = "breath-ball"; ball.textContent = "Натисни «Почати»"; btn.textContent = "Почати дихати"; }
    function step() {
      if (!running) return;
      const ph = C.BREATHING.phases[idx % C.BREATHING.phases.length];
      ball.className = "breath-ball " + ph.cls;
      let left = ph.sec;
      ball.textContent = `${ph.label} · ${left}`;
      const tick = () => {
        if (!running) return;
        left--;
        if (left > 0) { ball.textContent = `${ph.label} · ${left}`; breathTimer = setTimeout(tick, 1000); }
        else { idx++; step(); }
      };
      breathTimer = setTimeout(tick, 1000);
    }
    btn.onclick = () => { if (running) { stopBreath(); } else { running = true; idx = 0; btn.textContent = "Зупинити"; step(); } };

    $("#crisis-close", ov).onclick = closeCrisis;
    $("#crisis-done", ov).onclick = () => { closeCrisis(); toast("Ти молодець, що подбали про себе 🤍", "good"); };
    $("#crisis-newentry", ov).onclick = () => { closeCrisis(); go("new"); };
  }
  function closeCrisis() {
    clearTimeout(breathTimer);
    $("#crisis-overlay").classList.add("hidden");
    $("#crisis-overlay").innerHTML = "";
    document.body.style.overflow = "";
  }

  // SOS до входу: легке заспокоєння без залежності від акаунта (S.state).
  function openQuickCalm() {
    const ov = $("#crisis-overlay");
    ov.innerHTML = `
      <div class="crisis-wrap">
        <div class="crisis-top">
          <h2 style="margin:0">Ти в безпеці. Дихаймо разом 🤍</h2>
          <button class="crisis-close" id="qc-close">×</button>
        </div>

        <div class="crisis-card">
          <h3>🫁 ${C.BREATHING.name}</h3>
          <div class="sub">${C.BREATHING.desc}</div>
          <div class="breath-stage"><div class="breath-ball" id="qc-ball">Натисни «Почати»</div></div>
          <div class="row" style="justify-content:center"><button class="btn" style="background:#fff;color:#1f9579" id="qc-breath">Почати дихати</button></div>
        </div>

        <div class="crisis-card g54321">
          <h3>🌍 Техніка заземлення 5-4-3-2-1</h3>
          <div class="sub" style="margin-bottom:6px">Торкнись кожного пункту, коли виконаєш його.</div>
          ${C.GROUNDING.map((g,i)=>`<div class="g-step" data-g="${i}"><div class="g-num">${g.n}</div><div>Назви <b>${g.n}</b> ${esc(g.text)}</div></div>`).join("")}
        </div>

        <div class="crisis-card">
          <h3>🌿 Нагадування</h3>
          <p style="font-size:17px;line-height:1.5;margin:0">Більшість тривожних думок так і не стають реальністю. Зараз твоя єдина задача — повільно дихати. Усе інше зачекає.</p>
        </div>

        <div class="row" style="justify-content:center;margin-top:8px">
          <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="qc-signup">Завести щоденник</button>
          <button class="btn" style="background:#fff;color:#1f9579" id="qc-done">Мені вже легше 🤍</button>
        </div>
      </div>`;
    ov.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    $$(".g-step", ov).forEach(s => s.onclick = () => s.classList.toggle("done"));

    const ball = $("#qc-ball", ov);
    const btn = $("#qc-breath", ov);
    let running = false, idx = 0;
    function stopBreath() { running = false; clearTimeout(breathTimer); ball.className = "breath-ball"; ball.textContent = "Натисни «Почати»"; btn.textContent = "Почати дихати"; }
    function step() {
      if (!running) return;
      const ph = C.BREATHING.phases[idx % C.BREATHING.phases.length];
      ball.className = "breath-ball " + ph.cls;
      let left = ph.sec;
      ball.textContent = `${ph.label} · ${left}`;
      const tick = () => {
        if (!running) return;
        left--;
        if (left > 0) { ball.textContent = `${ph.label} · ${left}`; breathTimer = setTimeout(tick, 1000); }
        else { idx++; step(); }
      };
      breathTimer = setTimeout(tick, 1000);
    }
    btn.onclick = () => { if (running) { stopBreath(); } else { running = true; idx = 0; btn.textContent = "Зупинити"; step(); } };

    $("#qc-close", ov).onclick = closeCrisis;
    $("#qc-done", ov).onclick = () => { closeCrisis(); };
    $("#qc-signup", ov).onclick = () => {
      closeCrisis();
      const reg = $("#auth-reg");
      if (reg) reg.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { const n = $("#auth-name"); if (n) n.focus(); }, 480);
    };
  }

  /* ===================== МОЇ МАЛЕНЬКІ РАДОЩІ ===================== */
  function viewJoys() {
    const types = C.CALM.joyTypes;
    const all = S.state.littleJoys || [];
    const grouped = {};
    types.forEach(t => grouped[t.id] = []);
    all.forEach(j => { (grouped[j.category] || (grouped[j.category] = [])).push(j); });

    $("#view").innerHTML = `
      <button class="btn btn-ghost btn-sm" id="j-back">← На головну</button>
      <div class="page-head" style="margin-top:14px"><h1>Мої маленькі радощі</h1>
        <p>Збери тут те, що тебе тішить. Я час від часу нагадуватиму — щоб ти не забувала про себе.</p></div>

      <div class="card">
        <div class="card-title">Додати радість</div>
        <div class="chip-row" id="j-cats" style="margin:8px 0 12px">
          ${types.map((t, i) => `<button class="chip ${i===0?"sel":""}" data-cat="${t.id}">${t.icon} ${esc(t.label)}</button>`).join("")}
        </div>
        <div class="row" style="gap:8px">
          <input id="j-text" class="calm-input" style="color:var(--ink);background:var(--surface-2);border:1px solid var(--line);flex:1" placeholder="Напр. улюблена книга, фільм, плейлист, маршрут для прогулянки..." />
          <button class="btn btn-primary" id="j-add">Додати</button>
        </div>
      </div>

      <div id="j-list" style="margin-top:16px"></div>
    `;

    let pickedCat = types[0].id;
    $$("#j-cats .chip", $("#view")).forEach(b => b.onclick = () => {
      $$("#j-cats .chip", $("#view")).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); pickedCat = b.dataset.cat;
    });
    const addJoy = () => {
      const v = $("#j-text").value.trim();
      if (!v) { toast("Напиши, що саме тебе тішить 🙂", "warn"); return; }
      S.addLittleJoy(pickedCat, v);
      toast("Додано 🌿", "good");
      render();
    };
    $("#j-add").onclick = addJoy;
    $("#j-text").addEventListener("keydown", e => { if (e.key === "Enter") addJoy(); });
    $("#j-back").onclick = () => go("home");

    const list = $("#j-list");
    if (!all.length) {
      list.innerHTML = emptyBlock("🌱", "Поки порожньо. Додай хоча б одну річ, яка дарує тобі тепло.");
      return;
    }
    list.innerHTML = types.filter(t => grouped[t.id] && grouped[t.id].length).map(t => `
      <h2 class="section-title">${t.icon} ${esc(t.label)}</h2>
      <div class="stack">
        ${grouped[t.id].map(j => `
          <div class="item" style="display:flex;align-items:center;gap:10px">
            <div style="flex:1">${esc(j.text)}</div>
            <button class="btn btn-ghost btn-sm" data-del="${j.id}">Прибрати</button>
          </div>`).join("")}
      </div>`).join("");
    $$("[data-del]", list).forEach(b => b.onclick = () => { S.removeLittleJoy(b.dataset.del); render(); });
  }

  /* ===================== ХОРОШІ ПОДІЇ + КАЛЕНДАР ===================== */
  function dayKeyLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function calendarMark(dayKey) {
    const w = (S.state.wellbeing || {})[dayKey];
    const anxiety = wellbeingAnxiety(w);
    const hasGood = (S.state.goodEvents || []).some(e => e.dayKey === dayKey);
    const ritualLvl = ritualDayTension(dayKey);
    const level = anxiety != null ? anxiety : ritualLvl;
    if (level != null && level >= 7) return { mark: "😟", cls: "anxious", title: "Тривожний день" };
    if (hasGood || (level != null && level <= 4)) return { mark: "🙂", cls: "good", title: "Хороший / спокійний день" };
    return { mark: "", cls: "", title: "" };
  }

  function goodCalendarHTML(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const start = (first.getDay() + 6) % 7; // понеділок перший
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(`<div class="cal-cell empty"></div>`);
    for (let d = 1; d <= days; d++) {
      const key = dayKeyLocal(new Date(year, month, d));
      const m = calendarMark(key);
      const count = (S.state.goodEvents || []).filter(e => e.dayKey === key).length;
      cells.push(`<div class="cal-cell ${m.cls}" title="${esc(m.title)}">
        <span class="cal-day">${d}</span>
        ${m.mark ? `<span class="cal-face">${m.mark}</span>` : ""}
        ${count ? `<span class="cal-count">${count}</span>` : ""}
      </div>`);
    }
    return `
      <div class="good-calendar">
        <div class="row spread">
          <div class="card-title" style="margin:0">${MONTHS[month]} ${year}</div>
          <div class="cal-legend"><span>🙂 хороший/спокійний</span><span>😟 тривожний</span></div>
        </div>
        <div class="cal-weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Нд</span></div>
        <div class="cal-grid">${cells.join("")}</div>
      </div>`;
  }

  function viewGoodEvents() {
    const events = S.state.goodEvents || [];
    const today = S.todayWellbeing();
    const goodDesc = isMale()
      ? "Це твій банк приємних фактів. У тривожні періоди він нагадує: хороше теж стається, навіть якщо мозок тимчасово фокусується на загрозах."
      : "Це твоя колекція приємних фактів. У тривожні періоди вона нагадує: хороше теж стається, навіть якщо мозок тимчасово фокусується на загрозах.";
    const goodPrompt = isMale()
      ? "Наприклад: була нормальна прогулянка, добре поговорив, почув класну пісню..."
      : "Наприклад: була гарна прогулянка, добре поговорила, почула класну пісню...";
    $("#view").innerHTML = `
      <div class="page-head"><h1>Хороші події</h1>
        <p>${goodDesc}</p></div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Додати подію сьогодні</div>
          <p class="muted">Якщо день гарний — зроби його ще кращим: поміть маленьку приємність, цікаву розмову, добрий жест, смачну каву, прогулянку чи будь-яку теплу деталь.</p>
          <label class="field" style="margin-top:12px"><span>Що приємного або цікавого сталося?</span>
            <textarea id="good-text" rows="3" placeholder="${esc(goodPrompt)}"></textarea></label>
          <div class="row" style="justify-content:space-between;margin-top:12px;gap:10px">
            ${today ? `<span class="pill ${today.level >= 7 ? "pill-red" : today.level <= 4 ? "pill-green" : "pill-warn"}">Самопочуття: ${today.level}/10</span>` : `<span class="faint">Сьогодні ще немає оцінки самопочуття</span>`}
            <button class="btn btn-primary btn-sm" id="good-save">Зберегти</button>
          </div>
        </div>
        <div class="card">${goodCalendarHTML()}</div>
      </div>

      <h2 class="section-title">Усі хороші події (${events.length})</h2>
      <div class="stack" id="good-list">
        ${events.length ? events.map(e => `
          <div class="item">
            <div class="item-head">
              <span class="pill pill-green">${fmtDate(e.date)}</span>
              <button class="btn btn-ghost btn-sm" data-del-good="${e.id}">Прибрати</button>
            </div>
            <div class="item-body">${esc(e.text)}</div>
          </div>`).join("") : emptyBlock("🙂", "Поки порожньо. Додай першу хорошу подію — навіть зовсім маленьку.")}
      </div>`;

    $("#good-save").onclick = () => {
      const text = $("#good-text").value.trim();
      if (!text) { toast("Опиши приємну подію", "warn"); return; }
      S.addGoodEvent(text);
      toast("Хорошу подію збережено 🙂", "good");
      render();
    };
    $$("[data-del-good]", $("#view")).forEach(b => b.onclick = () => {
      S.removeGoodEvent(b.dataset.delGood);
      render();
    });
  }

  function viewGratitude() {
    const all = S.state.gratitude || [];
    const today = todayKey();
    const todayItems = all.filter(x => x.dayKey === today);
    const title = isMale() ? "За що я сьогодні вдячний" : "За що я сьогодні вдячна";
    const prompt = isMale()
      ? "Запиши одну конкретну річ, за яку ти сьогодні вдячний. Не треба шукати щось велике — достатньо чесної дрібниці."
      : "Запиши одну конкретну річ, за яку ти сьогодні вдячна. Не треба шукати щось велике — достатньо чесної дрібниці.";
    $("#view").innerHTML = `
      <div class="page-head"><h1>${esc(title)}</h1>
        <p>Цей розділ допомагає мозку бачити не лише тривогу, а й те, що підтримує тебе сьогодні.</p></div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Сьогоднішня вдячність</div>
          <p class="muted">${esc(prompt)}</p>
          <label class="field" style="margin-top:12px"><span>${isMale() ? "Я вдячний за..." : "Я вдячна за..."}</span>
            <textarea id="gratitude-text" rows="4" placeholder="${isMale() ? "Наприклад: за спокійну розмову, прогулянку, підтримку друга..." : "Наприклад: за спокійну розмову, прогулянку, підтримку подруги..."}"></textarea></label>
          <div class="row" style="justify-content:flex-end;margin-top:12px">
            <button class="btn btn-primary btn-sm" id="gratitude-save">Зберегти</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Сьогодні вже записано</div>
          ${todayItems.length ? `<div class="stack">${todayItems.map(x => `
            <div class="item" style="box-shadow:none">
              <div class="item-body">${esc(x.text)}</div>
            </div>`).join("")}</div>` : emptyBlock("∴", "Поки немає записів за сьогодні. Почни з однієї простої речі.")}
        </div>
      </div>

      <h2 class="section-title">Усі записи вдячності (${all.length})</h2>
      <div class="stack" id="gratitude-list">
        ${all.length ? all.map(x => `
          <div class="item">
            <div class="item-head">
              <span class="pill pill-violet">${fmtDate(x.date)}</span>
              <button class="btn btn-ghost btn-sm" data-del-gratitude="${x.id}">Прибрати</button>
            </div>
            <div class="item-body">${esc(x.text)}</div>
          </div>`).join("") : emptyBlock("∴", "Тут з'являться твої записи вдячності.")}
      </div>`;

    $("#gratitude-save").onclick = () => {
      const text = $("#gratitude-text").value.trim();
      if (!text) { toast(isMale() ? "Напиши, за що ти вдячний сьогодні" : "Напиши, за що ти вдячна сьогодні", "warn"); return; }
      S.addGratitude(text);
      toast("Запис вдячності збережено ∴", "good");
      render();
    };
    $$("[data-del-gratitude]", $("#view")).forEach(b => b.onclick = () => {
      S.removeGratitude(b.dataset.delGratitude);
      render();
    });
  }

  /* ===================== ПРАКТИКА «ПОРАДА ПОДРУЗІ» ===================== */
  function viewFriendPractice() {
    const notes = S.state.friendNotes || [];
    const title = isMale() ? "Якби це сталося з моїм другом" : "Якби це сталося у моєї кращої подруги";
    const situationPlaceholder = isMale()
      ? "Уяви, що це сталося з твоїм другом. Опиши, що відбувається..."
      : "Уяви, що це сталося з твоєю найкращою подругою. Опиши, що відбувається...";
    const adviceLabel = isMale() ? "Що б ти йому порадив?" : "Що б ти їй порадила?";
    const advicePlaceholder = isMale()
      ? "Які спокійні, чесні слова ти б сказав йому? Як би підтримав?"
      : "Які теплі, мудрі слова ти б сказала їй? Як би заспокоїла та підтримала?";
    const emptyText = isMale()
      ? "Поки порожньо. Спробуй поглянути на свою ситуацію очима доброго друга."
      : "Поки порожньо. Спробуй поглянути на свою ситуацію очима доброї подруги.";
    $("#view").innerHTML = `
      <div class="page-head"><h1>${esc(title)}</h1>
        <p>Ми часто буваємо добрішими до інших, ніж до себе. Опиши ситуацію збоку — і подаруй собі ту саму підтримку.</p></div>

      <div class="card">
        <label class="field"><span>Ситуація</span>
          <textarea id="fp-situation" rows="3" placeholder="${esc(situationPlaceholder)}"></textarea></label>

        <label class="field" style="margin-top:14px"><span>${esc(adviceLabel)}</span>
          <textarea id="fp-advice" rows="3" placeholder="${esc(advicePlaceholder)}"></textarea></label>

        <div class="row" style="justify-content:flex-end;margin-top:16px">
          <button class="btn btn-primary" id="fp-save">Зберегти 💚</button>
        </div>
      </div>

      <div id="fp-list" style="margin-top:18px"></div>
    `;

    $("#fp-save").onclick = () => {
      const situation = $("#fp-situation").value.trim();
      const advice = $("#fp-advice").value.trim();
      if (!situation && !advice) { toast("Опиши ситуацію та свою пораду 🙏", "warn"); return; }
      S.addFriendNote(situation, advice);
      openModal(`
        <div style="text-align:center;padding:6px 4px">
          <div style="font-size:40px">💚</div>
          <p style="font-size:23px;line-height:1.4;font-family:var(--font-hand);margin:12px 0 6px">${esc(C.CALM.friendSelf)}</p>
          <p class="muted" style="margin:0">Ці слова — і для тебе теж. Перечитай їх, коли буде важко.</p>
        </div>
        <div class="row" style="justify-content:center;margin-top:14px">
          <button class="btn btn-primary" id="fp-ok">Дякую</button>
        </div>`);
      $("#fp-ok").onclick = () => { closeModal(); render(); };
    };

    const list = $("#fp-list");
    if (!notes.length) {
      list.innerHTML = emptyBlock("✉", emptyText);
      return;
    }
    list.innerHTML = `<h2 class="section-title">Мої поради собі (${notes.length})</h2>` + notes.map(n => `
      <div class="item">
        <div class="item-head">
          <div class="item-date">${fmtDate(n.date)}</div>
          <button class="btn btn-ghost btn-sm" data-del="${n.id}">Прибрати</button>
        </div>
        ${n.situation ? `<div class="item-body"><b>Ситуація:</b><br>${esc(n.situation)}</div>` : ""}
        ${n.advice ? `<div class="advice" style="margin-top:10px"><div class="advice-ico">💚</div><div>${esc(n.advice)}</div></div>` : ""}
      </div>`).join("");
    $$("[data-del]", list).forEach(b => b.onclick = () => { S.removeFriendNote(b.dataset.del); render(); });
  }

  /* ===================== ОСНОВНИЙ СЦЕНАРІЙ «МЕНІ ТРИВОЖНО» ===================== */
  let calmState = null;
  let calmBreathTimer = null;

  function startCalm(mode) {
    calmState = { mode, step: 0, anxietyStart: null, anxietyEnd: null, category: null, answers: {}, joy: [] };
    calmState.life = { forself: "", action: "" };
    calmState.steps = mode === "quick"
      ? ["breathe", "ground", "affirmation", "done"]
      : ["anxiety", "category", "questions", "conclusion", "breathe", "ground", "affirmation", "life", "done"];
    document.body.style.overflow = "hidden";
    $("#calm-overlay").classList.remove("hidden");
    renderCalm();
  }

  function closeCalm() {
    clearInterval(calmBreathTimer); calmBreathTimer = null;
    $("#calm-overlay").classList.add("hidden");
    $("#calm-overlay").innerHTML = "";
    document.body.style.overflow = "";
    calmState = null;
    if (route === "home") render();
  }

  function calmNext() { calmState.step++; renderCalm(); }
  function calmPrev() { if (calmState.step > 0) { calmState.step--; renderCalm(); } }

  function calmShell(inner, opts = {}) {
    const steps = calmState.steps;
    const total = steps.length - 1; // без 'done'
    const idx = Math.min(calmState.step, total);
    const pct = Math.round(idx / total * 100);
    $("#calm-overlay").innerHTML = `
      <div class="crisis-wrap">
        <div class="crisis-top">
          <div style="flex:1">
            <div class="bar" style="background:rgba(255,255,255,.25);max-width:260px"><i style="width:${pct}%;background:#fff"></i></div>
          </div>
          <button class="crisis-close" id="calm-close">×</button>
        </div>
        ${inner}
      </div>`;
    $("#calm-close").onclick = () => {
      if (opts.confirmClose) confirmModal("Завершити раніше?", "Прогрес цього проходження не збережеться.", closeCalm, "Вийти");
      else closeCalm();
    };
    genderizeDOM($("#calm-overlay"));
  }

  function renderCalm() {
    clearInterval(calmBreathTimer); calmBreathTimer = null;
    const step = calmState.steps[calmState.step];
    ({
      anxiety: calmStepAnxiety, category: calmStepCategory, questions: calmStepQuestions,
      conclusion: calmStepConclusion, breathe: calmStepBreathe, ground: calmStepGround,
      affirmation: calmStepAffirmation, life: calmStepLife, done: calmStepDone
    }[step] || calmStepDone)();
  }

  function calmStepAnxiety() {
    const v = calmState.anxietyStart;
    calmShell(`
      <div class="crisis-card">
        <h3>🫧 Перш ніж почати</h3>
        <p class="sub" style="font-size:16px;margin-bottom:14px">Наскільки сильна твоя тривога прямо зараз?</p>
        <div class="scale calm-scale" data-scale="anx">
          ${Array.from({length:10},(_,i)=>`<button type="button" data-v="${i+1}" class="${v===i+1?"sel":""}">${i+1}</button>`).join("")}
        </div>
        <div class="scale-legend" style="color:rgba(255,255,255,.8)"><span>спокій</span><span>дуже сильно</span></div>
        <div class="row" style="justify-content:flex-end;margin-top:20px">
          <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-go" ${v?"":"disabled"}>Далі →</button>
        </div>
      </div>`, { confirmClose: true });
    $$('[data-scale="anx"] button', $("#calm-overlay")).forEach(b => b.onclick = () => {
      calmState.anxietyStart = +b.dataset.v;
      $$('[data-scale="anx"] button', $("#calm-overlay")).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); $("#calm-go").disabled = false;
    });
    $("#calm-go").onclick = calmNext;
  }

  function calmStepCategory() {
    calmShell(`
      <div class="crisis-card">
        <h3>${esc(C.CALM.attentionQuestion)}</h3>
        <p class="sub" style="margin-bottom:14px">Обери одне — те, що відгукується найсильніше.</p>
        <div class="calm-cats">
          ${C.CALM.categories.map(c => `<button class="calm-cat" data-cat="${c.id}"><span style="font-size:26px">${c.icon}</span><span>${esc(c.title)}</span></button>`).join("")}
        </div>
      </div>`, { confirmClose: true });
    $$("[data-cat]", $("#calm-overlay")).forEach(b => b.onclick = () => {
      calmState.category = b.dataset.cat; calmNext();
    });
  }

  function calmStepQuestions() {
    const cat = C.CALM.categories.find(c => c.id === calmState.category) || C.CALM.categories[0];
    calmShell(`
      <div class="crisis-card">
        <h3>${cat.icon} ${esc(cat.title)}</h3>
        <p class="sub" style="margin-bottom:6px">Відповідай коротко або просто подумай над кожним питанням. Не аналізуй надто довго — мета лише відділити факти від страху.</p>
        <div class="stack" style="margin-top:12px">
          ${cat.questions.map((q, i) => `
            <div class="calm-q">
              <label class="calm-q-label">${esc(q)}</label>
              <textarea class="calm-input" data-q="${i}" rows="2" placeholder="${i===0?'Можна відповісти подумки...':''}">${esc(calmState.answers[i] || "")}</textarea>
            </div>`).join("")}
        </div>
        <div class="row spread" style="margin-top:18px">
          <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="calm-back">← Назад</button>
          <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-go">Готово →</button>
        </div>
      </div>`, { confirmClose: true });
    $$("[data-q]", $("#calm-overlay")).forEach(t => t.oninput = () => { calmState.answers[+t.dataset.q] = t.value; });
    $("#calm-back").onclick = calmPrev;
    $("#calm-go").onclick = calmNext;
  }

  function calmStepConclusion() {
    const cat = C.CALM.categories.find(c => c.id === calmState.category) || C.CALM.categories[0];
    calmShell(`
      <div class="crisis-card">
        <h3>💚 Спокійний погляд</h3>
        <p style="font-size:20px;line-height:1.5;font-family:var(--font-hand)">${esc(cat.conclusion)}</p>
      </div>
      <div class="row" style="justify-content:center;gap:10px">
        <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="calm-back">← Назад</button>
        <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-go">Тепер подихаємо 🫁</button>
      </div>`, { confirmClose: true });
    $("#calm-back").onclick = calmPrev;
    $("#calm-go").onclick = calmNext;
  }

  function calmStepBreathe() {
    const timers = C.CALM.timers;
    const quick = calmState.mode === "quick";
    calmShell(`
      <div class="crisis-card">
        <h3>🫁 Дихання животом${quick ? " · 1 хвилина" : ""}</h3>
        <p class="sub" style="font-size:16px;line-height:1.5">${esc(C.CALM.breathingInstruction)}</p>
        <div class="breath-stage"><div class="breath-ball" id="calm-ball">${quick ? "Дихай зі мною" : "Обери час<br>і почни"}</div></div>
        <div class="row" style="justify-content:center;gap:8px" id="calm-timers">
          ${timers.map(m => `<button class="chip calm-timer" data-min="${m}">${m} хв</button>`).join("")}
        </div>
        <div id="calm-breath-status" class="sub" style="text-align:center;margin-top:12px;min-height:20px"></div>
        <div class="row" style="justify-content:space-between;margin-top:16px">
          <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="calm-stop">Зупинити</button>
          <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-go">Далі →</button>
        </div>
      </div>`, { confirmClose: true });

    const ball = $("#calm-ball");
    const status = $("#calm-breath-status");
    let phaseIdx = 0, total = 0, elapsed = 0;
    const phases = C.CALM.breathingPhases;

    function stop() { clearInterval(calmBreathTimer); calmBreathTimer = null; ball.className = "breath-ball"; }
    function startBreath(minutes) {
      stop(); total = minutes * 60; elapsed = 0; phaseIdx = 0;
      let phaseLeft = phases[0].sec;
      ball.className = "breath-ball " + phases[0].cls;
      ball.textContent = phases[0].label;
      calmBreathTimer = setInterval(() => {
        elapsed++; phaseLeft--;
        const remain = total - elapsed;
        status.textContent = `Залишилось ${Math.floor(remain/60)}:${String(remain%60).padStart(2,"0")}`;
        if (phaseLeft <= 0) {
          phaseIdx = (phaseIdx + 1) % phases.length;
          phaseLeft = phases[phaseIdx].sec;
          ball.className = "breath-ball " + phases[phaseIdx].cls;
          ball.textContent = phases[phaseIdx].label;
        }
        if (elapsed >= total) { stop(); ball.className = "breath-ball"; ball.textContent = "Чудово 🤍"; status.textContent = "Вправу завершено"; }
      }, 1000);
    }
    $$(".calm-timer", $("#calm-overlay")).forEach(b => b.onclick = () => {
      $$(".calm-timer", $("#calm-overlay")).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); startBreath(+b.dataset.min);
    });
    $("#calm-stop").onclick = () => { stop(); ball.textContent = "Пауза"; };
    $("#calm-go").onclick = () => { stop(); calmNext(); };
    // SOS: одразу запускаємо дихання животом на 1 хвилину
    if (quick) {
      const oneMin = $$(".calm-timer", $("#calm-overlay")).find(x => +x.dataset.min === 1);
      if (oneMin) oneMin.classList.add("sel");
      startBreath(1);
    }
  }

  function calmStepGround() {
    calmShell(`
      <div class="crisis-card g54321">
        <h3>🌍 Коротке заземлення</h3>
        <p class="sub" style="margin-bottom:6px">Торкнися кожного пункту, коли виконаєш його.</p>
        ${C.CALM.groundingSteps.map((s, i) => `<div class="g-step" data-g="${i}"><div class="g-num">${i+1}</div><div>${esc(s)}</div></div>`).join("")}
      </div>
      <div class="row" style="justify-content:center;gap:10px">
        <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="calm-back">← Назад</button>
        <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-go">Далі →</button>
      </div>`, { confirmClose: true });
    $$(".g-step", $("#calm-overlay")).forEach(s => s.onclick = () => s.classList.toggle("done"));
    $("#calm-back").onclick = calmPrev;
    $("#calm-go").onclick = calmNext;
  }

  function calmStepAffirmation() {
    const aff = C.CALM.returnAffirmations[Math.floor(Math.random() * C.CALM.returnAffirmations.length)];
    const last = calmState.mode === "quick";
    calmShell(`
      <div class="crisis-card" style="text-align:center">
        <h3 style="justify-content:center">🤍 ${esc(C.CALM.returnPhrase)}</h3>
        <p style="font-size:26px;line-height:1.35;font-family:var(--font-hand);margin:14px 0">${esc(aff)}</p>
      </div>
      <div class="row" style="justify-content:center;gap:10px">
        <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="calm-save">💝 Зберегти ці слова</button>
        <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-go">${last ? "Завершити 🌿" : "Далі →"}</button>
      </div>`, { confirmClose: true });
    $("#calm-save").onclick = () => { S.addTreasure({ type: "affirmation", content: aff }); toast("Додано у скарбничку 💝", "good"); };
    $("#calm-go").onclick = calmNext;
  }

  function calmStepLife() {
    const sel = calmState.joy;
    calmShell(`
      <div class="crisis-card">
        <h3>🌈 А тепер — до життя</h3>
        <p class="sub" style="margin-bottom:14px">Тривога забирає увагу. Поверни її туди, де тепло й твоє.</p>

        <div class="calm-q-label">${esc(C.CALM.lifeQuestions[0].q)}</div>
        <div class="chip-row" id="joy-row" style="margin-bottom:6px">
          ${C.CALM.joyOptions.map(o => `<button class="chip calm-joy ${sel.includes(o)?"sel":""}" data-joy="${esc(o)}">${esc(o)}</button>`).join("")}
        </div>
        <input id="joy-custom" class="calm-input" placeholder="Щось своє..." />

        <div class="calm-q-label" style="margin-top:16px">${esc(C.CALM.lifeQuestions[1].q)}</div>
        <textarea class="calm-input" id="life-forself" rows="2" placeholder="${esc(C.CALM.lifeQuestions[1].placeholder)}">${esc(calmState.life.forself)}</textarea>

        <div class="calm-q-label" style="margin-top:16px">${esc(C.CALM.lifeQuestions[2].q)}</div>
        <textarea class="calm-input" id="life-action" rows="2" placeholder="${esc(C.CALM.lifeQuestions[2].placeholder)}">${esc(calmState.life.action)}</textarea>

        <div class="row" style="justify-content:flex-end;margin-top:18px">
          <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-go">Завершити 🌿</button>
        </div>
      </div>`, { confirmClose: true });
    $$(".calm-joy", $("#calm-overlay")).forEach(b => b.onclick = () => {
      const j = b.dataset.joy;
      if (sel.includes(j)) { calmState.joy = sel.filter(x => x !== j); b.classList.remove("sel"); }
      else { sel.push(j); b.classList.add("sel"); }
    });
    $("#life-forself").oninput = e => calmState.life.forself = e.target.value;
    $("#life-action").oninput = e => calmState.life.action = e.target.value;
    $("#calm-go").onclick = () => {
      const custom = $("#joy-custom").value.trim();
      if (custom && !calmState.joy.includes(custom)) calmState.joy.push(custom);
      calmNext();
    };
  }

  function calmStepDone() {
    saveCalmSession();
    const aStart = calmState.anxietyStart;
    confetti();
    const closer = randomCloser();
    calmShell(`
      <div class="crisis-card" style="text-align:center">
        <h3 style="justify-content:center">Ти повернулася до себе 🌿</h3>
        <p style="font-size:20px;line-height:1.45;margin:10px 0;font-family:var(--font-hand)">${esc(closer)}</p>
        <p style="font-size:16px;line-height:1.5">Найважче вже позаду. Тривога — це хвиля, і вона щойно стала меншою.</p>
        ${calmState.joy.length ? `<p class="sub" style="margin-top:10px">Сьогодні тобі може зігріти душу: <b>${esc(calmState.joy.join(", "))}</b>. Спробуй знайти для цього хвилинку.</p>` : ""}
        ${aStart ? `<p class="sub" style="margin-top:6px">Я запам'ятала твій рівень тривоги, щоб показати динаміку в розділі «Мій прогрес».</p>` : ""}
      </div>
      <div class="row" style="justify-content:center;gap:10px">
        <button class="btn" style="background:rgba(255,255,255,.18);color:#fff" id="calm-again">↺ Ще раз</button>
        <button class="btn" style="background:#fff;color:var(--primary-d)" id="calm-done">До свого життя →</button>
      </div>`);
    // прибрати кнопку закриття-хрестик дубль не потрібен
    $("#calm-again").onclick = () => startCalm(calmState.mode);
    $("#calm-done").onclick = closeCalm;
  }

  function saveCalmSession() {
    if (calmState.saved) return;
    calmState.saved = true;
    const cat = C.CALM.categories.find(c => c.id === calmState.category);
    // зберігаємо як запис для аналітики
    if (calmState.mode === "full") {
      const answersText = Object.values(calmState.answers).filter(Boolean).join(" · ");
      S.addEntry({
        type: "calm",
        anxiety: calmState.anxietyStart || null,
        mood: null, energy: null,
        fear: answersText || (cat ? "Сценарій: " + cat.title : "Заспокоєння"),
        cause: "", trigger: cat ? cat.title : "", category: cat ? cat.title : "Інше",
        helped: ["Дихання животом", "Заземлення"].concat(calmState.joy || []),
        openDate: "", reviewed: true
      });
      S.addResourceUse("Дихання животом", 4);
      S.addResourceUse("Заземлення", 4);
      (calmState.joy || []).forEach(j => { S.addJoy(j); S.addLittleJoy("other", j); S.addResourceUse(j, 4); });
    } else {
      S.markCheckin(new Date().toISOString());
      S.addResourceUse("Швидке заспокоєння", 4);
    }
    // Прогрес лише після фактичного завершення сесії (анти-подвійний — у реєстрі дня).
    if (S.awardRecoveryProgress) S.awardRecoveryProgress("breath");
    // Делікатні частинки тільки після практики (не на кожному кліку).
    if (window.RecoveryArt) {
      const art = $(".recovery-home-art");
      if (art) RecoveryArt.burstParticles(art);
      else {
        const host = $("#calm-overlay .calm-card") || $("#calm-overlay");
        if (host) RecoveryArt.burstParticles(host);
      }
    }
    checkAchievements();
  }

  /* ===================== АНАЛІТИКА ===================== */
  let charts = [];
  function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch (e) {} }); charts = []; }

  function analyticsNoticeBanner(entriesCount, tgStats) {
    const tg = tgStats || { marks: 0, days: 0 };
    if (tg.marks > 0) {
      return `<div class="card analytics-banner analytics-span-12 analytics-banner-ok">
      <span class="analytics-banner-ico">📱</span>
      <div class="analytics-banner-text">
        <b>Telegram уже в статистиці</b>
        <span>${tg.marks} ${pluralUk(tg.marks, "відмітка", "відмітки", "відміток")} за ${tg.days} ${pluralUk(tg.days, "день", "дні", "днів")}. Нижче — у загальних метриках і «Стан за 7 днів».</span>
      </div>
      <button class="btn btn-primary btn-sm" id="analytics-new">Новий запис</button>
    </div>`;
    }
    const need = Math.max(0, 3 - entriesCount);
    const needText = `ще ${need} ${pluralUk(need, "запис", "записи", "записів")}`;
    return `<div class="card analytics-banner analytics-span-12">
      <span class="analytics-banner-ico">📊</span>
      <div class="analytics-banner-text">
        <b>Недостатньо даних</b>
        <span>Створи ${needText} у щоденнику або відміть стан у Telegram — з’явиться аналітика.</span>
      </div>
      <button class="btn btn-primary btn-sm" id="analytics-new">Новий запис</button>
    </div>`;
  }

  function analyticsWeek7Card(week7) {
    const filled = week7.filter(d => d.level != null).length;
    let inner = "";
    if (filled === 0) {
      inner = `<p class="analytics-none">Поки немає оцінок за 7 днів. Зроби запис у щоденнику, відміть стан на головній або в Telegram — тоді тут з’явиться динаміка.</p>`;
    } else if (filled < 2) {
      inner = `<p class="analytics-hint">Є дані лише за ${filled} ${pluralUk(filled, "день", "дні", "днів")}. Після ще одного запису графік стане зрозумілішим.</p>${weekBarsHTML(week7)}`;
    } else {
      inner = weekBarsHTML(week7);
    }
    return `<div class="card analytics-card analytics-week-card analytics-span-12">
      <div class="card-title">Стан за 7 днів</div>
      <p class="analytics-week-sub">Тривога з записів, ритуалів і Telegram (1–10, вище = напруженіше)</p>
      ${inner}
    </div>`;
  }

  function viewAnalytics() {
    destroyCharts();
    const entries = activeEntries().slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const streak = computeStreak();
    const activeDays = filledDays();
    const diaryCount = totalDiaryEntries();
    const week7 = last7DayLevels();

    const causes = topCounts(entries.map(e => e.cause), 3);
    const triggers = topCounts(entries.map(e => e.trigger), 3);
    const ranking = S.resourceRanking().slice(0, 3);

    const last7 = entriesInLastDays(7), prev7 = activeEntries().filter(e => { const t = new Date(e.createdAt).getTime(); return t < Date.now()-7*86400000 && t >= Date.now()-14*86400000; });
    const last30 = entriesInLastDays(30), prev30 = activeEntries().filter(e => { const t = new Date(e.createdAt).getTime(); return t < Date.now()-30*86400000 && t >= Date.now()-60*86400000; });
    const a7 = avgAnxiety(last7), p7 = avgAnxiety(prev7);
    const a30 = avgAnxiety(last30), p30 = avgAnxiety(prev30);
    function trend(cur, prev) {
      if (cur == null) return `<span class="faint">немає даних</span>`;
      if (prev == null) return `${cur}/10`;
      const d = +(cur - prev).toFixed(1);
      const better = d < 0;
      return `${cur}/10 <span class="pill ${better?"pill-green":d>0?"pill-red":"pill-violet"}">${d<0?"▼":d>0?"▲":"="} ${Math.abs(d)}</span>`;
    }

    const tests = Array.isArray(S.state.tests) ? S.state.tests : [];
    const firstTest = tests[0], lastTest = tests[tests.length - 1];

    const anxietyEntries = entries.filter(e => typeof e.anxiety === "number");
    const byDay = {};
    anxietyEntries.forEach(e => {
      const k = e.dayKey ? String(e.dayKey).slice(0, 10) : dayKeyFromIso(e.createdAt);
      byDay[k] = byDay[k] ? Math.max(byDay[k], e.anxiety) : e.anxiety;
    });
    // Підтягнути відмітки Telegram / ритуалів у графік тривоги
    Object.keys(S.state.rituals || {}).forEach((k) => {
      const level = ritualDayTension(k);
      if (level == null) return;
      byDay[k] = byDay[k] != null ? Math.max(byDay[k], level) : level;
    });
    const wbAll = S.state.wellbeing && !Array.isArray(S.state.wellbeing) ? S.state.wellbeing : {};
    Object.keys(wbAll).forEach((k) => {
      const lvl = wellbeingAnxiety(wbAll[k]);
      if (lvl == null) return;
      // Не перебивати ритуал сирим wellbeing, якщо вже є
      if (byDay[k] == null) byDay[k] = lvl;
    });
    const dayKeys = Object.keys(byDay).sort().slice(-21);
    const moodMap = {}, energyMap = {};
    entries.forEach(e => {
      const k = e.dayKey ? String(e.dayKey).slice(0, 10) : dayKeyFromIso(e.createdAt);
      if (e.mood) moodMap[k] = e.mood;
      if (e.energy) energyMap[k] = e.energy;
    });
    Object.keys(S.state.rituals || {}).forEach((k) => {
      const day = S.state.rituals[k];
      ["morning", "midday", "evening", "now"].forEach((type) => {
        const r = day && day[type];
        if (!r) return;
        const v = r.value != null ? Number(r.value) : null;
        if (v != null && !Number.isNaN(v)) moodMap[k] = v;
      });
    });
    const moodDays = Object.keys({ ...moodMap, ...energyMap }).sort().slice(-21);
    const byWeek = {};
    Object.keys(byDay).forEach((k) => {
      const wk = weekKey(k + "T12:00:00");
      (byWeek[wk] = byWeek[wk] || []).push(byDay[k]);
    });
    const weekKeys = Object.keys(byWeek).sort().slice(-8);
    const catData = topCounts(entries.map(e => e.category), 6);
    const ritualMoodCount = window.Rituals && Rituals.analyticsData
      ? Rituals.analyticsData().moods.length
      : 0;
    const tgStats = telegramCheckinStats();
    const enoughRecords = diaryCount >= 1 || ritualMoodCount >= 1 || dayKeys.length >= 1 || tgStats.marks >= 1;
    const hasAnxietyChart = enoughRecords && dayKeys.length >= 2;
    const hasMoodChart = enoughRecords && moodDays.length >= 2;
    const hasWeekChart = enoughRecords && weekKeys.length >= 1 && dayKeys.length >= 2;
    const hasCategoryChart = enoughRecords && catData.reduce((sum, c) => sum + c[1], 0) >= 3;

    const metricsHTML = `
        <div class="card analytics-card analytics-metric analytics-span-3">
          <div class="s-ico">🔥</div><div class="s-val">${streak}</div>
          <div class="s-lbl">серія днів</div>
          <div class="s-hint">поспіль з активністю</div>
        </div>
        <div class="card analytics-card analytics-metric analytics-span-3">
          <div class="s-ico">📝</div><div class="s-val">${activeDays}</div>
          <div class="s-lbl">активних днів</div>
          <div class="s-hint">запис, ритуал або Telegram</div>
        </div>
        <div class="card analytics-card analytics-metric analytics-span-3">
          <div class="s-ico">📱</div><div class="s-val">${tgStats.marks}</div>
          <div class="s-lbl">відміток Telegram</div>
          <div class="s-hint">${tgStats.days ? `за ${tgStats.days} ${pluralUk(tgStats.days, "день", "дні", "днів")}` : "поки немає"}</div>
        </div>
        <button class="card analytics-card analytics-metric analytics-metric-click analytics-span-3" id="metric-entries" type="button" title="Переглянути всі записи">
          <div class="s-ico">📈</div><div class="s-val">${diaryCount}</div>
          <div class="s-lbl">усього записів</div>
          <div class="s-hint">${tgStats.notes ? `${tgStats.notes} з Telegram · натисни` : "натисни — переглянути"}</div>
        </button>`;

    let bodyHTML = "";
    try {
      bodyHTML = window.Rituals ? Rituals.dynamicsSectionHTML() : "";
    } catch (err) {
      console.error("dynamicsSectionHTML failed", err);
      bodyHTML = `<div class="card analytics-card analytics-span-12"><p class="analytics-none">Не вдалося зібрати блок ритуалів. Інші показники нижче.</p></div>`;
    }
    bodyHTML += analyticsWeek7Card(week7);
    if (!enoughRecords || (tgStats.marks > 0 && diaryCount < 3 && dayKeys.length < 2)) {
      bodyHTML = analyticsNoticeBanner(diaryCount, tgStats) + bodyHTML;
    }

    if (enoughRecords) {
      const chartItems = [];
      if (hasAnxietyChart) chartItems.push({ title: "Рівень тривоги по днях", canvas: "ch-anxiety" });
      if (hasMoodChart) chartItems.push({ title: "Динаміка настрою та енергії", canvas: "ch-mood" });
      if (hasWeekChart) chartItems.push({ title: "Тривога по тижнях", canvas: "ch-weeks" });
      if (hasCategoryChart) chartItems.push({ title: "Найчастіші категорії", canvas: "ch-cats" });
      const chartSpan = chartItems.length === 1 ? 12 : 6;
      const chartsHTML = chartItems.length ? `
        <div class="analytics-charts-row analytics-span-12">
          ${chartItems.map(c => `
            <div class="card analytics-card chart-card analytics-span-${chartSpan}">
              <div class="card-title">${esc(c.title)}</div>
              <div class="chart-box"><canvas id="${c.canvas}"></canvas></div>
            </div>`).join("")}
        </div>` : `<div class="card analytics-card analytics-span-12"><p class="analytics-none">Для детальних графіків потрібно більше записів із оцінкою тривоги.</p></div>`;

      bodyHTML += `
        <div class="card analytics-card analytics-panel analytics-span-6">
          <div class="card-title">📉 Прогрес тривоги</div>
          <div class="analytics-row"><span>За 7 днів (vs попередні 7)</span><b>${trend(a7,p7)}</b></div>
          <div class="analytics-row"><span>За 30 днів (vs попередні 30)</span><b>${trend(a30,p30)}</b></div>
        </div>
        <div class="card analytics-card analytics-panel analytics-span-6">
          <div class="card-title">🧪 Тест тривожності: старт vs зараз</div>
          ${firstTest ? `<div class="analytics-row"><span>Перший тест (${fmtDate(firstTest.date)})</span><b>${firstTest.score} балів</b></div>
          <div class="analytics-row"><span>Останній тест (${fmtDate(lastTest.date)})</span><b>${lastTest.score} балів ${lastTest.score<firstTest.score?'<span class="pill pill-green">покращення</span>':lastTest.score>firstTest.score?'<span class="pill pill-warn">вище</span>':''}</b></div>
          <button class="btn btn-ghost btn-sm analytics-panel-action" id="retake">Пройти тест знову</button>`
          : `<p class="analytics-none">Тест ще не пройдено.</p><button class="btn btn-primary btn-sm analytics-panel-action" id="retake">Пройти тест</button>`}
        </div>
        ${chartsHTML}
        <div class="card analytics-card analytics-list analytics-span-4"><div class="card-title">Найчастіші причини</div>${listOrEmpty(causes)}</div>
        <div class="card analytics-card analytics-list analytics-span-4"><div class="card-title">Найчастіші тригери</div>${listOrEmpty(triggers)}</div>
        <div class="card analytics-card analytics-list analytics-span-4"><div class="card-title">Найефективніша підтримка</div>${ranking.length ? ranking.map(r => `<div class="analytics-row"><span>${esc(r.name)}</span><span class="faint">ефект ${r.avg || "–"}/5</span></div>`).join("") : `<p class="analytics-none">Ще немає оцінених способів</p>`}</div>`;
    }

    $("#view").innerHTML = `
      <div class="analytics-page">
      <div class="page-head"><h1>Моя динаміка</h1><p>Короткий огляд твоєї історії — без зайвого шуму.</p></div>
      <div class="analytics-dashboard">
        ${metricsHTML}
        ${bodyHTML}
      </div>
      </div>
    `;

    const rt = $("#retake"); if (rt) rt.onclick = startTest;
    const nb = $("#analytics-new"); if (nb) nb.onclick = () => go("new");
    const me = $("#metric-entries"); if (me) me.onclick = () => go("history");
    $$("[data-route]", $("#view")).forEach(b => b.onclick = () => go(b.dataset.route));

    if (!window.Chart) { return; }
    const purple = "#2fae8e", teal = "#5cc9aa", warn = "#e0a050";

    const anxietyCanvas = $("#ch-anxiety");
    if (anxietyCanvas) charts.push(new Chart(anxietyCanvas, {
      type: "line",
      data: { labels: dayKeys.map(k=>k.slice(5)), datasets: [{ label:"Тривога", data: dayKeys.map(k=>byDay[k]), borderColor: purple, backgroundColor:"rgba(47,174,142,.14)", fill:true, tension:.35, pointRadius:3 }] },
      options: chartOpts(10)
    }));

    const moodCanvas = $("#ch-mood");
    if (moodCanvas) charts.push(new Chart(moodCanvas, {
      type:"line",
      data:{ labels: moodDays.map(k=>k.slice(5)), datasets:[
        { label:"Настрій", data: moodDays.map(k=>moodMap[k]??null), borderColor: teal, tension:.35, spanGaps:true, pointRadius:3 },
        { label:"Енергія", data: moodDays.map(k=>energyMap[k]??null), borderColor: warn, tension:.35, spanGaps:true, pointRadius:3 }
      ]}, options: chartOpts(5, true)
    }));

    const weeksCanvas = $("#ch-weeks");
    if (weeksCanvas) charts.push(new Chart(weeksCanvas, {
      type:"bar",
      data:{ labels: weekKeys, datasets:[{ label:"Сер. тривога", data: weekKeys.map(k=>+(byWeek[k].reduce((s,x)=>s+x,0)/byWeek[k].length).toFixed(1)), backgroundColor: purple, borderRadius:8 }]},
      options: chartOpts(10)
    }));

    const catsCanvas = $("#ch-cats");
    if (catsCanvas && catData.length) charts.push(new Chart(catsCanvas, {
      type:"doughnut",
      data:{ labels: catData.map(c=>c[0]), datasets:[{ data: catData.map(c=>c[1]), backgroundColor:["#2fae8e","#5cc9aa","#e0a050","#df7081","#67c89a","#8fd6b8"] }]},
      options:{ plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12, font:{ family:"Comfortaa" } } } }, responsive:true, maintainAspectRatio:false }
    }));
  }
  function listOrEmpty(arr) {
    return arr.length
      ? arr.map((c, i) => `<div class="analytics-row"><span>${i + 1}. ${esc(c[0])}</span><span class="faint">${c[1]} ${pluralUk(c[1], "раз", "рази", "разів")}</span></div>`).join("")
      : `<p class="analytics-none">Ще немає повторень</p>`;
  }
  function weekKey(iso) {
    const d = new Date(iso); const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${String(d.getFullYear()).slice(2)}-Т${week}`;
  }
  function chartOpts(max, legend = false) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: legend, labels: { font: { family: "Comfortaa", size: 11 } } } },
      scales: {
        y: { beginAtZero: true, max, ticks: { font: { family: "Comfortaa", size: 10 } } },
        x: { ticks: { font: { family: "Comfortaa", size: 10 }, maxRotation: 0, autoSkip: false } }
      }
    };
  }

  /* ===================== МОЯ ІСТОРІЯ ===================== */
  function viewHistory() {
    const e = activeEntries();
    const shadows = shadowedEntries();
    const diary = e.filter(x => x.type !== "letter");
    const letters = e.filter(x => x.type === "letter");
    const reviewed = e.filter(x => x.reviewed && x.review);
    $("#view").innerHTML = `
      <div class="page-head"><h1>Моя історія</h1><p>Усі твої записи в одному місці.</p></div>
      <div class="chip-row" id="hist-tabs" style="margin-bottom:16px">
        <button class="chip sel" data-tab="diary">📓 Щоденник (${diary.length})</button>
        <button class="chip" data-tab="letters">✉️ Листи (${letters.length})</button>
        <button class="chip" data-tab="evidence">🛡️ Банк доказів (${S.state.evidence.length})</button>
        <button class="chip" data-tab="reviewed">✅ Завершені відкриття (${reviewed.length})</button>
        <button class="chip" data-tab="treasure">💝 Скарбничка (${S.state.treasure.length})</button>
      </div>
      <div id="hist-body"></div>
      <details class="shadows-folder" id="shadows-folder">
        <summary class="shadows-folder-summary">
          <span class="shadows-folder-ico">🌑</span>
          <span class="shadows-folder-title">Тіні забутих предків</span>
          <span class="shadows-folder-count">${shadows.length}</span>
        </summary>
        <p class="shadows-folder-hint">Записи поза активним щоденником. Можна повернути сюди або стерти назавжди.</p>
        <div id="shadows-body"></div>
      </details>`;

    const tabs = $("#hist-tabs");
    const body = $("#hist-body");
    const shadowsBody = $("#shadows-body");

    function entryCard(x, opts) {
      const r = x.review;
      const shadow = opts && opts.shadow;
      return `<div class="item${shadow ? " item-shadow" : ""}" data-eid="${esc(x.id)}"><div class="item-head">
        <div><span class="pill ${x.type==="letter"?"pill-violet":x.anxiety>=8?"pill-red":"pill-green"}">${x.type==="letter"?"Лист":"Тривога "+ (x.anxiety||"–")+"/10"}</span>
        ${x.category?`<span class="chip" style="margin-left:6px">${esc(x.category)}</span>`:""}
        ${x.source==="telegram"?`<span class="chip" style="margin-left:6px">Telegram</span>`:""}</div>
        <span class="item-date">${fmtDateTime(x.createdAt)}</span></div>
        <div class="item-body">${esc(x.fear)}</div>
        ${x.cause?`<div class="faint" style="margin-top:6px">Причина: ${esc(x.cause)}</div>`:""}
        ${r?`<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
          <div><b>Чи справдився:</b> ${r.cameTrue==="no"?"Ні 🛡️":r.cameTrue==="partly"?"Частково":"Так"}</div>
          ${r.whatHappened?`<div style="margin-top:4px"><b>Сталося:</b> ${esc(r.whatHappened)}</div>`:""}
          ${r.lesson?`<div style="margin-top:4px"><b>Урок:</b> ${esc(r.lesson)}</div>`:""}
          ${r.toSelf?`<div style="margin-top:4px"><b>Собі:</b> ${esc(r.toSelf)}</div>`:""}
        </div>`:""}
        <div class="row item-actions" style="justify-content:flex-end;margin-top:10px;gap:8px">
          ${shadow
            ? `<button class="btn btn-ghost btn-sm" data-restore="${esc(x.id)}">Повернути</button>
               <button class="btn btn-ghost btn-sm" data-purge="${esc(x.id)}">Стерти назавжди</button>`
            : `<button class="btn btn-ghost btn-sm" data-archive="${esc(x.id)}">Прибрати</button>`}
        </div>
      </div>`;
    }

    function wireArchiveButtons(root) {
      $$("[data-archive]", root).forEach((b) => {
        b.onclick = () => confirmModal(
          "Прибрати запис?",
          "Він потрапить у папку «Тіні забутих предків» унизу. Звідти можна повернути або видалити назавжди.",
          () => {
            S.archiveEntry(b.dataset.archive);
            toast("У тінях забутих предків 🌑", "good");
            go("history");
          },
          "Прибрати",
          true
        );
      });
    }

    function paintShadows() {
      if (!shadows.length) {
        shadowsBody.innerHTML = `<p class="analytics-none">Порожньо. Прибрані записи з’являться тут.</p>`;
        return;
      }
      shadowsBody.innerHTML = shadows.map((x) => entryCard(x, { shadow: true })).join("");
      $$("[data-restore]", shadowsBody).forEach((b) => {
        b.onclick = () => {
          S.restoreEntry(b.dataset.restore);
          toast("Запис повернуто в щоденник", "good");
          go("history");
        };
      });
      $$("[data-purge]", shadowsBody).forEach((b) => {
        b.onclick = () => confirmModal(
          "Стерти назавжди?",
          "Цю дію не можна скасувати.",
          () => {
            S.purgeEntry(b.dataset.purge);
            toast("Запис стерто", "good");
            go("history");
          },
          "Стерти",
          true
        );
      });
    }

    function paint(tab) {
      let html = "";
      if (tab === "diary") html = diary.length ? diary.map((x) => entryCard(x)).join("") : emptyBlock("📓","Ще немає записів");
      else if (tab === "letters") html = letters.length ? letters.map((x) => entryCard(x)).join("") : emptyBlock("✉️","Ще немає листів");
      else if (tab === "reviewed") html = reviewed.length ? reviewed.map((x) => entryCard(x)).join("") : emptyBlock("✅","Немає завершених відкриттів");
      else if (tab === "evidence") html = S.state.evidence.length ? S.state.evidence.map(x=>`<div class="item"><div class="item-head"><span class="pill pill-red">Страх</span><span class="item-date">${fmtDate(x.date)}</span></div><div class="item-body">${esc(x.fear)}</div><div style="margin-top:6px"><b>Реальність:</b> ${esc(x.realResult)}</div></div>`).join("") : emptyBlock("🛡️","Банк порожній");
      else if (tab === "treasure") html = S.state.treasure.length ? `<div class="gallery">${S.state.treasure.map(x=>`<div class="t-card">${x.image?`<img src="${x.image}">`:""}<div class="t-body"><div class="t-type">${esc(treasureLabel(x.type))}</div>${x.content?`<div class="t-content">${esc(x.content)}</div>`:""}</div></div>`).join("")}</div>` : emptyBlock("💝","Скарбничка порожня");
      body.innerHTML = html;
      if (tab === "diary" || tab === "letters" || tab === "reviewed") wireArchiveButtons(body);
    }
    $$(".chip", tabs).forEach(b => b.onclick = () => { $$(".chip", tabs).forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); paint(b.dataset.tab); });
    paint("diary");
    paintShadows();
  }

  /* ===================== БІБЛІОТЕКА ===================== */
  function viewLibrary() {
    if (routeParam) {
      const a = C.LIBRARY.find(x => x.id === routeParam);
      if (a) {
        $("#view").innerHTML = `
          <button class="btn btn-ghost btn-sm" id="lib-back">← Бібліотека</button>
          <div class="page-head" style="margin-top:14px"><h1>${a.icon} ${esc(a.title)}</h1></div>
          <div class="card article">${a.body}</div>`;
        $("#lib-back").onclick = () => go("library");
        return;
      }
    }
    $("#view").innerHTML = `
      <div class="page-head"><h1>📚 Бібліотека підтримки</h1><p>Короткі статті, які допомагають краще розуміти себе.</p></div>
      <div class="lib-grid">${C.LIBRARY.map(a=>`
        <button class="lib-card" data-id="${a.id}"><div class="lib-ico">${a.icon}</div><h3>${esc(a.title)}</h3><p>${esc(a.teaser)}</p></button>`).join("")}</div>`;
    $$(".lib-card", $("#view")).forEach(b => b.onclick = () => go("library", b.dataset.id));
  }

  /* ===================== ПРОГРЕС / ДОСЯГНЕННЯ ===================== */
  function viewAchievements() {
    checkAchievements(true);
    const unlocked = S.state.achievements;
    const streak = computeStreak();
    const total = C.ACHIEVEMENTS.length;
    const got = Object.keys(unlocked).filter(id => C.ACHIEVEMENTS.some(a=>a.id===id)).length;
    $("#view").innerHTML = `
      <div class="page-head"><h1>🏆 Святкування прогресу</h1><p>Кожен крок важливий. Ось твої досягнення.</p></div>
      <div class="card" style="margin-bottom:18px">
        <div class="row spread"><b>Відкрито ${got} з ${total}</b><span class="faint">🔥 серія: ${streak} ${pluralUk(streak,"день","дні","днів")}</span></div>
        <div class="bar" style="margin-top:10px"><i style="width:${Math.round(got/total*100)}%"></i></div>
      </div>
      <div class="ach-grid">${C.ACHIEVEMENTS.map(a=>{
        const u = unlocked[a.id];
        return `<div class="ach ${u?"":"locked"}"><div class="ach-ico">${a.icon}</div><div class="ach-title">${esc(a.title)}</div><div class="ach-desc">${esc(a.desc)}</div>${u?`<div class="pill pill-green" style="margin-top:8px;display:inline-block">${fmtDate(u)}</div>`:`<div class="faint" style="margin-top:8px;font-size:12px">🔒 ще попереду</div>`}</div>`;
      }).join("")}</div>`;
  }

  /* ===================== ПРОФІЛЬ / КОНФІДЕНЦІЙНІСТЬ ===================== */
  let tgProfileCache = null;

  async function viewProfile() {
    applyGenderTheme();
    const p = S.state.profile;
    if (!tgProfileCache && S.isAuthed()) {
      try { tgProfileCache = await S.telegramStatus(); } catch (e) { tgProfileCache = { ok: false }; }
    }
    const tgLinked = tgProfileCache && tgProfileCache.linked;
    const tgBlock = `
      <div class="card" id="tg-card">
        <div class="card-title">📱 Telegram <span class="faint" style="font-size:12px;font-weight:500">(опційно)</span></div>
        <p class="muted">Ті самі ритуали можна отримувати в Telegram. На сайті все вже доступно вище.</p>
        ${tgLinked
          ? `<p class="muted" style="margin:8px 0"><span class="pill pill-green">Підключено</span> Нагадування в боті: ⚙️ Налаштування.</p>
             <div class="row">
               <button class="btn btn-ghost btn-sm" id="tg-open">Відкрити бота</button>
               <button class="btn btn-ghost btn-sm" id="tg-unlink">Відключити</button>
             </div>`
          : `<p class="muted" style="margin:8px 0">Нагадування вимкнені, поки не підключиш бота.</p>
             <button class="btn btn-primary btn-sm" id="tg-connect">Підключити Telegram</button>
             <p class="faint" id="tg-link-hint" style="margin-top:10px;font-size:12px"></p>`}
      </div>`;

    $("#view").innerHTML = `
      <div class="page-head"><h1>⚙️ Профіль</h1></div>

      <div class="card">
        <div class="card-title">👤 Обліковий запис</div>
        <div class="row">${p.picture ? `<img src="${esc(p.picture)}" alt="" style="width:48px;height:48px;border-radius:50%">` : `<div class="user-avatar" style="width:48px;height:48px;font-size:20px">${esc((p.name||p.email||"?").charAt(0).toUpperCase())}</div>`}
        <div><b>${esc(p.name||"Користувач")}</b><div class="faint">${esc(p.email)} · вхід через ${p.provider==="google"?"Google":"Email"}</div></div></div>
        <div class="row" style="margin-top:12px;align-items:center;gap:10px">
          <span class="faint">Стать:</span>
          <div class="gender-pick" id="prof-gender" style="flex:0 0 auto">
            <button type="button" class="gender-opt ${p.gender==="female"?"sel":""}" data-g="female"><span class="gender-symbol">♀</span> Жінка</button>
            <button type="button" class="gender-opt ${p.gender==="male"?"sel":""}" data-g="male"><span class="gender-symbol">♂</span> Чоловік</button>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" id="logout" type="button" style="margin-top:14px">Вийти</button>
      </div>

      ${window.Rituals ? Rituals.profileRemindersHTML() : ""}

      ${tgBlock}

      <div class="card">
        <div class="card-title">₴ Оплата та доступ</div>
        <p class="muted">Умови користування сервісом і інформація про оплату чи добровільну підтримку.</p>
        <button class="btn btn-primary btn-sm" id="open-payment" type="button" style="margin-top:8px">Переглянути</button>
      </div>

      <div class="card">
        <div class="card-title">🔒 Конфіденційність</div>
        <p class="muted">Що зберігається, де лежать дані, Telegram, експорт і видалення.</p>
        <button class="btn btn-primary btn-sm" id="open-privacy" type="button" style="margin-top:8px">Читати</button>
      </div>

      <div class="card">
        <div class="card-title">🎓 Навчання по сайту</div>
        <p class="muted">Короткий тур зі стрілочками по меню — можна пройти знову будь-коли.</p>
        <button class="btn btn-ghost btn-sm" id="open-tour" type="button" style="margin-top:8px">Пройти навчання</button>
      </div>

      ${S.isAdminEmail(p.email) || (window.SPOKIY_CONFIG && window.SPOKIY_CONFIG.admin) ? `
      <div class="card">
        <div class="card-title">🛠 Адмін-панель</div>
        <p class="muted">Статистика сервісу для власника. Тексти щоденників не показуються.</p>
        <button class="btn btn-primary btn-sm" id="open-admin" type="button" style="margin-top:8px">Відкрити</button>
      </div>` : ""}

      <div class="card">
        <div class="card-title">💾 Твої дані</div>
        <div class="stack data-actions">
          <button class="btn btn-ghost btn-sm btn-block" id="exp-backup" type="button">⬇️ Завантажити копію даних</button>
          <button class="btn btn-ghost btn-sm btn-block" id="imp-json" type="button">⬆️ Перенести дані з файлу</button>
          <button class="btn btn-ghost btn-sm btn-block" id="exp-pdf" type="button">🖨️ Експорт у PDF</button>
          <button class="btn btn-danger btn-sm btn-block" id="del-all" type="button">🗑 Видалити всі дані</button>
          <input type="file" id="imp-file" accept="application/json" class="hidden">
        </div>
      </div>

      <div class="card">
        <div class="card-title">🧪 Тест тривожності</div>
        <p class="muted">Періодично проходь короткий тест, щоб бачити динаміку. Пройдено разів: <b>${(S.state.tests||[]).length}</b>.</p>
        <div class="row">
          <button class="btn btn-primary btn-sm" id="do-test">Пройти тест зараз</button>
          <button class="btn btn-ghost btn-sm" id="see-tests">📊 Результати тестів</button>
        </div>
      </div>`;

    $("#exp-backup").onclick = () => downloadFile("spokiy-backup.json", S.exportJSON(), "application/json");
    $("#exp-pdf").onclick = exportPDF;
    $("#imp-json").onclick = () => $("#imp-file").click();
    $("#imp-file").onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        confirmModal("Перенести дані з файлу?", "Поточні записи заміняться даними з файлу.", () => {
          try { S.importJSON(reader.result); toast("Дані успішно перенесено ✅", "good"); go("home"); }
          catch (err) { toast("Помилка: " + err.message, "warn"); }
        }, "Перенести");
      };
      reader.readAsText(file);
    };
    $("#do-test").onclick = startTest;
    $("#see-tests").onclick = openTestHistory;
    $$("#prof-gender .gender-opt").forEach(b => b.onclick = () => {
      S.setGender(b.dataset.g);
      applyGenderTheme();
      toast("Збережено 🌿", "good");
      render();
    });
    $("#logout").onclick = () => confirmModal("Вийти?", null, () => { S.logout(); location.reload(); });
    const openPay = $("#open-payment");
    if (openPay) openPay.onclick = () => go("payment");
    const openPriv = $("#open-privacy");
    if (openPriv) openPriv.onclick = () => go("privacy");
    const openTour = $("#open-tour");
    if (openTour) openTour.onclick = () => startSiteTour({ force: true });
    const openAdm = $("#open-admin");
    if (openAdm) openAdm.onclick = () => go("admin");
    $("#del-all").onclick = () => confirmModal("Видалити всі дані?", "Профіль і всі записи буде видалено назавжди.", () => {
      S.deleteAllData(); location.reload();
    }, "Видалити назавжди", true);

    wireTelegramProfile(tgProfileCache);
    if (window.Rituals) Rituals.wireProfileReminders();
    S.telegramStatus().then((res) => {
      if (!res.ok || route !== "profile") return;
      const prev = JSON.stringify(tgProfileCache);
      tgProfileCache = res;
      if (prev !== JSON.stringify(res)) viewProfile();
    });
  }

  function wireTelegramProfile(cached) {
    const connect = $("#tg-connect");
    if (connect) {
      connect.onclick = async () => {
        connect.disabled = true;
        const res = await S.telegramCreateLink();
        connect.disabled = false;
        if (!res.ok) {
          toast(res.error === "offline" ? "Потрібне з'єднання з сервером" : "Не вдалося створити посилання", "warn");
          return;
        }
        tgProfileCache = { linked: false };
        const hint = $("#tg-link-hint");
        if (res.linkUrl) {
          window.open(res.linkUrl, "_blank");
          if (hint) hint.textContent = "Посилання діє 15 хвилин. У Telegram натисни Start — і акаунт підключиться.";
          toast("Відкрий Telegram і натисни Start 🌿", "good");
        } else if (hint) {
          hint.textContent = res.botUsername
            ? `Відкрий @${res.botUsername} і надішли: /start ${res.startPayload}`
            : "Звернися до адміністратора: не налаштовано TELEGRAM_BOT_USERNAME.";
        }
      };
    }
    const openBot = $("#tg-open");
    if (openBot) {
      openBot.onclick = () => {
        if (cached && cached.botUsername) {
          window.open(`https://t.me/${cached.botUsername}`, "_blank");
        } else {
          toast("Відкрий бота через «Підключити Telegram»", "warn");
        }
      };
    }
    const unlink = $("#tg-unlink");
    if (unlink) {
      unlink.onclick = () => confirmModal("Відключити Telegram?", "Нагадування в Telegram більше не надходитимуть. Можна підключити знову.", async () => {
        await S.telegramUnlink();
        tgProfileCache = { ok: true, linked: false };
        toast("Telegram відключено", "good");
        render();
      }, "Відключити");
    }
  }

  async function cloudSave() {
    if (!CLOUD.endpoint) return;
    try {
      const res = await fetch(CLOUD.endpoint, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, CLOUD.headers || {}),
        body: S.exportJSON()
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      toast("Збережено в хмару ☁️", "good");
    } catch (e) { toast("Помилка хмари: " + e.message, "warn"); }
  }
  async function cloudLoad() {
    if (!CLOUD.endpoint) return;
    try {
      const res = await fetch(CLOUD.endpoint, { headers: CLOUD.headers || {} });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      S.importJSON(text);
      toast("Відновлено з хмари ✅", "good");
      go("home");
    } catch (e) { toast("Помилка хмари: " + e.message, "warn"); }
  }

  function downloadFile(name, content, type) {
    const blob = new Blob(["\uFEFF" + content], { type: type + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Файл завантажено ⬇️", "good");
  }

  function exportCSV() {
    const rows = [["Дата","Тип","Тривога","Настрій","Енергія","Страх","Причина","Тригер","Категорія","Допомогло","День відкриття","Справдився","Що сталося","Урок","Тіні"]];
    S.state.entries.forEach(e => {
      const r = e.review || {};
      rows.push([fmtDate(e.createdAt), e.type, e.anxiety||"", e.mood||"", e.energy||"", e.fear||"", e.cause||"", e.trigger||"", e.category||"", (e.helped||[]).join("; "), e.openDate||"", r.cameTrue||"", r.whatHappened||"", r.lesson||"", e.archived ? "так" : ""]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    downloadFile("spokiy-data.csv", csv, "text/csv");
  }

  function exportPDF() {
    const p = S.state.profile;
    const win = window.open("", "_blank");
    const style = `body{font-family:Comfortaa,Arial,sans-serif;color:#233029;padding:30px;line-height:1.5}h1{color:#1f9579}h2{color:#2fae8e;margin-top:24px;border-bottom:1px solid #eee;padding-bottom:4px}.it{margin:10px 0;padding:10px;border:1px solid #eee;border-radius:8px}.d{color:#999;font-size:12px}@media print{button{display:none}}`;
    const evHtml = S.state.evidence.map(x=>`<div class="it"><b>Страх:</b> ${esc(x.fear)}<br><b>Реальність:</b> ${esc(x.realResult)}<br>${x.conclusion?`<b>Висновок:</b> ${esc(x.conclusion)}`:""}</div>`).join("") || "<p>—</p>";
    const enHtml = activeEntries().map(x=>`<div class="it"><div class="d">${fmtDateTime(x.createdAt)} · ${x.type==="letter"?"Лист":"Тривога "+(x.anxiety||"–")+"/10"}</div>${esc(x.fear)}${x.review?`<br><i>Підсумок: ${x.review.cameTrue==="no"?"страх не справдився":x.review.cameTrue==="partly"?"справдився частково":"справдився"}. ${esc(x.review.whatHappened||"")}</i>`:""}</div>`).join("") || "<p>—</p>";
    const shHtml = shadowedEntries().map(x=>`<div class="it"><div class="d">${fmtDateTime(x.createdAt)} · тінь</div>${esc(x.fear)}</div>`).join("") || "<p>—</p>";
    win.document.write(`<html><head><meta charset="utf-8"><title>Спокій — звіт</title><style>${style}</style></head><body>
      <h1>🌿 Спокій — особистий звіт</h1>
      <p class="d">${esc(p.name||"")} · ${esc(p.email)} · ${fmtDate(new Date().toISOString())}</p>
      <p>Активних днів: <b>${filledDays()}</b> · Серія: <b>${computeStreak()}</b> · Страхів не справдилось: <b>${S.state.evidence.length}</b></p>
      <h2>🛡️ Банк доказів</h2>${evHtml}
      <h2>📜 Записи</h2>${enHtml}
      <h2>🌑 Тіні забутих предків</h2>${shHtml}
      <button onclick="window.print()" style="margin-top:20px;padding:10px 18px;background:#2fae8e;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ Зберегти як PDF</button>
      </body></html>`);
    win.document.close();
  }

  /* ===================== ТЕСТ ТРИВОЖНОСТІ ===================== */
  function startTest() {
    const ans = new Array(C.TEST.questions.length).fill(null);
    function paint() {
      const done = ans.filter(a => a !== null).length;
      openModal(`<h2>🧪 Тест тривожності</h2>
        <p class="muted">За останні 2 тижні, як часто тебе турбували такі прояви?</p>
        <div class="stack" style="margin-top:8px">
          ${C.TEST.questions.map((q,i)=>`<div><div style="font-weight:600;margin-bottom:6px">${i+1}. ${esc(q)}</div>
            <div class="chip-row" data-q="${i}">${C.TEST.options.map(o=>`<button class="chip ${ans[i]===o.v?"sel":""}" data-v="${o.v}">${o.label}</button>`).join("")}</div></div>`).join("")}
        </div>
        <div class="row spread" style="margin-top:16px"><span class="faint">${done}/${C.TEST.questions.length}</span>
        <button class="btn btn-primary" id="test-save" ${done<C.TEST.questions.length?"disabled":""}>Завершити</button></div>`);
      $$("[data-q]", $("#modal-root")).forEach(row => {
        $$(".chip", row).forEach(b => b.onclick = () => { ans[+row.dataset.q] = +b.dataset.v; paint(); });
      });
      const sv = $("#test-save"); if (sv) sv.onclick = () => {
        const score = ans.reduce((s, x) => s + x, 0);
        const res = C.TEST.interpret(score);
        const prev = (S.state.tests || [])[S.state.tests.length - 1] || null;
        S.addTest(score, { level: res.level, max: C.TEST.questions.length * 3 });
        showTestResult(score, res, prev);
      };
    }
    paint();
  }

  function showTestResult(score, res, prev) {
    const max = C.TEST.questions.length * 3;
    let compare = "";
    if (prev && typeof prev.score === "number") {
      const diff = score - prev.score;
      if (diff < 0) compare = `<p class="muted" style="margin:10px 0 0">📉 Порівняно з минулим разом тривога <b>знизилася на ${Math.abs(diff)}</b> ${pluralUk(Math.abs(diff),"бал","бали","балів")}. Це справжній прогрес!</p>`;
      else if (diff > 0) compare = `<p class="muted" style="margin:10px 0 0">📈 Порівняно з минулим разом результат вищий на ${diff} ${pluralUk(diff,"бал","бали","балів")}. Буває по-різному — будь до себе м'якою.</p>`;
      else compare = `<p class="muted" style="margin:10px 0 0">Результат такий самий, як минулого разу.</p>`;
    }
    openModal(`
      <div style="text-align:center">
        <div style="font-size:46px">${res.emoji || "🌿"}</div>
        <h2 style="margin:6px 0 2px">Твій результат</h2>
        <div style="font-size:40px;font-weight:700;color:var(--primary-d);line-height:1.1">${score}<span style="font-size:18px;color:var(--ink-faint)"> / ${max}</span></div>
        <span class="pill ${res.pill}" style="margin-top:8px;display:inline-block">${res.level}</span>
      </div>
      <p style="margin:16px 0 0;line-height:1.6">${esc(res.advice)}</p>
      ${compare}
      <div class="row" style="justify-content:flex-end;margin-top:18px;gap:8px">
        <button class="btn btn-ghost" id="tr-history">Усі результати</button>
        <button class="btn btn-primary" id="tr-ok">Дякую 🌿</button>
      </div>`);
    $("#tr-ok").onclick = () => { closeModal(); if (route === "analytics" || route === "profile") render(); };
    $("#tr-history").onclick = () => { closeModal(); openTestHistory(); };
  }

  function openTestHistory() {
    const tests = (S.state.tests || []).slice().reverse();
    const max = C.TEST.questions.length * 3;
    openModal(`
      <h2>🧪 Результати тестів</h2>
      <p class="muted" style="margin:0 0 14px">Історія твоїх проходжень тесту тривожності.</p>
      ${tests.length ? `<div class="stack">${tests.map(t => {
        const r = C.TEST.interpret(t.score);
        return `<div class="test-row">
          <div><b>${t.score}/${t.max || max}</b> <span class="pill ${r.pill}" style="margin-left:6px">${esc(t.level || r.level)}</span></div>
          <span class="faint">${fmtDate(t.date)}</span>
        </div>`;
      }).join("")}</div>` : emptyBlock("🧪", "Ти ще не проходила тест. Пройди його, щоб бачити динаміку.")}
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn btn-primary" id="th-retake">Пройти тест зараз</button>
      </div>`);
    $("#th-retake").onclick = () => { closeModal(); startTest(); };
  }

  /* ===================== РЕНДЕР ===================== */
  function render() {
    if (affTimer) { clearInterval(affTimer); affTimer = null; }
    const map = {
      home: viewHome, types: viewTypes, typeTest: viewTypeTest, new: viewNew, reminders: viewReminders, evidence: viewEvidence,
      resources: viewResources, treasure: viewTreasure, analytics: viewAnalytics, joys: viewJoys, good: viewGoodEvents, gratitude: viewGratitude, friend: viewFriendPractice,
      history: viewHistory, library: viewLibrary, achievements: viewAchievements, profile: viewProfile, support: viewSupport,
      recoverySelect: viewRecoverySelect, payment: viewPayment, privacy: viewPrivacy, faq: viewFaq, admin: viewAdmin, info: viewInfo
    };
    try {
      (map[route] || viewHome)();
    } catch (err) {
      console.error("render failed", route, err);
      const view = $("#view");
      if (view) {
        view.innerHTML = `<div class="page-head"><h1>Щось пішло не так</h1>
          <p class="muted">Спробуй оновити сторінку або відкрити «Сьогодні» ще раз.</p>
          <button type="button" class="btn btn-primary" id="render-retry">На головну</button></div>`;
        const btn = $("#render-retry");
        if (btn) btn.onclick = () => applyGo("home");
      }
    }
    mountSongBar();
    genderizeDOM($("#view"));
    if (tourState && !document.body.dataset.tourPainting) {
      document.body.dataset.tourPainting = "1";
      requestAnimationFrame(() => {
        delete document.body.dataset.tourPainting;
        if (tourState) paintTourStep(tourState.index, true);
      });
    }
  }

  /* ===================== АВТОРИЗАЦІЯ ===================== */
  function showApp() {
    applyGenderTheme();
    $("#auth-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    renderNav();
    checkAchievements(true);

    if (needsRecoverySelect()) go("recoverySelect");
    else go("home");

    // якщо стать не вказана (старий акаунт) — запитати один раз, потім оновити порядок карток
    if (!S.state.profile.gender) {
      setTimeout(() => askGender(g => {
        S.setGender(g);
        applyGenderTheme();
        if (needsRecoverySelect()) go("recoverySelect");
        else maybeShowWelcomeOrOnboard();
      }), 400);
    } else if (!needsRecoverySelect()) {
      maybeShowWelcomeOrOnboard();
    }
    notifyReminders();
    handleDeepLinks();
    if (window.Rituals) { Rituals.startReminderScheduler(); Rituals.requestPushPermission(); }
  }

  function maybeShowWelcomeOrOnboard() {
    render();
    if (shouldShowWelcome()) {
      setTimeout(() => openWelcomeFeatures({ thenOnboarding: true }), 450);
    } else if (shouldShowTour()) {
      setTimeout(() => startSiteTour({ thenWellbeing: true }), 450);
    } else {
      startOnboarding();
    }
  }

  function startOnboarding() {
    if (window.Rituals) Rituals.maybePrompt();
    if (S.todayWellbeing()) return;
    const scale = Array.from({ length: 10 }, (_, i) =>
      `<button class="well-btn" data-onb-well="${i + 1}">${i + 1}</button>`).join("");
    openModal(`
      <h2>${isMale() ? "Як ти зараз, друже?" : "Як ти зараз?"} ${uiText("🌿")}</h2>
      <p class="muted" style="margin:0 0 14px;line-height:1.55">
        Оціни свій рівень тривоги просто зараз: <b>1</b> — спокійно, <b>10</b> — напруга на максимумі.
        Це не тест і тут немає правильних відповідей — просто чесний замір стану.
      </p>
      <div class="well-scale">${scale}</div>
      <div class="row spread" style="margin-top:8px;color:var(--ink-faint);font-size:12px;font-weight:700">
        <span>1 · спокій</span><span>10 · максимум</span>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost btn-sm" data-close>Пізніше</button>
      </div>`);
    $$("#modal-root [data-onb-well]").forEach(b => b.onclick = () => {
      const v = +b.dataset.onbWell;
      S.setWellbeing(v);
      closeModal();
      render();
      if (v >= 7) {
        // Висока напруга: спершу стабілізація нервової системи, аналіз — потім.
        confirmModal(uiText("Схоже, зараз непросто 🌿"),
          isMale()
            ? "Дякую за чесність. Не треба нічого розбирати просто зараз — спершу дамо тілу заспокоїтися. Хочеш коротку SOS-практику дихання?"
            : "Дякую за чесність. Не треба нічого розбирати просто зараз — спершу дай тілу заспокоїтися. Хочеш коротку SOS-практику дихання?",
          () => startCalm("quick"), "Так, заспокоїтись");
      } else if (v <= 4) {
        toast(uiText("Гарний стан. Зафіксуй щось хороше сьогодні 🙂"), "good");
      } else {
        toast("Записано. Один маленький крок сьогодні — вже достатньо", "good");
      }
    });
  }

  // Нагадування у день відкриття (браузерне сповіщення + бейдж у меню)
  function notifyReminders() {
    const pend = pendingReminders();
    if (!pend.length || !("Notification" in window)) return;
    const fire = () => new Notification(uiText("Спокій 🌿 — час відкрити запис"), {
      body: `Настав день відкриття для ${pend.length} ${pluralUk(pend.length, "запису", "записів", "записів")}. Перевір, чи справдилися твої страхи.`,
      icon: isMale()
        ? "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='18' y='18' width='64' height='64' rx='12' fill='%233f6f8f'/><text x='50' y='62' text-anchor='middle' font-size='38' fill='white' font-family='Arial'>S</text></svg>"
        : "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌿</text></svg>"
    });
    if (Notification.permission === "granted") fire();
    else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") fire(); });
  }

  let authGender = null;
  let authMode = "login";

  function openLandingAbout() {
    openModal(`
      <h2>Як мною користуватися</h2>
      <div class="landing-about-body">
        <p class="muted">Я — «Спокій»: особистий простір самопідтримки, коли тривожно, важко або потрібно почути себе.</p>
        <p class="muted">Можна зупинитися, розібрати стан і знайти невелику дію саме зараз. Без оцінок і без потреби писати багато.</p>
        <ul class="landing-about-points">
          <li>Короткі вправи на 1–5 хвилин</li>
          <li>Особисті записи та спостереження</li>
          <li>Доступ із телефона і ноутбука</li>
          <li>SOS-дихання, коли накриває просто зараз</li>
          <li>Символ внутрішнього відновлення, що росте разом із тобою</li>
        </ul>
        <p class="landing-about-note">Сервіс призначений для самопідтримки та не замінює професійну психологічну або медичну допомогу.</p>
        <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost" id="landing-about-guide">Детальніше про функції</button>
          <button type="button" class="btn btn-ghost" id="landing-about-payment">Оплата</button>
          <button type="button" class="btn btn-ghost" id="landing-about-privacy">Конфіденційність</button>
          <button type="button" class="btn btn-sos" id="landing-about-sos">Мені тривожно зараз</button>
        </div>
      </div>`);
    const guideBtn = $("#landing-about-guide");
    if (guideBtn) guideBtn.onclick = () => { closeModal(); openGuide(); };
    const payAbout = $("#landing-about-payment");
    if (payAbout) payAbout.onclick = () => { closeModal(); openPaymentInfo(); };
    const privAbout = $("#landing-about-privacy");
    if (privAbout) privAbout.onclick = () => { closeModal(); location.href = "/privacy"; };
    const faqAbout = $("#landing-about-faq");
    if (faqAbout) faqAbout.onclick = () => { closeModal(); location.href = "/faq"; };
    const sosBtn = $("#landing-about-sos");
    if (sosBtn) sosBtn.onclick = () => { closeModal(); openQuickCalm(); };
  }

  function syncAuthSwitchLabel() {
    const btn = $("#auth-switch-btn");
    if (!btn) return;
    btn.textContent = authMode === "login"
      ? "Немає акаунту? Створити простір"
      : "Уже є акаунт? Увійти";
  }
  let loginUseCode = false;

  function scrollToAuth(focusSel) {
    const reg = $("#auth-reg");
    if (reg) reg.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => { const el = $(focusSel); if (el) el.focus(); }, 480);
  }

  function authErrorText(code) {
    const map = {
      bad_email: "Введи коректний email",
      email_taken: "Цей email вже зареєстрований — спробуй увійти",
      weak_password: "Пароль має бути не менше 6 символів",
      name_required: "Введи ім'я",
      gender_required: "Обери стать",
      unknown_email: "Акаунт з таким email не знайдено",
      invalid_credentials: "Невірний пароль або код",
      invalid_code: "Невірний або прострочений код",
      password_or_code_required: "Введи пароль або код",
      code_required: "Введи код з email",
      code_unavailable: "Вхід за кодом доступний лише онлайн",
      offline: "Потрібне з'єднання з інтернетом",
      invalid_google_token: "Не вдалося підтвердити Google-акаунт",
      credential_required: "Потрібен новий вхід через Google",
      supabase_not_configured: "Хмарна авторизація ще не налаштована",
      password_mismatch: "Паролі не збігаються"
    };
    return map[code] || "Не вдалося виконати дію. Спробуй ще раз.";
  }

  function updateLoginFields() {
    if (authMode !== "login") return;
    const codeMode = loginUseCode;
    const pwField = $("#auth-password-field");
    const codeField = $("#auth-code-field");
    if (pwField) pwField.classList.toggle("hidden", codeMode);
    if (codeField) codeField.classList.toggle("hidden", !codeMode);
    const useCodeBtn = $("#auth-use-code");
    if (useCodeBtn) useCodeBtn.textContent = codeMode ? "Увійти за паролем" : "Увійти за кодом";
    const submit = $("#auth-submit");
    if (submit) submit.textContent = codeMode ? "Увійти за кодом" : "Увійти";
    const pw = $("#auth-password");
    if (pw) pw.autocomplete = codeMode ? "off" : "current-password";
  }

  function setAuthMode(mode) {
    authMode = mode;
    loginUseCode = false;
    const isLogin = mode === "login";
    const title = $("#auth-card-title");
    const sub = $("#auth-card-sub");
    const submit = $("#auth-submit");
    if (title) title.textContent = isLogin ? "Увійти" : "Створити свій простір";
    if (sub) sub.textContent = isLogin
      ? "Введи email і пароль — або одноразовий код з листа."
      : "Безкоштовно. Кілька секунд — і особистий простір тільки для тебе.";
    if (submit) submit.textContent = isLogin ? "Увійти" : "Створити акаунт";
    $$(".auth-signup-only").forEach(el => el.classList.toggle("hidden", isLogin));
    $$(".auth-login-only").forEach(el => el.classList.toggle("hidden", !isLogin));
    const pw = $("#auth-password");
    if (pw) pw.autocomplete = isLogin ? "current-password" : "new-password";
    if (!isLogin) {
      const codeField = $("#auth-code-field");
      const pwField = $("#auth-password-field");
      if (codeField) codeField.classList.add("hidden");
      if (pwField) pwField.classList.remove("hidden");
    } else updateLoginFields();
    syncAuthSwitchLabel();
  }

  async function finishAuth(res) {
    if (!res.ok) {
      toast(authErrorText(res.error), "warn");
      if (res.devCode) toast("Код для розробки: " + res.devCode, "good");
      return false;
    }
    showApp();
    return true;
  }

  async function submitSignup() {
    const name = ($("#auth-name") && $("#auth-name").value || "").trim();
    const email = ($("#auth-email") && $("#auth-email").value || "").trim().toLowerCase();
    const password = $("#auth-password") && $("#auth-password").value || "";
    const password2 = $("#auth-password2") && $("#auth-password2").value || "";
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Введи коректний email", "warn"); return; }
    if (!name) { toast("Введи ім'я", "warn"); $("#auth-name") && $("#auth-name").focus(); return; }
    if (!authGender) { toast("Будь ласка, обери стать 🌿", "warn"); return; }
    if (!password || password.length < 6) { toast(authErrorText("weak_password"), "warn"); return; }
    if (password !== password2) { toast(authErrorText("password_mismatch"), "warn"); return; }
    const submit = $("#auth-submit");
    if (submit) submit.disabled = true;
    try {
      await finishAuth(await S.register({ email, password, name, gender: authGender }));
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function submitLogin() {
    const email = ($("#auth-email") && $("#auth-email").value || "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Введи коректний email", "warn"); return; }
    const submit = $("#auth-submit");
    if (submit) submit.disabled = true;
    try {
      let res;
      if (loginUseCode) {
        const code = ($("#auth-code") && $("#auth-code").value || "").trim();
        if (!code) { toast(authErrorText("code_required"), "warn"); return; }
        res = await S.loginWithCode(email, code);
      } else {
        const password = $("#auth-password") && $("#auth-password").value || "";
        if (!password) { toast("Введи пароль", "warn"); return; }
        res = await S.loginWithPassword(email, password);
      }
      await finishAuth(res);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function requestLoginCode() {
    const email = ($("#auth-email") && $("#auth-email").value || "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Спочатку введи email", "warn"); return; }
    const res = await S.requestCode(email, "login");
    if (!res.ok) { toast(authErrorText(res.error || "offline"), "warn"); return; }
    loginUseCode = true;
    updateLoginFields();
    toast(res.devCode ? "Код надіслано (dev: " + res.devCode + ")" : "Код надіслано на email", "good");
    const codeInput = $("#auth-code");
    if (codeInput) codeInput.focus();
  }

  function openForgotPassword() {
    const email = ($("#auth-email") && $("#auth-email").value || "").trim().toLowerCase();
    openModal(`<h2>Забули пароль?</h2>
      <p class="muted" style="margin:0 0 14px">Надішлемо код на email. Потім задай новий пароль.</p>
      <label class="field"><span>Email</span><input id="fp-email" type="email" value="${esc(email)}" autocomplete="email" /></label>
      <label class="field"><span>Код з email</span><input id="fp-code" type="text" inputmode="numeric" maxlength="6" placeholder="6 цифр" /></label>
      <label class="field"><span>Новий пароль</span><input id="fp-password" type="password" autocomplete="new-password" placeholder="Мінімум 6 символів" /></label>
      <div class="row spread" style="margin-top:16px;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" type="button" id="fp-send">Надіслати код</button>
        <button class="btn btn-primary" type="button" id="fp-save">Зберегти пароль</button>
      </div>`);
    $("#fp-send").onclick = async () => {
      const em = ($("#fp-email") && $("#fp-email").value || "").trim().toLowerCase();
      if (!em) { toast("Введи email", "warn"); return; }
      const res = await S.requestCode(em, "reset");
      if (!res.ok) { toast(authErrorText(res.error || "offline"), "warn"); return; }
      toast(res.devCode ? "Код (dev): " + res.devCode : "Код надіслано", "good");
    };
    $("#fp-save").onclick = async () => {
      const em = ($("#fp-email") && $("#fp-email").value || "").trim().toLowerCase();
      const code = ($("#fp-code") && $("#fp-code").value || "").trim();
      const password = $("#fp-password") && $("#fp-password").value || "";
      if (!em || !code || !password) { toast("Заповни всі поля", "warn"); return; }
      const res = await S.resetPassword({ email: em, code, password });
      if (!res.ok) { toast(authErrorText(res.error), "warn"); return; }
      closeModal();
      toast("Пароль оновлено. Тепер увійди 🌿", "good");
      setAuthMode("login");
      const emailInput = $("#auth-email");
      if (emailInput) emailInput.value = em;
      scrollToAuth("#auth-password");
    };
  }

  function initAuth() {
    $$("#auth-gender .gender-opt").forEach(b => b.onclick = () => {
      authGender = b.dataset.gender;
      $$("#auth-gender .gender-opt").forEach(x => x.classList.toggle("sel", x === b));
    });

    const switchBtn = $("#auth-switch-btn");
    if (switchBtn) {
      switchBtn.onclick = () => {
        setAuthMode(authMode === "login" ? "signup" : "login");
        const focusSel = authMode === "signup" ? "#auth-name" : "#auth-email";
        setTimeout(() => { const el = $(focusSel); if (el) el.focus(); }, 40);
      };
    }
    const aboutBtn = $("#landing-about");
    if (aboutBtn) aboutBtn.onclick = openLandingAbout;
    const landingPay = $("#landing-payment");
    if (landingPay) landingPay.onclick = openPaymentInfo;

    const submitBtn = $("#auth-submit");
    if (submitBtn) submitBtn.onclick = () => (authMode === "signup" ? submitSignup() : submitLogin());

    const onEnter = (e) => { if (e.key === "Enter") (authMode === "signup" ? submitSignup() : submitLogin()); };
    const emailInput = $("#auth-email");
    if (emailInput) emailInput.addEventListener("keydown", onEnter);
    const pwInput = $("#auth-password");
    if (pwInput) pwInput.addEventListener("keydown", onEnter);

    const forgotBtn = $("#auth-forgot");
    if (forgotBtn) forgotBtn.onclick = openForgotPassword;

    const useCodeBtn = $("#auth-use-code");
    if (useCodeBtn) useCodeBtn.onclick = async () => {
      if (!loginUseCode) await requestLoginCode();
      else { loginUseCode = false; updateLoginFields(); }
    };

    setAuthMode("login");

    $("#auth-google-btn").onclick = () => {
      if (!GOOGLE_CLIENT_ID) {
        confirmModal("Google-вхід ще не налаштовано",
          "Додай GOOGLE_CLIENT_ID у Vercel і в Google Cloud Console → Credentials → Authorized JavaScript origins додай точно: https://spokiy.me та https://www.spokiy.me (без слеша в кінці). Поки що скористайся email або кодом з листа.", () => {}, "Зрозуміло");
        return;
      }
      try {
        if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt();
        else toast("Google ще завантажується. Спробуй за кілька секунд або увійди email/кодом.", "warn");
      } catch (e) {
        toast("Google заблокував цей домен. Додай https://spokiy.me у Authorized JavaScript origins.", "warn", 7000);
      }
    };
    initGoogle();
  }

  function parseJwt(token) {
    try {
      const base = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(atob(base).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function askGender(cb) {
    openModal(`<h2>Ще один крок 🌿</h2>
      <p class="muted" style="margin:0 0 14px">Щоб тексти зверталися саме до тебе — обери стать.</p>
      <div class="gender-pick">
        <button type="button" class="gender-opt" data-g="female"><span class="gender-symbol">♀</span> Жінка</button>
        <button type="button" class="gender-opt" data-g="male"><span class="gender-symbol">♂</span> Чоловік</button>
      </div>`);
    $$("#modal-root .gender-opt").forEach(b => b.onclick = () => { closeModal(); cb(b.dataset.g); });
  }

  function initGoogle() {
    if (!GOOGLE_CLIENT_ID) return;
    let tries = 0;
    const tryInit = () => {
      if (!(window.google && google.accounts && google.accounts.id)) {
        if (tries++ < 40) return setTimeout(tryInit, 250);
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: async (resp) => {
            if (!resp || !resp.credential) { toast("Не вдалося увійти через Google", "warn"); return; }
            const data = parseJwt(resp.credential);
            if (!data || !data.email) { toast("Не вдалося увійти через Google", "warn"); return; }
            const doOAuth = async (gender) => {
              const res = await S.oauthLogin({
                credential: resp.credential,
                provider: "google",
                gender: gender || null
              });
              if (!res.ok) { toast(authErrorText(res.error), "warn"); return; }
              showApp();
            };
            const exists = await S.hasAccount(data.email);
            if (exists) {
              const g = S.accountGender(data.email);
              await doOAuth(g);
            } else {
              askGender(g => doOAuth(g));
            }
          }
        });
      } catch (e) {
        console.warn("Google Sign-In init failed", e);
        toast("Google-вхід недоступний на цьому домені. Додай https://spokiy.me у Authorized JavaScript origins.", "warn", 7000);
        return;
      }
      const box = $("#google-btn-box");
      if (box) {
        try {
          box.innerHTML = "";
          google.accounts.id.renderButton(box, {
            theme: "outline",
            size: "large",
            width: Math.min(320, Math.floor((box.parentElement && box.parentElement.clientWidth) || 320)),
            text: "continue_with",
            shape: "pill",
            locale: "uk"
          });
          const fb = $("#auth-google-btn"); if (fb) fb.classList.add("hidden");
        } catch (e) {
          console.warn("Google button render failed", e);
        }
      }
    };
    tryInit();
  }

  async function loadPublicConfig() {
    try {
      const headers = { Accept: "application/json" };
      try {
        const t = localStorage.getItem("spokiy:token");
        if (t) headers.Authorization = "Bearer " + t;
      } catch (e) {}
      const r = await fetch("/api/config", { headers });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.googleClientId) {
        GOOGLE_CLIENT_ID = String(j.googleClientId).trim();
      }
      window.SPOKIY_CONFIG = Object.assign({}, window.SPOKIY_CONFIG || {}, {
        googleClientId: GOOGLE_CLIENT_ID,
        admin: !!(j && j.admin)
      });
    } catch (e) { /* ignore */ }
  }

  /* ===================== СТАРТ ===================== */
  const NEW_SITE_ORIGIN = "https://spokiy.me";

  function isLegacyVercelHost() {
    const h = (location.hostname || "").toLowerCase();
    if (h === "spokiy.me" || h === "www.spokiy.me") return false;
    return h === "spokiy-2026.vercel.app" || /\.vercel\.app$/i.test(h);
  }

  function newSiteUrl() {
    return NEW_SITE_ORIGIN + (location.pathname || "/") + (location.search || "") + (location.hash || "");
  }

  function maybeShowDomainMoveNotice() {
    const root = $("#domain-move");
    if (!root || !isLegacyVercelHost()) return;

    const target = newSiteUrl();
    const go = $("#domain-move-go");
    if (go) go.setAttribute("href", target);

    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");

    // Не пропонуємо лишатися на старому домені — лише повідомляємо і переводимо.
    setTimeout(() => {
      try { location.replace(target); } catch (e) { location.href = target; }
    }, 2200);
  }

  async function boot() {
    maybeShowDomainMoveNotice();
    await loadPublicConfig();
    initAuth();
    if (window.Safeguard) {
      Safeguard.init({
        S, toast, openModal, closeModal, go, esc,
        confirmModal
      });
    }
    window.addEventListener("spokiy:sync-conflict", (ev) => {
      if (!window.Safeguard || !ev.detail || !Safeguard.handleConflictEvent) return;
      Safeguard.handleConflictEvent(ev.detail);
    });
    const profileBtn = $("#topbar-profile");
    if (profileBtn) {
      profileBtn.setAttribute("data-tour", "topbar-profile");
      profileBtn.onclick = () => go("profile");
    }
    const scrim = $("#scrim");
    if (scrim) scrim.onclick = closeSidebar;
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closeCrisis(); if (calmState) closeCalm(); } });

    // Дані підтягнулися з бекенда (SQLite) — оновити інтерфейс «на льоту».
    window.addEventListener("spokiy:synced", () => {
      if (!S.isAuthed() || $("#app").classList.contains("hidden")) return;
      if (route === "recoverySelect" && !needsRecoverySelect()) {
        go("home");
        return;
      }
      if (needsRecoverySelect() && route !== "recoverySelect") {
        go("recoverySelect");
        return;
      }
      renderNav();
      render();
    });

    // Після бота в Telegram — підтягнути хмару, коли повертаєшся на вкладку
    let lastFocusPull = 0;
    const pullOnFocus = () => {
      if (!S.isAuthed() || !S.refreshFromCloud) return;
      const now = Date.now();
      if (now - lastFocusPull < 8000) return;
      lastFocusPull = now;
      S.refreshFromCloud().catch(() => {});
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pullOnFocus();
    });
    window.addEventListener("focus", pullOnFocus);

    // М’яке повідомлення при зміні етапу рослини (без «рівнів» і без покарання).
    window.addEventListener("spokiy:recovery-award", (ev) => {
      const r = ev && ev.detail;
      if (!r || !r.awarded) return;
      if (r.stageChanged && r.message) toast(r.message, "good", 5200);
      maybeCelebratePracticeComplete();
      if ($("#app").classList.contains("hidden") || route !== "home") return;

      const art = $(".recovery-home-art");
      if (r.stageChanged && art && window.RecoveryArt) {
        RecoveryArt.setStage(art, r.stage);
        const rec = S.getRecovery();
        const symbol = rec.recoverySymbolId ? C.getRecoverySymbolById(rec.recoverySymbolId) : null;
        if (symbol) {
          const st = C.getRecoveryStageInfo(symbol, r.stage);
          const stageEl = $(".recovery-home-stage");
          const msgEl = $(".recovery-home-msg");
          if (stageEl && st) stageEl.textContent = "Етап · " + st.name;
          if (msgEl) msgEl.textContent = C.getRecoveryStageMessage(symbol, r.stage);
        }
        genderizeDOM($(".recovery-home"));
      }
      const modalRoot = $("#modal-root");
      if (!modalRoot || modalRoot.classList.contains("hidden")) render();
    });

    if (S.isAuthed()) showApp();
  }

  // глобальний доступ для кнопки кризи з будь-де
  window.SpokiyCrisis = () => startCalm("quick");

  if (window.Rituals) {
    try {
      Rituals.init({
        S, $, $$, esc, genderize, uiText, isMale, pluralUk, daysBetween, todayKey,
        openModal, closeModal, toast, confirmModal, go, startCalm
      });
    } catch (e) {
      console.warn("Rituals.init failed", e);
    }
  }

  function handleDeepLinks() {
    if (!S.isAuthed()) return;
    const p = new URLSearchParams(location.search);
    const sos = p.get("sos");
    if (sos === "breath" || sos === "quick" || sos === "ground") {
      setTimeout(() => startCalm("quick"), 500);
    }
    const r = p.get("route");
    if (r === "new") setTimeout(() => go("new"), 300);
    if (r === "payment") setTimeout(() => go("payment"), 300);
    if (p.has("sos") || p.has("route")) {
      history.replaceState(null, "", location.pathname);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
