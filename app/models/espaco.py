from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, Enum, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.database import Base


class StatusReserva(str, enum.Enum):
    PENDENTE  = "PENDENTE"
    APROVADA  = "APROVADA"
    REJEITADA = "REJEITADA"
    CANCELADA = "CANCELADA"


class PeriodoReserva(str, enum.Enum):
    MANHA    = "MANHA"
    TARDE    = "TARDE"
    NOITE    = "NOITE"
    DIA_TODO = "DIA_TODO"


class Espaco(Base):
    __tablename__ = "espacos"

    id            = Column(Integer, primary_key=True, index=True)
    nome          = Column(String, nullable=False)
    descricao     = Column(Text, nullable=True)
    capacidade    = Column(Integer, nullable=True)
    ativo         = Column(Boolean, default=True, nullable=False)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)

    reservas = relationship("Reserva", back_populates="espaco")


class Reserva(Base):
    __tablename__ = "reservas"
    __table_args__ = (
        UniqueConstraint("espaco_id", "data", "periodo", name="uq_reserva_espaco_data_periodo"),
    )

    id            = Column(Integer, primary_key=True, index=True)
    espaco_id     = Column(Integer, ForeignKey("espacos.id"), nullable=False, index=True)
    morador_id    = Column(Integer, ForeignKey("moradores.id"), nullable=False, index=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    data          = Column(Date, nullable=False)
    periodo       = Column(Enum(PeriodoReserva), nullable=False)
    status        = Column(Enum(StatusReserva), nullable=False, default=StatusReserva.PENDENTE)
    observacao    = Column(Text, nullable=True)
    resposta      = Column(Text, nullable=True)
    criado_em     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    respondido_em = Column(DateTime, nullable=True)

    espaco  = relationship("Espaco", back_populates="reservas")
    morador = relationship("Morador")
