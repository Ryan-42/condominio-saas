import pytest


@pytest.fixture
def taxa_setup(client, auth_headers, admin_user):
    _, cond = admin_user
    client.post(f"/taxa/{cond.id}", json={"valor": 350.00}, headers=auth_headers)
    return cond.id


def test_configurar_taxa(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(f"/taxa/{cond.id}", json={"valor": 500.00}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["valor"] == 500.00


def test_get_taxa(client, auth_headers, taxa_setup):
    resp = client.get(f"/taxa/{taxa_setup}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["valor"] > 0


def test_gerar_pagamentos(client, auth_headers, taxa_setup, admin_user):
    _, cond = admin_user
    # Cria um morador para ter cobranças a gerar
    morador_resp = client.post("/moradores", json={
        "nome": "Morador Pag",
        "email": "pag@teste.com",
        "telefone": "11999990000",
        "apartamento": "101",
        "condominio_id": cond.id,
    }, headers=auth_headers)
    assert morador_resp.status_code in (200, 201)

    resp = client.post(f"/pagamentos/gerar/{cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "criados" in data
    assert data["criados"] >= 0


def test_listar_pagamentos(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/pagamentos/{cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_inadimplentes(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/inadimplentes/{cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_pagamento_acesso_negado(client, sindico_token, admin_user):
    _, cond = admin_user
    # Síndico de outro condomínio não deve ver estes pagamentos
    resp = client.get(f"/pagamentos/{cond.id}", headers=sindico_token)
    assert resp.status_code == 403


def test_taxa_acesso_negado(client, sindico_token, admin_user):
    _, cond = admin_user
    resp = client.post(f"/taxa/{cond.id}", json={"valor": 999}, headers=sindico_token)
    assert resp.status_code == 403


def test_gerar_sem_taxa(client, auth_headers):
    # Cria condomínio sem taxa
    cond_resp = client.post("/condominios", json={"nome": "Condo Sem Taxa", "quantidade_unidades": 5}, headers=auth_headers)
    cond_id = cond_resp.json()["id"]
    resp = client.post(f"/pagamentos/gerar/{cond_id}", headers=auth_headers)
    assert resp.status_code == 400
