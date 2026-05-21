from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.espaco import Espaco, Reserva, StatusReserva
from app.models.usuario import TipoUsuario
from app.schemas.espaco import EspacoCreate, EspacoOut, ReservaCreate, ReservaUpdate, ReservaOut, PERIODO_LABEL
from app.email import enviar_reserva_atualizada

router = APIRouter(tags=["Espaços"])


def _enrich_reserva(r: Reserva) -> dict:
    d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
    d["espaco_nome"]  = r.espaco.nome if r.espaco else None
    d["morador_nome"] = r.morador.nome if r.morador else None
    d["morador_apto"] = r.morador.apartamento if r.morador else None
    return d


# ── ESPAÇOS ───────────────────────────────────────────────────

@router.get("/espacos", response_model=list[EspacoOut])
def listar_espacos(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)
    return db.query(Espaco).filter(
        Espaco.condominio_id == condominio_id,
        Espaco.ativo == True,
    ).order_by(Espaco.nome).all()


@router.post("/espacos", response_model=EspacoOut, status_code=201)
def criar_espaco(
    dados: EspacoCreate,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    checar_acesso_condominio(usuario, dados.condominio_id)
    e = Espaco(**dados.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.put("/espacos/{espaco_id}", response_model=EspacoOut)
def atualizar_espaco(
    espaco_id: int,
    dados: EspacoCreate,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    e = db.query(Espaco).filter(Espaco.id == espaco_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Espaço não encontrado")
    checar_acesso_condominio(usuario, e.condominio_id)
    for campo, valor in dados.model_dump().items():
        setattr(e, campo, valor)
    db.commit()
    db.refresh(e)
    return e


@router.delete("/espacos/{espaco_id}", status_code=204)
def deletar_espaco(
    espaco_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    e = db.query(Espaco).filter(Espaco.id == espaco_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Espaço não encontrado")
    checar_acesso_condominio(usuario, e.condominio_id)
    e.ativo = False   # soft delete
    db.commit()


# ── RESERVAS ──────────────────────────────────────────────────

@router.post("/reservas", response_model=ReservaOut, status_code=201)
def criar_reserva(
    dados: ReservaCreate,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, dados.condominio_id)

    espaco = db.query(Espaco).filter(
        Espaco.id == dados.espaco_id,
        Espaco.condominio_id == dados.condominio_id,
        Espaco.ativo == True,
    ).first()
    if not espaco:
        raise HTTPException(status_code=404, detail="Espaço não encontrado")

    morador_id = getattr(usuario, "morador_id", None) or usuario.id
    reserva = Reserva(**dados.model_dump(), morador_id=morador_id)
    db.add(reserva)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Este espaço já está reservado para este período.",
        )
    db.refresh(reserva)
    return ReservaOut(**_enrich_reserva(reserva))


@router.get("/reservas", response_model=list[ReservaOut])
def listar_reservas(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)
    query = db.query(Reserva).filter(Reserva.condominio_id == condominio_id)

    if usuario.tipo == TipoUsuario.MORADOR:
        mid = getattr(usuario, "morador_id", usuario.id)
        query = query.filter(Reserva.morador_id == mid)

    recs = query.order_by(Reserva.data.desc()).all()
    return [ReservaOut(**_enrich_reserva(r)) for r in recs]


@router.put("/reservas/{reserva_id}", response_model=ReservaOut)
def atualizar_reserva(
    reserva_id: int,
    dados: ReservaUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    r = db.query(Reserva).filter(Reserva.id == reserva_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reserva não encontrada")
    checar_acesso_condominio(usuario, r.condominio_id)
    r.status = dados.status
    if dados.resposta is not None:
        r.resposta = dados.resposta
    r.respondido_em = datetime.now(timezone.utc)
    db.commit()
    db.refresh(r)

    if r.morador and r.morador.email and dados.status in (StatusReserva.APROVADA, StatusReserva.REJEITADA):
        data_fmt = r.data.strftime("%d/%m/%Y") if r.data else "—"
        background_tasks.add_task(
            enviar_reserva_atualizada,
            r.morador.email, r.morador.nome or "Morador",
            r.espaco.nome if r.espaco else "Espaço",
            data_fmt, PERIODO_LABEL.get(r.periodo, r.periodo),
            dados.status, dados.resposta,
        )

    return ReservaOut(**_enrich_reserva(r))


@router.delete("/reservas/{reserva_id}", status_code=204)
def cancelar_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    r = db.query(Reserva).filter(Reserva.id == reserva_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reserva não encontrada")
    checar_acesso_condominio(usuario, r.condominio_id)

    if usuario.tipo == TipoUsuario.MORADOR:
        mid = getattr(usuario, "morador_id", usuario.id)
        if r.morador_id != mid:
            raise HTTPException(status_code=403, detail="Acesso negado")
        if r.status not in (StatusReserva.PENDENTE,):
            raise HTTPException(status_code=400, detail="Só é possível cancelar reservas pendentes")

    r.status = StatusReserva.CANCELADA
    db.commit()
