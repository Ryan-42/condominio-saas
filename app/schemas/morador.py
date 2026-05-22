from pydantic import BaseModel, ConfigDict, computed_field
from typing import Optional


class MoradorBase(BaseModel):
    nome: str
    email: str
    telefone: str
    apartamento: str
    condominio_id: int


class MoradorCreate(MoradorBase):
    pass


class Morador(MoradorBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    senha_hash: Optional[str] = None  # usado apenas para `conta_ativa`

    @computed_field
    @property
    def conta_ativa(self) -> bool:
        return bool(self.senha_hash)


class MoradorAtivacaoInput(BaseModel):
    token: str
    senha: str
    lgpd_aceite: bool


class MoradorPerfilUpdate(BaseModel):
    nome: str
    telefone: str


class ConviteOut(BaseModel):
    onboarding_url: str
    mensagem: str


class AutoRegistroInput(BaseModel):
    condo_token: str
    nome: str
    email: str
    telefone: str
    apartamento: str
    senha: str
    lgpd_aceite: bool


class QRRegistroOut(BaseModel):
    registro_url: str
    condo_nome: str