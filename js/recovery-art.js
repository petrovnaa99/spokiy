/* Легкі SVG-анімації символу внутрішнього відновлення (без відео/GIF/3D). */
window.RecoveryArt = (function () {
  const IDS = ["lavender", "magnolia", "olive", "oak", "cedar", "bonsai"];

  function clampStage(n) {
    const v = Math.floor(Number(n) || 1);
    return Math.max(1, Math.min(6, v));
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
  }

  /** Слабкий пристрій / економія даних → менше руху. */
  function isLowPowerDevice() {
    try {
      if (navigator.connection && (navigator.connection.saveData || /2g/i.test(navigator.connection.effectiveType || ""))) {
        return true;
      }
      if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory > 0 && navigator.deviceMemory <= 2) {
        return true;
      }
      if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) {
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function shouldLoopAnimate() {
    return !prefersReducedMotion() && !isLowPowerDevice();
  }

  function commonAttrs(style, stage, anim) {
    const st = style === "solid" ? "solid" : "gentle";
    const s = clampStage(stage);
    const animCls = anim && shouldLoopAnimate() ? " rs-anim" : "";
    return {
      open: `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" class="rs-svg rs-svg--${st}${animCls}" data-stage="${s}" data-style="${st}" aria-hidden="true"`,
      stage: s,
      style: st
    };
  }

  function layer(appear, cls, inner) {
    return `<g class="rs-layer rs-need-${appear} ${cls || ""}" data-appear="${appear}">${inner}</g>`;
  }

  /** Деревце: пагін → коріння → листочки → пишна крона → цвіт → плоди. */
  function svgLavender(meta) {
    const leaf = (cx, cy, rx, ry, rot, op) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="currentColor" stroke="none" opacity="${op}"/>`;
    const flower = (cx, cy, s) => `
      <g transform="translate(${cx} ${cy}) scale(${s})" fill="none" stroke="currentColor" stroke-width="1.1">
        <path d="M0-3.4c1.2-1.6 2.8-.4 2.2 1.2C3.8-.8 3.2 1.2 1.6 1.4c.6 1.8-1 2.8-2.2 1.6C-1.8 4.2-3.4 3.2-2.8 1.4-4.4 1.2-5-.8-3.4-2.2-4-3.8-2.4-5 0-3.4z" fill="currentColor" stroke="none" opacity=".5"/>
        <circle cx="0" cy="0" r="1.15" fill="currentColor" stroke="none" opacity=".85"/>
        <circle cx="0" cy="-2.8" r="1.55" opacity=".9"/>
        <circle cx="2.4" cy="-0.9" r="1.55" opacity=".9"/>
        <circle cx="1.5" cy="2.1" r="1.55" opacity=".9"/>
        <circle cx="-1.5" cy="2.1" r="1.55" opacity=".9"/>
        <circle cx="-2.4" cy="-0.9" r="1.55" opacity=".9"/>
      </g>`;
    const fruit = (cx, cy, r) => `
      <g>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="currentColor" stroke-width="1.05" opacity=".92"/>
        <ellipse cx="${cx - r * 0.28}" cy="${cy - r * 0.32}" rx="${r * 0.38}" ry="${r * 0.28}" fill="#fff6ec" stroke="none" opacity=".55"/>
        <path d="M${cx} ${cy - r}v-2.2" fill="none" stroke="currentColor" stroke-width="1" opacity=".7"/>
      </g>`;
    return `<svg ${meta.open} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35">
      <g class="rs-glow"><circle class="rs-glow-orb" cx="40" cy="26" r="26" fill="currentColor" stroke="none"/></g>
      ${layer(1, "rs-stem", `
        <path d="M33 72h14" opacity=".4"/>
        <path d="M40 72V49"/>
        <path d="M40 51c-3-7-1.5-12 0-15 1.5 3 3 8 0 15z" fill="currentColor" stroke="none" opacity=".42"/>
        <ellipse cx="40" cy="48" rx="2.6" ry="3.6" fill="currentColor" stroke="none" opacity=".58"/>`)}
      ${layer(2, "rs-base-soft", `
        <path d="M40 72c-9 2-15 4-19 5.5M40 72c9 2 15 4 19 5.5" opacity=".58"/>
        <path d="M40 72c-3.5 3-5 6.5-5 9M40 72c3.5 3 5 6.5 5 9" opacity=".4"/>
        <path d="M40 62V36" stroke-width="1.8"/>
        <path d="M40 56c-7-3-10-2-13 2M40 56c7-3 10-2 13 2"/>
        ${leaf(27, 54, 5, 2.8, -34, .48)}
        ${leaf(53, 54, 5, 2.8, 34, .48)}`)}
      ${layer(3, "rs-leaves rs-sway", `
        <path d="M40 50C32 48 26 44 24 40"/>
        <path d="M40 46C48 44 54 40 56 36"/>
        <path d="M40 42C34 38 30 32 29 28"/>
        <path d="M40 40C46 36 50 30 52 27"/>
        ${leaf(23, 40, 7, 3.8, -38, .58)}
        ${leaf(57, 37, 7, 3.8, 34, .58)}
        ${leaf(28, 30, 6.4, 3.5, -48, .55)}
        ${leaf(52, 28, 6.4, 3.5, 44, .55)}
        ${leaf(35, 34, 5.6, 3.1, -16, .5)}
        ${leaf(46, 33, 5.6, 3.1, 18, .5)}
        ${leaf(40, 26, 5.8, 3.2, 0, .52)}`)}
      ${layer(4, "rs-crown rs-sway-slow", `
        <path d="M40 40V24" stroke-width="1.6"/>
        <path d="M40 34C28 30 20 28 16 30"/>
        <path d="M40 32C52 28 60 26 64 28"/>
        <path d="M40 28C30 22 24 16 22 14"/>
        <path d="M40 28C50 22 56 16 58 14"/>
        <ellipse cx="40" cy="22" rx="21" ry="17" fill="currentColor" stroke="none" opacity=".28"/>
        <ellipse cx="24" cy="28" rx="13" ry="11" fill="currentColor" stroke="none" opacity=".4"/>
        <ellipse cx="56" cy="27" rx="13" ry="11" fill="currentColor" stroke="none" opacity=".4"/>
        <ellipse cx="40" cy="15" rx="14" ry="12" fill="currentColor" stroke="none" opacity=".42"/>
        <ellipse cx="16" cy="30" rx="8" ry="7" fill="currentColor" stroke="none" opacity=".36"/>
        <ellipse cx="64" cy="29" rx="8" ry="7" fill="currentColor" stroke="none" opacity=".36"/>
        ${leaf(13, 27, 6.4, 3.5, -44, .6)}
        ${leaf(67, 26, 6.4, 3.5, 42, .6)}
        ${leaf(20, 18, 6, 3.3, -30, .58)}
        ${leaf(60, 17, 6, 3.3, 28, .58)}
        ${leaf(28, 12, 5.8, 3.2, -20, .58)}
        ${leaf(52, 11, 5.8, 3.2, 18, .58)}
        ${leaf(40, 8, 6.2, 3.4, 0, .62)}
        ${leaf(32, 22, 5.6, 3.1, -10, .52)}
        ${leaf(49, 21, 5.6, 3.1, 12, .52)}
        ${leaf(24, 34, 5.8, 3.2, -26, .55)}
        ${leaf(57, 33, 5.8, 3.2, 24, .55)}
        ${leaf(36, 16, 5.2, 2.9, -6, .5)}
        ${leaf(45, 15, 5.2, 2.9, 8, .5)}`)}
      ${layer(5, "rs-bloom rs-sway", `
        ${leaf(18, 22, 5.8, 3.2, -36, .48)}
        ${leaf(62, 21, 5.8, 3.2, 34, .48)}
        ${flower(27, 15, 1.15)}
        ${flower(53, 14, 1.15)}
        ${flower(40, 9, 1.1)}
        ${flower(33, 23, .95)}
        ${flower(48, 22, .95)}`)}
      ${layer(6, "rs-petals rs-petal-pop", `
        ${leaf(12, 25, 6.5, 3.5, -42, .5)}
        ${leaf(68, 24, 6.5, 3.5, 40, .5)}
        ${flower(28, 12, .7)}
        ${flower(52, 11, .7)}
        ${fruit(33, 26, 3.8)}
        ${fruit(48, 24, 4)}
        ${fruit(40, 16, 3.5)}
        ${fruit(23, 21, 3.3)}
        ${fruit(57, 20, 3.3)}
        ${fruit(30, 10, 3)}
        ${fruit(51, 9, 3)}`)}
    </svg>`;
  }

  function svgMagnolia(meta) {
    return `<svg ${meta.open} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35">
      <g class="rs-glow"><circle class="rs-glow-orb" cx="40" cy="32" r="20" fill="currentColor" stroke="none"/></g>
      ${layer(1, "rs-stem", `<path d="M40 70V44"/>`)}
      ${layer(2, "rs-roots rs-solid-only", `<path d="M34 70h12" opacity=".5"/>`)}
      ${layer(2, "rs-base-soft", `<path d="M40 56c-9-1-14 3-16 8M40 56c9-1 14 3 16 8"/>`)}
      ${layer(3, "rs-leaves rs-sway", `<path d="M40 48c-8-1-12 2-14 6M40 48c8-1 12 2 14 6"/>`)}
      ${layer(4, "rs-crown rs-sway-slow", `
        <path d="M40 38c-10-2-13-11-9-17 5 2 9 8 9 17z"/>
        <path d="M40 38c10-2 13-11 9-17-5 2-9 8-9 17z"/>`)}
      ${layer(5, "rs-bloom rs-sway", `
        <path d="M40 38c-3-11 2-18 7-20-2 7 0 14-7 20z"/>
        <path d="M40 38c3-11-2-18-7-20 2 7 0 14 7 20z"/>
        <circle cx="40" cy="36" r="2.8" fill="currentColor" stroke="none" opacity=".35"/>`)}
      ${layer(6, "rs-petals rs-petal-pop", `
        <path d="M40 22c-4-6 0-10 4-11-1 4 0 8-4 11z" opacity=".7"/>
        <path d="M40 22c4-6 0-10-4-11 1 4 0 8 4 11z" opacity=".7"/>`)}
    </svg>`;
  }

  function svgOlive(meta) {
    return `<svg ${meta.open} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35">
      <g class="rs-glow"><circle class="rs-glow-orb" cx="40" cy="30" r="21" fill="currentColor" stroke="none"/></g>
      ${layer(1, "rs-stem", `<path d="M40 72V34"/>`)}
      ${layer(2, "rs-roots rs-solid-only", `<path d="M40 72c-7 1-11 3-14 5M40 72c7 1 11 3 14 5" opacity=".55"/>`)}
      ${layer(3, "rs-leaves rs-sway", `
        <ellipse cx="30" cy="40" rx="6" ry="11" transform="rotate(-30 30 40)"/>
        <ellipse cx="50" cy="38" rx="6" ry="11" transform="rotate(26 50 38)"/>`)}
      ${layer(4, "rs-crown rs-sway-slow", `
        <ellipse cx="35" cy="26" rx="5" ry="8" transform="rotate(-16 35 26)"/>
        <ellipse cx="46" cy="24" rx="5" ry="8" transform="rotate(14 46 24)"/>`)}
      ${layer(5, "rs-bloom", `<ellipse cx="40" cy="44" rx="3" ry="4.2" fill="currentColor" stroke="none" opacity=".3"/>`)}
      ${layer(6, "rs-petals rs-petal-pop", `
        <ellipse cx="40" cy="42" rx="3.4" ry="4.8" fill="currentColor" stroke="none" opacity=".45"/>
        <path d="M40 36c-3-6 1-10 4-11" opacity=".65"/>`)}
    </svg>`;
  }

  function svgOak(meta) {
    return `<svg ${meta.open} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55">
      <g class="rs-glow"><circle class="rs-glow-orb" cx="40" cy="30" r="20" fill="currentColor" stroke="none"/></g>
      ${layer(1, "rs-stem", `<path d="M40 72V42"/><path d="M30 72h20" opacity=".7"/>`)}
      ${layer(2, "rs-roots rs-root-grow", `
        <path d="M40 72c-8 3-14 5-18 6"/>
        <path d="M40 72c8 3 14 5 18 6"/>
        <path d="M40 72c-3 4-4 7-4 9"/>
        <path d="M40 72c3 4 4 7 4 9"/>`)}
      ${layer(3, "rs-branch-new rs-sway-min", `<path d="M40 52l-11 7"/><path d="M40 48l11 6"/>`)}
      ${layer(4, "rs-crown rs-sway-min", `<circle cx="40" cy="30" r="15"/><path d="M29 30c4-7 11-11 18-7"/>`)}
      ${layer(5, "rs-strength", `
        <path d="M33 36c5 3 13 2 17-3"/>
        <circle cx="34" cy="26" r="1.5" fill="currentColor" stroke="none"/>
        <circle cx="46" cy="32" r="1.5" fill="currentColor" stroke="none"/>`)}
      ${layer(6, "rs-unfold rs-petal-pop", `
        <circle cx="40" cy="22" r="1.3" fill="currentColor" stroke="none"/>
        <path d="M26 28c3-8 10-12 18-10" opacity=".85"/>
        <path d="M54 28c-3-8-10-12-18-10" opacity=".85"/>`)}
    </svg>`;
  }

  function svgCedar(meta) {
    return `<svg ${meta.open} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55">
      <g class="rs-glow"><circle class="rs-glow-orb" cx="40" cy="34" r="19" fill="currentColor" stroke="none"/></g>
      ${layer(1, "rs-stem", `<path d="M40 72V48"/><path d="M31 72h18" opacity=".7"/>`)}
      ${layer(2, "rs-roots rs-root-grow", `<path d="M40 72c-7 2-12 4-15 5M40 72c7 2 12 4 15 5"/>`)}
      ${layer(3, "rs-branch-new", `<path d="M40 42l10 12H30z" opacity=".55"/>`)}
      ${layer(4, "rs-crown rs-sway-min", `<path d="M40 30l12 14H28z"/>`)}
      ${layer(5, "rs-strength", `<path d="M40 20l14 16H26z"/><path d="M34 36h12" opacity=".6"/>`)}
      ${layer(6, "rs-unfold rs-petal-pop", `<path d="M40 16l15 16H25z" opacity=".9"/><path d="M40 24v6"/>`)}
    </svg>`;
  }

  function svgBonsai(meta) {
    return `<svg ${meta.open} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
      <g class="rs-glow"><circle class="rs-glow-orb" cx="40" cy="32" r="20" fill="currentColor" stroke="none"/></g>
      ${layer(1, "rs-stem", `<path d="M24 70h32"/><path d="M30 70c2-5 5-7 10-7s8 2 10 7"/><path d="M40 63V46"/>`)}
      ${layer(2, "rs-roots rs-root-grow", `<path d="M40 63c-8-1-13 2-15 6" opacity=".7"/>`)}
      ${layer(3, "rs-branch-new rs-sway-min", `<path d="M40 52c7-8 14-7 18-2"/>`)}
      ${layer(4, "rs-crown rs-sway-min", `<circle cx="32" cy="36" r="8"/><circle cx="48" cy="30" r="7"/>`)}
      ${layer(5, "rs-strength", `<circle cx="42" cy="20" r="6"/><circle cx="54" cy="40" r="5"/>`)}
      ${layer(6, "rs-unfold rs-petal-pop", `<circle cx="38" cy="14" r="4.5" opacity=".85"/><path d="M40 46c-7-8-3-15 2-18" opacity=".7"/>`)}
    </svg>`;
  }

  const builders = {
    lavender: svgLavender,
    magnolia: svgMagnolia,
    olive: svgOlive,
    oak: svgOak,
    cedar: svgCedar,
    bonsai: svgBonsai
  };

  /**
   * @param {string} id
   * @param {{ stage?: number, style?: "gentle"|"solid", animate?: boolean }} [opts]
   */
  function svg(id, opts) {
    const o = opts || {};
    const style = o.style === "solid" || o.style === "gentle"
      ? o.style
      : (id === "oak" || id === "cedar" || id === "bonsai" ? "solid" : "gentle");
    const meta = commonAttrs(style, o.stage, o.animate !== false);
    const build = builders[id] || builders.lavender;
    return build(meta);
  }

  /** Оновити data-stage на вже змонтованому SVG (плавний перехід 1–2 с через CSS). */
  function setStage(root, stage) {
    if (!root) return;
    const svgEl = root.matches && root.matches("svg.rs-svg") ? root : root.querySelector("svg.rs-svg");
    if (!svgEl) return;
    const next = String(clampStage(stage));
    const prev = svgEl.getAttribute("data-stage");
    if (prev === next) return;
    svgEl.setAttribute("data-stage", next);
    svgEl.classList.add("rs-stage-up");
    window.setTimeout(() => svgEl.classList.remove("rs-stage-up"), 1800);
  }

  /** Легка реакція на натискання. */
  function bindPress(el) {
    if (!el || prefersReducedMotion()) return;
    const bump = () => {
      el.classList.add("rs-press");
      window.setTimeout(() => el.classList.remove("rs-press"), 220);
    };
    el.addEventListener("pointerdown", bump);
  }

  /**
   * Делікатні частинки лише після завершення практики.
   * @param {HTMLElement} host
   */
  function burstParticles(host) {
    if (!host || prefersReducedMotion() || isLowPowerDevice()) return;
    if (typeof host.getBoundingClientRect === "function") {
      const r = host.getBoundingClientRect();
      // Не запускати, якщо майже не видно.
      if (r.bottom < 0 || r.top > (window.innerHeight || 0) || r.width < 8) return;
    }
    const layer = document.createElement("div");
    layer.className = "rs-particles";
    layer.setAttribute("aria-hidden", "true");
    const count = 7;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("i");
      p.style.setProperty("--rs-px", ((i / (count - 1)) * 70 - 35).toFixed(1) + "px");
      p.style.setProperty("--rs-delay", (i * 45) + "ms");
      p.style.setProperty("--rs-dur", (900 + (i % 3) * 160) + "ms");
      layer.appendChild(p);
    }
    host.appendChild(layer);
    window.setTimeout(() => { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 1600);
  }

  /** Пауза циклічних анімацій поза viewport. */
  function observeVisibility(root) {
    if (!root || !window.IntersectionObserver || !shouldLoopAnimate()) return;
    const svgEl = root.querySelector("svg.rs-svg") || (root.matches && root.matches("svg.rs-svg") ? root : null);
    if (!svgEl) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && en.intersectionRatio > 0.12) svgEl.classList.add("rs-anim");
        else svgEl.classList.remove("rs-anim");
      });
    }, { threshold: [0, 0.12, 0.25] });
    io.observe(root);
    return io;
  }

  function knownIds() { return IDS.slice(); }

  return {
    svg,
    setStage,
    bindPress,
    burstParticles,
    observeVisibility,
    prefersReducedMotion,
    isLowPowerDevice,
    shouldLoopAnimate,
    knownIds
  };
})();
