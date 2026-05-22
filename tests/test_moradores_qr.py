"""Testes de integração para o fluxo de auto-registro via QR code."""
import pytest


# ── Fixtures ──────────────────────────────────────────────────


@pytest.fixture(scope="module")
def qr_token(client, sindico_token, sindico_user):
    """Gera um token de registro QR para o condo do síndico."""
    _, cond = sindico_user
    resp = client.get(f"/condominios/{cond.id}/qr-registro", headers=sindico_token)
    assert resp.status_code == 200
    url = resp.json()["registro_url"]
    return url.split("condo_token=")[1]


# ── GET /condominios/{id}/qr-registro ─────────────────────────


def test_qr_registro_sindico_ok(client, sindico_token, sindico_user):
    _, cond = sindico_user
    resp = client.get(f"/condominios/{cond.id}/qr-registro", headers=sindico_token)
    assert resp.status_code == 200
    data = resp.json()
    assert "registro_url" in data
    assert "condo_token=" in data["registro_url"]
    assert data["condo_nome"] == cond.nome


def test_qr_registro_admin_ok(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/condominios/{cond.id}/qr-registro", headers=auth_headers)
    assert resp.status_code == 200
    assert "registro_url" in resp.json()


def test_qr_registro_sem_auth(client, sindico_user):
    _, cond = sindico_user
    resp = client.get(f"/condominios/{cond.id}/qr-registro")
    assert resp.status_code == 401


def test_qr_registro_morador_bloqueado(client, morador_ativo):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/condominios/{cond.id}/qr-registro", headers=morador_headers)
    assert resp.status_code == 403


def test_qr_registro_condo_inexistente(client, auth_headers):
    resp = client.get("/condominios/999999/qr-registro", headers=auth_headers)
    assert resp.status_code == 404


def test_qr_registro_sindico_outro_condo(client, sindico_token, admin_user):
    # Síndico não pode gerar QR para condo que não é o dele
    _, cond = admin_user
    resp = client.get(f"/condominios/{cond.id}/qr-registro", headers=sindico_token)
    assert resp.status_code == 403


# ── POST /moradores/auto-registrar ────────────────────────────


def test_auto_registrar_sucesso(client, qr_token):
    resp = client.post("/moradores/auto-registrar", json={
        "condo_token": qr_token,
        "nome": "Morador QR Teste",
        "email": "morador_qr_1@teste.com",
        "telefone": "11966661111",
        "apartamento": "201",
        "senha": "senha12345",
        "lgpd_aceite": True,
    })
    assert resp.status_code == 200
    assert "Bem-vindo" in resp.json()["mensagem"]


def test_auto_registrar_login_funciona(client, qr_token):
    email = "morador_qr_login@teste.com"
    senha = "senha_login_99"

    resp = client.post("/moradores/auto-registrar", json={
        "condo_token": qr_token,
        "nome": "Morador Login QR",
        "email": email,
        "telefone": "11966662222",
        "apartamento": "202",
        "senha": senha,
        "lgpd_aceite": True,
    })
    assert resp.status_code == 200

    # Deve conseguir fazer login imediatamente
    login = client.post("/login", json={"email": email, "senha": senha})
    assert login.status_code == 200
    assert "access_token" in login.json()
    assert login.json()["usuario"]["tipo"] == "MORADOR"


def test_auto_registrar_email_duplicado(client, qr_token):
    # Primeiro registro
    client.post("/moradores/auto-registrar", json={
        "condo_token": qr_token,
        "nome": "Morador Dup A",
        "email": "morador_dup@teste.com",
        "telefone": "11966663333",
        "apartamento": "203",
        "senha": "senha12345",
        "lgpd_aceite": True,
    })
    # Segundo com mesmo email
    resp = client.post("/moradores/auto-registrar", json={
        "condo_token": qr_token,
        "nome": "Morador Dup B",
        "email": "morador_dup@teste.com",
        "telefone": "11966663334",
        "apartamento": "204",
        "senha": "senha12345",
        "lgpd_aceite": True,
    })
    assert resp.status_code == 400
    assert "já cadastrado" in resp.json()["detail"].lower()


def test_auto_registrar_token_invalido(client):
    resp = client.post("/moradores/auto-registrar", json={
        "condo_token": "token-invalido-xyz-123",
        "nome": "Inválido",
        "email": "invalido_token@teste.com",
        "telefone": "11900000000",
        "apartamento": "999",
        "senha": "senha12345",
        "lgpd_aceite": True,
    })
    assert resp.status_code == 400
    assert "inválido" in resp.json()["detail"].lower()


def test_auto_registrar_sem_lgpd(client, qr_token):
    resp = client.post("/moradores/auto-registrar", json={
        "condo_token": qr_token,
        "nome": "Sem LGPD",
        "email": "semlgpd_qr@teste.com",
        "telefone": "11900000001",
        "apartamento": "300",
        "senha": "senha12345",
        "lgpd_aceite": False,
    })
    assert resp.status_code == 400


def test_auto_registrar_senha_curta(client, qr_token):
    resp = client.post("/moradores/auto-registrar", json={
        "condo_token": qr_token,
        "nome": "Senha Curta",
        "email": "senhacurta_qr@teste.com",
        "telefone": "11900000002",
        "apartamento": "301",
        "senha": "abc",
        "lgpd_aceite": True,
    })
    assert resp.status_code == 400


def test_auto_registrar_me_endpoint(client, qr_token):
    """Morador auto-registrado consegue acessar /usuarios/me."""
    email = "morador_me_test@teste.com"
    senha = "senha_me_test"

    client.post("/moradores/auto-registrar", json={
        "condo_token": qr_token,
        "nome": "Morador ME Test",
        "email": email,
        "telefone": "11955551111",
        "apartamento": "401",
        "senha": senha,
        "lgpd_aceite": True,
    })

    login = client.post("/login", json={"email": email, "senha": senha})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/usuarios/me", headers=headers)
    assert me.status_code == 200
    data = me.json()
    assert data["email"] == email
    assert data["tipo"] == "MORADOR"
    assert data["morador_id"] is not None
