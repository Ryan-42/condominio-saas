import os
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from jose import JWTError, jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor, hash_senha, checar_acesso_condominio, criar_token, UsuarioMorador, SECRET_KEY, ALGORITHM
from app.email import enviar_convite_morador
from app.models.condominio import Condominio
from app.models.morador import Morador
from app.models.usuario import Usuario, TipoUsuario
from app.schemas.morador import MoradorCreate, Morador as MoradorSchema, MoradorAtivacaoInput, MoradorPerfilUpdate, ConviteOut, AutoRegistroInput, QRRegistroOut

router = APIRouter()


@router.get("/moradores", response_model=list[MoradorSchema])
def listar_moradores(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado)
):
    if usuario.tipo == TipoUsuario.ADMIN:
        return db.query(Morador).offset(skip).limit(limit).all()
    if usuario.condominio_id is None:
        raise HTTPException(status_code=403, detail="Usuário não vinculado a nenhum condomínio")
    return db.query(Morador).filter(Morador.condominio_id == usuario.condominio_id).offset(skip).limit(limit).all()


@router.get("/moradores/me", response_model=MoradorSchema)
def meu_perfil_morador(db: Session = Depends(get_db), usuario=Depends(get_usuario_logado)):
    if not isinstance(usuario, UsuarioMorador):
        raise HTTPException(status_code=403, detail="Disponível apenas para moradores")
    m = db.query(Morador).filter(Morador.id == usuario.morador_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado")
    return m


@router.put("/moradores/me", response_model=MoradorSchema)
def atualizar_perfil_morador(dados: MoradorPerfilUpdate, db: Session = Depends(get_db), usuario=Depends(get_usuario_logado)):
    if not isinstance(usuario, UsuarioMorador):
        raise HTTPException(status_code=403, detail="Disponível apenas para moradores")
    m = db.query(Morador).filter(Morador.id == usuario.morador_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado")
    m.nome = dados.nome
    m.telefone = dados.telefone
    db.commit()
    db.refresh(m)
    return m


@router.get("/moradores/{morador_id}", response_model=MoradorSchema)
def buscar_morador(morador_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_logado)):
    m = db.query(Morador).filter(Morador.id == morador_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado")
    checar_acesso_condominio(usuario, m.condominio_id)
    return m


@router.post("/moradores", response_model=MoradorSchema)
def criar_morador(morador: MoradorCreate, db: Session = Depends(get_db), usuario: Usuario = Depends(somente_gestor)):
    checar_acesso_condominio(usuario, morador.condominio_id)
    novo = Morador(**morador.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@router.put("/moradores/{morador_id}", response_model=MoradorSchema)
def atualizar_morador(morador_id: int, dados: MoradorCreate, db: Session = Depends(get_db), usuario: Usuario = Depends(somente_gestor)):
    m = db.query(Morador).filter(Morador.id == morador_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado")
    checar_acesso_condominio(usuario, m.condominio_id)
    for campo, valor in dados.model_dump().items():
        setattr(m, campo, valor)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/moradores/{morador_id}", status_code=204)
def deletar_morador(morador_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(somente_gestor)):
    m = db.query(Morador).filter(Morador.id == morador_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado")
    checar_acesso_condominio(usuario, m.condominio_id)
    # Anonimização LGPD Art. 18 — preserva histórico financeiro, remove dados pessoais
    m.nome           = "[dados removidos]"
    m.email          = None
    m.telefone       = None
    m.senha_hash     = None
    m.convite_token  = None
    db.commit()


@router.post("/moradores/{morador_id}/convidar", response_model=ConviteOut)
def convidar_morador(
    morador_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    if usuario.tipo not in (TipoUsuario.ADMIN, TipoUsuario.SINDICO):
        raise HTTPException(status_code=403, detail="Acesso negado")

    m = db.query(Morador).filter(Morador.id == morador_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado")
    checar_acesso_condominio(usuario, m.condominio_id)

    token = secrets.token_urlsafe(32)
    m.convite_token = token
    m.convite_token_expira = datetime.now(timezone.utc) + timedelta(days=7)
    db.commit()

    base_url = os.getenv("FRONTEND_URL", "http://localhost:5500")
    onboarding_url = f"{base_url}/onboarding.html?token={token}"

    background_tasks.add_task(enviar_convite_morador, m.email, m.nome, onboarding_url)
    return ConviteOut(onboarding_url=onboarding_url, mensagem=f"Convite gerado para {m.nome}.")


@router.get("/moradores/{morador_id}/portal-token")
def gerar_portal_token(
    morador_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor),
):
    """Gera token JWT de 30 dias para acesso ao portal via QR code."""
    m = db.query(Morador).filter(Morador.id == morador_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Morador não encontrado")
    checar_acesso_condominio(usuario, m.condominio_id)

    if not m.email or not m.senha_hash:
        raise HTTPException(
            status_code=400,
            detail="Morador ainda não ativou a conta. Envie um convite primeiro.",
        )

    token = criar_token(
        {"sub": m.email, "tipo": TipoUsuario.MORADOR, "morador_id": m.id},
        horas=24 * 30,
    )

    base_url = os.getenv("FRONTEND_URL", "http://localhost:5500")
    portal_url = f"{base_url}/portal.html?qr_token={token}"

    return {
        "portal_url": portal_url,
        "morador_nome": m.nome,
        "apartamento": m.apartamento or "—",
    }


@router.post("/moradores/ativar")
def ativar_morador(dados: MoradorAtivacaoInput, db: Session = Depends(get_db)):
    if not dados.lgpd_aceite:
        raise HTTPException(status_code=400, detail="É necessário aceitar os termos de uso e política de privacidade.")
    if len(dados.senha) < 8:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 8 caracteres.")

    m = db.query(Morador).filter(Morador.convite_token == dados.token).first()
    if not m:
        raise HTTPException(status_code=404, detail="Token inválido ou expirado.")

    if m.convite_token_expira is not None:
        expira = m.convite_token_expira
        if expira.tzinfo is None:
            expira = expira.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expira:
            raise HTTPException(status_code=400, detail="Link de convite expirado. Solicite um novo convite.")

    m.senha_hash     = hash_senha(dados.senha)
    m.lgpd_aceite    = True
    m.lgpd_aceite_em = datetime.now(timezone.utc)
    m.primeiro_acesso = False
    m.convite_token  = None
    db.commit()

    return {"message": "Conta ativada com sucesso."}


@router.get("/condominios/{condo_id}/qr-registro", response_model=QRRegistroOut)
def gerar_qr_registro(
    condo_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor),
):
    """Gera QR code para auto-registro de moradores no condomínio."""
    condo = db.query(Condominio).filter(Condominio.id == condo_id).first()
    if not condo:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    checar_acesso_condominio(usuario, condo_id)

    token = criar_token({"sub": f"registro:{condo_id}", "tipo": "REGISTRO_CONDO"}, horas=24 * 30)
    base_url = os.getenv("FRONTEND_URL", "http://localhost:5500")
    registro_url = f"{base_url}/onboarding.html?condo_token={token}"
    return QRRegistroOut(registro_url=registro_url, condo_nome=condo.nome)


@router.post("/moradores/auto-registrar")
def auto_registrar_morador(dados: AutoRegistroInput, db: Session = Depends(get_db)):
    """Auto-registro de morador via QR code do condomínio."""
    if not dados.lgpd_aceite:
        raise HTTPException(status_code=400, detail="É necessário aceitar os termos de uso e política de privacidade.")
    if len(dados.senha) < 8:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 8 caracteres.")

    try:
        payload = jwt.decode(dados.condo_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("tipo") != "REGISTRO_CONDO":
            raise ValueError("tipo inválido")
        sub = payload.get("sub", "")
        if not sub.startswith("registro:"):
            raise ValueError("sub inválido")
        condo_id = int(sub.split(":")[1])
    except (JWTError, ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Token de registro inválido ou expirado.")

    condo = db.query(Condominio).filter(Condominio.id == condo_id).first()
    if not condo:
        raise HTTPException(status_code=400, detail="Condomínio não encontrado.")

    # Email é único globalmente — verifica antes de tentar inserir
    if db.query(Morador).filter(Morador.email == dados.email).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado na plataforma.")

    novo = Morador(
        nome=dados.nome,
        email=dados.email,
        telefone=dados.telefone,
        apartamento=dados.apartamento,
        condominio_id=condo_id,
        senha_hash=hash_senha(dados.senha),
        convite_token=None,
        convite_token_expira=None,
    )
    try:
        db.add(novo)
        db.commit()
        db.refresh(novo)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="E-mail já cadastrado na plataforma.")

    return {"mensagem": f"Bem-vindo(a) ao {condo.nome}! Acesse o portal com seu e-mail e senha."}