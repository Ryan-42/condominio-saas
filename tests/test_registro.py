import pytest


def test_registro_sucesso(client):
    resp = client.post("/registro", json={
        "nome": "Novo Sindico",
        "email": "novosindico_reg@teste.com",
        "senha": "senha123",
        "nome_condominio": "Condomínio Novo",
        "quantidade_unidades": 20,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["usuario"]["tipo"] == "SINDICO"
    assert data["usuario"]["email"] == "novosindico_reg@teste.com"
    assert data["usuario"]["condominio_id"] is not None


def test_registro_email_duplicado(client):
    payload = {
        "nome": "Sindico Dup",
        "email": "dup_reg@teste.com",
        "senha": "senha123",
        "nome_condominio": "Condo Dup",
        "quantidade_unidades": 5,
    }
    client.post("/registro", json=payload)
    resp = client.post("/registro", json=payload)
    assert resp.status_code == 400
    assert "cadastrado" in resp.json()["detail"]


def test_registro_senha_curta(client):
    resp = client.post("/registro", json={
        "nome": "Sindico Fraco",
        "email": "fraco@teste.com",
        "senha": "123",
        "nome_condominio": "Condo Fraco",
        "quantidade_unidades": 5,
    })
    assert resp.status_code == 400
    assert "senha" in resp.json()["detail"].lower()


def test_registro_unidades_invalidas(client):
    resp = client.post("/registro", json={
        "nome": "Sindico Zero",
        "email": "zero@teste.com",
        "senha": "senha123",
        "nome_condominio": "Condo Zero",
        "quantidade_unidades": 0,
    })
    assert resp.status_code == 400


def test_registro_token_funciona(client):
    resp = client.post("/registro", json={
        "nome": "Sindico Token",
        "email": "sindico_token_test@teste.com",
        "senha": "senha123",
        "nome_condominio": "Condo Token",
        "quantidade_unidades": 10,
    })
    assert resp.status_code == 201
    token = resp.json()["access_token"]

    # Token recebido deve funcionar para acessar /usuarios/me
    me = client.get("/usuarios/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "sindico_token_test@teste.com"
