import { getToken, getUsuario, fetchAPI } from "../core/api.js";
import { exibirToast } from "../ui/notifications.js";

export function exibirUsuarioLogado() {
  const usuario = getUsuario();
  if (!usuario) return;
  const el = document.getElementById("usuario-info");
  if (el) {
    const nome = String(usuario.nome).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const tipo = String(usuario.tipo).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    el.innerHTML = `
      <span class="usuario-nome">${nome.toUpperCase()}</span>
      <span class="usuario-tipo tipo-${tipo.toLowerCase()}">${tipo}</span>
    `;
  }
}

export async function carregarBillingInfo() {
  const usuario = getUsuario();
  if (!usuario || usuario.tipo !== "SINDICO") return;
  const badge = document.getElementById("billing-badge");
  if (badge) badge.style.display = "";
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/billing/plano`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const d = await res.json();

    const nomeEl  = document.getElementById("billing-plano-nome");
    const trialEl = document.getElementById("billing-trial-info");
    const upgBtn  = document.getElementById("billing-upgrade-btn");
    const barWrap = document.getElementById("billing-limit-bar");
    const countEl = document.getElementById("billing-moradores-count");
    const fillEl  = document.getElementById("billing-limit-fill");

    if (nomeEl) {
      const labels = { FREE: "FREE", PRO: "PRO ✦", ENTERPRISE: "ENTERPRISE" };
      nomeEl.textContent = labels[d.plano] || d.plano;
      nomeEl.style.color = d.plano === "PRO" ? "var(--p2)" : d.plano === "ENTERPRISE" ? "var(--p3)" : "var(--text-dim)";
    }

    if (trialEl) {
      if (d.trial_ativo && d.trial_ends_at) {
        const ends = new Date(d.trial_ends_at);
        const dias = Math.max(0, Math.ceil((ends - Date.now()) / 86400000));
        trialEl.textContent = `TRIAL PRO · ${dias}d restante${dias !== 1 ? "s" : ""}`;
        trialEl.style.color = dias <= 3 ? "var(--red, #f87171)" : "var(--p3, #06B6D4)";
      } else {
        trialEl.textContent = "";
      }
    }

    if (upgBtn) {
      upgBtn.style.display = d.plano === "FREE" && !d.trial_ativo ? "" : "none";
    }

    if (d.max_moradores > 0) {
      const total = d.total_moradores ?? 0;
      const max   = d.max_moradores;
      const pct   = Math.min(100, Math.round((total / max) * 100));
      if (barWrap) barWrap.style.display = "";
      if (countEl) countEl.textContent = `${total}/${max}`;
      if (fillEl) {
        fillEl.style.width = `${pct}%`;
        fillEl.style.background = pct >= 90 ? "var(--red, #f87171)" : pct >= 70 ? "#f59e0b" : "var(--p2)";
      }
    }
  } catch {}
}

export async function _verificarRetornoStripe() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("upgrade")) return;
  history.replaceState(null, "", window.location.pathname);
  if (params.get("upgrade") === "cancel") {
    exibirToast("Upgrade cancelado.", "erro");
    return;
  }
  exibirToast("⏳ Confirmando assinatura PRO…", "ok");
  const token = getToken();
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`${API_BASE}/billing/plano`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.plano === "PRO" || d.plano === "ENTERPRISE") {
        await carregarBillingInfo();
        exibirToast("✦ Bem-vindo ao CONDO//SYS PRO!");
        return;
      }
    } catch {}
  }
  exibirToast("Assinatura recebida! Atualize a página em alguns instantes.");
}

export async function iniciarUpgrade() {
  exibirToast("⏳ Abrindo checkout…", "ok");
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/billing/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 503) {
      exibirToast("✖ Pagamentos ainda não configurados. Aguarde.", "erro");
      return;
    }
    if (!res.ok) {
      exibirToast("✖ Erro ao iniciar checkout.", "erro");
      return;
    }
    const { url } = await res.json();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    exibirToast("✖ Não foi possível conectar ao servidor de pagamentos.", "erro");
  }
}
