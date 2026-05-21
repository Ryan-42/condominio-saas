import pytest


def test_listar_condominios(client, auth_headers):
    resp = client.get("/condominios", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(c["nome"] == "Condo Teste" for c in data)


def test_criar_condominio(client, auth_headers):
    payload = {"nome": "Condo Novo", "quantidade_unidades": 20}
    resp = client.post("/condominios", json=payload, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["nome"] == "Condo Novo"
    assert data["quantidade_unidades"] == 20
    assert "id" in data


def test_criar_condominio_sem_auth(client):
    resp = client.post("/condominios", json={"nome": "X", "quantidade_unidades": 5})
    assert resp.status_code == 401


def test_obter_condominio(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/condominios/{cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == cond.id


def test_obter_condominio_inexistente(client, auth_headers):
    resp = client.get("/condominios/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_admin_listar_condominios_com_sindico(client, auth_headers):
    resp = client.get("/admin/condominios", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Verifica campos esperados
    first = data[0]
    assert "sindico_nome" in first
    assert "sindico_email" in first


def test_deletar_condominio(client, auth_headers):
    # Cria um condomínio temporário para deletar
    resp = client.post("/condominios", json={"nome": "Condo Para Deletar", "quantidade_unidades": 5}, headers=auth_headers)
    assert resp.status_code == 201
    condo_id = resp.json()["id"]

    resp = client.delete(f"/condominios/{condo_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Confirma que foi deletado
    resp = client.get(f"/condominios/{condo_id}", headers=auth_headers)
    assert resp.status_code == 404


def test_deletar_condominio_inexistente(client, auth_headers):
    resp = client.delete("/condominios/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_deletar_condominio_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.delete(f"/condominios/{cond.id}")
    assert resp.status_code == 401


def test_sindico_nao_acessa_condominio_alheio(client, sindico_token, admin_user):
    _, cond_principal = admin_user
    resp = client.get(f"/condominios/{cond_principal.id}", headers=sindico_token)
    assert resp.status_code == 403


def test_sindico_nao_pode_criar_condominio(client, sindico_token):
    payload = {"nome": "Condo Hack", "quantidade_unidades": 10}
    resp = client.post("/condominios", json=payload, headers=sindico_token)
    assert resp.status_code == 403
