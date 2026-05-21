import os
from app.database import SessionLocal, engine, Base

# Importar TODOS os models para o SQLAlchemy resolver os relacionamentos
from app.models.condominio import Condominio
from app.models.morador import Morador
from app.models.despesa import Despesa
from app.models.receita import Receita
from app.models.usuario import Usuario, TipoUsuario
from app.auth import hash_senha

# Garante que as tabelas existem
Base.metadata.create_all(bind=engine)

db = SessionLocal()

email = os.environ.get("ADMIN_EMAIL") or input("Email do admin: ")
senha = os.environ.get("ADMIN_SENHA") or input("Senha do admin: ")

# Verifica se já existe para não duplicar
existente = db.query(Usuario).filter(Usuario.email == email).first()
if existente:
    print("Admin já existe!")
else:
    admin = Usuario(
        nome       = "Admin",
        email      = email,
        senha_hash = hash_senha(senha),
        tipo       = TipoUsuario.ADMIN,
    )
    db.add(admin)
    db.commit()
    print("✔ Admin criado com sucesso!")
    print(f"  Email: {email}")
    print(f"  Senha: {senha}")

db.close()