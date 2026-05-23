import { state, _PREFERS_NO_MOTION } from "../core/state.js";
import { getToken, fetchAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { formatarMoeda, formatarData, dataHoje, renderRows, renderBars, animateValue } from "../ui/utils.js";
import { exibirToast } from "../ui/notifications.js";

export async function carregarBalanco() {
  if (!state.CONDOMINIO_ID) return;
  try {
    const data = await fetchAPI(`/financeiro/${state.CONDOMINIO_ID}`);
    if (!data) return;
    animateValue(document.getElementById("total-receitas"), data.total_receitas);
    animateValue(document.getElementById("total-despesas"), data.total_despesas);
    const saldoEl = document.getElementById("saldo");
    saldoEl.classList.remove("negativo");
    animateValue(saldoEl, Math.abs(data.saldo));
    if (data.saldo < 0) saldoEl.classList.add("negativo");
  } catch (err) { console.error("carregarBalanco:", err); }
}

export async function carregarDashboardDespesas() {
  if (!state.CONDOMINIO_ID) return;
  const todas = await fetchAPI("/despesas");
  if (!todas) return;
  const _u = window.getUsuario?.();
  const despesas = (_u && _u.tipo === "ADMIN")
    ? todas.filter((d) => d.condominio_id === state.CONDOMINIO_ID)
    : todas;
  document.getElementById("dash-despesas-count").textContent = `${String(despesas.length).padStart(2,"0")} ENTRADAS`;
  despesas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  renderRows("dash-tabela-despesas", despesas.slice(0, 8).map((d) =>
    `<td>${escHTML(d.descricao)}</td><td class="td-data">${formatarData(d.data)}</td><td class="td-valor">${formatarMoeda(d.valor)}</td>`
  ), 3, "Nenhuma despesa registrada.", "Adicione despesas na seção Despesas.");
}

export async function carregarResumoMensal() {
  const data = await fetchAPI(`/despesas/mensal/resumo/${state.CONDOMINIO_ID}`);
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
    const mensalAnim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.07, 0.4)}s`;
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

export async function carregarInsights() {
  const loading = document.getElementById("insights-loading");
  const content = document.getElementById("insights-content");
  const badge   = document.getElementById("insights-badge");
  if (loading) loading.style.display = "block";
  if (content) content.style.display = "none";
  try {
    const data = await fetchAPI(`/insights/${state.CONDOMINIO_ID}`);
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

export const HANDLERS_ACAO = {
  ver_despesas:      () => window.navigateTo?.("despesas"),
  ver_receitas:      () => window.navigateTo?.("receitas"),
  exportar_relatorio: () => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE}/relatorio/${state.CONDOMINIO_ID}`, {
      headers: { "Authorization": `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        a.href    = url;
        a.download = `relatorio_condo_${state.CONDOMINIO_ID}_${dataHoje()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        exibirToast("✔ Relatório exportado com sucesso!");
      })
      .catch(() => exibirToast("✖ Erro ao exportar relatório", "erro"));
  },
  notificar_sindico: () => {
    exibirToast("✉ Notificação enviada ao síndico (simulação)");
  },
};

export function executarAcao(handler) {
  const fn = HANDLERS_ACAO[handler];
  if (fn) fn();
}

export function renderBotoesAcao(acoes) {
  if (!acoes || !acoes.length) return "";
  return `
    <div class="insight-acoes">
      ${acoes.map((a) => `
        <button class="btn-acao btn-acao--${a.tipo}" onclick="executarAcao('${a.handler}')">
          ${a.label}
        </button>`).join("")}
    </div>`;
}

export function renderAlertas(alertas) {
  const container = document.getElementById("insights-alertas");
  if (!container) return;
  if (!alertas.length) {
    container.innerHTML = `<span class="insights-vazio">✅ NENHUM ALERTA</span>`;
    return;
  }
  container.innerHTML = alertas.map((a, i) => `
    <div class="insight-item ${(a.nivel || "info")}" style="animation-delay:${Math.min(i * 0.08, 0.4)}s">
      <div class="insight-body">
        <span class="insight-icone">${escHTML(a.icone || "•")}</span>
        <span>${escHTML(a.mensagem)}</span>
      </div>
      ${renderBotoesAcao(a.acoes)}
    </div>`
  ).join("");
}

export function renderResumo(resumo) {
  const container = document.getElementById("insights-resumo");
  if (!container) return;
  if (!resumo.length) {
    container.innerHTML = `<span class="insights-vazio">SEM DADOS SUFICIENTES</span>`;
    return;
  }
  container.innerHTML = resumo.map((r, i) => `
    <div class="resumo-item" style="animation-delay:${Math.min(i * 0.08, 0.4)}s">
      <span class="resumo-titulo">${escHTML(r.titulo).toUpperCase()}</span>
      <span class="resumo-valor">${escHTML(String(r.valor))}</span>
    </div>`
  ).join("");
}

export function renderSugestoes(sugestoes) {
  const container = document.getElementById("insights-sugestoes");
  if (!container) return;
  if (!sugestoes.length) {
    container.innerHTML = `<span class="insights-vazio">SEM SUGESTÕES</span>`;
    return;
  }
  container.innerHTML = sugestoes.map((s, i) => `
    <div class="sugestao-item" style="animation-delay:${Math.min(i * 0.08, 0.4)}s">${escHTML(s)}</div>`
  ).join("");
}

export async function carregarDashboard() {
  try {
    await Promise.all([
      carregarBalanco(),
      carregarDashboardDespesas(),
      carregarResumoMensal(),
      carregarInsights(),
    ]);
    window.atualizarOnboarding?.();
  } catch (err) { console.error(err); }
}
