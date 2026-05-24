import { state } from "../core/state.js";
import { getUsuario, fetchAPI, postAPI, putAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { exibirToast, exibirFeedback, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

const _TIPO_LABEL = { NORMAL: "NORMAL", URGENTE: "URGENTE", INFO: "INFO" };

export async function carregarAvisos() {
  if (!state.CONDOMINIO_ID) return;
  const lista   = document.getElementById("avisos-lista");
  const badge   = document.getElementById("avisos-count");
  const usuario = getUsuario();

  const painel = document.getElementById("aviso-form-panel");
  if (painel) painel.style.display = "";

  try {
    const avisos = await fetchAPI(`/avisos?condominio_id=${state.CONDOMINIO_ID}`);
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
      card.style.animationDelay = `${Math.min(i * 0.06, 0.4)}s`;

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

export async function submitAviso() {
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
    await postAPI("/avisos", { titulo, conteudo, tipo, condominio_id: state.CONDOMINIO_ID });
    exibirToast("✔ Aviso publicado com sucesso!");
    document.getElementById("aviso-titulo").value   = "";
    document.getElementById("aviso-conteudo").value = "";
    document.getElementById("aviso-tipo").value     = "NORMAL";
    window.toggleForm?.("aviso-form-body", "aviso-toggle-label", "+ NOVO AVISO");
    await carregarAvisos();
  } catch (err) {
    exibirFeedback("aviso-feedback", `⚠ Erro ao publicar: ${err.message}`, "erro");
  } finally {
    setBtnLoading("aviso-btn", "aviso-btn-label", false, "▶ PUBLICAR");
  }
}

export function abrirEditarAviso(aviso) {
  state._avisoEditandoId = aviso.id;
  document.getElementById("edit-aviso-titulo").value   = aviso.titulo;
  document.getElementById("edit-aviso-conteudo").value = aviso.conteudo;
  document.getElementById("edit-aviso-tipo").value     = aviso.tipo;
  document.getElementById("edit-aviso-feedback").textContent = "";
  document.getElementById("modal-editar-aviso").style.display = "flex";
}

export function fecharModalEditarAviso() {
  document.getElementById("modal-editar-aviso").style.display = "none";
  state._avisoEditandoId = null;
}

export async function submitEditarAviso() {
  if (!state._avisoEditandoId) return;
  const titulo   = document.getElementById("edit-aviso-titulo").value.trim();
  const conteudo = document.getElementById("edit-aviso-conteudo").value.trim();
  const tipo     = document.getElementById("edit-aviso-tipo").value;
  const fb = document.getElementById("edit-aviso-feedback");
  if (!titulo || !conteudo) { fb.textContent = "⚠ Preencha todos os campos."; return; }

  const btn = document.getElementById("edit-aviso-btn");
  btn.disabled = true; btn.textContent = "SALVANDO…";
  try {
    await putAPI(`/avisos/${state._avisoEditandoId}`, { titulo, conteudo, tipo });
    fecharModalEditarAviso();
    exibirToast("✔ Aviso atualizado.");
    await carregarAvisos();
  } catch (err) {
    fb.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = "▶ SALVAR";
  }
}

export async function deletarAviso(id, titulo, btn) {
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
