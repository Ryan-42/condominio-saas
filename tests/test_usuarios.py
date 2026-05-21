import pytest


def test_listar_usuarios_admin(client, auth_headers):
    resp = client.get("/usuarios", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


def test_listar_usuarios_sem_admin(client, sindico_token):
    resp = client.get("/usuarios", headers=sindico_token)
    assert resp.status_code == 403


def test_criar_usuario(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post("/usuarios", json={
        "nome": "Novo Sindico",
        "email": "novosindico@teste.com",
        "senha": "senha123",
        "tipo": "SINDICO",
        "condominio_id": cond.id,
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "novosindico@teste.com"
    assert data["tipo"] == "SINDICO"


def test_criar_usuario_email_duplicado(client, auth_headers, admin_user):
    _, cond = admin_user
    client.post("/usuarios", json={
        "nome": "Dup User",
        "email": "dup@teste.com",
        "senha": "senha123",
        "tipo": "SINDICO",
        "condominio_id": cond.id,
    }, headers=auth_headers)
    resp = client.post("/usuarios", json={
        "nome": "Dup User 2",
        "email": "dup@teste.com",
        "senha": "senha123",
        "tipo": "SINDICO",
        "condominio_id": cond.id,
    }, headers=auth_headers)
    assert resp.status_code == 400
    assert "cadastrado" in resp.json()["detail"]


def test_alterar_senha_sucesso(client, sindico_token):
    resp = client.put("/usuarios/me/senha", json={
        "senha_atual": "senha123",
        "nova_senha": "novasenha456",
    }, headers=sindico_token)
    assert resp.status_code == 200
    assert "sucesso" in resp.json()["message"]

    # Restaura a senha para não quebrar outros testes
    resp2 = client.put("/usuarios/me/senha", json={
        "senha_atual": "novasenha456",
        "nova_senha": "senha123",
    }, headers=sindico_token)
    assert resp2.status_code == 200


def test_alterar_senha_atual_errada(client, sindico_token):
    resp = client.put("/usuarios/me/senha", json={
        "senha_atual": "senhaerrada",
        "nova_senha": "novasenha456",
    }, headers=sindico_token)
    assert resp.status_code == 400
    assert "incorreta" in resp.json()["detail"]


def test_alterar_senha_muito_curta(client, sindico_token):
    resp = client.put("/usuarios/me/senha", json={
        "senha_atual": "senha123",
        "nova_senha": "abc",
    }, headers=sindico_token)
    assert resp.status_code == 400


def test_esqueci_senha(client):
    # Sempre retorna 200 (user enumeration prevention)
    resp = client.post("/usuarios/esqueci-senha", json={"email": "naoexiste@teste.com"})
    assert resp.status_code == 200
    assert "message" in resp.json()
