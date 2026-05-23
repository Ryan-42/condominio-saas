// ════════════════════════════════════════════════════════════
//  space.js — Aurora blobs + rede de partículas  |  Theme-aware
// ════════════════════════════════════════════════════════════

(function () {
  const canvas = document.getElementById("space-canvas");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d", { alpha: false });

  const COUNT    = 72;
  const MAX_DIST = 145;
  const MOUSE_D  = 190;

  let W, H, mouse = { x: -9999, y: -9999 };

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener("mouseleave", () => { mouse.x = mouse.y = -9999; });

  // ── Paletas por tema ─────────────────────────────────────
  function getPalette() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) {
      return {
        bg:      "#08091A",
        c1:      "#6C63FF",
        c2:      "#9C8FFF",
        c3:      "#CE93D8",
        neutral: "#E8E6FF",
        aurora: [
          { r: 108, g:  99, b: 255 },
          { r:  92, g: 107, b: 192 },
          { r:  57, g:  73, b: 171 },
        ],
        lineC:  [108,  99, 255],
        lineN:  [156, 143, 255],
        mouseL: [108,  99, 255],
        auroraAlpha: [0.12, 0.06],
      };
    } else {
      return {
        bg:      "#EDF2FF",
        c1:      "#3949AB",
        c2:      "#7C3AED",
        c3:      "#5C6BC0",
        neutral: "#9FA8DA",
        aurora: [
          { r:  57, g:  73, b: 171 },
          { r: 109, g:  40, b: 217 },
          { r:  92, g: 107, b: 192 },
        ],
        lineC:  [ 57,  73, 171],
        lineN:  [ 92, 107, 192],
        mouseL: [109,  40, 217],
        auroraAlpha: [0.10, 0.05],
      };
    }
  }

  // ── Partículas ───────────────────────────────────────────
  function mkDot(pal) {
    const rnd = Math.random();
    const color = rnd < 0.65 ? pal.neutral
                : rnd < 0.82 ? pal.c1
                : rnd < 0.94 ? pal.c2
                :               pal.c3;
    const spd = Math.random() * 0.28 + 0.08;
    const ang = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r:  Math.random() * 1.6 + 0.6,
      color,
      alpha: Math.random() * 0.35 + 0.45,
    };
  }

  let palette = getPalette();
  let dots    = Array.from({ length: COUNT }, () => mkDot(palette));

  // Aurora cache — invalida quando tema muda
  const _auroraCache = [0,1,2].map(() => ({
    grad: null, lastX: -9999, lastY: -9999, lastR: -1,
  }));

  function invalidateCache() {
    _auroraCache.forEach(c => { c.grad = null; c.lastX = -9999; });
  }

  // Detecta mudança de tema e recria paleta + dots
  new MutationObserver(() => {
    palette = getPalette();
    dots    = Array.from({ length: COUNT }, () => mkDot(palette));
    invalidateCache();
  }).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"],
  });

  // ── Aurora blobs ─────────────────────────────────────────
  const AURORA_DEFS = [
    { phaseX: 0.00, phaseY: 1.10, speedX: 0.00028, speedY: 0.00022, baseXR: 0.20, baseYR: 0.30, radR: 0.28 },
    { phaseX: 2.09, phaseY: 3.35, speedX: 0.00019, speedY: 0.00031, baseXR: 0.75, baseYR: 0.60, radR: 0.25 },
    { phaseX: 4.19, phaseY: 0.85, speedX: 0.00023, speedY: 0.00018, baseXR: 0.50, baseYR: 0.80, radR: 0.22 },
  ];

  function drawAurora(ts) {
    const pal = palette;
    for (let i = 0; i < AURORA_DEFS.length; i++) {
      const def = AURORA_DEFS[i];
      const c   = _auroraCache[i];
      const b   = pal.aurora[i];
      const amp = Math.min(W, H) * 0.12;

      const cx = def.baseXR * W + Math.sin(ts * def.speedX + def.phaseX) * amp;
      const cy = def.baseYR * H + Math.sin(ts * def.speedY + def.phaseY) * amp;
      const r  = Math.min(W, H) * def.radR;

      if (Math.abs(cx - c.lastX) > 1 || Math.abs(cy - c.lastY) > 1 || Math.abs(r - c.lastR) > 1) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0,   `rgba(${b.r},${b.g},${b.b},${pal.auroraAlpha[0]})`);
        g.addColorStop(0.5, `rgba(${b.r},${b.g},${b.b},${pal.auroraAlpha[1]})`);
        g.addColorStop(1,   `rgba(${b.r},${b.g},${b.b},0)`);
        c.grad = g; c.lastX = cx; c.lastY = cy; c.lastR = r;
      }

      ctx.fillStyle = c.grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const maxD2   = MAX_DIST * MAX_DIST;
  const mouseD2 = MOUSE_D  * MOUSE_D;

  function d2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  let last = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - last < 16.6) return;
    last = ts;

    const pal = palette;

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    drawAurora(ts);

    // Mover
    dots.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) { p.x = 0; p.vx *= -1; }
      if (p.x > W) { p.x = W; p.vx *= -1; }
      if (p.y < 0) { p.y = 0; p.vy *= -1; }
      if (p.y > H) { p.y = H; p.vy *= -1; }
    });

    // Linhas entre partículas
    const [lCr, lCg, lCb] = pal.lineC;
    const [lNr, lNg, lNb] = pal.lineN;
    ctx.lineWidth = 0.55;
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      for (let j = i + 1; j < dots.length; j++) {
        const b  = dots[j];
        const dd = d2(a.x, a.y, b.x, b.y);
        if (dd > maxD2) continue;
        const t  = 1 - dd / maxD2;
        const colored = a.color !== pal.neutral || b.color !== pal.neutral;
        ctx.strokeStyle = colored
          ? `rgba(${lCr},${lCg},${lCb},${t * t * 0.45})`
          : `rgba(${lNr},${lNg},${lNb},${t * t * 0.28})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Linhas para cursor
    const [mLr, mLg, mLb] = pal.mouseL;
    ctx.lineWidth = 0.9;
    dots.forEach((p) => {
      const dd = d2(p.x, p.y, mouse.x, mouse.y);
      if (dd > mouseD2) return;
      const t = 1 - dd / mouseD2;
      ctx.strokeStyle = `rgba(${mLr},${mLg},${mLb},${t * t * 0.65})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.stroke();
    });

    // Partículas neutras
    ctx.fillStyle = pal.neutral;
    dots.forEach((p) => {
      if (p.color !== pal.neutral) return;
      const near = d2(p.x, p.y, mouse.x, mouse.y) < mouseD2;
      ctx.globalAlpha = near ? Math.min(p.alpha + 0.3, 0.95) : p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Partículas coloridas com glow
    dots.forEach((p) => {
      if (p.color === pal.neutral) return;
      const near = d2(p.x, p.y, mouse.x, mouse.y) < mouseD2;
      const r    = near ? p.r * 1.4 : p.r;
      ctx.fillStyle   = p.color;
      ctx.globalAlpha = (near ? Math.min(p.alpha + 0.35, 1) : p.alpha) * 0.18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = near ? Math.min(p.alpha + 0.35, 1) : p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(frame);
})();
