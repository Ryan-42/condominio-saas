import { getToken, getUsuario, logout, iniciarAvisoToken } from "./core/api.js";
import { limparFormulario, dataHoje } from "./ui/utils.js";
import { exibirToast } from "./ui/notifications.js";

import {
  initClock, initUptime, setStatus,
  carregarCondominios, onCondominioChange,
  navegarPara, navigateTo, atualizarSidebarNode, recarregarSecaoAtiva,
  bindNavItems, toggleSidebar, closeSidebar, toggleForm,
} from "./modules/navigation.js";

import {
  dispensarOnboarding, reabrirOnboarding, atualizarOnboarding, _ONBOARDING_KEY,
} from "./modules/onboarding.js";

import {
  exibirUsuarioLogado, carregarBillingInfo, _verificarRetornoStripe, iniciarUpgrade,
} from "./modules/billing.js";

import {
  carregarBalanco, carregarDashboardDespesas, carregarResumoMensal,
  carregarInsights, carregarDashboard, HANDLERS_ACAO, executarAcao, renderBotoesAcao,
  renderAlertas, renderResumo, renderSugestoes,
} from "./modules/dashboard.js";

import {
  carregarDespesas, submitDespesa, editarDespesa, deletarDespesa, _sairModoEdicaoDesp,
  carregarReceitas, submitReceita, editarReceita, deletarReceita, _sairModoEdicaoRec,
} from "./modules/financeiro.js";

import {
  carregarMoradores, submitMorador, editarMorador, deletarMorador, _sairModoEdicaoMor,
  convidarMorador, abrirModalConvite, fecharModalConvite, copiarLinkConvite,
  abrirImportacao, processarImportacao, baixarTemplate,
  gerarQRPortal, abrirModalQR, fecharModalQR, copiarURLPortal,
  gerarQRRegistro, abrirModalQRRegistro, fecharModalQRRegistro, copiarURLRegistro,
} from "./modules/moradores.js";

import {
  carregarInadimplencia, carregarTaxa, salvarTaxa,
  gerarPagamentos, carregarPagamentos, togglePagamento,
  carregarInadimplentes, baixarRelatorioPDF,
} from "./modules/inadimplencia.js";

import { gerarSugestoesContextuais, carregarIA, usarSugestao, enviarMensagemIA } from "./modules/chat_ia.js";

import { carregarAvisos, submitAviso, abrirEditarAviso, fecharModalEditarAviso, submitEditarAviso, deletarAviso } from "./modules/avisos.js";

import {
  carregarReclacoesAdmin, abrirModalResposta, fecharModalResposta, salvarRespostaRec,
} from "./modules/reclamacoes.js";

import {
  carregarEspacosAdmin, responderReserva, submitEspaco, editarEspaco, deletarEspaco,
} from "./modules/espacos.js";

import { addOpcaoVotacao, carregarVotacoesAdmin, submitVotacao, encerrarVotacao, deletarVotacao } from "./modules/votacoes.js";

import { carregarDocumentosAdmin, submitDocumento, baixarDocAdmin, deletarDocumento } from "./modules/documentos.js";

import { carregarManutencoesAdmin, submitManutencao, atualizarStatusManutencao, deletarManutencao } from "./modules/manutencoes.js";

import {
  carregarConversasAdmin, abrirConversa, carregarThreadAdmin, enviarMsgAdmin,
} from "./modules/mensagens.js";

import {
  carregarGestao, carregarUsuarios, deletarCondominio,
  abrirEditarCondominio, fecharModalEditarCondo, submitEditarCondominio,
  submitNovoCondominio, abrirVincularSindico, fecharVincularSindico, submitVincularSindico,
} from "./modules/gestao.js";

// ── Expose everything to window (for onclick= strings in dynamic HTML) ──────

Object.assign(window, {
  // navigation
  navegarPara, navigateTo, onCondominioChange, recarregarSecaoAtiva,
  atualizarSidebarNode, toggleSidebar, closeSidebar, toggleForm,
  // onboarding
  dispensarOnboarding, reabrirOnboarding, atualizarOnboarding,
  // billing
  exibirUsuarioLogado, carregarBillingInfo, iniciarUpgrade,
  // dashboard
  carregarDashboard, carregarBalanco, carregarDashboardDespesas,
  carregarResumoMensal, carregarInsights, executarAcao, renderBotoesAcao,
  // financeiro
  carregarDespesas, submitDespesa, editarDespesa, deletarDespesa, _sairModoEdicaoDesp,
  carregarReceitas, submitReceita, editarReceita, deletarReceita, _sairModoEdicaoRec,
  // moradores
  carregarMoradores, submitMorador, editarMorador, deletarMorador, _sairModoEdicaoMor,
  convidarMorador, abrirModalConvite, fecharModalConvite, copiarLinkConvite,
  abrirImportacao, processarImportacao, baixarTemplate,
  gerarQRPortal, abrirModalQR, fecharModalQR, copiarURLPortal,
  gerarQRRegistro, abrirModalQRRegistro, fecharModalQRRegistro, copiarURLRegistro,
  // inadimplência
  carregarInadimplencia, carregarTaxa, salvarTaxa,
  gerarPagamentos, carregarPagamentos, togglePagamento,
  carregarInadimplentes, baixarRelatorioPDF,
  // IA
  gerarSugestoesContextuais, carregarIA, usarSugestao, enviarMensagemIA,
  // avisos
  carregarAvisos, submitAviso, abrirEditarAviso, fecharModalEditarAviso, submitEditarAviso, deletarAviso,
  // reclamações
  carregarReclacoesAdmin, abrirModalResposta, fecharModalResposta, salvarRespostaRec,
  // espaços
  carregarEspacosAdmin, responderReserva, submitEspaco, editarEspaco, deletarEspaco,
  // votações
  addOpcaoVotacao, carregarVotacoesAdmin, submitVotacao, encerrarVotacao, deletarVotacao,
  // documentos
  carregarDocumentosAdmin, submitDocumento, baixarDocAdmin, deletarDocumento,
  // manutenções
  carregarManutencoesAdmin, submitManutencao, atualizarStatusManutencao, deletarManutencao,
  // mensagens
  carregarConversasAdmin, abrirConversa, carregarThreadAdmin, enviarMsgAdmin,
  // gestão
  carregarGestao, carregarUsuarios, deletarCondominio,
  abrirEditarCondominio, fecharModalEditarCondo, submitEditarCondominio,
  submitNovoCondominio, abrirVincularSindico, fecharVincularSindico, submitVincularSindico,
  // auth
  logout,
  // condominios (also needed by gestão mutation callbacks)
  carregarCondominios,
});

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  if (!getToken()) return;

  limparFormulario("desp-data", "rec-data");
  exibirUsuarioLogado();
  carregarBillingInfo();
  _verificarRetornoStripe();
  initClock();
  initUptime();

  // Delegated listener for payment toggle buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pid]");
    if (!btn) return;
    const pid  = Number(btn.dataset.pid);
    const pago = btn.dataset.pago === "true";
    if (!isNaN(pid)) togglePagamento(pid, pago, btn);
  });

  const usuario = getUsuario();
  if (usuario?.tipo === "ADMIN") {
    const navGestao = document.getElementById("nav-gestao");
    if (navGestao) navGestao.style.display = "";
  }
  if (usuario?.tipo === "SINDICO" && localStorage.getItem(_ONBOARDING_KEY)) {
    const navGuia = document.getElementById("nav-guia");
    if (navGuia) navGuia.style.display = "flex";
  }

  try {
    await carregarCondominios();
  } catch (err) {
    console.error(err);
    document.querySelector(".main").innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;font-family:var(--font-mono);color:var(--red);text-align:center;">
        <div style="font-size:32px;">⚠</div>
        <div style="font-size:14px;letter-spacing:2px;">API INACESSÍVEL</div>
        <div style="font-size:11px;color:var(--text-dim);">Verifique se o servidor está rodando em<br>http://127.0.0.1:8000</div>
        <button onclick="location.reload()" style="margin-top:8px;padding:10px 24px;background:rgba(255,68,102,.1);border:1px solid rgba(255,68,102,.3);color:var(--red);font-family:var(--font-mono);font-size:11px;letter-spacing:2px;border-radius:4px;cursor:pointer;">
          ↺ TENTAR NOVAMENTE
        </button>
      </div>`;
  }
}

// ES6 modules are deferred by default — DOM is already parsed here
bindNavItems();
iniciarAvisoToken();
init();
