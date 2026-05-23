import { state } from "../core/state.js";
import { getToken, fetchAPI, postAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { limparFormulario } from "../ui/utils.js";
import { exibirToast, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

export function addOpcaoVotacao() {
  const wrap = document.getElementById("vot-opcoes-wrap");
  const n    = wrap.querySelectorAll(".vot-opcao").length + 1;
  const inp  = document.createElement("input");
  inp.className   = "field-input vot-opcao";
  inp.type        = "text";
  inp.placeholder = `Opção ${n}`;
  wrap.appendChild(inp);
}

export async function carregarVotacoesAdmin() {
  if (!state.CONDOMINIO_ID) return;
  try {
    const votacoes = await fetchAPI(`/votacoes?condominio_id=${state.CONDOMINIO_ID}`);
    if (!votacoes) return;
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("vot-count").textContent = `${pad(votacoes.length)} VOTAÇÕES`;
    const lista = document.getElementById("votacoes-admin-lista");
    if (!votacoes.length) {
      lista.innerHTML = `<div class="empty-state" style="margin:20px"><div class="empty-state-icon">⬡</div>Nenhuma votação criada.</div>`;
      return;
    }
    lista.innerHTML = votacoes.map((v, i) => {
      const total = v.total_votos || 0;
      const barras = v.opcoes.map((op, idx) => {
        const count = v.resultados?.[idx] || 0;
        const pct   = total > 0 ? Math.round(count / total * 100) : 0;
        return `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">
            <span>${escHTML(op)}</span><span>${count} voto${count !== 1 ? "s" : ""} (${pct}%)</span>
          </div>
          <div style="background:rgba(16,185,129,.12);border-radius:3px;height:8px;overflow:hidden;margin-top:3px">
            <div style="background:var(--p2);width:${pct}%;height:100%"></div>
          </div>
        </div>`;
      }).join("");
      return `<div style="padding:18px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s;opacity:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <div>
            <span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-bright)">${escHTML(v.titulo)}</span>
            ${v.descricao ? `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);margin-top:3px">${escHTML(v.descricao)}</div>` : ""}
          </div>
          <span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:4px;border:1px solid ${v.ativa ? "rgba(0,229,255,.4)" : "rgba(0,255,170,.3)"};color:${v.ativa ? "var(--cyan)" : "var(--green)"}">${v.ativa ? "ATIVA" : "ENCERRADA"}</span>
        </div>
        <div style="margin-bottom:12px">${barras}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">${total} voto${total !== 1 ? "s" : ""} · Criada ${new Date(v.criado_em).toLocaleDateString("pt-BR")}</span>
          <div style="display:flex;gap:8px">
            ${v.ativa ? `<button onclick="encerrarVotacao(${v.id})" style="font-family:var(--font-mono);font-size:10px;padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,165,0,.4);background:transparent;color:#FFA500">⏹ ENCERRAR</button>` : ""}
            <button onclick="deletarVotacao(${v.id})" style="font-family:var(--font-mono);font-size:10px;padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,68,102,.4);background:transparent;color:var(--red)">✕ EXCLUIR</button>
          </div>
        </div>
      </div>`;
    }).join("");
  } catch (err) { console.error(err); }
}

export async function submitVotacao() {
  const titulo = document.getElementById("vot-titulo").value.trim();
  const desc   = document.getElementById("vot-desc").value.trim();
  const opcoes = [...document.querySelectorAll(".vot-opcao")].map((i) => i.value.trim()).filter(Boolean);
  const enc    = document.getElementById("vot-encerramento").value;

  document.getElementById("vot-titulo-erro").textContent = "";
  document.getElementById("vot-opcoes-erro").textContent = "";

  let ok = true;
  if (!titulo)        { document.getElementById("vot-titulo-erro").textContent = "Informe o título"; ok = false; }
  if (opcoes.length < 2) { document.getElementById("vot-opcoes-erro").textContent = "Adicione pelo menos 2 opções"; ok = false; }
  if (!ok) return;

  setBtnLoading("vot-btn", "vot-btn-label", true, "▶ PUBLICAR");
  try {
    await postAPI("/votacoes", {
      titulo, descricao: desc || null, opcoes,
      condominio_id: state.CONDOMINIO_ID,
      encerrada_em: enc ? new Date(enc).toISOString() : null,
    });
    exibirToast("✔ Votação criada!");
    limparFormulario("vot-titulo", "vot-desc", "vot-encerramento");
    document.getElementById("vot-opcoes-wrap").innerHTML =
      `<input class="field-input vot-opcao" type="text" placeholder="Opção 1">
       <input class="field-input vot-opcao" type="text" placeholder="Opção 2">`;
    await carregarVotacoesAdmin();
  } catch (err) { exibirToast("✖ " + err.message, "erro"); }
  finally { setBtnLoading("vot-btn", "vot-btn-label", false, "▶ PUBLICAR"); }
}

export async function encerrarVotacao(id) {
  if (!confirm("Encerrar esta votação? Moradores não poderão mais votar.")) return;
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/votacoes/${id}/encerrar`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    exibirToast("✔ Votação encerrada!");
    await carregarVotacoesAdmin();
  } catch { exibirToast("✖ Erro ao encerrar", "erro"); }
}

export async function deletarVotacao(id) {
  if (!confirmarExclusao("esta votação")) return;
  try {
    await deleteAPI(`/votacoes/${id}`);
    exibirToast("✔ Votação excluída!");
    await carregarVotacoesAdmin();
  } catch { exibirToast("✖ Erro ao excluir", "erro"); }
}
