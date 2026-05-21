import pytest
from datetime import datetime, timezone, timedelta


def _dt(delta_days=1):
    return (datetime.now(timezone.utc) + timedelta(days=delta_days)).isoformat()


@pytest.fixture(scope="module")
def manutencao_id(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/manutencoes",
        json={
            "titulo": "Limpeza da piscina",
            "categoria": "PISCINA",
            "data_inicio": _dt(2),
            "impacto": "Piscina fechada das 8h às 12h",
            "condominio_id": cond.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_criar_manutencao(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/manutencoes",
        json={
            "titulo": "Revisão elétrica",
            "categoria": "ELETRICA",
            "data_inicio": _dt(3),
            "data_fim": _dt(4),
            "impacto": "Sem energia das 8h às 12h",
            "condominio_id": cond.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["titulo"] == "Revisão elétrica"
    assert data["categoria"] == "ELETRICA"
    assert data["status"] == "AGENDADA"
    assert data["data_fim"] is not None
    assert "criado_em" in data


def test_criar_manutencao_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/manutencoes",
        json={"titulo": "X", "categoria": "OUTRO", "data_inicio": _dt(), "condominio_id": cond.id},
    )
    assert resp.status_code == 401


def test_listar_manutencoes_sindico(client, auth_headers, admin_user, manutencao_id):
    _, cond = admin_user
    resp = client.get(f"/manutencoes?condominio_id={cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(m["id"] == manutencao_id for m in data)


def test_listar_manutencoes_morador(client, morador_ativo, manutencao_id):
    _, cond, morador_headers = morador_ativo
    resp = client.get(f"/manutencoes?condominio_id={cond.id}", headers=morador_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_listar_manutencoes_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/manutencoes?condominio_id={cond.id}")
    assert resp.status_code == 401


def test_atualizar_status_em_andamento(client, auth_headers, manutencao_id):
    resp = client.put(
        f"/manutencoes/{manutencao_id}",
        json={"status": "EM_ANDAMENTO"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "EM_ANDAMENTO"


def test_atualizar_status_concluida(client, auth_headers, manutencao_id):
    resp = client.put(
        f"/manutencoes/{manutencao_id}",
        json={"status": "CONCLUIDA"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "CONCLUIDA"


def test_atualizar_descricao_e_impacto(client, auth_headers, manutencao_id):
    resp = client.put(
        f"/manutencoes/{manutencao_id}",
        json={"descricao": "Detalhes técnicos adicionados.", "impacto": "Impacto reduzido."},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["descricao"] == "Detalhes técnicos adicionados."
    assert data["impacto"] == "Impacto reduzido."


def test_atualizar_manutencao_sem_auth(client, manutencao_id):
    resp = client.put(f"/manutencoes/{manutencao_id}", json={"status": "CANCELADA"})
    assert resp.status_code == 401


def test_atualizar_manutencao_inexistente(client, auth_headers):
    resp = client.put("/manutencoes/999999", json={"status": "CONCLUIDA"}, headers=auth_headers)
    assert resp.status_code == 404


def test_deletar_manutencao(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/manutencoes",
        json={"titulo": "Para Deletar", "categoria": "OUTRO", "data_inicio": _dt(5), "condominio_id": cond.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    mid = resp.json()["id"]
    del_resp = client.delete(f"/manutencoes/{mid}", headers=auth_headers)
    assert del_resp.status_code == 204


def test_deletar_manutencao_sem_auth(client, manutencao_id):
    resp = client.delete(f"/manutencoes/{manutencao_id}")
    assert resp.status_code == 401


def test_deletar_manutencao_inexistente(client, auth_headers):
    resp = client.delete("/manutencoes/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_todas_categorias(client, auth_headers, admin_user):
    _, cond = admin_user
    categorias = ["ELEVADOR", "PISCINA", "GERADOR", "HIDRAULICA", "ELETRICA", "LIMPEZA", "JARDINAGEM", "OUTRO"]
    for cat in categorias:
        resp = client.post(
            "/manutencoes",
            json={"titulo": f"Test {cat}", "categoria": cat, "data_inicio": _dt(10), "condominio_id": cond.id},
            headers=auth_headers,
        )
        assert resp.status_code == 201, f"Falhou para categoria {cat}"
        assert resp.json()["categoria"] == cat
