import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

const STATUS_LABEL = {
  autorizado:  'Autorizado',
  processando: 'Processando',
  erro:        'Erro',
  cancelado:   'Cancelado',
  rejeitado:   'Rejeitado'
};

const esc = escapeHtml;

function injectNfeStyles() {
  if (document.getElementById('nfeStyles')) return;
  const s = document.createElement('style');
  s.id = 'nfeStyles';
  s.textContent = `
    .nfe-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
    }
    .nfe-empty i { font-size: 2.2rem; opacity: .25; margin-bottom: 4px; color: var(--text-muted); }
    .nfe-empty strong { font-size: 15px; color: var(--text); }
    .nfe-empty p { font-size: 13px; margin: 0; color: var(--text-muted); }
    .nfce-info-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: rgba(59,130,246,.08);
      border: 1px solid rgba(59,130,246,.2);
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 18px;
      font-size: .875rem;
    }
    .nfce-info-card i { color: var(--primary, #3b82f6); margin-top: 2px; flex-shrink: 0; }
    .nfce-info-card strong { font-size: .9rem; color: var(--text); }
    .nfce-info-card p { margin: 4px 0 0; color: var(--text-muted); font-size: .82rem; }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .nfce-info-card {
        background: rgba(59,130,246,.12);
        border-color: rgba(59,130,246,.25);
      }
    }
    :root[data-theme="dark"] .nfce-info-card {
      background: rgba(59,130,246,.12);
      border-color: rgba(59,130,246,.25);
    }
  `;
  document.head.appendChild(s);
}

const NfeModule = {
  state: {
    aba: 'lista',
    nfes: [],
    config: null,
    empresa: null,
    total: 0,
    pagina: 1,
    filtroStatus: '',
    carregando: false
  },

  init() {
    injectNfeStyles();
    this.render();
    this.bindShellEvents();
    this.load();
  },

  async load() {
    if (this.state.carregando) return;
    this.state.carregando = true;
    this.setFeedback('', '');
    const nc = document.getElementById('nfeConteudo');
    if (nc) nc.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 5}).map(() => '<div class="skeleton-line" style="height:38px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      await Promise.all([this.fetchLista(), this.fetchConfig()]);
      this.renderConteudo();
    } catch (err) {
      console.error('[nfe] load:', err);
      this.setFeedback(buildFriendlyError(err), 'error');
    } finally {
      this.state.carregando = false;
    }
  },

  async fetchLista() {
    const q = { pagina: this.state.pagina, limite: 50 };
    if (this.state.filtroStatus) q.status = this.state.filtroStatus;
    const result = await api.getNfeLista(q);
    this.state.nfes  = result?.nfes  || [];
    this.state.total = result?.total || 0;
  },

  async fetchConfig() {
    try {
      const result = await api.getNfeConfig();
      this.state.config  = result?.config  || null;
      this.state.empresa = result?.empresa || null;
    } catch {
      this.state.config  = null;
      this.state.empresa = null;
    }
  },

  // ── RENDER SHELL ───────────────────────────────────────────────────────────

  render() {
    const c = document.getElementById('nfeContainer');
    if (!c) return;

    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="nfeFeedback"></div>

        <div class="module-toolbar">
          <div class="table-actions">
            <button class="btn-inline btn-inline--active" data-nfe-aba="lista">NF-es Emitidas</button>
            <button class="btn-inline" data-nfe-aba="nfce">NFC-e</button>
            <button class="btn-inline" data-nfe-aba="emitir">Emitir NF-e</button>
            <button class="btn-inline" data-nfe-aba="nfse">NFS-e</button>
            <button class="btn-inline" data-nfe-aba="config">Configuração</button>
          </div>
          <button class="btn btn-light" id="nfeAtualizarBtn">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>

        <div id="nfeConteudo"></div>
      </section>
    `;
  },

  bindShellEvents() {
    document.getElementById('nfeAtualizarBtn')?.addEventListener('click', async () => {
      if (this.state.carregando) return;
      await this.load();
    });

    document.getElementById('nfeContainer')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nfe-aba]');
      if (!btn) return;
      this.state.aba = btn.dataset.nfeAba;
      // Update active tab
      document.querySelectorAll('[data-nfe-aba]').forEach((b) => b.classList.remove('btn-inline--active'));
      btn.classList.add('btn-inline--active');
      this.renderConteudo();
    });
  },

  renderConteudo() {
    const c = document.getElementById('nfeConteudo');
    if (!c) return;

    if (this.state.aba === 'lista')   { c.innerHTML = this.renderLista();  this.bindListaEvents();  return; }
    if (this.state.aba === 'nfce')    { this.renderNfce(c);                return; }
    if (this.state.aba === 'emitir')  { c.innerHTML = this.renderEmitir(); this.bindEmitirEvents(); return; }
    if (this.state.aba === 'nfse')    { this.renderNfse(c);                return; }
    c.innerHTML = this.renderConfig();
    this.bindConfigEvents();
  },

  // ── LISTA ─────────────────────────────────────────────────────────────────

  renderLista() {
    const statusFiltros = ['', 'autorizado', 'processando', 'erro', 'cancelado', 'rejeitado'];
    const filterBar = `
      <div class="module-toolbar" style="margin-bottom:12px">
        <div class="table-actions">
          ${statusFiltros.map((s) => `
            <button class="btn-inline ${this.state.filtroStatus === s ? 'btn-inline--active' : ''}" data-nfe-filtro="${s}">
              ${s === '' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    if (!this.state.nfes.length) {
      const filtro = this.state.filtroStatus;
      const filtroLabel = STATUS_LABEL[filtro] || filtro;
      return filterBar + `<div class="nfe-empty">
        <i class="fa-solid fa-file-invoice"></i>
        <strong>${filtro ? `Nenhuma NF-e com status "${filtroLabel}"` : 'Nenhuma NF-e emitida ainda'}</strong>
        <p>${filtro ? 'Tente selecionar outro filtro de status.' : 'As NF-es emitidas aparecerão aqui.'}</p>
      </div>`;
    }

    const rows = this.state.nfes.map((n) => {
      const badgeClass = {
        autorizado: 'badge--success',
        processando: 'badge--warning',
        erro: 'badge--danger',
        cancelado: 'badge--danger',
        rejeitado: 'badge--danger'
      }[n.status] || 'badge--info';

      const data = n.criado_em ? new Date(n.criado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' }) : '-';
      const ambLabel = Number(n.ambiente) === 1 ? 'Produção' : 'Homologação';

      const acoes = [];
      if (n.status === 'autorizado') {
        acoes.push(`<button class="btn-inline" data-nfe-danfe="${esc(n.ref)}">DANFE</button>`);
        acoes.push(`<button class="btn-inline" data-nfe-xml="${esc(n.ref)}">XML</button>`);
        acoes.push(`<button class="btn-inline btn-inline--danger" data-nfe-cancelar-id="${n.id}">Cancelar</button>`);
      }
      if (n.status === 'processando' || n.status === 'erro') {
        acoes.push(`<button class="btn-inline" data-nfe-consultar="${esc(n.ref)}">Consultar</button>`);
      }

      return `
        <tr>
          <td>${n.id}</td>
          <td><span class="badge ${badgeClass}">${STATUS_LABEL[n.status] || n.status}</span></td>
          <td>${esc(n.cliente_nome || 'Consumidor Final')}</td>
          <td>${n.venda_id ? `#${n.venda_id}` : '-'}</td>
          <td>${n.numero ? `${esc(n.serie || '')}/${n.numero}` : '-'}</td>
          <td><small style="color:var(--text-muted);word-break:break-all;font-size:11px">${esc(n.chave_nfe || '-')}</small></td>
          <td><span class="badge ${Number(n.ambiente)===1?'badge--danger':'badge--warning'}">${ambLabel}</span></td>
          <td>${data}</td>
          <td class="text-right">
            <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
              ${acoes.join('')}
              ${n.mensagem ? `<small style="color:var(--text-muted);display:block;margin-top:4px;max-width:140px">${esc(n.mensagem)}</small>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return filterBar + `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Cliente</th>
              <th>Venda</th>
              <th>Número</th>
              <th>Chave NF-e</th>
              <th>Ambiente</th>
              <th>Emitida em</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="module-feedback module-feedback--info" style="margin-top:8px">
        Total: ${this.state.total} NF-e(s).
      </div>
    `;
  },

  bindListaEvents() {
    const c = document.getElementById('nfeConteudo');
    if (!c || c._nfeListaBound) return;
    c._nfeListaBound = true;

    c.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-nfe-filtro]');
      if (btn) {
        this.state.filtroStatus = btn.dataset.nfeFiltro;
        this.state.pagina = 1;
        await this.fetchLista();
        this.renderConteudo();
        return;
      }

      const danfe = e.target.closest('[data-nfe-danfe]');
      if (danfe) { await this.abrirDanfe(danfe.dataset.nfeDanfe); return; }

      const xml = e.target.closest('[data-nfe-xml]');
      if (xml) { await this.baixarXml(xml.dataset.nfeXml); return; }

      const consultar = e.target.closest('[data-nfe-consultar]');
      if (consultar) { await this.consultarStatus(consultar.dataset.nfeConsultar); return; }

      const cancelar = e.target.closest('[data-nfe-cancelar-id]');
      if (cancelar) { await this.cancelarNfe(Number(cancelar.dataset.nfeCancelarId)); return; }
    });
  },

  // ── EMITIR ────────────────────────────────────────────────────────────────

  renderEmitir() {
    const temConfig = Boolean(this.state.config?.token_focusnfe);
    const ambLabel  = Number(this.state.config?.ambiente) === 1 ? 'Produção' : 'Homologação';

    if (!temConfig) {
      return `
        <div class="module-feedback module-feedback--error" style="margin-top:16px">
          Configure o token Focus NFe antes de emitir. Acesse a aba <strong>Configuração</strong>.
        </div>
      `;
    }

    return `
      <div class="panel-card" style="max-width:480px;margin-top:16px">
        <div class="panel-card__header">
          <div>
            <h3>Emitir NF-e por venda</h3>
            <p>Ambiente: <span class="badge ${Number(this.state.config?.ambiente)===1?'badge--danger':'badge--warning'}">${ambLabel}</span></p>
          </div>
        </div>
        <div class="panel-card__body">
          <div class="module-feedback module-feedback--info" style="margin-bottom:12px">
            Os produtos da venda devem ter NCM preenchido. O cliente precisa ter CPF/CNPJ para emissão com destinatário identificado.
          </div>
          <div class="form-field" style="margin-bottom:12px">
            <label for="nfeVendaId">ID da venda</label>
            <input type="number" id="nfeVendaId" placeholder="Ex: 42" min="1" />
          </div>
          <button class="btn btn-primary" id="nfeEmitirBtn">
            <i class="fa-solid fa-file-invoice"></i> Emitir NF-e
          </button>
          <div class="module-feedback" id="nfeEmitirFeedback" style="margin-top:12px"></div>
        </div>
      </div>
    `;
  },

  bindEmitirEvents() {
    document.getElementById('nfeEmitirBtn')?.addEventListener('click', async () => {
      const vendaId = Number(document.getElementById('nfeVendaId')?.value || 0);
      if (!vendaId) { showToast('Informe o ID da venda.', 'error'); return; }

      const btn = document.getElementById('nfeEmitirBtn');
      const feedback = document.getElementById('nfeEmitirFeedback');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Emitindo...'; }
      if (feedback) { feedback.className = 'module-feedback module-feedback--info'; feedback.textContent = 'Enviando para Focus NFe...'; }

      try {
        const result = await api.emitirNfe(vendaId);
        const statusBadge = result.status === 'autorizado' ? 'badge--success'
                          : result.status === 'erro' ? 'badge--danger' : 'badge--warning';
        if (feedback) {
          feedback.className = `module-feedback module-feedback--${result.status === 'autorizado' ? 'success' : result.status === 'erro' ? 'error' : 'info'}`;
          feedback.innerHTML = `
            <strong>Status:</strong> <span class="badge ${statusBadge}">${esc(result.status)}</span><br>
            ${result.chave_nfe ? `<strong>Chave:</strong> <small>${esc(result.chave_nfe)}</small><br>` : ''}
            ${result.numero ? `<strong>Número:</strong> ${esc(String(result.serie || ''))}/${esc(String(result.numero))}<br>` : ''}
            ${result.mensagem ? `<strong>SEFAZ:</strong> ${esc(result.mensagem)}<br>` : ''}
            <strong>Ambiente:</strong> ${esc(String(result.ambiente ?? ''))}
          `;
        }
        if (result.status === 'autorizado') {
          showToast('NF-e autorizada com sucesso!', 'success');
          await this.fetchLista();
        }
      } catch (err) {
        const msg = err.message || 'Erro ao emitir NF-e.';
        if (feedback) { feedback.className = 'module-feedback module-feedback--error'; feedback.textContent = msg; }
        showToast(msg, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-invoice"></i> Emitir NF-e'; }
      }
    });
  },

  // ── CONFIGURAÇÃO ──────────────────────────────────────────────────────────

  renderConfig() {
    const cfg = this.state.config  || {};
    const emp = this.state.empresa || {};
    const temToken = Boolean(cfg.token_focusnfe);

    const v = (val) => esc(val || '');

    return `
      <div style="max-width:620px;margin-top:16px;display:grid;gap:20px">

        <div class="panel-card">
          <div class="panel-card__header">
            <div><h3>Integração Focus NFe</h3><p>Token e ambiente para emissão</p></div>
          </div>
          <div class="panel-card__body">
            <div class="form-grid">
              <div class="form-field form-field--span-2">
                <label>Token Focus NFe</label>
                <input type="password" id="nfeCfgToken"
                  placeholder="${temToken ? '***configurado*** — cole um novo para alterar' : 'Cole seu token do painel Focus NFe'}" />
                ${temToken
                  ? '<small style="color:var(--success)"><i class="fa-solid fa-circle-check"></i> Token configurado.</small>'
                  : '<small style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Token não configurado — emissão bloqueada.</small>'}
              </div>
              <div class="form-field">
                <label>Ambiente</label>
                <select id="nfeCfgAmbiente" class="filter-input">
                  <option value="2" ${Number(cfg.ambiente) !== 1 ? 'selected' : ''}>Homologação (Testes)</option>
                  <option value="1" ${Number(cfg.ambiente) === 1 ? 'selected' : ''}>Produção</option>
                </select>
              </div>
              <div class="form-field">
                <label>Série</label>
                <input id="nfeCfgSerie" value="${v(cfg.serie || '1')}" maxlength="3" />
              </div>

              <!-- CSC para NFC-e -->
              <div class="form-field form-field--span-2" style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
                <label style="font-weight:700;color:var(--text)">NFC-e — Código de Segurança do Contribuinte (CSC)</label>
                <small style="color:var(--text-muted);display:block;margin-bottom:10px">Obrigatório para QR code na NFC-e. Obtido no portal da SEFAZ do seu estado.</small>
              </div>
              <div class="form-field">
                <label>ID Token CSC</label>
                <input id="nfeCfgIdTokenCsc" value="${v(cfg.id_token_csc)}" placeholder="Ex: 000001" />
              </div>
              <div class="form-field">
                <label>Código CSC</label>
                <input type="password" id="nfeCfgCodigoCsc"
                  placeholder="${cfg.codigo_csc ? '***configurado***' : 'Cole seu CSC da SEFAZ'}" />
              </div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header">
            <div><h3>Dados fiscais do emitente</h3><p>Obrigatórios para emissão</p></div>
          </div>
          <div class="panel-card__body">
            <div class="form-grid">
              <div class="form-field">
                <label>IE — Inscrição Estadual</label>
                <input id="nfeCfgIe" value="${v(emp.ie)}" placeholder="Ex: 12345678 ou ISENTO" />
              </div>
              <div class="form-field">
                <label>IM — Inscrição Municipal</label>
                <input id="nfeCfgIm" value="${v(emp.im)}" placeholder="Opcional" />
              </div>
              <div class="form-field form-field--span-2">
                <label>CRT — Regime Tributário</label>
                <select id="nfeCfgCrt" class="filter-input">
                  <option value="1" ${Number(emp.crt) === 1 ? 'selected' : ''}>1 — Simples Nacional</option>
                  <option value="2" ${Number(emp.crt) === 2 ? 'selected' : ''}>2 — Simples Nacional Excesso</option>
                  <option value="3" ${Number(emp.crt) === 3 ? 'selected' : ''}>3 — Regime Normal (Lucro Presumido/Real)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header">
            <div><h3>Endereço do emitente</h3><p>Deve corresponder exatamente ao CNPJ cadastrado na SEFAZ</p></div>
          </div>
          <div class="panel-card__body">
            <div class="form-grid">
              <div class="form-field form-field--span-2">
                <label>Logradouro</label>
                <input id="nfeCfgLogradouro" value="${v(emp.logradouro)}" placeholder="Rua, Av., Trav..." />
              </div>
              <div class="form-field">
                <label>Número</label>
                <input id="nfeCfgNumero" value="${v(emp.numero)}" placeholder="Ex: 123 ou SN" />
              </div>
              <div class="form-field">
                <label>Complemento</label>
                <input id="nfeCfgComplemento" value="${v(emp.complemento)}" placeholder="Sala, Loja..." />
              </div>
              <div class="form-field">
                <label>Bairro</label>
                <input id="nfeCfgBairro" value="${v(emp.bairro)}" />
              </div>
              <div class="form-field">
                <label>Município</label>
                <input id="nfeCfgMunicipio" value="${v(emp.municipio)}" />
              </div>
              <div class="form-field">
                <label>UF</label>
                <input id="nfeCfgUf" value="${v(emp.uf)}" maxlength="2" placeholder="CE" style="text-transform:uppercase" />
              </div>
              <div class="form-field">
                <label>CEP</label>
                <input id="nfeCfgCep" value="${v(emp.cep)}" placeholder="00000-000" />
              </div>
              <div class="form-field">
                <label>Código IBGE</label>
                <input id="nfeCfgCodigoMunicipio" value="${v(emp.codigo_municipio)}" placeholder="Ex: 2304400" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <button class="btn btn-primary" id="nfeSalvarConfigBtn">
            <i class="fa-solid fa-floppy-disk"></i> Salvar configuração
          </button>
          <div class="module-feedback" id="nfeConfigFeedback" style="margin-top:12px"></div>
        </div>
      </div>
    `;
  },

  bindConfigEvents() {
    document.getElementById('nfeSalvarConfigBtn')?.addEventListener('click', async () => {
      const btn      = document.getElementById('nfeSalvarConfigBtn');
      const feedback = document.getElementById('nfeConfigFeedback');

      const payload = {
        token_focusnfe:    document.getElementById('nfeCfgToken')?.value?.trim() || undefined,
        ambiente:          Number(document.getElementById('nfeCfgAmbiente')?.value || 2),
        serie:             document.getElementById('nfeCfgSerie')?.value?.trim() || '1',
        id_token_csc:      document.getElementById('nfeCfgIdTokenCsc')?.value?.trim() || null,
        codigo_csc:        document.getElementById('nfeCfgCodigoCsc')?.value?.trim() || null,
        ie:                document.getElementById('nfeCfgIe')?.value?.trim() || null,
        im:                document.getElementById('nfeCfgIm')?.value?.trim() || null,
        crt:               Number(document.getElementById('nfeCfgCrt')?.value || 1),
        logradouro:        document.getElementById('nfeCfgLogradouro')?.value?.trim() || null,
        numero:            document.getElementById('nfeCfgNumero')?.value?.trim() || null,
        complemento:       document.getElementById('nfeCfgComplemento')?.value?.trim() || null,
        bairro:            document.getElementById('nfeCfgBairro')?.value?.trim() || null,
        municipio:         document.getElementById('nfeCfgMunicipio')?.value?.trim() || null,
        uf:                document.getElementById('nfeCfgUf')?.value?.trim().toUpperCase() || null,
        cep:               document.getElementById('nfeCfgCep')?.value?.trim() || null,
        codigo_municipio:  document.getElementById('nfeCfgCodigoMunicipio')?.value?.trim() || null
      };

      // Remove token se campo vazio (não sobrescreve)
      if (!payload.token_focusnfe) delete payload.token_focusnfe;

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }

      try {
        await api.salvarNfeConfig(payload);
        if (feedback) { feedback.className = 'module-feedback module-feedback--success'; feedback.textContent = 'Configuração salva com sucesso.'; }
        showToast('Configuração NF-e salva.', 'success');
        await this.fetchConfig();
        // Re-render para atualizar badge de token
        this.renderConteudo();
      } catch (err) {
        const msg = err.message || 'Erro ao salvar configuração.';
        if (feedback) { feedback.className = 'module-feedback module-feedback--error'; feedback.textContent = msg; }
        showToast(msg, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar configuração'; }
      }
    });
  },

  // ── AÇÕES ─────────────────────────────────────────────────────────────────

  async abrirDanfe(ref) {
    try {
      showToast('Baixando DANFE...', 'info');
      const url = await api.downloadNfePdf(ref);
      window.open(url, '_blank');
    } catch (err) {
      showToast(err.message || 'Erro ao baixar DANFE.', 'error');
    }
  },

  async baixarXml(ref) {
    try {
      showToast('Baixando XML...', 'info');
      const url = await api.downloadNfeXml(ref);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nfe-${ref}.xml`;
      a.click();
    } catch (err) {
      showToast(err.message || 'Erro ao baixar XML.', 'error');
    }
  },

  async consultarStatus(ref) {
    try {
      showToast('Consultando status...', 'info');
      const result = await api.consultarNfe(ref);
      showToast(`Status: ${result.status || 'desconhecido'}`, result.status === 'autorizado' ? 'success' : 'info');
      await this.fetchLista();
      this.renderConteudo();
    } catch (err) {
      showToast(err.message || 'Erro ao consultar NF-e.', 'error');
    }
  },

  async cancelarNfe(nfeId) {
    const justificativa = await this.promptJustificativa();
    if (!justificativa) return;

    try {
      await api.cancelarNfe(nfeId, justificativa);
      showToast('NF-e cancelada com sucesso.', 'success');
      await this.fetchLista();
      this.renderConteudo();
    } catch (err) {
      showToast(err.message || 'Erro ao cancelar NF-e.', 'error');
    }
  },

  promptJustificativa() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:440px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 8px;font-size:16px;font-weight:700;color:var(--danger)">Cancelar NF-e</h3>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">
            O cancelamento é irreversível e deve ser solicitado em até 24h da emissão.<br>
            <strong>Justificativa (mínimo 15 caracteres):</strong>
          </p>
          <textarea id="_nfeJustInput" rows="3" placeholder="Motivo do cancelamento..."
            style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;resize:vertical;margin-bottom:14px"></textarea>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="_nfeCancelarAbort" class="btn-cancel">Voltar</button>
            <button id="_nfeCancelarConfirm" class="btn-confirm btn-confirm--danger">Confirmar cancelamento</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.querySelector('#_nfeJustInput')?.focus(), 50);
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); }
      });
      overlay.querySelector('#_nfeCancelarAbort').addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
      overlay.querySelector('#_nfeCancelarConfirm').addEventListener('click', () => {
        const val = overlay.querySelector('#_nfeJustInput').value.trim();
        if (val.length < 15) { showToast('Justificativa deve ter ao menos 15 caracteres.', 'error'); return; }
        document.body.removeChild(overlay);
        resolve(val);
      });
    });
  },

  // ── NFC-e ─────────────────────────────────────────────────────────────────

  async renderNfce(container) {
    container.innerHTML = `
      <div style="text-align:center;padding:32px;color:var(--text-muted)">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem"></i>
        <p style="margin-top:10px">Carregando NFC-es...</p>
      </div>`;

    try {
      const result = await api.getNfceLista({ limite: 50 });
      const nfces  = result?.nfces || [];
      const total  = result?.total || 0;

      const statusBadge = (s) => {
        const map = {
          autorizado: '<span class="badge badge--success">Autorizada</span>',
          processando: '<span class="badge badge--warning">Processando</span>',
          erro: '<span class="badge badge--danger">Erro</span>',
          cancelado: '<span class="badge">Cancelada</span>',
          rejeitado: '<span class="badge badge--danger">Rejeitada</span>'
        };
        return map[s] || `<span class="badge">${esc(s)}</span>`;
      };

      container.innerHTML = `
        <div class="nfce-info-card">
          <i class="fa-solid fa-circle-info"></i>
          <div>
            <strong>NFC-e — Nota Fiscal ao Consumidor Eletrônica (modelo 65)</strong>
            <p>Para emitir, clique em <strong>NFC-e</strong> na linha de uma venda no módulo Vendas. Requer token Focus NFe e CSC configurados abaixo.</p>
          </div>
        </div>

        <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:.85rem;color:var(--text-muted)">${total} NFC-e(s) emitida(s)</span>
        </div>

        ${nfces.length === 0
          ? `<div class="empty-state" style="padding:40px;text-align:center;color:var(--text-muted)">
               <i class="fa-solid fa-file-invoice" style="font-size:2rem;opacity:.3;margin-bottom:12px;display:block"></i>
               <p>Nenhuma NFC-e emitida ainda.</p>
               <p style="font-size:.85rem">Use o botão NFC-e na coluna de ações do módulo Vendas.</p>
             </div>`
          : `<div class="table-wrapper">
               <table class="data-table">
                 <thead>
                   <tr>
                     <th>Referência</th>
                     <th>Venda</th>
                     <th>Nº</th>
                     <th>Status</th>
                     <th>Ambiente</th>
                     <th>Emissão</th>
                     <th>Ações</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${nfces.map(n => `
                     <tr>
                       <td style="font-size:.78rem;color:var(--text-muted)">${esc(n.ref)}</td>
                       <td>${n.venda_id ? `#${n.venda_id}` : '—'}</td>
                       <td>${n.numero ? esc(String(n.numero)) : '—'}</td>
                       <td>${statusBadge(n.status)}</td>
                       <td><span class="badge ${n.ambiente === 1 ? 'badge--success' : ''}">${n.ambiente === 1 ? 'Produção' : 'Homologação'}</span></td>
                       <td>${new Date(n.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' })}</td>
                       <td>
                         <div style="display:flex;gap:6px;flex-wrap:wrap">
                           ${n.status === 'autorizado' ? `
                             <a href="${api.getApiBaseUrl()}/nfce/pdf/${encodeURIComponent(n.ref)}"
                                target="_blank" class="btn-inline" style="font-size:11px">
                               <i class="fa-solid fa-print"></i> DANFCE
                             </a>` : ''}
                           ${['processando'].includes(n.status) ? `
                             <button class="btn-inline" style="font-size:11px" data-nfce-consultar="${esc(n.ref)}">
                               <i class="fa-solid fa-rotate"></i> Consultar
                             </button>` : ''}
                         </div>
                       </td>
                     </tr>`).join('')}
                 </tbody>
               </table>
             </div>`
        }`;

      // Bind consultar
      container.querySelectorAll('[data-nfce-consultar]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ref = btn.dataset.nfceConsultar;
          btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          try {
            const r = await api.consultarNfce(ref);
            const rStatus = r?.status || 'desconhecido';
            showToast(`Status: ${rStatus}${r?.chave_nfe ? ' — Autorizada!' : ''}`, rStatus === 'autorizado' ? 'success' : 'info');
            await this.renderNfce(container);
          } catch (e) {
            showToast(e.message || 'Erro ao consultar', 'error');
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Consultar';
          }
        });
      });
    } catch (err) {
      console.error('[nfe] renderNfce:', err);
      container.innerHTML = `<div class="module-feedback module-feedback--error">${esc(buildFriendlyError(err))}</div>`;
    }
  },

  // ── HELPERS ───────────────────────────────────────────────────────────────

  setFeedback(msg, type = 'info') {
    const el = document.getElementById('nfeFeedback');
    if (!el) return;
    if (!msg) { el.className = 'module-feedback'; el.textContent = ''; return; }
    el.className = `module-feedback module-feedback--${type}`;
    el.textContent = msg;
  },

  // ── NFS-e ──────────────────────────────────────────────────────────────────

  async renderNfse(container) {
    const cur = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dt  = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

    container.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" id="nfseEmitirBtn">
          <i class="fa-solid fa-plus"></i> Emitir NFS-e
        </button>
        <button class="btn btn-light btn-sm" id="nfseConfigBtn">
          <i class="fa-solid fa-gear"></i> Configuração
        </button>
        <button class="btn btn-light btn-sm" id="nfseAtualizarBtn">
          <i class="fa-solid fa-rotate"></i> Atualizar lista
        </button>
      </div>
      <div id="nfseCorpo"><div class="module-feedback module-feedback--info">Carregando...</div></div>`;

    document.getElementById('nfseEmitirBtn')?.addEventListener('click', () => this.abrirFormNfse());
    document.getElementById('nfseConfigBtn')?.addEventListener('click', () => this.abrirConfigNfse());
    document.getElementById('nfseAtualizarBtn')?.addEventListener('click', () => this.carregarListaNfse());

    await this.carregarListaNfse();
  },

  async carregarListaNfse() {
    const corpo = document.getElementById('nfseCorpo');
    if (!corpo) return;
    corpo.innerHTML = `<div class="module-feedback module-feedback--info">Carregando...</div>`;

    try {
      const data = await api.request('/nfse/lista');
      const emissoes = data.emissoes || [];

      if (!emissoes.length) {
        corpo.innerHTML = `<div class="nfe-empty">
          <i class="fa-solid fa-receipt"></i>
          <strong>Nenhuma NFS-e emitida ainda</strong>
          <p>Clique em "Emitir NFS-e" para criar a primeira nota.</p>
        </div>`;
        return;
      }

      const statusColor = { autorizada: 'badge--success', pendente: 'badge--warning', erro: 'badge--danger', cancelada: 'badge--warning' };
      const dt = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';
      const cur = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      corpo.innerHTML = `
        <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Data</th><th>Tomador</th><th>Discriminação</th>
            <th class="text-right">Valor</th><th>Número</th><th>Status</th>
            <th class="text-right">Ações</th>
          </tr></thead>
          <tbody>
            ${emissoes.map((e) => `
              <tr>
                <td>${dt(e.criado_em)}</td>
                <td>${esc(e.tomador_nome || '-')}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.discriminacao || '-')}</td>
                <td class="text-right">${cur(e.valor_servico)}</td>
                <td>${esc(e.numero_nfse || e.rps_numero || '-')}</td>
                <td><span class="badge ${statusColor[e.status] || ''}">${esc(e.status || 'pendente')}</span></td>
                <td class="text-right">
                  <div class="table-actions">
                    <button class="btn-inline" data-nfse-consultar="${esc(e.ref)}">
                      <i class="fa-solid fa-sync"></i>
                    </button>
                    ${e.link_pdf && /^https?:\/\//i.test(e.link_pdf) ? `
                      <a href="${esc(e.link_pdf)}" target="_blank" rel="noopener noreferrer" class="btn-inline">
                        <i class="fa-solid fa-file-pdf"></i> PDF
                      </a>` : ''}
                    ${e.status === 'autorizada' ? `
                      <button class="btn-inline btn-inline--danger" data-nfse-cancelar="${esc(e.ref)}">
                        Cancelar
                      </button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        </div>`;

      corpo.querySelectorAll('[data-nfse-consultar]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api.request(`/nfse/consultar/${btn.dataset.nfseConsultar}`);
            showToast('Status atualizado!', 'success');
            await this.carregarListaNfse();
          } catch (e) { showToast(e.message, 'error'); }
        });
      });

      corpo.querySelectorAll('[data-nfse-cancelar]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!await confirmarAcao('Cancelar esta NFS-e?', 'Cancelar', 'danger')) return;
          try {
            await api.request(`/nfse/cancelar/${btn.dataset.nfseCancelar}`, { method: 'POST', body: {} });
            showToast('Cancelamento solicitado!', 'success');
            await this.carregarListaNfse();
          } catch (e) { showToast(e.message, 'error'); }
        });
      });
    } catch (err) {
      corpo.innerHTML = `<div class="module-feedback module-feedback--error">${esc(buildFriendlyError(err))}</div>`;
    }
  },

  abrirFormNfse() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'nfseFormModal';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:560px;width:95vw">
        <div class="modal-card__header">
          <div><h3>Emitir NFS-e</h3><p style="color:var(--text-muted);font-size:.9rem">Nota Fiscal de Serviço Eletrônica avulsa</p></div>
          <button type="button" class="icon-button" id="nfseFormCloseX">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form id="nfseForm" style="padding:20px 24px 24px;display:grid;gap:12px">
          <div class="form-grid">
            <div class="form-field form-field--span-2">
              <label>Nome do tomador *</label>
              <input class="form-control" name="tomador_nome" required />
            </div>
            <div class="form-field">
              <label>CPF/CNPJ do tomador</label>
              <input class="form-control" name="tomador_cpf_cnpj" />
            </div>
            <div class="form-field">
              <label>Email do tomador</label>
              <input class="form-control" name="tomador_email" type="email" />
            </div>
            <div class="form-field form-field--span-2">
              <label>Discriminação do serviço *</label>
              <textarea class="form-control" name="discriminacao" rows="3" required></textarea>
            </div>
            <div class="form-field">
              <label>Valor do serviço (R$) *</label>
              <input class="form-control" name="valor_servico" type="number" min="0.01" step="0.01" required inputmode="decimal" />
            </div>
            <div class="form-field">
              <label>Data de emissão</label>
              <input class="form-control" name="data_emissao" type="date" value="${new Date().toISOString().slice(0,10)}" />
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
            <button type="button" class="btn btn-light" id="nfseFormCancelBtn">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="nfseSubmitBtn">
              <i class="fa-solid fa-paper-plane"></i> Emitir
            </button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#nfseFormCloseX').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#nfseFormCancelBtn').addEventListener('click', () => overlay.remove());

    document.getElementById('nfseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('nfseSubmitBtn');
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());

      try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }
        await api.request('/nfse/emitir', { method: 'POST', body });
        showToast('NFS-e enviada para processamento!', 'success');
        overlay.remove();
        await this.carregarListaNfse();
      } catch (err) {
        showToast(err.message || 'Erro ao emitir NFS-e', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Emitir'; }
      }
    });
  },

  async abrirConfigNfse() {
    try {
      const data = await api.request('/nfse/config');
      const cfg = data.config || {};

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" style="max-width:520px;width:95vw">
          <div class="modal-card__header">
            <div><h3>Configuração NFS-e</h3></div>
            <button type="button" class="icon-button" id="nfseConfigCloseX">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <form id="nfseConfigForm" style="padding:20px 24px 24px;display:grid;gap:12px">
            <div class="form-grid">
              <div class="form-field form-field--span-2">
                <label>Token FocusNFe</label>
                <input class="form-control" name="token_focus" type="password"
                  placeholder="${cfg.token_focus === '***' ? '*** (configurado)' : 'Token da empresa no FocusNFe'}" />
              </div>
              <div class="form-field">
                <label>Ambiente</label>
                <select class="form-control" name="ambiente">
                  <option value="2" ${Number(cfg.ambiente) !== 1 ? 'selected' : ''}>Homologação</option>
                  <option value="1" ${Number(cfg.ambiente) === 1 ? 'selected' : ''}>Produção</option>
                </select>
              </div>
              <div class="form-field">
                <label>Código IBGE do município</label>
                <input class="form-control" name="codigo_municipio" placeholder="ex: 3550308 (São Paulo)"
                  value="${cfg.codigo_municipio || ''}" />
              </div>
              <div class="form-field">
                <label>Item da lista de serviços</label>
                <input class="form-control" name="item_lista_servico" placeholder="ex: 01.01"
                  value="${cfg.item_lista_servico || ''}" />
              </div>
              <div class="form-field">
                <label>Alíquota ISS (%)</label>
                <input class="form-control" name="aliquota_iss" type="number" step="0.01" min="0" max="10"
                  value="${cfg.aliquota_iss || 5}" inputmode="decimal" />
              </div>
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end">
              <button type="button" class="btn btn-light" id="nfseConfigCancelBtn">Cancelar</button>
              <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Salvar</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#nfseConfigCloseX').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#nfseConfigCancelBtn').addEventListener('click', () => overlay.remove());

      document.getElementById('nfseConfigForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
        const fd = new FormData(e.target);
        const body = Object.fromEntries(fd.entries());
        try {
          await api.request('/nfse/config', { method: 'PUT', body });
          showToast('Configuração NFS-e salva!', 'success');
          overlay.remove();
        } catch (err) {
          showToast(err.message || 'Erro ao salvar', 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar'; }
        }
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};

export async function initNfeModule() {
  NfeModule.init();
}

export default NfeModule;
