"""Testes para logout seguro e token blacklist."""
import uuid
import pytest


def _novo_sindico(client, suffix=""):
    tag = suffix or uuid.uuid4().hex[:8]
    r = client.post("/registro", json={
        "nome": f"Síndico {tag}",
        "email": f"logout_{tag}@test.com",
        "senha": "senha1234",
        "nome_condominio": f"Condo {tag}",
        "quantidade_unidades": 5,
    })
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def test_logout_invalida_token(client):
    """Após logout, o token deve ser rejeitado com 401."""
    token = _novo_sindico(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Antes do logout: funciona
    assert client.get("/usuarios/me", headers=headers).status_code == 200

    # Logout
    r = client.post("/auth/logout", headers=headers)
    assert r.status_code == 200
    assert "sucesso" in r.json()["message"].lower()

    # Após logout: token revogado
    assert client.get("/usuarios/me", headers=headers).status_code == 401


def test_logout_sem_token_401(client):
    r = client.post("/auth/logout")
    assert r.status_code == 401


def test_logout_token_invalido_401(client):
    r = client.post("/auth/logout", headers={"Authorization": "Bearer token.falso.aqui"})
    assert r.status_code == 401


def test_jti_presente_no_token(client):
    """O token deve conter campo jti."""
    from jose import jwt
    from app.auth import SECRET_KEY, ALGORITHM
    token = _novo_sindico(client)
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert "jti" in payload
    assert len(payload["jti"]) == 36  # UUID format


def test_dois_tokens_sao_independentes(client):
    """Revogar um token não afeta outro token do mesmo usuário."""
    tag = uuid.uuid4().hex[:8]
    email = f"multi_{tag}@test.com"
    client.post("/registro", json={
        "nome": "Multi Token",
        "email": email,
        "senha": "senha1234",
        "nome_condominio": f"Condo multi {tag}",
        "quantidade_unidades": 5,
    })
    r1 = client.post("/login", json={"email": email, "senha": "senha1234"})
    r2 = client.post("/login", json={"email": email, "senha": "senha1234"})
    token1 = r1.json()["access_token"]
    token2 = r2.json()["access_token"]

    # Revoga token1
    client.post("/auth/logout", headers={"Authorization": f"Bearer {token1}"})

    assert client.get("/usuarios/me", headers={"Authorization": f"Bearer {token1}"}).status_code == 401
    assert client.get("/usuarios/me", headers={"Authorization": f"Bearer {token2}"}).status_code == 200
