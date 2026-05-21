import pytest
from app.auth import _login_attempts


def test_health_check(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "online"


def test_login_sucesso(client, admin_user):
    resp = client.post("/login", json={"email": "admin@teste.com", "senha": "senha123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["usuario"]["email"] == "admin@teste.com"
    assert data["usuario"]["tipo"] == "ADMIN"


def test_login_senha_errada(client, admin_user):
    resp = client.post("/login", json={"email": "admin@teste.com", "senha": "errada"})
    assert resp.status_code == 401
    assert "incorretos" in resp.json()["detail"]


def test_login_email_inexistente(client):
    resp = client.post("/login", json={"email": "naoexiste@teste.com", "senha": "qualquer"})
    assert resp.status_code == 401


def test_me_autenticado(client, auth_headers):
    resp = client.get("/usuarios/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@teste.com"


def test_me_sem_token(client):
    resp = client.get("/usuarios/me")
    assert resp.status_code == 401


def test_me_token_invalido(client):
    resp = client.get("/usuarios/me", headers={"Authorization": "Bearer token.invalido.aqui"})
    assert resp.status_code == 401


def test_rate_limit_login(client):
    # Clear any previous attempts for test IP
    _login_attempts.pop("testclient", None)

    for _ in range(5):
        client.post("/login", json={"email": "x@x.com", "senha": "errada"})

    resp = client.post("/login", json={"email": "x@x.com", "senha": "errada"})
    assert resp.status_code == 429
    assert "Muitas tentativas" in resp.json()["detail"]
