/* Спокій — основна логіка додатку */
(function () {
  const C = window.CONTENT;
  const S = window.Store;

  /* ===================== Утиліти ===================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const uid = () => Math.random().toString(36).slice(2, 9);

  /* ===================== КОНФІГУРАЦІЯ ===================== */
  // Щоб увімкнути справжній вхід через Google — встав сюди Client ID
  // з Google Cloud Console (OAuth 2.0, тип «Web»), додавши свій домен у дозволені.
  const GOOGLE_CLIENT_ID = ""; // напр. "1234567890-abc.apps.googleusercontent.com"

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
  function openModal(html) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal" style="position:relative">${html}<button class="modal-x" data-close>×</button></div>`;
    root.classList.remove("hidden");
    genderizeDOM(root);
    root.onclick = (e) => { if (e.target === root || e.target.hasAttribute("data-close")) closeModal(); };
  }
  function closeModal() { const r = $("#modal-root"); r.classList.add("hidden"); r.innerHTML = ""; }

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
  // Скорочене меню для першої версії. Решта розділів доступні з головної.
  const NAV = [
    { id: "home", icon: "⌂", label: "Головна" },
    { id: "new", icon: "+", label: "Новий запис" },
    { id: "sos", icon: "SOS", label: "SOS", action: true },
    { id: "evidence", icon: "✓", label: "Банк доказів" },
    { id: "resources", icon: "◌", label: "Мої ресурси" },
    { id: "analytics", icon: "∿", label: "Аналітика" },
    { id: "joys", icon: "◇", label: "Мої радощі" },
    { id: "good", icon: "☺", label: "Хороші події" },
    { id: "gratitude", icon: "∴", label: "За що я вдячна" },
    { id: "friend", icon: "✉", label: "Порада подрузі" },
    { id: "history", icon: "≡", label: "Моя історія" }
  ];

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

  /* ===================== ІНСТРУКЦІЯ (про сайт) ===================== */
  function openGuide() {
    const items = [
      { ico: "SOS", t: "SOS — швидка допомога", d: "Коли накриває просто зараз: дихання животом 1 хвилина, заземлення й тепла фраза. Кнопка вгорі та в меню." },
      { ico: "01", t: "Мені тривожно", d: "Спокійний покроковий сценарій: оцінити стан, розкласти думку, подихати, заземлитися й повернути увагу до життя." },
      { ico: "+", t: "Новий запис і лист собі", d: "Записати тривогу чи страх і призначити день, коли варто перевірити — чи справдився він насправді." },
      { ico: "✓", t: "Банк доказів", d: "Колекція страхів, які не справдилися. Жива підбірка доказів, що тривога часто перебільшує." },
      { ico: "◌", t: "Мої ресурси", d: "Сайт сам збирає те, що тобі допомагає, і показує рейтинг найдієвіших способів заспокоєння." },
      { ico: "∿", t: "Аналітика / Мій прогрес", d: "Динаміка тривоги, настрою та енергії, серії днів, тригери й порівняння зі стартом." },
      { ico: "◇", t: "Мої маленькі радощі", d: "Збережи книги, фільми, музику, прогулянки, хобі — сайт час від часу нагадає про них." },
      { ico: "∴", t: "За що я сьогодні вдячна", d: "Коротко записуй одну-дві речі, які сьогодні дали опору, тепло або відчуття сенсу." },
      { ico: "✉", t: "Порада подрузі", d: "Поглянь на ситуацію очима доброї подруги — і подаруй цю ж підтримку собі." },
      { ico: "⌁", t: "Типи тривоги + тести", d: "Заспокійливі тести під різні тривоги, а для фінансової — окремий «Фінансовий потік»." },
      { ico: "□", t: "Скарбничка підтримки", d: "Цитати, афірмації, теплі слова, спогади й перемоги — щоб дістати їх у складний момент." },
      { ico: "§", t: "Бібліотека", d: "Короткі статті: як працює тривога, дихання, заземлення, кордони, робота з думками тощо." },
      { ico: "↑", t: "Прогрес і досягнення", d: "Маленькі перемоги відзначаються — за серії днів, перші доказі, перший лист собі." },
      { ico: "♪", t: "Музика настрою та теми", d: "Рядок із позитивною іноземною музикою вгорі екрана: перемикай рекомендації й швидко знаходь пісню для прослуховування." },
      { ico: "⌧", t: "Приватність", d: "Усі записи зберігаються лише на твоєму пристрої. Нічого не публікується без твоєї згоди." }
    ];
    openModal(`
      <h2>Про сайт «Спокій»</h2>
      <p class="muted" style="margin:0 0 14px;line-height:1.55">Головна мета — не аналізувати тривогу безкінечно, а швидше повертати тебе до спокою й власного життя. Ось що ти знайдеш тут для себе:</p>
      <div class="guide-list">
        ${items.map(i => `
          <div class="guide-item">
            <div class="guide-ico">${i.ico}</div>
            <div><b>${esc(i.t)}</b><p>${esc(i.d)}</p></div>
          </div>`).join("")}
      </div>
      <p class="muted" style="margin:16px 0 0;text-align:center;font-family:var(--font-hand);font-size:20px;color:var(--primary-d)">Тут не треба бути сильною чи ідеальною. Достатньо одного маленького кроку до себе. 🌿</p>
    `);
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
      <div class="song-bar" id="song-bar">
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
    const bar = $("#song-bar");
    if (!bar) { mountSongBar(); return; }
    bar.outerHTML = songBarHTML();
    wireSongBar();
  }
  function mountSongBar() {
    const view = $("#view");
    if (!view) return;
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
    return S.state.entries.filter(e => !e.reviewed && e.openDate && e.openDate <= tk);
  }

  function renderNav() {
    const nav = $("#nav");
    nav.innerHTML = NAV.map(n => {
      const active = route === n.id;
      const cls = "nav-item" + (active ? " active" : "") + (n.action ? " nav-sos" : "");
      return `<button class="${cls}" data-route="${n.id}">
        <span class="ico">${n.icon}</span><span>${n.label}</span></button>`;
    }).join("");
    $$(".nav-item", nav).forEach(b => b.onclick = () => {
      closeSidebar();
      if (b.dataset.route === "sos") { startCalm("quick"); return; }
      go(b.dataset.route);
    });
    genderizeDOM(nav);

    const p = S.state.profile;
    const initials = (p.name || p.email || "?").trim().charAt(0).toUpperCase();
    $("#user-chip").innerHTML = `
      <div class="user-avatar">${esc(initials)}</div>
      <div class="user-meta"><b>${esc(p.name || "Користувач")}</b><span>${esc(p.email)}</span></div>`;
    $("#user-chip").onclick = () => go("profile");
  }

  function go(r, param = null) {
    route = r; routeParam = param;
    $("#topbar-title").textContent = uiText(genderize((NAV.find(n => n.id === r) || {}).label || "Спокій"));
    renderNav();
    render();
    $("#view").scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }

  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); }

  /* ===================== Аналітика-обчислення ===================== */
  function computeStreak() {
    const cks = S.state.checkins;
    let streak = 0;
    let d = new Date();
    // якщо сьогодні ще немає запису — рахуємо від учора
    if (!cks[d.toISOString().slice(0,10)]) d.setDate(d.getDate() - 1);
    while (cks[d.toISOString().slice(0, 10)]) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }
  function filledDays() { return Object.keys(S.state.checkins).length; }

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
    return S.state.entries.filter(e => new Date(e.createdAt).getTime() >= since);
  }

  /* Червоні прапорці: 5 днів поспіль з тривогою 8-10 (за останніми днями) */
  function checkRedFlag() {
    const byDay = {};
    S.state.entries.forEach(e => {
      if (typeof e.anxiety !== "number") return;
      const k = new Date(e.createdAt).toISOString().slice(0, 10);
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
    const letters = S.state.entries.some(e => e.type === "letter");
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

  /* ===================== ГОЛОВНА ===================== */
  function viewHome() {
    const streak = computeStreak();
    const pend = pendingReminders();
    const ranking = S.resourceRanking();

    let banners = "";
    // Червоний прапорець
    if (checkRedFlag() && S.state.settings.dismissedRedFlag !== todayKey()) {
      banners += `<div class="banner banner-red">
        <div class="b-ico">!</div>
        <div style="flex:1"><b>Ти проходиш складний період</b>
        <p>Останні дні рівень тривоги високий. Можливо, зараз тобі допоможе підтримка психолога або близької людини. Ти не сама.</p></div>
        <button class="btn btn-sm btn-ghost" id="dismiss-red">Зрозуміло</button>
      </div>`;
    }
    // Нагадування про маленькі радощі / способи заспокоєння
    const litJoys = S.randomLittleJoys(2);
    if (litJoys.length) {
      const jl = litJoys.map(j => j.text).join(" або ");
      banners += `<div class="banner banner-violet">
        <div class="b-ico">◇</div>
        <div style="flex:1"><b>Маленька радість на сьогодні</b><p>Колись тебе тішило <b>${esc(jl)}</b>. Може, варто повернутися до цього сьогодні?</p></div>
        <button class="btn btn-sm btn-ghost" data-route="joys">Мої радощі</button>
      </div>`;
    } else if (ranking.length) {
      const list = ranking.slice(0, 2).map(r => r.name).join(" та ");
      banners += `<div class="banner banner-violet">
        <div class="b-ico">i</div>
        <div><b>Нагадування</b><p>У минулому тобі допомагало <b>${esc(list)}</b>. Спробуй це знову.</p></div>
      </div>`;
    }

    const reminderCard = pend.length ? `
      <div class="banner banner-warn">
        <div class="b-ico">!</div>
        <div style="flex:1"><b>Час повернутися до ${pend.length} ${pluralUk(pend.length,"запису","записів","записів")}</b>
        <p>Настав день відкриття. Перевір, чи справдилися твої страхи.</p></div>
        <button class="btn btn-sm btn-primary" data-route="reminders">Відкрити</button>
      </div>` : "";

    let shownAff = randomAff();

    const litCount = (S.state.littleJoys || []).length;

    $("#view").innerHTML = `
      <div class="welcome">
        <h1>${isMale() ? "Привіт. Тут можна зібратися без тиску" : "Привіт"}</h1>
        <p>${isMale() ? "Без пафосу і без оцінок. Видихни, подивимось на стан чесно й оберемо один нормальний крок далі." : "Тут не потрібно бути сильною чи ідеальною.<br>Зроби один маленький крок до себе."}</p>
      </div>
      ${banners}
      ${reminderCard}
      ${homeWellbeingCard()}

      <button class="sos-button" id="sos-btn">
        <span class="sos-ico">SOS</span>
        <span class="sos-text"><b>SOS: мені зараз тривожно</b><span>Дихання, заземлення та підтримка — прямо зараз</span></span>
      </button>

      <div class="home-actions two">
        <button class="big-action act-calm" id="act-calm">
          <span class="ba-ico">01</span>
          <span class="ba-title">Мені тривожно</span>
          <span class="ba-sub">Спокійно розберемося й повернемося до життя</span>
        </button>
        <button class="big-action act-new" id="act-new">
          <span class="ba-ico">+</span>
          <span class="ba-title">Новий запис</span>
          <span class="ba-sub">Записати думку чи лист собі</span>
        </button>
      </div>

      <div class="grid grid-2" style="margin-top:16px">
        <div class="stat streak-stat"><div class="s-ico">↑</div><div class="s-val">${streak}</div><div class="s-lbl">${pluralUk(streak,"день поспіль","дні поспіль","днів поспіль")}</div></div>
        <div class="card aff-card">
          <div class="card-title">${isMale() ? "Опора дня" : "Афірмація дня"}</div>
          <p id="aff-text" class="aff-text">${esc(shownAff)}</p>
          <div class="row">
            <button class="btn btn-primary btn-sm" id="next-aff">↻ Інша</button>
            <button class="btn btn-ghost btn-sm" id="save-aff">Зберегти</button>
          </div>
        </div>
      </div>

      <div class="card joys-card" id="joys-card" style="margin-top:16px">
        <div class="row spread">
          <div class="card-title" style="margin:0">Мої маленькі радощі</div>
          <span class="faint">${litCount}</span>
        </div>
        <p class="muted" style="margin:8px 0 0">Збережи те, що тебе тішить — книги, фільми, музику, прогулянки, хобі. Я нагадуватиму про це.</p>
      </div>

      <div class="more-grid" style="margin-top:16px">
        <button class="more-link" id="more-guide"><span>?</span>Інструкція</button>
        <button class="more-link" data-route="types"><span>⌁</span>Типи тривоги</button>
        <button class="more-link" data-route="analytics"><span>∿</span>Мій прогрес</button>
        <button class="more-link" data-route="good"><span>${isMale() ? "•" : "☺"}</span>Хороші події</button>
        <button class="more-link" data-route="gratitude"><span>∴</span>Вдячність</button>
        <button class="more-link" data-route="treasure"><span>□</span>Скарбничка</button>
        <button class="more-link" data-route="library"><span>§</span>Бібліотека</button>
        <button class="more-link" data-route="achievements"><span>↑</span>Прогрес</button>
      </div>
    `;

    $$("[data-route]", $("#view")).forEach(b => b.onclick = () => go(b.dataset.route));
    $("#sos-btn").onclick = () => startCalm("quick");
    $("#act-calm").onclick = () => startCalm("full");
    $("#act-new").onclick = () => go("new");
    $("#joys-card").onclick = () => go("joys");
    $("#more-guide").onclick = openGuide;
    wireWellbeingCard();
    const dr = $("#dismiss-red"); if (dr) dr.onclick = () => { S.state.settings.dismissedRedFlag = todayKey(); S.save(); render(); };

    const affEl = $("#aff-text");
    const showNextAff = () => {
      shownAff = randomAff(shownAff);
      affEl.style.opacity = "0";
      setTimeout(() => { affEl.textContent = shownAff; affEl.style.opacity = "1"; }, 220);
    };
    $("#next-aff").onclick = showNextAff;
    $("#save-aff").onclick = () => { S.addTreasure({ type: "affirmation", content: shownAff }); toast("Додано у скарбничку 💝", "good"); };
    // автоматичне оновлення кожні 12 секунд, поки відкрита головна
    affTimer = setInterval(() => { if (document.body.contains(affEl)) showNextAff(); else { clearInterval(affTimer); affTimer = null; } }, 12000);
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
    // відновлення чернетки
    if (!form) form = S.getDraft() || freshForm();

    const catChips = C.CATEGORIES.map(c => `<button type="button" class="chip ${form.category===c?"sel":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    const trigChips = C.TRIGGERS.map(t => `<button type="button" class="chip ${form.trigger===t?"sel":""}" data-trig="${esc(t)}">${esc(t)}</button>`).join("");
    const helpChips = C.RESOURCE_SUGGESTIONS.map(h => `<button type="button" class="chip ${form.helped.includes(h)?"sel":""}" data-help="${esc(h)}">${esc(h)}</button>`).join("");

    $("#view").innerHTML = `
      <div class="page-head"><h1>Новий запис</h1><p>Усе зберігається автоматично. Можна повернутися й завершити пізніше.</p></div>

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
    const persistDraft = () => S.saveDraft(form);

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

    $("#f-clear").onclick = () => confirmModal("Очистити чернетку?", "Введені дані буде видалено.", () => { S.clearDraft(); form = freshForm(); viewNew(); toast("Чернетку очищено"); });

    $("#f-save").onclick = () => {
      if (!form.fear.trim()) { toast("Опиши, що тебе тривожить 🙏", "warn"); return; }
      if (!form.anxiety) { toast("Обери рівень тривоги", "warn"); return; }
      const entry = S.addEntry({
        type: form.type, anxiety: form.anxiety, mood: form.mood, energy: form.energy,
        fear: form.fear.trim(), cause: form.cause.trim(), trigger: form.trigger, category: form.category,
        helped: form.helped.slice(), openDate: form.openDate, reviewed: false
      });
      // ресурси, що допомогли (ефективність = настрій або 3)
      form.helped.forEach(h => S.addResourceUse(h, form.mood || 3));
      const wasLetter = form.type === "letter";
      S.clearDraft();
      form = null;
      checkAchievements();
      toast(wasLetter ? "Лист збережено ✉️" : "Запис збережено 🌿", "good");
      closerModal(() => go("home"));
    };
  }

  /* ===================== НАГАДУВАННЯ / ВІДКРИТТЯ ===================== */
  function viewReminders() {
    const pend = pendingReminders();
    const upcoming = S.state.entries.filter(e => !e.reviewed && e.openDate && e.openDate > todayKey())
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
      $("[data-del]", card).onclick = () => confirmModal("Видалити запис?", "Цю дію не можна скасувати.", () => { S.removeEntry(e.id); go("reminders"); }, "Видалити", true);

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
    const hasGood = (S.state.goodEvents || []).some(e => e.dayKey === dayKey);
    if (w && w.level >= 7) return { mark: "😟", cls: "anxious", title: "Тривожний день" };
    if (hasGood || (w && w.level <= 4)) return { mark: "🙂", cls: "good", title: "Хороший / спокійний день" };
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
    checkAchievements();
  }

  /* ===================== АНАЛІТИКА ===================== */
  let charts = [];
  function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch (e) {} }); charts = []; }

  function viewAnalytics() {
    destroyCharts();
    const entries = S.state.entries.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const streak = computeStreak();

    const causes = topCounts(entries.map(e => e.cause), 3);
    const triggers = topCounts(entries.map(e => e.trigger), 3);
    const cats = topCounts(entries.map(e => e.category), 3);
    const ranking = S.resourceRanking().slice(0, 3);

    const last7 = entriesInLastDays(7), prev7 = S.state.entries.filter(e => { const t = new Date(e.createdAt).getTime(); return t < Date.now()-7*86400000 && t >= Date.now()-14*86400000; });
    const last30 = entriesInLastDays(30), prev30 = S.state.entries.filter(e => { const t = new Date(e.createdAt).getTime(); return t < Date.now()-30*86400000 && t >= Date.now()-60*86400000; });
    const a7 = avgAnxiety(last7), p7 = avgAnxiety(prev7);
    const a30 = avgAnxiety(last30), p30 = avgAnxiety(prev30);
    function trend(cur, prev) {
      if (cur == null) return `<span class="faint">немає даних</span>`;
      if (prev == null) return `${cur}/10`;
      const d = +(cur - prev).toFixed(1);
      const better = d < 0;
      return `${cur}/10 <span class="pill ${better?"pill-green":d>0?"pill-red":"pill-violet"}">${d<0?"▼":d>0?"▲":"="} ${Math.abs(d)}</span>`;
    }

    const tests = S.state.tests;
    const firstTest = tests[0], lastTest = tests[tests.length - 1];

    $("#view").innerHTML = `
      <div class="analytics-page">
      <div class="page-head"><h1>📊 Аналітика</h1><p>Твоя історія зберігається без обмежень. Ось що вона показує.</p></div>

      <div class="grid grid-4 analytics-stats">
        <div class="stat"><div class="s-ico">🔥</div><div class="s-val">${streak}</div><div class="s-lbl">серія днів</div></div>
        <div class="stat"><div class="s-ico">📝</div><div class="s-val">${filledDays()}</div><div class="s-lbl">заповнено днів</div></div>
        <div class="stat"><div class="s-ico">🛡️</div><div class="s-val">${S.state.evidence.length}</div><div class="s-lbl">страхів не справдилось</div></div>
        <div class="stat"><div class="s-ico">📈</div><div class="s-val">${entries.length}</div><div class="s-lbl">усього записів</div></div>
      </div>

      <div class="grid grid-2 analytics-grid">
        <div class="card analytics-card"><div class="card-title">📉 Прогрес тривоги</div>
          <div class="analytics-row"><span>За 7 днів (vs попередні 7)</span><b>${trend(a7,p7)}</b></div>
          <div class="analytics-row"><span>За 30 днів (vs попередні 30)</span><b>${trend(a30,p30)}</b></div>
        </div>
        <div class="card analytics-card"><div class="card-title">🧪 Тест тривожності: старт vs зараз</div>
          ${firstTest ? `<div class="analytics-row"><span>Перший тест (${fmtDate(firstTest.date)})</span><b>${firstTest.score} балів</b></div>
          <div class="analytics-row"><span>Останній тест (${fmtDate(lastTest.date)})</span><b>${lastTest.score} балів ${lastTest.score<firstTest.score?'<span class="pill pill-green">покращення</span>':lastTest.score>firstTest.score?'<span class="pill pill-warn">вище</span>':''}</b></div>
          <button class="btn btn-ghost btn-sm" id="retake" style="margin-top:8px">Пройти тест знову</button>`
          : `<p class="muted">Тест ще не пройдено.</p><button class="btn btn-primary btn-sm" id="retake">Пройти тест</button>`}
        </div>
      </div>

      <div class="grid grid-2 analytics-grid">
        <div class="card analytics-card chart-card"><div class="card-title">Рівень тривоги по днях</div><div class="chart-box"><canvas id="ch-anxiety"></canvas></div></div>
        <div class="card analytics-card chart-card"><div class="card-title">Динаміка настрою та енергії</div><div class="chart-box"><canvas id="ch-mood"></canvas></div></div>
      </div>

      <div class="grid grid-2 analytics-grid">
        <div class="card analytics-card chart-card"><div class="card-title">Тривога по тижнях</div><div class="chart-box"><canvas id="ch-weeks"></canvas></div></div>
        <div class="card analytics-card chart-card"><div class="card-title">Найчастіші категорії</div><div class="chart-box"><canvas id="ch-cats"></canvas></div></div>
      </div>

      <div class="grid grid-3 analytics-grid">
        <div class="card analytics-card"><div class="card-title">Найчастіші причини</div>${listOrEmpty(causes)}</div>
        <div class="card analytics-card"><div class="card-title">Найчастіші тригери</div>${listOrEmpty(triggers)}</div>
        <div class="card analytics-card"><div class="card-title">Найефективніша підтримка</div>${ranking.length?ranking.map(r=>`<div class="analytics-row"><span>${esc(r.name)}</span><span class="faint">ефект ${r.avg||"–"}/5</span></div>`).join(""):'<p class="muted">Немає даних</p>'}</div>
      </div>
      </div>
    `;

    const rt = $("#retake"); if (rt) rt.onclick = startTest;
    $$("[data-route]", $("#view")).forEach(b => b.onclick = () => go(b.dataset.route));

    if (!window.Chart) { return; }
    const purple = "#2fae8e", teal = "#5cc9aa", warn = "#e0a050";

    // тривога по днях (останні 21 запис по днях — макс на день)
    const byDay = {};
    entries.forEach(e => { if (typeof e.anxiety==="number"){ const k=new Date(e.createdAt).toISOString().slice(0,10); byDay[k]= byDay[k]?Math.max(byDay[k],e.anxiety):e.anxiety; }});
    const dayKeys = Object.keys(byDay).sort().slice(-21);
    charts.push(new Chart($("#ch-anxiety"), {
      type: "line",
      data: { labels: dayKeys.map(k=>k.slice(5)), datasets: [{ label:"Тривога", data: dayKeys.map(k=>byDay[k]), borderColor: purple, backgroundColor:"rgba(47,174,142,.14)", fill:true, tension:.35, pointRadius:3 }] },
      options: chartOpts(10)
    }));

    // настрій / енергія
    const moodDays = Object.keys(byDay).sort().slice(-21);
    const moodMap = {}, energyMap = {};
    entries.forEach(e => { const k=new Date(e.createdAt).toISOString().slice(0,10); if(e.mood) moodMap[k]=e.mood; if(e.energy) energyMap[k]=e.energy; });
    charts.push(new Chart($("#ch-mood"), {
      type:"line",
      data:{ labels: moodDays.map(k=>k.slice(5)), datasets:[
        { label:"Настрій", data: moodDays.map(k=>moodMap[k]??null), borderColor: teal, tension:.35, spanGaps:true, pointRadius:3 },
        { label:"Енергія", data: moodDays.map(k=>energyMap[k]??null), borderColor: warn, tension:.35, spanGaps:true, pointRadius:3 }
      ]}, options: chartOpts(5, true)
    }));

    // по тижнях
    const byWeek = {};
    entries.forEach(e => { if(typeof e.anxiety==="number"){ const k=weekKey(e.createdAt); (byWeek[k]=byWeek[k]||[]).push(e.anxiety); }});
    const weekKeys = Object.keys(byWeek).sort().slice(-8);
    charts.push(new Chart($("#ch-weeks"), {
      type:"bar",
      data:{ labels: weekKeys, datasets:[{ label:"Сер. тривога", data: weekKeys.map(k=>+(byWeek[k].reduce((s,x)=>s+x,0)/byWeek[k].length).toFixed(1)), backgroundColor: purple, borderRadius:8 }]},
      options: chartOpts(10)
    }));

    // категорії
    const catData = topCounts(entries.map(e=>e.category), 6);
    charts.push(new Chart($("#ch-cats"), {
      type:"doughnut",
      data:{ labels: catData.map(c=>c[0]), datasets:[{ data: catData.map(c=>c[1]), backgroundColor:["#2fae8e","#5cc9aa","#e0a050","#df7081","#67c89a","#8fd6b8"] }]},
      options:{ plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12, font:{ family:"Comfortaa" } } } }, responsive:true, maintainAspectRatio:false }
    }));
  }
  function listOrEmpty(arr) {
    return arr.length ? arr.map((c,i)=>`<div class="analytics-row"><span>${i+1}. ${esc(c[0])}</span><span class="faint">${c[1]} ${pluralUk(c[1],"раз","рази","разів")}</span></div>`).join("") : '<p class="muted">Немає даних</p>';
  }
  function weekKey(iso) {
    const d = new Date(iso); const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${String(d.getFullYear()).slice(2)}-Т${week}`;
  }
  function chartOpts(max, legend = false) {
    return { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display: legend, labels:{ font:{ family:"Comfortaa" } } } },
      scales:{ y:{ beginAtZero:true, max, ticks:{ font:{ family:"Comfortaa" } } }, x:{ ticks:{ font:{ family:"Comfortaa" }, maxRotation:0 } } } };
  }

  /* ===================== МОЯ ІСТОРІЯ ===================== */
  function viewHistory() {
    const e = S.state.entries;
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
      <div id="hist-body"></div>`;

    const tabs = $("#hist-tabs");
    const body = $("#hist-body");
    function entryCard(x) {
      const r = x.review;
      return `<div class="item"><div class="item-head">
        <div><span class="pill ${x.type==="letter"?"pill-violet":x.anxiety>=8?"pill-red":"pill-green"}">${x.type==="letter"?"Лист":"Тривога "+ (x.anxiety||"–")+"/10"}</span>
        ${x.category?`<span class="chip" style="margin-left:6px">${esc(x.category)}</span>`:""}</div>
        <span class="item-date">${fmtDateTime(x.createdAt)}</span></div>
        <div class="item-body">${esc(x.fear)}</div>
        ${x.cause?`<div class="faint" style="margin-top:6px">Причина: ${esc(x.cause)}</div>`:""}
        ${r?`<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
          <div><b>Чи справдився:</b> ${r.cameTrue==="no"?"Ні 🛡️":r.cameTrue==="partly"?"Частково":"Так"}</div>
          ${r.whatHappened?`<div style="margin-top:4px"><b>Сталося:</b> ${esc(r.whatHappened)}</div>`:""}
          ${r.lesson?`<div style="margin-top:4px"><b>Урок:</b> ${esc(r.lesson)}</div>`:""}
          ${r.toSelf?`<div style="margin-top:4px"><b>Собі:</b> ${esc(r.toSelf)}</div>`:""}
        </div>`:""}</div>`;
    }
    function paint(tab) {
      let html = "";
      if (tab === "diary") html = diary.length ? diary.map(entryCard).join("") : emptyBlock("📓","Ще немає записів");
      else if (tab === "letters") html = letters.length ? letters.map(entryCard).join("") : emptyBlock("✉️","Ще немає листів");
      else if (tab === "reviewed") html = reviewed.length ? reviewed.map(entryCard).join("") : emptyBlock("✅","Немає завершених відкриттів");
      else if (tab === "evidence") html = S.state.evidence.length ? S.state.evidence.map(x=>`<div class="item"><div class="item-head"><span class="pill pill-red">Страх</span><span class="item-date">${fmtDate(x.date)}</span></div><div class="item-body">${esc(x.fear)}</div><div style="margin-top:6px"><b>Реальність:</b> ${esc(x.realResult)}</div></div>`).join("") : emptyBlock("🛡️","Банк порожній");
      else if (tab === "treasure") html = S.state.treasure.length ? `<div class="gallery">${S.state.treasure.map(x=>`<div class="t-card">${x.image?`<img src="${x.image}">`:""}<div class="t-body"><div class="t-type">${esc(treasureLabel(x.type))}</div>${x.content?`<div class="t-content">${esc(x.content)}</div>`:""}</div></div>`).join("")}</div>` : emptyBlock("💝","Скарбничка порожня");
      body.innerHTML = html;
    }
    $$(".chip", tabs).forEach(b => b.onclick = () => { $$(".chip", tabs).forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); paint(b.dataset.tab); });
    paint("diary");
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
  function viewProfile() {
    applyGenderTheme();
    const p = S.state.profile;
    $("#view").innerHTML = `
      <div class="page-head"><h1>⚙️ Профіль і дані</h1><p>Керуй своїми даними. Усе залишається приватним.</p></div>

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
      </div>

      <div class="card">
        <div class="card-title">💾 Збереження та перенесення даних</div>
        <p class="muted">Дані зберігаються автоматично після кожної відповіді. Тут ти можеш створити резервну копію, перенести дані на інший пристрій або експортувати.</p>
        <div class="row">
          <button class="btn btn-ghost btn-sm" id="exp-json">⬇️ Резервна копія (JSON)</button>
          <button class="btn btn-ghost btn-sm" id="exp-csv">📄 Експорт у CSV</button>
          <button class="btn btn-ghost btn-sm" id="exp-pdf">🖨️ Експорт у PDF</button>
          <button class="btn btn-ghost btn-sm" id="imp-json">⬆️ Імпорт / перенести з файлу</button>
          <input type="file" id="imp-file" accept="application/json" class="hidden">
        </div>
      </div>

      <div class="card">
        <div class="card-title">☁️ Резервне хмарне збереження</div>
        ${CLOUD.endpoint ? `
          <p class="muted">Збережи копію в хмару, щоб записи не зникли при зміні телефону чи очищенні браузера.</p>
          <div class="row">
            <button class="btn btn-primary btn-sm" id="cloud-save">☁️ Зберегти в хмару</button>
            <button class="btn btn-ghost btn-sm" id="cloud-load">⬇️ Відновити з хмари</button>
          </div>` : `
          <p class="muted">Зараз дані зберігаються локально на цьому пристрої. Найнадійніший спосіб не втратити записи — час від часу робити <b>резервну копію (JSON)</b> вище і зберігати її в Google Drive, на пошті чи в месенджері. На новому пристрої просто зроби «Імпорт».</p>
          <p class="muted" style="margin-top:8px">Можна підключити автоматичну хмару (Google, Supabase чи власний сервер) — для цього у файлі <b>js/app.js</b> заповни налаштування <b>CLOUD.endpoint</b>. Після цього тут з'являться кнопки синхронізації.</p>`}
      </div>

      <div class="card">
        <div class="card-title">🧪 Тест тривожності</div>
        <p class="muted">Періодично проходь короткий тест, щоб бачити динаміку. Пройдено разів: <b>${(S.state.tests||[]).length}</b>.</p>
        <div class="row">
          <button class="btn btn-primary btn-sm" id="do-test">Пройти тест зараз</button>
          <button class="btn btn-ghost btn-sm" id="see-tests">📊 Результати тестів</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔒 Конфіденційність</div>
        <p class="muted">Усі дані приватні й зберігаються лише для тебе. Жодна інформація не публікується без твоєї згоди.</p>
        <div class="row">
          <button class="btn btn-ghost btn-sm" id="logout">Вийти</button>
          <button class="btn btn-danger btn-sm" id="del-all">🗑 Видалити всі дані та профіль</button>
        </div>
      </div>`;

    $("#exp-json").onclick = () => downloadFile("spokiy-backup.json", S.exportJSON(), "application/json");
    $("#exp-csv").onclick = exportCSV;
    $("#exp-pdf").onclick = exportPDF;
    $("#imp-json").onclick = () => $("#imp-file").click();
    $("#imp-file").onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        confirmModal("Імпортувати дані?", "Поточні дані буде замінено даними з файлу. Рекомендуємо спершу зробити резервну копію.", () => {
          try { S.importJSON(reader.result); toast("Дані успішно перенесено ✅", "good"); go("home"); }
          catch (err) { toast("Помилка: " + err.message, "warn"); }
        }, "Імпортувати");
      };
      reader.readAsText(file);
    };
    $("#do-test").onclick = startTest;
    $("#see-tests").onclick = openTestHistory;
    if (CLOUD.endpoint) {
      $("#cloud-save").onclick = cloudSave;
      $("#cloud-load").onclick = () => confirmModal("Відновити з хмари?", "Поточні дані буде замінено копією з хмари.", cloudLoad, "Відновити");
    }
    $$("#prof-gender .gender-opt").forEach(b => b.onclick = () => {
      S.setGender(b.dataset.g);
      applyGenderTheme();
      toast("Збережено 🌿", "good");
      render();
    });
    $("#logout").onclick = () => confirmModal("Вийти з акаунта?", "Твої дані залишаться збереженими на цьому пристрої.", () => { S.logout(); location.reload(); });
    $("#del-all").onclick = () => confirmModal("Видалити ВСІ дані?", "Це назавжди видалить твій профіль і всі записи з цього пристрою. Дію не можна скасувати. Бажаєш спершу зробити резервну копію?", () => {
      S.deleteAllData(); location.reload();
    }, "Видалити назавжди", true);
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
    const rows = [["Дата","Тип","Тривога","Настрій","Енергія","Страх","Причина","Тригер","Категорія","Допомогло","День відкриття","Справдився","Що сталося","Урок"]];
    S.state.entries.forEach(e => {
      const r = e.review || {};
      rows.push([fmtDate(e.createdAt), e.type, e.anxiety||"", e.mood||"", e.energy||"", e.fear||"", e.cause||"", e.trigger||"", e.category||"", (e.helped||[]).join("; "), e.openDate||"", r.cameTrue||"", r.whatHappened||"", r.lesson||""]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    downloadFile("spokiy-data.csv", csv, "text/csv");
  }

  function exportPDF() {
    const p = S.state.profile;
    const win = window.open("", "_blank");
    const style = `body{font-family:Comfortaa,Arial,sans-serif;color:#233029;padding:30px;line-height:1.5}h1{color:#1f9579}h2{color:#2fae8e;margin-top:24px;border-bottom:1px solid #eee;padding-bottom:4px}.it{margin:10px 0;padding:10px;border:1px solid #eee;border-radius:8px}.d{color:#999;font-size:12px}@media print{button{display:none}}`;
    const evHtml = S.state.evidence.map(x=>`<div class="it"><b>Страх:</b> ${esc(x.fear)}<br><b>Реальність:</b> ${esc(x.realResult)}<br>${x.conclusion?`<b>Висновок:</b> ${esc(x.conclusion)}`:""}</div>`).join("") || "<p>—</p>";
    const enHtml = S.state.entries.map(x=>`<div class="it"><div class="d">${fmtDateTime(x.createdAt)} · ${x.type==="letter"?"Лист":"Тривога "+(x.anxiety||"–")+"/10"}</div>${esc(x.fear)}${x.review?`<br><i>Підсумок: ${x.review.cameTrue==="no"?"страх не справдився":x.review.cameTrue==="partly"?"справдився частково":"справдився"}. ${esc(x.review.whatHappened||"")}</i>`:""}</div>`).join("") || "<p>—</p>";
    win.document.write(`<html><head><meta charset="utf-8"><title>Спокій — звіт</title><style>${style}</style></head><body>
      <h1>🌿 Спокій — особистий звіт</h1>
      <p class="d">${esc(p.name||"")} · ${esc(p.email)} · ${fmtDate(new Date().toISOString())}</p>
      <p>Заповнено днів: <b>${filledDays()}</b> · Серія: <b>${computeStreak()}</b> · Страхів не справдилось: <b>${S.state.evidence.length}</b></p>
      <h2>🛡️ Банк доказів</h2>${evHtml}
      <h2>📜 Записи</h2>${enHtml}
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
      history: viewHistory, library: viewLibrary, achievements: viewAchievements, profile: viewProfile
    };
    (map[route] || viewHome)();
    mountSongBar();
    genderizeDOM($("#view"));
  }

  /* ===================== АВТОРИЗАЦІЯ ===================== */
  function showApp() {
    applyGenderTheme();
    $("#auth-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    renderNav();
    // якщо стать не вказана (старий акаунт) — запитати один раз
    if (!S.state.profile.gender) {
      setTimeout(() => askGender(g => { S.setGender(g); applyGenderTheme(); render(); startOnboarding(); }), 400);
    } else {
      startOnboarding();
    }
    checkAchievements(true);
    go("home");
    notifyReminders();
  }

  function startOnboarding() {
    // Одразу після входу — швидкий замір самопочуття: шкала тривожності 1–10
    // (SUDS з КПТ). Називання рівня саме по собі знижує напругу (affect labeling),
    // тому питаємо м'яко, раз на день і з можливістю відкласти — без примусу.
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
  function initAuth() {
    // вибір статі (обов'язково при реєстрації)
    $$("#auth-gender .gender-opt").forEach(b => b.onclick = () => {
      authGender = b.dataset.gender;
      $$("#auth-gender .gender-opt").forEach(x => x.classList.toggle("sel", x === b));
    });

    // Лендинг: «Почати щоденник» — плавно до форми реєстрації
    const startBtn = $("#landing-start");
    if (startBtn) startBtn.onclick = () => {
      const reg = $("#auth-reg");
      if (reg) reg.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { const n = $("#auth-name"); if (n) n.focus(); }, 480);
    };
    // Лендинг: «Мені зараз тривожно» — швидке заспокоєння без реєстрації
    [$("#landing-sos"), $("#landing-sos2")].forEach(b => { if (b) b.onclick = openQuickCalm; });

    const emailSignup = () => {
      const name = $("#auth-name").value.trim();
      const email = $("#auth-email").value.trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Введи коректний email", "warn"); return; }
      // якщо акаунт уже існує — стать беремо збережену; інакше вимагаємо вибір
      const existing = S.hasAccount(email);
      if (!existing && !authGender) { toast("Будь ласка, обери стать 🌿", "warn"); return; }
      S.login({ name: name || email.split("@")[0], email, provider: "email", gender: authGender || undefined });
      showApp();
    };
    $("#auth-email-btn").onclick = emailSignup;
    $("#auth-email").addEventListener("keydown", e => { if (e.key === "Enter") emailSignup(); });

    // Google: справжній OAuth через Google Identity Services
    $("#auth-google-btn").onclick = () => {
      if (!GOOGLE_CLIENT_ID) {
        confirmModal("Google-вхід ще не налаштовано",
          "Щоб увімкнути вхід через Google, потрібен власний Client ID із Google Cloud Console (OAuth 2.0). Додай його у файл js/app.js (константа GOOGLE_CLIENT_ID) і додай свій домен у дозволені. Поки що скористайся входом через Email.", () => {}, "Зрозуміло");
        return;
      }
      if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt();
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
        if (tries++ < 20) return setTimeout(tryInit, 300);
        return;
      }
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => {
          const data = parseJwt(resp.credential);
          if (!data || !data.email) { toast("Не вдалося увійти через Google", "warn"); return; }
          const proceed = (gender) => {
            S.login({ name: data.name || data.email.split("@")[0], email: data.email, provider: "google", picture: data.picture, gender });
            showApp();
          };
          if (S.hasAccount(data.email) && S.accountGender(data.email)) proceed(S.accountGender(data.email));
          else askGender(proceed);
        }
      });
      const box = $("#google-btn-box");
      if (box) {
        google.accounts.id.renderButton(box, { theme: "outline", size: "large", width: 320, text: "continue_with", shape: "pill" });
        const fb = $("#auth-google-btn"); if (fb) fb.classList.add("hidden");
      }
    };
    tryInit();
  }

  /* ===================== СТАРТ ===================== */
  function boot() {
    initAuth();
    // глобальні кнопки
    $("#crisis-pill").onclick = () => startCalm("quick");
    $("#crisis-sidebar").onclick = () => { startCalm("quick"); closeSidebar(); };
    $("#menu-toggle").onclick = () => { $("#sidebar").classList.toggle("open"); $("#scrim").classList.toggle("show"); };
    $("#scrim").onclick = closeSidebar;
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closeCrisis(); if (calmState) closeCalm(); } });

    // Дані підтягнулися з бекенда (SQLite) — оновити інтерфейс «на льоту».
    window.addEventListener("spokiy:synced", () => {
      if (S.isAuthed() && !$("#app").classList.contains("hidden")) { renderNav(); render(); }
    });

    if (S.isAuthed()) showApp();
  }

  // глобальний доступ для кнопки кризи з будь-де
  window.SpokiyCrisis = () => startCalm("quick");

  document.addEventListener("DOMContentLoaded", boot);
})();
