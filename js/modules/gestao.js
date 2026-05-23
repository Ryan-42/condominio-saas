import { state, _PREFERS_NO_MOTION } from "../core/state.js";
import { getUsuario, fetchAPI, postAPI, putAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { exibirToast, exibirFeedback, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

export async function carregarGestao() {
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
      const gestaoAnim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s`;
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
      </tr>`;
    }).join("");
  } catch (err) {
    console.error(err);
  }
}

export async function carregarUsuarios() {
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
      const anim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s`;
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

export async function deletarCondominio(id, nome, btn) {
  if (!confirmarExclusao(nome)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/condominios/${id}`);
    exibirToast(`✔ Condomínio "${nome}" excluído.`);
    await carregarGestao();
    await window.carregarCondominios?.();
  } catch (err) {
    exibirToast("✖ Erro ao excluir condomínio.", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

export function abrirEditarCondominio(id, nome, unidades) {
  state._condoEditandoId = id;
  document.getElementById("edit-condo-nome").value     = nome;
  document.getElementById("edit-condo-unidades").value = unidades;
  document.getElementById("edit-condo-feedback").textContent = "";
  document.getElementById("modal-editar-condo").style.display = "flex";
}

export function fecharModalEditarCondo() {
  document.getElementById("modal-editar-condo").style.display = "none";
  state._condoEditandoId = null;
}

export async function submitEditarCondominio() {
  if (!state._condoEditandoId) return;
  const nome     = document.getElementById("edit-condo-nome").value.trim();
  const unidades = parseInt(document.getElementById("edit-condo-unidades").value);
  const fb = document.getElementById("edit-condo-feedback");
  if (!nome) { fb.textContent = "⚠ Nome obrigatório."; return; }
  if (!unidades || unidades < 1) { fb.textContent = "⚠ Informe um número válido de unidades."; return; }

  const btn = document.getElementById("edit-condo-btn");
  btn.disabled = true; btn.textContent = "SALVANDO…";
  try {
    await putAPI(`/condominios/${state._condoEditandoId}`, { nome, quantidade_unidades: unidades });
    fecharModalEditarCondo();
    exibirToast("✔ Condomínio atualizado.");
    await carregarGestao();
    await window.carregarCondominios?.();
  } catch (err) {
    fb.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = "▶ SALVAR";
  }
}

export async function submitNovoCondominio() {
  const usuario = getUsuario();
  if (!usuario || usuario.tipo !== "ADMIN") return;

  const condoNome     = document.getElementById("gestao-condo-nome").value.trim();
  const condoUnidades = parseInt(document.getElementById("gestao-condo-unidades").value);
  const sindicoNome   = document.getElementById("gestao-sindico-nome").value.trim();
  const sindicoEmail  = document.getElementById("gestao-sindico-email").value.trim();
  const sindicoSenha  = document.getElementById("gestao-sindico-senha").value;

  ["gestao-condo-nome", "gestao-condo-unidades", "gestao-sindico-nome", "gestao-sindico-email", "gestao-sindico-senha"]
    .forEach((id) => document.getElementById(`${id}-erro`).textContent = "");

  let valido = true;
  if (!condoNome)                              { document.getElementById("gestao-condo-nome-erro").textContent     = "Campo obrigatório"; valido = false; }
  if (!condoUnidades || condoUnidades < 1)     { document.getElementById("gestao-condo-unidades-erro").textContent = "Informe um número válido"; valido = false; }
  if (!sindicoNome)                            { document.getElementById("gestao-sindico-nome-erro").textContent   = "Campo obrigatório"; valido = false; }
  if (!sindicoEmail || !sindicoEmail.includes("@")) { document.getElementById("gestao-sindico-email-erro").textContent = "E-mail inválido"; valido = false; }
  if (!sindicoSenha || sindicoSenha.length < 6)    { document.getElementById("gestao-sindico-senha-erro").textContent = "Mínimo 6 caracteres"; valido = false; }
  if (!valido) return;

  setBtnLoading("gestao-btn", "gestao-btn-label", true, "PROCESSANDO…");
  try {
    const condo = await postAPI("/condominios", { nome: condoNome, quantidade_unidades: condoUnidades });
    await postAPI("/usuarios", { nome: sindicoNome, email: sindicoEmail, senha: sindicoSenha, tipo: "SINDICO", condominio_id: condo.id });
    exibirFeedback("gestao-feedback", `✔ Condomínio "${condo.nome}" e síndico criados com sucesso!`, "ok");
    ["gestao-condo-nome", "gestao-condo-unidades", "gestao-sindico-nome", "gestao-sindico-email", "gestao-sindico-senha"]
      .forEach((id) => document.getElementById(id).value = "");
    await Promise.all([carregarGestao(), carregarUsuarios(), window.carregarCondominios?.()]);
  } catch (err) {
    const msg = err.message?.includes("400") ? "E-mail já cadastrado." : "Erro ao criar. Verifique os dados.";
    exibirFeedback("gestao-feedback", `⚠ ${msg}`, "erro");
    await Promise.all([carregarGestao(), carregarUsuarios()]);
  } finally {
    setBtnLoading("gestao-btn", "gestao-btn-label", false, "▶ CRIAR CONDOMÍNIO");
  }
}

export async function abrirVincularSindico(condoId, condoNome) {
  state._vincularCondoId = condoId;
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

export function fecharVincularSindico() {
  document.getElementById("modal-vincular-sindico").style.display = "none";
  state._vincularCondoId = null;
}

export async function submitVincularSindico() {
  const select    = document.getElementById("vincular-sindico-select");
  const fb        = document.getElementById("vincular-sindico-feedback");
  const usuarioId = parseInt(select.value);
  if (!usuarioId) { fb.textContent = "⚠ Selecione um síndico."; return; }

  const btn = document.getElementById("vincular-sindico-btn");
  btn.disabled = true; btn.textContent = "VINCULANDO…";
  try {
    await putAPI(`/usuarios/${usuarioId}`, { condominio_id: state._vincularCondoId });
    fecharVincularSindico();
    exibirToast("✔ Síndico vinculado com sucesso.");
    await carregarGestao();
    await window.carregarCondominios?.();
  } catch (err) {
    fb.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = "▶ VINCULAR";
  }
}
