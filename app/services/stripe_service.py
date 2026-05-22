"""
Stripe integration para billing do CONDO//SYS.

Variáveis de ambiente necessárias:
  STRIPE_SECRET_KEY       sk_live_... ou sk_test_...
  STRIPE_WEBHOOK_SECRET   whsec_...
  STRIPE_PRICE_PRO        price_... (ID do price PRO no Stripe)
  APP_BASE_URL            https://condominio-saas-production-32fb.up.railway.app

Fluxo:
  1. Síndico clica "Assinar PRO" → POST /billing/checkout → recebe checkout_url
  2. Stripe redireciona de volta para APP_BASE_URL/index.html?upgrade=ok
  3. Webhook checkout.session.completed → atualiza plano no DB
  4. Webhook customer.subscription.deleted → downgrade para FREE
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

_STRIPE_KEY     = os.getenv("STRIPE_SECRET_KEY", "")
_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
_PRICE_PRO      = os.getenv("STRIPE_PRICE_PRO", "")
_APP_BASE_URL   = os.getenv("APP_BASE_URL", "http://localhost:5500").rstrip("/")


def _get_stripe():
    if not _STRIPE_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY não configurada.")
    import stripe
    stripe.api_key = _STRIPE_KEY
    return stripe


def criar_checkout_session(
    usuario_id: int,
    email: str,
    stripe_customer_id: Optional[str],
) -> str:
    """Cria uma Checkout Session PRO e retorna a URL de pagamento."""
    stripe = _get_stripe()
    if not _PRICE_PRO:
        raise RuntimeError("STRIPE_PRICE_PRO não configurada.")

    params: dict = {
        "mode": "subscription",
        "line_items": [{"price": _PRICE_PRO, "quantity": 1}],
        "success_url": f"{_APP_BASE_URL}/index.html?upgrade=ok&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url":  f"{_APP_BASE_URL}/index.html?upgrade=cancel",
        "client_reference_id": str(usuario_id),
        "metadata": {"usuario_id": str(usuario_id)},
        "subscription_data": {
            "trial_period_days": 14,
            "metadata": {"usuario_id": str(usuario_id)},
        },
    }
    if stripe_customer_id:
        params["customer"] = stripe_customer_id
    else:
        params["customer_email"] = email

    session = stripe.checkout.Session.create(**params)
    logger.info("checkout session criada usuario_id=%d session_id=%s", usuario_id, session.id)
    return session.url


def criar_portal_session(stripe_customer_id: str) -> str:
    """Cria sessão do Billing Portal para o síndico gerenciar a assinatura."""
    stripe = _get_stripe()
    session = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{_APP_BASE_URL}/index.html",
    )
    return session.url


def processar_webhook(payload: bytes, sig_header: str) -> dict:
    """
    Valida e processa eventos do Stripe.
    Retorna dict com `event_type` e dados relevantes.
    Levanta ValueError em caso de assinatura inválida.
    """
    if not _WEBHOOK_SECRET:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET não configurada.")

    stripe = _get_stripe()
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, _WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError as e:
        raise ValueError(f"Assinatura Stripe inválida: {e}") from e

    event_type = event["type"]
    logger.info("stripe webhook recebido type=%s", event_type)

    result = {"event_type": event_type, "usuario_id": None, "customer_id": None, "subscription_id": None}

    if event_type == "checkout.session.completed":
        obj = event["data"]["object"]
        result.update({
            "usuario_id": int(obj.get("client_reference_id") or obj["metadata"].get("usuario_id", 0)),
            "customer_id": obj.get("customer"),
            "subscription_id": obj.get("subscription"),
            "plano": "PRO",
        })

    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        obj = event["data"]["object"]
        meta = obj.get("metadata", {})
        result.update({
            "usuario_id": int(meta.get("usuario_id", 0)),
            "customer_id": obj.get("customer"),
            "subscription_id": obj.get("id"),
            "plano": "FREE",
        })

    elif event_type == "invoice.payment_failed":
        obj = event["data"]["object"]
        result["customer_id"] = obj.get("customer")
        logger.warning("stripe pagamento falhou customer=%s", result["customer_id"])

    return result
