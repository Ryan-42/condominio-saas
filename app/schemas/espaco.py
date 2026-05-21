from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import Optional, List

from app.models.espaco import StatusReserva, PeriodoReserva

PERIODO_LABEL = {
    "MANHA": "Manhã (08h–12h)",
    "TARDE": "Tarde (12h–18h)",
    "NOITE": "Noite (18h–22h)",
    "DIA_TODO": "Dia todo",
}


class EspacoCreate(BaseModel):
    nome:          str
    descricao:     Optional[str] = None
    capacidade:    Optional[int] = None
    condominio_id: int


class EspacoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    nome:          str
    descricao:     Optional[str] = None
    capacidade:    Optional[int] = None
    ativo:         bool
    condominio_id: int


class ReservaCreate(BaseModel):
    espaco_id:     int
    data:          date
    periodo:       PeriodoReserva
    observacao:    Optional[str] = None
    condominio_id: int


class ReservaUpdate(BaseModel):
    status:   StatusReserva
    resposta: Optional[str] = None


class ReservaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    espaco_id:     int
    morador_id:    int
    condominio_id: int
    data:          date
    periodo:       PeriodoReserva
    status:        StatusReserva
    observacao:    Optional[str] = None
    resposta:      Optional[str] = None
    criado_em:     datetime
    respondido_em: Optional[datetime] = None
    espaco_nome:   Optional[str] = None
    morador_nome:  Optional[str] = None
    morador_apto:  Optional[str] = None
