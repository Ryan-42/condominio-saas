from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.database import Base


class StatusReclamacao(str, enum.Enum):
    ABERTA = "ABERTA"
    EM_ANALISE = "EM_ANALISE"
    RESOLVIDA = "RESOLVIDA"


class PrioridadeReclamacao(str, enum.Enum):
    BAIXA = "BAIXA"
    MEDIA = "MEDIA"
    ALTA = "ALTA"


class Reclamacao(Base):
    __tablename__ = "reclamacoes"

    id            = Column(Integer, primary_key=True, index=True)
    titulo        = Column(String, nullable=False)
    descricao     = Column(Text, nullable=False)
    status        = Column(Enum(StatusReclamacao), nullable=False, default=StatusReclamacao.ABERTA)
    prioridade    = Column(Enum(PrioridadeReclamacao), nullable=False, default=PrioridadeReclamacao.MEDIA)
    morador_id    = Column(Integer, ForeignKey("moradores.id"), nullable=False, index=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    resposta      = Column(Text, nullable=True)
    criado_em     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    respondido_em = Column(DateTime, nullable=True)

    morador = relationship("Morador")
