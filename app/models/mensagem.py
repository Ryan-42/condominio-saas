from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.database import Base


class AutorTipo(str, enum.Enum):
    MORADOR = "MORADOR"
    SINDICO = "SINDICO"


class Mensagem(Base):
    __tablename__ = "mensagens"

    id            = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    morador_id    = Column(Integer, ForeignKey("moradores.id"), nullable=False, index=True)
    autor_tipo    = Column(Enum(AutorTipo), nullable=False)
    conteudo      = Column(Text, nullable=False)
    lida          = Column(Boolean, default=False)  # lida pela outra parte
    criado_em     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    morador = relationship("Morador")
