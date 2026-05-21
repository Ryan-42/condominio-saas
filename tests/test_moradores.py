import pytest


@pytest.fixture(scope="module")
def morador_id(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/moradores",
        json={"nome": "João Silva", "email": "joao@teste.com", "telefone": "11999990000", "apartamento": "101", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()["id"]


def test_criar_morador(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/moradores",
        json={"nome": "Maria Santos", "email": "maria@teste.com", "telefone": "11988880000", "apartamento": "202", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nome"] == "Maria Santos"
    assert data["apartamento"] == "202"


def test_listar_moradores(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/moradores?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_listar_moradores_paginacao(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/moradores?condominio_id={cond.id}&skip=0&limit=1", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) <= 1


def test_deletar_morador(client, auth_headers, morador_id):
    resp = client.delete(f"/moradores/{morador_id}", headers=auth_headers)
    assert resp.status_code == 204


def test_criar_morador_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/moradores",
        json={"nome": "X", "email": "x@x.com", "telefone": "11900000000", "apartamento": "1", "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_buscar_morador_inexistente(client, auth_headers):
    resp = client.get("/moradores/999999", headers=auth_headers)
    assert resp.status_code == 404
