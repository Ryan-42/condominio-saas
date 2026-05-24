import { state, SECTIONS_META, _PREFERS_NO_MOTION } from "../core/state.js";
import { getToken, getUsuario, fetchAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { pad } from "../ui/utils.js";
import { exibirToast } from "../ui/notifications.js";
import { _ONBOARDING_KEY } from "./onboarding.js";

// ── Clock / Uptime / Status ───────────────────────────────────

export function initClock() {
  const tick = () => {
    const now = new Date();
    document.getElementById("clock").textContent =
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    document.getElementById("data-sidebar").textContent = now.toLocaleDateString("pt-BR");
  };
  tick();
  if (state._clockInterval) clearInterval(state._clockInterval);
  state._clockInterval = setInterval(tick, 1000);
}

export function initUptime() {
  const start = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - start) / 1000);
    document.getElementById("uptime").textContent =
      `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  tick();
  if (state._uptimeInterval) clearInterval(state._uptimeInterval);
  state._uptimeInterval = setInterval(tick, 1000);
}

export function setStatus(ok) {
  document.getElementById("sys-dot").className  = `sys-dot ${ok ? "ok" : "erro"}`;
  document.getElementById("sys-text").className = `sys-text ${ok ? "ok" : "erro"}`;
  document.getElementById("sys-text").textContent = ok ? "SISTEMA ONLINE" : "FALHA NA API";
}

// ── Condomínio Selector ───────────────────────────────────────

export async function carregarCondominios() {
  const select  = document.getElementById("select-condominio");
  const usuario = getUsuario();
  try {
    const condominios = await fetchAPI("/condominios");
    if (!condominios || !condominios.length) {
      select.innerHTML = `<option value="">SEM CONDOMÍNIOS</option>`;
      return;
    }
    const lista = usuario.tipo === "SINDICO"
      ? condominios.filter((c) => c.id === usuario.condominio_id)
      : condominios;

    if (!lista.length && usuario.tipo === "SINDICO") {
      select.innerHTML = `<option value="">SEM CONDOMÍNIO VINCULADO</option>`;
      state.CONDOMINIO_ID = null;
      setStatus(false);
      const main = document.querySelector(".main-content") || document.querySelector("main");
      if (main) main.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;text-align:center">
          <div style="font-size:48px;opacity:.3">⬡</div>
          <div style="color:var(--p2);font-size:18px;font-weight:700;letter-spacing:2px">SEM CONDOMÍNIO VINCULADO</div>
          <div style="color:var(--text-dim);font-size:13px;max-width:360px">Sua conta ainda não está vinculada a nenhum condomínio. Peça ao administrador para vincular seu usuário.</div>
        </div>`;
      return;
    }

    select.innerHTML = lista.map((c) =>
      `<option value="${c.id}">${escHTML(c.nome).toUpperCase()}</option>`
    ).join("");

    state.CONDOMINIO_ID = parseInt(select.value);
    atualizarSidebarNode();
    await recarregarSecaoAtiva();
    setStatus(true);
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option value="">ERRO AO CARREGAR</option>`;
    setStatus(false);
  }
}

export async function onCondominioChange() {
  const select = document.getElementById("select-condominio");
  state.CONDOMINIO_ID = parseInt(select.value);
  state._dadosIA     = null;
  state._iaHistorico = [];
  atualizarSidebarNode();
  await recarregarSecaoAtiva();
  window.atualizarOnboarding?.();
}

export function navegarPara(secao) { navigateTo(secao); }

export function atualizarSidebarNode() {
  document.getElementById("condo-id-label").textContent = pad(state.CONDOMINIO_ID);
}

export async function recarregarSecaoAtiva() {
  const s = state.secaoAtiva;
  const cid = state.CONDOMINIO_ID;
  const loaders = {
    dashboard:     () => cid && window.carregarDashboard?.(),
    despesas:      () => cid && window.carregarDespesas?.(),
    receitas:      () => cid && window.carregarReceitas?.(),
    moradores:     () => cid && window.carregarMoradores?.(),
    inadimplencia: () => cid && window.carregarInadimplencia?.(),
    ia:            () => cid && window.carregarIA?.(),
    avisos:        () => cid && window.carregarAvisos?.(),
    reclamacoes:   () => cid && window.carregarReclacoesAdmin?.(),
    espacos:       () => cid && window.carregarEspacosAdmin?.(),
    votacoes:      () => cid && window.carregarVotacoesAdmin?.(),
    documentos:    () => cid && window.carregarDocumentosAdmin?.(),
    manutencoes:   () => cid && window.carregarManutencoesAdmin?.(),
    mensagens:     () => cid && window.carregarConversasAdmin?.(),
    gestao:        async () => { await window.carregarGestao?.(); await window.carregarUsuarios?.(); },
  };
  if (loaders[s]) await loaders[s]();
}

// ── SPA Navigation ────────────────────────────────────────────

export function navigateTo(section) {
  if (section !== "mensagens" && state._adminChatPolling) {
    clearInterval(state._adminChatPolling);
    state._adminChatPolling = null;
  }
  state.secaoAtiva = section;
  Object.keys(SECTIONS_META).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const target = document.getElementById(section);
  if (target) {
    target.style.display   = "block";
    target.style.animation = "none";
    void target.offsetWidth;
    target.style.animation = "";
  }
  document.querySelectorAll(".nav-item").forEach((el) => {
    const isActive = el.dataset.section === section;
    el.classList.toggle("active", isActive);
    isActive ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current");
  });
  document.getElementById("page-eyebrow").textContent = SECTIONS_META[section].eyebrow;
  document.getElementById("page-title").textContent   = SECTIONS_META[section].title;
  recarregarSecaoAtiva();
}

export function bindNavItems() {
  document.querySelectorAll(".nav-item[data-section]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(el.dataset.section);
      closeSidebar();
    });
  });
}

export function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const btn     = document.getElementById("btn-hamburger");
  const isOpen  = sidebar.classList.contains("open");
  sidebar.classList.toggle("open", !isOpen);
  overlay.classList.toggle("visible", !isOpen);
  btn.classList.toggle("open", !isOpen);
  btn.setAttribute("aria-expanded", String(!isOpen));
}

export function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const btn     = document.getElementById("btn-hamburger");
  sidebar.classList.remove("open");
  overlay.classList.remove("visible");
  btn.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
}

export function toggleForm(bodyId, labelId, closedText) {
  const body  = document.getElementById(bodyId);
  const label = document.getElementById(labelId);
  const open  = body.classList.toggle("open");
  const defaultClosed = closedText || label.dataset.closedText || "+ NOVO REGISTRO";
  if (!label.dataset.closedText && closedText) label.dataset.closedText = closedText;
  label.textContent = open ? "✕ FECHAR" : defaultClosed;
  if (!open) {
    window._sairModoEdicaoDesp?.();
    window._sairModoEdicaoRec?.();
    window._sairModoEdicaoMor?.();
  }
}
