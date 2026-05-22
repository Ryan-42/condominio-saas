from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from collections import defaultdict

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.despesa import Despesa
from app.models.usuario import Usuario, TipoUsuario
from app.schemas.despesa import DespesaCreate, Despesa as DespesaSchema

router = APIRouter()


# ── ROTAS PRINCIPAIS (SEM PARÂMETRO DINÂMICO) ─────────────────

@router.get("/despesas", response_model=list[DespesaSchema])
def listar_despesas(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    if usuario.tipo == TipoUsuario.ADMIN:
        return db.query(Despesa).offset(skip).limit(limit).all()
    if usuario.condominio_id is None:
        raise HTTPException(status_code=403, detail="Usuário não vinculado a nenhum condomínio")
    return db.query(Despesa).filter(
        Despesa.condominio_id == usuario.condominio_id
    ).offset(skip).limit(limit).all()


# ── FILTROS ───────────────────────────────────────────────────

@router.get("/despesas/por-condominio", response_model=list[DespesaSchema])
def despesas_por_condominio(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    checar_acesso_condominio(usuario, condominio_id)
    despesas = db.query(Despesa).filter(
        Despesa.condominio_id == condominio_id
    ).all()

    if not despesas:
        raise HTTPException(status_code=404, detail="Nenhuma despesa encontrada")

    return despesas


@router.get("/despesas/por-periodo", response_model=list[DespesaSchema])
def despesas_por_periodo(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    condominio_id: int = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    if data_inicio > data_fim:
        raise HTTPException(
            status_code=400,
            detail="data_inicio não pode ser maior que data_fim"
        )

    cid = usuario.condominio_id if usuario.tipo == TipoUsuario.SINDICO else condominio_id

    if not cid:
        raise HTTPException(
            status_code=400,
            detail="ADMIN deve informar condominio_id"
        )

    checar_acesso_condominio(usuario, cid)

    despesas = db.query(Despesa).filter(
        Despesa.condominio_id == cid,
        Despesa.data >= data_inicio,
        Despesa.data <= data_fim
    ).all()

    if not despesas:
        raise HTTPException(
            status_code=404,
            detail="Nenhuma despesa encontrada neste período"
        )

    return despesas


# 🔥 ROTA AJUSTADA PARA EVITAR CONFLITO
@router.get("/despesas/mensal/resumo/{condominio_id}")
def resumo_mensal(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    checar_acesso_condominio(usuario, condominio_id)

    despesas = db.query(Despesa).filter(
        Despesa.condominio_id == condominio_id,
        Despesa.data.isnot(None)
    ).all()

    totais = defaultdict(float)

    for d in despesas:
        chave = d.data.strftime("%Y-%m")
        totais[chave] = round(totais[chave] + d.valor, 2)

    return dict(sorted(totais.items()))


@router.get("/resumo/{condominio_id}")
def resumo_financeiro(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    checar_acesso_condominio(usuario, condominio_id)

    hoje = date.today()

    resultado = db.query(
        func.sum(Despesa.valor).label("total"),
        func.count(Despesa.id).label("quantidade"),
        func.avg(Despesa.valor).label("media")
    ).filter(
        Despesa.condominio_id == condominio_id
    ).first()

    primeiro_dia = hoje.replace(day=1)

    total_mes = db.query(func.sum(Despesa.valor)).filter(
        Despesa.condominio_id == condominio_id,
        Despesa.data >= primeiro_dia,
        Despesa.data <= hoje
    ).scalar()

    return {
        "condominio_id": condominio_id,
        "total_despesas": round(resultado.total or 0.0, 2),
        "quantidade_despesas": resultado.quantidade or 0,
        "media_despesas": round(resultado.media or 0.0, 2),
        "despesas_mes_atual": round(total_mes or 0.0, 2),
        "mes_referencia": hoje.strftime("%Y-%m")
    }


# ── ROTAS DINÂMICAS (SEMPRE POR ÚLTIMO) ───────────────────────

@router.get("/despesas/{despesa_id}", response_model=DespesaSchema)
def buscar_despesa(
    despesa_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    d = db.query(Despesa).filter(Despesa.id == despesa_id).first()

    if not d:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")

    checar_acesso_condominio(usuario, d.condominio_id)
    return d


@router.post("/despesas", response_model=DespesaSchema)
def criar_despesa(
    despesa: DespesaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor)
):
    checar_acesso_condominio(usuario, despesa.condominio_id)

    nova = Despesa(**despesa.model_dump())
    db.add(nova)
    db.commit()
    db.refresh(nova)

    return nova


@router.put("/despesas/{despesa_id}", response_model=DespesaSchema)
def atualizar_despesa(
    despesa_id: int,
    dados: DespesaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor)
):
    d = db.query(Despesa).filter(Despesa.id == despesa_id).first()

    if not d:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")

    checar_acesso_condominio(usuario, d.condominio_id)

    for campo, valor in dados.model_dump().items():
        if campo != "condominio_id":
            setattr(d, campo, valor)

    db.commit()
    db.refresh(d)

    return d


@router.delete("/despesas/{despesa_id}", status_code=204)
def deletar_despesa(
    despesa_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor)
):
    d = db.query(Despesa).filter(Despesa.id == despesa_id).first()

    if not d:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")

    checar_acesso_condominio(usuario, d.condominio_id)

    db.delete(d)
    db.commit()