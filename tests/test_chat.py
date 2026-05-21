import pytest


@pytest.fixture(scope="module")
def primeira_msg_id(client, morador_ativo):
    morador_id, cond, morador_headers = morador_ativo
    resp = client.post(
        "/chat/mensagens",
        json={"conteudo": "Olá síndico, tenho uma dúvida.", "condominio_id": cond.id, "morador_id": morador_id},
        headers=morador_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Envio de mensagens ─────────────────────────────────────────

def test_morador_envia_mensagem(client, morador_ativo):
    morador_id, cond, morador_headers = morador_ativo
    resp = client.post(
        "/chat/mensagens",
        json={"conteudo": "Segunda mensagem.", "condominio_id": cond.id, "morador_id": morador_id},
        headers=morador_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["autor_tipo"] == "MORADOR"
    assert data["conteudo"] == "Segunda mensagem."
    assert data["lida"] is False


def test_mensagem_vazia_rejeitada(client, morador_ativo):
    morador_id, cond, morador_headers = morador_ativo
    resp = client.post(
        "/chat/mensagens",
        json={"conteudo": "   ", "condominio_id": cond.id, "morador_id": morador_id},
        headers=morador_headers,
    )
    assert resp.status_code == 400


def test_enviar_mensagem_sem_auth(client, morador_ativo):
    morador_id, cond, _ = morador_ativo
    resp = client.post(
        "/chat/mensagens",
        json={"conteudo": "Sem token.", "condominio_id": cond.id, "morador_id": morador_id},
    )
    assert resp.status_code == 401


def test_morador_nao_envia_por_outro(client, morador_ativo, auth_headers):
    """Morador não pode enviar mensagem com morador_id de outro morador."""
    _, cond, morador_headers = morador_ativo
    # Cria outro morador
    r = client.post(
        "/moradores",
        json={"nome": "Outro Chat", "email": "outro_chat2@teste.com", "telefone": "11966660000", "apartamento": "202", "condominio_id": cond.id},
        headers=auth_headers,
    )
    outro_id = r.json()["id"]
    resp = client.post(
        "/chat/mensagens",
        json={"conteudo": "Fingindo ser outro.", "condominio_id": cond.id, "morador_id": outro_id},
        headers=morador_headers,
    )
    assert resp.status_code == 403


# ── Listagem de mensagens ─────────────────────────────────────

def test_sindico_lista_conversas(client, auth_headers, admin_user, primeira_msg_id):
    _, cond = admin_user
    resp = client.get(f"/chat/conversas?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    conv = data[0]
    assert "morador_nome" in conv
    assert "nao_lidas" in conv
    assert "ultima_msg" in conv


def test_listar_conversas_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/chat/conversas?condominio_id={cond.id}")
    assert resp.status_code == 401


def test_morador_nao_acessa_conversas_admin(client, morador_ativo):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/chat/conversas?condominio_id={cond.id}", headers=morador_headers)
    assert resp.status_code == 403


def test_sindico_le_mensagens_e_marca_como_lidas(client, auth_headers, admin_user, morador_ativo, primeira_msg_id):
    morador_id, cond, _ = morador_ativo
    resp = client.get(
        f"/chat/mensagens?condominio_id={cond.id}&morador_id={morador_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    msgs = resp.json()
    assert isinstance(msgs, list)
    assert len(msgs) >= 1
    for m in msgs:
        if m["autor_tipo"] == "MORADOR":
            assert m["lida"] is True


def test_morador_le_proprias_mensagens(client, morador_ativo, primeira_msg_id):
    morador_id, cond, morador_headers = morador_ativo
    resp = client.get(
        f"/chat/mensagens?condominio_id={cond.id}&morador_id={morador_id}",
        headers=morador_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_morador_nao_acessa_conversa_alheia(client, morador_ativo, auth_headers):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/moradores",
        json={"nome": "Terceiro", "email": "terceiro_chat@teste.com", "telefone": "11955550000", "apartamento": "303", "condominio_id": cond.id},
        headers=auth_headers,
    )
    outro_id = r.json()["id"]
    resp = client.get(
        f"/chat/mensagens?condominio_id={cond.id}&morador_id={outro_id}",
        headers=morador_headers,
    )
    assert resp.status_code == 403


# ── Resposta do síndico ───────────────────────────────────────

def test_sindico_responde_mensagem(client, auth_headers, admin_user, morador_ativo):
    morador_id, cond, _ = morador_ativo
    resp = client.post(
        "/chat/mensagens",
        json={"conteudo": "Pode falar, estou à disposição.", "condominio_id": cond.id, "morador_id": morador_id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["autor_tipo"] == "SINDICO"
    assert data["lida"] is False


def test_morador_le_resposta_marca_como_lida(client, morador_ativo):
    morador_id, cond, morador_headers = morador_ativo
    resp = client.get(
        f"/chat/mensagens?condominio_id={cond.id}&morador_id={morador_id}",
        headers=morador_headers,
    )
    assert resp.status_code == 200
    msgs = resp.json()
    for m in msgs:
        if m["autor_tipo"] == "SINDICO":
            assert m["lida"] is True


# ── Contagem de não lidas ─────────────────────────────────────

def test_nao_lidas_morador(client, morador_ativo):
    morador_id, cond, morador_headers = morador_ativo
    resp = client.get(
        f"/chat/nao-lidas?condominio_id={cond.id}&morador_id={morador_id}",
        headers=morador_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "nao_lidas" in data
    assert isinstance(data["nao_lidas"], int)


def test_nao_lidas_sindico(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/chat/nao-lidas?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert "nao_lidas" in resp.json()


def test_nao_lidas_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/chat/nao-lidas?condominio_id={cond.id}")
    assert resp.status_code == 401
