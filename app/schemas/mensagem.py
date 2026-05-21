from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

from app.models.mensagem import AutorTipo


class MensagemCreate(BaseModel):
    condominio_id: int
    morador_id:    int
    conteudo:      str


class MensagemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    condominio_id: int
    morador_id:    int
    autor_tipo:    AutorTipo
    conteudo:      str
    lida:          bool
    criado_em:     datetime


class ConversaOut(BaseModel):
    morador_id:     int
    morador_nome:   str
    morador_apto:   Optional[str] = None
    ultima_msg:     Optional[str] = None
    ultima_msg_em:  Optional[datetime] = None
    nao_lidas:      int = 0
    autor_ultima:   Optional[AutorTipo] = None
