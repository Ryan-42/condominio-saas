from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import extract
from io import BytesIO
from datetime import date
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)

from app.auth import get_db, get_usuario_logado, checar_acesso_condominio
from app.models.pagamento import Pagamento
from app.models.morador import Morador
from app.models.despesa import Despesa
from app.models.receita import Receita
from app.models.condominio import Condominio
from app.models.usuario import Usuario, TipoUsuario

router = APIRouter()

_MESES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
}

# ── Paleta Emerald / Teal ─────────────────────────────────────────────────────
VERDE_ESCURO = HexColor("#065F46")
VERDE_MEDIO  = HexColor("#10B981")
VERDE_CLARO  = HexColor("#34D399")
CIANO        = HexColor("#06B6D4")
CINZA_CLARO  = HexColor("#a7f3d0")
BRANCO       = colors.white
VERDE        = HexColor("#10B981")
VERMELHO     = HexColor("#ef4444")
AMARELO      = HexColor("#f59e0b")


@router.get("/relatorio-pdf/{condominio_id}")
def gerar_relatorio_pdf(
    condominio_id: int,
    mes: int = None,
    ano: int = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    checar_acesso_condominio(usuario, condominio_id)

    hoje = date.today()
    mes = mes or hoje.month
    ano = ano or hoje.year

    condo = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condo:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")

    nome_mes = _MESES_PT[mes]
    titulo_periodo = f"{nome_mes}/{ano}"

    # ── Dados financeiros do mês ──────────────────────────────────────────────
    receitas_q = db.query(Receita).filter(
        Receita.condominio_id == condominio_id,
        extract("month", Receita.data) == mes,
        extract("year", Receita.data) == ano
    ).all()
    despesas_q = db.query(Despesa).filter(
        Despesa.condominio_id == condominio_id,
        extract("month", Despesa.data) == mes,
        extract("year", Despesa.data) == ano
    ).all()

    total_receitas = sum(r.valor for r in receitas_q)
    total_despesas = sum(d.valor for d in despesas_q)
    saldo = total_receitas - total_despesas

    # ── Pagamentos do mês ─────────────────────────────────────────────────────
    pagamentos_q = db.query(Pagamento, Morador).join(
        Morador, Pagamento.morador_id == Morador.id
    ).filter(
        Pagamento.condominio_id == condominio_id,
        Pagamento.mes == mes,
        Pagamento.ano == ano
    ).all()

    inadimplentes_q = db.query(Pagamento, Morador).join(
        Morador, Pagamento.morador_id == Morador.id
    ).filter(
        Pagamento.condominio_id == condominio_id,
        Pagamento.pago == False
    ).all()

    # ── Build PDF ─────────────────────────────────────────────────────────────
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm
    )

    def style(name, **kwargs):
        return ParagraphStyle(name, **kwargs)

    s_title = style("Title2", fontName="Helvetica-Bold", fontSize=20,
                    textColor=VERDE_CLARO, spaceAfter=4)
    s_subtitle = style("Sub", fontName="Helvetica-Bold", fontSize=13,
                       textColor=CIANO, spaceAfter=6, spaceBefore=14)
    s_body = style("Body2", fontName="Helvetica", fontSize=9,
                   textColor=CINZA_CLARO, spaceAfter=4)
    s_caption = style("Cap", fontName="Helvetica", fontSize=8,
                      textColor=HexColor("#9ca3af"))

    def hr():
        return HRFlowable(width="100%", thickness=0.5,
                          color=VERDE_MEDIO, spaceAfter=8, spaceBefore=8)

    def section(title):
        return Paragraph(title, s_subtitle)

    # ── Cabeçalho ─────────────────────────────────────────────────────────────
    story = []
    story.append(Paragraph("CONDO//SYS", style("cs", fontName="Helvetica-Bold",
                            fontSize=9, textColor=VERDE_CLARO)))
    story.append(Spacer(1, 4))
    story.append(Paragraph(condo.nome.upper(), s_title))
    story.append(Paragraph(f"Relatório Mensal — {titulo_periodo}", s_body))
    story.append(Paragraph(
        f"Gerado em {hoje.strftime('%d/%m/%Y')}",
        s_caption
    ))
    story.append(hr())

    # ── Resumo financeiro ─────────────────────────────────────────────────────
    story.append(section("Resumo Financeiro"))

    saldo_cor = VERDE if saldo >= 0 else VERMELHO
    resumo_data = [
        ["Receitas", f"R$ {total_receitas:,.2f}"],
        ["Despesas", f"R$ {total_despesas:,.2f}"],
        ["Saldo Líquido", f"R$ {saldo:,.2f}"],
    ]
    resumo_table = Table(resumo_data, colWidths=[10*cm, 6*cm])
    resumo_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), VERDE_ESCURO),
        ("TEXTCOLOR", (0, 0), (0, -1), CINZA_CLARO),
        ("TEXTCOLOR", (1, 0), (1, 0), VERDE),
        ("TEXTCOLOR", (1, 1), (1, 1), VERMELHO),
        ("TEXTCOLOR", (1, 2), (1, 2), saldo_cor),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (1, 2), (1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [VERDE_ESCURO, HexColor("#022c22")]),
        ("GRID", (0, 0), (-1, -1), 0.3, VERDE_MEDIO),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(resumo_table)
    story.append(hr())

    # ── Inadimplentes ─────────────────────────────────────────────────────────
    story.append(section("Inadimplentes (todos os meses pendentes)"))
    if inadimplentes_q:
        agrupado = {}
        for pag, mor in inadimplentes_q:
            if mor.id not in agrupado:
                agrupado[mor.id] = {"nome": mor.nome, "apt": mor.apartamento,
                                    "meses": 0, "total": 0.0}
            agrupado[mor.id]["meses"] += 1
            agrupado[mor.id]["total"] += pag.valor

        inad_data = [["Morador", "Apartamento", "Meses", "Valor em Aberto"]]
        for v in agrupado.values():
            inad_data.append([
                v["nome"], v["apt"],
                str(v["meses"]),
                f"R$ {v['total']:,.2f}"
            ])
        inad_table = Table(inad_data, colWidths=[7*cm, 3*cm, 2.5*cm, 4*cm])
        inad_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), VERDE_MEDIO),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRANCO),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [VERDE_ESCURO, HexColor("#022c22")]),
            ("TEXTCOLOR", (0, 1), (-1, -1), CINZA_CLARO),
            ("TEXTCOLOR", (3, 1), (3, -1), VERMELHO),
            ("GRID", (0, 0), (-1, -1), 0.3, VERDE_MEDIO),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(inad_table)
    else:
        story.append(Paragraph("Nenhum inadimplente no momento.", s_body))
    story.append(hr())

    # ── Pagamentos do mês ─────────────────────────────────────────────────────
    story.append(section(f"Pagamentos — {titulo_periodo}"))
    if pagamentos_q:
        pag_data = [["Morador", "Apt.", "Valor", "Status", "Data Pgto."]]
        for pag, mor in pagamentos_q:
            status = "PAGO" if pag.pago else "PENDENTE"
            dt = pag.data_pagamento.strftime("%d/%m/%Y") if pag.data_pagamento else "—"
            pag_data.append([
                mor.nome, mor.apartamento,
                f"R$ {pag.valor:,.2f}",
                status, dt
            ])
        pag_table = Table(pag_data, colWidths=[6*cm, 2.5*cm, 3*cm, 3.5*cm, 3*cm])
        pag_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), VERDE_MEDIO),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRANCO),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [VERDE_ESCURO, HexColor("#022c22")]),
            ("TEXTCOLOR", (0, 1), (-1, -1), CINZA_CLARO),
            ("GRID", (0, 0), (-1, -1), 0.3, VERDE_MEDIO),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(pag_table)
    else:
        story.append(Paragraph("Nenhum pagamento registrado para este período.", s_body))
    story.append(hr())

    # ── Despesas do mês ───────────────────────────────────────────────────────
    story.append(section(f"Despesas — {titulo_periodo}"))
    if despesas_q:
        desp_data = [["Descrição", "Data", "Valor"]]
        for d in despesas_q:
            desp_data.append([
                d.descricao,
                d.data.strftime("%d/%m/%Y"),
                f"R$ {d.valor:,.2f}"
            ])
        desp_data.append(["TOTAL", "", f"R$ {total_despesas:,.2f}"])
        desp_table = Table(desp_data, colWidths=[9*cm, 3.5*cm, 4*cm])
        desp_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), VERDE_MEDIO),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRANCO),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), HexColor("#022c22")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (2, -1), (2, -1), VERMELHO),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2),
             [VERDE_ESCURO, HexColor("#022c22")]),
            ("TEXTCOLOR", (0, 1), (-1, -1), CINZA_CLARO),
            ("GRID", (0, 0), (-1, -1), 0.3, VERDE_MEDIO),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(desp_table)
    else:
        story.append(Paragraph("Nenhuma despesa registrada para este período.", s_body))

    # ── Rodapé ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.3, color=VERDE_CLARO))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "CONDO//SYS — Sistema de Gestão de Condomínios",
        style("footer", fontName="Helvetica", fontSize=7, textColor=VERDE_CLARO)
    ))

    doc.build(story)
    buffer.seek(0)

    filename = f"relatorio_{condo.nome.replace(' ', '_')}_{mes:02d}_{ano}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )