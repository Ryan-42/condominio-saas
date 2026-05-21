import pytest


@pytest.fixture(scope="module")
def reclamacao_id(client, morador_ativo):
    morador_id, cond, morador_headers = morador_ativo
    resp = client.post(
        "/reclamacoes",
        json={
            "titulo": "Barulho excessivo",
            "descricao": "Barulho no corredor após as 22h",
            "prioridade": "MEDIA",
            "condominio_id": cond.id,
        },
        headers=morador_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_criar_reclamacao(client, morador_ativo):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        "/reclamacoes",
        json={
            "titulo": "Vazamento no corredor",
            "descricao": "Água saindo pelo piso do corredor",
            "prioridade": "ALTA",
            "condominio_id": cond.id,
        },
        headers=morador_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["titulo"] == "Vazamento no corredor"
    assert data["status"] == "ABERTA"
    assert data["prioridade"] == "ALTA"
    assert "criado_em" in data


def test_criar_reclamacao_sem_auth(client, morador_ativo):
    _, cond, _ = morador_ativo
    resp = client.post(
        "/reclamacoes",
        json={"titulo": "X", "descricao": "Y", "prioridade": "BAIXA", "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_listar_reclamacoes_sindico(client, auth_headers, admin_user, reclamacao_id):
    _, cond = admin_user
    resp = client.get(f"/reclamacoes?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(r["id"] == reclamacao_id for r in data)
    assert "morador_nome" in data[0]


def test_listar_reclamacoes_morador(client, morador_ativo, reclamacao_id):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/reclamacoes?condominio_id={cond.id}", headers=morador_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_reclamacoes_sem_auth(client, morador_ativo):
    _, cond, _ = morador_ativo
    resp = client.get(f"/reclamacoes?condominio_id={cond.id}")
    assert resp.status_code == 401


def test_responder_reclamacao(client, auth_headers, reclamacao_id):
    resp = client.put(
        f"/reclamacoes/{reclamacao_id}",
        json={"resposta": "Providências tomadas.", "status": "RESOLVIDA"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["resposta"] == "Providências tomadas."
    assert data["status"] == "RESOLVIDA"
    assert data["respondido_em"] is not None


def test_alterar_status_para_em_analise(client, auth_headers, morador_ativo):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/reclamacoes",
        json={"titulo": "Status Teste", "descricao": "desc", "prioridade": "BAIXA", "condominio_id": cond.id},
        headers=morador_headers,
    )
    rid = r.json()["id"]
    resp = client.put(
        f"/reclamacoes/{rid}",
        json={"status": "EM_ANALISE"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "EM_ANALISE"


def test_responder_reclamacao_inexistente(client, auth_headers):
    resp = client.put(
        "/reclamacoes/999999",
        json={"status": "RESOLVIDA"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_morador_cancela_reclamacao_aberta(client, morador_ativo):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/reclamacoes",
        json={"titulo": "Para Cancelar", "descricao": "desc", "prioridade": "BAIXA", "condominio_id": cond.id},
        headers=morador_headers,
    )
    assert r.status_code == 201
    rid = r.json()["id"]
    resp = client.delete(f"/reclamacoes/{rid}", headers=morador_headers)
    assert resp.status_code == 204


def test_morador_nao_cancela_reclamacao_resolvida(client, morador_ativo, auth_headers):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/reclamacoes",
        json={"titulo": "Resolvida", "descricao": "desc", "prioridade": "BAIXA", "condominio_id": cond.id},
        headers=morador_headers,
    )
    rid = r.json()["id"]
    client.put(f"/reclamacoes/{rid}", json={"status": "RESOLVIDA"}, headers=auth_headers)
    resp = client.delete(f"/reclamacoes/{rid}", headers=morador_headers)
    assert resp.status_code == 400


def test_deletar_reclamacao_inexistente(client, auth_headers):
    resp = client.delete("/reclamacoes/999999", headers=auth_headers)
    assert resp.status_code == 404
