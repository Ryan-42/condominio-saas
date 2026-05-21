from pydantic import BaseModel, ConfigDict
from typing import Optional

class CondominioBase(BaseModel):
    nome: str
    quantidade_unidades: int

class CondominioCreate(CondominioBase):
    pass

class Condominio(CondominioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

class CondominioComSindico(BaseModel):
    id: int
    nome: str
    quantidade_unidades: int
    sindico_nome: Optional[str] = None
    sindico_email: Optional[str] = None