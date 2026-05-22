"""Testes para billing: planos, limites e endpoints."""
import uuid


def _registrar_sindico(client):
    tag = uuid.uuid4().hex[:8]
    r = client.post("/registro", json={
        "nome": f"Síndico {tag}",
        "email": f"billing_{tag}@test.com",
        "senha": "senha1234",
        "nome_condominio": f"Condo {tag}",
        "quantidade_unidades": 50,
    })
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    condo_id = r.json()["usuario"]["condominio_id"]
    return {"Authorization": f"Bearer {token}"}, condo_id


def test_planos_publico(client):
    """GET /billing/planos deve funcionar sem auth."""
    r = client.get("/billing/planos")
    assert r.status_code == 200
    nomes = [p["plano"] for p in r.json()]
    assert "FREE" in nomes
    assert "PRO" in nomes
    assert "ENTERPRISE" in nomes


def test_meu_plano_sem_auth(client):
    r = client.get("/billing/plano")
    assert r.status_code == 401


def test_meu_plano_sindico_free_com_trial(client):
    headers, _ = _registrar_sindico(client)
    r = client.get("/billing/plano", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["plano"] == "FREE"
    assert data["max_moradores"] == 30
    # Trial de 14 dias ativado automaticamente no registro
    assert data["trial_ativo"] is True
    assert data["trial_ends_at"] is not None


def test_checkout_sem_stripe_configurado(client):
    """Sem STRIPE_SECRET_KEY, deve retornar 503."""
    headers, _ = _registrar_sindico(client)
    r = client.post("/billing/checkout", headers=headers)
    assert r.status_code == 503


def test_portal_sem_customer_id(client):
    """Síndico sem stripe_customer_id deve receber 400."""
    headers, _ = _registrar_sindico(client)
    r = client.post("/billing/portal", headers=headers)
    assert r.status_code == 400


def test_limite_moradores_free(client):
    """Com trial ativo (PRO efetivo), limite é 150. Sem trial, FREE limita a 30."""
    # Cria síndico novo — trial ativo por 14 dias → limite efetivo é PRO (150)
    headers, condo_id = _registrar_sindico(client)

    # Trial ativo: deve conseguir criar > 30
    for i in range(31):
        r = client.post("/moradores", headers=headers, json={
            "nome": f"Morador {i}",
            "apartamento": str(i + 1),
            "condominio_id": condo_id,
            "email": f"m{i}_{condo_id}@test.com",
            "telefone": "11999990000",
        })
        assert r.status_code in (200, 201), f"Falhou no {i}: {r.text}"


def test_limite_moradores_apos_trial_expirado(client, db):
    """Síndico com trial expirado e plano FREE é limitado a 30 moradores."""
    from datetime import datetime, timezone, timedelta
    from app.models.usuario import Usuario

    headers, condo_id = _registrar_sindico(client)

    # Extrai o usuario_id do token
    r = client.get("/usuarios/me", headers=headers)
    usuario_id = r.json()["id"]

    # Força expiração do trial no DB
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    u.trial_ends_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()

    # Cria 30 moradores (limite FREE)
    for i in range(30):
        r = client.post("/moradores", headers=headers, json={
            "nome": f"Morador {i}",
            "apartamento": str(i + 1),
            "condominio_id": condo_id,
            "email": f"expired_{i}_{condo_id}@test.com",
            "telefone": "11999990000",
        })
        assert r.status_code in (200, 201), f"Falhou no {i}: {r.text}"

    # 31º deve ser bloqueado
    r = client.post("/moradores", headers=headers, json={
        "nome": "Morador 31",
        "apartamento": "31",
        "condominio_id": condo_id,
        "email": f"expired_31_{condo_id}@test.com",
        "telefone": "11999990000",
    })
    assert r.status_code == 403
    assert "limite" in r.json()["detail"].lower() or "upgrade" in r.json()["detail"].lower()


def test_registro_cria_trial(client, db):
    """Novo síndico deve ter trial_ends_at definido."""
    from app.models.usuario import Usuario

    tag = uuid.uuid4().hex[:8]
    r = client.post("/registro", json={
        "nome": "Trial Test",
        "email": f"trial_{tag}@test.com",
        "senha": "senha1234",
        "nome_condominio": f"Condo Trial {tag}",
        "quantidade_unidades": 10,
    })
    assert r.status_code == 201
    usuario_id = r.json()["usuario"]["id"]

    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    assert u is not None
    assert u.trial_ends_at is not None
