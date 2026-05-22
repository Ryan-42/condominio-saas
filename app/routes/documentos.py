import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_db, get_usuario_logado, somente_gestor, checar_acesso_condominio
from app.models.documento import Documento
from app.schemas.documento import DocumentoOut
from app.services.storage import storage

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Documentos"])

_MAX_BYTES = 20 * 1024 * 1024  # 20 MB

# Assinaturas de bytes (magic numbers) para cada tipo permitido.
# A validação é feita nos bytes reais do arquivo, não no Content-Type do cliente.
_MAGIC_RULES: list[tuple[bytes, str, int]] = [
    # (magic_bytes, mime_type, offset)
    (b"%PDF",              "application/pdf",   0),
    (b"\x89PNG\r\n\x1a\n","image/png",          0),
    (b"\xff\xd8\xff",     "image/jpeg",         0),
    (b"\xd0\xcf\x11\xe0", "application/msword", 0),  # .doc antigo
    (b"PK\x03\x04",       "application/zip",    0),  # .docx / .xlsx (ZIP internamente)
]

_ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".txt"}


def _validar_arquivo(data: bytes, filename: str) -> str:
    """
    Detecta o MIME real pelos bytes do arquivo (não pelo header HTTP).
    Retorna o mime_type se válido, lança HTTPException 415 caso contrário.
    """
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Extensão não permitida: {ext}")

    # Detecção por magic bytes
    detected: str | None = None
    for magic, mime, offset in _MAGIC_RULES:
        if data[offset: offset + len(magic)] == magic:
            detected = mime
            break

    # Texto plano: nenhuma magic, mas é decodificável como UTF-8
    if detected is None:
        try:
            data[:512].decode("utf-8")
            detected = "text/plain"
        except UnicodeDecodeError:
            pass

    if detected is None:
        raise HTTPException(status_code=415, detail="Tipo de arquivo não identificado ou não permitido.")

    # Webp: magic é RIFF...WEBP (bytes 0-3 + 8-11)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        detected = "image/webp"

    return detected


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

    conteudo = await arquivo.read()

    if len(conteudo) == 0:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(conteudo) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máximo 20 MB).")

    # Validação por magic bytes — ignora o Content-Type do cliente
    ext = os.path.splitext(arquivo.filename or "")[1].lower()
    mime_real = _validar_arquivo(conteudo, arquivo.filename or "")

    # Salva via backend de storage (local ou S3/R2)
    prefix = str(condominio_id)
    storage_key = await storage.save(conteudo, prefix=prefix, ext=ext)

    doc = Documento(
        nome=nome,
        descricao=descricao or None,
        filename=storage_key,
        nome_original=arquivo.filename or storage_key,
        mime_type=mime_real,
        tamanho_bytes=len(conteudo),
        condominio_id=condominio_id,
        usuario_id=getattr(usuario, "id", None),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    logger.info("documento salvo id=%d condo=%d size=%d mime=%s", doc.id, condominio_id, len(conteudo), mime_real)
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

    # Suporte a registros antigos (filename sem prefixo condo_id)
    key = doc.filename if "/" in doc.filename else f"{doc.condominio_id}/{doc.filename}"

    # Se o backend tem URL pública (S3/R2), redireciona
    url = storage.get_url(key)
    if url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=url)

    # LocalStorage: serve o arquivo diretamente
    data = storage.read(key)
    if data is None:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")

    from fastapi.responses import Response
    return Response(
        content=data,
        media_type=doc.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.nome_original}"'},
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

    key = doc.filename if "/" in doc.filename else f"{doc.condominio_id}/{doc.filename}"
    try:
        storage.delete(key)
    except Exception as e:
        logger.warning("erro ao deletar arquivo storage key=%s: %s", key, e)

    db.delete(doc)
    db.commit()
