from dotenv import load_dotenv
load_dotenv()

import os
import sys
import time
import uuid
import logging

from app.routes import pagamentos as pagamentos_router
from app.routes import relatorio_pdf as relatorio_pdf_router
from app.routes import ai as ai_router
from app.routes import avisos as avisos_router
from app.routes import importar as importar_router
from app.routes import registro as registro_router
from app.routes import reclamacoes as reclamacoes_router
from app.routes import espacos as espacos_router
from app.routes import votacoes as votacoes_router
from app.routes import documentos as documentos_router
from app.routes import manutencoes as manutencoes_router
from app.routes import chat as chat_router
from app.models import reclamacao as _reclamacao_model  # noqa: registra no metadata
from app.models import manutencao as _manutencao_model  # noqa
from app.models import mensagem as _mensagem_model      # noqa
from app.models import espaco as _espaco_model          # noqa
from app.models import votacao as _votacao_model        # noqa
from app.models import documento as _documento_model    # noqa

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database import engine, Base, SessionLocal
from app.routes import condominios, moradores, despesas, receitas
from app.routes import financeiro, usuarios, insights, relatorio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Validação de variáveis críticas ───────────────────────────
_SECRET_KEY = os.getenv("SECRET_KEY", "")
_GROQ_KEY   = os.getenv("GROQ_API_KEY", "")

if not _SECRET_KEY or _SECRET_KEY == "chave-local-dev":
    if os.getenv("ENV", "development") == "production":
        logger.critical("SECRET_KEY não definida. Abortando.")
        sys.exit(1)
    else:
        logger.warning("SECRET_KEY não definida — use apenas em desenvolvimento local.")

if not _GROQ_KEY:
    logger.warning("GROQ_API_KEY não definida — endpoint /ai/chat retornará erro 503.")

# ── CORS ──────────────────────────────────────────────────────
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500"
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="Condominio SaaS MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    rid = str(uuid.uuid4())[:8]
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    logger.info("[%s] %s %s → %d (%.1fms)", rid, request.method, request.url.path, response.status_code, elapsed)
    response.headers["X-Request-ID"] = rid
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Erro não tratado em %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Erro interno do servidor."})


Base.metadata.create_all(bind=engine)

# Migração automática — adiciona colunas novas em DBs existentes
_migrations = {
    "usuarios": [
        ("reset_token",        "VARCHAR"),
        ("reset_token_expira", "DATETIME"),
    ],
    "moradores": [
        ("senha_hash",     "VARCHAR"),
        ("convite_token",  "VARCHAR"),
        ("lgpd_aceite",           "BOOLEAN DEFAULT 0"),
        ("lgpd_aceite_em",        "DATETIME"),
        ("primeiro_acesso",       "BOOLEAN DEFAULT 1"),
        ("convite_token_expira",  "DATETIME"),
    ],
}
with engine.connect() as _conn:
    for _table, _cols in _migrations.items():
        for _col, _type in _cols:
            try:
                _conn.execute(text(f"ALTER TABLE {_table} ADD COLUMN {_col} {_type}"))
                _conn.commit()
                logger.info("Coluna '%s' adicionada à tabela %s.", _col, _table)
            except Exception:
                pass  # coluna já existe

app.include_router(condominios.router)
app.include_router(moradores.router)
app.include_router(despesas.router)
app.include_router(receitas.router)
app.include_router(financeiro.router)
app.include_router(usuarios.router)
app.include_router(insights.router)
app.include_router(relatorio.router)
app.include_router(pagamentos_router.router)
app.include_router(relatorio_pdf_router.router)
app.include_router(ai_router.router)
app.include_router(avisos_router.router)
app.include_router(importar_router.router)
app.include_router(registro_router.router)
app.include_router(reclamacoes_router.router)
app.include_router(espacos_router.router)
app.include_router(votacoes_router.router)
app.include_router(documentos_router.router)
app.include_router(manutencoes_router.router)
app.include_router(chat_router.router)


@app.get("/")
def root():
    return {"status": "online", "message": "CONDO//SYS API"}


@app.get("/health")
def health():
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        logger.error("Health check falhou: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")


# Serve os arquivos estáticos do frontend (produção).
# Rotas da API registradas acima têm prioridade sobre os arquivos estáticos.
_static_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.isdir(_static_dir) and any(
    f.endswith(".html") for f in os.listdir(_static_dir)
):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
