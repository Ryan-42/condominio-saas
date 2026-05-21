from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.mensagem import Mensagem, AutorTipo
from app.models.morador import Morador
from app.models.usuario import TipoUsuario
from app.schemas.mensagem import MensagemCreate, MensagemOut, ConversaOut
from app.email import enviar_nova_mensagem

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.get("/conversas", response_model=list[ConversaOut])
def listar_conversas(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    """Síndico vê lista de conversas (uma por morador) com preview e não lidas."""
    checar_acesso_condominio(usuario, condominio_id)

    moradores = db.query(Morador).filter(
        Morador.condominio_id == condominio_id,
        Morador.senha_hash != None,
    ).all()

    resultado = []
    for m in moradores:
        msgs = (
            db.query(Mensagem)
            .filter(Mensagem.condominio_id == condominio_id, Mensagem.morador_id == m.id)
            .order_by(Mensagem.criado_em.desc())
            .all()
        )
        if not msgs:
            continue
        ultima = msgs[0]
        nao_lidas = sum(
            1 for msg in msgs
            if msg.autor_tipo == AutorTipo.MORADOR and not msg.lida
        )
        resultado.append(ConversaOut(
            morador_id=m.id,
            morador_nome=m.nome or "Morador",
            morador_apto=m.apartamento,
            ultima_msg=ultima.conteudo,
            ultima_msg_em=ultima.criado_em,
            nao_lidas=nao_lidas,
            autor_ultima=ultima.autor_tipo,
        ))

    resultado.sort(key=lambda c: c.ultima_msg_em or 0, reverse=True)
    return resultado


@router.get("/mensagens", response_model=list[MensagemOut])
def listar_mensagens(
    condominio_id: int = Query(...),
    morador_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)

    # Morador só acessa a própria conversa
    if usuario.tipo == TipoUsuario.MORADOR:
        mid = getattr(usuario, "morador_id", usuario.id)
        if mid != morador_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    msgs = (
        db.query(Mensagem)
        .filter(Mensagem.condominio_id == condominio_id, Mensagem.morador_id == morador_id)
        .order_by(Mensagem.criado_em.asc())
        .all()
    )

    # Marcar como lidas as mensagens da outra parte
    autor_leitor = AutorTipo.SINDICO if usuario.tipo != TipoUsuario.MORADOR else AutorTipo.MORADOR
    for msg in msgs:
        if msg.autor_tipo != autor_leitor and not msg.lida:
            msg.lida = True
    db.commit()

    return msgs


@router.post("/mensagens", response_model=MensagemOut, status_code=201)
def enviar_mensagem(
    dados: MensagemCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, dados.condominio_id)

    if usuario.tipo == TipoUsuario.MORADOR:
        mid = getattr(usuario, "morador_id", usuario.id)
        if mid != dados.morador_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
        autor = AutorTipo.MORADOR
    else:
        autor = AutorTipo.SINDICO

    if not dados.conteudo.strip():
        raise HTTPException(status_code=400, detail="Mensagem não pode estar vazia")

    msg = Mensagem(
        condominio_id=dados.condominio_id,
        morador_id=dados.morador_id,
        autor_tipo=autor,
        conteudo=dados.conteudo.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    if autor == AutorTipo.SINDICO:
        morador = db.query(Morador).filter(Morador.id == dados.morador_id).first()
        if morador and morador.email:
            background_tasks.add_task(enviar_nova_mensagem, morador.email, morador.nome or "Morador", "Síndico", dados.conteudo)
    else:
        from app.models.usuario import Usuario
        sindico = db.query(Usuario).filter(
            Usuario.condominio_id == dados.condominio_id,
            Usuario.tipo.in_(["SINDICO","ADMIN"]),
        ).first()
        if sindico and sindico.email:
            morador = db.query(Morador).filter(Morador.id == dados.morador_id).first()
            remetente = morador.nome if morador else "Morador"
            background_tasks.add_task(enviar_nova_mensagem, sindico.email, sindico.nome or "Síndico", remetente, dados.conteudo)

    return msg


@router.get("/nao-lidas", response_model=dict)
def contar_nao_lidas(
    condominio_id: int = Query(...),
    morador_id: int = Query(None),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    """Retorna contagem de mensagens não lidas para o usuário atual."""
    checar_acesso_condominio(usuario, condominio_id)

    if usuario.tipo == TipoUsuario.MORADOR:
        mid = getattr(usuario, "morador_id", usuario.id)
        count = db.query(func.count(Mensagem.id)).filter(
            Mensagem.condominio_id == condominio_id,
            Mensagem.morador_id == mid,
            Mensagem.autor_tipo == AutorTipo.SINDICO,
            Mensagem.lida == False,
        ).scalar() or 0
    else:
        query = db.query(func.count(Mensagem.id)).filter(
            Mensagem.condominio_id == condominio_id,
            Mensagem.autor_tipo == AutorTipo.MORADOR,
            Mensagem.lida == False,
        )
        if morador_id:
            query = query.filter(Mensagem.morador_id == morador_id)
        count = query.scalar() or 0

    return {"nao_lidas": count}
