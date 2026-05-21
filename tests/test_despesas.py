import pytest


@pytest.fixture(scope="module")
def despesa_id(client, auth_headers, admin_user):
    _, cond = admin_user
    payload = {
        "descricao": "Água",
        "valor": 350.00,
        "data": "2024-01-15",
        "condominio_id": cond.id,
    }
    resp = client.post("/despesas", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    return resp.json()["id"]


def test_criar_despesa(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/despesas",
        json={"descricao": "Energia", "valor": 500.0, "data": "2024-02-01", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["descricao"] == "Energia"
    assert data["valor"] == 500.0


def test_listar_despesas(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/despesas?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_despesas_paginacao(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/despesas?condominio_id={cond.id}&skip=0&limit=1", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) <= 1


def test_deletar_despesa(client, auth_headers, despesa_id):
    resp = client.delete(f"/despesas/{despesa_id}", headers=auth_headers)
    assert resp.status_code == 204


def test_criar_despesa_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/despesas",
        json={"descricao": "X", "valor": 10.0, "data": "2024-01-01", "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_buscar_despesa_inexistente(client, auth_headers):
    resp = client.get("/despesas/999999", headers=auth_headers)
    assert resp.status_code == 404
