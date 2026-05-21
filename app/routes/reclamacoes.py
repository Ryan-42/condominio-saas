from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.reclamacao import Reclamacao, StatusReclamacao
from app.models.morador import Morador
from app.models.usuario import TipoUsuario
from app.schemas.reclamacao import ReclamacaoCreate, ReclamacaoUpdate, ReclamacaoOut
from app.email import enviar_reclamacao_respondida

router = APIRouter(prefix="/reclamacoes", tags=["Reclamações"])


def _enrich(rec: Reclamacao) -> dict:
    d = {c.name: getattr(rec, c.name) for c in rec.__table__.columns}
    d["morador_nome"] = rec.morador.nome if rec.morador else None
    d["morador_apto"] = rec.morador.apartamento if rec.morador else None
    return d


@router.post("", response_model=ReclamacaoOut, status_code=201)
def criar_reclamacao(
    dados: ReclamacaoCreate,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, dados.condominio_id)
    morador_id = getattr(usuario, "morador_id", None) or usuario.id
    rec = Reclamacao(**dados.model_dump(), morador_id=morador_id)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return ReclamacaoOut(**_enrich(rec))


@router.get("", response_model=list[ReclamacaoOut])
def listar_reclamacoes(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)
    query = db.query(Reclamacao).filter(Reclamacao.condominio_id == condominio_id)

    if usuario.tipo == TipoUsuario.MORADOR:
        mid = getattr(usuario, "morador_id", usuario.id)
        query = query.filter(Reclamacao.morador_id == mid)

    recs = query.order_by(Reclamacao.criado_em.desc()).all()
    return [ReclamacaoOut(**_enrich(r)) for r in recs]


@router.put("/{reclamacao_id}", response_model=ReclamacaoOut)
def atualizar_reclamacao(
    reclamacao_id: int,
    dados: ReclamacaoUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    rec = db.query(Reclamacao).filter(Reclamacao.id == reclamacao_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Reclamação não encontrada")
    checar_acesso_condominio(usuario, rec.condominio_id)

    if dados.status is not None:
        rec.status = dados.status
    if dados.resposta is not None:
        rec.resposta = dados.resposta
        rec.respondido_em = datetime.now(timezone.utc)

    db.commit()
    db.refresh(rec)

    if dados.resposta and rec.morador and rec.morador.email:
        background_tasks.add_task(
            enviar_reclamacao_respondida,
            rec.morador.email, rec.morador.nome or "Morador",
            rec.titulo, dados.resposta, rec.status,
        )

    return ReclamacaoOut(**_enrich(rec))


@router.delete("/{reclamacao_id}", status_code=204)
def deletar_reclamacao(
    reclamacao_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    rec = db.query(Reclamacao).filter(Reclamacao.id == reclamacao_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Reclamação não encontrada")
    checar_acesso_condominio(usuario, rec.condominio_id)

    if usuario.tipo == TipoUsuario.MORADOR:
        mid = getattr(usuario, "morador_id", usuario.id)
        if rec.morador_id != mid:
            raise HTTPException(status_code=403, detail="Acesso negado")
        if rec.status != StatusReclamacao.ABERTA:
            raise HTTPException(status_code=400, detail="Só é possível cancelar reclamações em aberto")

    db.delete(rec)
    db.commit()
