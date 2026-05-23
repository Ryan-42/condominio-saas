import { state } from "../core/state.js";
import { fetchAPI, postAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { formatarMoeda, formatarData } from "../ui/utils.js";
import { exibirToast, setBtnLoading } from "../ui/notifications.js";

function mostrarTyping() {
  const area = document.getElementById("ia-chat-area");
  if (document.getElementById("ia-typing-live")) return;
  const el = document.createElement("div");
  el.id = "ia-typing-live";
  el.className = "ia-msg ia-msg-bot";
  el.innerHTML = `
    <div class="ia-avatar">✦</div>
    <div class="ia-msg-bubble ia-msg-bubble-bot ia-typing">
      <span class="ia-typing-dot"></span>
      <span class="ia-typing-dot"></span>
      <span class="ia-typing-dot"></span>
    </div>`;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

function esconderTyping() {
  document.getElementById("ia-typing-live")?.remove();
}

function formatarRespostaIA(texto) {
  const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc(texto)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, '<div class="ia-section-title">$1</div>')
    .replace(/^## (.+)$/gm,  '<div class="ia-section-title">$1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="list-style:decimal;margin-left:1.2rem">$2</li>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>(?:\n|$))+/g, (m) => `<ul style="margin:.3rem 0 .3rem 1rem;padding:0">${m}</ul>`)
    .replace(/R\$\s?[\d.,]+/g, (m) => `<span class="ia-valor">${m}</span>`)
    .replace(/⚠|⚠️/g, '<span style="color:var(--red)">⚠</span>')
    .replace(/✅|✔/g, '<span style="color:var(--p2)">✔</span>')
    .replace(/\n/g, "<br>");
}

export function gerarSugestoesContextuais() {
  const container = document.querySelector(".ia-sugestoes-row");
  if (!container) return;

  if (!state._dadosIA) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:11px;padding:8px">Carregando sugestões…</div>';
    return;
  }

  const d = state._dadosIA;
  const base = [
    { texto: "Faça um resumo financeiro completo",         icone: "◈" },
    { texto: "Gera um comunicado sobre assembleia geral",  icone: "✉" },
    { texto: "Qual foi meu maior gasto?",                  icone: "↓" },
    { texto: "Como posso reduzir despesas?",               icone: "◆" },
  ];

  if (d.saldo < 0) {
    base.unshift({ texto: "Por que meu saldo está negativo e o que fazer?", icone: "⚠" });
  }
  if (d.total_inadimplentes > 0) {
    const pct = d.total_moradores ? Math.round(d.total_inadimplentes / d.total_moradores * 100) : 0;
    base.unshift({ texto: `${d.total_inadimplentes} inadimplentes (${pct}%): quais ações tomar?`, icone: "⚠" });
  }
  if (d.reclamacoes_abertas > 0) {
    base.push({ texto: `Há ${d.reclamacoes_abertas} reclamação(ões) em aberto. Como priorizar?`, icone: "📋" });
  }
  if (d.votacoes_ativas > 0) {
    base.push({ texto: `Há ${d.votacoes_ativas} votação(ões) ativa(s). Crie um comunicado de lembrete`, icone: "🗳" });
  }
  if (d.manutencoes && d.manutencoes.length > 0) {
    const m = d.manutencoes[0];
    base.push({ texto: `Manutenção de ${m.categoria} agendada — escreva um aviso para os moradores`, icone: "🔧" });
  }

  container.innerHTML = base.slice(0, 5).map((s) =>
    `<button class="ia-sugestao-btn" data-sugestao="${escHTML(s.texto)}">${escHTML(s.icone)} ${escHTML(s.texto)}</button>`
  ).join("");
  container.querySelectorAll("[data-sugestao]").forEach((btn) => {
    btn.addEventListener("click", () => usarSugestao(btn.dataset.sugestao));
  });
}

function salvarHistoricoIA() {
  if (state._iaHistorico.length && state.CONDOMINIO_ID) {
    sessionStorage.setItem(`ia_hist_${state.CONDOMINIO_ID}`, JSON.stringify(state._iaHistorico.slice(-40)));
  }
}

function restaurarHistoricoIA() {
  if (!state.CONDOMINIO_ID) return;
  const saved = sessionStorage.getItem(`ia_hist_${state.CONDOMINIO_ID}`);
  if (!saved) return;
  try {
    state._iaHistorico = JSON.parse(saved);
    state._iaHistorico.forEach((msg) => {
      renderMensagem(msg.content, msg.role === "user" ? "user" : "bot");
    });
  } catch { state._iaHistorico = []; }
}

export async function carregarIA() {
  if (!state.CONDOMINIO_ID) return;

  if (!state._iaIniciada) {
    state._iaIniciada = true;
    setTimeout(() => document.getElementById("ia-input")?.focus(), 100);
  }

  state._iaHistorico = [];
  document.getElementById("ia-chat-area").innerHTML = `
    <div class="ia-msg ia-msg-bot">
      <div class="ia-avatar">✦</div>
      <div class="ia-msg-bubble ia-msg-bubble-bot">
        <span class="ia-label">CONDO//AI</span>
        Olá! Sou o assistente inteligente do seu condomínio.<br>
        Conheço seus dados financeiros em tempo real: saldo, despesas, receitas e inadimplentes.<br>
        Como posso ajudar?
      </div>
    </div>`;

  try {
    state._dadosIA = await fetchAPI(`/ai/dados/${state.CONDOMINIO_ID}`);
  } catch (_) {
    state._dadosIA = null;
  }

  restaurarHistoricoIA();
  gerarSugestoesContextuais();
}

function renderMensagem(texto, tipo) {
  const area = document.getElementById("ia-chat-area");
  const wrap = document.createElement("div");
  wrap.className = `ia-msg ia-msg-${tipo}`;
  if (tipo === "bot") {
    wrap.innerHTML = `
      <div class="ia-avatar">✦</div>
      <div class="ia-msg-bubble ia-msg-bubble-bot">
        <span class="ia-label">CONDO//AI</span>
        ${formatarRespostaIA(texto)}
      </div>`;
  } else {
    wrap.innerHTML = `
      <div class="ia-msg-bubble ia-msg-bubble-user"></div>
      <div class="ia-avatar">◉</div>`;
    wrap.querySelector(".ia-msg-bubble-user").textContent = texto;
  }
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

export function usarSugestao(texto) {
  const input = document.getElementById("ia-input");
  if (!input) return;
  input.value = texto;
  enviarMensagemIA();
}

function processarPerguntaIA(msg) {
  if (!state._dadosIA) {
    return "⚠ Não consegui carregar os dados do condomínio. Tente recarregar a página.";
  }
  const d   = state._dadosIA;
  const txt = msg.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  if (/saldo|situacao|financ|balanc|dinheiro|caixa/.test(txt)) {
    const status = d.saldo >= 0 ? "✔ POSITIVO" : "⚠ NEGATIVO";
    return `◆ SITUAÇÃO FINANCEIRA — ${d.condominio.toUpperCase()}

Status: ${status}
Saldo líquido:     ${formatarMoeda(d.saldo)}
Total de receitas: ${formatarMoeda(d.total_receitas)}
Total de despesas: ${formatarMoeda(d.total_despesas)}
Taxa mensal:       ${formatarMoeda(d.taxa_mensal)}

${d.saldo < 0
  ? "⚠ Atenção: o condomínio está com saldo negativo. Verifique as despesas e a arrecadação."
  : "✔ O caixa está positivo. Bom trabalho na gestão financeira!"}`;
  }

  if (/inadimpl|devendo|deve|atraso|pendente|pagar/.test(txt)) {
    if (!d.inadimplentes.length) {
      return "✔ Ótima notícia! Não há moradores inadimplentes no momento.\nTodos os pagamentos estão em dia.";
    }
    const lista = d.inadimplentes
      .map((i, n) => `${n + 1}. ${i.nome} — Apto ${i.apartamento} — ${formatarMoeda(i.valor)} em aberto`)
      .join("\n");
    const total = d.inadimplentes.reduce((acc, i) => acc + i.valor, 0);
    return `⚠ INADIMPLENTES — ${d.inadimplentes.length} morador(es)\n\n${lista}\n\nTotal em aberto: ${formatarMoeda(total)}\n\nAcesse a aba INADIMPLÊNCIA para marcar pagamentos.`;
  }

  if (/maior.*(gasto|despesa)|gasto.*maior|despesa.*maior|mais.*caro/.test(txt)) {
    if (!d.despesas.length) return "Nenhuma despesa registrada ainda.";
    const top  = d.despesas[0];
    const top5 = d.despesas.slice(0, 5);
    const lista = top5.map((dp, n) => `${n + 1}. ${dp.descricao} — ${formatarMoeda(dp.valor)} em ${formatarData(dp.data)}`).join("\n");
    return `↓ MAIORES DESPESAS — ${d.condominio.toUpperCase()}\n\nMaior gasto: ${top.descricao} — ${formatarMoeda(top.valor)}\nData: ${formatarData(top.data)}\n\nTop 5 despesas:\n${lista}`;
  }

  if (/despesa|gasto|custo|paguei|pagamos/.test(txt)) {
    if (!d.despesas.length) return "Nenhuma despesa registrada ainda.";
    const lista = d.despesas.slice(0, 8).map((dp, n) => `${n + 1}. ${dp.descricao} — ${formatarMoeda(dp.valor)} — ${formatarData(dp.data)}`).join("\n");
    return `↓ DESPESAS REGISTRADAS — ${d.despesas.length} no total\n\n${lista}\n\nTotal acumulado: ${formatarMoeda(d.total_despesas)}`;
  }

  if (/receita|entrada|arrecad|receb/.test(txt)) {
    if (!d.receitas.length) return "Nenhuma receita registrada ainda.";
    const lista = d.receitas.slice(0, 8).map((r, n) => `${n + 1}. ${r.descricao} — ${formatarMoeda(r.valor)} — ${formatarData(r.data)}`).join("\n");
    return `↑ RECEITAS REGISTRADAS — ${d.receitas.length} no total\n\n${lista}\n\nTotal arrecadado: ${formatarMoeda(d.total_receitas)}`;
  }

  if (/morador|condoimin|residente|apartamento|quantos/.test(txt)) {
    const lista = d.moradores.slice(0, 10).map((m, n) => `${n + 1}. ${m.nome} — Apto ${m.apartamento}`).join("\n");
    const resto = d.total_moradores > 10 ? `\n... e mais ${d.total_moradores - 10} morador(es).` : "";
    return `◉ MORADORES — ${d.total_moradores} cadastrado(s)\n\n${lista}${resto}\n\nInadimplentes: ${d.total_inadimplentes} de ${d.total_moradores}`;
  }

  if (/taxa|mensalidade|condominio|fee/.test(txt)) {
    if (!d.taxa_mensal) return "⚠ A taxa mensal ainda não foi configurada.\nAcesse a aba INADIMPLÊNCIA para definir o valor.";
    const arrecadacao = d.taxa_mensal * (d.total_moradores - d.total_inadimplentes);
    const potencial   = d.taxa_mensal * d.total_moradores;
    return `$ TAXA CONDOMINIAL\n\nValor configurado: ${formatarMoeda(d.taxa_mensal)}/mês\nMoradores pagantes: ${d.total_moradores - d.total_inadimplentes} de ${d.total_moradores}\nArrecadação atual:  ${formatarMoeda(arrecadacao)}\nPotencial máximo:   ${formatarMoeda(potencial)}\nPerda por inadimplência: ${formatarMoeda(potencial - arrecadacao)}`;
  }

  if (/comunicado|assembleia|aviso|notific|circular/.test(txt)) {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    return `✉ COMUNICADO — ${d.condominio.toUpperCase()}\n\n─────────────────────────────────────\n           CONVOCAÇÃO DE ASSEMBLEIA\n─────────────────────────────────────\n\nPrezados Condôminos,\n\nComunicamos que será realizada Assembleia Geral Ordinária do\n${d.condominio}, para deliberação sobre assuntos de interesse\ncondominial, conforme pauta a ser divulgada.\n\nData: a definir\nHorário: a definir\nLocal: Salão de Festas / Área comum\n\nA presença de todos é fundamental para o bom\nfuncionamento do nosso condomínio.\n\nAtenciosamente,\nA Administração — ${d.condominio}\n${hoje}\n─────────────────────────────────────\n\n💡 Dica: Copie este texto e cole no Mural de Avisos.`;
  }

  if (/resumo|relatorio|overview|geral|tudo|completo/.test(txt)) {
    const saude = d.saldo >= 0 ? "✔ SAUDÁVEL" : "⚠ ATENÇÃO NECESSÁRIA";
    return `◈ RESUMO COMPLETO — ${d.condominio.toUpperCase()}\n\nSAÚDE FINANCEIRA: ${saude}\n\n── FINANCEIRO ──────────────────────\nReceitas:  ${formatarMoeda(d.total_receitas)}\nDespesas:  ${formatarMoeda(d.total_despesas)}\nSaldo:     ${formatarMoeda(d.saldo)}\nTaxa/mês:  ${formatarMoeda(d.taxa_mensal)}\n\n── MORADORES ───────────────────────\nTotal:        ${d.total_moradores} morador(es)\nEm dia:       ${d.total_moradores - d.total_inadimplentes}\nInadimplentes: ${d.total_inadimplentes}\n\n── TRANSAÇÕES ──────────────────────\nDespesas registradas: ${d.despesas.length}\nReceitas registradas: ${d.receitas.length}${d.despesas.length ? `\n\nMaior gasto: ${d.despesas[0].descricao} — ${formatarMoeda(d.despesas[0].valor)}` : ""}`;
  }

  if (/ajuda|help|comando|o que|oque|pode|consegue/.test(txt)) {
    return `✦ CONDO//AI — COMANDOS DISPONÍVEIS\n\nPosso responder sobre:\n\n📊 Financeiro\n   → "Como está meu saldo?"\n   → "Mostre as receitas"\n   → "Liste as despesas"\n   → "Qual foi o maior gasto?"\n\n👥 Moradores\n   → "Quem está devendo?"\n   → "Quantos moradores temos?"\n\n💰 Taxa\n   → "Qual é a taxa mensal?"\n\n✉ Comunicados\n   → "Gera um comunicado de assembleia"\n\n📋 Geral\n   → "Resumo completo do condomínio"\n\nDigite qualquer uma dessas perguntas!`;
  }

  return `Não entendi completamente sua pergunta. Tente algo como:\n\n• "Como está meu saldo?"\n• "Quem está devendo?"\n• "Qual foi meu maior gasto?"\n• "Mostre as despesas"\n• "Quantos moradores temos?"\n• "Gera um comunicado de assembleia"\n• "Resumo completo"\n\nDigite "ajuda" para ver todos os comandos.`;
}

export async function enviarMensagemIA() {
  const input = document.getElementById("ia-input");
  const mensagem = input.value.trim();
  if (!mensagem) return;
  if (!state.CONDOMINIO_ID) {
    exibirToast("⚠ Selecione um condomínio primeiro", "erro");
    return;
  }

  renderMensagem(mensagem, "user");
  input.value = "";

  setBtnLoading("ia-btn-enviar", "ia-btn-enviar-label", true, "▶ ENVIAR");
  mostrarTyping();

  let tentativas = 0;
  const MAX_TENTATIVAS = 2;

  const enviarComRetry = async () => {
    try {
      const data = await postAPI("/ai/chat", {
        mensagem,
        condominio_id: state.CONDOMINIO_ID,
        historico: state._iaHistorico,
      });
      state._iaHistorico.push({ role: "user", content: mensagem });
      state._iaHistorico.push({ role: "assistant", content: data.resposta });
      salvarHistoricoIA();
      esconderTyping();
      renderMensagem(data.resposta, "bot");
    } catch (err) {
      const is503 = err.message && (err.message.includes("503") || err.message.toLowerCase().includes("temporariamente indispon"));
      const isRate = err.message && err.message.includes("429");
      if ((is503 || isRate) && tentativas < MAX_TENTATIVAS) {
        tentativas++;
        await new Promise((r) => setTimeout(r, 1200 * tentativas));
        return enviarComRetry();
      }
      esconderTyping();
      renderMensagem(
        is503 && !err.message?.toLowerCase().includes("indispon")
          ? "⚠ Serviço de IA indisponível. A chave GROQ_API_KEY não está configurada no servidor."
          : isRate
          ? "⚠ Limite de requisições atingido. Aguarde alguns segundos e tente novamente."
          : `⚠ ${err.message || "Erro ao processar. Tente novamente."}`,
        "bot"
      );
    } finally {
      if (tentativas === 0 || tentativas >= MAX_TENTATIVAS) {
        setBtnLoading("ia-btn-enviar", "ia-btn-enviar-label", false, "▶ ENVIAR");
        input.focus();
      }
    }
  };

  try {
    await enviarComRetry();
  } finally {
    setBtnLoading("ia-btn-enviar", "ia-btn-enviar-label", false, "▶ ENVIAR");
    input.focus();
  }
}
