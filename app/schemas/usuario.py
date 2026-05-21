from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional
from app.models.usuario import TipoUsuario


# ── Cadastro ──────────────────────────────────────────────────

class UsuarioCreate(BaseModel):
    nome:          str
    email:         EmailStr
    senha:         str
    tipo:          TipoUsuario = TipoUsuario.SINDICO
    condominio_id: Optional[int] = None


# ── Resposta (sem senha) ──────────────────────────────────────

class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    nome:          str
    email:         str
    tipo:          TipoUsuario
    condominio_id: Optional[int]
    morador_id:    Optional[int]    = None
    apartamento:   Optional[str]    = None


# ── Login ─────────────────────────────────────────────────────

class LoginInput(BaseModel):
    email: EmailStr
    senha: str


# ── Token de resposta ─────────────────────────────────────────

class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    usuario:      UsuarioOut