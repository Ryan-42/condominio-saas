import { state, _PREFERS_NO_MOTION } from "../core/state.js";
import { getUsuario, fetchAPI, postAPI, putAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { formatarMoeda, formatarData, dataHoje, pad, limparFormulario, validarCampo, limparErros, REGRAS } from "../ui/utils.js";
import { exibirToast, exibirFeedback, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

// ── Despesas ──────────────────────────────────────────────────

export async function carregarDespesas() {
  try {
    if (!state.CONDOMINIO_ID) return;
    const todas = await fetchAPI("/despesas");
    if (!todas) return;
    const _u = getUsuario();
    const despesas = (_u && _u.tipo === "ADMIN")
      ? todas.filter((d) => d.condominio_id === state.CONDOMINIO_ID)
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
        tr.style.animationDelay = `${Math.min(i * 0.04, 0.4)}s`;
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
      btnDeletar.addEventListener("click", () => deletarDespesa(d.id, d.descricao, btnDeletar));
      tr.querySelector(".td-acoes").appendChild(btnDeletar);
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

function _validarDespesa() {
  const v1 = validarCampo("desp-descricao", REGRAS.naoVazio,      "Informe a descrição");
  const v2 = validarCampo("desp-valor",     REGRAS.valorPositivo, "Informe um valor maior que zero");
  const v3 = validarCampo("desp-data",      REGRAS.dataValida,    "Informe uma data válida");
  return v1 && v2 && v3;
}

export async function submitDespesa() {
  if (!state.CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  limparErros("desp-descricao", "desp-valor", "desp-data");
  if (!_validarDespesa()) return;

  const descricao = document.getElementById("desp-descricao").value.trim();
  const valor     = parseFloat(document.getElementById("desp-valor").value);
  const data      = document.getElementById("desp-data").value;

  setBtnLoading("desp-btn", "desp-btn-label", true);
  try {
    if (state.editandoDesp) {
      await putAPI(`/despesas/${state.editandoDesp}`, { descricao, valor, data, condominio_id: state.CONDOMINIO_ID });
      exibirToast("✔ Despesa atualizada com sucesso!");
      _sairModoEdicaoDesp();
    } else {
      await postAPI("/despesas", { descricao, valor, data, condominio_id: state.CONDOMINIO_ID });
      exibirToast("✔ Despesa registrada com sucesso!");
    }
    limparFormulario("desp-descricao", "desp-valor", "desp-data");
    await carregarDespesas();
    await window.carregarDashboard?.();
  } catch (err) {
    console.error(err);
    exibirToast(`✖ Erro ao salvar despesa: ${err.message}`, "erro");
  } finally {
    setBtnLoading("desp-btn", "desp-btn-label", false);
  }
}

export function editarDespesa(id) {
  fetchAPI(`/despesas/${id}`).then((d) => {
    if (!d) return;
    state.editandoDesp = id;
    document.getElementById("desp-descricao").value = d.descricao;
    document.getElementById("desp-valor").value     = d.valor;
    document.getElementById("desp-data").value      = d.data || "";
    const body  = document.getElementById("desp-form-body");
    const label = document.getElementById("desp-toggle-label");
    body.classList.add("open");
    label.textContent = "✕ FECHAR";
    document.getElementById("desp-btn-label").textContent = "▶ SALVAR EDIÇÃO";
    document.getElementById("desp-feedback").textContent  = `✎ Editando despesa #${id}`;
    document.getElementById("desp-feedback").className    = "form-feedback ok";
    body.scrollIntoView({ behavior: "smooth", block: "start" });
  }).catch(() => exibirToast("✖ Erro ao carregar despesa", "erro"));
}

export async function deletarDespesa(id, descricao, btn) {
  if (!confirmarExclusao(descricao)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/despesas/${id}`);
    exibirToast("✔ Despesa excluída com sucesso!");
    await carregarDespesas();
    await window.carregarDashboard?.();
  } catch (err) {
    exibirToast("✖ Erro ao excluir despesa", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

export function _sairModoEdicaoDesp() {
  state.editandoDesp = null;
  document.getElementById("desp-btn-label").textContent = "▶ EXECUTAR";
  document.getElementById("desp-feedback").textContent  = "";
}

// ── Receitas ──────────────────────────────────────────────────

export async function carregarReceitas() {
  try {
    if (!state.CONDOMINIO_ID) return;
    const todas = await fetchAPI("/receitas");
    if (!todas) return;
    const _u = getUsuario();
    const receitas = (_u && _u.tipo === "ADMIN")
      ? todas.filter((r) => r.condominio_id === state.CONDOMINIO_ID)
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
        tr.style.animationDelay = `${Math.min(i * 0.04, 0.4)}s`;
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

export async function submitReceita() {
  if (!state.CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  limparErros("rec-descricao", "rec-valor", "rec-data");
  if (!_validarReceita()) return;

  const descricao = document.getElementById("rec-descricao").value.trim();
  const valor     = parseFloat(document.getElementById("rec-valor").value);
  const data      = document.getElementById("rec-data").value;

  setBtnLoading("rec-btn", "rec-btn-label", true);
  try {
    if (state.editandoRec) {
      await putAPI(`/receitas/${state.editandoRec}`, { descricao, valor, data, condominio_id: state.CONDOMINIO_ID });
      exibirToast("✔ Receita atualizada com sucesso!");
      _sairModoEdicaoRec();
    } else {
      await postAPI("/receitas", { descricao, valor, data, condominio_id: state.CONDOMINIO_ID });
      exibirToast("✔ Receita registrada com sucesso!");
    }
    limparFormulario("rec-descricao", "rec-valor", "rec-data");
    await carregarReceitas();
    await window.carregarDashboard?.();
  } catch (err) {
    console.error(err);
    exibirToast(`✖ Erro ao salvar receita: ${err.message}`, "erro");
  } finally {
    setBtnLoading("rec-btn", "rec-btn-label", false);
  }
}

export function editarReceita(id) {
  fetchAPI(`/receitas/${id}`).then((r) => {
    if (!r) return;
    state.editandoRec = id;
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

export async function deletarReceita(id, descricao, btn) {
  if (!confirmarExclusao(descricao)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/receitas/${id}`);
    exibirToast("✔ Receita excluída com sucesso!");
    await carregarReceitas();
    await window.carregarDashboard?.();
  } catch (err) {
    exibirToast("✖ Erro ao excluir receita", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

export function _sairModoEdicaoRec() {
  state.editandoRec = null;
  document.getElementById("rec-btn-label").textContent = "▶ EXECUTAR";
  document.getElementById("rec-feedback").textContent  = "";
}
