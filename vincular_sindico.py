"""
Lista usuários SINDICO e condominios, depois vincula o síndico ao condomínio.
Uso: definir DATABASE_URL antes de rodar.
"""
import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ["DATABASE_URL"]
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    print("\n=== USUÁRIOS SINDICO ===")
    rows = conn.execute(text("SELECT id, nome, email, condominio_id FROM usuarios WHERE tipo='SINDICO'")).fetchall()
    for r in rows:
        print(f"  ID={r[0]}  nome={r[1]}  email={r[2]}  condominio_id={r[3]}")

    print("\n=== CONDOMINIOS ===")
    rows = conn.execute(text("SELECT id, nome FROM condominios")).fetchall()
    for r in rows:
        print(f"  ID={r[0]}  nome={r[1]}")

print("\nDigite o ID do usuário SINDICO a vincular:")
uid = int(input("  usuario_id = "))
print("Digite o ID do condomínio:")
cid = int(input("  condominio_id = "))

with engine.connect() as conn:
    conn.execute(text("UPDATE usuarios SET condominio_id=:cid WHERE id=:uid"), {"cid": cid, "uid": uid})
    conn.commit()
    row = conn.execute(text("SELECT id, nome, email, condominio_id FROM usuarios WHERE id=:uid"), {"uid": uid}).fetchone()
    print(f"\n✔ Atualizado: ID={row[0]} nome={row[1]} condominio_id={row[3]}")
