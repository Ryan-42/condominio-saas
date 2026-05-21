from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.database import Base


class Documento(Base):
    __tablename__ = "documentos"

    id            = Column(Integer, primary_key=True, index=True)
    nome          = Column(String, nullable=False)
    descricao     = Column(Text, nullable=True)
    filename      = Column(String, nullable=False)       # UUID-based stored filename
    nome_original = Column(String, nullable=False)       # original upload filename
    mime_type     = Column(String, nullable=True)
    tamanho_bytes = Column(BigInteger, default=0)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    criado_em     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
