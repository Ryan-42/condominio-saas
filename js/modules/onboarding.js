import { state } from "../core/state.js";
import { getUsuario, fetchAPI } from "../core/api.js";

export const _ONBOARDING_KEY = "condo_onboarding_dispensado";

export function dispensarOnboarding() {
  localStorage.setItem(_ONBOARDING_KEY, "1");
  const el = document.getElementById("onboarding-banner");
  if (el) el.style.display = "none";
  const navGuia = document.getElementById("nav-guia");
  const u = getUsuario();
  if (navGuia && u && u.tipo === "SINDICO") navGuia.style.display = "flex";
}

export function reabrirOnboarding() {
  localStorage.removeItem(_ONBOARDING_KEY);
  const navGuia = document.getElementById("nav-guia");
  if (navGuia) navGuia.style.display = "none";
  atualizarOnboarding();
}

export async function atualizarOnboarding() {
  if (localStorage.getItem(_ONBOARDING_KEY)) return;
  const u = getUsuario();
  if (!u || u.tipo === "ADMIN" || u.tipo === "MORADOR") return;
  if (!state.CONDOMINIO_ID) return;

  const banner  = document.getElementById("onboarding-banner");
  const barEl   = document.getElementById("onboarding-bar");
  const progEl  = document.getElementById("onboarding-prog");
  const stepsEl = document.getElementById("onboarding-steps");
  if (!banner) return;

  const [mResp, pResp, aResp] = await Promise.allSettled([
    fetchAPI(`/moradores?limit=1`),
    fetchAPI(`/pagamentos/${state.CONDOMINIO_ID}?limit=1`),
    fetchAPI(`/avisos?condominio_id=${state.CONDOMINIO_ID}&limit=1`),
  ]);

  const temMoradores = mResp.status === "fulfilled" && Array.isArray(mResp.value) && mResp.value.length > 0;
  const temTaxa      = pResp.status === "fulfilled" && Array.isArray(pResp.value) && pResp.value.length > 0;
  const temAviso     = aResp.status === "fulfilled" && Array.isArray(aResp.value) && aResp.value.length > 0;

  const passos = [
    { label: "Conta criada",           done: true,         secao: null },
    { label: "Adicionar moradores",    done: temMoradores, secao: "moradores" },
    { label: "Configurar taxa mensal", done: temTaxa,      secao: "inadimplencia" },
    { label: "Publicar primeiro aviso",done: temAviso,     secao: "avisos" },
  ];

  const concluidos = passos.filter(p => p.done).length;
  if (concluidos === passos.length) { banner.style.display = "none"; return; }

  const pct = Math.round((concluidos / passos.length) * 100);
  barEl.style.width  = pct + "%";
  progEl.textContent = `${concluidos} / ${passos.length} concluídos`;

  stepsEl.innerHTML = passos.map(p => {
    const cls = p.done ? "onboarding-step--done" : "onboarding-step--pendente";
    const ico = p.done ? "✓" : "◻";
    const onclick = p.secao && !p.done ? `onclick="navegarPara('${p.secao}')"` : "";
    return `<button class="onboarding-step ${cls}" ${onclick}>${ico} ${p.label}</button>`;
  }).join("");

  banner.style.display = "block";
}
