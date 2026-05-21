"""
Testes de isolamento multi-tenant.
Garante que síndico do condomínio A não acessa dados do condomínio B.
"""
import pytest


@pytest.fixture(scope="module")
def sindico_b_token(client, db):
    from app.auth import hash_senha
    from app.models.condominio import Condominio
    from app.models.usuario import Usuario, TipoUsuario

    condo_b = Condominio(nome="Condo B Isolado", quantidade_unidades=5)
    db.add(condo_b)
    db.commit()
    db.refresh(condo_b)

    sindico_b = Usuario(
        nome="Sindico B",
        email="sindico_b_mt@teste.com",
        senha_hash=hash_senha("senha123"),
        tipo=TipoUsuario.SINDICO,
        condominio_id=condo_b.id,
    )
    db.add(sindico_b)
    db.commit()
    db.refresh(sindico_b)

    resp = client.post("/login", json={"email": "sindico_b_mt@teste.com", "senha": "senha123"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, condo_b.id


def test_sindico_nao_acessa_despesas_de_outro_condo(client, sindico_token, admin_user):
    """Síndico do condo A não pode criar despesa no condo do admin."""
    _, condo = admin_user
    resp = client.post("/despesas", json={
        "descricao": "Hack attempt",
        "valor": 1000.0,
        "data": "2026-01-01",
        "categoria": "Outros",
        "condominio_id": condo.id,
    }, headers=sindico_token)
    assert resp.status_code == 403


def test_sindico_nao_acessa_receitas_de_outro_condo(client, sindico_token, admin_user):
    _, condo = admin_user
    resp = client.post("/receitas", json={
        "descricao": "Hack receita",
        "valor": 500.0,
        "data": "2026-01-01",
        "categoria": "Outros",
        "condominio_id": condo.id,
    }, headers=sindico_token)
    assert resp.status_code == 403


def test_sindico_nao_acessa_moradores_de_outro_condo(client, sindico_token, admin_user):
    _, condo = admin_user
    resp = client.post("/moradores", json={
        "nome": "Invasor",
        "email": "invasor@teste.com",
        "telefone": "11999990000",
        "apartamento": "999",
        "condominio_id": condo.id,
    }, headers=sindico_token)
    assert resp.status_code == 403


def test_sindico_nao_acessa_pagamentos_de_outro_condo(client, sindico_token, admin_user):
    _, condo = admin_user
    resp = client.get(f"/pagamentos/{condo.id}", headers=sindico_token)
    assert resp.status_code == 403


def test_sindico_nao_acessa_taxa_de_outro_condo(client, sindico_token, admin_user):
    _, condo = admin_user
    resp = client.post(f"/taxa/{condo.id}", json={"valor": 999}, headers=sindico_token)
    assert resp.status_code == 403


def test_sindico_nao_acessa_avisos_de_outro_condo(client, sindico_token, admin_user):
    _, condo = admin_user
    resp = client.post("/avisos", json={
        "titulo": "Aviso invasor",
        "conteudo": "Conteúdo invasor",
        "tipo": "NORMAL",
        "condominio_id": condo.id,
    }, headers=sindico_token)
    assert resp.status_code == 403


def test_sindico_b_isolado_de_sindico_a(client, sindico_b_token, sindico_user):
    """Síndico B não enxerga dados do condomínio do síndico A."""
    headers, _ = sindico_b_token
    _, condo_a = sindico_user
    resp = client.get(f"/pagamentos/{condo_a.id}", headers=headers)
    assert resp.status_code == 403


def test_sindico_acessa_proprio_condo(client, sindico_user):
    """Síndico consegue acessar os dados do próprio condomínio."""
    _, condo = sindico_user
    resp = client.post("/login", json={"email": "sindico@teste.com", "senha": "senha123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get(f"/pagamentos/{condo.id}", headers=headers)
    assert resp.status_code == 200
