// ════════════════════════════════════════════════════════════
//  space.js — Aurora blobs + rede de partículas  |  Emerald/Teal
// ════════════════════════════════════════════════════════════

(function () {
  const canvas = document.getElementById("space-canvas");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d", { alpha: false });

  // ── Paleta ───────────────────────────────────────────────
  const EMERALD = "#10B981";
  const TEAL    = "#06B6D4";
  const PALE    = "#6EE7B7";
  const WHITE   = "#e8f5f0";
  const BG      = "#030d0a";

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
  // 3 blobs grandes com cores emerald/teal/dark-emerald
  // Movem-se organicamente via Math.sin, opacidade muito baixa (decorativos)
  const AURORA_BLOBS = [
    { colorR: 16,  colorG: 185, colorB: 129, phaseX: 0.00, phaseY: 1.10, speedX: 0.00028, speedY: 0.00022, baseXRatio: 0.20, baseYRatio: 0.30, radiusRatio: 0.28 },
    { colorR:  6,  colorG: 182, colorB: 212, phaseX: 2.09, phaseY: 3.35, speedX: 0.00019, speedY: 0.00031, baseXRatio: 0.75, baseYRatio: 0.60, radiusRatio: 0.25 },
    { colorR:  6,  colorG:  95, colorB:  70, phaseX: 4.19, phaseY: 0.85, speedX: 0.00023, speedY: 0.00018, baseXRatio: 0.50, baseYRatio: 0.80, radiusRatio: 0.22 },
  ];

  // Cache dos gradientes: só recria quando posição muda mais que 1px
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

      // Recria o radialGradient apenas quando a posição mudou significativamente
      if (
        Math.abs(cx - c.lastX) > 1 ||
        Math.abs(cy - c.lastY) > 1 ||
        Math.abs(r  - c.lastR) > 1
      ) {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0,   `rgba(${b.colorR},${b.colorG},${b.colorB},0.10)`);
        grad.addColorStop(0.5, `rgba(${b.colorR},${b.colorG},${b.colorB},0.05)`);
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
                : rnd < 0.87 ? EMERALD
                : rnd < 0.96 ? TEAL
                :              PALE;
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

  // ── Utilitário ───────────────────────────────────────────
  const maxD2   = MAX_DIST * MAX_DIST;
  const mouseD2 = MOUSE_D  * MOUSE_D;

  function d2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  // ── Loop ─────────────────────────────────────────────────
  let last = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - last < 16.6) return;
    last = ts;

    // Fundo sólido
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // ── Camada aurora (atrás das partículas) ────────────
    drawAurora(ts);

    // Mover partículas
    dots.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0)  { p.x = 0;  p.vx *= -1; }
      if (p.x > W)  { p.x = W;  p.vx *= -1; }
      if (p.y < 0)  { p.y = 0;  p.vy *= -1; }
      if (p.y > H)  { p.y = H;  p.vy *= -1; }
    });

    // ── Linhas entre partículas ─────────────────────────
    ctx.lineWidth = 0.55;
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      for (let j = i + 1; j < dots.length; j++) {
        const b  = dots[j];
        const dd = d2(a.x, a.y, b.x, b.y);
        if (dd > maxD2) continue;
        const t  = 1 - dd / maxD2;
        // Linha herda cor da partícula mais brilhante (teal/emerald) ou fica neutra
        const isColored = a.color !== WHITE || b.color !== WHITE;
        ctx.strokeStyle = isColored
          ? `rgba(6,182,212,${(t * t * 0.45).toFixed(3)})`
          : `rgba(110,231,183,${(t * t * 0.28).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ── Linhas para o cursor ────────────────────────────
    ctx.lineWidth = 0.9;
    dots.forEach((p) => {
      const dd = d2(p.x, p.y, mouse.x, mouse.y);
      if (dd > mouseD2) return;
      const t  = 1 - dd / mouseD2;
      ctx.strokeStyle = `rgba(52,211,153,${(t * t * 0.65).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.stroke();
    });

    // ── Pontos brancos — batch sem glow ────────────────
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

    // ── Pontos coloridos — glow sutil ──────────────────
    ctx.shadowBlur = 10;
    dots.forEach((p) => {
      if (p.color === WHITE) return;
      const near = d2(p.x, p.y, mouse.x, mouse.y) < mouseD2;
      ctx.globalAlpha = near ? Math.min(p.alpha + 0.35, 1) : p.alpha;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, near ? p.r * 1.4 : p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(frame);
})();
