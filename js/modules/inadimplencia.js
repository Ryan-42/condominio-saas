import { state, _PREFERS_NO_MOTION } from "../core/state.js";
import { getToken, fetchAPI, postAPI, putAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { formatarMoeda, pad, dataHoje, validarCampo } from "../ui/utils.js";
import { exibirToast, exibirFeedback, setBtnLoading } from "../ui/notifications.js";

export const MESES_NOMES = [
  "","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO",
  "JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"
];
export const MESES_CURTOS = [
  "","Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez"
];

export function preencherFiltrosMesAno() {
  const selMes = document.getElementById("inad-filtro-mes");
  const selAno = document.getElementById("inad-filtro-ano");
  if (!selMes || selMes.options.length > 0) return;

  const hoje = new Date();
  selMes.innerHTML = MESES_NOMES.slice(1).map((m, i) =>
    `<option value="${i+1}" ${i+1 === hoje.getMonth()+1 ? "selected" : ""}>${m}</option>`
  ).join("");

  selAno.innerHTML = "";
  for (let y = hoje.getFullYear(); y >= hoje.getFullYear() - 3; y--) {
    selAno.innerHTML += `<option value="${y}" ${y === hoje.getFullYear() ? "selected" : ""}>${y}</option>`;
  }
}

export async function carregarInadimplencia() {
  preencherFiltrosMesAno();
  await Promise.all([carregarTaxa(), carregarInadimplentes(), carregarPagamentos()]);
}

export async function carregarTaxa() {
  if (!state.CONDOMINIO_ID) return;
  try {
    const taxa = await fetchAPI(`/taxa/${state.CONDOMINIO_ID}`);
    if (!taxa) return;
    document.getElementById("inad-taxa-valor").value = taxa.valor ?? "";
    document.getElementById("inad-stat-taxa").textContent = formatarMoeda(taxa.valor);
  } catch (_) {
    document.getElementById("inad-stat-taxa").textContent = "NÃO CONFIGURADA";
  }
}

export async function salvarTaxa() {
  const valorEl = document.getElementById("inad-taxa-valor");
  const valor   = parseFloat(valorEl.value);
  const valido  = validarCampo("inad-taxa-valor", (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Informe um valor maior que zero");
  if (!valido) return;

  setBtnLoading("inad-btn-taxa", "inad-btn-taxa-label", true, "▶ SALVAR TAXA");
  try {
    await postAPI(`/taxa/${state.CONDOMINIO_ID}`, { valor });
    exibirToast("✔ Taxa salva com sucesso!");
    document.getElementById("inad-stat-taxa").textContent = formatarMoeda(valor);
    exibirFeedback("inad-feedback", `✔ Taxa de ${formatarMoeda(valor)}/mês configurada`, "ok");
  } catch (err) {
    exibirToast(`✖ Erro ao salvar taxa: ${err.message}`, "erro");
  } finally {
    setBtnLoading("inad-btn-taxa", "inad-btn-taxa-label", false, "▶ SALVAR TAXA");
  }
}

export async function gerarPagamentos() {
  if (!confirm("Gerar cobranças dos últimos 3 meses para todos os moradores?\n\nRegistros existentes não serão duplicados.")) return;
  setBtnLoading("inad-btn-gerar", "inad-btn-gerar-label", true, "⚡ GERAR COBRANÇAS (3 MESES)");
  try {
    const res = await postAPI(`/pagamentos/gerar/${state.CONDOMINIO_ID}`, {});
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

export async function carregarPagamentos() {
  const mes   = document.getElementById("inad-filtro-mes")?.value || new Date().getMonth() + 1;
  const ano   = document.getElementById("inad-filtro-ano")?.value || new Date().getFullYear();
  const tbody = document.getElementById("tabela-pagamentos");
  if (!tbody || !state.CONDOMINIO_ID) return;

  tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><span class="blink">█</span> CARREGANDO...</td></tr>`;

  try {
    const lista = await fetchAPI(`/pagamentos/${state.CONDOMINIO_ID}?mes=${mes}&ano=${ano}`);
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
      const pagAnim     = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s`;
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

export async function togglePagamento(pagamentoId, novoPago, btn) {
  const hoje = dataHoje();
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await putAPI(`/pagamentos/${pagamentoId}`, {
      pago: novoPago,
      data_pagamento: novoPago ? hoje : null,
    });
    exibirToast(novoPago ? "✔ Marcado como pago!" : "✔ Marcado como pendente");
    await Promise.all([carregarPagamentos(), carregarInadimplentes(), window.carregarBalanco?.()]);
  } catch (err) {
    exibirToast(`✖ Erro ao atualizar: ${err.message}`, "erro");
    if (btn) { btn.disabled = false; btn.textContent = novoPago ? "✔ Pagar" : "↩ Reverter"; }
  }
}

export async function carregarInadimplentes() {
  if (!state.CONDOMINIO_ID) return;
  try {
    const lista = await fetchAPI(`/inadimplentes/${state.CONDOMINIO_ID}`);
    if (!lista) return;
    const totalValor = lista.reduce((acc, i) => acc + i.valor_total, 0);
    document.getElementById("inad-stat-total").textContent = lista.length;
    document.getElementById("inad-stat-valor").textContent = formatarMoeda(totalValor);
    const statTotal = document.getElementById("inad-stat-total");
    statTotal.classList.toggle("negativo", lista.length > 0);
  } catch (_) {}
}

export async function baixarRelatorioPDF() {
  const mes = document.getElementById("inad-filtro-mes")?.value || new Date().getMonth() + 1;
  const ano = document.getElementById("inad-filtro-ano")?.value || new Date().getFullYear();
  const btn = document.getElementById("inad-btn-pdf");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ GERANDO…"; }

  try {
    const token = getToken();
    if (!token) return;
    const resp = await fetch(
      `${API_BASE}/relatorio-pdf/${state.CONDOMINIO_ID}?mes=${mes}&ano=${ano}`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const contentType = resp.headers.get("content-type") || "";
    if (!resp.ok || !contentType.includes("application/pdf")) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${resp.status} ao gerar PDF`);
    }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `relatorio_condo${state.CONDOMINIO_ID}_${pad(mes)}_${ano}.pdf`;
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
