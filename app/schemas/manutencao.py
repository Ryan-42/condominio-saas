from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

from app.models.manutencao import CategoriaManutencao, StatusManutencao


class ManutencaoCreate(BaseModel):
    titulo:        str
    descricao:     Optional[str] = None
    categoria:     CategoriaManutencao
    data_inicio:   datetime
    data_fim:      Optional[datetime] = None
    impacto:       Optional[str] = None
    condominio_id: int


class ManutencaoUpdate(BaseModel):
    status:    Optional[StatusManutencao] = None
    data_fim:  Optional[datetime] = None
    descricao: Optional[str] = None
    impacto:   Optional[str] = None


class ManutencaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    titulo:        str
    descricao:     Optional[str] = None
    categoria:     CategoriaManutencao
    status:        StatusManutencao
    data_inicio:   datetime
    data_fim:      Optional[datetime] = None
    impacto:       Optional[str] = None
    condominio_id: int
    criado_em:     datetime
