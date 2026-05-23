// ════════════════════════════════════════════════════════════
//  space.js — Aurora blobs + rede de partículas  |  Indigo/Purple
// ════════════════════════════════════════════════════════════

(function () {
  const canvas = document.getElementById("space-canvas");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d", { alpha: false });

  // ── Paleta ───────────────────────────────────────────────
  const PURPLE = "#6C63FF";
  const VIOLET = "#9C8FFF";
  const LAVEND = "#CE93D8";
  const WHITE  = "#E8E6FF";
  const BG     = "#08091A";

  // ── Config ───────────────────────────────────────────────
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

  // ── Aurora blobs ─────────────────────────────────────────
  // 3 blobs grandes com cores indigo/violet/purple
  const AURORA_BLOBS = [
    { colorR: 108, colorG:  99, colorB: 255, phaseX: 0.00, phaseY: 1.10, speedX: 0.00028, speedY: 0.00022, baseXRatio: 0.20, baseYRatio: 0.30, radiusRatio: 0.28 },
    { colorR:  92, colorG: 107, colorB: 192, phaseX: 2.09, phaseY: 3.35, speedX: 0.00019, speedY: 0.00031, baseXRatio: 0.75, baseYRatio: 0.60, radiusRatio: 0.25 },
    { colorR:  57, colorG:  73, colorB: 171, phaseX: 4.19, phaseY: 0.85, speedX: 0.00023, speedY: 0.00018, baseXRatio: 0.50, baseYRatio: 0.80, radiusRatio: 0.22 },
  ];

  const _auroraCache = AURORA_BLOBS.map(() => ({
    grad: null, lastX: -9999, lastY: -9999, lastR: -1,
  }));

  function drawAurora(ts) {
    for (let i = 0; i < AURORA_BLOBS.length; i++) {
      const b   = AURORA_BLOBS[i];
      const c   = _auroraCache[i];
      const amp = Math.min(W, H) * 0.12;

      const cx = b.baseXRatio * W + Math.sin(ts * b.speedX + b.phaseX) * amp;
      const cy = b.baseYRatio * H + Math.sin(ts * b.speedY + b.phaseY) * amp;
      const r  = Math.min(W, H) * b.radiusRatio;

      if (
        Math.abs(cx - c.lastX) > 1 ||
        Math.abs(cy - c.lastY) > 1 ||
        Math.abs(r  - c.lastR) > 1
      ) {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0,   `rgba(${b.colorR},${b.colorG},${b.colorB},0.12)`);
        grad.addColorStop(0.5, `rgba(${b.colorR},${b.colorG},${b.colorB},0.06)`);
        grad.addColorStop(1,   `rgba(${b.colorR},${b.colorG},${b.colorB},0.00)`);
        c.grad  = grad;
        c.lastX = cx;
        c.lastY = cy;
        c.lastR = r;
      }

      ctx.fillStyle = c.grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Partículas ───────────────────────────────────────────
  function mkDot() {
    const rnd = Math.random();
    const color = rnd < 0.70 ? WHITE
                : rnd < 0.87 ? PURPLE
                : rnd < 0.96 ? VIOLET
                :              LAVEND;
    const spd = Math.random() * 0.28 + 0.08;
    const ang = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: Math.random() * 1.6 + 0.6,
      color,
      alpha: Math.random() * 0.35 + 0.45,
    };
  }

  const dots = Array.from({ length: COUNT }, mkDot);

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

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    drawAurora(ts);

    dots.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0)  { p.x = 0;  p.vx *= -1; }
      if (p.x > W)  { p.x = W;  p.vx *= -1; }
      if (p.y < 0)  { p.y = 0;  p.vy *= -1; }
      if (p.y > H)  { p.y = H;  p.vy *= -1; }
    });

    ctx.lineWidth = 0.55;
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      for (let j = i + 1; j < dots.length; j++) {
        const b  = dots[j];
        const dd = d2(a.x, a.y, b.x, b.y);
        if (dd > maxD2) continue;
        const t  = 1 - dd / maxD2;
        const isColored = a.color !== WHITE || b.color !== WHITE;
        ctx.strokeStyle = isColored
          ? `rgba(108,99,255,${t * t * 0.45})`
          : `rgba(156,143,255,${t * t * 0.28})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.lineWidth = 0.9;
    dots.forEach((p) => {
      const dd = d2(p.x, p.y, mouse.x, mouse.y);
      if (dd > mouseD2) return;
      const t  = 1 - dd / mouseD2;
      ctx.strokeStyle = `rgba(108,99,255,${t * t * 0.65})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.stroke();
    });

    ctx.fillStyle = WHITE;
    dots.forEach((p) => {
      if (p.color !== WHITE) return;
      const near = d2(p.x, p.y, mouse.x, mouse.y) < mouseD2;
      ctx.globalAlpha = near ? Math.min(p.alpha + 0.3, 0.95) : p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    dots.forEach((p) => {
      if (p.color === WHITE) return;
      const near = d2(p.x, p.y, mouse.x, mouse.y) < mouseD2;
      const r    = near ? p.r * 1.4 : p.r;
      ctx.fillStyle = p.color;
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
