import pytest
from unittest.mock import patch, MagicMock


def test_ai_dados_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.get(f"/ai/dados/{cond.id}")
    assert resp.status_code == 401


def test_ai_dados(client, auth_headers, admin_user):
    _, cond = admin_user
    resp = client.get(f"/ai/dados/{cond.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "condominio" in data
    assert "saldo" in data
    assert "total_receitas" in data
    assert "total_despesas" in data
    assert "moradores" in data
    assert "inadimplentes" in data


def test_ai_dados_condominio_inexistente(client, auth_headers):
    resp = client.get("/ai/dados/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_ai_chat_sem_auth(client, admin_user):
    _, cond = admin_user
    resp = client.post(
        "/ai/chat",
        json={"mensagem": "Olá", "condominio_id": cond.id, "historico": []},
    )
    assert resp.status_code == 401


def test_ai_chat(client, auth_headers, admin_user):
    _, cond = admin_user

    mock_completion = MagicMock()
    mock_completion.choices[0].message.content = "Olá! Como posso ajudar?"

    with patch("app.routes.ai._groq") as mock_groq:
        mock_groq.chat.completions.create.return_value = mock_completion
        resp = client.post(
            "/ai/chat",
            json={"mensagem": "Qual o saldo?", "condominio_id": cond.id, "historico": []},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    assert resp.json()["resposta"] == "Olá! Como posso ajudar?"


def test_ai_chat_com_historico(client, auth_headers, admin_user):
    _, cond = admin_user

    mock_completion = MagicMock()
    mock_completion.choices[0].message.content = "O saldo é positivo."

    historico = [
        {"role": "user", "content": "Olá"},
        {"role": "assistant", "content": "Olá! Como posso ajudar?"},
    ]

    with patch("app.routes.ai._groq") as mock_groq:
        mock_groq.chat.completions.create.return_value = mock_completion
        resp = client.post(
            "/ai/chat",
            json={"mensagem": "E o saldo?", "condominio_id": cond.id, "historico": historico},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    # Verifica que o histórico foi passado para o Groq
    call_args = mock_groq.chat.completions.create.call_args
    messages = call_args.kwargs["messages"]
    # system + 2 historico + user = 4 mensagens
    assert len(messages) >= 4
