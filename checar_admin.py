import os
from app.database import SessionLocal, engine, Base
from app.models.condominio import Condominio
from app.models.morador import Morador
from app.models.despesa import Despesa
from app.models.receita import Receita
from app.models.pagamento import TaxaCondominio, Pagamento
from app.models.aviso import Aviso
from app.models.reclamacao import Reclamacao
from app.models.espaco import Espaco
from app.models.votacao import Votacao
from app.models.documento import Documento
from app.models.manutencao import Manutencao
from app.models.mensagem import Mensagem
from app.models.usuario import Usuario, TipoUsuario

print("DATABASE_URL:", os.getenv("DATABASE_URL", "sqlite (local)"))

db = SessionLocal()
usuario = db.query(Usuario).filter(Usuario.email == "condosys.admin@gmail.com").first()
if usuario:
    print("ENCONTRADO:", usuario.email)
    print("Tipo:", usuario.tipo)
    print("Hash (primeiros 20 chars):", usuario.senha_hash[:20])
else:
    print("NAO ENCONTRADO — admin não está neste banco")
    print("Total de usuários:", db.query(Usuario).count())
db.close()
