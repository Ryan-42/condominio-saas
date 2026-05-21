import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.documento import Documento
from app.schemas.documento import DocumentoOut

router = APIRouter(tags=["Documentos"])

_BASE_DIR   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_UPLOAD_DIR = os.path.join(_BASE_DIR, "uploads")
_MAX_BYTES  = 20 * 1024 * 1024   # 20 MB

ALLOWED_MIME = {
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}


@router.get("/documentos", response_model=list[DocumentoOut])
def listar_documentos(
    condominio_id: int = Query(...),
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    checar_acesso_condominio(usuario, condominio_id)
    return (
        db.query(Documento)
        .filter(Documento.condominio_id == condominio_id)
        .order_by(Documento.criado_em.desc())
        .all()
    )


@router.post("/documentos", response_model=DocumentoOut, status_code=201)
async def upload_documento(
    condominio_id: int = Form(...),
    nome: str = Form(...),
    descricao: str = Form(""),
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    checar_acesso_condominio(usuario, condominio_id)

    if arquivo.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo de arquivo não permitido: {arquivo.content_type}",
        )

    conteudo = await arquivo.read()
    if len(conteudo) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máximo 20 MB)")

    pasta = os.path.join(_UPLOAD_DIR, str(condominio_id))
    os.makedirs(pasta, exist_ok=True)

    ext      = os.path.splitext(arquivo.filename or "")[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    caminho  = os.path.join(pasta, filename)

    with open(caminho, "wb") as f:
        f.write(conteudo)

    doc = Documento(
        nome=nome,
        descricao=descricao or None,
        filename=filename,
        nome_original=arquivo.filename or filename,
        mime_type=arquivo.content_type,
        tamanho_bytes=len(conteudo),
        condominio_id=condominio_id,
        usuario_id=getattr(usuario, "id", None),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/documentos/{doc_id}/download")
def download_documento(
    doc_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_logado),
):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    checar_acesso_condominio(usuario, doc.condominio_id)

    caminho = os.path.join(_UPLOAD_DIR, str(doc.condominio_id), doc.filename)
    if not os.path.exists(caminho):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")

    return FileResponse(
        path=caminho,
        media_type=doc.mime_type or "application/octet-stream",
        filename=doc.nome_original,
    )


@router.delete("/documentos/{doc_id}", status_code=204)
def deletar_documento(
    doc_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(somente_gestor),
):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    checar_acesso_condominio(usuario, doc.condominio_id)

    caminho = os.path.join(_UPLOAD_DIR, str(doc.condominio_id), doc.filename)
    if os.path.exists(caminho):
        os.remove(caminho)

    db.delete(doc)
    db.commit()
