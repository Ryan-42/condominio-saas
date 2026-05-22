"""
Endpoints de billing — planos, upgrade Stripe, webhook.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor
from app.models.usuario import Usuario, TipoUsuario
from app.models.plano import Plano, PLANOS, get_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["Billing"])


# ── GET /billing/plano ────────────────────────────────────────────────────────

@router.get("/plano")
def meu_plano(
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    """Retorna o plano atual, limites e status do trial."""
    if isinstance(usuario, Usuario):
        db_usuario = db.query(Usuario).filter(Usuario.id == usuario.id).first()
    else:
        raise HTTPException(status_code=403, detail="Apenas síndicos e admins.")

    plano_str = getattr(db_usuario, "plano", None) or "FREE"
    config    = get_config(plano_str)
    trial_ends = getattr(db_usuario, "trial_ends_at", None)

    from datetime import datetime, timezone
    trial_ativo = False
    if trial_ends:
        if trial_ends.tzinfo is None:
            from datetime import timezone as tz
            trial_ends = trial_ends.replace(tzinfo=tz.utc)
        trial_ativo = datetime.now(timezone.utc) < trial_ends

    return {
        "plano":          plano_str,
        "nome":           config.nome,
        "max_moradores":  config.max_moradores,
        "preco_mensal":   config.preco_mensal_brl,
        "trial_ativo":    trial_ativo,
        "trial_ends_at":  trial_ends.isoformat() if trial_ends else None,
        "tem_stripe":     bool(getattr(db_usuario, "stripe_customer_id", None)),
    }


# ── GET /billing/planos ───────────────────────────────────────────────────────

@router.get("/planos")
def listar_planos():
    """Lista todos os planos disponíveis (público — para página de pricing)."""
    return [
        {
            "plano":         p.value,
            "nome":          cfg.nome,
            "max_moradores": cfg.max_moradores,
            "preco_mensal":  cfg.preco_mensal_brl,
            "trial_dias":    cfg.trial_dias,
        }
        for p, cfg in PLANOS.items()
    ]


# ── POST /billing/checkout ────────────────────────────────────────────────────

@router.post("/checkout")
def iniciar_checkout(
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    """Cria sessão Stripe Checkout para upgrade PRO. Retorna URL de pagamento."""
    from app.services.stripe_service import criar_checkout_session

    if not isinstance(usuario, Usuario):
        raise HTTPException(status_code=403, detail="Apenas síndicos e admins.")

    db_usuario = db.query(Usuario).filter(Usuario.id == usuario.id).first()
    plano_atual = getattr(db_usuario, "plano", "FREE") or "FREE"

    if plano_atual == "PRO":
        raise HTTPException(status_code=400, detail="Você já tem o plano PRO.")

    try:
        url = criar_checkout_session(
            usuario_id=db_usuario.id,
            email=db_usuario.email,
            stripe_customer_id=getattr(db_usuario, "stripe_customer_id", None),
        )
    except RuntimeError as e:
        logger.error("checkout error usuario_id=%d: %s", db_usuario.id, e)
        raise HTTPException(status_code=503, detail="Serviço de pagamento não disponível.")

    return {"checkout_url": url}


# ── POST /billing/portal ──────────────────────────────────────────────────────

@router.post("/portal")
def billing_portal(
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    """Redireciona para o Billing Portal do Stripe para gestão da assinatura."""
    from app.services.stripe_service import criar_portal_session

    if not isinstance(usuario, Usuario):
        raise HTTPException(status_code=403, detail="Apenas síndicos e admins.")

    db_usuario = db.query(Usuario).filter(Usuario.id == usuario.id).first()
    customer_id = getattr(db_usuario, "stripe_customer_id", None)
    if not customer_id:
        raise HTTPException(status_code=400, detail="Nenhuma assinatura ativa encontrada.")

    try:
        url = criar_portal_session(customer_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Serviço de pagamento não disponível.")

    return {"portal_url": url}


# ── POST /billing/webhook ─────────────────────────────────────────────────────

@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Recebe eventos do Stripe. Deve ser registrado no Stripe Dashboard
    como endpoint de webhook com os eventos:
      - checkout.session.completed
      - customer.subscription.deleted
      - invoice.payment_failed
    """
    from app.services.stripe_service import processar_webhook

    payload    = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        evento = processar_webhook(payload, sig_header)
    except ValueError as e:
        logger.warning("webhook inválido: %s", e)
        raise HTTPException(status_code=400, detail="Assinatura inválida.")
    except RuntimeError as e:
        logger.error("webhook config error: %s", e)
        raise HTTPException(status_code=503, detail=str(e))

    usuario_id = evento.get("usuario_id")
    if not usuario_id:
        return {"status": "ignored"}

    db_usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not db_usuario:
        logger.warning("webhook usuario_id=%d não encontrado", usuario_id)
        return {"status": "user_not_found"}

    event_type = evento["event_type"]

    if event_type == "checkout.session.completed":
        db_usuario.plano                  = evento.get("plano", "PRO")
        db_usuario.stripe_customer_id     = evento.get("customer_id")
        db_usuario.stripe_subscription_id = evento.get("subscription_id")
        db_usuario.trial_ends_at          = None  # trial substituído por assinatura real
        db.commit()
        logger.info("plano atualizado para PRO usuario_id=%d", usuario_id)

    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        db_usuario.plano                  = "FREE"
        db_usuario.stripe_subscription_id = None
        db.commit()
        logger.info("plano downgrade para FREE usuario_id=%d", usuario_id)

    return {"status": "ok", "event": event_type}
