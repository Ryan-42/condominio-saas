from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List


class VotacaoCreate(BaseModel):
    titulo:        str
    descricao:     Optional[str] = None
    opcoes:        List[str]
    condominio_id: int
    encerrada_em:  Optional[datetime] = None


class VotacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    titulo:        str
    descricao:     Optional[str] = None
    opcoes:        List[str]
    condominio_id: int
    ativa:         bool
    criado_em:     datetime
    encerrada_em:  Optional[datetime] = None
    resultados:    Optional[List[int]] = None   # contagem por opção
    total_votos:   Optional[int] = None
    meu_voto:      Optional[int] = None         # índice votado pelo morador, ou -1


class VotarInput(BaseModel):
    opcao_idx: int
