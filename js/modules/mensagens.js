import { state } from "../core/state.js";
import { fetchAPI, postAPI } from "../core/api.js";
import { escHTML } from "../core/api.js";
import { exibirToast } from "../ui/notifications.js";

export async function carregarConversasAdmin() {
  if (!state.CONDOMINIO_ID) return;
  const container = document.getElementById("conversas-lista");
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><span class="blink">█</span> CARREGANDO…</div>`;
  try {
    const convs = await fetchAPI(`/chat/conversas?condominio_id=${state.CONDOMINIO_ID}`);

    const totalNaoLidas = convs.reduce((s, c) => s + (c.nao_lidas || 0), 0);
    const navItem = document.querySelector('[data-section="mensagens"]');
    let badge = navItem?.querySelector(".nav-badge");
    if (totalNaoLidas > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "nav-badge";
        badge.style.cssText = "background:var(--red);color:#fff;font-size:9px;border-radius:8px;padding:1px 5px;margin-left:4px;font-family:var(--font-mono)";
        navItem?.appendChild(badge);
      }
      badge.textContent = totalNaoLidas;
    } else if (badge) { badge.remove(); }

    if (!convs.length) {
      container.innerHTML = `<div class="empty-state">Nenhuma conversa ainda.</div>`;
      return;
    }
    container.innerHTML = convs.map((c) => {
      const ativo   = c.morador_id === state._conversaAtivaMoradorId;
      const preview = c.ultima_msg ? (c.ultima_msg.length > 45 ? c.ultima_msg.slice(0, 45) + "…" : c.ultima_msg) : "";
      const hora    = c.ultima_msg_em ? new Date(c.ultima_msg_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
      return `<div onclick="abrirConversa(${c.morador_id},'${escHTML(c.morador_nome || "Morador").replace(/'/g, "\\'")}',true)"
                   style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s;${ativo ? "background:rgba(16,185,129,.08);" : ""}display:flex;flex-direction:column;gap:4px"
                   onmouseover="this.style.background='rgba(16,185,129,.06)'" onmouseout="this.style.background='${ativo ? "rgba(16,185,129,.08)" : "transparent"}'">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <span style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-bright)">${escHTML(c.morador_nome || "Morador")}</span>
          <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);white-space:nowrap">${hora}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <span style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);flex:1">${escHTML(preview)}</span>
          ${c.nao_lidas > 0 ? `<span style="background:var(--red);color:#fff;font-size:9px;border-radius:8px;padding:1px 6px;font-family:var(--font-mono);white-space:nowrap">${c.nao_lidas}</span>` : ""}
        </div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">APTO ${escHTML(c.morador_apto || "—")}</div>
      </div>`;
    }).join("");
  } catch { container.innerHTML = `<div class="empty-state">Erro ao carregar conversas.</div>`; }
}

export async function abrirConversa(moradorId, moradorNome, recarregarLista = false) {
  state._conversaAtivaMoradorId   = moradorId;
  state._conversaAtivaMoradorNome = moradorNome;

  const titulo = document.getElementById("chat-thread-titulo");
  if (titulo) titulo.textContent = moradorNome || "Morador";

  const inputRow = document.getElementById("chat-thread-input-row");
  if (inputRow) inputRow.style.display = "flex";

  document.getElementById("chat-admin-input")?.focus();

  if (recarregarLista) await carregarConversasAdmin();
  await carregarThreadAdmin(moradorId);

  if (state._adminChatPolling) clearInterval(state._adminChatPolling);
  state._adminChatPolling = setInterval(() => carregarThreadAdmin(moradorId, true), 5000);
}

export async function carregarThreadAdmin(moradorId, silencioso = false) {
  if (!state.CONDOMINIO_ID || !moradorId) return;
  const area = document.getElementById("chat-thread-area");
  if (!area) return;
  if (!silencioso) {
    area.innerHTML = `<div class="empty-state" style="margin:auto"><span class="blink">█</span> CARREGANDO…</div>`;
  }
  try {
    const msgs = await fetchAPI(`/chat/mensagens?condominio_id=${state.CONDOMINIO_ID}&morador_id=${moradorId}`);

    const prevCount = parseInt(area.dataset.count || "-1");
    if (silencioso && msgs.length === prevCount) return;
    area.dataset.count = msgs.length;

    if (!msgs.length) {
      area.innerHTML = `<div class="empty-state" style="margin:auto"><div>💬</div>Nenhuma mensagem ainda.</div>`;
      return;
    }
    area.innerHTML = "";
    msgs.forEach((m) => {
      const isMe = m.autor_tipo === "SINDICO";
      const div  = document.createElement("div");
      div.style.cssText = `display:flex;gap:10px;${isMe ? "flex-direction:row-reverse" : ""}`;
      const avatar = document.createElement("div");
      avatar.style.cssText = "width:32px;height:32px;min-width:32px;display:flex;align-items:center;justify-content:center;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.35);border-radius:8px;font-size:.9rem;flex-shrink:0;margin-top:2px";
      avatar.textContent = isMe ? "🏢" : "👤";
      const bubble = document.createElement("div");
      bubble.style.cssText = `max-width:75%;padding:.75rem 1rem;border-radius:10px;font-family:Rajdhani,sans-serif;font-size:.95rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;${isMe ? "background:rgba(6,182,212,.12);border:1px solid rgba(6,182,212,.30);color:var(--text);border-bottom-right-radius:3px" : "background:rgba(3,18,12,.90);border:1px solid rgba(16,185,129,.20);color:var(--lavender);border-bottom-left-radius:3px"}`;
      bubble.textContent = m.conteudo;
      const ts = document.createElement("div");
      ts.style.cssText = "font-size:9px;opacity:.5;margin-top:4px;font-family:var(--font-mono)";
      ts.textContent = new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      bubble.appendChild(ts);
      div.append(avatar, bubble);
      area.appendChild(div);
    });
    area.scrollTop = area.scrollHeight;

    if (silencioso) await carregarConversasAdmin();
  } catch {
    if (!silencioso) area.innerHTML = `<div class="empty-state" style="margin:auto">Erro ao carregar mensagens.</div>`;
  }
}

export async function enviarMsgAdmin() {
  const input = document.getElementById("chat-admin-input");
  const texto = input?.value.trim();
  if (!texto || !state.CONDOMINIO_ID || !state._conversaAtivaMoradorId) return;

  const orig  = input.value;
  input.value = "";
  try {
    await postAPI("/chat/mensagens", {
      conteudo: texto,
      condominio_id: state.CONDOMINIO_ID,
      morador_id: state._conversaAtivaMoradorId,
    });
    await carregarThreadAdmin(state._conversaAtivaMoradorId);
  } catch {
    input.value = orig;
    exibirToast("✖ Erro ao enviar mensagem", "erro");
  }
}
