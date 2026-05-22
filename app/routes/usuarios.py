import uuid
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import (
    get_db,
    get_usuario_logado,
    somente_admin,
    hash_senha,
    verificar_senha,
    criar_token,
    check_rate_limit,
    UsuarioMorador,
)
from app.email import enviar_reset_senha
from app.models.morador import Morador
from app.models.usuario import Usuario, TipoUsuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut, LoginInput, TokenOut

logger = logging.getLogger(__name__)


class EsqueciSenhaInput(BaseModel):
    email: EmailStr


class ResetarSenhaInput(BaseModel):
    token: str
    nova_senha: str


class AlterarSenhaInput(BaseModel):
    senha_atual: str
    nova_senha: str

router = APIRouter(tags=["Autenticação"])


# ── POST /login  (frontend — recebe JSON) ─────────────────────
@router.post("/login", response_model=TokenOut)
def login(dados: LoginInput, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    check_rate_limit(ip)

    # 1. Tenta autenticar como Usuario (ADMIN / SINDICO)
    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()
    if usuario and verificar_senha(dados.senha, usuario.senha_hash):
        token = criar_token({"sub": usuario.email, "tipo": usuario.tipo})
        return {
            "access_token": token,
            "token_type":   "bearer",
            "usuario": {
                "id":           usuario.id,
                "nome":         usuario.nome,
                "email":        usuario.email,
                "tipo":         usuario.tipo,
                "condominio_id": usuario.condominio_id,
            },
        }

    # 2. Tenta autenticar como Morador
    morador = db.query(Morador).filter(Morador.email == dados.email).first()
    if morador and morador.senha_hash and verificar_senha(dados.senha, morador.senha_hash):
        token = criar_token({
            "sub":          morador.email,
            "tipo":         TipoUsuario.MORADOR,
            "morador_id":   morador.id,
            "apartamento":  morador.apartamento,
            "condominio_id": morador.condominio_id,
        })
        return {
            "access_token": token,
            "token_type":   "bearer",
            "usuario": {
                "id":           morador.id,
                "nome":         morador.nome,
                "email":        morador.email,
                "tipo":         TipoUsuario.MORADOR,
                "condominio_id": morador.condominio_id,
                "morador_id":   morador.id,
                "apartamento":  morador.apartamento,
            },
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="E-mail ou senha incorretos",
    )


# ── POST /token  (Swagger — recebe form-data) ─────────────────

@router.post("/token")
def token_swagger(
    form: OAuth2PasswordRequestForm = Depends(),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """
    Login via form-data. Usado pelo botão Authorize do Swagger.
    O campo 'username' deve receber o e-mail.
    """
    ip = (request.client.host if request and request.client else "unknown")
    check_rate_limit(ip)

    usuario = db.query(Usuario).filter(Usuario.email == form.username).first()

    if not usuario or not verificar_senha(form.password, usuario.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
        )

    token = criar_token({"sub": usuario.email, "tipo": usuario.tipo})
    return {"access_token": token, "token_type": "bearer"}


# ── GET /usuarios/me ──────────────────────────────────────────

@router.get("/usuarios/me", response_model=UsuarioOut)
def meu_perfil(usuario: Usuario = Depends(get_usuario_logado)):
    return usuario


# ── PUT /usuarios/me/senha ────────────────────────────────────

@router.put("/usuarios/me/senha", status_code=200)
def alterar_senha(
    dados: AlterarSenhaInput,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    if len(dados.nova_senha) < 8:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 8 caracteres.")

    if isinstance(usuario, UsuarioMorador):
        db_morador = db.query(Morador).filter(Morador.id == usuario.morador_id).first()
        if not db_morador:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        if not verificar_senha(dados.senha_atual, db_morador.senha_hash):
            raise HTTPException(status_code=400, detail="Senha atual incorreta.")
        db_morador.senha_hash = hash_senha(dados.nova_senha)
        db.commit()
        return {"message": "Senha alterada com sucesso."}

    db_usuario = db.query(Usuario).filter(Usuario.id == usuario.id).first()
    if not db_usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    if not verificar_senha(dados.senha_atual, db_usuario.senha_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")

    db_usuario.senha_hash = hash_senha(dados.nova_senha)
    db.commit()
    return {"message": "Senha alterada com sucesso."}


# ── GET /usuarios ─────────────────────────────────────────────

@router.get("/usuarios", response_model=list[UsuarioOut])
def listar_usuarios(
    db: Session = Depends(get_db),
    _: Usuario = Depends(somente_admin),
):
    return db.query(Usuario).all()


# ── POST /usuarios ────────────────────────────────────────────

@router.post("/usuarios", response_model=UsuarioOut, status_code=201)
def criar_usuario(
    dados: UsuarioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(somente_admin),
):
    existente = db.query(Usuario).filter(Usuario.email == dados.email).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="E-mail já cadastrado",
        )

    novo = Usuario(
        nome          = dados.nome,
        email         = dados.email,
        senha_hash    = hash_senha(dados.senha),
        tipo          = dados.tipo,
        condominio_id = dados.condominio_id,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


# ── PUT /usuarios/{id} ────────────────────────────────────────

class UsuarioUpdate(BaseModel):
    nome:          str | None = None
    condominio_id: int | None = None
    tipo:          TipoUsuario | None = None


@router.put("/usuarios/{usuario_id}", response_model=UsuarioOut)
def atualizar_usuario(
    usuario_id: int,
    dados: UsuarioUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(somente_admin),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if dados.nome is not None:
        usuario.nome = dados.nome
    if dados.tipo is not None:
        usuario.tipo = dados.tipo
    if "condominio_id" in dados.model_fields_set or dados.condominio_id is not None:
        usuario.condominio_id = dados.condominio_id
    db.commit()
    db.refresh(usuario)
    return usuario


# ── POST /usuarios/esqueci-senha ──────────────────────────────

@router.post("/usuarios/esqueci-senha", status_code=200)
def esqueci_senha(dados: EsqueciSenhaInput, request: Request, db: Session = Depends(get_db)):
    """
    Gera token de reset e envia e-mail. Sempre retorna 200 para não
    revelar se o e-mail existe na base (prevenção de user enumeration).
    """
    ip = request.client.host if request.client else "unknown"
    check_rate_limit(ip)

    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()
    if usuario:
        token = str(uuid.uuid4())
        usuario.reset_token        = token
        usuario.reset_token_expira = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        ok = enviar_reset_senha(usuario.email, usuario.nome, token)
        if not ok:
            logger.warning("Falha ao enviar e-mail de reset para %s", usuario.email)
    return {"message": "Se o e-mail estiver cadastrado, você receberá as instruções em breve."}


# ── POST /usuarios/resetar-senha ──────────────────────────────

@router.post("/usuarios/resetar-senha", status_code=200)
def resetar_senha(dados: ResetarSenhaInput, db: Session = Depends(get_db)):
    if len(dados.nova_senha) < 8:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 8 caracteres.")

    usuario = db.query(Usuario).filter(Usuario.reset_token == dados.token).first()

    if not usuario or usuario.reset_token_expira is None:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")

    expira = usuario.reset_token_expira
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expira:
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link.")

    usuario.senha_hash           = hash_senha(dados.nova_senha)
    usuario.reset_token          = None
    usuario.reset_token_expira   = None
    db.commit()
    return {"message": "Senha redefinida com sucesso. Faça login com a nova senha."}