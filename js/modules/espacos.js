import { state } from "../core/state.js";
import { getToken, fetchAPI, postAPI, putAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { limparFormulario } from "../ui/utils.js";
import { exibirToast, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

function _formatDateBR(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function _labelPeriodoAdmin(p) {
  return { MANHA: "Manhã (08h–12h)", TARDE: "Tarde (12h–18h)", NOITE: "Noite (18h–22h)", DIA_TODO: "Dia todo" }[p] || p;
}

export async function carregarEspacosAdmin() {
  if (!state.CONDOMINIO_ID) return;
  try {
    const espacos = await fetchAPI(`/espacos?condominio_id=${state.CONDOMINIO_ID}`);
    if (!espacos) return;
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("esp-count").textContent = `${pad(espacos.length)} ESPAÇOS`;

    const tbody = document.getElementById("tabela-espacos");
    if (!espacos.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">⬡</div>Nenhum espaço cadastrado.</td></tr>`;
    } else {
      tbody.innerHTML = espacos.map((e, i) => `
        <tr style="opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s">
          <td>${escHTML(e.nome)}</td>
          <td>${escHTML(e.descricao || "—")}</td>
          <td class="text-right">${e.capacidade ? `${e.capacidade} pessoas` : "—"}</td>
          <td class="td-acoes">
            <button class="btn-linha btn-linha--editar" onclick="editarEspaco(${e.id})">✎ Editar</button>
            <button class="btn-linha btn-linha--deletar" onclick="deletarEspaco(${e.id},'${escHTML(e.nome).replace(/'/g, "\\'")}')">✕ Excluir</button>
          </td>
        </tr>`).join("");
    }

    const reservas = await fetchAPI(`/reservas?condominio_id=${state.CONDOMINIO_ID}`);
    if (!reservas) return;
    const pendentes = reservas.filter((r) => r.status === "PENDENTE");
    document.getElementById("reservas-count").textContent = `${pad(pendentes.length)} PENDENTES`;

    const lista = document.getElementById("reservas-admin-lista");
    if (!reservas.length) {
      lista.innerHTML = `<div class="empty-state" style="margin:20px"><div class="empty-state-icon">⬡</div>Nenhuma reserva solicitada.</div>`;
      return;
    }
    const cor = { PENDENTE: "var(--cyan)", APROVADA: "var(--green)", REJEITADA: "var(--red)", CANCELADA: "var(--text-dim)" };
    lista.innerHTML = reservas.map((r, i) => `
      <div style="padding:16px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s;opacity:0">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
          <div>
            <span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-bright)">${escHTML(r.espaco_nome || "—")}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-left:10px">${escHTML(r.morador_nome || "—")} · Apto ${escHTML(r.morador_apto || "—")}</span>
          </div>
          <span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:4px;border:1px solid ${cor[r.status]};color:${cor[r.status]}">${r.status}</span>
        </div>
        <div style="font-family:Rajdhani,sans-serif;font-size:13px;color:var(--text)">${_formatDateBR(r.data)} · ${_labelPeriodoAdmin(r.periodo)}</div>
        ${r.observacao ? `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);margin-top:4px">${escHTML(r.observacao)}</div>` : ""}
        ${r.status === "PENDENTE" ? `
        <div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="responderReserva(${r.id},'APROVADA')" style="font-family:var(--font-mono);font-size:10px;padding:5px 14px;border-radius:4px;cursor:pointer;border:1px solid rgba(0,255,170,.4);background:transparent;color:var(--green)">✔ APROVAR</button>
          <button onclick="responderReserva(${r.id},'REJEITADA')" style="font-family:var(--font-mono);font-size:10px;padding:5px 14px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,68,102,.4);background:transparent;color:var(--red)">✕ REJEITAR</button>
        </div>` : ""}
      </div>`).join("");
  } catch (err) { console.error(err); }
}

export async function responderReserva(id, status) {
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/reservas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error();
    exibirToast(`✔ Reserva ${status === "APROVADA" ? "aprovada" : "rejeitada"}!`);
    await carregarEspacosAdmin();
  } catch { exibirToast("Erro ao atualizar reserva", "erro"); }
}

export async function submitEspaco() {
  const nome       = document.getElementById("esp-nome").value.trim();
  const capacidade = document.getElementById("esp-capacidade").value;
  const descricao  = document.getElementById("esp-desc").value.trim();
  document.getElementById("esp-nome-erro").textContent = "";
  if (!nome) { document.getElementById("esp-nome-erro").textContent = "Informe o nome"; return; }

  setBtnLoading("esp-btn", "esp-btn-label", true);
  try {
    const payload = { nome, descricao: descricao || null, capacidade: capacidade ? parseInt(capacidade) : null, condominio_id: state.CONDOMINIO_ID };
    if (state.editandoEsp) {
      await putAPI(`/espacos/${state.editandoEsp}`, payload);
      exibirToast("✔ Espaço atualizado!");
      state.editandoEsp = null;
    } else {
      await postAPI("/espacos", payload);
      exibirToast("✔ Espaço cadastrado!");
    }
    limparFormulario("esp-nome", "esp-capacidade", "esp-desc");
    await carregarEspacosAdmin();
  } catch (err) { exibirToast("✖ Erro: " + err.message, "erro"); }
  finally { setBtnLoading("esp-btn", "esp-btn-label", false, "▶ EXECUTAR"); }
}

export function editarEspaco(id) {
  fetchAPI(`/espacos?condominio_id=${state.CONDOMINIO_ID}`).then((lista) => {
    const e = lista?.find((x) => x.id === id);
    if (!e) return;
    state.editandoEsp = id;
    document.getElementById("esp-nome").value       = e.nome;
    document.getElementById("esp-capacidade").value = e.capacidade || "";
    document.getElementById("esp-desc").value       = e.descricao  || "";
    const body = document.getElementById("esp-form-body");
    body.classList.add("open");
    document.getElementById("esp-toggle-label").textContent = "✕ FECHAR";
    document.getElementById("esp-btn-label").textContent    = "▶ SALVAR EDIÇÃO";
    body.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export async function deletarEspaco(id, nome) {
  if (!confirmarExclusao(nome)) return;
  try {
    await deleteAPI(`/espacos/${id}`);
    exibirToast("✔ Espaço removido!");
    await carregarEspacosAdmin();
  } catch { exibirToast("✖ Erro ao remover espaço", "erro"); }
}
