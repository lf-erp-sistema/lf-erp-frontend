import api from './api.js';
import { showToast, confirmarAcao, pedirInput } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';
const esc = escapeHtml;

function injectApiPublicaStyles() {
  if (document.getElementById('apipubStyles')) return;
  const s = document.createElement('style');
  s.id = 'apipubStyles';
  s.textContent = `
    .apipub-tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); padding-bottom:0; }
    .apipub-tab-btn { padding:10px 18px; border:none; background:none; font-size:13px; font-weight:500; color:var(--text-muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; display:flex; align-items:center; gap:6px; transition:.15s; }
    .apipub-tab-btn.active { color:var(--primary); border-color:var(--primary); }
    .apipub-tab-btn:hover:not(.active) { color:var(--text); }

    .apipub-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
    .apipub-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:48px 20px; text-align:center; color:var(--text-muted); font-size:13px; }
    .apipub-empty i { font-size:2rem; opacity:.25; }
    .apipub-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; }
    .apipub-badge--ok  { background:var(--success-soft); color:var(--success); }
    .apipub-badge--off { background:var(--surface-3); color:var(--text-muted); }
    .apipub-badge--err { background:var(--danger-soft); color:var(--danger); }
    .apipub-info-box { padding:12px 16px; background:var(--surface-2); border-radius:8px; font-size:12px; color:var(--text-muted); display:flex; gap:8px; align-items:flex-start; }

    .apipub-ep-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:10px; }
    .apipub-ep-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; gap:12px; }
    .apipub-ep-eventos { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
    .apipub-ev-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; background:var(--surface-2); border:1px solid var(--border); border-radius:6px; font-size:11px; color:var(--text-muted); }
    .apipub-ep-actions { display:flex; gap:8px; flex-wrap:wrap; }

    .apipub-docs { max-width:720px; }
    .apipub-doc-section { margin-bottom:24px; }
    .apipub-doc-section h3 { font-size:14px; font-weight:700; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px; }
    .apipub-doc-section p { font-size:13px; color:var(--text-muted); margin-bottom:8px; }
    .apipub-doc-section pre { background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:12px; font-size:12px; overflow-x:auto; margin:0; white-space:pre-wrap; }
    .apipub-doc-endpoint { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); flex-wrap:wrap; font-size:13px; }
    .apipub-method { display:inline-flex; align-items:center; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; font-family:monospace; min-width:42px; justify-content:center; }
    .apipub-method--get  { background:#dcfce7; color:#15803d; }
    .apipub-method--post { background:#dbeafe; color:#1d4ed8; }
    .btn-icon.danger:hover { color:var(--danger); }
  `;
  document.head.appendChild(s);
}

function dataBR(d) {
  if (!d) return '—';
  const s = String(d).substring(0, 10);
  const [y, m, dia] = s.split('-');
  return `${dia}/${m}/${y}`;
}

const EVENTOS = [
  { key: 'venda.criada',       label: 'Venda criada',          icon: 'fa-cart-shopping' },
  { key: 'venda.cancelada',    label: 'Venda cancelada',        icon: 'fa-ban' },
  { key: 'pagamento.recebido', label: 'Pagamento recebido',     icon: 'fa-circle-check' },
  { key: 'compra.criada',      label: 'Compra criada',          icon: 'fa-truck' },
  { key: 'estoque.baixo',      label: 'Estoque abaixo do mínimo', icon: 'fa-triangle-exclamation' },
  { key: 'conta_pagar.vencida',label: 'Conta a pagar vencida',  icon: 'fa-calendar-xmark' }
];

const API_BASE = window.LF_ERP_API_URL || 'https://lf-erp-backend.onrender.com';

const ApiPublicaModule = {
  state: {
    tab: 'api-keys',
    chaves: [],
    endpoints: [],
    logs: [],
    loading: false,
    initialized: false
  },

  async init() {
    injectApiPublicaStyles();
    if (!this.state.initialized) {
      this.render();
      this.bindEvents();
      this.state.initialized = true;
    }
    await this.loadTab(this.state.tab);
  },

  async loadTab(tab) {
    if (this.state.loading) return;
    this.state.tab = tab;
    document.querySelectorAll('.apipub-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.state.loading = true;
    try {
      if (tab === 'api-keys')  await this.loadChaves();
      if (tab === 'webhooks')  await this.loadEndpoints();
      if (tab === 'logs')      await this.loadLogs();
      if (tab === 'docs')      this.renderDocs();
    } finally {
      this.state.loading = false;
    }
  },

  // ── API Keys ──────────────────────────────────────────────────────────────

  async loadChaves() {
    const el = document.getElementById('apipubContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 4}).map(() => '<div class="skeleton-line" style="height:36px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/webhooks/api-keys');
      this.state.chaves = data.chaves || [];
      this.renderChaves();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  renderChaves() {
    const el = document.getElementById('apipubContent');
    if (!el) return;

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text-muted);">${this.state.chaves.length} chave(s) cadastrada(s)</div>
        <button class="btn btn-primary btn-sm" id="novaChaveBtn"><i class="fa fa-plus"></i> Nova chave</button>
      </div>
      ${this.state.chaves.length === 0
        ? `<div class="apipub-empty">
             <i class="fa-solid fa-key"></i>
             <strong>Nenhuma chave criada</strong>
             <p>Gere uma chave para integrar sistemas externos via API.</p>
           </div>`
        : `<div class="apipub-table-wrap">
           <table>
             <thead><tr><th>Nome</th><th>Prefixo</th><th>Último uso</th><th>Status</th><th></th></tr></thead>
             <tbody>
               ${this.state.chaves.map((k) => `
                 <tr>
                   <td><strong>${esc(k.nome)}</strong></td>
                   <td><code style="font-size:12px;">${esc(k.key_prefix)}</code></td>
                   <td style="font-size:12px;color:var(--text-muted);">${k.ultimo_uso ? dataBR(k.ultimo_uso) : '—'}</td>
                   <td><span class="apipub-badge ${k.ativo ? 'apipub-badge--ok' : 'apipub-badge--off'}">${k.ativo ? 'Ativa' : 'Revogada'}</span></td>
                   <td>${k.ativo ? `<button class="btn-icon danger" data-del-key="${k.id}" title="Revogar"><i class="fa fa-ban"></i></button>` : ''}</td>
                 </tr>`).join('')}
             </tbody>
           </table>
           </div>`
      }
      <div class="apipub-info-box" style="margin-top:16px;">
        <i class="fa fa-circle-info"></i>
        Envie o token no header <code>X-Api-Key: lferp_...</code> em toda requisição. O token completo é exibido <strong>apenas na criação</strong>.
      </div>
    `;

    document.getElementById('novaChaveBtn')?.addEventListener('click', () => this.criarChave());
    el.querySelectorAll('[data-del-key]').forEach((btn) => {
      btn.addEventListener('click', () => this.revogarChave(btn.dataset.delKey));
    });
  },

  async criarChave() {
    const nome = await pedirInput('Nome da chave (ex: Integração Site, App Mobile):');
    if (!nome?.trim()) return;
    try {
      const data = await api.fetchAPI('/webhooks/api-keys', 'POST', { nome });
      // Exibe o token em modal (única vez)
      this.mostrarTokenUnico(data.token);
      await this.loadChaves();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  mostrarTokenUnico(token) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;';
    div.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:28px;max-width:500px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <h3 style="margin:0 0 8px;font-size:16px;font-weight:700;color:var(--success);">
          <i class="fa fa-circle-check"></i> Chave gerada com sucesso!
        </h3>
        <p style="font-size:13px;color:var(--danger);margin-bottom:16px;">
          <strong>Atenção:</strong> este token não será exibido novamente. Copie agora.
        </p>
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;font-family:monospace;font-size:13px;word-break:break-all;margin-bottom:16px;">${esc(token)}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="copiarTokenBtn" class="btn btn-primary btn-sm"><i class="fa fa-copy"></i> Copiar</button>
          <button id="fecharTokenBtn" class="btn btn-secondary btn-sm">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(div);
    const fechar = () => { div.remove(); document.removeEventListener('keydown', escHandler); };
    const escHandler = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', escHandler);
    div.querySelector('#copiarTokenBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(token).then(() => showToast('Token copiado!', 'success'));
    });
    div.querySelector('#fecharTokenBtn').addEventListener('click', fechar);
    div.addEventListener('click', (e) => { if (e.target === div) fechar(); });
  },

  async revogarChave(id) {
    const ok = await confirmarAcao('Revogar esta chave de API? Esta ação não pode ser desfeita.');
    if (!ok) return;
    try {
      await api.fetchAPI(`/webhooks/api-keys/${id}`, 'DELETE');
      showToast('Chave revogada', 'success');
      await this.loadChaves();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  // ── Webhooks ──────────────────────────────────────────────────────────────

  async loadEndpoints() {
    const el = document.getElementById('apipubContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:80px;margin-bottom:10px;border-radius:12px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/webhooks/endpoints');
      this.state.endpoints = data.endpoints || [];
      this.renderEndpoints();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  renderEndpoints() {
    const el = document.getElementById('apipubContent');
    if (!el) return;

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text-muted);">${this.state.endpoints.length} endpoint(s) registrado(s)</div>
        <button class="btn btn-primary btn-sm" id="novoEpBtn"><i class="fa fa-plus"></i> Novo endpoint</button>
      </div>
      ${this.state.endpoints.length === 0
        ? `<div class="apipub-empty">
             <i class="fa-solid fa-bolt"></i>
             <strong>Nenhum webhook configurado</strong>
             <p>Registre uma URL para receber notificações em tempo real.</p>
           </div>`
        : this.state.endpoints.map((ep) => `
            <div class="apipub-ep-card">
              <div class="apipub-ep-head">
                <div>
                  <div style="font-weight:600;font-size:14px;">${esc(ep.nome)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;word-break:break-all;">${esc(ep.url)}</div>
                </div>
                <span class="apipub-badge ${ep.ativo ? 'apipub-badge--ok' : 'apipub-badge--off'}">${ep.ativo ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div class="apipub-ep-eventos">
                ${(ep.eventos || []).map((e) => {
                  const ev = EVENTOS.find((x) => x.key === e);
                  return `<span class="apipub-ev-badge"><i class="fa ${ev?.icon || 'fa-bolt'}"></i> ${ev?.label || e}</span>`;
                }).join('')}
              </div>
              <div class="apipub-ep-actions">
                <button class="btn btn-secondary btn-sm" data-teste-ep="${ep.id}"><i class="fa fa-flask"></i> Testar</button>
                <button class="btn btn-secondary btn-sm" data-toggle-ep="${ep.id}" data-ativo="${ep.ativo}">
                  <i class="fa ${ep.ativo ? 'fa-pause' : 'fa-play'}"></i> ${ep.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button class="btn-icon danger" data-del-ep="${ep.id}" title="Remover"><i class="fa fa-trash"></i></button>
              </div>
            </div>`).join('')
      }
      <div id="novoEpForm" style="display:none;" class="apipub-ep-card">
        <h4 style="margin:0 0 16px;font-size:14px;font-weight:700;">Novo endpoint</h4>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Nome</label>
            <input id="epNome" class="filter-input" style="width:100%;box-sizing:border-box;" placeholder="Ex: Notificação ERP integrado"></div>
          <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">URL</label>
            <input id="epUrl" class="filter-input" style="width:100%;box-sizing:border-box;" placeholder="https://meusite.com/webhook"></div>
          <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Eventos</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${EVENTOS.map((e) => `
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" class="ep-evento-check" value="${e.key}"> ${e.label}
                </label>`).join('')}
            </div>
          </div>
          <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Secret HMAC (opcional)</label>
            <input id="epSecret" class="filter-input" style="width:100%;box-sizing:border-box;" placeholder="Chave secreta para verificar assinatura"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm" id="cancelarEpBtn">Cancelar</button>
            <button class="btn btn-primary btn-sm" id="salvarEpBtn">Salvar endpoint</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('novoEpBtn')?.addEventListener('click', () => {
      document.getElementById('novoEpForm').style.display = 'block';
      document.getElementById('novoEpBtn').style.display  = 'none';
    });
    document.getElementById('cancelarEpBtn')?.addEventListener('click', () => {
      document.getElementById('novoEpForm').style.display = 'none';
      document.getElementById('novoEpBtn').style.display  = '';
    });
    document.getElementById('salvarEpBtn')?.addEventListener('click', () => this.salvarEndpoint());

    el.querySelectorAll('[data-teste-ep]').forEach((btn) => {
      btn.addEventListener('click', () => this.testarEndpoint(btn.dataset.testeEp));
    });
    el.querySelectorAll('[data-toggle-ep]').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleEndpoint(btn.dataset.toggleEp, btn.dataset.ativo === 'true'));
    });
    el.querySelectorAll('[data-del-ep]').forEach((btn) => {
      btn.addEventListener('click', () => this.deletarEndpoint(btn.dataset.delEp));
    });
  },

  async salvarEndpoint() {
    const nome    = document.getElementById('epNome')?.value.trim();
    const url     = document.getElementById('epUrl')?.value.trim();
    const secret  = document.getElementById('epSecret')?.value.trim();
    const eventos = [...document.querySelectorAll('.ep-evento-check:checked')].map((c) => c.value);

    if (!nome || !url)          { showToast('Nome e URL são obrigatórios', 'error'); return; }
    if (eventos.length === 0)   { showToast('Selecione ao menos um evento', 'error'); return; }

    const btn = document.getElementById('salvarEpBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...'; }
    try {
      await api.fetchAPI('/webhooks/endpoints', 'POST', { nome, url, eventos, secret: secret || null });
      showToast('Endpoint criado!', 'success');
      await this.loadEndpoints();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-save"></i> Salvar endpoint'; }
    }
  },

  async testarEndpoint(id) {
    try {
      const data = await api.fetchAPI(`/webhooks/endpoints/${id}/teste`, 'POST');
      showToast(data.mensagem || 'Teste enviado!', 'success');
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  async toggleEndpoint(id, ativo) {
    try {
      await api.fetchAPI(`/webhooks/endpoints/${id}`, 'PUT', { ativo: !ativo });
      await this.loadEndpoints();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  async deletarEndpoint(id) {
    const ok = await confirmarAcao('Remover este endpoint?');
    if (!ok) return;
    try {
      await api.fetchAPI(`/webhooks/endpoints/${id}`, 'DELETE');
      showToast('Endpoint removido', 'success');
      await this.loadEndpoints();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  // ── Logs ──────────────────────────────────────────────────────────────────

  async loadLogs() {
    const el = document.getElementById('apipubContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 5}).map(() => '<div class="skeleton-line" style="height:36px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/webhooks/logs');
      this.state.logs = data.logs || [];
      this.renderLogs();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  renderLogs() {
    const el = document.getElementById('apipubContent');
    if (!el) return;

    if (!this.state.logs.length) {
      el.innerHTML = `<div class="apipub-empty">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <strong>Nenhuma entrega registrada ainda</strong>
        <p>As entregas de webhooks aparecerão aqui após os primeiros eventos.</p>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div class="apipub-table-wrap">
        <table>
          <thead><tr><th>Evento</th><th>Endpoint</th><th>HTTP</th><th>Status</th><th>Tentativa</th><th>Data</th><th>Erro</th></tr></thead>
          <tbody>
            ${this.state.logs.map((l) => `
              <tr>
                <td><code style="font-size:11px;">${esc(l.evento)}</code></td>
                <td style="font-size:12px;">${esc(l.endpoint_nome)}</td>
                <td style="text-align:center;">${l.status_http || '—'}</td>
                <td><span class="apipub-badge ${l.sucesso ? 'apipub-badge--ok' : 'apipub-badge--err'}">${l.sucesso ? 'OK' : 'Falha'}</span></td>
                <td style="text-align:center;">${l.tentativa}</td>
                <td style="font-size:11px;color:var(--text-muted);">${new Date(l.criado_em).toLocaleString('pt-BR')}</td>
                <td style="font-size:11px;color:var(--danger);">${esc(l.erro || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  // ── Documentação ──────────────────────────────────────────────────────────

  renderDocs() {
    const el = document.getElementById('apipubContent');
    if (!el) return;
    const base = `${API_BASE}/api/v1`;

    el.innerHTML = `
      <div class="apipub-docs">
        <div class="apipub-doc-section">
          <h3>Autenticação</h3>
          <p>Todas as requisições (exceto <code>GET /status</code>) exigem o header:</p>
          <pre>X-Api-Key: lferp_seu_token_aqui</pre>
        </div>

        <div class="apipub-doc-section">
          <h3>Base URL</h3>
          <pre>${esc(base)}</pre>
        </div>

        <div class="apipub-doc-section">
          <h3>Endpoints disponíveis</h3>
          ${[
            { method: 'GET',  path: '/status',       desc: 'Health check (sem auth)', exemplo: '' },
            { method: 'GET',  path: '/produtos',      desc: 'Listar produtos. Params: busca, categoria, page, limit', exemplo: '?page=1&limit=50' },
            { method: 'GET',  path: '/produtos/:id',  desc: 'Detalhe de produto com grades', exemplo: '' },
            { method: 'GET',  path: '/clientes',      desc: 'Listar clientes. Params: busca, page, limit', exemplo: '' },
            { method: 'GET',  path: '/clientes/:id',  desc: 'Detalhe de cliente com saldo em aberto', exemplo: '' },
            { method: 'GET',  path: '/vendas',        desc: 'Listar vendas. Params: inicio, fim, status, page, limit', exemplo: '?inicio=2026-01-01&fim=2026-01-31' },
            { method: 'POST', path: '/vendas',        desc: 'Criar venda. Body: { cliente_nome, itens:[{produto_id,quantidade,preco_unitario}], pagamento, total }', exemplo: '' },
            { method: 'GET',  path: '/estoque',       desc: 'Saldo de estoque. Params: abaixo_minimo=true, page, limit', exemplo: '' }
          ].map((e) => `
            <div class="apipub-doc-endpoint">
              <span class="apipub-method apipub-method--${e.method.toLowerCase()}">${e.method}</span>
              <code>${esc(e.path)}${e.exemplo ? `<span style="color:var(--text-muted)">${esc(e.exemplo)}</span>` : ''}</code>
              <span style="font-size:12px;color:var(--text-muted);">${e.desc}</span>
            </div>`).join('')}
        </div>

        <div class="apipub-doc-section">
          <h3>Webhooks — verificação de assinatura</h3>
          <p>Cada entrega inclui o header <code>X-LF-Signature: sha256=HASH</code>. Para verificar:</p>
          <pre>const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SEU_SECRET).update(rawBody).digest('hex');
if (sig !== req.headers['x-lf-signature'].replace('sha256=','')) {
  return res.status(401).send('Assinatura inválida');
}</pre>
        </div>
      </div>
    `;
  },

  // ── Estrutura principal ───────────────────────────────────────────────────

  render() {
    const c = document.getElementById('apiPublicaContainer');
    if (!c) return;

    c.innerHTML = `
      <div class="apipub-tabs">
        <button class="apipub-tab-btn active" data-tab="api-keys"><i class="fa fa-key"></i> API Keys</button>
        <button class="apipub-tab-btn"        data-tab="webhooks"><i class="fa fa-bolt"></i> Webhooks</button>
        <button class="apipub-tab-btn"        data-tab="logs"><i class="fa fa-clock-rotate-left"></i> Logs</button>
        <button class="apipub-tab-btn"        data-tab="docs"><i class="fa fa-book"></i> Documentação</button>
      </div>
      <div id="apipubContent" style="margin-top:20px;"></div>
    `;
  },

  bindEvents() {
    document.getElementById('apiPublicaContainer')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.apipub-tab-btn');
      if (btn) this.loadTab(btn.dataset.tab);
    });
  },

};

export async function initApiPublicaModule() {
  return ApiPublicaModule.init();
}

export default ApiPublicaModule;
