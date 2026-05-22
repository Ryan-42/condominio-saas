"""
In-memory JWT token blacklist para logout seguro.

Design:
- Chaveado por `jti` (JWT ID único por token).
- Cada entrada tem TTL igual à expiração natural do token — não acumula lixo.
- Thread-safe com um único Lock.
- Redis-ready: basta trocar a implementação de `revoke`/`is_revoked` por
  chamadas `redis.setex(jti, ttl, 1)` / `redis.exists(jti)` sem mudar callers.

Limitação conhecida: em-memória não sobrevive a restart nem funciona em
múltiplas instâncias. Aceitável para beta de instância única (Railway free).
"""

import threading
from datetime import datetime, timezone
from typing import Dict

_lock = threading.Lock()
_store: Dict[str, datetime] = {}  # jti -> expiry UTC


def revoke(jti: str, expiry: datetime) -> None:
    """Revoga um token pelo seu JWT ID. Expira automaticamente com o token."""
    with _lock:
        _prune()
        _store[jti] = expiry


def is_revoked(jti: str) -> bool:
    """Retorna True se o token foi explicitamente revogado."""
    with _lock:
        _prune()
        return jti in _store


def _prune() -> None:
    now = datetime.now(timezone.utc)
    stale = [k for k, v in _store.items() if v <= now]
    for k in stale:
        del _store[k]
