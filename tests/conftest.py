import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.auth import get_db, hash_senha, _login_attempts, _rl_lock
from app.database import Base
from app.models.usuario import Usuario, TipoUsuario
from app.models.condominio import Condominio

TEST_DB_URL = "sqlite:///./test.db"

engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def reset_rate_limit():
    yield
    with _rl_lock:
        _login_attempts.clear()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine_test)
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture(scope="session")
def db():
    session = TestingSession()
    yield session
    session.close()


@pytest.fixture(scope="session")
def admin_user(db):
    cond = Condominio(nome="Condo Teste", quantidade_unidades=10)
    db.add(cond)
    db.commit()
    db.refresh(cond)

    user = Usuario(
        nome="Admin Teste",
        email="admin@teste.com",
        senha_hash=hash_senha("senha123"),
        tipo=TipoUsuario.ADMIN,
        condominio_id=cond.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, cond


@pytest.fixture(scope="session")
def sindico_user(db):
    cond = Condominio(nome="Condo Sindico", quantidade_unidades=15)
    db.add(cond)
    db.commit()
    db.refresh(cond)

    user = Usuario(
        nome="Sindico Teste",
        email="sindico@teste.com",
        senha_hash=hash_senha("senha123"),
        tipo=TipoUsuario.SINDICO,
        condominio_id=cond.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, cond


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def auth_headers(client, admin_user):
    resp = client.post("/login", json={"email": "admin@teste.com", "senha": "senha123"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def sindico_token(client, sindico_user):
    resp = client.post("/login", json={"email": "sindico@teste.com", "senha": "senha123"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def morador_ativo(client, auth_headers, admin_user):
    """Cria, convida e ativa um morador no condo do admin.
    Retorna (morador_id, cond, morador_headers)."""
    _, cond = admin_user
    resp = client.post(
        "/moradores",
        json={
            "nome": "Morador Ativo",
            "email": "morador_ativo@teste.com",
            "telefone": "11977770000",
            "apartamento": "101",
            "condominio_id": cond.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    morador_id = resp.json()["id"]

    resp2 = client.post(f"/moradores/{morador_id}/convidar", headers=auth_headers)
    assert resp2.status_code == 200
    token = resp2.json()["onboarding_url"].split("token=")[1]

    resp3 = client.post(
        "/moradores/ativar",
        json={"token": token, "senha": "senha1234", "lgpd_aceite": True},
    )
    assert resp3.status_code == 200

    resp4 = client.post("/login", json={"email": "morador_ativo@teste.com", "senha": "senha1234"})
    assert resp4.status_code == 200
    data = resp4.json()
    morador_headers = {"Authorization": f"Bearer {data['access_token']}"}

    return morador_id, cond, morador_headers
