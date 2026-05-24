import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = (
    os.getenv("DATABASE_URL") or
    os.getenv("DATABASE_PUBLIC_URL") or
    "sqlite:///./condominio.db"
)
# Railway entrega postgres:// mas SQLAlchemy requer postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    # Para PostgreSQL no Railway: recicla conexões ociosas antes do timeout do servidor
    pool_recycle=1800 if not _is_sqlite else -1,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()