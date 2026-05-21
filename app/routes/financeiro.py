from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.receita import Receita
from app.models.despesa import Despesa
from app.models.usuario import Usuario
from app.auth import get_db, get_usuario_logado, checar_acesso_condominio

router = APIRouter()


@router.get("/financeiro/{condominio_id}")
def balanco_financeiro(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)

    total_receitas = db.query(func.sum(Receita.valor)).filter(
        Receita.condominio_id == condominio_id
    ).scalar() or 0.0

    total_despesas = db.query(func.sum(Despesa.valor)).filter(
        Despesa.condominio_id == condominio_id
    ).scalar() or 0.0

    return {
        "condominio_id":  condominio_id,
        "total_receitas": round(total_receitas, 2),
        "total_despesas": round(total_despesas, 2),
        "saldo":          round(total_receitas - total_despesas, 2),
    }