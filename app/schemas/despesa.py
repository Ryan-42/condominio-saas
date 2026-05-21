from pydantic import BaseModel, ConfigDict, field_validator
from datetime import date


class DespesaBase(BaseModel):
    descricao: str
    valor: float
    data: date
    condominio_id: int

    @field_validator("valor")
    @classmethod
    def valor_positivo(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("O valor deve ser maior que zero")
        if v > 999_999_999.99:
            raise ValueError("Valor fora do limite permitido")
        return round(v, 2)

    @field_validator("descricao")
    @classmethod
    def descricao_nao_vazia(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("A descrição não pode ser vazia")
        return v


class DespesaCreate(DespesaBase):
    pass


class Despesa(DespesaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
