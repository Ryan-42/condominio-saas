import enum
from dataclasses import dataclass


class Plano(str, enum.Enum):
    FREE       = "FREE"
    PRO        = "PRO"
    ENTERPRISE = "ENTERPRISE"


@dataclass(frozen=True)
class PlanoConfig:
    nome: str
    max_moradores: int       # -1 = ilimitado
    trial_dias: int
    preco_mensal_brl: float  # 0 = gratuito


PLANOS: dict[Plano, PlanoConfig] = {
    Plano.FREE: PlanoConfig(
        nome="Free",
        max_moradores=30,
        trial_dias=0,
        preco_mensal_brl=0.0,
    ),
    Plano.PRO: PlanoConfig(
        nome="Pro",
        max_moradores=150,
        trial_dias=14,
        preco_mensal_brl=97.0,
    ),
    Plano.ENTERPRISE: PlanoConfig(
        nome="Enterprise",
        max_moradores=-1,
        trial_dias=14,
        preco_mensal_brl=0.0,  # negociado
    ),
}


def get_config(plano: str | Plano) -> PlanoConfig:
    try:
        return PLANOS[Plano(plano)]
    except (ValueError, KeyError):
        return PLANOS[Plano.FREE]
