import csv
import io
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, checar_acesso_condominio
from app.models.despesa import Despesa
from app.models.receita import Receita
from app.models.usuario import Usuario

router = APIRouter()


@router.get("/relatorio/{condominio_id}")
def exportar_relatorio_csv(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    """
    Gera e retorna um CSV com todas as despesas e receitas do condomínio.
    O navegador faz o download automaticamente.
    """
    checar_acesso_condominio(usuario, condominio_id)

    despesas = db.query(Despesa).filter(
        Despesa.condominio_id == condominio_id
    ).order_by(Despesa.data).all()

    receitas = db.query(Receita).filter(
        Receita.condominio_id == condominio_id
    ).order_by(Receita.data).all()

    # Monta CSV em memória
    output = io.StringIO()
    writer = csv.writer(output)

    # Cabeçalho do arquivo
    writer.writerow([f"RELATÓRIO FINANCEIRO — CONDOMÍNIO #{condominio_id}"])
    writer.writerow([f"Gerado em: {date.today().strftime('%d/%m/%Y')}"])
    writer.writerow([])

    # Seção de despesas
    writer.writerow(["=== DESPESAS ==="])
    writer.writerow(["ID", "Descrição", "Valor (R$)", "Data"])
    for d in despesas:
        writer.writerow([
            d.id,
            d.descricao,
            f"{d.valor:.2f}".replace(".", ","),
            d.data.strftime("%d/%m/%Y") if d.data else "",
        ])

    total_desp = sum(d.valor for d in despesas)
    writer.writerow(["", "TOTAL DESPESAS", f"{total_desp:.2f}".replace(".", ","), ""])
    writer.writerow([])

    # Seção de receitas
    writer.writerow(["=== RECEITAS ==="])
    writer.writerow(["ID", "Descrição", "Valor (R$)", "Data"])
    for r in receitas:
        writer.writerow([
            r.id,
            r.descricao,
            f"{r.valor:.2f}".replace(".", ","),
            r.data.strftime("%d/%m/%Y") if r.data else "",
        ])

    total_rec = sum(r.valor for r in receitas)
    writer.writerow(["", "TOTAL RECEITAS", f"{total_rec:.2f}".replace(".", ","), ""])
    writer.writerow([])

    # Saldo final
    saldo = total_rec - total_desp
    writer.writerow(["=== SALDO FINAL ==="])
    writer.writerow(["", "SALDO", f"{saldo:.2f}".replace(".", ","), ""])

    # Prepara resposta para download
    output.seek(0)
    nome_arquivo = f"relatorio_condo_{condominio_id}_{date.today().strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={nome_arquivo}"},
    )