from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.receita import Receita
from app.models.usuario import Usuario, TipoUsuario
from app.schemas.receita import ReceitaCreate, Receita as ReceitaSchema

router = APIRouter()


@router.get("/receitas", response_model=list[ReceitaSchema])
def listar_receitas(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    if usuario.tipo == TipoUsuario.ADMIN:
        return db.query(Receita).offset(skip).limit(limit).all()
    if usuario.condominio_id is None:
        raise HTTPException(status_code=403, detail="Usuário não vinculado a nenhum condomínio")
    return db.query(Receita).filter(Receita.condominio_id == usuario.condominio_id).offset(skip).limit(limit).all()


@router.get("/receitas/{receita_id}", response_model=ReceitaSchema)
def buscar_receita(receita_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_logado)):
    r = db.query(Receita).filter(Receita.id == receita_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    checar_acesso_condominio(usuario, r.condominio_id)
    return r


@router.post("/receitas", response_model=ReceitaSchema)
def criar_receita(receita: ReceitaCreate, db: Session = Depends(get_db), usuario: Usuario = Depends(somente_gestor)):
    checar_acesso_condominio(usuario, receita.condominio_id)
    nova = Receita(**receita.model_dump())
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return nova


@router.put("/receitas/{receita_id}", response_model=ReceitaSchema)
def atualizar_receita(receita_id: int, dados: ReceitaCreate, db: Session = Depends(get_db), usuario: Usuario = Depends(somente_gestor)):
    r = db.query(Receita).filter(Receita.id == receita_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    checar_acesso_condominio(usuario, r.condominio_id)
    for campo, valor in dados.model_dump().items():
        setattr(r, campo, valor)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/receitas/{receita_id}", status_code=204)
def deletar_receita(receita_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(somente_gestor)):
    r = db.query(Receita).filter(Receita.id == receita_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    checar_acesso_condominio(usuario, r.condominio_id)
    db.delete(r)
    db.commit()