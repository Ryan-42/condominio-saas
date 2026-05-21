import io
import pytest


def _pdf(content=b"PDF content"):
    return ("test.pdf", io.BytesIO(content), "application/pdf")


@pytest.fixture(scope="module")
def documento_id(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/documentos",
        data={"condominio_id": str(cond.id), "nome": "Regulamento Interno"},
        files={"arquivo": _pdf(b"%PDF-1.4 regulamento fake content")},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_upload_documento(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/documentos",
        data={"condominio_id": str(cond.id), "nome": "Ata 2024", "descricao": "Assembleia geral"},
        files={"arquivo": _pdf(b"%PDF-1.4 ata content")},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nome"] == "Ata 2024"
    assert data["descricao"] == "Assembleia geral"
    assert data["tamanho_bytes"] > 0
    assert data["mime_type"] == "application/pdf"
    assert "criado_em" in data


def test_upload_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/documentos",
        data={"condominio_id": str(cond.id), "nome": "X"},
        files={"arquivo": _pdf()},
    )
    assert resp.status_code == 401


def test_upload_tipo_invalido(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/documentos",
        data={"condominio_id": str(cond.id), "nome": "Executável"},
        files={"arquivo": ("hack.exe", io.BytesIO(b"MZ binary"), "application/x-msdownload")},
        headers=auth_headers,
    )
    assert resp.status_code == 415


def test_upload_morador_bloqueado(client, morador_ativo, admin_user):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        "/documentos",
        data={"condominio_id": str(cond.id), "nome": "Morador Upload"},
        files={"arquivo": _pdf()},
        headers=morador_headers,
    )
    assert resp.status_code == 403


def test_listar_documentos_sindico(client, auth_headers, admin_user, documento_id):
    _, cond = admin_user
    resp = client.get(f"/documentos?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(d["id"] == documento_id for d in data)
    assert "nome_original" in data[0]


def test_listar_documentos_morador(client, morador_ativo, documento_id):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/documentos?condominio_id={cond.id}", headers=morador_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_documentos_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/documentos?condominio_id={cond.id}")
    assert resp.status_code == 401


def test_download_documento(client, auth_headers, documento_id):
    resp = client.get(f"/documentos/{documento_id}/download", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.content) > 0


def test_download_documento_morador(client, morador_ativo, documento_id):
    _, _, morador_headers = morador_ativo
    resp = client.get(f"/documentos/{documento_id}/download", headers=morador_headers)
    assert resp.status_code == 200


def test_download_documento_sem_auth(client, documento_id):
    resp = client.get(f"/documentos/{documento_id}/download")
    assert resp.status_code == 401


def test_download_documento_inexistente(client, auth_headers):
    resp = client.get("/documentos/999999/download", headers=auth_headers)
    assert resp.status_code == 404


def test_deletar_documento(client, auth_headers, admin_user):
    _, cond = admin_user
    r = client.post(
        "/documentos",
        data={"condominio_id": str(cond.id), "nome": "Para Deletar"},
        files={"arquivo": _pdf()},
        headers=auth_headers,
    )
    assert r.status_code == 201
    did = r.json()["id"]
    del_resp = client.delete(f"/documentos/{did}", headers=auth_headers)
    assert del_resp.status_code == 204


def test_deletar_documento_sem_auth(client, documento_id):
    resp = client.delete(f"/documentos/{documento_id}")
    assert resp.status_code == 401


def test_deletar_documento_inexistente(client, auth_headers):
    resp = client.delete("/documentos/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_upload_imagem_png(client, auth_headers, admin_user):
    _, cond = admin_user
    png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    resp = client.post(
        "/documentos",
        data={"condominio_id": str(cond.id), "nome": "Foto da área comum"},
        files={"arquivo": ("foto.png", io.BytesIO(png_header), "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["mime_type"] == "image/png"
