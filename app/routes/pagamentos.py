from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError
from datetime import date
from dateutil.relativedelta import relativedelta

from app.auth import get_db, get_usuario_logado, somente_gestor, UsuarioMorador, checar_acesso_condominio
from app.models.pagamento import TaxaCondominio, Pagamento
from app.models.morador import Morador
from app.models.usuario import Usuario, TipoUsuario
from app.schemas.pagamento import (
    TaxaCondominioCreate, TaxaCondominioOut,
    PagamentoOut, PagamentoUpdate, InadimplenteOut
)

router = APIRouter()


# ─── TAXA ────────────────────────────────────────────────────────────────────

@router.get("/taxa/{condominio_id}", response_model=TaxaCondominioOut)
def get_taxa(condominio_id: int, db: Session = Depends(get_db),
             usuario: Usuario = Depends(get_usuario_logado)):
    checar_acesso_condominio(usuario, condominio_id)
    taxa = db.query(TaxaCondominio).filter(
        TaxaCondominio.condominio_id == condominio_id
    ).first()
    if not taxa:
        raise HTTPException(status_code=404, detail="Taxa não configurada")
    return taxa


@router.post("/taxa/{condominio_id}", response_model=TaxaCondominioOut)
def set_taxa(condominio_id: int, body: TaxaCondominioCreate,
             db: Session = Depends(get_db),
             usuario: Usuario = Depends(somente_gestor)):
    checar_acesso_condominio(usuario, condominio_id)
    taxa = db.query(TaxaCondominio).filter(
        TaxaCondominio.condominio_id == condominio_id
    ).first()
    if taxa:
        taxa.valor = body.valor
    else:
        taxa = TaxaCondominio(condominio_id=condominio_id, valor=body.valor)
        db.add(taxa)
    db.commit()
    db.refresh(taxa)
    return taxa


# ─── GERAR PAGAMENTOS ────────────────────────────────────────────────────────

@router.post("/pagamentos/gerar/{condominio_id}")
def gerar_pagamentos(condominio_id: int, db: Session = Depends(get_db),
                     usuario: Usuario = Depends(somente_gestor)):
    checar_acesso_condominio(usuario, condominio_id)

    taxa = db.query(TaxaCondominio).filter(
        TaxaCondominio.condominio_id == condominio_id
    ).first()
    if not taxa:
        raise HTTPException(status_code=400, detail="Configure a taxa antes de gerar cobranças")

    moradores = db.query(Morador).filter(Morador.condominio_id == condominio_id).all()
    if not moradores:
        raise HTTPException(status_code=400, detail="Nenhum morador cadastrado")

    hoje = date.today()
    meses = []
    for i in range(3):
        d = hoje - relativedelta(months=i)
        meses.append((d.month, d.year))

    criados = 0
    for morador in moradores:
        for mes, ano in meses:
            existente = db.query(Pagamento).filter(
                and_(
                    Pagamento.morador_id == morador.id,
                    Pagamento.mes == mes,
                    Pagamento.ano == ano
                )
            ).first()
            if not existente:
                p = Pagamento(
                    morador_id=morador.id,
                    condominio_id=condominio_id,
                    mes=mes,
                    ano=ano,
                    valor=taxa.valor,
                    pago=False
                )
                db.add(p)
                try:
                    nested = db.begin_nested()
                    db.flush()
                    criados += 1
                except IntegrityError:
                    nested.rollback()  # descarta só este insert, preserva os anteriores

    db.commit()
    return {"criados": criados, "message": f"{criados} cobranças geradas"}


# ─── LISTAR PAGAMENTOS ───────────────────────────────────────────────────────

@router.get("/pagamentos/{condominio_id}", response_model=list[PagamentoOut])
def listar_pagamentos(condominio_id: int, mes: int = None, ano: int = None,
                      db: Session = Depends(get_db),
                      usuario: Usuario = Depends(get_usuario_logado)):
    checar_acesso_condominio(usuario, condominio_id)

    query = db.query(Pagamento, Morador).outerjoin(
        Morador, Pagamento.morador_id == Morador.id
    ).filter(Pagamento.condominio_id == condominio_id)

    # Morador só acessa seus próprios pagamentos
    if isinstance(usuario, UsuarioMorador):
        query = query.filter(Pagamento.morador_id == usuario.morador_id)

    if mes:
        query = query.filter(Pagamento.mes == mes)
    if ano:
        query = query.filter(Pagamento.ano == ano)

    resultados = query.all()
    pagamentos = []
    for pag, mor in resultados:
        p = PagamentoOut(
            id=pag.id,
            morador_id=pag.morador_id,
            condominio_id=pag.condominio_id,
            mes=pag.mes,
            ano=pag.ano,
            valor=pag.valor,
            pago=pag.pago,
            data_pagamento=pag.data_pagamento,
            observacao=pag.observacao,
            morador_nome=mor.nome if mor else "Morador removido",
            apartamento=mor.apartamento if mor else "—"
        )
        pagamentos.append(p)

    return pagamentos


# ─── INADIMPLENTES ───────────────────────────────────────────────────────────

@router.get("/inadimplentes/{condominio_id}", response_model=list[InadimplenteOut])
def listar_inadimplentes(condominio_id: int, db: Session = Depends(get_db),
                         usuario: Usuario = Depends(get_usuario_logado)):
    checar_acesso_condominio(usuario, condominio_id)

    resultados = db.query(Pagamento, Morador).outerjoin(
        Morador, Pagamento.morador_id == Morador.id
    ).filter(
        Pagamento.condominio_id == condominio_id,
        Pagamento.pago == False
    ).all()

    agrupado = {}
    for pag, mor in resultados:
        if mor is None:
            continue  # ignora cobranças de moradores deletados
        key = mor.id
        if key not in agrupado:
            agrupado[key] = {
                "morador_id": mor.id,
                "morador_nome": mor.nome,
                "apartamento": mor.apartamento,
                "meses_pendentes": 0,
                "valor_total": 0.0
            }
        agrupado[key]["meses_pendentes"] += 1
        agrupado[key]["valor_total"] += pag.valor

    return list(agrupado.values())


# ─── ATUALIZAR PAGAMENTO ─────────────────────────────────────────────────────

@router.put("/pagamentos/{pagamento_id}", response_model=PagamentoOut)
def atualizar_pagamento(pagamento_id: int, body: PagamentoUpdate,
                        db: Session = Depends(get_db),
                        usuario: Usuario = Depends(somente_gestor)):
    pag = db.query(Pagamento).filter(Pagamento.id == pagamento_id).first()
    if not pag:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")

    checar_acesso_condominio(usuario, pag.condominio_id)

    pag.pago = body.pago
    pag.data_pagamento = body.data_pagamento if body.pago else None
    pag.observacao = body.observacao
    db.commit()
    db.refresh(pag)

    mor = db.query(Morador).filter(Morador.id == pag.morador_id).first()
    return PagamentoOut(
        id=pag.id,
        morador_id=pag.morador_id,
        condominio_id=pag.condominio_id,
        mes=pag.mes,
        ano=pag.ano,
        valor=pag.valor,
        pago=pag.pago,
        data_pagamento=pag.data_pagamento,
        observacao=pag.observacao,
        morador_nome=mor.nome if mor else None,
        apartamento=mor.apartamento if mor else None
    )