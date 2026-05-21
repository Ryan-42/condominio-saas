from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.votacao import Votacao, VotoMorador
from app.models.usuario import TipoUsuario
from app.schemas.votacao import VotacaoCreate, VotacaoOut, VotarInput

router = APIRouter(tags=["Votações"])


def _build_out(v: Votacao, morador_id: int | None, db: Session) -> VotacaoOut:
    resultados = [0] * len(v.opcoes)
    for voto in v.votos:
        if 0 <= voto.opcao_idx < len(resultados):
            resultados[voto.opcao_idx] += 1

    meu_voto = None
    if morador_id is not None:
        voto_obj = next((vt for vt in v.votos if vt.morador_id == morador_id), None)
        meu_voto = voto_obj.opcao_idx if voto_obj else -1

    return VotacaoOut(
        id=v.id,
        titulo=v.titulo,
        descricao=v.descricao,
        opcoes=v.opcoes,
        condominio_id=v.condominio_id,
        ativa=v.ativa,
        criado_em=v.criado_em,
        encerrada_em=v.encerrada_em,
        resultados=resultados,
        total_votos=sum(resultados),
        meu_voto=meu_voto,
    )


@router.get("/votacoes", response_model=list[VotacaoOut])
def listar_votacoes(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)
    votacoes = (
        db.query(Votacao)
        .filter(Votacao.condominio_id == condominio_id)
        .order_by(Votacao.criado_em.desc())
        .all()
    )
    morador_id = getattr(usuario, "morador_id", None)
    return [_build_out(v, morador_id, db) for v in votacoes]


@router.post("/votacoes", response_model=VotacaoOut, status_code=201)
def criar_votacao(
    dados: VotacaoCreate,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    checar_acesso_condominio(usuario, dados.condominio_id)
    if len(dados.opcoes) < 2:
        raise HTTPException(status_code=400, detail="Uma votação precisa de pelo menos 2 opções.")

    v = Votacao(**dados.model_dump(), usuario_id=getattr(usuario, "id", None))
    db.add(v)
    db.commit()
    db.refresh(v)
    return _build_out(v, None, db)


@router.put("/votacoes/{votacao_id}/encerrar", response_model=VotacaoOut)
def encerrar_votacao(
    votacao_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    v = db.query(Votacao).filter(Votacao.id == votacao_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Votação não encontrada")
    checar_acesso_condominio(usuario, v.condominio_id)
    v.ativa = False
    v.encerrada_em = datetime.now(timezone.utc)
    db.commit()
    db.refresh(v)
    return _build_out(v, None, db)


@router.delete("/votacoes/{votacao_id}", status_code=204)
def deletar_votacao(
    votacao_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    v = db.query(Votacao).filter(Votacao.id == votacao_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Votação não encontrada")
    checar_acesso_condominio(usuario, v.condominio_id)
    db.delete(v)
    db.commit()


@router.post("/votacoes/{votacao_id}/votar", response_model=VotacaoOut)
def votar(
    votacao_id: int,
    body: VotarInput,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    if usuario.tipo != TipoUsuario.MORADOR:
        raise HTTPException(status_code=403, detail="Somente moradores podem votar")

    v = db.query(Votacao).filter(Votacao.id == votacao_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Votação não encontrada")
    checar_acesso_condominio(usuario, v.condominio_id)

    if not v.ativa:
        raise HTTPException(status_code=400, detail="Esta votação está encerrada")
    if body.opcao_idx < 0 or body.opcao_idx >= len(v.opcoes):
        raise HTTPException(status_code=400, detail="Opção inválida")

    morador_id = getattr(usuario, "morador_id", usuario.id)
    voto = VotoMorador(votacao_id=votacao_id, morador_id=morador_id, opcao_idx=body.opcao_idx)
    db.add(voto)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Você já votou nesta enquete")

    db.refresh(v)
    return _build_out(v, morador_id, db)
