import pytest


@pytest.fixture(scope="module")
def espaco_id(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/espacos",
        json={"nome": "Salão de Festas", "descricao": "Salão para eventos", "capacidade": 50, "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.fixture(scope="module")
def reserva_pendente_id(client, morador_ativo, espaco_id):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        "/reservas",
        json={"espaco_id": espaco_id, "data": "2099-08-15", "periodo": "MANHA", "condominio_id": cond.id},
        headers=morador_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Espaços ───────────────────────────────────────────────────

def test_criar_espaco(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/espacos",
        json={"nome": "Churrasqueira", "descricao": "Área gourmet", "capacidade": 20, "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nome"] == "Churrasqueira"
    assert data["ativo"] is True


def test_criar_espaco_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post("/espacos", json={"nome": "X", "condominio_id": cond.id})
    assert resp.status_code == 401


def test_listar_espacos_sindico(client, auth_headers, admin_user, espaco_id):
    _, cond = admin_user
    resp = client.get(f"/espacos?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(e["id"] == espaco_id for e in data)


def test_listar_espacos_morador(client, morador_ativo, espaco_id):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/espacos?condominio_id={cond.id}", headers=morador_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_espacos_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/espacos?condominio_id={cond.id}")
    assert resp.status_code == 401


def test_atualizar_espaco(client, auth_headers, espaco_id):
    resp = client.put(
        f"/espacos/{espaco_id}",
        json={"nome": "Salão de Festas Atualizado", "capacidade": 60, "condominio_id": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["nome"] == "Salão de Festas Atualizado"
    assert resp.json()["capacidade"] == 60


def test_atualizar_espaco_inexistente(client, auth_headers):
    resp = client.put(
        "/espacos/999999",
        json={"nome": "X", "condominio_id": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_soft_delete_espaco(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/espacos",
        json={"nome": "Para Deletar", "condominio_id": cond.id},
        headers=auth_headers,
    )
    eid = resp.json()["id"]
    del_resp = client.delete(f"/espacos/{eid}", headers=auth_headers)
    assert del_resp.status_code == 204
    lista = client.get(f"/espacos?condominio_id={cond.id}", headers=auth_headers)
    assert not any(e["id"] == eid for e in lista.json())


# ── Reservas ──────────────────────────────────────────────────

def test_criar_reserva(client, morador_ativo, espaco_id):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        "/reservas",
        json={"espaco_id": espaco_id, "data": "2099-09-10", "periodo": "TARDE", "condominio_id": cond.id},
        headers=morador_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "PENDENTE"
    assert data["periodo"] == "TARDE"
    assert "espaco_nome" in data
    assert "morador_nome" in data


def test_criar_reserva_sem_auth(client, morador_ativo, espaco_id):
    _, cond, _ = morador_ativo
    resp = client.post(
        "/reservas",
        json={"espaco_id": espaco_id, "data": "2099-09-11", "periodo": "MANHA", "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_criar_reserva_duplicada(client, morador_ativo, espaco_id):
    _, cond, morador_headers = morador_ativo
    payload = {"espaco_id": espaco_id, "data": "2099-10-20", "periodo": "NOITE", "condominio_id": cond.id}
    client.post("/reservas", json=payload, headers=morador_headers)
    resp = client.post("/reservas", json=payload, headers=morador_headers)
    assert resp.status_code == 409


def test_criar_reserva_espaco_inexistente(client, morador_ativo):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        "/reservas",
        json={"espaco_id": 999999, "data": "2099-09-12", "periodo": "MANHA", "condominio_id": cond.id},
        headers=morador_headers,
    )
    assert resp.status_code == 404


def test_listar_reservas_sindico(client, auth_headers, admin_user, reserva_pendente_id):
    _, cond = admin_user
    resp = client.get(f"/reservas?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(r["id"] == reserva_pendente_id for r in data)


def test_listar_reservas_morador_so_ve_proprias(client, morador_ativo, reserva_pendente_id):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/reservas?condominio_id={cond.id}", headers=morador_headers)
    assert resp.status_code == 200
    for r in resp.json():
        assert "morador_nome" in r


def test_aprovar_reserva(client, auth_headers, reserva_pendente_id):
    resp = client.put(
        f"/reservas/{reserva_pendente_id}",
        json={"status": "APROVADA", "resposta": "Aprovado!"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "APROVADA"
    assert data["resposta"] == "Aprovado!"
    assert data["respondido_em"] is not None


def test_rejeitar_reserva(client, auth_headers, morador_ativo, espaco_id):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/reservas",
        json={"espaco_id": espaco_id, "data": "2099-11-01", "periodo": "DIA_TODO", "condominio_id": cond.id},
        headers=morador_headers,
    )
    rid = r.json()["id"]
    resp = client.put(
        f"/reservas/{rid}",
        json={"status": "REJEITADA", "resposta": "Data indisponível."},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "REJEITADA"


def test_cancelar_reserva_pendente_morador(client, morador_ativo, espaco_id):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/reservas",
        json={"espaco_id": espaco_id, "data": "2099-11-05", "periodo": "MANHA", "condominio_id": cond.id},
        headers=morador_headers,
    )
    rid = r.json()["id"]
    del_resp = client.delete(f"/reservas/{rid}", headers=morador_headers)
    assert del_resp.status_code == 204


def test_morador_nao_cancela_reserva_aprovada(client, auth_headers, morador_ativo, espaco_id):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/reservas",
        json={"espaco_id": espaco_id, "data": "2099-11-06", "periodo": "TARDE", "condominio_id": cond.id},
        headers=morador_headers,
    )
    rid = r.json()["id"]
    client.put(f"/reservas/{rid}", json={"status": "APROVADA"}, headers=auth_headers)
    resp = client.delete(f"/reservas/{rid}", headers=morador_headers)
    assert resp.status_code == 400
