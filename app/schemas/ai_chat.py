from pydantic import BaseModel
from typing import List


class MensagemHistorico(BaseModel):
    role: str   # "user" ou "assistant"
    content: str


class ChatRequest(BaseModel):
    mensagem: str
    condominio_id: int
    historico: List[MensagemHistorico] = []


class ChatResponse(BaseModel):
    resposta: str