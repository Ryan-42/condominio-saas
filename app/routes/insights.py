import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from collections import defaultdict

logger = logging.getLogger(__name__)

from app.auth import get_db, get_usuario_logado, checar_acesso_condominio
from app.models.despesa import Despesa
from app.models.receita import Receita
from app.models.usuario import Usuario

router = APIRouter()


# ── Mapa de ações disponíveis ─────────────────────────────────
#
# Cada ação tem:
#   - label:    texto exibido no botão
#   - tipo:     estilo visual (primario, secundario, perigo)
#   - handler:  identificador usado pelo frontend para executar
#
ACOES = {
    "ver_despesas": {
        "label":   "Ver Despesas",
        "tipo":    "primario",
        "handler": "ver_despesas",
    },
    "ver_receitas": {
        "label":   "Ver Receitas",
        "tipo":    "primario",
        "handler": "ver_receitas",
    },
    "exportar_relatorio": {
        "label":   "Exportar CSV",
        "tipo":    "secundario",
        "handler": "exportar_relatorio",
    },
    "notificar_sindico": {
        "label":   "Notificar Síndico",
        "tipo":    "secundario",
        "handler": "notificar_sindico",
    },
}

def _acoes(*chaves) -> list:
    """Retorna a lista de ações a partir das chaves informadas."""
    return [ACOES[k] for k in chaves if k in ACOES]


# ── Endpoint principal ────────────────────────────────────────

@router.get("/insights/{condominio_id}")
def gerar_insights(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)

    alertas   = []
    resumo    = []
    sugestoes = []
    hoje      = date.today()

    # ── Coleta ───────────────────────────────────────────────

    total_receitas = db.query(func.sum(Receita.valor)).filter(
        Receita.condominio_id == condominio_id
    ).scalar() or 0.0

    total_despesas = db.query(func.sum(Despesa.valor)).filter(
        Despesa.condominio_id == condominio_id
    ).scalar() or 0.0

    saldo = total_receitas - total_despesas

    despesas_all = db.query(Despesa).filter(
        Despesa.condominio_id == condominio_id,
        Despesa.data.isnot(None),
    ).all()

    receitas_all = db.query(Receita).filter(
        Receita.condominio_id == condominio_id,
        Receita.data.isnot(None),
    ).all()

    desp_por_mes = defaultdict(float)
    for d in despesas_all:
        desp_por_mes[d.data.strftime("%Y-%m")] += d.valor

    rec_por_mes = defaultdict(float)
    for r in receitas_all:
        rec_por_mes[r.data.strftime("%Y-%m")] += r.valor

    mes_atual     = hoje.strftime("%Y-%m")
    meses_validos = sorted([m for m in desp_por_mes if m <= mes_atual])
    mes_anterior  = meses_validos[-2] if len(meses_validos) >= 2 else None

    desp_mes_atual    = desp_por_mes.get(mes_atual, 0.0)
    desp_mes_anterior = desp_por_mes.get(mes_anterior, 0.0) if mes_anterior else 0.0
    rec_mes_atual     = rec_por_mes.get(mes_atual, 0.0)

    # ── ALERTAS com ações ─────────────────────────────────────

    # 1. Saldo negativo
    if saldo < 0:
        alertas.append({
            "tipo":     "CRITICO",
            "icone":    "🔴",
            "nivel":    "critico",
            "mensagem": f"Saldo negativo de R$ {abs(saldo):,.2f}. O condomínio está gastando mais do que arrecada.",
            "acoes":    _acoes("ver_despesas", "ver_receitas", "exportar_relatorio", "notificar_sindico"),
        })

    # 2. Saldo baixo
    elif total_receitas > 0 and saldo < (total_receitas * 0.10):
        alertas.append({
            "tipo":     "ATENCAO",
            "icone":    "🟡",
            "nivel":    "atencao",
            "mensagem": f"Saldo baixo: R$ {saldo:,.2f} — menos de 10% das receitas totais.",
            "acoes":    _acoes("ver_despesas", "exportar_relatorio"),
        })

    # 3. Aumento de despesas mês a mês
    if desp_mes_anterior > 0 and desp_mes_atual > 0:
        variacao_pct = ((desp_mes_atual - desp_mes_anterior) / desp_mes_anterior) * 100

        if variacao_pct >= 20:
            # Notifica síndico apenas em aumento crítico (>= 50%)
            acoes_variacao = ["ver_despesas", "exportar_relatorio"]
            if variacao_pct >= 50:
                acoes_variacao.append("notificar_sindico")

            alertas.append({
                "tipo":     "ATENCAO",
                "icone":    "📈",
                "nivel":    "atencao",
                "mensagem": f"Despesas aumentaram {variacao_pct:.1f}% em relação ao mês anterior ({mes_anterior}).",
                "acoes":    _acoes(*acoes_variacao),
            })

        elif variacao_pct <= -20:
            alertas.append({
                "tipo":     "POSITIVO",
                "icone":    "📉",
                "nivel":    "positivo",
                "mensagem": f"Despesas reduziram {abs(variacao_pct):.1f}% em relação ao mês anterior. Bom trabalho!",
                "acoes":    _acoes("exportar_relatorio"),
            })

    # 4. Despesas do mês maiores que receitas do mês
    if rec_mes_atual > 0 and desp_mes_atual > rec_mes_atual:
        alertas.append({
            "tipo":     "ATENCAO",
            "icone":    "⚠️",
            "nivel":    "atencao",
            "mensagem": f"Despesas de {mes_atual} (R$ {desp_mes_atual:,.2f}) superaram as receitas do mês (R$ {rec_mes_atual:,.2f}).",
            "acoes":    _acoes("ver_despesas", "ver_receitas", "notificar_sindico"),
        })

    # 5. Sem receitas
    if total_receitas == 0:
        alertas.append({
            "tipo":     "ATENCAO",
            "icone":    "⚠️",
            "nivel":    "atencao",
            "mensagem": "Nenhuma receita cadastrada. Verifique se as taxas condominiais estão sendo lançadas.",
            "acoes":    _acoes("ver_receitas"),
        })

    # ── RESUMO ────────────────────────────────────────────────

    resumo.append({
        "titulo": "Balanço Geral",
        "valor":  f"Receitas R$ {total_receitas:,.2f} · Despesas R$ {total_despesas:,.2f} · Saldo R$ {saldo:,.2f}",
    })

    if desp_por_mes:
        mes_maior = max(desp_por_mes, key=desp_por_mes.get)
        resumo.append({
            "titulo": "Mês com Maior Gasto",
            "valor":  f"{mes_maior} — R$ {desp_por_mes[mes_maior]:,.2f}",
        })

    if len(desp_por_mes) >= 2:
        mes_menor = min(desp_por_mes, key=desp_por_mes.get)
        resumo.append({
            "titulo": "Mês com Menor Gasto",
            "valor":  f"{mes_menor} — R$ {desp_por_mes[mes_menor]:,.2f}",
        })

    if len(meses_validos) >= 3:
        ultimos_3 = [desp_por_mes[m] for m in meses_validos[-3:]]
        if ultimos_3[-1] > ultimos_3[0]:
            tendencia = "📈 Despesas em tendência de ALTA nos últimos 3 meses"
        elif ultimos_3[-1] < ultimos_3[0]:
            tendencia = "📉 Despesas em tendência de QUEDA nos últimos 3 meses"
        else:
            tendencia = "➡️ Despesas estáveis nos últimos 3 meses"
        resumo.append({"titulo": "Tendência", "valor": tendencia})

    if desp_por_mes:
        media = sum(desp_por_mes.values()) / len(desp_por_mes)
        resumo.append({"titulo": "Média Mensal de Despesas", "valor": f"R$ {media:,.2f}"})

    resumo.append({
        "titulo": "Histórico Disponível",
        "valor":  f"{len(desp_por_mes)} meses com dados de despesas",
    })

    # ── SUGESTÕES ─────────────────────────────────────────────

    if total_receitas > 0:
        reserva_ideal = total_receitas * 0.15
        if saldo < reserva_ideal:
            sugestoes.append(
                f"💡 Mantenha uma reserva de emergência de pelo menos 15% das receitas (R$ {reserva_ideal:,.2f}). Saldo atual está abaixo disso."
            )
        else:
            sugestoes.append(
                f"✅ Reserva de emergência adequada. O saldo (R$ {saldo:,.2f}) supera os 15% recomendados."
            )

    if desp_mes_anterior > 0 and desp_mes_atual > desp_mes_anterior:
        sugestoes.append(
            "💡 Despesas crescendo. Revise contratos de fornecedores e identifique gastos que possam ser reduzidos."
        )

    if total_receitas > 0 and total_despesas / total_receitas > 0.80:
        sugestoes.append(
            "💡 Despesas representam mais de 80% das receitas. Avalie receitas extras como aluguel de espaços comuns."
        )

    if len(desp_por_mes) >= 3:
        sugestoes.append(
            "💡 Com histórico de 3+ meses, crie um orçamento anual baseado na média mensal para melhor controle."
        )

    if not alertas:
        sugestoes.append("✅ Situação financeira estável. Continue monitorando os lançamentos mensalmente.")

    logger.info("Condomínio #%s analisado em %s — %d alerta(s)", condominio_id, hoje, len(alertas))

    return {
        "condominio_id": condominio_id,
        "gerado_em":     hoje.strftime("%d/%m/%Y"),
        "alertas":       alertas,
        "resumo":        resumo,
        "sugestoes":     sugestoes,
    }