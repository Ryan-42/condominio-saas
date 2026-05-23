"""
Módulo de envio de e-mail do CONDO//SYS.

Configuração via variáveis de ambiente:
  SMTP_HOST   — ex: smtp.gmail.com
  SMTP_PORT   — ex: 587 (TLS) ou 465 (SSL)
  SMTP_USER   — endereço do remetente
  SMTP_PASS   — senha ou app password
  EMAIL_FROM  — nome exibido (opcional, padrão SMTP_USER)
  APP_URL     — URL base da aplicação (ex: https://app.condosys.com.br)

Sem SMTP_HOST configurado, o e-mail é apenas logado no console (modo dev).
"""
import os
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_RESEND_KEY  = os.getenv("RESEND_API_KEY", "")
_SMTP_HOST   = os.getenv("SMTP_HOST", "")
_SMTP_PORT   = int(os.getenv("SMTP_PORT", "587"))
_SMTP_USER   = os.getenv("SMTP_USER", "")
_SMTP_PASS   = os.getenv("SMTP_PASS", "")
_EMAIL_FROM  = os.getenv("EMAIL_FROM", _SMTP_USER) or "CONDO//SYS <onboarding@resend.dev>"
_SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "suporte@condosys.com.br")
APP_URL = os.getenv("APP_URL") or os.getenv("APP_BASE_URL", "http://localhost:5500")


def _html_base(titulo: str, corpo: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #030d0a; color: #e8f5f0; margin: 0; padding: 32px 16px; }}
  .card {{ max-width: 520px; margin: 0 auto; background: #051510; border: 1px solid rgba(16,185,129,.25);
           border-radius: 12px; overflow: hidden; }}
  .header {{ background: linear-gradient(90deg,#065F46,#10B981,#06B6D4,#34D399); padding: 24px 32px; }}
  .header h1 {{ font-size: 18px; font-weight: 700; letter-spacing: 2px; color: #fff; margin: 0; }}
  .header p {{ font-size: 11px; color: rgba(255,255,255,.7); margin: 4px 0 0; letter-spacing: 1px; }}
  .body {{ padding: 32px; }}
  .body p {{ font-size: 14px; line-height: 1.7; color: #a7f3d0; margin: 0 0 16px; }}
  .btn {{ display: inline-block; background: linear-gradient(90deg,#065F46,#10B981);
          color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px;
          font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 8px 0 20px; }}
  .footer {{ padding: 16px 32px; border-top: 1px solid rgba(16,185,129,.15);
             font-size: 11px; color: rgba(110,231,183,.35); letter-spacing: 1px; }}
  .code {{ font-family: monospace; background: rgba(16,185,129,.10); padding: 12px 16px;
           border-radius: 6px; border-left: 3px solid #10B981; word-break: break-all;
           font-size: 13px; color: #6EE7B7; margin: 12px 0; }}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>CONDO//SYS</h1>
      <p>{titulo}</p>
    </div>
    <div class="body">{corpo}</div>
    <div class="footer">CONDO//SYS · Este é um e-mail automático, não responda.</div>
  </div>
</body>
</html>"""


def enviar_email(destinatario: str, assunto: str, html: str) -> bool:
    # ── Resend (HTTP API — funciona em Railway) ───────────────────
    _key = os.getenv("RESEND_API_KEY", "")
    if _key:
        try:
            import resend
            resend.api_key = _key
            from_addr = os.getenv("EMAIL_FROM", "CONDO//SYS <onboarding@resend.dev>")
            resend.Emails.send({
                "from": from_addr,
                "to": [destinatario],
                "subject": assunto,
                "html": html,
            })
            logger.info("E-mail (Resend) enviado para %s [%s]", destinatario, assunto)
            return True
        except Exception as exc:
            logger.error("Falha Resend para %s: %s", destinatario, exc)
            return False

    # ── SMTP fallback ─────────────────────────────────────────────
    _host = os.getenv("SMTP_HOST", "")
    if not _host:
        logger.info(
            "EMAIL (modo dev — sem RESEND_API_KEY/SMTP_HOST):\n"
            "  Para: %s\n  Assunto: %s\n  [HTML omitido]",
            destinatario, assunto,
        )
        return True

    try:
        _port = int(os.getenv("SMTP_PORT", "587"))
        _user = os.getenv("SMTP_USER", "")
        _pass = os.getenv("SMTP_PASS", "")
        _from = os.getenv("EMAIL_FROM", _user)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = assunto
        msg["From"]    = _from
        msg["To"]      = destinatario
        msg.attach(MIMEText(html, "html", "utf-8"))

        if _port == 465:
            with smtplib.SMTP_SSL(_host, _port, timeout=10) as server:
                server.login(_user, _pass)
                server.sendmail(_user, destinatario, msg.as_string())
        else:
            with smtplib.SMTP(_host, _port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.login(_user, _pass)
                server.sendmail(_user, destinatario, msg.as_string())

        logger.info("E-mail (SMTP) enviado para %s [%s]", destinatario, assunto)
        return True
    except Exception as exc:
        logger.error("Falha SMTP para %s: %s", destinatario, exc)
        return False


def enviar_reset_senha(destinatario: str, nome: str, token: str) -> bool:
    link = f"{APP_URL}/resetar-senha.html?token={token}"
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p>Recebemos uma solicitação para redefinir a senha da sua conta no CONDO//SYS.</p>
<p>Clique no botão abaixo para criar uma nova senha. Este link expira em <strong>1 hora</strong>.</p>
<a class="btn" href="{link}">REDEFINIR SENHA</a>
<p>Ou copie o link abaixo no seu navegador:</p>
<div class="code">{link}</div>
<p style="font-size:12px;color:rgba(192,169,235,.5);">
  Se você não solicitou a redefinição de senha, ignore este e-mail.
  Sua senha permanece a mesma.
</p>"""
    html = _html_base("Redefinição de Senha", corpo)
    return enviar_email(destinatario, "CONDO//SYS — Redefinição de Senha", html)


def enviar_convite_morador(destinatario: str, nome: str, onboarding_url: str) -> bool:
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p>Você foi cadastrado(a) no <strong>CONDO//SYS</strong> como morador(a) do seu condomínio.</p>
<p>Clique no botão abaixo para ativar sua conta, definir sua senha e aceitar os termos de uso:</p>
<a class="btn" href="{onboarding_url}">ATIVAR MINHA CONTA</a>
<p>Ou copie o link abaixo no seu navegador:</p>
<div class="code">{onboarding_url}</div>
<p style="font-size:12px;color:rgba(110,231,183,.4);">
  Se você não reconhece este convite, ignore este e-mail com segurança.
</p>"""
    html = _html_base("Convite de Acesso ao Portal", corpo)
    return enviar_email(destinatario, "CONDO//SYS — Ative sua conta de morador", html)


def enviar_reclamacao_respondida(
    destinatario: str, nome: str, titulo: str, resposta: str, status: str
) -> bool:
    label = {"RESOLVIDA": "✔ Resolvida", "EM_ANALISE": "Em análise", "ABERTA": "Aberta"}.get(status, status)
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p>Sua reclamação <strong>"{titulo}"</strong> recebeu uma resposta do síndico.</p>
<p><strong>Status:</strong> {label}</p>
<p><strong>Resposta:</strong></p>
<div class="code">{resposta}</div>
<p>Acesse o portal para ver todos os detalhes:</p>
<a class="btn" href="{APP_URL}/portal.html">VER NO PORTAL</a>"""
    return enviar_email(destinatario, f"CONDO//SYS — Sua reclamação foi respondida", _html_base("Reclamação Respondida", corpo))


def enviar_aviso_urgente(
    destinatario: str, nome: str, titulo: str, conteudo: str, condo_nome: str
) -> bool:
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p>O condomínio <strong>{condo_nome}</strong> publicou um aviso urgente:</p>
<p><strong>📢 {titulo}</strong></p>
<div class="code">{conteudo}</div>
<a class="btn" href="{APP_URL}/portal.html">VER NO PORTAL</a>"""
    return enviar_email(destinatario, f"⚠ CONDO//SYS — Aviso Urgente: {titulo}", _html_base("Aviso Urgente", corpo))


def enviar_reserva_atualizada(
    destinatario: str, nome: str, espaco: str, data: str, periodo: str, status: str, resposta: str | None
) -> bool:
    cor = {"APROVADA": "✔ Aprovada", "REJEITADA": "✕ Rejeitada"}.get(status, status)
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p>Sua solicitação de reserva foi atualizada:</p>
<p><strong>Espaço:</strong> {espaco}<br>
<strong>Data:</strong> {data} · {periodo}<br>
<strong>Status:</strong> {cor}</p>
{f'<div class="code">{resposta}</div>' if resposta else ""}
<a class="btn" href="{APP_URL}/portal.html">VER NO PORTAL</a>"""
    return enviar_email(destinatario, f"CONDO//SYS — Reserva {status.lower()}: {espaco}", _html_base("Reserva Atualizada", corpo))


def enviar_manutencao_agendada(
    destinatario: str, nome: str, titulo: str, categoria: str, data_inicio: str, impacto: str | None
) -> bool:
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p>Uma manutenção foi agendada no seu condomínio:</p>
<p><strong>🔧 {titulo}</strong><br>
<strong>Categoria:</strong> {categoria}<br>
<strong>Data/Hora:</strong> {data_inicio}</p>
{f'<p><strong>Áreas impactadas:</strong> {impacto}</p>' if impacto else ""}
<a class="btn" href="{APP_URL}/portal.html">VER NO PORTAL</a>"""
    return enviar_email(destinatario, f"CONDO//SYS — Manutenção agendada: {titulo}", _html_base("Manutenção Agendada", corpo))


def enviar_nova_mensagem(
    destinatario: str, nome: str, remetente: str, preview: str
) -> bool:
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p><strong>{remetente}</strong> enviou uma mensagem para você:</p>
<div class="code">{preview[:200]}{"…" if len(preview) > 200 else ""}</div>
<a class="btn" href="{APP_URL}/portal.html">VER NO PORTAL</a>"""
    return enviar_email(destinatario, f"CONDO//SYS — Nova mensagem de {remetente}", _html_base("Nova Mensagem", corpo))


def enviar_boas_vindas(destinatario: str, nome: str) -> bool:
    corpo = f"""
<p>Olá, <strong>{nome}</strong>!</p>
<p>Bem-vindo ao <strong>CONDO//SYS</strong> — sua plataforma de gestão condominial.</p>
<p>Sua conta foi criada com sucesso. Acesse a plataforma e comece a gerenciar seu condomínio:</p>
<a class="btn" href="{APP_URL}/login.html">ACESSAR PLATAFORMA</a>
<p style="font-size:12px;color:rgba(192,169,235,.5);">
  Em caso de dúvidas, entre em contato pelo e-mail {_SUPPORT_EMAIL}
</p>"""
    html = _html_base("Bem-vindo ao CONDO//SYS", corpo)
    return enviar_email(destinatario, "Bem-vindo ao CONDO//SYS!", html)
