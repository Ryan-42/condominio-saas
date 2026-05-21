import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from groq import Groq, APIError, APIConnectionError, RateLimitError

from app.auth import get_db, get_usuario_logado
from app.models.usuario import Usuario, TipoUsuario
from app.models.condominio import Condominio
from app.models.despesa import Despesa
from app.models.receita import Receita
from app.models.pagamento import Pagamento, TaxaCondominio
from app.models.morador import Morador
from app.schemas.ai_chat import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])

_groq_api_key = os.getenv("GROQ_API_KEY", "")
_groq = Groq(api_key=_groq_api_key) if _groq_api_key else None


def _verificar_acesso(condominio_id: int, usuario: Usuario, db: Session):
    if usuario.tipo != TipoUsuario.ADMIN and usuario.condominio_id != condominio_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    cond = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    return cond


@router.get("/dados/{condominio_id}")
def dados_ia(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    cond = _verificar_acesso(condominio_id, usuario, db)

    total_receitas = db.query(func.sum(Receita.valor)).filter(
        Receita.condominio_id == condominio_id
    ).scalar() or 0.0

    total_despesas = db.query(func.sum(Despesa.valor)).filter(
        Despesa.condominio_id == condominio_id
    ).scalar() or 0.0

    saldo = total_receitas - total_despesas

    despesas = (
        db.query(Despesa)
        .filter(Despesa.condominio_id == condominio_id)
        .order_by(Despesa.valor.desc())
        .all()
    )
    despesas_lista = [
        {"descricao": d.descricao, "valor": d.valor, "data": str(d.data)}
        for d in despesas
    ]

    receitas = (
        db.query(Receita)
        .filter(Receita.condominio_id == condominio_id)
        .order_by(Receita.data.desc())
        .all()
    )
    receitas_lista = [
        {"descricao": r.descricao, "valor": r.valor, "data": str(r.data)}
        for r in receitas
    ]

    taxa = db.query(TaxaCondominio).filter(
        TaxaCondominio.condominio_id == condominio_id
    ).first()
    valor_taxa = taxa.valor if taxa else 0.0

    moradores = db.query(Morador).filter(
        Morador.condominio_id == condominio_id
    ).all()

    pagamentos_ok = {p.morador_id for p in db.query(Pagamento.morador_id).filter(
        Pagamento.condominio_id == condominio_id,
        Pagamento.pago == True,
    ).all()}

    inadimplentes = [
        {"nome": m.nome, "apartamento": m.apartamento or "—", "valor": valor_taxa}
        for m in moradores
        if m.id not in pagamentos_ok
    ]

    moradores_lista = [
        {"nome": m.nome, "apartamento": m.apartamento or "—"}
        for m in moradores
    ]

    return {
        "condominio": cond.nome,
        "saldo": saldo,
        "total_receitas": total_receitas,
        "total_despesas": total_despesas,
        "taxa_mensal": valor_taxa,
        "despesas": despesas_lista,
        "receitas": receitas_lista,
        "inadimplentes": inadimplentes,
        "moradores": moradores_lista,
        "total_moradores": len(moradores_lista),
        "total_inadimplentes": len(inadimplentes),
    }


@router.post("/chat", response_model=ChatResponse)
def chat_ia(
    body: ChatRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    if not _groq:
        raise HTTPException(status_code=503, detail="Serviço de IA indisponível (chave não configurada)")

    cond = _verificar_acesso(body.condominio_id, usuario, db)

    total_receitas = db.query(func.sum(Receita.valor)).filter(
        Receita.condominio_id == body.condominio_id
    ).scalar() or 0.0

    total_despesas = db.query(func.sum(Despesa.valor)).filter(
        Despesa.condominio_id == body.condominio_id
    ).scalar() or 0.0

    saldo = total_receitas - total_despesas

    despesas = (
        db.query(Despesa)
        .filter(Despesa.condominio_id == body.condominio_id)
        .order_by(Despesa.valor.desc())
        .limit(10)
        .all()
    )
    receitas = (
        db.query(Receita)
        .filter(Receita.condominio_id == body.condominio_id)
        .order_by(Receita.data.desc())
        .limit(10)
        .all()
    )
    moradores = db.query(Morador).filter(Morador.condominio_id == body.condominio_id).all()

    taxa = db.query(TaxaCondominio).filter(TaxaCondominio.condominio_id == body.condominio_id).first()
    valor_taxa = taxa.valor if taxa else 0.0

    pagamentos_ok = {p.morador_id for p in db.query(Pagamento.morador_id).filter(
        Pagamento.condominio_id == body.condominio_id,
        Pagamento.pago == True,
    ).all()}

    inadimplentes = [m for m in moradores if m.id not in pagamentos_ok]

    if usuario.tipo == TipoUsuario.MORADOR:
        # Contexto simplificado — sem dados financeiros de terceiros
        morador_obj = next((m for m in moradores if m.id == getattr(usuario, "morador_id", None)), None)
        morador_pago = morador_obj and morador_obj.id in pagamentos_ok if morador_obj else None
        context = f"""Você é o assistente virtual do condomínio "{cond.nome}".
Responda sempre em português de forma clara, amigável e objetiva.
Você auxilia moradores com dúvidas sobre regras, áreas comuns, comunicados e informações gerais do condomínio.
Não divulgue dados financeiros de outros moradores.

CONDOMÍNIO: {cond.nome}
TAXA MENSAL: R$ {valor_taxa:.2f}
{"SITUAÇÃO DA SUA TAXA: Em dia ✓" if morador_pago else "SITUAÇÃO DA SUA TAXA: Pendente — procure o síndico" if morador_pago is False else ""}
"""
    else:
        context = f"""Você é o assistente do condomínio "{cond.nome}". Responda sempre em português de forma clara e objetiva.

DADOS FINANCEIROS:
- Saldo líquido: R$ {saldo:.2f}
- Total receitas: R$ {total_receitas:.2f}
- Total despesas: R$ {total_despesas:.2f}
- Taxa mensal: R$ {valor_taxa:.2f}

MORADORES: {len(moradores)} cadastrados, {len(inadimplentes)} inadimplentes
Inadimplentes: {', '.join(f"{m.nome} (Apto {m.apartamento or '-'})" for m in inadimplentes) or 'Nenhum'}

DESPESAS RECENTES (top 10 por valor):
{chr(10).join(f"- {d.descricao}: R$ {d.valor:.2f} em {d.data}" for d in despesas) or 'Nenhuma'}

RECEITAS RECENTES:
{chr(10).join(f"- {r.descricao}: R$ {r.valor:.2f} em {r.data}" for r in receitas) or 'Nenhuma'}

MORADORES:
{chr(10).join(f"- {m.nome} (Apto {m.apartamento or '-'})" for m in moradores) or 'Nenhum'}
"""

    messages = [{"role": "system", "content": context}]
    for msg in body.historico[-20:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.mensagem})

    try:
        completion = _groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=1024,
            temperature=0.7,
            timeout=30,
        )
        resposta = completion.choices[0].message.content
    except RateLimitError:
        logger.warning("Groq rate limit atingido")
        raise HTTPException(status_code=429, detail="Limite de requisições da IA atingido. Tente novamente em instantes.")
    except APIConnectionError:
        logger.error("Groq connection error")
        raise HTTPException(status_code=503, detail="Serviço de IA temporariamente indisponível.")
    except APIError as e:
        logger.error("Groq API error: %s", e)
        raise HTTPException(status_code=502, detail="Erro na comunicação com o serviço de IA.")
    except Exception as e:
        logger.exception("Groq erro inesperado: %s", e)
        raise HTTPException(status_code=500, detail="Erro interno no serviço de IA.")

    return ChatResponse(resposta=resposta)
