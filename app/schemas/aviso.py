from pydantic import BaseModel, ConfigDict
from datetime import datetime
from app.models.aviso import TipoAviso


class AvisoCreate(BaseModel):
    titulo:        str
    conteudo:      str
    tipo:          TipoAviso = TipoAviso.NORMAL
    condominio_id: int


class AvisoUpdate(BaseModel):
    titulo:  str
    conteudo: str
    tipo:    TipoAviso = TipoAviso.NORMAL


class AvisoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    titulo:        str
    conteudo:      str
    tipo:          TipoAviso
    condominio_id: int
    criado_em:     datetime
