"""
Abstração de storage de arquivos.

Backends disponíveis:
  LocalStorage  — disco local (dev / Railway ephemeral)
  S3Storage     — S3-compatible: Cloudflare R2, AWS S3, MinIO

Seleção automática:
  Se S3_ENDPOINT_URL + S3_ACCESS_KEY_ID estiverem definidos → S3Storage
  Caso contrário → LocalStorage

Variáveis de ambiente para S3/R2:
  S3_ENDPOINT_URL     https://<account_id>.r2.cloudflarestorage.com
  S3_ACCESS_KEY_ID    chave de acesso R2/S3
  S3_SECRET_ACCESS_KEY  chave secreta
  S3_BUCKET_NAME      nome do bucket (default: condosys-docs)
  S3_REGION           região (default: auto — funciona para R2)
  S3_PUBLIC_URL       (opcional) URL pública/CDN para downloads diretos
"""

import abc
import logging
import os
import uuid
from typing import Optional

logger = logging.getLogger(__name__)


class StorageBackend(abc.ABC):
    @abc.abstractmethod
    async def save(self, data: bytes, prefix: str, ext: str) -> str:
        """Salva os bytes e retorna a storage key (ex: '42/uuid.pdf')."""

    @abc.abstractmethod
    def delete(self, key: str) -> None:
        """Remove o arquivo pelo storage key."""

    @abc.abstractmethod
    def get_url(self, key: str) -> Optional[str]:
        """Retorna URL para download direto, ou None se servido pelo backend."""

    @abc.abstractmethod
    def read(self, key: str) -> Optional[bytes]:
        """Lê e retorna o conteúdo do arquivo, ou None se não existir."""


# ── Local Storage ─────────────────────────────────────────────────────────────

class LocalStorage(StorageBackend):
    def __init__(self, base_dir: str):
        self._base = base_dir

    async def save(self, data: bytes, prefix: str, ext: str) -> str:
        folder = os.path.join(self._base, prefix)
        os.makedirs(folder, exist_ok=True)
        name = f"{uuid.uuid4().hex}{ext}"
        with open(os.path.join(folder, name), "wb") as f:
            f.write(data)
        return f"{prefix}/{name}"

    def delete(self, key: str) -> None:
        path = os.path.join(self._base, key)
        if os.path.exists(path):
            os.remove(path)

    def get_url(self, key: str) -> Optional[str]:
        return None  # servido via endpoint /documentos/{id}/download

    def read(self, key: str) -> Optional[bytes]:
        path = os.path.join(self._base, key)
        if not os.path.exists(path):
            return None
        with open(path, "rb") as f:
            return f.read()


# ── S3-compatible Storage (Cloudflare R2 / AWS S3) ────────────────────────────

class S3Storage(StorageBackend):
    def __init__(self):
        import boto3
        from botocore.config import Config

        self._bucket = os.getenv("S3_BUCKET_NAME", "condosys-docs")
        self._public_url = os.getenv("S3_PUBLIC_URL", "").rstrip("/")

        self._client = boto3.client(
            "s3",
            endpoint_url=os.getenv("S3_ENDPOINT_URL"),
            aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
            region_name=os.getenv("S3_REGION", "auto"),
            config=Config(signature_version="s3v4"),
        )
        logger.info("S3Storage inicializado bucket=%s", self._bucket)

    async def save(self, data: bytes, prefix: str, ext: str) -> str:
        key = f"{prefix}/{uuid.uuid4().hex}{ext}"
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentLength=len(data),
        )
        logger.info("s3 upload key=%s size=%d", key, len(data))
        return key

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)
        logger.info("s3 delete key=%s", key)

    def get_url(self, key: str) -> Optional[str]:
        if self._public_url:
            return f"{self._public_url}/{key}"
        # URL pré-assinada com 1h de validade
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=3600,
        )

    def read(self, key: str) -> Optional[bytes]:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
            return resp["Body"].read()
        except Exception:
            return None


# ── Factory ───────────────────────────────────────────────────────────────────

def _create_storage() -> StorageBackend:
    if os.getenv("S3_ENDPOINT_URL") and os.getenv("S3_ACCESS_KEY_ID"):
        try:
            return S3Storage()
        except Exception as e:
            logger.error("Falha ao inicializar S3Storage, usando LocalStorage: %s", e)

    base = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "uploads",
    )
    logger.info("LocalStorage ativo base=%s", base)
    return LocalStorage(base)


# Singleton — uma instância por processo
storage: StorageBackend = _create_storage()
