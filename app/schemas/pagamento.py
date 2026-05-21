from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date


class TaxaCondominioCreate(BaseModel):
    valor: float


class TaxaCondominioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    condominio_id: int
    valor: float


class PagamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    morador_id: Optional[int] = None
    condominio_id: int
    mes: int
    ano: int
    valor: float
    pago: bool
    data_pagamento: Optional[date] = None
    observacao: Optional[str] = None

    # campos extras do join
    morador_nome: Optional[str] = None
    apartamento: Optional[str] = None


class PagamentoUpdate(BaseModel):
    pago: bool
    data_pagamento: Optional[date] = None
    observacao: Optional[str] = None


class InadimplenteOut(BaseModel):
    morador_id: int
    morador_nome: str
    apartamento: str
    meses_pendentes: int
    valor_total: float