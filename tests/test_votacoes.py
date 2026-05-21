import pytest


@pytest.fixture(scope="module")
def votacao_id(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/votacoes",
        json={
            "titulo": "Cor da fachada",
            "descricao": "Escolha a cor da pintura",
            "opcoes": ["Branco", "Bege", "Cinza"],
            "condominio_id": cond.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_criar_votacao(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/votacoes",
        json={"titulo": "Nova portaria", "opcoes": ["Sim", "Não"], "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["titulo"] == "Nova portaria"
    assert data["ativa"] is True
    assert len(data["opcoes"]) == 2
    assert data["total_votos"] == 0
    assert "criado_em" in data


def test_criar_votacao_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/votacoes",
        json={"titulo": "X", "opcoes": ["A", "B"], "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_criar_votacao_opcoes_insuficientes(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/votacoes",
        json={"titulo": "Só uma opção", "opcoes": ["Apenas isso"], "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_criar_votacao_morador_bloqueado(client, morador_ativo, admin_user):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        "/votacoes",
        json={"titulo": "Criado por morador", "opcoes": ["A", "B"], "condominio_id": cond.id},
        headers=morador_headers,
    )
    assert resp.status_code == 403


def test_listar_votacoes_sindico(client, auth_headers, admin_user, votacao_id):
    _, cond = admin_user
    resp = client.get(f"/votacoes?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(v["id"] == votacao_id for v in data)
    assert "resultados" in data[0]


def test_listar_votacoes_morador(client, morador_ativo, votacao_id):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/votacoes?condominio_id={cond.id}", headers=morador_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_votacoes_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/votacoes?condominio_id={cond.id}")
    assert resp.status_code == 401


def test_votar(client, morador_ativo, votacao_id):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        f"/votacoes/{votacao_id}/votar",
        json={"opcao_idx": 1},
        headers=morador_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_votos"] >= 1
    assert data["meu_voto"] == 1
    assert data["resultados"][1] >= 1


def test_votar_duas_vezes_bloqueado(client, morador_ativo, votacao_id):
    _, cond, morador_headers = morador_ativo
    resp = client.post(
        f"/votacoes/{votacao_id}/votar",
        json={"opcao_idx": 0},
        headers=morador_headers,
    )
    assert resp.status_code == 409


def test_votar_opcao_invalida(client, auth_headers, admin_user, morador_ativo):
    _, cond, _ = morador_ativo
    # Cria votação específica para este teste
    r = client.post(
        "/votacoes",
        json={"titulo": "Opcao invalida test", "opcoes": ["A", "B"], "condominio_id": cond.id},
        headers=auth_headers,
    )
    vid = r.json()["id"]
    _, _, morador_headers = morador_ativo
    resp = client.post(
        f"/votacoes/{vid}/votar",
        json={"opcao_idx": 99},
        headers=morador_headers,
    )
    assert resp.status_code == 400


def test_sindico_nao_pode_votar(client, auth_headers, votacao_id):
    resp = client.post(
        f"/votacoes/{votacao_id}/votar",
        json={"opcao_idx": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 403


def test_votar_sem_auth(client, votacao_id):
    resp = client.post(f"/votacoes/{votacao_id}/votar", json={"opcao_idx": 0})
    assert resp.status_code == 401


def test_votar_votacao_inexistente(client, morador_ativo):
    _, _, morador_headers = morador_ativo
    resp = client.post(
        "/votacoes/999999/votar",
        json={"opcao_idx": 0},
        headers=morador_headers,
    )
    assert resp.status_code == 404


def test_encerrar_votacao(client, auth_headers, admin_user):
    _, cond = admin_user
    r = client.post(
        "/votacoes",
        json={"titulo": "Para Encerrar", "opcoes": ["Sim", "Não"], "condominio_id": cond.id},
        headers=auth_headers,
    )
    vid = r.json()["id"]
    resp = client.put(f"/votacoes/{vid}/encerrar", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["ativa"] is False
    assert resp.json()["encerrada_em"] is not None


def test_votar_votacao_encerrada(client, auth_headers, admin_user, morador_ativo):
    _, cond, morador_headers = morador_ativo
    r = client.post(
        "/votacoes",
        json={"titulo": "Encerrada Teste", "opcoes": ["A", "B"], "condominio_id": cond.id},
        headers=auth_headers,
    )
    vid = r.json()["id"]
    client.put(f"/votacoes/{vid}/encerrar", headers=auth_headers)
    resp = client.post(
        f"/votacoes/{vid}/votar",
        json={"opcao_idx": 0},
        headers=morador_headers,
    )
    assert resp.status_code == 400


def test_encerrar_votacao_inexistente(client, auth_headers):
    resp = client.put("/votacoes/999999/encerrar", headers=auth_headers)
    assert resp.status_code == 404


def test_deletar_votacao(client, auth_headers, admin_user):
    _, cond = admin_user
    r = client.post(
        "/votacoes",
        json={"titulo": "Para Deletar", "opcoes": ["X", "Y"], "condominio_id": cond.id},
        headers=auth_headers,
    )
    vid = r.json()["id"]
    resp = client.delete(f"/votacoes/{vid}", headers=auth_headers)
    assert resp.status_code == 204


def test_deletar_votacao_inexistente(client, auth_headers):
    resp = client.delete("/votacoes/999999", headers=auth_headers)
    assert resp.status_code == 404
