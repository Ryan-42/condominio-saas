import { state } from "./state.js";

export function escHTML(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function getToken() {
  const token = sessionStorage.getItem("token");
  if (!token) { window.location.href = "login.html"; return null; }
  return token;
}

export function getUsuario() {
  const raw = sessionStorage.getItem("usuario");
  return raw ? JSON.parse(raw) : null;
}

export async function logout() {
  if (state._clockInterval)  clearInterval(state._clockInterval);
  if (state._uptimeInterval) clearInterval(state._uptimeInterval);
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("usuario");
  window.location.href = "login.html";
}

export function _tokenExpirado() {
  const token = sessionStorage.getItem("token");
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

export function iniciarAvisoToken() {
  setInterval(() => {
    if (_tokenExpirado()) { logout(); return; }
    try {
      const payload = JSON.parse(atob(sessionStorage.getItem("token").split(".")[1]));
      const restante = payload.exp * 1000 - Date.now();
      if (restante < 15 * 60 * 1000) {
        window.exibirToast("⚠ Sua sessão expira em menos de 15 minutos.", "erro");
      }
    } catch {}
  }, 60 * 1000);
}

export async function fetchAPI(endpoint, { timeout = 15000 } = {}) {
  const token = getToken();
  if (!token) return;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status === 401) { logout(); return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${res.status} em ${endpoint}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Tempo limite excedido. Verifique a conexão.");
    throw err;
  }
}

export async function postAPI(endpoint, body) {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  if (res.status === 401) { logout(); return; }
  if (res.status === 403) throw new Error("Acesso negado");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Erro ${res.status}`);
  }
  return res.json();
}

export async function putAPI(endpoint, body) {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  "PUT",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  if (res.status === 401) { logout(); return; }
  if (res.status === 403) throw new Error("Acesso negado");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Erro ${res.status}`);
  }
  return res.json();
}

export async function deleteAPI(endpoint) {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  "DELETE",
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (res.status === 401) { logout(); return; }
  if (res.status === 403) throw new Error("Acesso negado");
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}
