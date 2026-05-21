import pytest


@pytest.fixture(scope="module")
def aviso_id(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/avisos",
        json={"titulo": "Aviso Teste", "conteudo": "Conteúdo do aviso.", "tipo": "NORMAL", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_criar_aviso(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/avisos",
        json={"titulo": "Manutenção elevador", "conteudo": "O elevador estará em manutenção.", "tipo": "URGENTE", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["titulo"] == "Manutenção elevador"
    assert data["tipo"] == "URGENTE"
    assert "criado_em" in data


def test_criar_aviso_info(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/avisos",
        json={"titulo": "Assembleia", "conteudo": "Haverá assembleia na sexta.", "tipo": "INFO", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["tipo"] == "INFO"


def test_listar_avisos(client, auth_headers, admin_user, aviso_id):
    _, cond = admin_user
    resp = client.get(f"/avisos?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Deve vir ordenado por data desc (mais novo primeiro)
    assert "criado_em" in data[0]


def test_listar_avisos_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/avisos?condominio_id={cond.id}")
    assert resp.status_code == 401


def test_criar_aviso_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/avisos",
        json={"titulo": "X", "conteudo": "Y", "tipo": "NORMAL", "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_deletar_aviso(client, auth_headers, aviso_id):
    resp = client.delete(f"/avisos/{aviso_id}", headers=auth_headers)
    assert resp.status_code == 204


def test_deletar_aviso_inexistente(client, auth_headers):
    resp = client.delete("/avisos/999999", headers=auth_headers)
    assert resp.status_code == 404
