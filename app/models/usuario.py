from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class TipoUsuario(str, enum.Enum):
    ADMIN   = "ADMIN"
    SINDICO = "SINDICO"
    MORADOR = "MORADOR"


class Usuario(Base):
    __tablename__ = "usuarios"

    id                   = Column(Integer, primary_key=True, index=True)
    nome                 = Column(String, nullable=False)
    email                = Column(String, unique=True, nullable=False, index=True)
    senha_hash           = Column(String, nullable=False)
    tipo                 = Column(Enum(TipoUsuario), nullable=False, default=TipoUsuario.SINDICO)
    condominio_id        = Column(Integer, ForeignKey("condominios.id"), nullable=True)
    reset_token          = Column(String, nullable=True)
    reset_token_expira   = Column(DateTime, nullable=True)

    # Billing — Sprint 6
    plano                  = Column(String, nullable=True, default="FREE")
    stripe_customer_id     = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    trial_ends_at          = Column(DateTime, nullable=True)

    condominio = relationship("Condominio")
