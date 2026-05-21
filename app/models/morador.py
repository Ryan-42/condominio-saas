from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from app.database import Base


class Morador(Base):
    __tablename__ = "moradores"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, index=True)
    telefone = Column(String)
    apartamento = Column(String)

    senha_hash = Column(String, nullable=True)
    convite_token = Column(String, unique=True, index=True, nullable=True)
    convite_token_expira = Column(DateTime, nullable=True)
    lgpd_aceite = Column(Boolean, default=False)
    lgpd_aceite_em = Column(DateTime, nullable=True)
    primeiro_acesso = Column(Boolean, default=True)

    condominio_id = Column(Integer, ForeignKey("condominios.id"), index=True)

    condominio = relationship("Condominio")
    pagamentos = relationship("Pagamento", back_populates="morador")