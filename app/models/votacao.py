from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.database import Base


class Votacao(Base):
    __tablename__ = "votacoes"

    id            = Column(Integer, primary_key=True, index=True)
    titulo        = Column(String, nullable=False)
    descricao     = Column(Text, nullable=True)
    opcoes        = Column(JSON, nullable=False)        # List[str]
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    ativa         = Column(Boolean, default=True, nullable=False)
    criado_em     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    encerrada_em  = Column(DateTime, nullable=True)

    votos = relationship("VotoMorador", back_populates="votacao")


class VotoMorador(Base):
    __tablename__ = "votos_morador"
    __table_args__ = (
        UniqueConstraint("votacao_id", "morador_id", name="uq_voto_votacao_morador"),
    )

    id          = Column(Integer, primary_key=True, index=True)
    votacao_id  = Column(Integer, ForeignKey("votacoes.id"), nullable=False, index=True)
    morador_id  = Column(Integer, ForeignKey("moradores.id"), nullable=False, index=True)
    opcao_idx   = Column(Integer, nullable=False)
    votado_em   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    votacao = relationship("Votacao", back_populates="votos")
