from sqlalchemy import Column, Integer, Float, Boolean, String, Date, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from app.database import Base


class TaxaCondominio(Base):
    __tablename__ = "taxas_condominio"

    id = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), unique=True, nullable=False)
    valor = Column(Float, nullable=False)

    condominio = relationship("Condominio", back_populates="taxa")


class Pagamento(Base):
    __tablename__ = "pagamentos"

    id = Column(Integer, primary_key=True, index=True)
    morador_id = Column(Integer, ForeignKey("moradores.id", ondelete="SET NULL"), nullable=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False)
    mes = Column(Integer, nullable=False)
    ano = Column(Integer, nullable=False)
    valor = Column(Float, nullable=False)
    pago = Column(Boolean, default=False)
    data_pagamento = Column(Date, nullable=True)
    observacao = Column(String, nullable=True)

    morador = relationship("Morador", back_populates="pagamentos")
    condominio = relationship("Condominio", back_populates="pagamentos")

    __table_args__ = (
        UniqueConstraint("morador_id", "mes", "ano", name="uq_morador_mes_ano"),
        Index('ix_pagamento_condominio', 'condominio_id'),
        Index('ix_pagamento_condominio_pago', 'condominio_id', 'pago'),
    )