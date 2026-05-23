export function exibirToast(mensagem, tipo = "ok") {
  let toast = document.getElementById("toast-global");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-global";
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.className   = `toast toast--${tipo} toast--visivel`;
  clearTimeout(toast._timer);
  const duracao = tipo === "erro" ? 8000 : 3500;
  toast._timer = setTimeout(() => toast.classList.remove("toast--visivel"), duracao);
}

export function exibirFeedback(feedbackId, mensagem, tipo = "ok") {
  const el = document.getElementById(feedbackId);
  if (!el) return;
  el.textContent = mensagem;
  el.className   = `form-feedback ${tipo}`;
  const duracao = tipo === "erro" ? 8000 : 4000;
  setTimeout(() => { el.textContent = ""; el.className = "form-feedback"; }, duracao);
}

export function setBtnLoading(btnId, labelId, loading, textoNormal = "▶ EXECUTAR") {
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = loading;
  const lbl = document.getElementById(labelId);
  if (lbl) lbl.textContent = loading ? "⏳ SALVANDO…" : textoNormal;
}

export function confirmarExclusao(descricao) {
  return confirm(`Tem certeza que deseja excluir "${descricao}"?\n\nEssa ação não pode ser desfeita.`);
}
