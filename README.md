<div align="center">

```
 ██████╗ ██████╗ ███╗   ██╗██████╗  ██████╗  //███████╗██╗   ██╗███████╗
██╔════╝██╔═══██╗████╗  ██║██╔══██╗██╔═══██╗ //██╔════╝╚██╗ ██╔╝██╔════╝
██║     ██║   ██║██╔██╗ ██║██║  ██║██║   ██║ //███████╗ ╚████╔╝ ███████╗
██║     ██║   ██║██║╚██╗██║██║  ██║██║   ██║ //     ╚██╗ ╚██╔╝  ╚════██║
╚██████╗╚██████╔╝██║ ╚████║██████╔╝╚██████╔╝ //███████║  ██║   ███████║
 ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═════╝  ╚═════╝ //╚══════╝  ╚═╝   ╚══════╝
```

**Gestão condominial moderna — síndicos, moradores e IA num só lugar.**

[![Deploy on Railway](https://img.shields.io/badge/deploy-Railway-blueviolet?logo=railway)](https://condominio-saas-production-32fb.up.railway.app/login.html)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)](https://postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?color=10B981)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Ryan-42/condominio-saas/test.yml?label=tests&logo=github)](https://github.com/Ryan-42/condominio-saas/actions)

[🌐 Demo ao vivo](https://condominio-saas-production-32fb.up.railway.app/login.html) · [📖 API Docs](https://condominio-saas-production-32fb.up.railway.app/docs) · [🐛 Reportar bug](https://github.com/Ryan-42/condominio-saas/issues)

</div>

---

## ⬡ O que é o CONDO//SYS?

CONDO//SYS é um **SaaS multi-tenant de gestão condominial** com três perfis de acesso — Administrador, Síndico e Morador — cada um com seu próprio portal. O produto nasceu com o objetivo de digitalizar a rotina do condomínio: finanças, comunicação, reservas, votações e muito mais, com uma camada de **Inteligência Artificial** integrada ao contexto real de cada condomínio.

```
┌─────────────────────────────────────────────────┐
│  ADMIN          SINDICO           MORADOR        │
│  ─────          ───────           ───────        │
│  Gestão global  Dashboard completo  Portal       │
│  Multi-condo    Finanças           Avisos        │
│  Usuários       Moradores          Reclamações   │
│  Relatórios     IA integrada       Reservas      │
│                 Manutenções        Votações      │
└─────────────────────────────────────────────────┘
```

---

## ✦ Funcionalidades

### 💰 Financeiro
- **Despesas & Receitas** — CRUD completo com importação CSV/Excel
- **Pagamentos** — Geração de taxa mensal, controle de inadimplência
- **Relatórios** — Dashboard financeiro + exportação PDF (ReportLab) e JSON
- **Gráfico mensal** — Resumo visual de despesas por período

### 👥 Moradores
- Cadastro com campos Nome, Apartamento, E-mail, Telefone
- **Portal do Morador** — acesso dedicado via `portal.html`
- **Convite por e-mail** — link de ativação com prazo de 7 dias
- **QR Code de acesso** — token JWT de 30 dias para o portal
- Onboarding com **aceite LGPD** (Art. 18 — anonimização no delete)

### 📢 Comunicação
- **Avisos** — tipos NORMAL / URGENTE / INFO, com envio de e-mail automático para todos os moradores em avisos urgentes
- **Reclamações** — fluxo ABERTA → EM_ANÁLISE → RESOLVIDA com notificação por e-mail ao morador
- **Chat síndico-morador** — mensagens em tempo real simulado com notificação por e-mail

### 🔑 Reservas & Espaços
- Cadastro de espaços com períodos disponíveis (MANHA / TARDE / NOITE / DIA_TODO)
- Fluxo de aprovação pelo síndico com e-mail de confirmação/rejeição

### 🗳️ Votações
- Criação de pautas com prazo definido
- 1 voto por morador por votação
- Resultados em tempo real, encerramento manual

### 🔧 Manutenções
- Agendamento com categorias e áreas de impacto
- Notificação automática para todos os moradores

### 📄 Documentos
- Upload seguro de arquivos até 20 MB
- Download e exclusão controlados por multi-tenancy

### 🤖 CONDO//AI
- Chat com **Groq LLaMA 3.3 70B** integrado ao contexto real do condomínio
- Sugestões dinâmicas baseadas em dados financeiros e de moradores
- Histórico de conversa por sessão
- Respostas em Markdown com typing indicator animado

---

## 🛠 Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI 0.100+ · SQLAlchemy 2.x · Pydantic v2 |
| Banco de dados | PostgreSQL 15 (prod) · SQLite (dev) |
| Autenticação | JWT HS256 · bcrypt · Rate limiting (5 req/60s) |
| E-mail | SMTP (Gmail / qualquer provider) com 8 templates HTML |
| IA | Groq API — LLaMA 3.3 70B |
| Frontend | Vanilla JS (ES2022) · sem frameworks · 129 KB |
| PWA | Service Worker + Web App Manifest |
| Deploy | Railway · Docker · GitHub Actions CI |
| Testes | pytest · ~100 testes automatizados |

---

## 🏗 Arquitetura

```
condominio-saas/
│
├── app/
│   ├── main.py              # FastAPI app + lifespan (DB init)
│   ├── auth.py              # JWT, bcrypt, RBAC, rate limiting
│   ├── database.py          # SQLAlchemy engine (PG/SQLite)
│   ├── email.py             # 8 templates de e-mail HTML
│   │
│   ├── models/              # 12 tabelas SQLAlchemy
│   │   ├── usuario.py       # ADMIN · SINDICO · MORADOR
│   │   ├── condominio.py
│   │   ├── morador.py       # Portal, convite, LGPD
│   │   ├── despesa.py
│   │   ├── receita.py
│   │   ├── pagamento.py
│   │   ├── aviso.py
│   │   ├── reclamacao.py
│   │   ├── espaco.py / reserva.py
│   │   ├── votacao.py
│   │   ├── documento.py
│   │   ├── manutencao.py
│   │   └── mensagem.py
│   │
│   ├── routes/              # 65+ endpoints REST
│   │   ├── usuarios.py      # Auth + CRUD usuários
│   │   ├── moradores.py
│   │   ├── despesas.py / receitas.py / pagamentos.py
│   │   ├── avisos.py / reclamacoes.py / chat.py
│   │   ├── espacos.py / votacoes.py
│   │   ├── documentos.py / manutencoes.py
│   │   ├── importar.py      # CSV/Excel (openpyxl)
│   │   ├── relatorio.py / relatorio_pdf.py
│   │   ├── financeiro.py / insights.py
│   │   ├── ai.py            # Groq integration
│   │   └── registro.py      # Auto-registro síndico
│   │
│   └── schemas/             # Pydantic request/response models
│
├── index.html               # Dashboard síndico/admin
├── portal.html              # Portal do morador
├── login.html / registro.html / onboarding.html
├── resetar-senha.html / privacidade.html / termos.html
│
├── script.js                # App principal (129 KB)
├── auth_client.js           # Login flow
├── config.js                # API_BASE dinâmico
├── Space.js                 # Canvas animations
├── sw.js                    # Service Worker
├── manifest.json            # PWA manifest
│
├── Dockerfile
├── railway.json
└── requirements.txt
```

---

## 🔐 Segurança

- **Multi-tenancy** — isolamento total por `condominio_id` via JWT
- **RBAC** — `somente_admin`, `somente_gestor`, verificação em toda rota de escrita
- **Rate limiting** — 5 tentativas de login por IP/60s (em memória, Redis na Sprint 7)
- **XSS** — `escHTML()` sanitiza todo output no frontend antes de inserir no DOM
- **LGPD** — aceite no onboarding, anonimização de dados pessoais no delete
- **Tokens** — armazenados em `sessionStorage` (expira ao fechar a aba)
- **Reset de senha** — token UUID com expiração de 1 hora

---

## 🚀 Rodando localmente

### Pré-requisitos
- Python 3.11+
- Node.js (opcional — apenas para `live-server`)

### Backend

```powershell
# Clone o repositório
git clone https://github.com/Ryan-42/condominio-saas.git
cd condominio-saas

# Crie o ambiente virtual
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt

# Variáveis de ambiente (opcional — SQLite usado por padrão em dev)
$env:SECRET_KEY = "sua-chave-secreta-aqui"
$env:GROQ_API_KEY = "gsk_..."         # Para o chat IA

# Inicie o servidor
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app
```

### Frontend

```powershell
# Opção 1: Live Server (recomendado)
npx live-server --port=5500 --no-browser

# Opção 2: qualquer servidor HTTP estático
# Acesse http://localhost:5500/login.html
```

### Criar admin local

```powershell
.venv\Scripts\python.exe criar_admin.py
```

---

## 🌐 Deploy (Railway)

O projeto está configurado para deploy automático no Railway via push no `main`.

```
GitHub push → GitHub Actions (testes) → Railway build → Deploy
```

### Variáveis de ambiente necessárias no Railway

| Variável | Descrição |
|----------|-----------|
| `SECRET_KEY` | Chave JWT — gere com `secrets.token_hex(32)` |
| `DATABASE_URL` | Injetado automaticamente pelo Railway PostgreSQL |
| `GROQ_API_KEY` | Chave da API Groq |
| `SMTP_HOST` | Host SMTP (ex: `smtp.gmail.com`) |
| `SMTP_PORT` | Porta SMTP (ex: `587`) |
| `SMTP_USER` | E-mail remetente |
| `SMTP_PASS` | Senha ou App Password |
| `APP_URL` | URL pública do Railway (para links nos e-mails) |
| `ENV` | `production` (ativa validações de segurança) |

### Comando de deploy manual

```bash
railway up
```

---

## 🧪 Testes

```powershell
.venv\Scripts\pytest tests/ -v
```

O projeto conta com **~100 testes automatizados** cobrindo:
- Autenticação JWT e RBAC
- CRUD de todos os módulos
- Validações de multi-tenancy
- Fluxos de e-mail (mock)
- Import CSV/Excel

CI/CD configurado via **GitHub Actions** em `.github/workflows/test.yml`.

---

## 🗺 Roadmap

```
✅ Sprint 0  Fundação (FastAPI + Auth + CRUD)
✅ Sprint 1  Features Core (financeiro, avisos, importação, reset senha)
✅ Sprint 2  Engajamento (reclamações, reservas, votações, docs, manutenções, chat)
✅ Sprint 3  IA & Portal Morador (CONDO//AI + Groq + portal.html)
✅ Sprint 4  Segurança & Polimento (rate limiting, XSS, LGPD, PWA, CI/CD)
✅ Sprint 5  Deploy & Produção (Railway + PostgreSQL + Docker)

🔄 Sprint 6  Monetização (Stripe, planos Free/Pro/Enterprise, trial 30 dias)
📋 Sprint 7  Escala (Redis rate limiting, logs estruturados, Sentry)
📋 Sprint 8  Mobile & Push Notifications (PWA push, WhatsApp API)
📋 Sprint 9  Integrações (boletos, API pública, white-label)
📋 Sprint 10 Enterprise (2FA, auditoria, SOC 2, SLA 99.9%)
```

---

## 📡 API

A documentação interativa completa está disponível em:

```
https://condominio-saas-production-32fb.up.railway.app/docs
```

Principais grupos de endpoints:

| Grupo | Endpoints |
|-------|-----------|
| Autenticação | `POST /login` · `POST /registro` · `POST /usuarios/esqueci-senha` |
| Usuários | `GET/POST /usuarios` · `PUT /usuarios/{id}` |
| Moradores | `GET/POST/PUT/DELETE /moradores` · `POST /moradores/{id}/convidar` |
| Financeiro | `/despesas` · `/receitas` · `/pagamentos` · `/resumo/{condo_id}` |
| Comunicação | `/avisos` · `/reclamacoes` · `/chat/mensagens` |
| Espaços | `/espacos` · `/reservas` |
| Outros | `/votacoes` · `/documentos` · `/manutencoes` |
| Import | `POST /importar/{despesas|receitas|moradores}/{condo_id}` |
| Relatório | `GET /relatorio/{condo_id}` · `GET /relatorio-pdf/{condo_id}` |
| IA | `POST /ai/chat` |

---

## 🧠 Segundo Cérebro do Projeto

O desenvolvimento deste projeto é documentado num sistema de **Segundo Cérebro** baseado em [Obsidian](https://obsidian.md), com memórias persistentes que cobrem:

- `project-overview` — Stack, arquitetura, RBAC, módulos
- `sprint-status` — Sprints concluídas e roadmap completo
- `api-endpoints` — Todos os 65+ endpoints documentados
- `models-schema` — 12 tabelas, campos e relacionamentos
- `auth-system` — JWT, RBAC, fluxos de convite e reset
- `frontend` — Páginas HTML, JS, paleta visual, animações, PWA
- `email-system` — 8 templates, quando disparam, configuração SMTP
- `infrastructure` — Dockerfile, Railway, database.py, CI/CD
- `production` — URL live, variáveis de ambiente, erros resolvidos

> Cada decisão técnica, cada erro encontrado e cada sprint entregue é registrado nessa base de conhecimento — garantindo que o contexto nunca se perde entre sessões de desenvolvimento.

---

## 🎨 Design System

Paleta **Emerald / Teal** consistente em todo o produto:

```css
--p1: #065F46   /* verde escuro */
--p2: #10B981   /* emerald */
--p3: #06B6D4   /* cyan */
--p4: #34D399   /* emerald claro */
--bg: #030d0a   /* quase preto */
```

Animações:
- **Canvas** — Aurora blobs + rede de 72 partículas com mouse interaction
- **CSS** — Micro-animações com `prefers-reduced-motion` respeitado
- **PWA** — Ícone hexagonal, splash screen, modo standalone

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch: `git checkout -b feat/minha-feature`
3. Commit suas mudanças: `git commit -m 'feat: adicionar X'`
4. Push: `git push origin feat/minha-feature`
5. Abra um Pull Request

---

## 📄 Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE) para mais informações.

---

<div align="center">

Feito com FastAPI, PostgreSQL, Vanilla JS e muita determinação.

**[⬡ CONDO//SYS](https://condominio-saas-production-32fb.up.railway.app/login.html)**

</div>
