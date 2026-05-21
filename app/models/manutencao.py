from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean
from datetime import datetime, timezone
import enum

from app.database import Base


class CategoriaManutencao(str, enum.Enum):
    ELEVADOR   = "ELEVADOR"
    PISCINA    = "PISCINA"
    GERADOR    = "GERADOR"
    HIDRAULICA = "HIDRAULICA"
    ELETRICA   = "ELETRICA"
    LIMPEZA    = "LIMPEZA"
    JARDINAGEM = "JARDINAGEM"
    OUTRO      = "OUTRO"


class StatusManutencao(str, enum.Enum):
    AGENDADA     = "AGENDADA"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    CONCLUIDA    = "CONCLUIDA"
    CANCELADA    = "CANCELADA"


class Manutencao(Base):
    __tablename__ = "manutencoes"

    id            = Column(Integer, primary_key=True, index=True)
    titulo        = Column(String, nullable=False)
    descricao     = Column(Text, nullable=True)
    categoria     = Column(Enum(CategoriaManutencao), nullable=False)
    status        = Column(Enum(StatusManutencao), nullable=False, default=StatusManutencao.AGENDADA)
    data_inicio   = Column(DateTime, nullable=False)
    data_fim      = Column(DateTime, nullable=True)
    impacto       = Column(Text, nullable=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    notificado    = Column(Boolean, default=False)
    criado_em     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
