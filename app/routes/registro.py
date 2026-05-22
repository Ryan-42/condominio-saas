from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.auth import get_db, hash_senha, criar_token
from app.email import enviar_boas_vindas
from app.models.condominio import Condominio
from app.models.usuario import Usuario, TipoUsuario
from app.models.plano import Plano, PLANOS

router = APIRouter(tags=["Registro"])


class RegistroInput(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    nome_condominio: str
    quantidade_unidades: int = 1


@router.post("/registro", status_code=201)
def registrar_sindico(dados: RegistroInput, db: Session = Depends(get_db)):
    if len(dados.senha) < 8:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 8 caracteres.")

    if len(dados.nome.strip()) < 2:
        raise HTTPException(status_code=400, detail="Nome inválido.")

    if len(dados.nome_condominio.strip()) < 2:
        raise HTTPException(status_code=400, detail="Nome do condomínio inválido.")

    if dados.quantidade_unidades < 1:
        raise HTTPException(status_code=400, detail="Quantidade de unidades deve ser pelo menos 1.")

    existente = db.query(Usuario).filter(Usuario.email == dados.email).first()
    if existente:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

    condo = Condominio(
        nome=dados.nome_condominio.strip(),
        quantidade_unidades=dados.quantidade_unidades,
    )
    db.add(condo)
    db.flush()  # obtém condo.id antes do commit

    trial_config = PLANOS[Plano.PRO]
    trial_ends = datetime.now(timezone.utc) + timedelta(days=trial_config.trial_dias)

    sindico = Usuario(
        nome=dados.nome.strip(),
        email=dados.email,
        senha_hash=hash_senha(dados.senha),
        tipo=TipoUsuario.SINDICO,
        condominio_id=condo.id,
        plano=Plano.FREE.value,
        trial_ends_at=trial_ends,
    )
    db.add(sindico)
    db.commit()
    db.refresh(sindico)

    enviar_boas_vindas(sindico.email, sindico.nome)

    token = criar_token({"sub": sindico.email, "tipo": sindico.tipo})
    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": {
            "id":            sindico.id,
            "nome":          sindico.nome,
            "email":         sindico.email,
            "tipo":          sindico.tipo,
            "condominio_id": sindico.condominio_id,
        },
    }
