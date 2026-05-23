import { state } from "../core/state.js";
import { fetchAPI, postAPI, putAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { exibirToast, exibirFeedback, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

const _MAN_CAT_ICON    = { ELEVADOR: "🛗", PISCINA: "🏊", GERADOR: "⚡", HIDRAULICA: "🔧", ELETRICA: "💡", LIMPEZA: "🧹", JARDINAGEM: "🌿", OUTRO: "🔨" };
const _MAN_STATUS_COL  = { AGENDADA: "var(--cyan)", EM_ANDAMENTO: "#FFA500", CONCLUIDA: "var(--green)", CANCELADA: "var(--text-dim)" };
const _MAN_STATUS_LBL  = { AGENDADA: "AGENDADA", EM_ANDAMENTO: "EM ANDAMENTO", CONCLUIDA: "CONCLUÍDA", CANCELADA: "CANCELADA" };

export async function carregarManutencoesAdmin() {
  if (!state.CONDOMINIO_ID) return;
  const container = document.getElementById("manutencoes-admin-lista");
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><span class="blink">█</span> CARREGANDO…</div>`;
  try {
    const items = await fetchAPI(`/manutencoes?condominio_id=${state.CONDOMINIO_ID}`);
    if (!items.length) {
      container.innerHTML = `<div class="empty-state">Nenhuma manutenção agendada.</div>`;
      return;
    }
    container.innerHTML = items.map((m) => {
      const dtI = new Date(m.data_inicio).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      const dtF = m.data_fim ? new Date(m.data_fim).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
      const cor = _MAN_STATUS_COL[m.status] || "var(--text)";
      return `<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:22px">${_MAN_CAT_ICON[m.categoria] || "🔨"}</span>
        <div style="flex:1;min-width:180px">
          <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-bright)">${escHTML(m.titulo)}</div>
          ${m.impacto ? `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);margin-top:2px">${escHTML(m.impacto)}</div>` : ""}
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px">
            ${dtI}${dtF ? ` → ${dtF}` : ""} · ${escHTML(m.categoria)}
            ${m.notificado ? ' · <span style="color:var(--green)">✔ moradores notificados</span>' : ""}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-family:var(--font-mono);font-size:10px;padding:4px 10px;border-radius:4px;letter-spacing:1px;color:${cor};border:1px solid ${cor}40;background:${cor}12">${_MAN_STATUS_LBL[m.status] || m.status}</span>
          <select onchange="atualizarStatusManutencao(${m.id},this.value)"
                  style="font-family:var(--font-mono);font-size:10px;padding:4px 8px;background:rgba(3,18,12,.8);border:1px solid var(--border);border-radius:4px;color:var(--text);cursor:pointer">
            <option value="">Alterar status…</option>
            <option value="AGENDADA">AGENDADA</option>
            <option value="EM_ANDAMENTO">EM ANDAMENTO</option>
            <option value="CONCLUIDA">CONCLUÍDA</option>
            <option value="CANCELADA">CANCELADA</option>
          </select>
          <button class="btn-linha btn-linha--deletar" title="Excluir" onclick="deletarManutencao(${m.id},'${escHTML(m.titulo).replace(/'/g, "\\'")}')">✕</button>
        </div>
      </div>`;
    }).join("");
  } catch { container.innerHTML = `<div class="empty-state">Erro ao carregar manutenções.</div>`; }
}

export async function submitManutencao() {
  const titulo     = document.getElementById("man-titulo")?.value.trim();
  const categoria  = document.getElementById("man-categoria")?.value;
  const dataInicio = document.getElementById("man-data-inicio")?.value;
  const dataFim    = document.getElementById("man-data-fim")?.value;
  const impacto    = document.getElementById("man-impacto")?.value.trim();
  const descricao  = document.getElementById("man-descricao")?.value.trim();

  document.getElementById("man-titulo-erro").textContent      = "";
  document.getElementById("man-data-inicio-erro").textContent = "";
  let ok = true;
  if (!titulo)     { document.getElementById("man-titulo-erro").textContent      = "Informe o título";    ok = false; }
  if (!dataInicio) { document.getElementById("man-data-inicio-erro").textContent = "Informe a data/hora"; ok = false; }
  if (!ok) return;

  setBtnLoading("man-btn", "man-btn-label", true, "AGENDANDO…");
  try {
    await postAPI("/manutencoes", {
      titulo, categoria, condominio_id: state.CONDOMINIO_ID,
      data_inicio: dataInicio,
      data_fim:    dataFim    || null,
      impacto:     impacto    || null,
      descricao:   descricao  || null,
    });
    exibirFeedback("man-feedback", "✔ Manutenção agendada e moradores notificados!", "ok");
    document.getElementById("man-titulo").value      = "";
    document.getElementById("man-data-inicio").value = "";
    document.getElementById("man-data-fim").value    = "";
    document.getElementById("man-impacto").value     = "";
    document.getElementById("man-descricao").value   = "";
    await carregarManutencoesAdmin();
  } catch (err) {
    exibirFeedback("man-feedback", "✖ " + err.message, "erro");
  } finally {
    setBtnLoading("man-btn", "man-btn-label", false, "▶ AGENDAR");
  }
}

export async function atualizarStatusManutencao(id, status) {
  if (!status) return;
  try {
    await putAPI(`/manutencoes/${id}`, { status });
    exibirToast("✔ Status atualizado!");
    await carregarManutencoesAdmin();
  } catch { exibirToast("✖ Erro ao atualizar", "erro"); }
}

export async function deletarManutencao(id, titulo) {
  if (!confirmarExclusao(titulo)) return;
  try {
    await deleteAPI(`/manutencoes/${id}`);
    exibirToast("✔ Manutenção excluída!");
    await carregarManutencoesAdmin();
  } catch { exibirToast("✖ Erro ao excluir", "erro"); }
}
