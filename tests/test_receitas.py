import pytest


@pytest.fixture(scope="module")
def receita_id(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/receitas",
        json={"descricao": "Taxa condominial Jan", "valor": 800.0, "data": "2024-01-05", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()["id"]


def test_criar_receita(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/receitas",
        json={"descricao": "Taxa condominial Fev", "valor": 800.0, "data": "2024-02-05", "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["descricao"] == "Taxa condominial Fev"
    assert data["valor"] == 800.0


def test_listar_receitas(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/receitas?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_receitas_paginacao(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/receitas?condominio_id={cond.id}&skip=0&limit=1", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) <= 1


def test_deletar_receita(client, auth_headers, receita_id):
    resp = client.delete(f"/receitas/{receita_id}", headers=auth_headers)
    assert resp.status_code == 204


def test_criar_receita_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/receitas",
        json={"descricao": "X", "valor": 10.0, "data": "2024-01-01", "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_buscar_receita_inexistente(client, auth_headers):
    resp = client.get("/receitas/999999", headers=auth_headers)
    assert resp.status_code == 404
