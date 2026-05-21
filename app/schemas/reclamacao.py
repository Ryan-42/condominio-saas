from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

from app.models.reclamacao import StatusReclamacao, PrioridadeReclamacao


class ReclamacaoCreate(BaseModel):
    titulo:       str
    descricao:    str
    prioridade:   PrioridadeReclamacao = PrioridadeReclamacao.MEDIA
    condominio_id: int


class ReclamacaoUpdate(BaseModel):
    status:   Optional[StatusReclamacao] = None
    resposta: Optional[str] = None


class ReclamacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    titulo:        str
    descricao:     str
    status:        StatusReclamacao
    prioridade:    PrioridadeReclamacao
    morador_id:    int
    condominio_id: int
    resposta:      Optional[str] = None
    criado_em:     datetime
    respondido_em: Optional[datetime] = None
    morador_nome:  Optional[str] = None
    morador_apto:  Optional[str] = None
