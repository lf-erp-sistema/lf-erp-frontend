import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { exportCSV, numCSV } from './exportUtils.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

const esc = escapeHtml;

function injectComissoesStyles() {
  if (document.getElementById('comStyles')) return;
  const s = document.createElement('style');
  s.id = 'comStyles';
  s.textContent = `
    .com-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
    }
    .com-empty i { font-size: 2.2rem; opacity: .25; margin-bottom: 4px; color: var(--text-muted); }
    .com-empty strong { font-size: 15px; color: var(--text); }
    .com-empty p { font-size: 13px; margin: 0; color: var(--text-muted); }
  `;
  document.head.appendChild(s);
}

const ComissoesModule = {
  state: {
    aba: 'resumo',
    resumo: [],
    comissoes: [],
    configs: [],
    usuarios: [],
    filtroStatus: '',
    filtroUsuario: '',
    filtroPeriodo: 'mes_atual',
    carregando: false
  },

  init() {
    injectComissoesStyles();
    this.render();
    this.bindShellEvents();
  },

  async load() {
    if (this.state.carregando) return;
    this.state.carregando = true;
    this.setFeedback('', '');
    const conteudo = document.getElementById('comConteudo');
    if (conteudo) conteudo.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:40px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    const periodo = this._calcPeriodo();
    try {
      const [resumoRes, configsRes, comissoesRes, usuariosRes] = await Promise.allSettled([
        api.getComissoesResumo(periodo),
        api.getComissoesConfig(),
        api.getComissoes(periodo),
        api.getUsuarios()
      ]);

      this.state.resumo    = resumoRes.status    === 'fulfilled' ? (resumoRes.value?.resumo    || []) : [];
      this.state.configs   = configsRes.status   === 'fulfilled' ? (configsRes.value?.configs   || []) : [];
      this.state.comissoes = comissoesRes.status === 'fulfilled' ? (comissoesRes.value?.comissoes || []) : [];
      this.state.usuarios  = usuariosRes.status  === 'fulfilled'
        ? (Array.isArray(usuariosRes.value) ? usuariosRes.value : (usuariosRes.value?.usuarios || []))
        : [];

      this.renderConteudo();
    } catch (err) {
      console.error('[comissoes] load:', err);
      this.setFeedback(buildFriendlyError(err), 'error');
    } finally {
      this.state.carregando = false;
    }
  },

  _calcPeriodo() {
    const tz     = { timeZone: 'America/Fortaleza' };
    const fmtISO = (d) => new Intl.DateTimeFormat('en-CA', tz).format(d);
    const hoje   = fmtISO(new Date());
    const [ano, mes] = hoje.split('-').map(Number);
    const p = this.state.filtroPeriodo;
    if (p === 'todos') return {};
    if (p === 'mes_atual') {
      return { data_inicial: `${ano}-${String(mes).padStart(2, '0')}-01`, data_final: hoje };
    }
    if (p === 'mes_passado') {
      const mesAnt = mes === 1 ? 12 : mes - 1;
      const anoAnt = mes === 1 ? ano - 1 : ano;
      const ultimo = fmtISO(new Date(anoAnt, mesAnt, 0));
      return { data_inicial: `${anoAnt}-${String(mesAnt).padStart(2, '0')}-01`, data_final: ultimo };
    }
    if (p === 'trimestre') {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { data_inicial: fmtISO(d), data_final: hoje };
    }
    if (p === 'ano_atual') {
      return { data_inicial: `${ano}-01-01`, data_final: hoje };
    }
    return {};
  },

  render() {
    const c = document.getElementById('comissoesContainer');
    if (!c) return;
    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="comFeedback"></div>

        <div class="module-toolbar">
          <div class="table-actions">
            <button class="btn-inline btn-inline--active" data-com-aba="resumo">Resumo</button>
            <button class="btn-inline" data-com-aba="detalhes">Detalhes</button>
            <button class="btn-inline" data-com-aba="config">Configuração</button>
          </div>
          <select id="comFiltroPeriodo" class="filter-input">
            ${[
              ['mes_atual',   'Este mês'],
              ['mes_passado', 'Mês passado'],
              ['trimestre',   'Últimos 3 meses'],
              ['ano_atual',   'Este ano'],
              ['todos',       'Todos']
            ].map(([v, l]) => `<option value="${v}"${this.state.filtroPeriodo === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <div class="module-card__actions">
            <button class="btn btn-light" id="comExportarBtn">
              <i class="fa-solid fa-file-csv"></i> Exportar CSV
            </button>
            <button class="btn btn-light" id="comAtualizarBtn">
              <i class="fa-solid fa-rotate"></i> Atualizar
            </button>
          </div>
        </div>

        <div id="comConteudo"></div>
      </section>
    `;
  },

  bindShellEvents() {
    const c = document.getElementById('comissoesContainer');
    if (!c) return;

    document.getElementById('comAtualizarBtn')?.addEventListener('click', () => { if (this.state.carregando) return; this.load(); });
    document.getElementById('comExportarBtn')?.addEventListener('click', () => this.exportar());
    document.getElementById('comFiltroPeriodo')?.addEventListener('change', (e) => {
      this.state.filtroPeriodo = e.target.value;
      this.load();
    });

    c.addEventListener('click', async (e) => {
      const abaBtn = e.target.closest('[data-com-aba]');
      if (abaBtn) {
        this.state.aba = abaBtn.dataset.comAba;
        document.querySelectorAll('[data-com-aba]').forEach((b) => b.classList.remove('btn-inline--active'));
        abaBtn.classList.add('btn-inline--active');
        this.renderConteudo();
        return;
      }

      const acao = e.target.closest('[data-com-acao]');
      if (!acao) return;
      const { comAcao, comId } = acao.dataset;
      await this.executarAcao(Number(comId), comAcao, acao);
    });
  },

  renderConteudo() {
    const c = document.getElementById('comConteudo');
    if (!c) return;
    if (this.state.aba === 'resumo')   { c.innerHTML = this.renderResumo();   return; }
    if (this.state.aba === 'detalhes') { c.innerHTML = this.renderDetalhes(); this.bindDetalhesEvents(); return; }
    c.innerHTML = this.renderConfig();
    this.bindConfigEvents();
  },

  // ── RESUMO ─────────────────────────────────────────────────────────────────

  renderResumo() {
    const resumo = this.state.resumo;

    const totPendente  = resumo.reduce((s, r) => s + Number(r.pendente  || 0), 0);
    const totPago      = resumo.reduce((s, r) => s + Number(r.pago      || 0), 0);
    const totComissao  = resumo.reduce((s, r) => s + Number(r.total_comissao || 0), 0);
    const totVendasVal = resumo.reduce((s, r) => s + Number(r.total_vendas_valor || 0), 0);

    if (!resumo.length) {
      return `<div class="com-empty">
        <i class="fa-solid fa-percent"></i>
        <strong>Nenhuma comissão registrada</strong>
        <p>Configure os vendedores na aba <strong>Configuração</strong> para começar a registrar comissões.</p>
      </div>`;
    }

    const linhas = resumo.map((r) => `
      <tr>
        <td><strong>${esc(r.vendedor_nome || r.vendedor_usuario || '-')}</strong></td>
        <td>${Number(r.total_vendas || 0)}</td>
        <td>${this.fmtCur(r.total_vendas_valor)}</td>
        <td>${Number(r.percentual_medio || 0).toFixed(1)}%</td>
        <td>${this.fmtCur(r.total_comissao)}</td>
        <td class="text-danger"><strong>${this.fmtCur(r.pendente)}</strong></td>
        <td class="text-success">${this.fmtCur(r.pago)}</td>
      </tr>
    `).join('');

    return `
      <div class="kpi-grid" style="margin-top:8px;margin-bottom:20px">
        <div class="kpi-card">
          <div class="kpi-card__icon"><i class="fa-solid fa-users"></i></div>
          <div class="kpi-card__content">
            <span>Vendedores</span>
            <strong>${resumo.length}</strong>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon"><i class="fa-solid fa-coins"></i></div>
          <div class="kpi-card__content">
            <span>Total Comissões</span>
            <strong>${this.fmtCur(totComissao)}</strong>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon" style="color:var(--danger)"><i class="fa-solid fa-clock"></i></div>
          <div class="kpi-card__content">
            <span>A Pagar</span>
            <strong style="color:var(--danger)">${this.fmtCur(totPendente)}</strong>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon" style="color:var(--success)"><i class="fa-solid fa-circle-check"></i></div>
          <div class="kpi-card__content">
            <span>Já Pago</span>
            <strong style="color:var(--success)">${this.fmtCur(totPago)}</strong>
          </div>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Vendas</th>
              <th>Faturamento</th>
              <th>% Médio</th>
              <th>Total Comissão</th>
              <th>A Pagar</th>
              <th>Pago</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border);font-weight:800">
              <td><strong>Total</strong></td>
              <td>—</td>
              <td><strong>${this.fmtCur(totVendasVal)}</strong></td>
              <td>—</td>
              <td><strong>${this.fmtCur(totComissao)}</strong></td>
              <td><strong style="color:var(--danger)">${this.fmtCur(totPendente)}</strong></td>
              <td><strong style="color:var(--success)">${this.fmtCur(totPago)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  },

  // ── DETALHES ───────────────────────────────────────────────────────────────

  renderDetalhes() {
    const statusFiltros = ['', 'pendente', 'pago', 'cancelado'];
    const vendedores = [...new Map(this.state.comissoes.map((c) => [c.usuario_id, c.vendedor_nome || c.vendedor_usuario])).entries()];

    const filtered = this.state.comissoes.filter((c) => {
      if (this.state.filtroStatus && c.status !== this.state.filtroStatus) return false;
      if (this.state.filtroUsuario && String(c.usuario_id) !== String(this.state.filtroUsuario)) return false;
      return true;
    });

    const filterBar = `
      <div class="module-toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div class="table-actions">
          ${statusFiltros.map((s) => `
            <button class="btn-inline ${this.state.filtroStatus === s ? 'btn-inline--active' : ''}" data-com-status="${s}">
              ${s === '' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          `).join('')}
        </div>
        <select id="comFiltroVendedor" class="filter-input">
          <option value="">Todos os vendedores</option>
          ${vendedores.map(([id, nome]) => `<option value="${id}" ${String(this.state.filtroUsuario) === String(id) ? 'selected' : ''}>${esc(nome || String(id))}</option>`).join('')}
        </select>
      </div>
    `;

    if (!filtered.length) {
      const temFiltro = this.state.filtroStatus || this.state.filtroUsuario;
      return filterBar + `<div class="com-empty">
        <i class="fa-solid fa-list-check"></i>
        <strong>${temFiltro ? 'Nenhuma comissão com esses filtros' : 'Nenhuma comissão encontrada'}</strong>
        <p>${temFiltro ? 'Tente remover os filtros aplicados.' : 'As comissões geradas pelas vendas aparecerão aqui.'}</p>
      </div>`;
    }

    const linhas = filtered.map((c) => {
      const badgeClass = { pendente: 'badge--warning', pago: 'badge--success', cancelado: 'badge--danger' }[c.status] || '';
      return `
        <tr>
          <td>${esc(c.vendedor_nome || c.vendedor_usuario || '-')}</td>
          <td>${c.venda_id ? `#${c.venda_id}` : '-'}</td>
          <td>${esc(c.cliente_nome || 'Consumidor')}</td>
          <td>${this.fmtDate(c.data_venda)}</td>
          <td>${this.fmtCur(c.valor_venda)}</td>
          <td>${Number(c.percentual || 0).toFixed(1)}%</td>
          <td class="text-right"><strong>${this.fmtCur(c.valor_comissao)}</strong></td>
          <td><span class="badge ${badgeClass}">${esc(c.status)}</span></td>
          <td class="text-right">
            <div style="display:flex;gap:6px;justify-content:flex-end">
              ${c.status === 'pendente' ? `
                <button class="btn-inline" data-com-acao="pagar" data-com-id="${c.id}">Pagar</button>
                <button class="btn-inline btn-inline--danger" data-com-acao="cancelar" data-com-id="${c.id}">Cancelar</button>
              ` : ''}
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
              <th>Vendedor</th>
              <th>Venda</th>
              <th>Cliente</th>
              <th>Data</th>
              <th>Valor Venda</th>
              <th>%</th>
              <th class="text-right">Comissão</th>
              <th>Status</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    `;
  },

  bindDetalhesEvents() {
    const c = document.getElementById('comConteudo');
    if (!c || c.dataset.detBound) return;
    c.dataset.detBound = '1';
    c.addEventListener('click', (e) => {
      const statusBtn = e.target.closest('[data-com-status]');
      if (statusBtn) {
        this.state.filtroStatus = statusBtn.dataset.comStatus;
        this.renderConteudo();
      }
    });
    c.addEventListener('change', (e) => {
      if (e.target.id === 'comFiltroVendedor') {
        this.state.filtroUsuario = e.target.value;
        this.renderConteudo();
      }
    });
  },

  // ── CONFIGURAÇÃO ───────────────────────────────────────────────────────────

  renderConfig() {
    const configs = this.state.configs;

    const linhas = configs.map((cfg) => `
      <tr>
        <td><strong>${esc(cfg.vendedor_nome || cfg.vendedor_usuario || '-')}</strong></td>
        <td>${Number(cfg.percentual || 0).toFixed(2)}%</td>
        <td>
          <span class="badge ${cfg.ativa ? 'badge--success' : 'badge--danger'}">
            ${cfg.ativa ? 'Ativa' : 'Inativa'}
          </span>
        </td>
        <td>${Number(cfg.total_comissoes || 0)}</td>
        <td>${this.fmtCur(cfg.pendente_total)}</td>
        <td class="text-right">
          <button class="btn-inline btn-inline--danger" data-com-acao="del-config" data-com-id="${cfg.id}">
            Remover
          </button>
        </td>
      </tr>
    `).join('');

    const vendedoresDisponiveis = this.state.usuarios.filter(
      (u) => !configs.some((c) => c.usuario_id === u.id)
    );

    return `
      <div class="panel-card" style="max-width:560px;margin-top:16px;margin-bottom:20px">
        <div class="panel-card__header">
          <div><h3>Adicionar vendedor</h3><p>Define comissão padrão por % de cada venda</p></div>
        </div>
        <div class="panel-card__body">
          <div class="form-grid">
            <div class="form-field">
              <label>Vendedor</label>
              <select id="comVendedorSelect" class="filter-input">
                <option value="">Selecione um usuário</option>
                ${vendedoresDisponiveis.map((u) => `
                  <option value="${u.id}">${esc(u.nome_completo || u.usuario || String(u.id))}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-field">
              <label>Comissão (%)</label>
              <input type="number" id="comPercentual" min="0" max="100" step="0.5" placeholder="Ex: 5" />
            </div>
          </div>
          <button class="btn btn-primary" id="comSalvarConfigBtn" style="margin-top:8px">
            <i class="fa-solid fa-plus"></i> Adicionar
          </button>
          <div class="module-feedback" id="comConfigFeedback" style="margin-top:10px"></div>
        </div>
      </div>

      ${configs.length ? `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>% Comissão</th>
                <th>Status</th>
                <th>Total comissões</th>
                <th>A pagar</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      ` : `<div class="com-empty">
        <i class="fa-solid fa-gear"></i>
        <strong>Nenhum vendedor configurado</strong>
        <p>Adicione um vendedor acima para definir a comissão padrão por venda.</p>
      </div>`}
    `;
  },

  bindConfigEvents() {
    document.getElementById('comSalvarConfigBtn')?.addEventListener('click', async () => {
      const usuarioId  = Number(document.getElementById('comVendedorSelect')?.value || 0);
      const percentual = Number(document.getElementById('comPercentual')?.value || 0);
      const feedback   = document.getElementById('comConfigFeedback');
      const btn        = document.getElementById('comSalvarConfigBtn');

      if (!usuarioId) { if (feedback) { feedback.className = 'module-feedback module-feedback--error'; feedback.textContent = 'Selecione um vendedor.'; } return; }
      if (percentual < 0 || percentual > 100) { if (feedback) { feedback.className = 'module-feedback module-feedback--error'; feedback.textContent = 'Percentual deve ser entre 0 e 100.'; } return; }

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }

      try {
        await api.salvarComissaoConfig({ usuario_id: usuarioId, percentual, ativa: true });
        showToast('Configuração de comissão salva.', 'success');
        await this.load();
      } catch (err) {
        if (feedback) { feedback.className = 'module-feedback module-feedback--error'; feedback.textContent = buildFriendlyError(err); }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar'; }
      }
    });
  },

  // ── AÇÕES ─────────────────────────────────────────────────────────────────

  async executarAcao(id, acao, btnEl) {
    if (btnEl) btnEl.disabled = true;
    try {
      if (acao === 'pagar') {
        const dados = await this.promptPagamento();
        if (!dados) { if (btnEl) btnEl.disabled = false; return; }
        await api.pagarComissao(id, dados);
        showToast('Comissão marcada como paga.', 'success');
      } else if (acao === 'cancelar') {
        if (!await confirmarAcao('Cancelar esta comissão?')) { if (btnEl) btnEl.disabled = false; return; }
        await api.cancelarComissao(id);
        showToast('Comissão cancelada.', 'info');
      } else if (acao === 'del-config') {
        if (!await confirmarAcao('Remover configuração de comissão deste vendedor?')) { if (btnEl) btnEl.disabled = false; return; }
        await api.deleteComissaoConfig(id);
        showToast('Configuração removida.', 'success');
      }
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
      if (btnEl) btnEl.disabled = false;
    }
  },

  promptPagamento() {
    return new Promise((resolve) => {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:400px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 14px;font-size:16px;font-weight:700">Registrar pagamento</h3>
          <div style="display:grid;gap:12px;margin-bottom:16px">
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Data do pagamento</label>
              <input type="date" id="_comDataPgto" class="filter-input" style="width:100%" value="${hoje}" />
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Forma de pagamento</label>
              <select id="_comFormaPgto" class="filter-input" style="width:100%">
                <option value="Dinheiro">Dinheiro</option>
                <option value="Pix">Pix</option>
                <option value="Transferência">Transferência</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="_comCancelarPgto" class="btn-cancel">Cancelar</button>
            <button id="_comConfirmarPgto" class="btn-confirm">Confirmar pagamento</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.querySelector('#_comDataPgto')?.focus(), 50);
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); } });
      overlay.querySelector('#_comCancelarPgto').onclick = () => { document.body.removeChild(overlay); resolve(null); };
      overlay.querySelector('#_comConfirmarPgto').onclick = () => {
        const data  = overlay.querySelector('#_comDataPgto').value || hoje;
        const forma = overlay.querySelector('#_comFormaPgto').value;
        document.body.removeChild(overlay);
        resolve({ data_pagamento: data, forma_pagamento: forma });
      };
    });
  },

  exportar() {
    if (this.state.aba === 'resumo') {
      exportCSV(this.state.resumo.map((r) => ({
        'Vendedor':          r.vendedor_nome || r.vendedor_usuario || '-',
        'Total Vendas':      r.total_vendas || 0,
        'Faturamento (R$)':  numCSV(r.total_vendas_valor),
        'Comissao Total (R$)': numCSV(r.total_comissao),
        'A Pagar (R$)':      numCSV(r.pendente),
        'Pago (R$)':         numCSV(r.pago)
      })), 'comissoes_resumo');
    } else if (this.state.aba === 'detalhes') {
      exportCSV(this.state.comissoes.map((c) => ({
        'Vendedor':       c.vendedor_nome || c.vendedor_usuario || '-',
        'Venda':          c.venda_id ? `#${c.venda_id}` : '-',
        'Cliente':        c.cliente_nome || '-',
        'Data Venda':     this.fmtDate(c.data_venda),
        'Valor Venda (R$)': numCSV(c.valor_venda),
        '% Comissao':     Number(c.percentual || 0).toFixed(2),
        'Comissao (R$)':  numCSV(c.valor_comissao),
        'Status':         c.status || '-'
      })), 'comissoes_detalhes');
    }
  },

  // ── HELPERS ────────────────────────────────────────────────────────────────

  setFeedback(msg, type = 'info') {
    const el = document.getElementById('comFeedback');
    if (!el) return;
    if (!msg) { el.className = 'module-feedback'; el.textContent = ''; return; }
    el.className = `module-feedback module-feedback--${type}`;
    el.textContent = msg;
  },

  fmtCur(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  fmtDate(v) {
    if (!v) return '-';
    if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) {
      const [ano, mes, dia] = String(v).slice(0, 10).split('-');
      return `${dia}/${mes}/${ano}`;
    }
    return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
  },

};

export async function initComissoesModule() {
  ComissoesModule.init();
  await ComissoesModule.load();  // init() não chama load() — responsabilidade aqui
}

export default ComissoesModule;
