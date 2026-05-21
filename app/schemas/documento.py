from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class DocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             int
    nome:           str
    descricao:      Optional[str] = None
    nome_original:  str
    mime_type:      Optional[str] = None
    tamanho_bytes:  int
    condominio_id:  int
    criado_em:      datetime
