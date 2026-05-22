// ════════════════════════════════════════════════════════════
//  CONDO//SYS — script.js
//  Melhorias de UX:
//    - Validação por campo com mensagem inline
//    - Editar e deletar com confirmação
//    - Feedback visual em todas as ações
//    - Estado vazio amigável
//    - Modo de edição no formulário (PUT vs POST)
// ════════════════════════════════════════════════════════════

// ── 1. CONFIGURAÇÃO ──────────────────────────────────────────

const _PREFERS_NO_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Escapa HTML para prevenir XSS ao inserir dados do servidor via innerHTML
function escHTML(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// API_BASE definida em config.js
let   CONDOMINIO_ID = null;
let   secaoAtiva    = "dashboard";
let _clockInterval, _uptimeInterval;

// Estado de edição por módulo — null = modo criação, number = modo edição
let editandoDesp = null;
let editandoRec  = null;
let editandoMor  = null;

const SECTIONS_META = {
  dashboard:     { eyebrow: "// MÓDULO FINANCEIRO",       title: "PAINEL DE CONTROLE"       },
  despesas:      { eyebrow: "// GESTÃO FINANCEIRA",       title: "DESPESAS"                 },
  receitas:      { eyebrow: "// GESTÃO FINANCEIRA",       title: "RECEITAS"                 },
  moradores:     { eyebrow: "// GESTÃO DE PESSOAS",       title: "MORADORES"                },
  inadimplencia: { eyebrow: "// CONTROLE FINANCEIRO",     title: "INADIMPLÊNCIA"            },
  ia:            { eyebrow: "// INTELIGÊNCIA ARTIFICIAL", title: "CONDO//AI"                },
  avisos:        { eyebrow: "// COMUNICADOS",             title: "QUADRO DE AVISOS"         },
  reclamacoes:   { eyebrow: "// GESTÃO CONDOMINIAL",      title: "RECLAMAÇÕES"              },
  espacos:       { eyebrow: "// GESTÃO CONDOMINIAL",      title: "ESPAÇOS & RESERVAS"       },
  votacoes:      { eyebrow: "// GESTÃO CONDOMINIAL",      title: "VOTAÇÕES"                 },
  documentos:    { eyebrow: "// GESTÃO CONDOMINIAL",      title: "DOCUMENTOS"               },
  manutencoes:   { eyebrow: "// GESTÃO CONDOMINIAL",      title: "MANUTENÇÕES"              },
  mensagens:     { eyebrow: "// COMUNICAÇÃO",             title: "MENSAGENS"                },
  gestao:        { eyebrow: "// ADMINISTRAÇÃO",           title: "GESTÃO DE CONDOMÍNIOS"    },
};

// ── ONBOARDING ────────────────────────────────────────────────

const _ONBOARDING_KEY = "condo_onboarding_dispensado";

function dispensarOnboarding() {
  localStorage.setItem(_ONBOARDING_KEY, "1");
  const el = document.getElementById("onboarding-banner");
  if (el) el.style.display = "none";
  // Mostra o botão "GUIA INICIAL" na sidebar para o sindico reabrir depois
  const navGuia = document.getElementById("nav-guia");
  const u = getUsuario();
  if (navGuia && u && u.tipo === "SINDICO") navGuia.style.display = "flex";
}

function reabrirOnboarding() {
  localStorage.removeItem(_ONBOARDING_KEY);
  const navGuia = document.getElementById("nav-guia");
  if (navGuia) navGuia.style.display = "none";
  atualizarOnboarding();
}

async function atualizarOnboarding() {
  if (localStorage.getItem(_ONBOARDING_KEY)) return;
  const u = getUsuario();
  if (!u || u.tipo === "ADMIN" || u.tipo === "MORADOR") return;
  if (!CONDOMINIO_ID) return;

  const banner  = document.getElementById("onboarding-banner");
  const barEl   = document.getElementById("onboarding-bar");
  const progEl  = document.getElementById("onboarding-prog");
  const stepsEl = document.getElementById("onboarding-steps");
  if (!banner) return;

  // Busca dados para avaliar cada passo
  const [mResp, pResp, aResp] = await Promise.allSettled([
    fetchAPI(`/moradores?limit=1`),
    fetchAPI(`/pagamentos/${CONDOMINIO_ID}?limit=1`),
    fetchAPI(`/avisos?condominio_id=${CONDOMINIO_ID}&limit=1`),
  ]);

  const temMoradores = mResp.status === "fulfilled" && Array.isArray(mResp.value) && mResp.value.length > 0;
  const temTaxa      = pResp.status === "fulfilled" && Array.isArray(pResp.value) && pResp.value.length > 0;
  const temAviso     = aResp.status === "fulfilled" && Array.isArray(aResp.value) && aResp.value.length > 0;

  const passos = [
    { label: "Conta criada",           done: true,         secao: null },
    { label: "Adicionar moradores",    done: temMoradores, secao: "moradores" },
    { label: "Configurar taxa mensal", done: temTaxa,      secao: "inadimplencia" },
    { label: "Publicar primeiro aviso",done: temAviso,     secao: "avisos" },
  ];

  const concluidos = passos.filter(p => p.done).length;
  if (concluidos === passos.length) { banner.style.display = "none"; return; }

  const pct = Math.round((concluidos / passos.length) * 100);
  barEl.style.width   = pct + "%";
  progEl.textContent  = `${concluidos} / ${passos.length} concluídos`;

  stepsEl.innerHTML = passos.map(p => {
    const cls = p.done ? "onboarding-step--done" : "onboarding-step--pendente";
    const ico = p.done ? "✓" : "◻";
    const onclick = p.secao && !p.done ? `onclick="navegarPara('${p.secao}')"` : "";
    return `<button class="onboarding-step ${cls}" ${onclick}>${ico} ${p.label}</button>`;
  }).join("");

  banner.style.display = "block";
}

// ── 2. AUTENTICAÇÃO ───────────────────────────────────────────

function getToken() {
  const token = sessionStorage.getItem("token");
  if (!token) { window.location.href = "login.html"; return null; }
  return token;
}

function getUsuario() {
  const raw = sessionStorage.getItem("usuario");
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  if (_clockInterval) clearInterval(_clockInterval);
  if (_uptimeInterval) clearInterval(_uptimeInterval);
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("usuario");
  window.location.href = "login.html";
}

function _tokenExpirado() {
  const token = sessionStorage.getItem("token");
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

function iniciarAvisoToken() {
  // Verifica expiração a cada minuto
  setInterval(() => {
    if (_tokenExpirado()) { logout(); return; }
    // Avisa 15min antes
    try {
      const payload = JSON.parse(atob(sessionStorage.getItem("token").split(".")[1]));
      const restante = payload.exp * 1000 - Date.now();
      if (restante < 15 * 60 * 1000) {
        exibirToast("⚠ Sua sessão expira em menos de 15 minutos.", "erro");
      }
    } catch {}
  }, 60 * 1000);
}

function exibirUsuarioLogado() {
  const usuario = getUsuario();
  if (!usuario) return;
  const el = document.getElementById("usuario-info");
  if (el) {
    el.innerHTML = `
      <span class="usuario-nome">${escHTML(usuario.nome).toUpperCase()}</span>
      <span class="usuario-tipo tipo-${escHTML(usuario.tipo.toLowerCase())}">${escHTML(usuario.tipo)}</span>
    `;
  }
}

// ── 3. HTTP ───────────────────────────────────────────────────

async function fetchAPI(endpoint, { timeout = 15000 } = {}) {
  const token = getToken();
  if (!token) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status === 401) { logout(); return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${res.status} em ${endpoint}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Tempo limite excedido. Verifique a conexão.");
    throw err;
  }
}

async function postAPI(endpoint, body) {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  if (res.status === 401) { logout(); return; }
  if (res.status === 403) throw new Error("Acesso negado");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Erro ${res.status}`);
  }
  return res.json();
}

async function putAPI(endpoint, body) {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  "PUT",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  if (res.status === 401) { logout(); return; }
  if (res.status === 403) throw new Error("Acesso negado");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Erro ${res.status}`);
  }
  return res.json();
}

async function deleteAPI(endpoint) {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  "DELETE",
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (res.status === 401) { logout(); return; }
  if (res.status === 403) throw new Error("Acesso negado");
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}

// ── 4. VALIDAÇÃO ──────────────────────────────────────────────

/**
 * Valida um campo e exibe mensagem de erro inline abaixo do input.
 * Retorna true se válido, false se inválido.
 */
function validarCampo(id, regra, mensagem) {
  const el    = document.getElementById(id);
  const erro  = document.getElementById(`${id}-erro`);
  const valor = el ? el.value.trim() : "";

  const valido = regra(valor, el);

  if (erro) {
    erro.textContent = valido ? "" : mensagem;
    erro.style.display = valido ? "none" : "block";
  }
  if (el) el.classList.toggle("field-input--erro", !valido);

  return valido;
}

function limparErros(...ids) {
  ids.forEach((id) => {
    const erro = document.getElementById(`${id}-erro`);
    const el   = document.getElementById(id);
    if (erro) { erro.textContent = ""; erro.style.display = "none"; }
    if (el)   el.classList.remove("field-input--erro");
  });
}

// Regras reutilizáveis
const REGRAS = {
  naoVazio:    (v) => v.length > 0,
  valorPositivo: (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
  dataValida:  (v) => v.length > 0 && !isNaN(new Date(v).getTime()),
  email:       (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
};

// ── 5. UTILITÁRIOS ───────────────────────────────────────────

const formatarMoeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatarData = (s) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

const dataHoje = () => new Date().toISOString().split("T")[0];
const pad = (n) => String(n).padStart(2, "0");

function limparFormulario(...ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = el.type === "date" ? dataHoje() : "";
    el.classList.remove("field-input--erro");
  });
}

/**
 * Exibe toast de feedback global (canto da tela).
 */
function exibirToast(mensagem, tipo = "ok") {
  let toast = document.getElementById("toast-global");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-global";
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.className   = `toast toast--${tipo} toast--visivel`;
  clearTimeout(toast._timer);
  // Erros ficam 8s visíveis; sucessos 3.5s
  const duracao = tipo === "erro" ? 8000 : 3500;
  toast._timer = setTimeout(() => toast.classList.remove("toast--visivel"), duracao);
}

function exibirFeedback(feedbackId, mensagem, tipo = "ok") {
  const el = document.getElementById(feedbackId);
  if (!el) return;
  el.textContent = mensagem;
  el.className   = `form-feedback ${tipo}`;
  const duracao = tipo === "erro" ? 8000 : 4000;
  setTimeout(() => { el.textContent = ""; el.className = "form-feedback"; }, duracao);
}

function setBtnLoading(btnId, labelId, loading, textoNormal = "▶ EXECUTAR") {
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = loading;
  const lbl = document.getElementById(labelId);
  if (lbl) lbl.textContent = loading ? "⏳ SALVANDO…" : textoNormal;
}

/**
 * Confirmação de exclusão com confirm() nativo.
 */
function confirmarExclusao(descricao) {
  return confirm(`Tem certeza que deseja excluir "${descricao}"?\n\nEssa ação não pode ser desfeita.`);
}

/**
 * Filtra linhas visíveis de uma tabela pelo texto digitado.
 * Oculta linhas cujas células não contenham o termo buscado.
 */
function filtrarTabela(tbodyId, query) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const termo = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    if (tr.querySelector(".empty-state")) return;
    const texto = tr.textContent.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    tr.style.display = !termo || texto.includes(termo) ? "" : "none";
  });
}

function renderRows(tbodyId, rows, colspan = 3, mensagem = "Nenhum registro encontrado.", dica = "Comece adicionando um novo registro acima.") {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="empty-state">
          <div class="empty-state-icon">⬡</div>
          <div>${mensagem}</div>
          <div class="empty-state-hint">${dica}</div>
        </td>
      </tr>`;
    return;
  }
  tbody.innerHTML = rows.map((html, i) => {
    const anim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${i * 0.04}s`;
    return `<tr style="${anim}">${html}</tr>`;
  }).join("");
}

function renderBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".mensal-bar-fill").forEach((bar) => {
      setTimeout(() => { bar.style.width = `${bar.dataset.pct}%`; }, 100);
    });
  });
}

function animateValue(el, target) {
  const steps = 40;
  const inc   = target / steps;
  let cur = 0, step = 0;
  const timer = setInterval(() => {
    step++; cur += inc;
    if (step >= steps) { clearInterval(timer); cur = target; }
    el.textContent = formatarMoeda(cur);
  }, 900 / steps);
}

// ── 6. RELÓGIO / UPTIME / STATUS ─────────────────────────────

function initClock() {
  const tick = () => {
    const now = new Date();
    document.getElementById("clock").textContent =
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    document.getElementById("data-sidebar").textContent =
      now.toLocaleDateString("pt-BR");
  };
  tick();
  if (_clockInterval) clearInterval(_clockInterval);
  _clockInterval = setInterval(tick, 1000);
}

function initUptime() {
  const start = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - start) / 1000);
    document.getElementById("uptime").textContent =
      `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  tick();
  if (_uptimeInterval) clearInterval(_uptimeInterval);
  _uptimeInterval = setInterval(tick, 1000);
}

function setStatus(ok) {
  document.getElementById("sys-dot").className  = `sys-dot ${ok ? "ok" : "erro"}`;
  document.getElementById("sys-text").className = `sys-text ${ok ? "ok" : "erro"}`;
  document.getElementById("sys-text").textContent = ok ? "SISTEMA ONLINE" : "FALHA NA API";
}

// ── 7. SELETOR DE CONDOMÍNIO ─────────────────────────────────

async function carregarCondominios() {
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
      CONDOMINIO_ID = null;
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

    CONDOMINIO_ID = parseInt(select.value);
    atualizarSidebarNode();
    await recarregarSecaoAtiva();
    setStatus(true);
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option value="">ERRO AO CARREGAR</option>`;
    setStatus(false);
  }
}

async function onCondominioChange() {
  const select = document.getElementById("select-condominio");
  CONDOMINIO_ID = parseInt(select.value);
  _dadosIA = null;
  _iaHistorico = [];
  atualizarSidebarNode();
  await recarregarSecaoAtiva();
  atualizarOnboarding();
}

function navegarPara(secao) {
  navigateTo(secao);
}

function atualizarSidebarNode() {
  document.getElementById("condo-id-label").textContent = pad(CONDOMINIO_ID);
}

async function recarregarSecaoAtiva() {
  const loaders = {
    dashboard:     () => CONDOMINIO_ID && carregarDashboard(),
    despesas:      () => CONDOMINIO_ID && carregarDespesas(),
    receitas:      () => CONDOMINIO_ID && carregarReceitas(),
    moradores:     () => CONDOMINIO_ID && carregarMoradores(),
    inadimplencia: () => CONDOMINIO_ID && carregarInadimplencia(),
    ia:            () => CONDOMINIO_ID && carregarIA(),
    avisos:        () => CONDOMINIO_ID && carregarAvisos(),
    reclamacoes:   () => CONDOMINIO_ID && carregarReclacoesAdmin(),
    espacos:       () => CONDOMINIO_ID && carregarEspacosAdmin(),
    votacoes:      () => CONDOMINIO_ID && carregarVotacoesAdmin(),
    documentos:    () => CONDOMINIO_ID && carregarDocumentosAdmin(),
    manutencoes:   () => CONDOMINIO_ID && carregarManutencoesAdmin(),
    mensagens:     () => CONDOMINIO_ID && carregarConversasAdmin(),
    gestao:        async () => { await carregarGestao(); await carregarUsuarios(); },
  };
  if (loaders[secaoAtiva]) await loaders[secaoAtiva]();
}

// ── 8. NAVEGAÇÃO SPA ─────────────────────────────────────────

function navigateTo(section) {
  if (section !== "mensagens" && typeof _adminChatPolling !== "undefined" && _adminChatPolling) {
    clearInterval(_adminChatPolling);
    _adminChatPolling = null;
  }
  secaoAtiva = section;
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

document.querySelectorAll(".nav-item[data-section]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(el.dataset.section);
    closeSidebar();
  });
});

function toggleSidebar() {
  const sidebar  = document.getElementById("sidebar");
  const overlay  = document.getElementById("sidebar-overlay");
  const btn      = document.getElementById("btn-hamburger");
  const isOpen   = sidebar.classList.contains("open");
  sidebar.classList.toggle("open", !isOpen);
  overlay.classList.toggle("visible", !isOpen);
  btn.classList.toggle("open", !isOpen);
  btn.setAttribute("aria-expanded", String(!isOpen));
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const btn     = document.getElementById("btn-hamburger");
  sidebar.classList.remove("open");
  overlay.classList.remove("visible");
  btn.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
}

function toggleForm(bodyId, labelId) {
  const body  = document.getElementById(bodyId);
  const label = document.getElementById(labelId);
  const open  = body.classList.toggle("open");
  label.textContent = open ? "✕ FECHAR" : "+ NOVO REGISTRO";
  if (!open) {
    _sairModoEdicaoDesp();
    _sairModoEdicaoRec();
    _sairModoEdicaoMor();
  }
}

// ── 9. DASHBOARD ─────────────────────────────────────────────

async function carregarBalanco() {
  if (!CONDOMINIO_ID) return;
  try {
    const data = await fetchAPI(`/financeiro/${CONDOMINIO_ID}`);
    if (!data) return;
    animateValue(document.getElementById("total-receitas"), data.total_receitas);
    animateValue(document.getElementById("total-despesas"), data.total_despesas);
    const saldoEl = document.getElementById("saldo");
    saldoEl.classList.remove("negativo");
    animateValue(saldoEl, Math.abs(data.saldo));
    if (data.saldo < 0) saldoEl.classList.add("negativo");
  } catch (err) { console.error("carregarBalanco:", err); }
}

async function carregarDashboardDespesas() {
  if (!CONDOMINIO_ID) return;
  const todas = await fetchAPI("/despesas");
  if (!todas) return;
  const _u = getUsuario();
  const despesas = (_u && _u.tipo === "ADMIN")
    ? todas.filter((d) => d.condominio_id === CONDOMINIO_ID)
    : todas;
  document.getElementById("dash-despesas-count").textContent = `${pad(despesas.length)} ENTRADAS`;
  despesas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  renderRows("dash-tabela-despesas", despesas.slice(0, 8).map((d) =>
    `<td>${escHTML(d.descricao)}</td><td class="td-data">${formatarData(d.data)}</td><td class="td-valor">${formatarMoeda(d.valor)}</td>`
  ), 3, "Nenhuma despesa registrada.", "Adicione despesas na seção Despesas.");
}

async function carregarResumoMensal() {
  const data  = await fetchAPI(`/despesas/mensal/resumo/${CONDOMINIO_ID}`);
  if (!data) return;
  const meses = Object.keys(data);
  const container = document.getElementById("resumo-mensal");
  if (!meses.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px 0"><div class="empty-state-icon">⬡</div><div>Nenhuma despesa registrada ainda.</div><div class="empty-state-hint">O gráfico mensal aparecerá aqui após o primeiro registro.</div></div>`;
    return;
  }
  const maxValor = Math.max(...Object.values(data));
  container.innerHTML = meses.map((mes, i) => {
    const valor = data[mes];
    const pct   = maxValor > 0 ? (valor / maxValor) * 100 : 0;
    const [ano, m] = mes.split("-");
    const label = new Date(ano, m - 1)
      .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .toUpperCase();
    const mensalAnim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${i * 0.07}s`;
    return `
      <div class="mensal-item" style="${mensalAnim}">
        <div class="mensal-row">
          <span class="mensal-mes">${label}</span>
          <span class="mensal-valor">${formatarMoeda(valor)}</span>
        </div>
        <div class="mensal-bar-wrap">
          <div class="mensal-bar-fill" data-pct="${pct}"></div>
        </div>
      </div>`;
  }).join("");
  renderBars();
}

async function carregarInsights() {
  const loading = document.getElementById("insights-loading");
  const content = document.getElementById("insights-content");
  const badge   = document.getElementById("insights-badge");
  if (loading) loading.style.display = "block";
  if (content) content.style.display = "none";
  try {
    const data = await fetchAPI(`/insights/${CONDOMINIO_ID}`);
    if (!data) return;
    if (badge) badge.textContent = `GERADO EM ${data.gerado_em}`;
    renderAlertas(data.alertas);
    renderResumo(data.resumo);
    renderSugestoes(data.sugestoes);
    if (loading) loading.style.display = "none";
    if (content) content.style.display = "grid";
  } catch (err) {
    console.error(err);
    if (loading) loading.textContent = "⚠ ERRO AO CARREGAR INSIGHTS";
  }
}

const HANDLERS_ACAO = {
  ver_despesas:      () => navigateTo("despesas"),
  ver_receitas:      () => navigateTo("receitas"),
  exportar_relatorio: () => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE}/relatorio/${CONDOMINIO_ID}`, {
      headers: { "Authorization": `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        a.href    = url;
        a.download = `relatorio_condo_${CONDOMINIO_ID}_${dataHoje()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        exibirToast("✔ Relatório exportado com sucesso!");
      })
      .catch(() => exibirToast("✖ Erro ao exportar relatório", "erro"));
  },
  notificar_sindico: () => {
    console.log(`[NOTIFICAÇÃO] Síndico notificado — condomínio #${CONDOMINIO_ID}`);
    exibirToast("✉ Notificação enviada ao síndico (simulação)");
  },
};

function executarAcao(handler) {
  const fn = HANDLERS_ACAO[handler];
  if (fn) fn();
}

function renderBotoesAcao(acoes) {
  if (!acoes || !acoes.length) return "";
  return `
    <div class="insight-acoes">
      ${acoes.map((a) => `
        <button class="btn-acao btn-acao--${a.tipo}" onclick="executarAcao('${a.handler}')">
          ${a.label}
        </button>`).join("")}
    </div>`;
}

function renderAlertas(alertas) {
  const container = document.getElementById("insights-alertas");
  if (!container) return;
  if (!alertas.length) {
    container.innerHTML = `<span class="insights-vazio">✅ NENHUM ALERTA</span>`;
    return;
  }
  container.innerHTML = alertas.map((a, i) => `
    <div class="insight-item ${(a.nivel || "info")}" style="animation-delay:${i * 0.08}s">
      <div class="insight-body">
        <span class="insight-icone">${escHTML(a.icone || "•")}</span>
        <span>${escHTML(a.mensagem)}</span>
      </div>
      ${renderBotoesAcao(a.acoes)}
    </div>`
  ).join("");
}

function renderResumo(resumo) {
  const container = document.getElementById("insights-resumo");
  if (!container) return;
  if (!resumo.length) {
    container.innerHTML = `<span class="insights-vazio">SEM DADOS SUFICIENTES</span>`;
    return;
  }
  container.innerHTML = resumo.map((r, i) => `
    <div class="resumo-item" style="animation-delay:${i * 0.08}s">
      <span class="resumo-titulo">${escHTML(r.titulo).toUpperCase()}</span>
      <span class="resumo-valor">${escHTML(String(r.valor))}</span>
    </div>`
  ).join("");
}

function renderSugestoes(sugestoes) {
  const container = document.getElementById("insights-sugestoes");
  if (!container) return;
  if (!sugestoes.length) {
    container.innerHTML = `<span class="insights-vazio">SEM SUGESTÕES</span>`;
    return;
  }
  container.innerHTML = sugestoes.map((s, i) => `
    <div class="sugestao-item" style="animation-delay:${i * 0.08}s">${escHTML(s)}</div>`
  ).join("");
}

async function carregarDashboard() {
  try {
    await Promise.all([
      carregarBalanco(),
      carregarDashboardDespesas(),
      carregarResumoMensal(),
      carregarInsights(),
    ]);
    atualizarOnboarding();
  } catch (err) { console.error(err); }
}

// ── 10. DESPESAS ──────────────────────────────────────────────

async function carregarDespesas() {
  try {
    if (!CONDOMINIO_ID) return;
    const todas    = await fetchAPI("/despesas");
    if (!todas) return;
    const _u = getUsuario();
    const despesas = (_u && _u.tipo === "ADMIN")
      ? todas.filter((d) => d.condominio_id === CONDOMINIO_ID)
      : todas;
    document.getElementById("desp-count").textContent = `${pad(despesas.length)} ENTRADAS`;
    despesas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    const tbody = document.getElementById("tabela-despesas");
    if (!despesas.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">⬡</div><div>Nenhuma despesa registrada.</div><div class="empty-state-hint">Use o formulário acima para registrar a primeira despesa.</div></td></tr>`;
      return;
    }
    
    tbody.innerHTML = "";
    despesas.forEach((d, i) => {
      const tr = document.createElement("tr");
      if (!_PREFERS_NO_MOTION) {
        tr.style.opacity = "0";
        tr.style.animation = `fadeUp .3s ease forwards`;
        tr.style.animationDelay = `${i * 0.04}s`;
      }
      tr.innerHTML = `<td>${escHTML(d.descricao)}</td>
       <td class="td-data">${formatarData(d.data)}</td>
       <td class="td-valor">${formatarMoeda(d.valor)}</td>
       <td class="td-acoes">
         <button class="btn-linha btn-linha--editar" onclick="editarDespesa(${d.id})">✎ Editar</button>
       </td>`;
      const btnDeletar = document.createElement("button");
      btnDeletar.className = "btn-linha btn-linha--deletar";
      btnDeletar.textContent = "✕ Excluir";
      btnDeletar.dataset.id = d.id;
      btnDeletar.dataset.desc = d.descricao;
      btnDeletar.addEventListener("click", () => deletarDespesa(d.id, d.descricao, btnDeletar));
      tr.querySelector(".td-acoes").appendChild(btnDeletar);
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

function _validarDespesa() {
  const v1 = validarCampo("desp-descricao", REGRAS.naoVazio,       "Informe a descrição");
  const v2 = validarCampo("desp-valor",     REGRAS.valorPositivo,  "Informe um valor maior que zero");
  const v3 = validarCampo("desp-data",      REGRAS.dataValida,     "Informe uma data válida");
  return v1 && v2 && v3;
}

async function submitDespesa() {
  if (!CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  limparErros("desp-descricao", "desp-valor", "desp-data");
  if (!_validarDespesa()) return;

  const descricao = document.getElementById("desp-descricao").value.trim();
  const valor     = parseFloat(document.getElementById("desp-valor").value);
  const data      = document.getElementById("desp-data").value;

  setBtnLoading("desp-btn", "desp-btn-label", true);
  try {
    if (editandoDesp) {
      await putAPI(`/despesas/${editandoDesp}`, { descricao, valor, data, condominio_id: CONDOMINIO_ID });
      exibirToast("✔ Despesa atualizada com sucesso!");
      _sairModoEdicaoDesp();
    } else {
      await postAPI("/despesas", { descricao, valor, data, condominio_id: CONDOMINIO_ID });
      exibirToast("✔ Despesa registrada com sucesso!");
    }
    limparFormulario("desp-descricao", "desp-valor", "desp-data");
    await carregarDespesas();
    await carregarDashboard();
  } catch (err) {
    console.error(err);
    exibirToast(`✖ Erro ao salvar despesa: ${err.message}`, "erro");
  } finally {
    setBtnLoading("desp-btn", "desp-btn-label", false);
  }
}

function editarDespesa(id) {
  fetchAPI(`/despesas/${id}`).then((d) => {
    if (!d) return;
    editandoDesp = id;
    document.getElementById("desp-descricao").value = d.descricao;
    document.getElementById("desp-valor").value     = d.valor;
    document.getElementById("desp-data").value      = d.data || "";

    // Abre o form e sinaliza modo edição
    const body  = document.getElementById("desp-form-body");
    const label = document.getElementById("desp-toggle-label");
    body.classList.add("open");
    label.textContent = "✕ FECHAR";

    // Atualiza o botão para mostrar modo edição
    document.getElementById("desp-btn-label").textContent = "▶ SALVAR EDIÇÃO";
    document.getElementById("desp-feedback").textContent  = `✎ Editando despesa #${id}`;
    document.getElementById("desp-feedback").className    = "form-feedback ok";

    // Scroll suave até o form
    body.scrollIntoView({ behavior: "smooth", block: "start" });
  }).catch(() => exibirToast("✖ Erro ao carregar despesa", "erro"));
}

async function deletarDespesa(id, descricao, btn) {
  if (!confirmarExclusao(descricao)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/despesas/${id}`);
    exibirToast("✔ Despesa excluída com sucesso!");
    await carregarDespesas();
    await carregarDashboard();
  } catch (err) {
    exibirToast("✖ Erro ao excluir despesa", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

function _sairModoEdicaoDesp() {
  editandoDesp = null;
  document.getElementById("desp-btn-label").textContent = "▶ EXECUTAR";
  document.getElementById("desp-feedback").textContent  = "";
}

// ── 11. RECEITAS ──────────────────────────────────────────────

async function carregarReceitas() {
  try {
    if (!CONDOMINIO_ID) return;
    const todas    = await fetchAPI("/receitas");
    if (!todas) return;
    const _u = getUsuario();
    const receitas = (_u && _u.tipo === "ADMIN")
      ? todas.filter((r) => r.condominio_id === CONDOMINIO_ID)
      : todas;
    document.getElementById("rec-count").textContent = `${pad(receitas.length)} ENTRADAS`;
    receitas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    const tbody = document.getElementById("tabela-receitas");
    if (!receitas.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">⬡</div><div>Nenhuma receita registrada.</div><div class="empty-state-hint">Use o formulário acima para registrar a primeira receita.</div></td></tr>`;
      return;
    }
    
    tbody.innerHTML = "";
    receitas.forEach((r, i) => {
      const tr = document.createElement("tr");
      if (!_PREFERS_NO_MOTION) {
        tr.style.opacity = "0";
        tr.style.animation = `fadeUp .3s ease forwards`;
        tr.style.animationDelay = `${i * 0.04}s`;
      }
      tr.innerHTML = `<td>${escHTML(r.descricao)}</td>
       <td class="td-data">${formatarData(r.data)}</td>
       <td class="td-valor--green">${formatarMoeda(r.valor)}</td>
       <td class="td-acoes">
         <button class="btn-linha btn-linha--editar" onclick="editarReceita(${r.id})">✎ Editar</button>
       </td>`;
      const btnDeletar = document.createElement("button");
      btnDeletar.className = "btn-linha btn-linha--deletar";
      btnDeletar.textContent = "✕ Excluir";
      btnDeletar.dataset.id = r.id;
      btnDeletar.dataset.desc = r.descricao;
      btnDeletar.addEventListener("click", () => deletarReceita(r.id, r.descricao, btnDeletar));
      tr.querySelector(".td-acoes").appendChild(btnDeletar);
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

function _validarReceita() {
  const v1 = validarCampo("rec-descricao", REGRAS.naoVazio,      "Informe a descrição");
  const v2 = validarCampo("rec-valor",     REGRAS.valorPositivo, "Informe um valor maior que zero");
  const v3 = validarCampo("rec-data",      REGRAS.dataValida,    "Informe uma data válida");
  return v1 && v2 && v3;
}

async function submitReceita() {
  if (!CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  limparErros("rec-descricao", "rec-valor", "rec-data");
  if (!_validarReceita()) return;

  const descricao = document.getElementById("rec-descricao").value.trim();
  const valor     = parseFloat(document.getElementById("rec-valor").value);
  const data      = document.getElementById("rec-data").value;

  setBtnLoading("rec-btn", "rec-btn-label", true);
  try {
    if (editandoRec) {
      await putAPI(`/receitas/${editandoRec}`, { descricao, valor, data, condominio_id: CONDOMINIO_ID });
      exibirToast("✔ Receita atualizada com sucesso!");
      _sairModoEdicaoRec();
    } else {
      await postAPI("/receitas", { descricao, valor, data, condominio_id: CONDOMINIO_ID });
      exibirToast("✔ Receita registrada com sucesso!");
    }
    limparFormulario("rec-descricao", "rec-valor", "rec-data");
    await carregarReceitas();
    await carregarDashboard();
  } catch (err) {
    console.error(err);
    exibirToast(`✖ Erro ao salvar receita: ${err.message}`, "erro");
  } finally {
    setBtnLoading("rec-btn", "rec-btn-label", false);
  }
}

function editarReceita(id) {
  fetchAPI(`/receitas/${id}`).then((r) => {
    if (!r) return;
    editandoRec = id;
    document.getElementById("rec-descricao").value = r.descricao;
    document.getElementById("rec-valor").value     = r.valor;
    document.getElementById("rec-data").value      = r.data || "";

    const body  = document.getElementById("rec-form-body");
    const label = document.getElementById("rec-toggle-label");
    body.classList.add("open");
    label.textContent = "✕ FECHAR";

    document.getElementById("rec-btn-label").textContent = "▶ SALVAR EDIÇÃO";
    document.getElementById("rec-feedback").textContent  = `✎ Editando receita #${id}`;
    document.getElementById("rec-feedback").className    = "form-feedback ok";

    body.scrollIntoView({ behavior: "smooth", block: "start" });
  }).catch(() => exibirToast("✖ Erro ao carregar receita", "erro"));
}

async function deletarReceita(id, descricao, btn) {
  if (!confirmarExclusao(descricao)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/receitas/${id}`);
    exibirToast("✔ Receita excluída com sucesso!");
    await carregarReceitas();
    await carregarDashboard();
  } catch (err) {
    exibirToast("✖ Erro ao excluir receita", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

function _sairModoEdicaoRec() {
  editandoRec = null;
  document.getElementById("rec-btn-label").textContent = "▶ EXECUTAR";
  document.getElementById("rec-feedback").textContent  = "";
}

// ── 12. MORADORES ─────────────────────────────────────────────

async function carregarMoradores() {
  try {
    const todos     = await fetchAPI("/moradores");
    if (!todos) return;
    const usuario = getUsuario();
    const moradores = (usuario.tipo === "ADMIN" && CONDOMINIO_ID)
      ? todos.filter((m) => m.condominio_id === CONDOMINIO_ID)
      : todos;
    document.getElementById("mor-count").textContent = `${pad(moradores.length)} CADASTRADOS`;
    
    const tbody = document.getElementById("tabela-moradores");
    if (!moradores.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-state-icon">⬡</div><div>Nenhum registro encontrado.</div><div class="empty-state-hint">Comece adicionando um novo registro acima.</div></td></tr>`;
      return;
    }
    
    tbody.innerHTML = "";
    moradores.forEach((m, i) => {
      const tr = document.createElement("tr");
      if (!_PREFERS_NO_MOTION) {
        tr.style.opacity = "0";
        tr.style.animation = `fadeUp .3s ease forwards`;
        tr.style.animationDelay = `${i * 0.04}s`;
      }
      tr.innerHTML = `<td>${escHTML(m.nome)}</td>
       <td class="td-apt">${escHTML(m.apartamento) || "—"}</td>
       <td class="td-email">${escHTML(m.email) || "—"}</td>
       <td class="td-data">${escHTML(m.telefone) || "—"}</td>
       <td class="td-acoes">
         <button class="btn-linha btn-linha--editar" onclick="editarMorador(${m.id})">✎ Editar</button>
         <button onclick="convidarMorador(${m.id})"
                 class="btn-acao btn-acao--secundario"
                 title="Enviar link de primeiro acesso">
           CONVIDAR
         </button>
         <button onclick="gerarQRPortal(${m.id})"
                 class="btn-acao btn-acao--secundario"
                 title="Gerar QR code de acesso ao portal"
                 ${m.conta_ativa ? "" : "disabled title='Morador ainda não ativou a conta'"}>
           QR PORTAL
         </button>
       </td>`;
      const btnDeletar = document.createElement("button");
      btnDeletar.className = "btn-linha btn-linha--deletar";
      btnDeletar.textContent = "✕ Excluir";
      btnDeletar.dataset.id = m.id;
      btnDeletar.dataset.desc = m.nome;
      btnDeletar.addEventListener("click", () => deletarMorador(m.id, m.nome, btnDeletar));
      tr.querySelector(".td-acoes").appendChild(btnDeletar);
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

function _validarMorador() {
  const v1 = validarCampo("mor-nome",        REGRAS.naoVazio,  "Informe o nome");
  const v2 = validarCampo("mor-apartamento", REGRAS.naoVazio,  "Informe o apartamento");
  const v3 = validarCampo("mor-email",       REGRAS.email,     "Informe um e-mail válido");
  const v4 = validarCampo("mor-telefone",    REGRAS.naoVazio,  "Informe o telefone");
  return v1 && v2 && v3 && v4;
}

async function submitMorador() {
  if (!CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  limparErros("mor-nome", "mor-apartamento", "mor-email", "mor-telefone");
  if (!_validarMorador()) return;

  const nome        = document.getElementById("mor-nome").value.trim();
  const apartamento = document.getElementById("mor-apartamento").value.trim();
  const email       = document.getElementById("mor-email").value.trim();
  const telefone    = document.getElementById("mor-telefone").value.trim();

  setBtnLoading("mor-btn", "mor-btn-label", true);
  try {
    if (editandoMor) {
      await putAPI(`/moradores/${editandoMor}`, { nome, apartamento, email, telefone, condominio_id: CONDOMINIO_ID });
      exibirToast("✔ Morador atualizado com sucesso!");
      _sairModoEdicaoMor();
    } else {
      await postAPI("/moradores", { nome, apartamento, email, telefone, condominio_id: CONDOMINIO_ID });
      exibirToast("✔ Morador cadastrado com sucesso!");
    }
    limparFormulario("mor-nome", "mor-apartamento", "mor-email", "mor-telefone");
    await carregarMoradores();
  } catch (err) {
    console.error(err);
    exibirToast(`✖ Erro ao salvar morador: ${err.message}`, "erro");
  } finally {
    setBtnLoading("mor-btn", "mor-btn-label", false);
  }
}

function editarMorador(id) {
  fetchAPI(`/moradores/${id}`).then((m) => {
    if (!m) return;
    editandoMor = id;
    document.getElementById("mor-nome").value        = m.nome;
    document.getElementById("mor-apartamento").value = m.apartamento || "";
    document.getElementById("mor-email").value       = m.email || "";
    document.getElementById("mor-telefone").value    = m.telefone || "";

    const body  = document.getElementById("mor-form-body");
    const label = document.getElementById("mor-toggle-label");
    body.classList.add("open");
    label.textContent = "✕ FECHAR";

    document.getElementById("mor-btn-label").textContent = "▶ SALVAR EDIÇÃO";
    document.getElementById("mor-feedback").textContent  = `✎ Editando morador #${id}`;
    document.getElementById("mor-feedback").className    = "form-feedback ok";

    body.scrollIntoView({ behavior: "smooth", block: "start" });
  }).catch(() => exibirToast("✖ Erro ao carregar morador", "erro"));
}

async function deletarMorador(id, nome, btn) {
  if (!confirmarExclusao(nome)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/moradores/${id}`);
    exibirToast("✔ Morador excluído com sucesso!");
    await carregarMoradores();
  } catch (err) {
    exibirToast("✖ Erro ao excluir morador", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

async function convidarMorador(moradorId) {
  try {
    const data = await postAPI(`/moradores/${moradorId}/convidar`, {});
    if (data && data.onboarding_url) {
      abrirModalConvite(data.onboarding_url, data.mensagem);
    }
  } catch (err) {
    exibirToast("Erro ao gerar convite: " + err.message, "erro");
  }
}

function abrirModalConvite(url, mensagem) {
  const modal = document.getElementById("modal-convite");
  document.getElementById("modal-convite-url").value = url;

  const statusEl = document.getElementById("modal-convite-status");
  const emailEnviado = mensagem && mensagem.includes("e-mail");
  statusEl.textContent = mensagem || "Link gerado. Envie ao morador.";
  statusEl.style.background = emailEnviado
    ? "rgba(16,185,129,.12)"
    : "rgba(6,182,212,.10)";
  statusEl.style.color = emailEnviado ? "var(--p2)" : "var(--p3)";
  statusEl.style.border = emailEnviado
    ? "1px solid rgba(16,185,129,.25)"
    : "1px solid rgba(6,182,212,.20)";

  modal.style.display = "flex";
  setTimeout(() => document.getElementById("modal-convite-url").select(), 100);
}

function fecharModalConvite() {
  document.getElementById("modal-convite").style.display = "none";
}

async function copiarLinkConvite() {
  const url = document.getElementById("modal-convite-url").value;
  const btn = document.getElementById("btn-copiar-convite");
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    document.getElementById("modal-convite-url").select();
    document.execCommand("copy");
  }
  btn.textContent = "COPIADO ✓";
  btn.style.background = "var(--p1)";
  setTimeout(() => { btn.textContent = "COPIAR"; btn.style.background = "var(--p2)"; }, 2000);
}

function _sairModoEdicaoMor() {
  editandoMor = null;
  document.getElementById("mor-btn-label").textContent = "▶ EXECUTAR";
  document.getElementById("mor-feedback").textContent  = "";
}

// ── IMPORTAÇÃO DE PLANILHA EXCEL ─────────────────────────────

function abrirImportacao(tipo) {
  const input = document.getElementById(`import-input-${tipo}`);
  if (input) input.click();
}

async function processarImportacao(tipo, inputEl) {
  const arquivo = inputEl.files[0];
  if (!arquivo) return;

  const btnId    = `import-btn-${tipo}`;
  const statusId = `import-status-${tipo}`;
  const btn      = document.getElementById(btnId);
  const statusEl = document.getElementById(statusId);

  if (btn) { btn.disabled = true; btn.textContent = "IMPORTANDO…"; }
  if (statusEl) { statusEl.textContent = ""; statusEl.className = "import-status"; }

  const formData = new FormData();
  formData.append("arquivo", arquivo);

  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/importar/${tipo}/${CONDOMINIO_ID}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || `Erro ${res.status}`);
    }

    const msg = `✔ ${data.criados} registro(s) importado(s) de ${data.total_linhas} linha(s).` +
      (data.erros.length ? ` ${data.erros.length} erro(s) ignorado(s).` : "");

    if (statusEl) { statusEl.textContent = msg; statusEl.className = "import-status ok"; }
    exibirToast(msg);

    if (tipo === "despesas")  await carregarDespesas();
    if (tipo === "receitas")  await carregarReceitas();
    if (tipo === "moradores") await carregarMoradores();
    if (tipo === "despesas" || tipo === "receitas") await carregarDashboard();

    if (data.erros.length) {
      console.warn("Erros de importação:", data.erros);
    }
  } catch (err) {
    const msg = `✖ ${err.message}`;
    if (statusEl) { statusEl.textContent = msg; statusEl.className = "import-status erro"; }
    exibirToast(msg, "erro");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📂 IMPORTAR EXCEL"; }
    inputEl.value = "";
  }
}

async function baixarTemplate(tipo) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/importar/template/${tipo}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) { exibirToast("Erro ao baixar template", "erro"); return; }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `template_${tipo}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── 13. INADIMPLÊNCIA ────────────────────────────────────────

const MESES_NOMES = [
  "","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO",
  "JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"
];
const MESES_CURTOS = [
  "","Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez"
];

function preencherFiltrosMesAno() {
  const selMes = document.getElementById("inad-filtro-mes");
  const selAno = document.getElementById("inad-filtro-ano");
  if (!selMes || selMes.options.length > 0) return; // já preenchido

  const hoje = new Date();
  selMes.innerHTML = MESES_NOMES.slice(1).map((m, i) =>
    `<option value="${i+1}" ${i+1 === hoje.getMonth()+1 ? "selected" : ""}>${m}</option>`
  ).join("");

  selAno.innerHTML = "";
  for (let y = hoje.getFullYear(); y >= hoje.getFullYear() - 3; y--) {
    selAno.innerHTML += `<option value="${y}" ${y === hoje.getFullYear() ? "selected" : ""}>${y}</option>`;
  }
}

async function carregarInadimplencia() {
  preencherFiltrosMesAno();
  await Promise.all([
    carregarTaxa(),
    carregarInadimplentes(),
    carregarPagamentos(),
  ]);
}

// ─── TAXA ─────────────────────────────────────────────────────

async function carregarTaxa() {
  if (!CONDOMINIO_ID) return;
  try {
    const taxa = await fetchAPI(`/taxa/${CONDOMINIO_ID}`);
    if (!taxa) return;
    document.getElementById("inad-taxa-valor").value = taxa.valor ?? "";
    document.getElementById("inad-stat-taxa").textContent = formatarMoeda(taxa.valor);
  } catch (_) {
    document.getElementById("inad-stat-taxa").textContent = "NÃO CONFIGURADA";
  }
}

async function salvarTaxa() {
  const valorEl = document.getElementById("inad-taxa-valor");
  const valor   = parseFloat(valorEl.value);

  const valido = validarCampo("inad-taxa-valor", (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Informe um valor maior que zero");
  if (!valido) return;

  setBtnLoading("inad-btn-taxa", "inad-btn-taxa-label", true, "▶ SALVAR TAXA");
  try {
    await postAPI(`/taxa/${CONDOMINIO_ID}`, { valor });
    exibirToast("✔ Taxa salva com sucesso!");
    document.getElementById("inad-stat-taxa").textContent = formatarMoeda(valor);
    exibirFeedback("inad-feedback", `✔ Taxa de ${formatarMoeda(valor)}/mês configurada`, "ok");
  } catch (err) {
    exibirToast(`✖ Erro ao salvar taxa: ${err.message}`, "erro");
  } finally {
    setBtnLoading("inad-btn-taxa", "inad-btn-taxa-label", false, "▶ SALVAR TAXA");
  }
}

// ─── GERAR COBRANÇAS ──────────────────────────────────────────

async function gerarPagamentos() {
  if (!confirm("Gerar cobranças dos últimos 3 meses para todos os moradores?\n\nRegistros existentes não serão duplicados.")) return;

  setBtnLoading("inad-btn-gerar", "inad-btn-gerar-label", true, "⚡ GERAR COBRANÇAS (3 MESES)");
  try {
    const res = await postAPI(`/pagamentos/gerar/${CONDOMINIO_ID}`, {});
    exibirToast(`✔ ${res.message || "Cobranças geradas!"}`);
    exibirFeedback("inad-feedback", `✔ ${res.message}`, "ok");
    await Promise.all([carregarPagamentos(), carregarInadimplentes()]);
  } catch (err) {
    exibirToast(`✖ ${err.message || "Erro ao gerar cobranças"}`, "erro");
    exibirFeedback("inad-feedback", `✖ ${err.message}`, "erro");
  } finally {
    setBtnLoading("inad-btn-gerar", "inad-btn-gerar-label", false, "⚡ GERAR COBRANÇAS (3 MESES)");
  }
}

// ─── LISTA DE PAGAMENTOS ──────────────────────────────────────

async function carregarPagamentos() {
  const mes = document.getElementById("inad-filtro-mes")?.value || new Date().getMonth() + 1;
  const ano = document.getElementById("inad-filtro-ano")?.value || new Date().getFullYear();
  const tbody = document.getElementById("tabela-pagamentos");
  if (!tbody || !CONDOMINIO_ID) return;

  tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><span class="blink">█</span> CARREGANDO...</td></tr>`;

  try {
    const lista = await fetchAPI(`/pagamentos/${CONDOMINIO_ID}?mes=${mes}&ano=${ano}`);
    if (!lista || !lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">⬡</div><div>Nenhum pagamento encontrado para este período.</div><div class="empty-state-hint">Gere as cobranças usando o botão acima.</div></td></tr>`;
      document.getElementById("inad-count").textContent = "00 ENTRADAS";
      return;
    }

    document.getElementById("inad-count").textContent = `${pad(lista.length)} ENTRADAS`;

    tbody.innerHTML = lista.map((p, i) => {
      const statusClass = p.pago ? "badge-pago" : "badge-pendente";
      const statusText  = p.pago ? "✔ PAGO" : "✖ PENDENTE";
      const btnClass    = p.pago ? "btn-linha--editar" : "btn-linha--pagar";
      const btnLabel    = p.pago ? "↩ DESFAZER" : "✔ MARCAR PAGO";
      const pagAnim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${i * 0.04}s`;
      return `
        <tr style="${pagAnim}" class="${p.pago ? "" : "row-pendente"}">
          <td>${escHTML(p.morador_nome) || "—"}</td>
          <td class="td-apt">${escHTML(p.apartamento) || "—"}</td>
          <td class="td-data">${escHTML(MESES_CURTOS[p.mes] || "")}/${escHTML(String(p.ano))}</td>
          <td class="td-valor ${p.pago ? "td-valor--green" : "td-valor--red"}">${formatarMoeda(p.valor)}</td>
          <td><span class="inad-badge ${statusClass}">${statusText}</span></td>
          <td class="td-acoes">
            <button class="btn-linha ${btnClass}" data-pid="${Number(p.id)}" data-pago="${!p.pago}">${btnLabel}</button>
          </td>
        </tr>`;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">⚠ ERRO AO CARREGAR PAGAMENTOS</td></tr>`;
    exibirToast("✖ Erro ao carregar pagamentos", "erro");
  }
}

async function togglePagamento(pagamentoId, novoPago, btn) {
  const hoje = dataHoje();
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await putAPI(`/pagamentos/${pagamentoId}`, {
      pago: novoPago,
      data_pagamento: novoPago ? hoje : null,
    });
    exibirToast(novoPago ? "✔ Marcado como pago!" : "✔ Marcado como pendente");
    await Promise.all([carregarPagamentos(), carregarInadimplentes(), carregarBalanco()]);
  } catch (err) {
    exibirToast(`✖ Erro ao atualizar: ${err.message}`, "erro");
    if (btn) { btn.disabled = false; btn.textContent = novoPago ? "✔ Pagar" : "↩ Reverter"; }
  }
}

// ─── CARDS DE INADIMPLENTES ───────────────────────────────────

async function carregarInadimplentes() {
  if (!CONDOMINIO_ID) return;
  try {
    const lista = await fetchAPI(`/inadimplentes/${CONDOMINIO_ID}`);
    if (!lista) return;
    const totalValor = lista.reduce((acc, i) => acc + i.valor_total, 0);
    document.getElementById("inad-stat-total").textContent = lista.length;
    document.getElementById("inad-stat-valor").textContent = formatarMoeda(totalValor);
    const statTotal = document.getElementById("inad-stat-total");
    statTotal.classList.toggle("negativo", lista.length > 0);
  } catch (_) { /* silencia */ }
}

// ─── DOWNLOAD PDF ─────────────────────────────────────────────

async function baixarRelatorioPDF() {
  const mes = document.getElementById("inad-filtro-mes")?.value || new Date().getMonth() + 1;
  const ano = document.getElementById("inad-filtro-ano")?.value || new Date().getFullYear();

  const btn = document.getElementById("inad-btn-pdf");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ GERANDO…"; }

  try {
    const token = getToken();
    if (!token) return;
    const resp = await fetch(
      `${API_BASE}/relatorio-pdf/${CONDOMINIO_ID}?mes=${mes}&ano=${ano}`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    // Bug 5 fix: verifica se a resposta é realmente um PDF antes de tratar como blob.
    // Sem isso, erros JSON do servidor (403, 404, 500) seriam baixados como "PDF corrompido".
    const contentType = resp.headers.get("content-type") || "";
    if (!resp.ok || !contentType.includes("application/pdf")) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${resp.status} ao gerar PDF`);
    }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `relatorio_condo${CONDOMINIO_ID}_${pad(mes)}_${ano}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    exibirToast("✔ PDF gerado e baixado com sucesso!");
  } catch (err) {
    exibirToast(`✖ Erro ao gerar PDF: ${err.message}`, "erro");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "⬇ BAIXAR PDF"; }
  }
}

// ── 14. INIT ─────────────────────────────────────────────────

async function init() {
  if (!getToken()) return;
  limparFormulario("desp-data", "rec-data");
  exibirUsuarioLogado();
  initClock();
  initUptime();
  // Delegated listener for payment toggle buttons (avoids inline onclick with DB ids)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pid]");
    if (!btn) return;
    const pid  = Number(btn.dataset.pid);
    const pago = btn.dataset.pago === "true";
    if (!isNaN(pid)) togglePagamento(pid, pago, btn);
  });
  const usuario = getUsuario();
  if (usuario && usuario.tipo === "ADMIN") {
    const navGestao = document.getElementById("nav-gestao");
    if (navGestao) navGestao.style.display = "";
  }
  // Mostra botão GUIA INICIAL se o síndico já dispensou o onboarding antes
  if (usuario && usuario.tipo === "SINDICO" && localStorage.getItem(_ONBOARDING_KEY)) {
    const navGuia = document.getElementById("nav-guia");
    if (navGuia) navGuia.style.display = "flex";
  }
  try {
    await carregarCondominios();
  } catch (err) {
    console.error(err);
    // Mostra mensagem visível ao usuário
    document.querySelector(".main").innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;font-family:var(--font-mono);color:var(--red);text-align:center;">
        <div style="font-size:32px;">⚠</div>
        <div style="font-size:14px;letter-spacing:2px;">API INACESSÍVEL</div>
        <div style="font-size:11px;color:var(--text-dim);">Verifique se o servidor está rodando em<br>http://127.0.0.1:8000</div>
        <button onclick="location.reload()" style="margin-top:8px;padding:10px 24px;background:rgba(255,68,102,.1);border:1px solid rgba(255,68,102,.3);color:var(--red);font-family:var(--font-mono);font-size:11px;letter-spacing:2px;border-radius:4px;cursor:pointer;">
          ↺ TENTAR NOVAMENTE
        </button>
      </div>`;
  }
}

// ── 15. CONDO//AI ────────────────────────────────────────────

let _dadosIA = null;
let _iaIniciada = false;
let _iaHistorico = [];

// Aliases locais eliminados — usando formatarMoeda() e formatarData() globais

// ── Typing indicator ─────────────────────────────────────────
function mostrarTyping() {
  const area = document.getElementById("ia-chat-area");
  if (document.getElementById("ia-typing-live")) return;
  const el = document.createElement("div");
  el.id = "ia-typing-live";
  el.className = "ia-msg ia-msg-bot";
  el.innerHTML = `
    <div class="ia-avatar">✦</div>
    <div class="ia-msg-bubble ia-msg-bubble-bot ia-typing">
      <span class="ia-typing-dot"></span>
      <span class="ia-typing-dot"></span>
      <span class="ia-typing-dot"></span>
    </div>`;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

function esconderTyping() {
  document.getElementById("ia-typing-live")?.remove();
}

// ── Formatação markdown nas respostas da IA ──────────────────
function formatarRespostaIA(texto) {
  const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc(texto)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, '<div class="ia-section-title">$1</div>')
    .replace(/^## (.+)$/gm,  '<div class="ia-section-title">$1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="list-style:decimal;margin-left:1.2rem">$2</li>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>(?:\n|$))+/g, (m) => `<ul style="margin:.3rem 0 .3rem 1rem;padding:0">${m}</ul>`)
    .replace(/R\$\s?[\d.,]+/g, (m) => `<span class="ia-valor">${m}</span>`)
    .replace(/⚠|⚠️/g, '<span style="color:var(--red)">⚠</span>')
    .replace(/✅|✔/g, '<span style="color:var(--p2)">✔</span>')
    .replace(/\n/g, "<br>");
}

// ── Sugestões contextuais ─────────────────────────────────────
function gerarSugestoesContextuais() {
  const container = document.querySelector(".ia-sugestoes-row");
  if (!container) return;

  if (!_dadosIA) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:11px;padding:8px">Carregando sugestões…</div>';
    return;
  }

  const base = [
    { texto: "Faça um resumo financeiro completo",         icone: "◈" },
    { texto: "Gera um comunicado sobre assembleia geral",  icone: "✉" },
    { texto: "Qual foi meu maior gasto?",                  icone: "↓" },
    { texto: "Como posso reduzir despesas?",               icone: "◆" },
  ];

  // Sugestões dinâmicas baseadas nos dados reais
  if (_dadosIA.saldo < 0) {
    base.unshift({ texto: "Por que meu saldo está negativo e o que fazer?", icone: "⚠" });
  }
  if (_dadosIA.total_inadimplentes > 0) {
    const pct = _dadosIA.total_moradores ? Math.round(_dadosIA.total_inadimplentes / _dadosIA.total_moradores * 100) : 0;
    base.unshift({ texto: `${_dadosIA.total_inadimplentes} inadimplentes (${pct}%): quais ações tomar?`, icone: "⚠" });
  }
  if (_dadosIA.reclamacoes_abertas > 0) {
    base.push({ texto: `Há ${_dadosIA.reclamacoes_abertas} reclamação(ões) em aberto. Como priorizar?`, icone: "📋" });
  }
  if (_dadosIA.votacoes_ativas > 0) {
    base.push({ texto: `Há ${_dadosIA.votacoes_ativas} votação(ões) ativa(s). Crie um comunicado de lembrete`, icone: "🗳" });
  }
  if (_dadosIA.manutencoes && _dadosIA.manutencoes.length > 0) {
    const m = _dadosIA.manutencoes[0];
    base.push({ texto: `Manutenção de ${m.categoria} agendada — escreva um aviso para os moradores`, icone: "🔧" });
  }

  container.innerHTML = base.slice(0, 5).map((s) =>
    `<button class="ia-sugestao-btn" data-sugestao="${escHTML(s.texto)}">${escHTML(s.icone)} ${escHTML(s.texto)}</button>`
  ).join("");
  container.querySelectorAll("[data-sugestao]").forEach((btn) => {
    btn.addEventListener("click", () => usarSugestao(btn.dataset.sugestao));
  });
}

// ── Histórico persistente (por condomínio, por sessão) ────────
function salvarHistoricoIA() {
  if (_iaHistorico.length && CONDOMINIO_ID) {
    sessionStorage.setItem(`ia_hist_${CONDOMINIO_ID}`, JSON.stringify(_iaHistorico.slice(-40)));
  }
}

function restaurarHistoricoIA() {
  if (!CONDOMINIO_ID) return;
  const saved = sessionStorage.getItem(`ia_hist_${CONDOMINIO_ID}`);
  if (!saved) return;
  try {
    _iaHistorico = JSON.parse(saved);
    _iaHistorico.forEach((msg) => {
      renderMensagem(msg.content, msg.role === "user" ? "user" : "bot");
    });
  } catch { _iaHistorico = []; }
}

// ── Carrega dados do backend ──────────────────────────────────
async function carregarIA() {
  if (!CONDOMINIO_ID) return;

  if (!_iaIniciada) {
    _iaIniciada = true;
    setTimeout(() => document.getElementById("ia-input")?.focus(), 100);
  }

  _iaHistorico = [];
  document.getElementById("ia-chat-area").innerHTML = `
    <div class="ia-msg ia-msg-bot">
      <div class="ia-avatar">✦</div>
      <div class="ia-msg-bubble ia-msg-bubble-bot">
        <span class="ia-label">CONDO//AI</span>
        Olá! Sou o assistente inteligente do seu condomínio.<br>
        Conheço seus dados financeiros em tempo real: saldo, despesas, receitas e inadimplentes.<br>
        Como posso ajudar?
      </div>
    </div>`;

  try {
    _dadosIA = await fetchAPI(`/ai/dados/${CONDOMINIO_ID}`);
  } catch (_) {
    _dadosIA = null;
  }

  restaurarHistoricoIA();
  gerarSugestoesContextuais();
}

// ── Renderiza bolha no chat ───────────────────────────────────
function renderMensagem(texto, tipo) {
  const area = document.getElementById("ia-chat-area");
  const wrap = document.createElement("div");
  wrap.className = `ia-msg ia-msg-${tipo}`;

  if (tipo === "bot") {
    wrap.innerHTML = `
      <div class="ia-avatar">✦</div>
      <div class="ia-msg-bubble ia-msg-bubble-bot">
        <span class="ia-label">CONDO//AI</span>
        ${formatarRespostaIA(texto)}
      </div>`;
  } else {
    wrap.innerHTML = `
      <div class="ia-msg-bubble ia-msg-bubble-user"></div>
      <div class="ia-avatar">◉</div>`;
    wrap.querySelector(".ia-msg-bubble-user").textContent = texto;
  }

  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

// ── Sugestão rápida ───────────────────────────────────────────
function usarSugestao(texto) {
  const input = document.getElementById("ia-input");
  if (!input) return;
  input.value = texto;
  enviarMensagemIA();
}

// ── Motor de respostas locais ─────────────────────────────────
function processarPerguntaIA(msg) {
  if (!_dadosIA) {
    return "⚠ Não consegui carregar os dados do condomínio. Tente recarregar a página.";
  }

  const d   = _dadosIA;
  const txt = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // ── Saldo / situação financeira ───────────────────────────
  if (/saldo|situacao|financ|balanc|dinheiro|caixa/.test(txt)) {
    const status = d.saldo >= 0 ? "✔ POSITIVO" : "⚠ NEGATIVO";
    return `◆ SITUAÇÃO FINANCEIRA — ${d.condominio.toUpperCase()}

Status: ${status}
Saldo líquido:     ${formatarMoeda(d.saldo)}
Total de receitas: ${formatarMoeda(d.total_receitas)}
Total de despesas: ${formatarMoeda(d.total_despesas)}
Taxa mensal:       ${formatarMoeda(d.taxa_mensal)}

${d.saldo < 0
  ? "⚠ Atenção: o condomínio está com saldo negativo. Verifique as despesas e a arrecadação."
  : "✔ O caixa está positivo. Bom trabalho na gestão financeira!"}`;
  }

  // ── Inadimplentes ─────────────────────────────────────────
  if (/inadimpl|devendo|deve|atraso|pendente|pagar/.test(txt)) {
    if (!d.inadimplentes.length) {
      return "✔ Ótima notícia! Não há moradores inadimplentes no momento.\nTodos os pagamentos estão em dia.";
    }
    const lista = d.inadimplentes
      .map((i, n) => `${n + 1}. ${i.nome} — Apto ${i.apartamento} — ${formatarMoeda(i.valor)} em aberto`)
      .join("\n");
    const total = d.inadimplentes.reduce((acc, i) => acc + i.valor, 0);
    return `⚠ INADIMPLENTES — ${d.inadimplentes.length} morador(es)

${lista}

Total em aberto: ${formatarMoeda(total)}

Acesse a aba INADIMPLÊNCIA para marcar pagamentos.`;
  }

  // ── Maior gasto ───────────────────────────────────────────
  if (/maior.*(gasto|despesa)|gasto.*maior|despesa.*maior|mais.*caro/.test(txt)) {
    if (!d.despesas.length) {
      return "Nenhuma despesa registrada ainda.";
    }
    const top = d.despesas[0];
    const top5 = d.despesas.slice(0, 5);
    const lista = top5
      .map((dp, n) => `${n + 1}. ${dp.descricao} — ${formatarMoeda(dp.valor)} em ${formatarData(dp.data)}`)
      .join("\n");
    return `↓ MAIORES DESPESAS — ${d.condominio.toUpperCase()}

Maior gasto: ${top.descricao} — ${formatarMoeda(top.valor)}
Data: ${formatarData(top.data)}

Top 5 despesas:
${lista}`;
  }

  // ── Listagem de despesas ──────────────────────────────────
  if (/despesa|gasto|custo|paguei|pagamos/.test(txt)) {
    if (!d.despesas.length) {
      return "Nenhuma despesa registrada ainda.";
    }
    const recentes = d.despesas.slice(0, 8);
    const lista = recentes
      .map((dp, n) => `${n + 1}. ${dp.descricao} — ${formatarMoeda(dp.valor)} — ${formatarData(dp.data)}`)
      .join("\n");
    return `↓ DESPESAS REGISTRADAS — ${d.despesas.length} no total

${lista}

Total acumulado: ${formatarMoeda(d.total_despesas)}`;
  }

  // ── Receitas ──────────────────────────────────────────────
  if (/receita|entrada|arrecad|receb/.test(txt)) {
    if (!d.receitas.length) {
      return "Nenhuma receita registrada ainda.";
    }
    const lista = d.receitas.slice(0, 8)
      .map((r, n) => `${n + 1}. ${r.descricao} — ${formatarMoeda(r.valor)} — ${formatarData(r.data)}`)
      .join("\n");
    return `↑ RECEITAS REGISTRADAS — ${d.receitas.length} no total

${lista}

Total arrecadado: ${formatarMoeda(d.total_receitas)}`;
  }

  // ── Moradores ─────────────────────────────────────────────
  if (/morador|condoimin|residente|apartamento|quantos/.test(txt)) {
    const lista = d.moradores.slice(0, 10)
      .map((m, n) => `${n + 1}. ${m.nome} — Apto ${m.apartamento}`)
      .join("\n");
    const resto = d.total_moradores > 10 ? `\n... e mais ${d.total_moradores - 10} morador(es).` : "";
    return `◉ MORADORES — ${d.total_moradores} cadastrado(s)

${lista}${resto}

Inadimplentes: ${d.total_inadimplentes} de ${d.total_moradores}`;
  }

  // ── Taxa mensal ───────────────────────────────────────────
  if (/taxa|mensalidade|condominio|fee/.test(txt)) {
    if (!d.taxa_mensal) {
      return "⚠ A taxa mensal ainda não foi configurada.\nAcesse a aba INADIMPLÊNCIA para definir o valor.";
    }
    const arrecadacao = d.taxa_mensal * (d.total_moradores - d.total_inadimplentes);
    const potencial   = d.taxa_mensal * d.total_moradores;
    return `$ TAXA CONDOMINIAL

Valor configurado: ${formatarMoeda(d.taxa_mensal)}/mês
Moradores pagantes: ${d.total_moradores - d.total_inadimplentes} de ${d.total_moradores}
Arrecadação atual:  ${formatarMoeda(arrecadacao)}
Potencial máximo:   ${formatarMoeda(potencial)}
Perda por inadimplência: ${formatarMoeda(potencial - arrecadacao)}`;
  }

  // ── Comunicado de assembleia ──────────────────────────────
  if (/comunicado|assembleia|aviso|notific|circular/.test(txt)) {
    const hoje = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric"
    });
    return `✉ COMUNICADO — ${d.condominio.toUpperCase()}

─────────────────────────────────────
           CONVOCAÇÃO DE ASSEMBLEIA
─────────────────────────────────────

Prezados Condôminos,

Comunicamos que será realizada Assembleia Geral Ordinária do
${d.condominio}, para deliberação sobre assuntos de interesse
condominial, conforme pauta a ser divulgada.

Data: a definir
Horário: a definir
Local: Salão de Festas / Área comum

A presença de todos é fundamental para o bom
funcionamento do nosso condomínio.

Atenciosamente,
A Administração — ${d.condominio}
${hoje}
─────────────────────────────────────

💡 Dica: Copie este texto e cole no Mural de Avisos.`;
  }

  // ── Resumo completo ───────────────────────────────────────
  if (/resumo|relatorio|overview|geral|tudo|completo/.test(txt)) {
    const saude = d.saldo >= 0 ? "✔ SAUDÁVEL" : "⚠ ATENÇÃO NECESSÁRIA";
    return `◈ RESUMO COMPLETO — ${d.condominio.toUpperCase()}

SAÚDE FINANCEIRA: ${saude}

── FINANCEIRO ──────────────────────
Receitas:  ${formatarMoeda(d.total_receitas)}
Despesas:  ${formatarMoeda(d.total_despesas)}
Saldo:     ${formatarMoeda(d.saldo)}
Taxa/mês:  ${formatarMoeda(d.taxa_mensal)}

── MORADORES ───────────────────────
Total:        ${d.total_moradores} morador(es)
Em dia:       ${d.total_moradores - d.total_inadimplentes}
Inadimplentes: ${d.total_inadimplentes}

── TRANSAÇÕES ──────────────────────
Despesas registradas: ${d.despesas.length}
Receitas registradas: ${d.receitas.length}
${d.despesas.length ? `\nMaior gasto: ${d.despesas[0].descricao} — ${formatarMoeda(d.despesas[0].valor)}` : ""}`;
  }

  // ── Ajuda ─────────────────────────────────────────────────
  if (/ajuda|help|comando|o que|oque|pode|consegue/.test(txt)) {
    return `✦ CONDO//AI — COMANDOS DISPONÍVEIS

Posso responder sobre:

📊 Financeiro
   → "Como está meu saldo?"
   → "Mostre as receitas"
   → "Liste as despesas"
   → "Qual foi o maior gasto?"

👥 Moradores
   → "Quem está devendo?"
   → "Quantos moradores temos?"

💰 Taxa
   → "Qual é a taxa mensal?"

✉ Comunicados
   → "Gera um comunicado de assembleia"

📋 Geral
   → "Resumo completo do condomínio"

Digite qualquer uma dessas perguntas!`;
  }

  // ── Fallback ──────────────────────────────────────────────
  return `Não entendi completamente sua pergunta. Tente algo como:

• "Como está meu saldo?"
• "Quem está devendo?"
• "Qual foi meu maior gasto?"
• "Mostre as despesas"
• "Quantos moradores temos?"
• "Gera um comunicado de assembleia"
• "Resumo completo"

Digite "ajuda" para ver todos os comandos.`;
}

// ── Envio da mensagem ─────────────────────────────────────────
async function enviarMensagemIA() {
  const input = document.getElementById("ia-input");
  const mensagem = input.value.trim();
  if (!mensagem) return;
  if (!CONDOMINIO_ID) {
    exibirToast("⚠ Selecione um condomínio primeiro", "erro");
    return;
  }

  renderMensagem(mensagem, "user");
  input.value = "";

  setBtnLoading("ia-btn-enviar", "ia-btn-enviar-label", true, "▶ ENVIAR");
  mostrarTyping();

  let tentativas = 0;
  const MAX_TENTATIVAS = 2;

  const enviarComRetry = async () => {
    try {
      const data = await postAPI("/ai/chat", {
        mensagem,
        condominio_id: CONDOMINIO_ID,
        historico: _iaHistorico,
      });
      _iaHistorico.push({ role: "user", content: mensagem });
      _iaHistorico.push({ role: "assistant", content: data.resposta });
      salvarHistoricoIA();
      esconderTyping();
      renderMensagem(data.resposta, "bot");
    } catch (err) {
      const is503 = err.message && (err.message.includes("503") || err.message.toLowerCase().includes("temporariamente indispon"));
      const isRate = err.message && err.message.includes("429");
      if ((is503 || isRate) && tentativas < MAX_TENTATIVAS) {
        tentativas++;
        await new Promise((r) => setTimeout(r, 1200 * tentativas));
        return enviarComRetry();
      }
      esconderTyping();
      const msgConf = err.message && err.message.toLowerCase().includes("indispon");
      renderMensagem(
        msgConf && !is503
          ? "⚠ Serviço de IA indisponível. A chave GROQ_API_KEY não está configurada no servidor."
          : isRate
          ? "⚠ Limite de requisições atingido. Aguarde alguns segundos e tente novamente."
          : `⚠ ${err.message || "Erro ao processar. Tente novamente."}`,
        "bot"
      );
    } finally {
      if (tentativas === 0 || tentativas >= MAX_TENTATIVAS) {
        setBtnLoading("ia-btn-enviar", "ia-btn-enviar-label", false, "▶ ENVIAR");
        input.focus();
      }
    }
  };

  try {
    await enviarComRetry();
  } finally {
    setBtnLoading("ia-btn-enviar", "ia-btn-enviar-label", false, "▶ ENVIAR");
    input.focus();
  }
}

// ── 16. QUADRO DE AVISOS ─────────────────────────────────────

const _TIPO_LABEL = { NORMAL: "NORMAL", URGENTE: "URGENTE", INFO: "INFO" };

async function carregarAvisos() {
  if (!CONDOMINIO_ID) return;
  const lista  = document.getElementById("avisos-lista");
  const badge  = document.getElementById("avisos-count");
  const usuario = getUsuario();

  // Mostra formulário só para ADMIN/SINDICO
  const painel = document.getElementById("aviso-form-panel");
  if (painel) painel.style.display = "";

  try {
    const avisos = await fetchAPI(`/avisos?condominio_id=${CONDOMINIO_ID}`);
    if (!avisos) return;
    badge.textContent = avisos.length;

    if (!avisos.length) {
      lista.innerHTML = `
        <div class="empty-state" style="padding:32px 0">
          <div class="empty-state-icon">📋</div>
          <div>Nenhum aviso publicado.</div>
          <div class="empty-state-hint">Publique um comunicado usando o formulário acima.</div>
        </div>`;
      return;
    }

    lista.innerHTML = "";
    avisos.forEach((a, i) => {
      const data = new Date(a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const podeDeletar = usuario && (usuario.tipo === "ADMIN" || usuario.tipo === "SINDICO");
      
      const card = document.createElement("div");
      card.className = `aviso-card aviso-card--${a.tipo}`;
      card.style.animationDelay = `${i * 0.06}s`;
      
      card.innerHTML = `
        <span class="aviso-badge aviso-badge--${a.tipo}">${_TIPO_LABEL[a.tipo]}</span>
        <div class="aviso-body">
          <div class="aviso-titulo"></div>
          <div class="aviso-conteudo"></div>
          <div class="aviso-meta">// ${data}</div>
        </div>
        ${podeDeletar ? `<div class="aviso-actions"><button class="btn-linha btn-linha--editar" title="Editar">✎</button><button class="btn-linha btn-linha--deletar" title="Excluir">✕</button></div>` : ""}
      `;

      card.querySelector(".aviso-titulo").textContent = a.titulo.toUpperCase();
      card.querySelector(".aviso-conteudo").textContent = a.conteudo;

      if (podeDeletar) {
        card.querySelector(".btn-linha--editar").addEventListener("click", () => abrirEditarAviso(a));
        card.querySelector(".btn-linha--deletar").addEventListener("click", (e) => deletarAviso(a.id, a.titulo, e.currentTarget));
      }
      
      lista.appendChild(card);
    });
  } catch (err) {
    lista.innerHTML = `<div class="empty-state" style="padding:24px 0">⚠ Erro ao carregar avisos.</div>`;
    console.error(err);
  }
}

async function submitAviso() {
  const titulo   = document.getElementById("aviso-titulo").value.trim();
  const conteudo = document.getElementById("aviso-conteudo").value.trim();
  const tipo     = document.getElementById("aviso-tipo").value;

  document.getElementById("aviso-titulo-erro").textContent  = "";
  document.getElementById("aviso-conteudo-erro").textContent = "";

  let valido = true;
  if (!titulo)   { document.getElementById("aviso-titulo-erro").textContent  = "Campo obrigatório"; valido = false; }
  if (!conteudo) { document.getElementById("aviso-conteudo-erro").textContent = "Campo obrigatório"; valido = false; }
  if (!valido) return;

  setBtnLoading("aviso-btn", "aviso-btn-label", true, "▶ PUBLICAR");
  try {
    await postAPI("/avisos", { titulo, conteudo, tipo, condominio_id: CONDOMINIO_ID });
    exibirToast("✔ Aviso publicado com sucesso!");
    document.getElementById("aviso-titulo").value   = "";
    document.getElementById("aviso-conteudo").value = "";
    document.getElementById("aviso-tipo").value     = "NORMAL";
    toggleForm("aviso-form-body", "aviso-toggle-label");
    await carregarAvisos();
  } catch (err) {
    exibirFeedback("aviso-feedback", `⚠ Erro ao publicar: ${err.message}`, "erro");
  } finally {
    setBtnLoading("aviso-btn", "aviso-btn-label", false, "▶ PUBLICAR");
  }
}

let _avisoEditandoId = null;

function abrirEditarAviso(aviso) {
  _avisoEditandoId = aviso.id;
  document.getElementById("edit-aviso-titulo").value  = aviso.titulo;
  document.getElementById("edit-aviso-conteudo").value = aviso.conteudo;
  document.getElementById("edit-aviso-tipo").value    = aviso.tipo;
  document.getElementById("edit-aviso-feedback").textContent = "";
  const modal = document.getElementById("modal-editar-aviso");
  modal.style.display = "flex";
}

function fecharModalEditarAviso() {
  document.getElementById("modal-editar-aviso").style.display = "none";
  _avisoEditandoId = null;
}

async function submitEditarAviso() {
  if (!_avisoEditandoId) return;
  const titulo   = document.getElementById("edit-aviso-titulo").value.trim();
  const conteudo = document.getElementById("edit-aviso-conteudo").value.trim();
  const tipo     = document.getElementById("edit-aviso-tipo").value;
  const fb = document.getElementById("edit-aviso-feedback");
  if (!titulo || !conteudo) { fb.textContent = "⚠ Preencha todos os campos."; return; }

  const btn = document.getElementById("edit-aviso-btn");
  btn.disabled = true; btn.textContent = "SALVANDO…";
  try {
    await putAPI(`/avisos/${_avisoEditandoId}`, { titulo, conteudo, tipo });
    fecharModalEditarAviso();
    exibirToast("✔ Aviso atualizado.");
    await carregarAvisos();
  } catch (err) {
    fb.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = "▶ SALVAR";
  }
}

async function deletarAviso(id, titulo, btn) {
  if (!confirmarExclusao(titulo)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/avisos/${id}`);
    exibirToast("✔ Aviso removido.");
    await carregarAvisos();
  } catch (err) {
    exibirToast("✖ Erro ao remover aviso.", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕"; }
  }
}

// ── 17. GESTÃO DE CONDOMÍNIOS (ADMIN) ────────────────────────

async function carregarGestao() {
  const usuario = getUsuario();
  if (!usuario || usuario.tipo !== "ADMIN") return;
  try {
    const condominios = await fetchAPI("/admin/condominios");
    const tbody = document.getElementById("tabela-gestao");
    const badge = document.getElementById("gestao-count");
    badge.textContent = condominios.length;
    if (!condominios.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">⬡</div><div>Nenhum condomínio cadastrado.</div><div class="empty-state-hint">Use o formulário acima para criar o primeiro.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = condominios.map((c, i) => {
      const gestaoAnim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${i * 0.04}s`;
      return `
      <tr style="${gestaoAnim}">
        <td>${escHTML(c.nome).toUpperCase()}</td>
        <td>${c.sindico_nome ? `${escHTML(c.sindico_nome)}<span class="td-email" style="display:block;font-size:10px;opacity:.6">${escHTML(c.sindico_email)}</span>` : `<span style="opacity:.4">— sem síndico</span>`}</td>
        <td class="text-right td-valor">${c.quantidade_unidades}</td>
        <td class="td-acoes">
          ${!c.sindico_nome ? `<button class="btn-linha" onclick="abrirVincularSindico(${c.id}, ${JSON.stringify(c.nome)})" style="margin-right:4px;border-color:var(--p3);color:var(--p3)">⬡ Vincular</button>` : ''}
          <button class="btn-linha" onclick="abrirEditarCondominio(${c.id}, ${JSON.stringify(c.nome)}, ${c.quantidade_unidades})" style="margin-right:4px">✎ Editar</button>
          <button class="btn-linha btn-linha--deletar" onclick="deletarCondominio(${c.id}, '${c.nome.replace(/'/g, "\\'")}', this)">✕ Excluir</button>
        </td>
      </tr>
    `;
    }).join("");
  } catch (err) {
    console.error(err);
  }
}

async function carregarUsuarios() {
  const usuario = getUsuario();
  if (!usuario || usuario.tipo !== "ADMIN") return;
  const tbody = document.getElementById("tabela-usuarios");
  const badge = document.getElementById("usuarios-count");
  if (!tbody) return;
  try {
    const [usuarios, condominios] = await Promise.all([
      fetchAPI("/usuarios"),
      fetchAPI("/admin/condominios"),
    ]);
    const condoMap = Object.fromEntries((condominios || []).map(c => [c.id, c.nome]));
    badge.textContent = usuarios.length;
    if (!usuarios.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">⬡</div><div>Nenhum usuário cadastrado.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = usuarios.map((u, i) => {
      const anim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${i * 0.04}s`;
      const tipoColor = u.tipo === "ADMIN" ? "var(--p3)" : "var(--p2)";
      const condoNome = u.condominio_id ? escHTML(condoMap[u.condominio_id] || `ID ${u.condominio_id}`) : `<span style="opacity:.35">—</span>`;
      return `<tr style="${anim}">
        <td>${escHTML(u.nome)}</td>
        <td><span class="td-email">${escHTML(u.email)}</span></td>
        <td><span style="color:${tipoColor};font-size:11px;letter-spacing:.05em">${escHTML(u.tipo)}</span></td>
        <td>${condoNome}</td>
      </tr>`;
    }).join("");
  } catch (err) {
    console.error("carregarUsuarios:", err);
  }
}

async function deletarCondominio(id, nome, btn) {
  if (!confirmarExclusao(nome)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/condominios/${id}`);
    exibirToast(`✔ Condomínio "${nome}" excluído.`);
    await carregarGestao();
    await carregarCondominios();
  } catch (err) {
    exibirToast("✖ Erro ao excluir condomínio.", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

let _condoEditandoId = null;

function abrirEditarCondominio(id, nome, unidades) {
  _condoEditandoId = id;
  document.getElementById("edit-condo-nome").value     = nome;
  document.getElementById("edit-condo-unidades").value = unidades;
  document.getElementById("edit-condo-feedback").textContent = "";
  document.getElementById("modal-editar-condo").style.display = "flex";
}

function fecharModalEditarCondo() {
  document.getElementById("modal-editar-condo").style.display = "none";
  _condoEditandoId = null;
}

async function submitEditarCondominio() {
  if (!_condoEditandoId) return;
  const nome     = document.getElementById("edit-condo-nome").value.trim();
  const unidades = parseInt(document.getElementById("edit-condo-unidades").value);
  const fb = document.getElementById("edit-condo-feedback");
  if (!nome) { fb.textContent = "⚠ Nome obrigatório."; return; }
  if (!unidades || unidades < 1) { fb.textContent = "⚠ Informe um número válido de unidades."; return; }

  const btn = document.getElementById("edit-condo-btn");
  btn.disabled = true; btn.textContent = "SALVANDO…";
  try {
    await putAPI(`/condominios/${_condoEditandoId}`, { nome, quantidade_unidades: unidades });
    fecharModalEditarCondo();
    exibirToast("✔ Condomínio atualizado.");
    await carregarGestao();
    await carregarCondominios();
  } catch (err) {
    fb.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = "▶ SALVAR";
  }
}

async function submitNovoCondominio() {
  const usuario = getUsuario();
  if (!usuario || usuario.tipo !== "ADMIN") return;

  // Campos
  const condoNome     = document.getElementById("gestao-condo-nome").value.trim();
  const condoUnidades = parseInt(document.getElementById("gestao-condo-unidades").value);
  const sindicoNome   = document.getElementById("gestao-sindico-nome").value.trim();
  const sindicoEmail  = document.getElementById("gestao-sindico-email").value.trim();
  const sindicoSenha  = document.getElementById("gestao-sindico-senha").value;

  // Limpa erros anteriores
  ["gestao-condo-nome", "gestao-condo-unidades", "gestao-sindico-nome", "gestao-sindico-email", "gestao-sindico-senha"]
    .forEach((id) => document.getElementById(`${id}-erro`).textContent = "");

  // Validação
  let valido = true;
  if (!condoNome) { document.getElementById("gestao-condo-nome-erro").textContent = "Campo obrigatório"; valido = false; }
  if (!condoUnidades || condoUnidades < 1) { document.getElementById("gestao-condo-unidades-erro").textContent = "Informe um número válido"; valido = false; }
  if (!sindicoNome) { document.getElementById("gestao-sindico-nome-erro").textContent = "Campo obrigatório"; valido = false; }
  if (!sindicoEmail || !sindicoEmail.includes("@")) { document.getElementById("gestao-sindico-email-erro").textContent = "E-mail inválido"; valido = false; }
  if (!sindicoSenha || sindicoSenha.length < 6) { document.getElementById("gestao-sindico-senha-erro").textContent = "Mínimo 6 caracteres"; valido = false; }
  if (!valido) return;

  setBtnLoading("gestao-btn", "gestao-btn-label", true, "PROCESSANDO…");
  try {
    // 1. Cria o condomínio
    const condo = await postAPI("/condominios", {
      nome: condoNome,
      quantidade_unidades: condoUnidades,
    });

    // 2. Cria o usuário síndico vinculado ao condomínio
    await postAPI("/usuarios", {
      nome: sindicoNome,
      email: sindicoEmail,
      senha: sindicoSenha,
      tipo: "SINDICO",
      condominio_id: condo.id,
    });

    exibirFeedback("gestao-feedback", `✔ Condomínio "${condo.nome}" e síndico criados com sucesso!`, "ok");

    // Limpa o formulário
    ["gestao-condo-nome", "gestao-condo-unidades", "gestao-sindico-nome", "gestao-sindico-email", "gestao-sindico-senha"]
      .forEach((id) => document.getElementById(id).value = "");

    // Recarrega a tabela e o seletor de condomínios
    await Promise.all([carregarGestao(), carregarUsuarios(), carregarCondominios()]);
  } catch (err) {
    const msg = err.message?.includes("400") ? "E-mail já cadastrado." : "Erro ao criar. Verifique os dados.";
    exibirFeedback("gestao-feedback", `⚠ ${msg}`, "erro");
    await Promise.all([carregarGestao(), carregarUsuarios()]);
  } finally {
    setBtnLoading("gestao-btn", "gestao-btn-label", false, "▶ CRIAR CONDOMÍNIO");
  }
}

// ── VINCULAR SÍNDICO A CONDOMÍNIO ─────────────────────────────

let _vincularCondoId = null;

async function abrirVincularSindico(condoId, condoNome) {
  _vincularCondoId = condoId;
  document.getElementById("vincular-condo-nome").textContent = escHTML(condoNome).toUpperCase();
  document.getElementById("vincular-sindico-feedback").textContent = "";

  const select = document.getElementById("vincular-sindico-select");
  select.innerHTML = `<option value="">Carregando...</option>`;
  document.getElementById("modal-vincular-sindico").style.display = "flex";

  try {
    const usuarios = await fetchAPI("/usuarios");
    const semVinculo = usuarios.filter(u => u.tipo === "SINDICO" && !u.condominio_id);
    if (!semVinculo.length) {
      select.innerHTML = `<option value="">Nenhum síndico disponível (sem condomínio)</option>`;
    } else {
      select.innerHTML = `<option value="">Selecione um síndico…</option>` +
        semVinculo.map(u => `<option value="${u.id}">${escHTML(u.nome)} — ${escHTML(u.email)}</option>`).join("");
    }
  } catch {
    select.innerHTML = `<option value="">Erro ao carregar usuários</option>`;
  }
}

function fecharVincularSindico() {
  document.getElementById("modal-vincular-sindico").style.display = "none";
  _vincularCondoId = null;
}

async function submitVincularSindico() {
  const select = document.getElementById("vincular-sindico-select");
  const fb = document.getElementById("vincular-sindico-feedback");
  const usuarioId = parseInt(select.value);
  if (!usuarioId) { fb.textContent = "⚠ Selecione um síndico."; return; }

  const btn = document.getElementById("vincular-sindico-btn");
  btn.disabled = true; btn.textContent = "VINCULANDO…";
  try {
    await putAPI(`/usuarios/${usuarioId}`, { condominio_id: _vincularCondoId });
    fecharVincularSindico();
    exibirToast("✔ Síndico vinculado com sucesso.");
    await carregarGestao();
    await carregarCondominios();
  } catch (err) {
    fb.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = "▶ VINCULAR";
  }
}

// ── QR CODE PORTAL ────────────────────────────────────────────

async function gerarQRPortal(moradorId) {
  try {
    const data = await fetchAPI(`/moradores/${moradorId}/portal-token`);
    if (!data) return;
    abrirModalQR(data.portal_url, data.morador_nome, data.apartamento);
  } catch (err) {
    exibirToast("Erro ao gerar QR: " + err.message, "erro");
  }
}

function abrirModalQR(url, nome, apto) {
  document.getElementById("modal-qr-nome").textContent = nome || "Morador";
  document.getElementById("modal-qr-apto").textContent = apto ? `APTO ${apto}` : "—";
  document.getElementById("modal-qr-url").value = url;

  const canvas = document.getElementById("modal-qr-canvas");
  canvas.innerHTML = "";

  if (typeof QRCode !== "undefined") {
    new QRCode(canvas, {
      text: url,
      width: 200,
      height: 200,
      colorDark: "#10B981",
      colorLight: "#030d0a",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } else {
    canvas.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:20px;">QR indisponível — copie a URL abaixo.</div>`;
  }

  document.getElementById("modal-qr-portal").style.display = "flex";
}

function fecharModalQR() {
  document.getElementById("modal-qr-portal").style.display = "none";
  document.getElementById("modal-qr-canvas").innerHTML = "";
}

async function copiarURLPortal() {
  const url = document.getElementById("modal-qr-url").value;
  const btn = document.getElementById("btn-copiar-qr");
  try { await navigator.clipboard.writeText(url); }
  catch { document.getElementById("modal-qr-url").select(); document.execCommand("copy"); }
  btn.textContent = "COPIADO ✓";
  btn.style.background = "var(--p1)";
  setTimeout(() => { btn.textContent = "COPIAR"; btn.style.background = "var(--p2)"; }, 2000);
}

// ── QR REGISTRO (auto-cadastro de moradores) ──────────────────

async function gerarQRRegistro() {
  if (!CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  try {
    const data = await fetchAPI(`/condominios/${CONDOMINIO_ID}/qr-registro`);
    abrirModalQRRegistro(data.registro_url, data.condo_nome);
  } catch (err) {
    exibirToast("Erro ao gerar QR de registro: " + err.message, "erro");
  }
}

function abrirModalQRRegistro(url, condoNome) {
  document.getElementById("modal-qr-reg-nome").textContent = escHTML(condoNome).toUpperCase();
  document.getElementById("modal-qr-reg-url").value = url;
  const canvas = document.getElementById("modal-qr-reg-canvas");
  canvas.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(canvas, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#06B6D4",
      colorLight: "#030d0a",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } else {
    canvas.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:20px;">QR indisponível — copie a URL abaixo.</div>`;
  }
  document.getElementById("modal-qr-registro").style.display = "flex";
}

function fecharModalQRRegistro() {
  document.getElementById("modal-qr-registro").style.display = "none";
  document.getElementById("modal-qr-reg-canvas").innerHTML = "";
}

async function copiarURLRegistro() {
  const url = document.getElementById("modal-qr-reg-url").value;
  const btn = document.getElementById("btn-copiar-qr-reg");
  try { await navigator.clipboard.writeText(url); }
  catch { document.getElementById("modal-qr-reg-url").select(); document.execCommand("copy"); }
  btn.textContent = "COPIADO ✓";
  btn.style.background = "var(--p1)";
  setTimeout(() => { btn.textContent = "COPIAR"; btn.style.background = "var(--p3)"; }, 2000);
}

// ── RECLAMAÇÕES (admin) ───────────────────────────────────────

const _REC_STATUS_LABEL = { ABERTA: "ABERTA", EM_ANALISE: "EM ANÁLISE", RESOLVIDA: "RESOLVIDA" };
const _REC_PRIO_LABEL   = { BAIXA: "BAIXA", MEDIA: "MÉDIA", ALTA: "ALTA" };

async function carregarReclacoesAdmin() {
  if (!CONDOMINIO_ID) return;
  try {
    const recs = await fetchAPI(`/reclamacoes?condominio_id=${CONDOMINIO_ID}`);
    if (!recs) return;

    const total     = recs.length;
    const abertas   = recs.filter(r => r.status === "ABERTA").length;
    const analise   = recs.filter(r => r.status === "EM_ANALISE").length;
    const resolvidas = recs.filter(r => r.status === "RESOLVIDA").length;

    const pad = n => String(n).padStart(2,"0");
    document.getElementById("rec-stat-total").textContent     = pad(total);
    document.getElementById("rec-stat-abertas").textContent   = pad(abertas + analise);
    document.getElementById("rec-stat-resolvidas").textContent = pad(resolvidas);
    document.getElementById("recl-count").textContent         = `${pad(total)} REGISTROS`;

    const container = document.getElementById("rec-admin-lista");
    if (!recs.length) {
      container.innerHTML = `<div class="empty-state" style="margin:20px"><div class="empty-state-icon">⬡</div>Nenhuma reclamação registrada.</div>`;
      return;
    }

    const statusColor = { ABERTA: "var(--cyan)", EM_ANALISE: "#FFA500", RESOLVIDA: "var(--green)" };
    const prioColor   = { BAIXA: "var(--p2)", MEDIA: "var(--cyan)", ALTA: "var(--red)" };

    container.innerHTML = recs.map((r, i) => `
      <div style="padding:18px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${i*.04}s;opacity:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <div>
            <span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-bright)">${escHTML(r.titulo)}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-left:10px">${escHTML(r.morador_nome||"—")} · Apto ${escHTML(r.morador_apto||"—")}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:4px;letter-spacing:1px;border:1px solid;color:${statusColor[r.status]||"var(--text)"};border-color:${statusColor[r.status]||"var(--border)"};">${_REC_STATUS_LABEL[r.status]||r.status}</span>
            <span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:4px;letter-spacing:1px;border:1px solid;color:${prioColor[r.prioridade]||"var(--text)"};border-color:${prioColor[r.prioridade]||"var(--border)"};">${_REC_PRIO_LABEL[r.prioridade]||r.prioridade}</span>
          </div>
        </div>
        <div style="font-family:Rajdhani,sans-serif;font-size:13px;color:var(--text);line-height:1.6;margin-bottom:10px">${escHTML(r.descricao)}</div>
        ${r.resposta ? `<div style="margin-bottom:10px;padding:8px 12px;background:rgba(16,185,129,.06);border-left:2px solid var(--p2);border-radius:4px"><div style="font-family:var(--font-mono);font-size:9px;color:var(--p3);letter-spacing:1px;margin-bottom:3px">// SUA RESPOSTA</div><div style="font-family:Rajdhani,sans-serif;font-size:13px;color:var(--lavender)">${escHTML(r.resposta)}</div></div>` : ""}
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">${new Date(r.criado_em).toLocaleString("pt-BR")}</span>
          <button onclick="abrirModalResposta(${r.id}, '${escHTML(r.titulo).replace(/'/g,"\\'")}', '${r.status}', '${escHTML(r.resposta||"").replace(/'/g,"\\'")}')"
            style="font-family:var(--font-mono);font-size:10px;padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(16,185,129,.4);background:transparent;color:var(--p2);transition:background .2s"
            onmouseover="this.style.background='rgba(16,185,129,.1)'" onmouseout="this.style.background='transparent'">
            ✎ RESPONDER / STATUS
          </button>
        </div>
      </div>`).join("");
  } catch (err) {
    console.error("Erro ao carregar reclamações:", err);
  }
}

function abrirModalResposta(id, titulo, status, resposta) {
  document.getElementById("modal-rec-id").value                = id;
  document.getElementById("modal-rec-titulo-display").textContent = titulo;
  document.getElementById("modal-rec-status").value           = status;
  document.getElementById("modal-rec-resposta").value         = resposta;
  document.getElementById("modal-rec-feedback").textContent   = "";
  document.getElementById("modal-rec-btn-label").textContent  = "▶ SALVAR";
  document.getElementById("modal-responder-rec").style.display = "flex";
}

function fecharModalResposta() {
  document.getElementById("modal-responder-rec").style.display = "none";
}

async function salvarRespostaRec() {
  const id       = document.getElementById("modal-rec-id").value;
  const status   = document.getElementById("modal-rec-status").value;
  const resposta = document.getElementById("modal-rec-resposta").value.trim();
  const fb       = document.getElementById("modal-rec-feedback");
  const lbl      = document.getElementById("modal-rec-btn-label");

  lbl.textContent = "SALVANDO…";
  fb.textContent  = "";
  fb.style.color  = "";

  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/reclamacoes/${id}`, {
      method: "PUT",
      headers: { "Content-Type":"application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, resposta: resposta || null }),
    });
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).detail || "Erro");
    fb.textContent = "✔ Salvo com sucesso!";
    fb.style.color = "var(--green)";
    setTimeout(fecharModalResposta, 900);
    await carregarReclacoesAdmin();
  } catch (err) {
    fb.textContent = "✖ " + err.message;
    fb.style.color = "var(--red)";
  } finally {
    lbl.textContent = "▶ SALVAR";
  }
}

iniciarAvisoToken();

// ════════════════════════════════════════════════════════════
//  ESPAÇOS & RESERVAS (admin)
// ════════════════════════════════════════════════════════════

let editandoEsp = null;

async function carregarEspacosAdmin() {
  if (!CONDOMINIO_ID) return;
  try {
    const espacos = await fetchAPI(`/espacos?condominio_id=${CONDOMINIO_ID}`);
    if (!espacos) return;
    const pad = n => String(n).padStart(2,"0");
    document.getElementById("esp-count").textContent = `${pad(espacos.length)} ESPAÇOS`;

    const tbody = document.getElementById("tabela-espacos");
    if (!espacos.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">⬡</div>Nenhum espaço cadastrado.</td></tr>`;
    } else {
      tbody.innerHTML = espacos.map((e,i) => `
        <tr style="opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${i*.04}s">
          <td>${escHTML(e.nome)}</td>
          <td>${escHTML(e.descricao||"—")}</td>
          <td class="text-right">${e.capacidade ? `${e.capacidade} pessoas` : "—"}</td>
          <td class="td-acoes">
            <button class="btn-linha btn-linha--editar" onclick="editarEspaco(${e.id})">✎ Editar</button>
            <button class="btn-linha btn-linha--deletar" onclick="deletarEspaco(${e.id},'${escHTML(e.nome)}')">✕ Excluir</button>
          </td>
        </tr>`).join("");
    }

    // Reservas
    const reservas = await fetchAPI(`/reservas?condominio_id=${CONDOMINIO_ID}`);
    if (!reservas) return;
    const pendentes = reservas.filter(r => r.status === "PENDENTE");
    document.getElementById("reservas-count").textContent = `${pad(pendentes.length)} PENDENTES`;

    const lista = document.getElementById("reservas-admin-lista");
    if (!reservas.length) {
      lista.innerHTML = `<div class="empty-state" style="margin:20px"><div class="empty-state-icon">⬡</div>Nenhuma reserva solicitada.</div>`;
      return;
    }
    const cor = { PENDENTE:"var(--cyan)", APROVADA:"var(--green)", REJEITADA:"var(--red)", CANCELADA:"var(--text-dim)" };
    lista.innerHTML = reservas.map((r,i) => `
      <div style="padding:16px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${i*.04}s;opacity:0">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
          <div>
            <span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-bright)">${escHTML(r.espaco_nome||"—")}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-left:10px">${escHTML(r.morador_nome||"—")} · Apto ${escHTML(r.morador_apto||"—")}</span>
          </div>
          <span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:4px;border:1px solid ${cor[r.status]};color:${cor[r.status]}">${r.status}</span>
        </div>
        <div style="font-family:Rajdhani,sans-serif;font-size:13px;color:var(--text)">${_formatDateBR(r.data)} · ${_labelPeriodoAdmin(r.periodo)}</div>
        ${r.observacao ? `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);margin-top:4px">${escHTML(r.observacao)}</div>` : ""}
        ${r.status==="PENDENTE" ? `
        <div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="responderReserva(${r.id},'APROVADA')" style="font-family:var(--font-mono);font-size:10px;padding:5px 14px;border-radius:4px;cursor:pointer;border:1px solid rgba(0,255,170,.4);background:transparent;color:var(--green)">✔ APROVAR</button>
          <button onclick="responderReserva(${r.id},'REJEITADA')" style="font-family:var(--font-mono);font-size:10px;padding:5px 14px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,68,102,.4);background:transparent;color:var(--red)">✕ REJEITAR</button>
        </div>` : ""}
      </div>`).join("");
  } catch(err) { console.error(err); }
}

function _formatDateBR(d) {
  if (!d) return "—";
  const [y,m,day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function _labelPeriodoAdmin(p) {
  return { MANHA:"Manhã (08h–12h)", TARDE:"Tarde (12h–18h)", NOITE:"Noite (18h–22h)", DIA_TODO:"Dia todo" }[p] || p;
}

async function responderReserva(id, status) {
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/reservas/${id}`, {
      method:"PUT",
      headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error();
    exibirToast(`✔ Reserva ${status === "APROVADA" ? "aprovada" : "rejeitada"}!`);
    await carregarEspacosAdmin();
  } catch { exibirToast("Erro ao atualizar reserva", "erro"); }
}

async function submitEspaco() {
  const nome       = document.getElementById("esp-nome").value.trim();
  const capacidade = document.getElementById("esp-capacidade").value;
  const descricao  = document.getElementById("esp-desc").value.trim();
  document.getElementById("esp-nome-erro").textContent = "";
  if (!nome) { document.getElementById("esp-nome-erro").textContent = "Informe o nome"; return; }

  setBtnLoading("esp-btn","esp-btn-label",true);
  try {
    const payload = { nome, descricao: descricao||null, capacidade: capacidade ? parseInt(capacidade) : null, condominio_id: CONDOMINIO_ID };
    if (editandoEsp) {
      await putAPI(`/espacos/${editandoEsp}`, payload);
      exibirToast("✔ Espaço atualizado!");
      editandoEsp = null;
    } else {
      await postAPI("/espacos", payload);
      exibirToast("✔ Espaço cadastrado!");
    }
    limparFormulario("esp-nome","esp-capacidade","esp-desc");
    await carregarEspacosAdmin();
  } catch(err) { exibirToast("✖ Erro: " + err.message,"erro"); }
  finally { setBtnLoading("esp-btn","esp-btn-label",false,"▶ EXECUTAR"); }
}

function editarEspaco(id) {
  fetchAPI(`/espacos?condominio_id=${CONDOMINIO_ID}`).then(lista => {
    const e = lista?.find(x => x.id === id);
    if (!e) return;
    editandoEsp = id;
    document.getElementById("esp-nome").value       = e.nome;
    document.getElementById("esp-capacidade").value = e.capacidade || "";
    document.getElementById("esp-desc").value       = e.descricao  || "";
    const body = document.getElementById("esp-form-body");
    body.classList.add("open");
    document.getElementById("esp-toggle-label").textContent = "✕ FECHAR";
    document.getElementById("esp-btn-label").textContent    = "▶ SALVAR EDIÇÃO";
    body.scrollIntoView({ behavior:"smooth", block:"start" });
  });
}

async function deletarEspaco(id, nome) {
  if (!confirmarExclusao(nome)) return;
  try {
    await deleteAPI(`/espacos/${id}`);
    exibirToast("✔ Espaço removido!");
    await carregarEspacosAdmin();
  } catch { exibirToast("✖ Erro ao remover espaço","erro"); }
}

// ════════════════════════════════════════════════════════════
//  VOTAÇÕES (admin)
// ════════════════════════════════════════════════════════════

function addOpcaoVotacao() {
  const wrap = document.getElementById("vot-opcoes-wrap");
  const n    = wrap.querySelectorAll(".vot-opcao").length + 1;
  const inp  = document.createElement("input");
  inp.className   = "field-input vot-opcao";
  inp.type        = "text";
  inp.placeholder = `Opção ${n}`;
  wrap.appendChild(inp);
}

async function carregarVotacoesAdmin() {
  if (!CONDOMINIO_ID) return;
  try {
    const votacoes = await fetchAPI(`/votacoes?condominio_id=${CONDOMINIO_ID}`);
    if (!votacoes) return;
    const pad = n => String(n).padStart(2,"0");
    document.getElementById("vot-count").textContent = `${pad(votacoes.length)} VOTAÇÕES`;
    const lista = document.getElementById("votacoes-admin-lista");
    if (!votacoes.length) {
      lista.innerHTML = `<div class="empty-state" style="margin:20px"><div class="empty-state-icon">⬡</div>Nenhuma votação criada.</div>`;
      return;
    }
    lista.innerHTML = votacoes.map((v,i) => {
      const total = v.total_votos || 0;
      const barras = v.opcoes.map((op, idx) => {
        const count = v.resultados?.[idx] || 0;
        const pct   = total > 0 ? Math.round(count/total*100) : 0;
        return `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">
            <span>${escHTML(op)}</span><span>${count} voto${count!==1?"s":""} (${pct}%)</span>
          </div>
          <div style="background:rgba(16,185,129,.12);border-radius:3px;height:8px;overflow:hidden;margin-top:3px">
            <div style="background:var(--p2);width:${pct}%;height:100%"></div>
          </div>
        </div>`;
      }).join("");
      return `<div style="padding:18px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${i*.04}s;opacity:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <div>
            <span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-bright)">${escHTML(v.titulo)}</span>
            ${v.descricao ? `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);margin-top:3px">${escHTML(v.descricao)}</div>` : ""}
          </div>
          <span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:4px;border:1px solid ${v.ativa?"rgba(0,229,255,.4)":"rgba(0,255,170,.3)"};color:${v.ativa?"var(--cyan)":"var(--green)"}">${v.ativa?"ATIVA":"ENCERRADA"}</span>
        </div>
        <div style="margin-bottom:12px">${barras}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">${total} voto${total!==1?"s":""} · Criada ${new Date(v.criado_em).toLocaleDateString("pt-BR")}</span>
          <div style="display:flex;gap:8px">
            ${v.ativa ? `<button onclick="encerrarVotacao(${v.id})" style="font-family:var(--font-mono);font-size:10px;padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,165,0,.4);background:transparent;color:#FFA500">⏹ ENCERRAR</button>` : ""}
            <button onclick="deletarVotacao(${v.id})" style="font-family:var(--font-mono);font-size:10px;padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,68,102,.4);background:transparent;color:var(--red)">✕ EXCLUIR</button>
          </div>
        </div>
      </div>`;
    }).join("");
  } catch(err) { console.error(err); }
}

async function submitVotacao() {
  const titulo = document.getElementById("vot-titulo").value.trim();
  const desc   = document.getElementById("vot-desc").value.trim();
  const opcoes = [...document.querySelectorAll(".vot-opcao")].map(i => i.value.trim()).filter(Boolean);
  const enc    = document.getElementById("vot-encerramento").value;

  document.getElementById("vot-titulo-erro").textContent  = "";
  document.getElementById("vot-opcoes-erro").textContent  = "";
  let ok = true;
  if (!titulo)        { document.getElementById("vot-titulo-erro").textContent = "Informe o título"; ok = false; }
  if (opcoes.length < 2) { document.getElementById("vot-opcoes-erro").textContent = "Adicione pelo menos 2 opções"; ok = false; }
  if (!ok) return;

  setBtnLoading("vot-btn","vot-btn-label",true,"▶ PUBLICAR");
  try {
    await postAPI("/votacoes", {
      titulo, descricao: desc||null, opcoes,
      condominio_id: CONDOMINIO_ID,
      encerrada_em: enc ? new Date(enc).toISOString() : null,
    });
    exibirToast("✔ Votação criada!");
    limparFormulario("vot-titulo","vot-desc","vot-encerramento");
    document.getElementById("vot-opcoes-wrap").innerHTML =
      `<input class="field-input vot-opcao" type="text" placeholder="Opção 1">
       <input class="field-input vot-opcao" type="text" placeholder="Opção 2">`;
    await carregarVotacoesAdmin();
  } catch(err) { exibirToast("✖ " + err.message,"erro"); }
  finally { setBtnLoading("vot-btn","vot-btn-label",false,"▶ PUBLICAR"); }
}

async function encerrarVotacao(id) {
  if (!confirm("Encerrar esta votação? Moradores não poderão mais votar.")) return;
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/votacoes/${id}/encerrar`, {
      method:"PUT", headers:{ Authorization:`Bearer ${token}` }
    });
    if (!res.ok) throw new Error();
    exibirToast("✔ Votação encerrada!");
    await carregarVotacoesAdmin();
  } catch { exibirToast("✖ Erro ao encerrar","erro"); }
}

async function deletarVotacao(id) {
  if (!confirmarExclusao("esta votação")) return;
  try {
    await deleteAPI(`/votacoes/${id}`);
    exibirToast("✔ Votação excluída!");
    await carregarVotacoesAdmin();
  } catch { exibirToast("✖ Erro ao excluir","erro"); }
}

// ════════════════════════════════════════════════════════════
//  DOCUMENTOS (admin)
// ════════════════════════════════════════════════════════════

async function carregarDocumentosAdmin() {
  if (!CONDOMINIO_ID) return;
  try {
    const docs = await fetchAPI(`/documentos?condominio_id=${CONDOMINIO_ID}`);
    if (!docs) return;
    const pad = n => String(n).padStart(2,"0");
    document.getElementById("doc-count").textContent = `${pad(docs.length)} ARQUIVOS`;
    const lista = document.getElementById("documentos-admin-lista");
    if (!docs.length) {
      lista.innerHTML = `<div class="empty-state" style="margin:20px"><div class="empty-state-icon">⬡</div>Nenhum documento publicado.</div>`;
      return;
    }
    const icone = (m) => !m?"📄":m.includes("pdf")?"📕":m.includes("image")?"🖼️":m.includes("sheet")||m.includes("excel")?"📊":m.includes("word")?"📝":"📄";
    const tam   = b => b > 1048576 ? `${(b/1048576).toFixed(1)} MB` : `${Math.round(b/1024)} KB`;
    lista.innerHTML = docs.map((d,i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${i*.04}s;opacity:0;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:12px;flex:1">
          <span style="font-size:24px">${icone(d.mime_type)}</span>
          <div>
            <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-bright)">${escHTML(d.nome)}</div>
            ${d.descricao ? `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim)">${escHTML(d.descricao)}</div>` : ""}
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">${escHTML(d.nome_original)} · ${tam(d.tamanho_bytes)} · ${new Date(d.criado_em).toLocaleDateString("pt-BR")}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="baixarDocAdmin(${d.id})" style="font-family:var(--font-mono);font-size:10px;padding:6px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(16,185,129,.4);background:transparent;color:var(--p2)">↓ BAIXAR</button>
          <button onclick="deletarDocumento(${d.id},'${escHTML(d.nome)}')" style="font-family:var(--font-mono);font-size:10px;padding:6px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,68,102,.4);background:transparent;color:var(--red)">✕ EXCLUIR</button>
        </div>
      </div>`).join("");
  } catch(err) { console.error(err); }
}

async function submitDocumento() {
  const nome    = document.getElementById("doc-nome").value.trim();
  const desc    = document.getElementById("doc-desc").value.trim();
  const arquivo = document.getElementById("doc-arquivo").files[0];
  document.getElementById("doc-nome-erro").textContent   = "";
  document.getElementById("doc-arquivo-erro").textContent = "";
  let ok = true;
  if (!nome)    { document.getElementById("doc-nome-erro").textContent   = "Informe o nome";    ok = false; }
  if (!arquivo) { document.getElementById("doc-arquivo-erro").textContent = "Selecione um arquivo"; ok = false; }
  if (!ok) return;

  setBtnLoading("doc-btn","doc-btn-label",true,"▶ ENVIANDO…");
  try {
    const token = getToken();
    const form  = new FormData();
    form.append("condominio_id", CONDOMINIO_ID);
    form.append("nome", nome);
    form.append("descricao", desc);
    form.append("arquivo", arquivo);
    const res = await fetch(`${API_BASE}/documentos`, {
      method:"POST", headers:{ Authorization:`Bearer ${token}` }, body: form
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      throw new Error(e.detail || "Erro ao enviar arquivo");
    }
    exibirToast("✔ Documento publicado!");
    limparFormulario("doc-nome","doc-desc");
    document.getElementById("doc-arquivo").value = "";
    exibirFeedback("doc-feedback","✔ Publicado com sucesso!","ok");
    await carregarDocumentosAdmin();
  } catch(err) {
    exibirFeedback("doc-feedback","✖ " + err.message,"erro");
  } finally {
    setBtnLoading("doc-btn","doc-btn-label",false,"▶ ENVIAR");
  }
}

async function baixarDocAdmin(docId) {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}/documentos/${docId}/download`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const cd   = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const nome  = match ? match[1].replace(/['"]/g,"") : `doc_${docId}`;
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { exibirToast("✖ Erro ao baixar","erro"); }
}

async function deletarDocumento(id, nome) {
  if (!confirmarExclusao(nome)) return;
  try {
    await deleteAPI(`/documentos/${id}`);
    exibirToast("✔ Documento excluído!");
    await carregarDocumentosAdmin();
  } catch { exibirToast("✖ Erro ao excluir","erro"); }
}

// ── MANUTENÇÕES ───────────────────────────────────────────────

const _MAN_CAT_ICON = { ELEVADOR:"🛗", PISCINA:"🏊", GERADOR:"⚡", HIDRAULICA:"🔧", ELETRICA:"💡", LIMPEZA:"🧹", JARDINAGEM:"🌿", OUTRO:"🔨" };
const _MAN_STATUS_COL = { AGENDADA:"var(--cyan)", EM_ANDAMENTO:"#FFA500", CONCLUIDA:"var(--green)", CANCELADA:"var(--text-dim)" };
const _MAN_STATUS_LBL = { AGENDADA:"AGENDADA", EM_ANDAMENTO:"EM ANDAMENTO", CONCLUIDA:"CONCLUÍDA", CANCELADA:"CANCELADA" };

async function carregarManutencoesAdmin() {
  if (!CONDOMINIO_ID) return;
  const container = document.getElementById("manutencoes-admin-lista");
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><span class="blink">█</span> CARREGANDO…</div>`;
  try {
    const items = await fetchAPI(`/manutencoes?condominio_id=${CONDOMINIO_ID}`);
    if (!items.length) {
      container.innerHTML = `<div class="empty-state">Nenhuma manutenção agendada.</div>`;
      return;
    }
    container.innerHTML = items.map(m => {
      const dtI = new Date(m.data_inicio).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
      const dtF = m.data_fim ? new Date(m.data_fim).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}) : null;
      const cor = _MAN_STATUS_COL[m.status] || "var(--text)";
      return `<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:22px">${_MAN_CAT_ICON[m.categoria]||"🔨"}</span>
        <div style="flex:1;min-width:180px">
          <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-bright)">${escHTML(m.titulo)}</div>
          ${m.impacto ? `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);margin-top:2px">${escHTML(m.impacto)}</div>` : ""}
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px">
            ${dtI}${dtF?` → ${dtF}`:""} · ${escHTML(m.categoria)}
            ${m.notificado ? ' · <span style="color:var(--green)">✔ moradores notificados</span>' : ""}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-family:var(--font-mono);font-size:10px;padding:4px 10px;border-radius:4px;letter-spacing:1px;color:${cor};border:1px solid ${cor}40;background:${cor}12">${_MAN_STATUS_LBL[m.status]||m.status}</span>
          <select onchange="atualizarStatusManutencao(${m.id},this.value)"
                  style="font-family:var(--font-mono);font-size:10px;padding:4px 8px;background:rgba(3,18,12,.8);border:1px solid var(--border);border-radius:4px;color:var(--text);cursor:pointer">
            <option value="">Alterar status…</option>
            <option value="AGENDADA">AGENDADA</option>
            <option value="EM_ANDAMENTO">EM ANDAMENTO</option>
            <option value="CONCLUIDA">CONCLUÍDA</option>
            <option value="CANCELADA">CANCELADA</option>
          </select>
          <button class="btn-linha btn-linha--deletar" title="Excluir" onclick="deletarManutencao(${m.id},'${escHTML(m.titulo).replace(/'/g,"\\'")}')">✕</button>
        </div>
      </div>`;
    }).join("");
  } catch { container.innerHTML = `<div class="empty-state">Erro ao carregar manutenções.</div>`; }
}

async function submitManutencao() {
  const titulo     = document.getElementById("man-titulo")?.value.trim();
  const categoria  = document.getElementById("man-categoria")?.value;
  const dataInicio = document.getElementById("man-data-inicio")?.value;
  const dataFim    = document.getElementById("man-data-fim")?.value;
  const impacto    = document.getElementById("man-impacto")?.value.trim();
  const descricao  = document.getElementById("man-descricao")?.value.trim();

  document.getElementById("man-titulo-erro").textContent      = "";
  document.getElementById("man-data-inicio-erro").textContent = "";
  let ok = true;
  if (!titulo)     { document.getElementById("man-titulo-erro").textContent      = "Informe o título";     ok = false; }
  if (!dataInicio) { document.getElementById("man-data-inicio-erro").textContent = "Informe a data/hora"; ok = false; }
  if (!ok) return;

  setBtnLoading("man-btn","man-btn-label",true,"AGENDANDO…");
  try {
    await postAPI("/manutencoes", {
      titulo, categoria, condominio_id: CONDOMINIO_ID,
      data_inicio: dataInicio,
      data_fim:    dataFim    || null,
      impacto:     impacto    || null,
      descricao:   descricao  || null,
    });
    exibirFeedback("man-feedback","✔ Manutenção agendada e moradores notificados!","ok");
    document.getElementById("man-titulo").value      = "";
    document.getElementById("man-data-inicio").value = "";
    document.getElementById("man-data-fim").value    = "";
    document.getElementById("man-impacto").value     = "";
    document.getElementById("man-descricao").value   = "";
    await carregarManutencoesAdmin();
  } catch(err) {
    exibirFeedback("man-feedback","✖ " + err.message,"erro");
  } finally {
    setBtnLoading("man-btn","man-btn-label",false,"▶ AGENDAR");
  }
}

async function atualizarStatusManutencao(id, status) {
  if (!status) return;
  try {
    await putAPI(`/manutencoes/${id}`, { status });
    exibirToast("✔ Status atualizado!");
    await carregarManutencoesAdmin();
  } catch { exibirToast("✖ Erro ao atualizar","erro"); }
}

async function deletarManutencao(id, titulo) {
  if (!confirmarExclusao(titulo)) return;
  try {
    await deleteAPI(`/manutencoes/${id}`);
    exibirToast("✔ Manutenção excluída!");
    await carregarManutencoesAdmin();
  } catch { exibirToast("✖ Erro ao excluir","erro"); }
}

// ── MENSAGENS / CHAT ADMIN ────────────────────────────────────

let _conversaAtivaMoradorId   = null;
let _conversaAtivaMoradorNome = null;
let _adminChatPolling         = null;

async function carregarConversasAdmin() {
  if (!CONDOMINIO_ID) return;
  const container = document.getElementById("conversas-lista");
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><span class="blink">█</span> CARREGANDO…</div>`;
  try {
    const convs = await fetchAPI(`/chat/conversas?condominio_id=${CONDOMINIO_ID}`);

    // Atualiza badge na nav
    const totalNaoLidas = convs.reduce((s, c) => s + (c.nao_lidas || 0), 0);
    const navItem = document.querySelector('[data-section="mensagens"]');
    let badge = navItem?.querySelector(".nav-badge");
    if (totalNaoLidas > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "nav-badge";
        badge.style.cssText = "background:var(--red);color:#fff;font-size:9px;border-radius:8px;padding:1px 5px;margin-left:4px;font-family:var(--font-mono)";
        navItem?.appendChild(badge);
      }
      badge.textContent = totalNaoLidas;
    } else if (badge) { badge.remove(); }

    if (!convs.length) {
      container.innerHTML = `<div class="empty-state">Nenhuma conversa ainda.</div>`;
      return;
    }
    container.innerHTML = convs.map(c => {
      const ativo = c.morador_id === _conversaAtivaMoradorId;
      const preview = c.ultima_msg ? (c.ultima_msg.length > 45 ? c.ultima_msg.slice(0,45) + "…" : c.ultima_msg) : "";
      const hora    = c.ultima_msg_em ? new Date(c.ultima_msg_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";
      return `<div onclick="abrirConversa(${c.morador_id},'${escHTML(c.morador_nome||"Morador").replace(/'/g,"\\'")}',true)"
                   style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s;${ativo?"background:rgba(16,185,129,.08);":""}display:flex;flex-direction:column;gap:4px"
                   onmouseover="this.style.background='rgba(16,185,129,.06)'" onmouseout="this.style.background='${ativo?"rgba(16,185,129,.08)":"transparent"}'">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <span style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-bright)">${escHTML(c.morador_nome||"Morador")}</span>
          <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);white-space:nowrap">${hora}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <span style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);flex:1">${escHTML(preview)}</span>
          ${c.nao_lidas > 0 ? `<span style="background:var(--red);color:#fff;font-size:9px;border-radius:8px;padding:1px 6px;font-family:var(--font-mono);white-space:nowrap">${c.nao_lidas}</span>` : ""}
        </div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">APTO ${escHTML(c.morador_apto||"—")}</div>
      </div>`;
    }).join("");
  } catch { container.innerHTML = `<div class="empty-state">Erro ao carregar conversas.</div>`; }
}

async function abrirConversa(moradorId, moradorNome, recarregarLista = false) {
  _conversaAtivaMoradorId   = moradorId;
  _conversaAtivaMoradorNome = moradorNome;

  const titulo = document.getElementById("chat-thread-titulo");
  if (titulo) titulo.textContent = moradorNome || "Morador";

  const inputRow = document.getElementById("chat-thread-input-row");
  if (inputRow) inputRow.style.display = "flex";

  document.getElementById("chat-admin-input")?.focus();

  if (recarregarLista) await carregarConversasAdmin();
  await carregarThreadAdmin(moradorId);

  if (_adminChatPolling) clearInterval(_adminChatPolling);
  _adminChatPolling = setInterval(() => carregarThreadAdmin(moradorId, true), 5000);
}

async function carregarThreadAdmin(moradorId, silencioso = false) {
  if (!CONDOMINIO_ID || !moradorId) return;
  const area = document.getElementById("chat-thread-area");
  if (!area) return;
  if (!silencioso) {
    area.innerHTML = `<div class="empty-state" style="margin:auto"><span class="blink">█</span> CARREGANDO…</div>`;
  }
  try {
    const msgs = await fetchAPI(`/chat/mensagens?condominio_id=${CONDOMINIO_ID}&morador_id=${moradorId}`);

    const prevCount = parseInt(area.dataset.count || "-1");
    if (silencioso && msgs.length === prevCount) return;
    area.dataset.count = msgs.length;

    if (!msgs.length) {
      area.innerHTML = `<div class="empty-state" style="margin:auto"><div>💬</div>Nenhuma mensagem ainda.</div>`;
      return;
    }
    area.innerHTML = "";
    msgs.forEach(m => {
      const isMe = m.autor_tipo === "SINDICO";
      const div  = document.createElement("div");
      div.style.cssText = `display:flex;gap:10px;${isMe?"flex-direction:row-reverse":""}`;
      const avatar = document.createElement("div");
      avatar.style.cssText = "width:32px;height:32px;min-width:32px;display:flex;align-items:center;justify-content:center;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.35);border-radius:8px;font-size:.9rem;flex-shrink:0;margin-top:2px";
      avatar.textContent = isMe ? "🏢" : "👤";
      const bubble = document.createElement("div");
      bubble.style.cssText = `max-width:75%;padding:.75rem 1rem;border-radius:10px;font-family:Rajdhani,sans-serif;font-size:.95rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;${isMe?"background:rgba(6,182,212,.12);border:1px solid rgba(6,182,212,.30);color:var(--text);border-bottom-right-radius:3px":"background:rgba(3,18,12,.90);border:1px solid rgba(16,185,129,.20);color:var(--lavender);border-bottom-left-radius:3px"}`;
      bubble.textContent = m.conteudo;
      const ts = document.createElement("div");
      ts.style.cssText = "font-size:9px;opacity:.5;margin-top:4px;font-family:var(--font-mono)";
      ts.textContent = new Date(m.criado_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      bubble.appendChild(ts);
      div.append(avatar, bubble);
      area.appendChild(div);
    });
    area.scrollTop = area.scrollHeight;

    if (silencioso) await carregarConversasAdmin();
  } catch {
    if (!silencioso) area.innerHTML = `<div class="empty-state" style="margin:auto">Erro ao carregar mensagens.</div>`;
  }
}

async function enviarMsgAdmin() {
  const input = document.getElementById("chat-admin-input");
  const texto = input?.value.trim();
  if (!texto || !CONDOMINIO_ID || !_conversaAtivaMoradorId) return;

  const orig  = input.value;
  input.value = "";
  try {
    await postAPI("/chat/mensagens", {
      conteudo: texto,
      condominio_id: CONDOMINIO_ID,
      morador_id: _conversaAtivaMoradorId,
    });
    await carregarThreadAdmin(_conversaAtivaMoradorId);
  } catch {
    input.value = orig;
    exibirToast("✖ Erro ao enviar mensagem","erro");
  }
}