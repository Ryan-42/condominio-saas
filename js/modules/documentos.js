import { state } from "../core/state.js";
import { getToken, fetchAPI, postAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { limparFormulario } from "../ui/utils.js";
import { exibirToast, exibirFeedback, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

export async function carregarDocumentosAdmin() {
  if (!state.CONDOMINIO_ID) return;
  try {
    const docs = await fetchAPI(`/documentos?condominio_id=${state.CONDOMINIO_ID}`);
    if (!docs) return;
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("doc-count").textContent = `${pad(docs.length)} ARQUIVOS`;
    const lista = document.getElementById("documentos-admin-lista");
    if (!docs.length) {
      lista.innerHTML = `<div class="empty-state" style="margin:20px"><div class="empty-state-icon">⬡</div>Nenhum documento publicado.</div>`;
      return;
    }
    const icone = (m) => !m ? "📄" : m.includes("pdf") ? "📕" : m.includes("image") ? "🖼️" : m.includes("sheet") || m.includes("excel") ? "📊" : m.includes("word") ? "📝" : "📄";
    const tam   = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
    lista.innerHTML = docs.map((d, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid var(--border);animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s;opacity:0;flex-wrap:wrap;gap:10px">
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
          <button onclick="deletarDocumento(${d.id},'${escHTML(d.nome).replace(/'/g, "\\'")}')" style="font-family:var(--font-mono);font-size:10px;padding:6px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(255,68,102,.4);background:transparent;color:var(--red)">✕ EXCLUIR</button>
        </div>
      </div>`).join("");
  } catch (err) { console.error(err); }
}

export async function submitDocumento() {
  const nome    = document.getElementById("doc-nome").value.trim();
  const desc    = document.getElementById("doc-desc").value.trim();
  const arquivo = document.getElementById("doc-arquivo").files[0];
  document.getElementById("doc-nome-erro").textContent    = "";
  document.getElementById("doc-arquivo-erro").textContent = "";
  let ok = true;
  if (!nome)    { document.getElementById("doc-nome-erro").textContent    = "Informe o nome";        ok = false; }
  if (!arquivo) { document.getElementById("doc-arquivo-erro").textContent = "Selecione um arquivo"; ok = false; }
  if (!ok) return;

  setBtnLoading("doc-btn", "doc-btn-label", true, "▶ ENVIANDO…");
  try {
    const token = getToken();
    const form  = new FormData();
    form.append("condominio_id", state.CONDOMINIO_ID);
    form.append("nome", nome);
    form.append("descricao", desc);
    form.append("arquivo", arquivo);
    const res = await fetch(`${API_BASE}/documentos`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || "Erro ao enviar arquivo");
    }
    exibirToast("✔ Documento publicado!");
    limparFormulario("doc-nome", "doc-desc");
    document.getElementById("doc-arquivo").value = "";
    exibirFeedback("doc-feedback", "✔ Publicado com sucesso!", "ok");
    await carregarDocumentosAdmin();
  } catch (err) {
    exibirFeedback("doc-feedback", "✖ " + err.message, "erro");
  } finally {
    setBtnLoading("doc-btn", "doc-btn-label", false, "▶ ENVIAR");
  }
}

export async function baixarDocAdmin(docId) {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}/documentos/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const blob  = await res.blob();
    const cd    = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const nome  = match ? match[1].replace(/['"]/g, "") : `doc_${docId}`;
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { exibirToast("✖ Erro ao baixar", "erro"); }
}

export async function deletarDocumento(id, nome) {
  if (!confirmarExclusao(nome)) return;
  try {
    await deleteAPI(`/documentos/${id}`);
    exibirToast("✔ Documento excluído!");
    await carregarDocumentosAdmin();
  } catch { exibirToast("✖ Erro ao excluir", "erro"); }
}
