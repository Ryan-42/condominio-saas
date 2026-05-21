import pytest


# ── Fixtures ───────────────────────────────────────────────────

@pytest.fixture(scope="module")
def morador_com_convite(client, auth_headers, admin_user):
    """Cria um morador e gera convite, retorna (morador_id, token)."""
    _, cond = admin_user
    resp = client.post(
        "/moradores",
        json={
            "nome": "Portal Teste",
            "email": "portal@teste.com",
            "telefone": "11900000001",
            "apartamento": "303",
            "condominio_id": cond.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    morador_id = resp.json()["id"]

    resp2 = client.post(f"/moradores/{morador_id}/convidar", headers=auth_headers)
    assert resp2.status_code == 200
    data = resp2.json()
    assert "onboarding_url" in data
    token = data["onboarding_url"].split("token=")[1]
    return morador_id, token


# ── Convite ────────────────────────────────────────────────────

def test_convidar_morador_retorna_url(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/moradores",
        json={
            "nome": "Convite Direto",
            "email": "convite_direto@teste.com",
            "telefone": "11900000002",
            "apartamento": "404",
            "condominio_id": cond.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    mid = resp.json()["id"]

    resp2 = client.post(f"/moradores/{mid}/convidar", headers=auth_headers)
    assert resp2.status_code == 200
    body = resp2.json()
    assert "onboarding_url" in body
    assert "token=" in body["onboarding_url"]
    assert "mensagem" in body


def test_convidar_morador_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/moradores",
        json={
            "nome": "Sem Auth",
            "email": "sem_auth_convite@teste.com",
            "telefone": "11900000003",
            "apartamento": "505",
            "condominio_id": cond.id,
        },
    )
    # sem auth não pode criar, mas testa convite sem token
    resp2 = client.post("/moradores/999/convidar")
    assert resp2.status_code == 401


def test_convidar_morador_inexistente(client, auth_headers):
    resp = client.post("/moradores/999999/convidar", headers=auth_headers)
    assert resp.status_code == 404


# ── Ativação ───────────────────────────────────────────────────

def test_ativar_token_invalido(client):
    resp = client.post(
        "/moradores/ativar",
        json={"token": "token-invalido-xyz", "senha": "senha1234", "lgpd_aceite": True},
    )
    assert resp.status_code == 404


def test_ativar_sem_lgpd(client, morador_com_convite):
    # lgpd_aceite=False é validado ANTES de consultar o token — não consome o token
    _, token = morador_com_convite
    resp = client.post(
        "/moradores/ativar",
        json={"token": token, "senha": "senha1234", "lgpd_aceite": False},
    )
    assert resp.status_code == 400


def test_ativar_senha_curta(client, morador_com_convite):
    # senha curta é validada ANTES de consultar o token — não consome o token
    _, token = morador_com_convite
    resp = client.post(
        "/moradores/ativar",
        json={"token": token, "senha": "curta", "lgpd_aceite": True},
    )
    assert resp.status_code == 400


def test_ativar_conta_sucesso(client, morador_com_convite):
    _, token = morador_com_convite
    resp = client.post(
        "/moradores/ativar",
        json={"token": token, "senha": "senha1234", "lgpd_aceite": True},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Conta ativada com sucesso."


# ── Login como Morador ─────────────────────────────────────────

def test_login_morador_ativado(client, morador_com_convite):
    resp = client.post(
        "/login",
        json={"email": "portal@teste.com", "senha": "senha1234"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["access_token"]
    assert data["usuario"]["tipo"] == "MORADOR"
    assert data["usuario"]["apartamento"] == "303"
    assert data["usuario"]["morador_id"] is not None


def test_login_morador_senha_errada(client, morador_com_convite):
    resp = client.post(
        "/login",
        json={"email": "portal@teste.com", "senha": "senhaerrada"},
    )
    assert resp.status_code == 401


def test_login_morador_sem_conta_ativada(client, auth_headers, admin_user):
    _, cond = admin_user
    client.post(
        "/moradores",
        json={
            "nome": "Sem Senha",
            "email": "sem_senha@teste.com",
            "telefone": "11900000009",
            "apartamento": "606",
            "condominio_id": cond.id,
        },
        headers=auth_headers,
    )
    resp = client.post(
        "/login",
        json={"email": "sem_senha@teste.com", "senha": "qualquercoisa"},
    )
    assert resp.status_code == 401
