import { _PREFERS_NO_MOTION } from "../core/state.js";

export const formatarMoeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const formatarData = (s) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export const dataHoje = () => new Date().toISOString().split("T")[0];
export const pad = (n) => String(n).padStart(2, "0");

export function limparFormulario(...ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = el.type === "date" ? dataHoje() : "";
    el.classList.remove("field-input--erro");
  });
}

export function validarCampo(id, regra, mensagem) {
  const el    = document.getElementById(id);
  const erro  = document.getElementById(`${id}-erro`);
  const valor = el ? el.value.trim() : "";
  const valido = regra(valor, el);
  if (erro) {
    erro.textContent = valido ? "" : mensagem;
    erro.style.display = valido ? "none" : "block";
  }
  if (el) el.classList.toggle("field-input--erro", !valido);
  return valido;
}

export function limparErros(...ids) {
  ids.forEach((id) => {
    const erro = document.getElementById(`${id}-erro`);
    const el   = document.getElementById(id);
    if (erro) { erro.textContent = ""; erro.style.display = "none"; }
    if (el)   el.classList.remove("field-input--erro");
  });
}

export const REGRAS = {
  naoVazio:      (v) => v.length > 0,
  valorPositivo: (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
  dataValida:    (v) => v.length > 0 && !isNaN(new Date(v).getTime()),
  email:         (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
};

export function filtrarTabela(tbodyId, query) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const termo = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    if (tr.querySelector(".empty-state")) return;
    const texto = tr.textContent.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    tr.style.display = !termo || texto.includes(termo) ? "" : "none";
  });
}

export function renderRows(tbodyId, rows, colspan = 3, mensagem = "Nenhum registro encontrado.", dica = "Comece adicionando um novo registro acima.") {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="empty-state">
          <div class="empty-state-icon">⬡</div>
          <div>${mensagem}</div>
          <div class="empty-state-hint">${dica}</div>
        </td>
      </tr>`;
    return;
  }
  tbody.innerHTML = rows.map((html, i) => {
    const anim = _PREFERS_NO_MOTION ? "" : `opacity:0;animation:fadeUp .3s ease forwards;animation-delay:${Math.min(i * 0.04, 0.4)}s`;
    return `<tr style="${anim}">${html}</tr>`;
  }).join("");
}

export function renderBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".mensal-bar-fill").forEach((bar) => {
      setTimeout(() => { bar.style.width = `${bar.dataset.pct}%`; }, 100);
    });
  });
}

export function animateValue(el, target) {
  const steps = 40;
  const inc   = target / steps;
  let cur = 0, step = 0;
  const timer = setInterval(() => {
    step++; cur += inc;
    if (step >= steps) { clearInterval(timer); cur = target; }
    el.textContent = formatarMoeda(cur);
  }, 900 / steps);
}
