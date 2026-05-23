from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.condominio import Condominio
from app.models.usuario import Usuario, TipoUsuario
from app.schemas.condominio import CondominioCreate, Condominio as CondominioSchema
from app.auth import get_db, get_usuario_logado, somente_admin, somente_gestor, checar_acesso_condominio
from app.schemas.condominio import CondominioComSindico

router = APIRouter()


@router.get("/condominios", response_model=list[CondominioSchema])
def listar_condominios(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    """
    ADMIN vê todos.
    SINDICO vê apenas o seu condomínio.
    """
    if usuario.tipo == TipoUsuario.ADMIN:
        return db.query(Condominio).all()

    if not usuario.condominio_id:
        return []

    return db.query(Condominio).filter(
        Condominio.id == usuario.condominio_id
    ).all()


@router.post("/condominios", response_model=CondominioSchema, status_code=201)
def criar_condominio(
    condominio: CondominioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(somente_admin),   # somente ADMIN cria condomínios
):
    novo = Condominio(**condominio.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@router.get("/condominios/{condominio_id}", response_model=CondominioSchema)
def buscar_condominio(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_logado),
):
    if usuario.tipo == TipoUsuario.SINDICO and usuario.condominio_id != condominio_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    condo = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condo:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    return condo


@router.get("/admin/condominios", response_model=list[CondominioComSindico])
def listar_condominios_admin(
    db: Session = Depends(get_db),
    _: Usuario = Depends(somente_admin),
):
    """Lista todos os condomínios com info do síndico vinculado (single JOIN)."""
    from sqlalchemy.orm import aliased
    Sindico = aliased(Usuario)
    rows = (
        db.query(Condominio, Sindico)
        .outerjoin(
            Sindico,
            (Sindico.condominio_id == Condominio.id) & (Sindico.tipo == TipoUsuario.SINDICO),
        )
        .all()
    )
    return [
        CondominioComSindico(
            id=c.id,
            nome=c.nome,
            quantidade_unidades=c.quantidade_unidades,
            sindico_nome=s.nome if s else None,
            sindico_email=s.email if s else None,
        )
        for c, s in rows
    ]


@router.put("/condominios/{condominio_id}", response_model=CondominioSchema)
def atualizar_condominio(
    condominio_id: int,
    dados: CondominioCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(somente_gestor),
):
    condo = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condo:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    checar_acesso_condominio(usuario, condominio_id)
    condo.nome = dados.nome
    condo.quantidade_unidades = dados.quantidade_unidades
    db.commit()
    db.refresh(condo)
    return condo


@router.delete("/condominios/{condominio_id}", status_code=204)
def deletar_condominio(
    condominio_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(somente_admin),
):
    condo = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condo:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")

    # Cascade manual — deleta dependentes na ordem correta antes do condomínio
    from sqlalchemy import text
    cid = condominio_id
    try:
        db.execute(text("DELETE FROM votos_morador WHERE votacao_id IN (SELECT id FROM votacoes WHERE condominio_id=:c)"), {"c": cid})
        db.execute(text("DELETE FROM votacoes       WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM reservas        WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM espacos         WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM pagamentos      WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM taxas_condominio WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM documentos      WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM manutencoes     WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM mensagens       WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM reclamacoes     WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM avisos          WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM moradores       WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM despesas        WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM receitas        WHERE condominio_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM usuarios WHERE condominio_id=:c AND tipo != 'ADMIN'"), {"c": cid})
        db.delete(condo)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao excluir: {exc}")
    return None