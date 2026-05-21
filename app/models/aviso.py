from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.database import Base


class TipoAviso(str, enum.Enum):
    NORMAL  = "NORMAL"
    URGENTE = "URGENTE"
    INFO    = "INFO"


class Aviso(Base):
    __tablename__ = "avisos"

    id            = Column(Integer, primary_key=True, index=True)
    titulo        = Column(String, nullable=False)
    conteudo      = Column(Text, nullable=False)
    tipo          = Column(Enum(TipoAviso), nullable=False, default=TipoAviso.NORMAL)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    criado_em     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    condominio = relationship("Condominio", back_populates="avisos")
