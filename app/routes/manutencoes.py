from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.manutencao import Manutencao
from app.models.morador import Morador
from app.schemas.manutencao import ManutencaoCreate, ManutencaoUpdate, ManutencaoOut
from app.email import enviar_manutencao_agendada

router = APIRouter(prefix="/manutencoes", tags=["Manutenções"])

_CAT_LABEL = {
    "ELEVADOR":"Elevador","PISCINA":"Piscina","GERADOR":"Gerador",
    "HIDRAULICA":"Hidráulica","ELETRICA":"Elétrica","LIMPEZA":"Limpeza",
    "JARDINAGEM":"Jardinagem","OUTRO":"Outro",
}


@router.get("", response_model=list[ManutencaoOut])
def listar_manutencoes(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)
    return (
        db.query(Manutencao)
        .filter(
            Manutencao.condominio_id == condominio_id,
            Manutencao.data_inicio.isnot(None),
        )
        .order_by(Manutencao.data_inicio.desc())
        .all()
    )


@router.post("", response_model=ManutencaoOut, status_code=201)
def criar_manutencao(
    dados: ManutencaoCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    checar_acesso_condominio(usuario, dados.condominio_id)
    m = Manutencao(**dados.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)

    moradores = db.query(Morador).filter(
        Morador.condominio_id == dados.condominio_id,
        Morador.email != None,
        Morador.senha_hash != None,
    ).all()
    data_fmt = m.data_inicio.strftime("%d/%m/%Y %H:%M")
    for mor in moradores:
        background_tasks.add_task(
            enviar_manutencao_agendada,
            mor.email, mor.nome or "Morador",
            m.titulo, _CAT_LABEL.get(m.categoria, m.categoria),
            data_fmt, m.impacto,
        )

    m.notificado = bool(moradores)
    db.commit()
    return m


@router.put("/{manutencao_id}", response_model=ManutencaoOut)
def atualizar_manutencao(
    manutencao_id: int,
    dados: ManutencaoUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    m = db.query(Manutencao).filter(Manutencao.id == manutencao_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    checar_acesso_condominio(usuario, m.condominio_id)
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(m, campo, valor)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{manutencao_id}", status_code=204)
def deletar_manutencao(
    manutencao_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    m = db.query(Manutencao).filter(Manutencao.id == manutencao_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    checar_acesso_condominio(usuario, m.condominio_id)
    db.delete(m)
    db.commit()
