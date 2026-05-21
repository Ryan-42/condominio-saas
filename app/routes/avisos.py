from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.aviso import Aviso, TipoAviso
from app.models.morador import Morador
from app.models.usuario import Usuario
from app.schemas.aviso import AvisoCreate, AvisoUpdate, AvisoOut
from app.email import enviar_aviso_urgente

router = APIRouter(tags=["Avisos"])


@router.get("/avisos", response_model=list[AvisoOut])
def listar_avisos(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)
    return (
        db.query(Aviso)
        .filter(Aviso.condominio_id == condominio_id)
        .order_by(Aviso.criado_em.desc())
        .all()
    )


@router.post("/avisos", response_model=AvisoOut, status_code=201)
def criar_aviso(
    dados: AvisoCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor),
):
    checar_acesso_condominio(usuario, dados.condominio_id)
    aviso = Aviso(**dados.model_dump())
    db.add(aviso)
    db.commit()
    db.refresh(aviso)

    if aviso.tipo == TipoAviso.URGENTE:
        from app.models.condominio import Condominio
        cond = db.query(Condominio).filter(Condominio.id == dados.condominio_id).first()
        moradores = db.query(Morador).filter(
            Morador.condominio_id == dados.condominio_id,
            Morador.email != None,
            Morador.senha_hash != None,
        ).all()
        condo_nome = cond.nome if cond else "Condomínio"
        for m in moradores:
            background_tasks.add_task(enviar_aviso_urgente, m.email, m.nome or "Morador", aviso.titulo, aviso.conteudo, condo_nome)

    return aviso


@router.put("/avisos/{aviso_id}", response_model=AvisoOut)
def atualizar_aviso(
    aviso_id: int,
    dados: AvisoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor),
):
    aviso = db.query(Aviso).filter(Aviso.id == aviso_id).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado")
    checar_acesso_condominio(usuario, aviso.condominio_id)
    aviso.titulo = dados.titulo
    aviso.conteudo = dados.conteudo
    aviso.tipo = dados.tipo
    db.commit()
    db.refresh(aviso)
    return aviso


@router.delete("/avisos/{aviso_id}", status_code=204)
def deletar_aviso(
    aviso_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor),
):
    aviso = db.query(Aviso).filter(Aviso.id == aviso_id).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado")
    checar_acesso_condominio(usuario, aviso.condominio_id)
    db.delete(aviso)
    db.commit()
    return None
