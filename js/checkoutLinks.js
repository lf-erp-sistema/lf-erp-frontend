import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';
const esc = escapeHtml;

function moeda(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function dataBR(d) { if (!d) return '—'; const [y,m,dia]=String(d).substring(0,10).split('-'); return `${dia}/${m}/${y}`; }

function injectCheckoutLinksStyles() {
  if (document.getElementById('chkStyles')) return;
  const s = document.createElement('style');
  s.id = 'chkStyles';
  s.textContent = `
    .chk-tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); }
    .chk-tab-btn { padding:10px 16px; border:none; background:none; font-size:13px; font-weight:500; color:var(--text-muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; display:flex; align-items:center; gap:6px; transition:.15s; }
    .chk-tab-btn.active { color:var(--primary); border-color:var(--primary); }
    .chk-tab-btn:hover:not(.active) { color:var(--text); }

    .chk-kpis { display:flex; gap:12px; flex-wrap:wrap; }
    .chk-kpi { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 20px; flex:1; min-width:130px; }
    .chk-kpi--gold { border-color:#fcd34d; }
    .chk-kpi--warn { border-color:#fca5a5; }
    .chk-kpi-label { font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.4px; margin-bottom:4px; }
    .chk-kpi-val { font-size:1.4rem; font-weight:700; }
    .chk-kpi--gold .chk-kpi-val { color:#b45309; }
    .chk-kpi-sub { font-size:11px; color:var(--text-muted); margin-top:2px; }

    .chk-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .chk-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
    .chk-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:48px 20px; text-align:center; color:var(--text-muted); font-size:13px; }
    .chk-empty i { font-size:2rem; opacity:.25; }

    .chk-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; }
    .chk-badge--pendente  { background:var(--warning-soft); color:var(--warning); }
    .chk-badge--pago      { background:var(--success-soft); color:var(--success); }
    .chk-badge--expirado  { background:var(--surface-3);    color:var(--text-muted); }
    .chk-badge--cancelado { background:var(--danger-soft);  color:var(--danger); }

    .chk-form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .chk-form-group { display:flex; flex-direction:column; gap:5px; }
    .chk-form-group--full { grid-column:1/-1; }
    .chk-form-group label { font-size:12px; font-weight:600; color:var(--text-muted); }

    .chk-link-gerado { background:var(--success-soft); border:1px solid #86efac; border-radius:14px; padding:20px; text-align:center; margin-top:16px; }
    .chk-link-url { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-size:12px; font-family:monospace; word-break:break-all; margin:10px 0; color:var(--text); }

    .btn-icon.danger:hover { color:var(--danger); }
    .text-right { text-align:right; }
    @media(max-width:480px) { .chk-form-row { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(s);
}

const FRONTEND_BASE = window.location.origin;

const STATUS = {
  pendente:  { label: 'Aguardando',  bg: 'var(--warning-soft)', cor: 'var(--warning)' },
  pago:      { label: 'Pago',        bg: 'var(--success-soft)', cor: 'var(--success)' },
  expirado:  { label: 'Expirado',    bg: 'var(--surface-3)',    cor: 'var(--text-muted)' },
  cancelado: { label: 'Cancelado',   bg: 'var(--danger-soft)',  cor: 'var(--danger)' }
};

const CheckoutLinksModule = {
  state: {
    tab: 'links',
    links: [],
    dashboard: null,
    loading: false,
    initialized: false
  },

  async init() {
    injectCheckoutLinksStyles();
    if (!this.state.initialized) {
      this.render();
      this.bindTabEvents();
      this.state.initialized = true;
    }
    await this.loadTab('links');
  },

  async loadTab(tab) {
    if (this.state.loading) return;
    this.state.tab = tab;
    document.querySelectorAll('.chk-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.state.loading = true;
    try {
      if (tab === 'links')  await this.loadLinks();
      if (tab === 'criar')  this.renderCriar();
      if (tab === 'stats')  await this.loadStats();
    } finally {
      this.state.loading = false;
    }
  },

  // ── Estatísticas ──────────────────────────────────────────────────────────

  async loadStats() {
    const el = document.getElementById('chkContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:80px;margin-bottom:10px;border-radius:12px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/checkout/dashboard');
      this.state.dashboard = data;
      this.renderStats(data);
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  renderStats(d) {
    const el = document.getElementById('chkContent');
    if (!el) return;

    el.innerHTML = `
      <div class="chk-kpis">
        <div class="chk-kpi chk-kpi--gold">
          <div class="chk-kpi-label">Recebido</div>
          <div class="chk-kpi-val">${moeda(d.total_recebido)}</div>
          <div class="chk-kpi-sub">${d.pagos} pago${d.pagos !== 1 ? 's' : ''}</div>
        </div>
        <div class="chk-kpi">
          <div class="chk-kpi-label">Pendente</div>
          <div class="chk-kpi-val">${moeda(d.total_pendente)}</div>
          <div class="chk-kpi-sub">${d.pendentes} link${d.pendentes !== 1 ? 's' : ''}</div>
        </div>
        <div class="chk-kpi ${d.expirados > 0 ? 'chk-kpi--warn' : ''}">
          <div class="chk-kpi-label">Expirados</div>
          <div class="chk-kpi-val">${d.expirados}</div>
        </div>
      </div>
    `;
  },

  // ── Lista de links ────────────────────────────────────────────────────────

  async loadLinks() {
    const el = document.getElementById('chkContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 4}).map(() => '<div class="skeleton-line" style="height:36px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/checkout');
      this.state.links = data.links || [];
      this.renderLinks();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  renderLinks() {
    const el = document.getElementById('chkContent');
    if (!el) return;

    el.innerHTML = `
      <div class="chk-toolbar">
        <span style="font-size:13px;color:var(--text-muted);">${this.state.links.length} link(s)</span>
        <button class="btn btn-primary btn-sm" id="chkNovoBtn"><i class="fa fa-plus"></i> Novo link</button>
      </div>
      ${this.state.links.length === 0
        ? `<div class="chk-empty">
             <i class="fa-solid fa-link"></i>
             <strong>Nenhum link criado ainda</strong>
             <p>Crie um link de pagamento e compartilhe pelo WhatsApp ou Instagram.</p>
           </div>`
        : `<div class="chk-table-wrap"><table>
            <thead><tr><th>Descrição</th><th>Cliente</th><th class="text-right">Valor</th><th>Status</th><th>Expira</th><th>Criado</th><th></th></tr></thead>
            <tbody>
              ${this.state.links.map((l) => {
                const st = STATUS[l.status] || STATUS.pendente;
                return `<tr>
                  <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(l.descricao)}">
                    <strong>${esc(l.descricao)}</strong>
                  </td>
                  <td style="font-size:12px;color:var(--text-muted);">${esc(l.cliente_nome || '—')}</td>
                  <td class="text-right"><strong>${moeda(l.valor)}</strong></td>
                  <td><span class="chk-badge chk-badge--${l.status || 'pendente'}">${st.label}</span></td>
                  <td style="font-size:12px;color:var(--text-muted);">${dataBR(l.expira_em)}</td>
                  <td style="font-size:12px;color:var(--text-muted);">${dataBR(l.criado_em)}</td>
                  <td>
                    <button class="btn-icon" data-copy-token="${esc(l.token)}" title="Copiar link"><i class="fa fa-copy"></i></button>
                    <button class="btn-icon" data-open-token="${esc(l.token)}" title="Abrir checkout"><i class="fa fa-external-link"></i></button>
                    ${l.status === 'pendente' ? `
                      <button class="btn-icon" data-pago-id="${l.id}" title="Marcar como pago"><i class="fa fa-check"></i></button>
                      <button class="btn-icon danger" data-cancel-id="${l.id}" title="Cancelar"><i class="fa fa-ban"></i></button>
                    ` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
           </table></div>`
      }
    `;

    document.getElementById('chkNovoBtn')?.addEventListener('click', () => this.loadTab('criar'));

    el.querySelectorAll('[data-copy-token]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = `${FRONTEND_BASE}/checkout.html#${btn.dataset.copyToken}`;
        navigator.clipboard.writeText(url).then(() => showToast('Link copiado!', 'success'));
      });
    });
    el.querySelectorAll('[data-open-token]').forEach((btn) => {
      btn.addEventListener('click', () => window.open(`${FRONTEND_BASE}/checkout.html#${btn.dataset.openToken}`, '_blank'));
    });
    el.querySelectorAll('[data-pago-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.marcarPago(btn.dataset.pagoId));
    });
    el.querySelectorAll('[data-cancel-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.cancelar(btn.dataset.cancelId));
    });
  },

  async marcarPago(id) {
    const ok = await confirmarAcao('Marcar este link como pago manualmente?');
    if (!ok) return;
    try {
      await api.fetchAPI(`/checkout/${id}/pago`, 'PATCH', { metodo: 'manual' });
      showToast('Marcado como pago!', 'success');
      await this.loadLinks();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  async cancelar(id) {
    const ok = await confirmarAcao('Cancelar este link? Ele não poderá mais ser usado.');
    if (!ok) return;
    try {
      await api.fetchAPI(`/checkout/${id}/cancelar`, 'PATCH');
      showToast('Link cancelado', 'success');
      await this.loadLinks();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  // ── Criar link ────────────────────────────────────────────────────────────

  renderCriar() {
    const el = document.getElementById('chkContent');
    if (!el) return;

    el.innerHTML = `
      <div style="max-width:480px;">
        <form id="chkCriarForm" autocomplete="off" style="display:flex;flex-direction:column;gap:14px;">
          <div class="chk-form-group chk-form-group--full">
            <label>Descrição da cobrança *</label>
            <input id="chkDesc" class="filter-input" required placeholder="Ex: Produto X, Serviço Y, Mensalidade...">
          </div>
          <div class="chk-form-row">
            <div class="chk-form-group">
              <label>Valor (R$) *</label>
              <input id="chkValor" class="filter-input" type="number" step="0.01" min="0.01" required placeholder="0,00">
            </div>
            <div class="chk-form-group">
              <label>Validade (dias, 0 = sem)</label>
              <input id="chkValidade" class="filter-input" type="number" min="0" value="7">
            </div>
          </div>
          <div class="chk-form-row">
            <div class="chk-form-group">
              <label>Nome do cliente (opcional)</label>
              <input id="chkNome" class="filter-input" placeholder="Para preencher o boleto">
            </div>
            <div class="chk-form-group">
              <label>Telefone (opcional)</label>
              <input id="chkTelefone" class="filter-input" placeholder="Para cobrar via WhatsApp">
            </div>
          </div>
          <div class="chk-form-group chk-form-group--full">
            <label>Observações (não exibidas no checkout)</label>
            <textarea id="chkObs" class="filter-input" rows="2" style="resize:vertical;"></textarea>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-secondary btn-sm" id="chkCancelarBtn">Voltar</button>
            <button type="submit" class="btn btn-primary btn-sm"><i class="fa fa-link"></i> Gerar link</button>
          </div>
        </form>
        <div id="chkResultado"></div>
      </div>
    `;

    setTimeout(() => document.getElementById('chkDesc')?.focus(), 50);

    document.getElementById('chkCancelarBtn')?.addEventListener('click', () => this.loadTab('links'));
    document.getElementById('chkCriarForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.criarLink();
    });
  },

  async criarLink() {
    const payload = {
      descricao:       document.getElementById('chkDesc').value.trim(),
      valor:           parseFloat(document.getElementById('chkValor').value),
      validade_dias:   parseInt(document.getElementById('chkValidade').value) || 0,
      cliente_nome:    document.getElementById('chkNome').value.trim() || null,
      cliente_telefone: document.getElementById('chkTelefone').value.trim() || null,
      observacoes:     document.getElementById('chkObs').value.trim() || null
    };

    if (!payload.descricao || !payload.valor) { showToast('Preencha descrição e valor', 'error'); return; }

    const submitBtn = document.querySelector('#chkCriarForm [type=submit]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Gerando...'; }
    try {
      const data = await api.fetchAPI('/checkout', 'POST', payload);
      const url  = `${FRONTEND_BASE}/checkout.html#${data.link.token}`;

      const resultado = document.getElementById('chkResultado');
      resultado.innerHTML = `
        <div class="chk-link-gerado">
          <i class="fa fa-circle-check" style="font-size:24px;color:var(--success);display:block;margin-bottom:10px;"></i>
          <strong>Link criado com sucesso!</strong>
          <div class="chk-link-url" id="chkLinkUrl">${esc(url)}</div>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
            <button class="btn btn-primary btn-sm" id="chkCopiarBtn">
              <i class="fa fa-copy"></i> Copiar link
            </button>
            <button class="btn btn-secondary btn-sm" id="chkAbrirBtn">
              <i class="fa fa-external-link"></i> Abrir
            </button>
          </div>
        </div>`;

      document.getElementById('chkCopiarBtn')?.addEventListener('click', (e) => {
        navigator.clipboard.writeText(url).then(() => {
          e.currentTarget.innerHTML = '<i class="fa fa-check"></i> Copiado!';
          setTimeout(() => { e.currentTarget.innerHTML = '<i class="fa fa-copy"></i> Copiar link'; }, 2000);
        });
      });
      document.getElementById('chkAbrirBtn')?.addEventListener('click', () => window.open(url, '_blank'));
      setTimeout(() => document.getElementById('chkCopiarBtn')?.focus(), 50);

      showToast('Link gerado! Compartilhe com o cliente.', 'success');
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa fa-link"></i> Gerar link'; }
    }
  },

  // ── Estrutura ─────────────────────────────────────────────────────────────

  render() {
    const c = document.getElementById('checkoutLinksContainer');
    if (!c) return;
    c.innerHTML = `
      <div class="chk-tabs">
        <button class="chk-tab-btn active" data-tab="links"><i class="fa fa-link"></i> Links</button>
        <button class="chk-tab-btn" data-tab="criar"><i class="fa fa-plus"></i> Criar link</button>
        <button class="chk-tab-btn" data-tab="stats"><i class="fa fa-chart-bar"></i> Estatísticas</button>
      </div>
      <div id="chkContent" style="margin-top:20px;"></div>
    `;
  },

  bindTabEvents() {
    document.getElementById('checkoutLinksContainer')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.chk-tab-btn');
      if (btn) this.loadTab(btn.dataset.tab);
    });
  },

};

export async function initCheckoutLinksModule() {
  return CheckoutLinksModule.init();
}

export default CheckoutLinksModule;
