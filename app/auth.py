from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, Union
import threading

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.usuario import Usuario, TipoUsuario


@dataclass
class UsuarioMorador:
    """Pseudo-usuario para tokens MORADOR — interface compatível com Usuario."""
    id: int
    email: str
    nome: str
    tipo: TipoUsuario
    condominio_id: int
    morador_id: int
    apartamento: Optional[str] = None

# ── Configuração ──────────────────────────────────────────────
import os

SECRET_KEY = os.getenv("SECRET_KEY", "chave-local-dev")
ALGORITHM          = "HS256"
TOKEN_EXPIRE_HORAS = 8

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")   # aponta para /token (Swagger)


# ── Rate limiting para /login ─────────────────────────────────

_login_attempts: dict = defaultdict(list)
_rl_lock = threading.Lock()
_RL_MAX    = 5
_RL_JANELA = 60  # segundos

def check_rate_limit(ip: str):
    agora = datetime.now(timezone.utc)
    janela = agora - timedelta(seconds=_RL_JANELA)
    with _rl_lock:
        _login_attempts[ip] = [t for t in _login_attempts[ip] if t > janela]
        if len(_login_attempts[ip]) >= _RL_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Muitas tentativas. Aguarde {_RL_JANELA} segundos.",
            )
        _login_attempts[ip].append(agora)


# ── Banco ─────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Senha ─────────────────────────────────────────────────────

def hash_senha(senha: str) -> str:
    return pwd_context.hash(senha)


def verificar_senha(senha: str, hash: str) -> bool:
    return pwd_context.verify(senha, hash)


# ── JWT ───────────────────────────────────────────────────────

def criar_token(dados: dict, horas: int = TOKEN_EXPIRE_HORAS) -> str:
    payload = dados.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=horas)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── Dependência: usuário logado ───────────────────────────────

def get_usuario_logado(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Union[Usuario, UsuarioMorador]:
    credencial_erro = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise credencial_erro
    except JWTError:
        raise credencial_erro

    # 1. Tenta encontrar como Usuario (ADMIN / SINDICO)
    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if usuario:
        return usuario

    # 2. Tenta encontrar como Morador (MORADOR com conta ativada)
    if payload.get("tipo") == TipoUsuario.MORADOR:
        from app.models.morador import Morador
        morador = db.query(Morador).filter(Morador.email == email).first()
        if morador and morador.senha_hash:
            return UsuarioMorador(
                id=morador.id,
                email=morador.email,
                nome=morador.nome or "",
                tipo=TipoUsuario.MORADOR,
                condominio_id=morador.condominio_id,
                morador_id=morador.id,
                apartamento=morador.apartamento,
            )

    raise credencial_erro


# ── Dependência: somente ADMIN ────────────────────────────────

def somente_admin(usuario: Usuario = Depends(get_usuario_logado)) -> Usuario:
    if usuario.tipo != TipoUsuario.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores",
        )
    return usuario


def somente_gestor(usuario: Usuario = Depends(get_usuario_logado)) -> Usuario:
    """Bloqueia MORADOR de endpoints de escrita. Permite ADMIN e SINDICO."""
    if usuario.tipo == TipoUsuario.MORADOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a síndicos e administradores",
        )
    return usuario


# ── Utilitário: checar acesso ao condomínio (uso interno nas rotas) ───────────

def checar_acesso_condominio(usuario: Usuario, condominio_id: int) -> None:
    """Lança 403 se o usuário não pertence ao condomínio (ADMIN tem acesso total)."""
    if usuario.tipo == TipoUsuario.ADMIN:
        return
    if usuario.condominio_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não vinculado a nenhum condomínio",
        )
    if usuario.condominio_id != condominio_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado",
        )


# ── Dependência: verificar acesso ao condomínio ───────────────

def verificar_acesso_condominio(
    condominio_id: int,
    usuario: Usuario = Depends(get_usuario_logado),
) -> Usuario:
    if usuario.tipo == TipoUsuario.ADMIN:
        return usuario

    if usuario.condominio_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não vinculado a nenhum condomínio",
        )
    if usuario.condominio_id != condominio_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: condomínio não pertence a este usuário",
        )
    return usuario