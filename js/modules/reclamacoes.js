import { state } from "../core/state.js";
import { getToken, fetchAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { pad } from "../ui/utils.js";
import { exibirToast } from "../ui/notifications.js";

const _REC_STATUS_LABEL = { ABERTA: "ABERTA", EM_ANALISE: "EM ANÁLISE", RESOLVIDA: "RESOLVIDA" };
const _REC_PRIO_LABEL   = { BAIXA: "BAIXA", MEDIA: "MÉDIA", ALTA: "ALTA" };

export async function carregarReclacoesAdmin() {
  if (!state.CONDOMINIO_ID) return;
  try {
    const recs = await fetchAPI(`/reclamacoes?condominio_id=${state.CONDOMINIO_ID}`);
    if (!recs) return;

    const total      = recs.length;
    const abertas    = recs.filter(r => r.status === "ABERTA").length;
    const analise    = recs.filter(r => r.status === "EM_ANALISE").length;
    const resolvidas = recs.filter(r => r.status === "RESOLVIDA").length;

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
      <div style="padding:18px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i*.04, 0.4)}s;opacity:0">
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

export function abrirModalResposta(id, titulo, status, resposta) {
  document.getElementById("modal-rec-id").value                = id;
  document.getElementById("modal-rec-titulo-display").textContent = titulo;
  document.getElementById("modal-rec-status").value            = status;
  document.getElementById("modal-rec-resposta").value          = resposta;
  document.getElementById("modal-rec-feedback").textContent    = "";
  document.getElementById("modal-rec-btn-label").textContent   = "▶ SALVAR";
  document.getElementById("modal-responder-rec").style.display = "flex";
}

export function fecharModalResposta() {
  document.getElementById("modal-responder-rec").style.display = "none";
}

export async function salvarRespostaRec() {
  const id       = document.getElementById("modal-rec-id").value;
  const status   = document.getElementById("modal-rec-status").value;
  const resposta = document.getElementById("modal-rec-resposta").value.trim();
  const fb  = document.getElementById("modal-rec-feedback");
  const lbl = document.getElementById("modal-rec-btn-label");

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
