import { state, _PREFERS_NO_MOTION } from "../core/state.js";
import { getToken, getUsuario, fetchAPI, postAPI, putAPI, deleteAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { pad, limparFormulario, validarCampo, limparErros, REGRAS } from "../ui/utils.js";
import { exibirToast, exibirFeedback, setBtnLoading, confirmarExclusao } from "../ui/notifications.js";

export async function carregarMoradores() {
  try {
    const todos   = await fetchAPI("/moradores");
    if (!todos) return;
    const usuario = getUsuario();
    const moradores = (usuario.tipo === "ADMIN" && state.CONDOMINIO_ID)
      ? todos.filter((m) => m.condominio_id === state.CONDOMINIO_ID)
      : todos;
    document.getElementById("mor-count").textContent = `${pad(moradores.length)} CADASTRADOS`;

    const tbody = document.getElementById("tabela-moradores");
    if (!moradores.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-state-icon">⬡</div><div>Nenhum registro encontrado.</div><div class="empty-state-hint">Comece adicionando um novo registro acima.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    moradores.forEach((m, i) => {
      const tr = document.createElement("tr");
      if (!_PREFERS_NO_MOTION) {
        tr.style.opacity = "0";
        tr.style.animation = `fadeUp .3s ease forwards`;
        tr.style.animationDelay = `${Math.min(i * 0.04, 0.4)}s`;
      }
      tr.innerHTML = `<td>${escHTML(m.nome)}</td>
       <td class="td-apt">${escHTML(m.apartamento) || "—"}</td>
       <td class="td-email">${escHTML(m.email) || "—"}</td>
       <td class="td-data">${escHTML(m.telefone) || "—"}</td>
       <td class="td-acoes">
         <button class="btn-linha btn-linha--editar" onclick="editarMorador(${m.id})">✎ Editar</button>
         <button onclick="convidarMorador(${m.id})" class="btn-acao btn-acao--secundario" title="Enviar link de primeiro acesso">CONVIDAR</button>
         <button onclick="gerarQRPortal(${m.id})" class="btn-acao btn-acao--secundario" title="Gerar QR code de acesso ao portal" ${m.conta_ativa ? "" : "disabled"}>QR PORTAL</button>
       </td>`;
      const btnDeletar = document.createElement("button");
      btnDeletar.className = "btn-linha btn-linha--deletar";
      btnDeletar.textContent = "✕ Excluir";
      btnDeletar.addEventListener("click", () => deletarMorador(m.id, m.nome, btnDeletar));
      tr.querySelector(".td-acoes").appendChild(btnDeletar);
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

function _validarMorador() {
  const v1 = validarCampo("mor-nome",        REGRAS.naoVazio, "Informe o nome");
  const v2 = validarCampo("mor-apartamento", REGRAS.naoVazio, "Informe o apartamento");
  const v3 = validarCampo("mor-email",       REGRAS.email,    "Informe um e-mail válido");
  const v4 = validarCampo("mor-telefone",    REGRAS.naoVazio, "Informe o telefone");
  return v1 && v2 && v3 && v4;
}

export async function submitMorador() {
  if (!state.CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  limparErros("mor-nome", "mor-apartamento", "mor-email", "mor-telefone");
  if (!_validarMorador()) return;

  const nome        = document.getElementById("mor-nome").value.trim();
  const apartamento = document.getElementById("mor-apartamento").value.trim();
  const email       = document.getElementById("mor-email").value.trim();
  const telefone    = document.getElementById("mor-telefone").value.trim();

  setBtnLoading("mor-btn", "mor-btn-label", true);
  try {
    if (state.editandoMor) {
      await putAPI(`/moradores/${state.editandoMor}`, { nome, apartamento, email, telefone, condominio_id: state.CONDOMINIO_ID });
      exibirToast("✔ Morador atualizado com sucesso!");
      _sairModoEdicaoMor();
    } else {
      await postAPI("/moradores", { nome, apartamento, email, telefone, condominio_id: state.CONDOMINIO_ID });
      exibirToast("✔ Morador cadastrado com sucesso!");
    }
    limparFormulario("mor-nome", "mor-apartamento", "mor-email", "mor-telefone");
    await carregarMoradores();
  } catch (err) {
    console.error(err);
    exibirToast(`✖ Erro ao salvar morador: ${err.message}`, "erro");
  } finally {
    setBtnLoading("mor-btn", "mor-btn-label", false);
  }
}

export function editarMorador(id) {
  fetchAPI(`/moradores/${id}`).then((m) => {
    if (!m) return;
    state.editandoMor = id;
    document.getElementById("mor-nome").value        = m.nome;
    document.getElementById("mor-apartamento").value = m.apartamento || "";
    document.getElementById("mor-email").value       = m.email || "";
    document.getElementById("mor-telefone").value    = m.telefone || "";
    const body  = document.getElementById("mor-form-body");
    const label = document.getElementById("mor-toggle-label");
    body.classList.add("open");
    label.textContent = "✕ FECHAR";
    document.getElementById("mor-btn-label").textContent = "▶ SALVAR EDIÇÃO";
    document.getElementById("mor-feedback").textContent  = `✎ Editando morador #${id}`;
    document.getElementById("mor-feedback").className    = "form-feedback ok";
    body.scrollIntoView({ behavior: "smooth", block: "start" });
  }).catch(() => exibirToast("✖ Erro ao carregar morador", "erro"));
}

export async function deletarMorador(id, nome, btn) {
  if (!confirmarExclusao(nome)) return;
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    await deleteAPI(`/moradores/${id}`);
    exibirToast("✔ Morador excluído com sucesso!");
    await carregarMoradores();
  } catch (err) {
    exibirToast("✖ Erro ao excluir morador", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "✕ Excluir"; }
  }
}

export function _sairModoEdicaoMor() {
  state.editandoMor = null;
  document.getElementById("mor-btn-label").textContent = "▶ EXECUTAR";
  document.getElementById("mor-feedback").textContent  = "";
}

export async function convidarMorador(moradorId) {
  try {
    const data = await postAPI(`/moradores/${moradorId}/convidar`, {});
    if (data && data.onboarding_url) {
      abrirModalConvite(data.onboarding_url, data.mensagem);
    }
  } catch (err) {
    exibirToast("Erro ao gerar convite: " + err.message, "erro");
  }
}

export function abrirModalConvite(url, mensagem) {
  const modal = document.getElementById("modal-convite");
  document.getElementById("modal-convite-url").value = url;
  const statusEl = document.getElementById("modal-convite-status");
  const emailEnviado = mensagem && mensagem.includes("e-mail");
  statusEl.textContent = mensagem || "Link gerado. Envie ao morador.";
  statusEl.style.background = emailEnviado ? "rgba(16,185,129,.12)" : "rgba(6,182,212,.10)";
  statusEl.style.color = emailEnviado ? "var(--p2)" : "var(--p3)";
  statusEl.style.border = emailEnviado ? "1px solid rgba(16,185,129,.25)" : "1px solid rgba(6,182,212,.20)";
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("modal-convite-url").select(), 100);
}

export function fecharModalConvite() {
  document.getElementById("modal-convite").style.display = "none";
}

export async function copiarLinkConvite() {
  const url = document.getElementById("modal-convite-url").value;
  const btn = document.getElementById("btn-copiar-convite");
  try { await navigator.clipboard.writeText(url); }
  catch { document.getElementById("modal-convite-url").select(); document.execCommand("copy"); }
  btn.textContent = "COPIADO ✓";
  btn.style.background = "var(--p1)";
  setTimeout(() => { btn.textContent = "COPIAR"; btn.style.background = "var(--p2)"; }, 2000);
}

// ── Importação ────────────────────────────────────────────────

export function abrirImportacao(tipo) {
  const input = document.getElementById(`import-input-${tipo}`);
  if (input) input.click();
}

export async function processarImportacao(tipo, inputEl) {
  const arquivo = inputEl.files[0];
  if (!arquivo) return;

  const btnId    = `import-btn-${tipo}`;
  const statusId = `import-status-${tipo}`;
  const btn      = document.getElementById(btnId);
  const statusEl = document.getElementById(statusId);

  if (btn) { btn.disabled = true; btn.textContent = "IMPORTANDO…"; }
  if (statusEl) { statusEl.textContent = ""; statusEl.className = "import-status"; }

  const formData = new FormData();
  formData.append("arquivo", arquivo);

  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/importar/${tipo}/${state.CONDOMINIO_ID}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `Erro ${res.status}`);

    const msg = `✔ ${data.criados} registro(s) importado(s) de ${data.total_linhas} linha(s).` +
      (data.erros.length ? ` ${data.erros.length} erro(s) ignorado(s).` : "");

    if (statusEl) { statusEl.textContent = msg; statusEl.className = "import-status ok"; }
    exibirToast(msg);

    if (tipo === "despesas")  await window.carregarDespesas?.();
    if (tipo === "receitas")  await window.carregarReceitas?.();
    if (tipo === "moradores") await carregarMoradores();
    if (tipo === "despesas" || tipo === "receitas") await window.carregarDashboard?.();
  } catch (err) {
    const msg = `✖ ${err.message}`;
    if (statusEl) { statusEl.textContent = msg; statusEl.className = "import-status erro"; }
    exibirToast(msg, "erro");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📂 IMPORTAR EXCEL"; }
    inputEl.value = "";
  }
}

export async function baixarTemplate(tipo) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/importar/template/${tipo}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) { exibirToast("Erro ao baixar template", "erro"); return; }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `template_${tipo}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── QR Portal ─────────────────────────────────────────────────

export async function gerarQRPortal(moradorId) {
  try {
    const data = await fetchAPI(`/moradores/${moradorId}/portal-token`);
    if (!data) return;
    abrirModalQR(data.portal_url, data.morador_nome, data.apartamento);
  } catch (err) {
    exibirToast("Erro ao gerar QR: " + err.message, "erro");
  }
}

export function abrirModalQR(url, nome, apto) {
  document.getElementById("modal-qr-nome").textContent = nome || "Morador";
  document.getElementById("modal-qr-apto").textContent = apto ? `APTO ${apto}` : "—";
  document.getElementById("modal-qr-url").value = url;
  const canvas = document.getElementById("modal-qr-canvas");
  canvas.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(canvas, { text: url, width: 200, height: 200, colorDark: "#10B981", colorLight: "#030d0a", correctLevel: QRCode.CorrectLevel.M });
  } else {
    canvas.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:20px;">QR indisponível — copie a URL abaixo.</div>`;
  }
  document.getElementById("modal-qr-portal").style.display = "flex";
}

export function fecharModalQR() {
  document.getElementById("modal-qr-portal").style.display = "none";
  document.getElementById("modal-qr-canvas").innerHTML = "";
}

export async function copiarURLPortal() {
  const url = document.getElementById("modal-qr-url").value;
  const btn = document.getElementById("btn-copiar-qr");
  try { await navigator.clipboard.writeText(url); }
  catch { document.getElementById("modal-qr-url").select(); document.execCommand("copy"); }
  btn.textContent = "COPIADO ✓";
  btn.style.background = "var(--p1)";
  setTimeout(() => { btn.textContent = "COPIAR"; btn.style.background = "var(--p2)"; }, 2000);
}

// ── QR Registro ───────────────────────────────────────────────

export async function gerarQRRegistro() {
  if (!state.CONDOMINIO_ID) { exibirToast("✖ Nenhum condomínio selecionado.", "erro"); return; }
  try {
    const data = await fetchAPI(`/condominios/${state.CONDOMINIO_ID}/qr-registro`);
    abrirModalQRRegistro(data.registro_url, data.condo_nome);
  } catch (err) {
    exibirToast("Erro ao gerar QR de registro: " + err.message, "erro");
  }
}

export function abrirModalQRRegistro(url, condoNome) {
  document.getElementById("modal-qr-reg-nome").textContent = escHTML(condoNome).toUpperCase();
  document.getElementById("modal-qr-reg-url").value = url;
  const canvas = document.getElementById("modal-qr-reg-canvas");
  canvas.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(canvas, { text: url, width: 220, height: 220, colorDark: "#06B6D4", colorLight: "#030d0a", correctLevel: QRCode.CorrectLevel.M });
  } else {
    canvas.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:20px;">QR indisponível — copie a URL abaixo.</div>`;
  }
  document.getElementById("modal-qr-registro").style.display = "flex";
}

export function fecharModalQRRegistro() {
  document.getElementById("modal-qr-registro").style.display = "none";
  document.getElementById("modal-qr-reg-canvas").innerHTML = "";
}

export async function copiarURLRegistro() {
  const url = document.getElementById("modal-qr-reg-url").value;
  const btn = document.getElementById("btn-copiar-qr-reg");
  try { await navigator.clipboard.writeText(url); }
  catch { document.getElementById("modal-qr-reg-url").select(); document.execCommand("copy"); }
  btn.textContent = "COPIADO ✓";
  btn.style.background = "var(--p1)";
  setTimeout(() => { btn.textContent = "COPIAR"; btn.style.background = "var(--p3)"; }, 2000);
}
