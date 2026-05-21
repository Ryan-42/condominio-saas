from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.database import Base

class Condominio(Base):
    __tablename__ = "condominios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    quantidade_unidades = Column(Integer, nullable=False)

    taxa       = relationship("TaxaCondominio", back_populates="condominio", uselist=False)
    pagamentos = relationship("Pagamento", back_populates="condominio")
    avisos     = relationship("Aviso", back_populates="condominio")