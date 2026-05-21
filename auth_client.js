async function verificarAPI() {
    const el  = document.getElementById("login-api-status");
    const dot = document.getElementById("api-dot");
    try {
        const res = await fetch(`${API_BASE}/`);
        if (res.ok) {
            if (el)  el.textContent = "Sistema online";
            if (dot) { dot.classList.add("ok"); dot.classList.remove("erro"); }
        } else {
            throw new Error("offline");
        }
    } catch {
        if (el)  el.textContent = "Sistema offline";
        if (dot) { dot.classList.add("erro"); dot.classList.remove("ok"); }
    }
}
document.addEventListener("DOMContentLoaded", verificarAPI);

async function submitLogin() {
    const emailEl = document.getElementById("login-email");
    const senhaEl = document.getElementById("login-senha");
    const btn     = document.getElementById("btn-entrar");

    if (!emailEl || !senhaEl || !btn) {
        console.error("ERRO: elemento não encontrado", { emailEl, senhaEl, btn });
        return;
    }

    const email = emailEl.value.trim();
    const senha = senhaEl.value;

    if (!email || !senha) {
        updateFeedback("Preencha todos os campos", "erro");
        return;
    }

    btn.disabled  = true;
    btn.innerText = "AUTENTICANDO…";
    const hint = document.getElementById("login-morador-hint");
    if (hint) hint.style.display = "none";

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, senha }),
        });

        if (res.status === 401) {
            updateFeedback("Credenciais inválidas", "erro");
            showMoradorHint();
            resetBtn(btn);
            return;
        }

        if (!res.ok) {
            updateFeedback("Erro " + res.status + " — tente novamente", "erro");
            resetBtn(btn);
            return;
        }

        const data = await res.json();
        sessionStorage.setItem("token",   data.access_token);
        sessionStorage.setItem("usuario", JSON.stringify(data.usuario));

        updateFeedback("Acesso concedido", "ok");
        setTimeout(() => { 
            if (data.usuario.tipo === "MORADOR") {
                window.location.href = "portal.html";
            } else {
                window.location.href = "index.html"; 
            }
        }, 900);

    } catch (err) {
        console.error("Erro fetch:", err);
        updateFeedback("Sem conexão com o servidor", "erro");
        resetBtn(btn);
    }
}

function resetBtn(btn) {
    if (!btn) return;
    btn.disabled  = false;
    btn.innerText = "ENTRAR NA PLATAFORMA";
}

function updateFeedback(msg, tipo) {
    const el = document.getElementById("login-feedback");
    if (el) {
        el.textContent = msg;
        el.className   = "login-feedback " + tipo;
    }
    // Esconde a dica de morador quando há feedback novo (exceto quando chamado com 401)
    const hint = document.getElementById("login-morador-hint");
    if (hint && tipo !== "erro-morador") hint.style.display = "none";
}

function showMoradorHint() {
    const hint = document.getElementById("login-morador-hint");
    if (hint) hint.style.display = "block";
}

// ── Esqueci minha senha ───────────────────────────────────────

function toggleEsqueciSenha() {
    const painel = document.getElementById("painel-esqueci");
    const aberto = painel.style.display !== "none";
    painel.style.display = aberto ? "none" : "block";
    if (!aberto) document.getElementById("reset-email").focus();
}

async function submitEsqueciSenha() {
    const emailEl = document.getElementById("reset-email");
    const btn     = document.getElementById("btn-reset");
    const label   = document.getElementById("btn-reset-label");
    const feedback = document.getElementById("reset-feedback");

    const email = emailEl ? emailEl.value.trim() : "";
    if (!email) {
        if (feedback) { feedback.textContent = "Digite seu e-mail."; feedback.className = "login-feedback erro"; }
        return;
    }

    btn.disabled = true;
    label.textContent = "ENVIANDO…";
    if (feedback) { feedback.textContent = ""; feedback.className = "login-feedback"; }

    try {
        const res = await fetch(`${API_BASE}/usuarios/esqueci-senha`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (feedback) {
            feedback.textContent = data.message || "Verifique seu e-mail.";
            feedback.className = "login-feedback ok";
        }
        label.textContent = "LINK ENVIADO ✓";
    } catch {
        if (feedback) { feedback.textContent = "Erro de conexão. Tente novamente."; feedback.className = "login-feedback erro"; }
        btn.disabled = false;
        label.textContent = "ENVIAR LINK DE RECUPERAÇÃO";
    }
}