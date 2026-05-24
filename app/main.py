from dotenv import load_dotenv
load_dotenv()

import os
import sys
import time
import uuid
import logging

# ── Logging deve ser configurado antes de qualquer import de rotas ─────────────
from app.logging_config import setup_logging
setup_logging()

# ── Sentry (opcional — só inicializa se SENTRY_DSN estiver definido) ───────────
_SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if _SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        environment=os.getenv("ENV", "development"),
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,  # nunca enviar dados pessoais
    )
    logging.getLogger(__name__).info("Sentry inicializado (env=%s)", os.getenv("ENV"))

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
from app.routes import billing as billing_router
from app.models import reclamacao as _reclamacao_model  # noqa
from app.models import manutencao as _manutencao_model  # noqa
from app.models import mensagem as _mensagem_model      # noqa
from app.models import espaco as _espaco_model          # noqa
from app.models import votacao as _votacao_model        # noqa
from app.models import documento as _documento_model    # noqa

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database import engine, Base, SessionLocal
from app.routes import condominios, moradores, despesas, receitas
from app.routes import financeiro, usuarios, insights, relatorio

logger = logging.getLogger(__name__)


def _init_db():
    _migrations = {
        "usuarios": [
            ("reset_token",        "VARCHAR"),
            ("reset_token_expira", "TIMESTAMP"),
            # Sprint 6 — billing
            ("plano",                  "VARCHAR DEFAULT 'FREE'"),
            ("stripe_customer_id",     "VARCHAR"),
            ("stripe_subscription_id", "VARCHAR"),
            ("trial_ends_at",          "TIMESTAMP"),
        ],
        "moradores": [
            ("senha_hash",            "VARCHAR"),
            ("convite_token",         "VARCHAR"),
            ("lgpd_aceite",           "BOOLEAN DEFAULT FALSE"),
            ("lgpd_aceite_em",        "TIMESTAMP"),
            ("primeiro_acesso",       "BOOLEAN DEFAULT TRUE"),
            ("convite_token_expira",  "TIMESTAMP"),
            ("reset_token",           "VARCHAR"),
            ("reset_token_expira",    "TIMESTAMP"),
        ],
    }
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Tabelas verificadas/criadas com sucesso.")
    except Exception as e:
        logger.error("Erro ao criar tabelas: %s", e)
        return
    try:
        with engine.connect() as conn:
            for table, cols in _migrations.items():
                for col, col_type in cols:
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                        conn.commit()
                        logger.info("Coluna '%s' adicionada à tabela %s.", col, table)
                    except Exception:
                        conn.rollback()
    except Exception as e:
        logger.warning("Migração automática ignorada: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    yield


# ── Validação de variáveis críticas ───────────────────────────────────────────
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

# ── CORS ──────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500"
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="CONDO//SYS API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Injeta request_id em cada requisição e loga latência."""
    rid = str(uuid.uuid4())[:8]
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    logger.info(
        "request completed",
        extra={
            "request_id": rid,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "ms": round(elapsed, 1),
        },
    )
    response.headers["X-Request-ID"] = rid
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "unhandled exception",
        extra={"method": request.method, "path": request.url.path},
    )
    return JSONResponse(status_code=500, content={"detail": "Erro interno do servidor."})


# ── Routers ───────────────────────────────────────────────────────────────────
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
app.include_router(billing_router.router)


# ── Saúde ─────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "online", "message": "CONDO//SYS API", "version": "1.0.0"}


@app.get("/health")
def health():
    """Healthcheck rápido — usado pelo Railway (deve responder em < 200ms)."""
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        logger.error("health check falhou: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.get("/health/details")
def health_details():
    """Healthcheck detalhado com status de cada dependência."""
    import time as _time

    results: dict = {}

    # PostgreSQL
    try:
        t0 = _time.perf_counter()
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        results["database"] = {"status": "ok", "latency_ms": round((_time.perf_counter() - t0) * 1000, 1)}
    except Exception as e:
        results["database"] = {"status": "error", "detail": str(e)}

    # Groq API key presente
    results["groq"] = {
        "status": "configured" if os.getenv("GROQ_API_KEY") else "missing_key"
    }

    # Stripe key presente
    results["stripe"] = {
        "status": "configured" if os.getenv("STRIPE_SECRET_KEY") else "missing_key"
    }

    # Storage backend
    from app.services.storage import storage
    results["storage"] = {"backend": type(storage).__name__}

    # Sentry
    results["sentry"] = {"status": "configured" if _SENTRY_DSN else "disabled"}

    overall = "ok" if results["database"]["status"] == "ok" else "degraded"
    return {"status": overall, "services": results}


# Serve os arquivos estáticos do frontend (produção).
_static_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.isdir(_static_dir) and any(
    f.endswith(".html") for f in os.listdir(_static_dir)
):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
