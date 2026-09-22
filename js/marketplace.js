import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';
const esc = escapeHtml;

function injectMarketplaceStyles() {
  if (document.getElementById('mktStyles')) return;
  const s = document.createElement('style');
  s.id = 'mktStyles';
  s.textContent = `
    .mkt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .mkt-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .mkt-card__head { display: flex; align-items: center; gap: 12px; }
    .mkt-card__logo { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
    .mkt-card__logo.ml { background: #ffe600; }
    .mkt-card__logo.shopee { background: #ee4d2d; color: #fff; }
    .mkt-card__name { font-weight: 600; font-size: 15px; }
    .mkt-card__actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .mkt-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .mkt-badge.conectado { background: var(--success-soft); color: var(--success); }
    .mkt-badge.desconectado { background: var(--surface-3); color: var(--text-muted); }
    .mkt-badge.em-breve { background: var(--warning-soft); color: var(--warning); }
    .mkt-section-title { font-size: 14px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 12px; }
    .mkt-table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .mkt-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .mkt-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 20px; text-align: center; color: var(--text-muted); font-size: 13px; }
    .mkt-empty i { font-size: 2rem; opacity: .25; }
    .btn-icon { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px 6px; border-radius: 6px; transition: .15s; }
    .btn-icon:hover { background: var(--surface-2); color: var(--text); }
    .btn-icon.danger:hover { color: var(--danger); }
  `;
  document.head.appendChild(s);
}

const MarketplaceModule = {
  state: {
    plataformas: [],
    produtos: [],
    loading: false,
    initialized: false
  },

  _escConfig: null,
  _escVincular: null,

  async init() {
    injectMarketplaceStyles();
    if (!this.state.initialized) {
      this.render();
      this.bindEvents();
      this.state.initialized = true;
    }
    await this.load();
  },

  async load() {
    if (this.state.loading) return;
    this.state.loading = true;
    const skl = Array.from({length: 2}).map(() => '<div class="skeleton-line" style="height:100px;margin-bottom:10px;border-radius:12px"></div>').join('');
    const grid = document.getElementById('mktPlataformasGrid');
    const wrap = document.getElementById('mktProdutosWrap');
    if (grid) grid.innerHTML = `<div class="module-skeleton" style="padding:0">${skl}</div>`;
    if (wrap) wrap.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:36px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const [cfgData, prodData] = await Promise.all([
        api.fetchAPI('/marketplace/config'),
        api.fetchAPI('/marketplace/produtos')
      ]);
      this.state.plataformas = cfgData.plataformas || [];
      this.state.produtos     = prodData.produtos    || [];
      this.renderPlataformas();
      this.renderProdutos();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      this.state.loading = false;
    }
  },

  render() {
    const c = document.getElementById('marketplaceContainer');
    if (!c) return;
    c.innerHTML = `
      <div class="mkt-grid" id="mktPlataformasGrid"></div>

      <div class="mkt-section-title">Produtos Vinculados</div>
      <div class="mkt-table-wrap">
        <div class="mkt-toolbar">
          <span id="mktProdCount" style="font-size:13px;color:var(--text-muted)">—</span>
          <button class="btn btn-primary btn-sm" id="mktVincularBtn">
            <i class="fa fa-link"></i> Vincular produto
          </button>
        </div>
        <div id="mktProdutosWrap"></div>
      </div>

      <!-- Modal configurar plataforma -->
      <div id="mktConfigModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center;">
        <div style="background:var(--surface);border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.3);">
          <h3 id="mktConfigModalTitle" style="margin:0 0 20px;font-size:16px;font-weight:700;">Configurar plataforma</h3>
          <form id="mktConfigForm">
            <input type="hidden" id="mktCfgPlataforma">
            <div style="margin-bottom:14px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;">App ID / Client ID</label>
              <input id="mktCfgAppId" class="filter-input" style="width:100%;box-sizing:border-box;" placeholder="Cole o App ID aqui">
            </div>
            <div style="margin-bottom:20px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;">Client Secret</label>
              <input id="mktCfgSecret" class="filter-input" style="width:100%;box-sizing:border-box;" placeholder="Cole o Client Secret (ou *** para manter)">
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button type="button" class="btn btn-secondary btn-sm" id="mktConfigCancelBtn">Cancelar</button>
              <button type="submit" class="btn btn-primary btn-sm" id="mktConfigSaveBtn">Salvar</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal vincular produto -->
      <div id="mktVincularModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center;">
        <div style="background:var(--surface);border-radius:16px;padding:28px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.3);">
          <h3 style="margin:0 0 20px;font-size:16px;font-weight:700;">Vincular produto</h3>
          <form id="mktVincularForm">
            <div style="margin-bottom:14px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;">Produto</label>
              <select id="mktVincProduto" class="filter-input" style="width:100%;box-sizing:border-box;" required>
                <option value="">Selecione o produto...</option>
              </select>
            </div>
            <div style="margin-bottom:14px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;">Plataforma</label>
              <select id="mktVincPlataforma" class="filter-input" style="width:100%;box-sizing:border-box;" required>
                <option value="">Selecione...</option>
                <option value="mercadolivre">Mercado Livre</option>
              </select>
            </div>
            <div style="margin-bottom:14px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;">Listing ID (ID do anúncio)</label>
              <input id="mktVincListingId" class="filter-input" style="width:100%;box-sizing:border-box;" placeholder="Ex: MLB123456789" required>
            </div>
            <div style="margin-bottom:20px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;">Título do anúncio (opcional)</label>
              <input id="mktVincTitulo" class="filter-input" style="width:100%;box-sizing:border-box;" placeholder="Título para referência interna">
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button type="button" class="btn btn-secondary btn-sm" id="mktVincCancelBtn">Cancelar</button>
              <button type="submit" class="btn btn-primary btn-sm">Salvar vínculo</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  renderPlataformas() {
    const grid = document.getElementById('mktPlataformasGrid');
    if (!grid) return;

    const plataformasConf = {
      mercadolivre: { label: 'Mercado Livre', icon: '🛒', logoClass: 'ml', suporte: true },
      shopee:       { label: 'Shopee',         icon: '🛍',  logoClass: 'shopee', suporte: false }
    };

    const cfgMap = {};
    for (const p of this.state.plataformas) cfgMap[p.plataforma] = p;

    grid.innerHTML = Object.entries(plataformasConf).map(([key, meta]) => {
      const cfg = cfgMap[key];
      const conectado = cfg?.status_conexao === 'conectado';
      const badgeClass = !meta.suporte ? 'em-breve' : (conectado ? 'conectado' : 'desconectado');
      const badgeLabel = !meta.suporte ? 'Em breve' : (conectado ? 'Conectado' : 'Desconectado');
      const badgeIcon  = !meta.suporte ? '⏳' : (conectado ? '●' : '○');

      return `
        <div class="mkt-card">
          <div class="mkt-card__head">
            <div class="mkt-card__logo ${meta.logoClass}">${meta.icon}</div>
            <div>
              <div class="mkt-card__name">${meta.label}</div>
              <span class="mkt-badge ${badgeClass}">${badgeIcon} ${badgeLabel}</span>
            </div>
          </div>
          ${cfg?.token_expires_at && conectado ? `<div style="font-size:11px;color:var(--text-muted)"><i class="fa fa-clock"></i> Token expira: ${new Date(cfg.token_expires_at).toLocaleString('pt-BR')}</div>` : ''}
          ${meta.suporte ? `
          <div class="mkt-card__actions">
            <button class="btn btn-secondary btn-sm" data-cfg-plataforma="${key}">
              <i class="fa fa-gear"></i> Configurar
            </button>
            ${cfg?.app_id ? `
            <button class="btn btn-primary btn-sm" data-oauth-plataforma="${key}">
              <i class="fa fa-plug"></i> ${conectado ? 'Reconectar' : 'Conectar OAuth'}
            </button>` : ''}
          </div>` : `<p style="font-size:12px;color:var(--text-muted);margin:0;">Integração disponível em breve.</p>`}
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-cfg-plataforma]').forEach((btn) => {
      btn.addEventListener('click', () => this.abrirModalConfig(btn.dataset.cfgPlataforma));
    });
    grid.querySelectorAll('[data-oauth-plataforma]').forEach((btn) => {
      btn.addEventListener('click', () => this.iniciarOAuth(btn.dataset.oauthPlataforma));
    });
  },

  renderProdutos() {
    const wrap = document.getElementById('mktProdutosWrap');
    const count = document.getElementById('mktProdCount');
    if (!wrap) return;

    const lista = this.state.produtos;
    if (count) count.textContent = `${lista.length} produto${lista.length !== 1 ? 's' : ''} vinculado${lista.length !== 1 ? 's' : ''}`;

    if (!lista.length) {
      wrap.innerHTML = `<div class="mkt-empty">
        <i class="fa-solid fa-box-open"></i>
        <strong>Nenhum produto vinculado ainda</strong>
        <p>Clique em "Vincular produto" para conectar seu estoque a uma plataforma.</p>
      </div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Plataforma</th>
            <th>Listing ID</th>
            <th>Estoque ERP</th>
            <th>Publicado</th>
            <th>Último sync</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${lista.map((p) => `
            <tr>
              <td>${esc(p.produto_nome)}</td>
              <td>${p.plataforma === 'mercadolivre' ? '🛒 Mercado Livre' : '🛍 Shopee'}</td>
              <td><code style="font-size:11px;">${esc(p.listing_id)}</code></td>
              <td>${p.estoque_lferp ?? '—'}</td>
              <td>${p.estoque_publicado ?? '—'}</td>
              <td style="font-size:11px;color:var(--text-muted);">${p.ultimo_sync ? new Date(p.ultimo_sync).toLocaleString('pt-BR') : '—'}</td>
              <td>
                <button class="btn-icon" title="Sincronizar estoque" data-sync-id="${p.id}" data-sync-prod="${p.produto_id}" data-sync-plat="${p.plataforma}">
                  <i class="fa fa-rotate"></i>
                </button>
                <button class="btn-icon danger" title="Remover vínculo" data-del-id="${p.id}">
                  <i class="fa fa-trash"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll('[data-sync-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.syncEstoque(btn.dataset.syncProd, btn.dataset.syncPlat, btn));
    });
    wrap.querySelectorAll('[data-del-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.removerVinculo(btn.dataset.delId));
    });
  },

  bindEvents() {
    document.getElementById('mktVincularBtn')?.addEventListener('click', () => this.abrirModalVincular());
    document.getElementById('mktConfigCancelBtn')?.addEventListener('click', () => this.fecharModais());
    document.getElementById('mktVincCancelBtn')?.addEventListener('click', () => this.fecharModais());
    document.getElementById('mktConfigForm')?.addEventListener('submit', (e) => { e.preventDefault(); this.salvarConfig(); });
    document.getElementById('mktVincularForm')?.addEventListener('submit', (e) => { e.preventDefault(); this.salvarVinculo(); });

    document.getElementById('mktConfigModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.fecharModais();
    });
    document.getElementById('mktVincularModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.fecharModais();
    });
  },

  fecharModais() {
    document.getElementById('mktConfigModal').style.display  = 'none';
    document.getElementById('mktVincularModal').style.display = 'none';
    if (this._escConfig)   { document.removeEventListener('keydown', this._escConfig);   this._escConfig = null; }
    if (this._escVincular) { document.removeEventListener('keydown', this._escVincular); this._escVincular = null; }
  },

  abrirModalConfig(plataforma) {
    const label = plataforma === 'mercadolivre' ? 'Mercado Livre' : 'Shopee';
    document.getElementById('mktConfigModalTitle').textContent = `Configurar ${label}`;
    document.getElementById('mktCfgPlataforma').value = plataforma;

    const cfg = this.state.plataformas.find((p) => p.plataforma === plataforma);
    document.getElementById('mktCfgAppId').value  = cfg?.app_id || '';
    document.getElementById('mktCfgSecret').value = '';

    const modal = document.getElementById('mktConfigModal');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('mktCfgAppId')?.focus(), 50);

    document.removeEventListener('keydown', this._escConfig);
    this._escConfig = (e) => { if (e.key === 'Escape') this.fecharModais(); };
    document.addEventListener('keydown', this._escConfig);
  },

  async salvarConfig() {
    const plataforma   = document.getElementById('mktCfgPlataforma').value;
    const app_id       = document.getElementById('mktCfgAppId').value.trim();
    const client_secret = document.getElementById('mktCfgSecret').value.trim();
    const btn = document.getElementById('mktConfigSaveBtn');

    if (!app_id) { showToast('App ID é obrigatório', 'error'); return; }

    try {
      btn.disabled = true; btn.textContent = 'Salvando...';
      await api.fetchAPI('/marketplace/config', 'PUT', { plataforma, app_id, client_secret: client_secret || null });
      showToast('Configuração salva! Agora conecte via OAuth.', 'success');
      this.fecharModais();
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Salvar';
    }
  },

  async iniciarOAuth(plataforma) {
    try {
      const data = await api.fetchAPI(`/marketplace/oauth/url?plataforma=${plataforma}`);
      const popup = window.open(data.url, 'mkt_oauth', 'width=600,height=700,resizable=yes');
      if (!popup) { showToast('Permita pop-ups neste site para autorizar o OAuth', 'error'); return; }

      showToast('Aguardando autorização... Feche o popup após concluir.', 'info');

      if (this._oauthCheck) clearInterval(this._oauthCheck);
      const check = setInterval(async () => {
        if (popup.closed) {
          clearInterval(check);
          this._oauthCheck = null;
          await this.load();
          showToast('Status de conexão atualizado', 'success');
        }
      }, 1000);
      this._oauthCheck = check;
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  async abrirModalVincular() {
    const select = document.getElementById('mktVincProduto');
    if (!select) return;

    try {
      const data = await api.fetchAPI('/produtos?ativo=true&limit=500');
      const lista = data.produtos || data.items || [];
      select.innerHTML = `<option value="">Selecione o produto...</option>` +
        lista.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
    } catch (err) {
      select.innerHTML = `<option value="">Erro ao carregar produtos</option>`;
      showToast(buildFriendlyError(err), 'error');
    }

    document.getElementById('mktVincularModal').style.display = 'flex';
    setTimeout(() => select?.focus(), 50);

    document.removeEventListener('keydown', this._escVincular);
    this._escVincular = (e) => { if (e.key === 'Escape') this.fecharModais(); };
    document.addEventListener('keydown', this._escVincular);
  },

  async salvarVinculo() {
    const produto_id  = Number(document.getElementById('mktVincProduto').value);
    const plataforma  = document.getElementById('mktVincPlataforma').value;
    const listing_id  = document.getElementById('mktVincListingId').value.trim();
    const titulo      = document.getElementById('mktVincTitulo').value.trim();

    if (!produto_id || !plataforma || !listing_id) {
      showToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }

    const btn = document.querySelector('#mktVincularForm button[type="submit"]');
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
      await api.fetchAPI('/marketplace/vincular', 'POST', { produto_id, plataforma, listing_id, titulo: titulo || null });
      showToast('Produto vinculado com sucesso!', 'success');
      this.fecharModais();
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar vínculo'; }
    }
  },

  async syncEstoque(produtoId, plataforma, btn) {
    const icon = btn.querySelector('i');
    try {
      btn.disabled = true;
      icon?.classList.add('fa-spin');
      const data = await api.fetchAPI('/marketplace/sync-estoque', 'POST', {
        produto_id: Number(produtoId),
        plataforma
      });
      showToast(data.mensagem || 'Estoque sincronizado!', 'success');
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      btn.disabled = false;
      icon?.classList.remove('fa-spin');
    }
  },

  async removerVinculo(id) {
    const ok = await confirmarAcao('Remover vínculo com esta plataforma?');
    if (!ok) return;
    try {
      await api.fetchAPI(`/marketplace/vincular/${id}`, 'DELETE');
      showToast('Vínculo removido', 'success');
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  }
};

export function initMarketplaceModule() {
  return MarketplaceModule.init();
}

export default MarketplaceModule;
