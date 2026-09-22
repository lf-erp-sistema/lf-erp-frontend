import api from './api.js';
import { showToast } from './feedback.js';
import { exportCSV, numCSV } from './exportUtils.js';
import { debounce } from './utils.js';

const DevolucoesModule = {
  state: {
    aba: 'nova',
    devolucoes: [],
    vendaCarregada: null,
    itensVenda: [],
    carregando: false,
    ordemHist: 'numero',
    ordemHistDir: 'desc',
    termoBusca: ''
  },

  init() {
    this._injectStyles();
    this.render();
    this.bindShellEvents();
    this.loadHistorico();
  },

  async loadHistorico() {
    try {
      const result = await api.getDevolucoes();
      this.state.devolucoes = result?.devolucoes || (Array.isArray(result) ? result : []);
      if (this.state.aba === 'historico') this.renderConteudo();
    } catch (err) {
      console.error('[devolucoes] loadHistorico:', err);
    }
  },

  render() {
    const c = document.getElementById('devolucoesContainer');
    if (!c) return;
    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="devFeedback"></div>
        <div class="module-toolbar">
          <div class="table-actions">
            <button class="btn-inline btn-inline--active" data-dev-aba="nova">Nova Devolução</button>
            <button class="btn-inline" data-dev-aba="historico">Histórico</button>
          </div>
          <div class="module-card__actions">
            <button class="btn btn-light" id="devExportarBtn">
              <i class="fa-solid fa-file-csv"></i> Exportar CSV
            </button>
            <button class="btn btn-light" id="devAtualizarBtn">
              <i class="fa-solid fa-rotate"></i> Atualizar
            </button>
          </div>
        </div>
        <div id="devConteudo"></div>
      </section>
    `;
    this.renderConteudo();
  },

  bindShellEvents() {
    const c = document.getElementById('devolucoesContainer');
    if (!c) return;

    document.getElementById('devAtualizarBtn')?.addEventListener('click', async () => {
      await this.loadHistorico();
      this.renderConteudo();
    });

    document.getElementById('devExportarBtn')?.addEventListener('click', () => {
      exportCSV(this.state.devolucoes.map((d) => ({
        'Nº':           d.numero || '',
        'Venda':        d.venda_id ? `#${d.venda_id}` : '-',
        'Cliente':      d.cliente_nome || 'Consumidor Final',
        'Motivo':       d.motivo || '',
        'Total (R$)':   numCSV(d.total_devolvido),
        'Status':       d.status || '',
        'Data':         d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR') : ''
      })), 'devolucoes');
    });

    const debouncedBusca = debounce(() => {
      const curval = this.state.termoBusca;
      this.renderConteudo();
      const inp = document.getElementById('devHistBusca');
      if (inp) { inp.focus(); try { inp.setSelectionRange(curval.length, curval.length); } catch (_) {} }
    }, 250);

    c.addEventListener('input', (e) => {
      if (e.target.id === 'devHistBusca') {
        this.state.termoBusca = e.target.value;
        debouncedBusca();
      }
    });

    c.addEventListener('click', (e) => {
      const abaBtn = e.target.closest('[data-dev-aba]');
      if (abaBtn) {
        this.state.aba = abaBtn.dataset.devAba;
        this.state.termoBusca = '';
        document.querySelectorAll('[data-dev-aba]').forEach((b) => b.classList.remove('btn-inline--active'));
        abaBtn.classList.add('btn-inline--active');
        this.renderConteudo();
        return;
      }

      const sortTh = e.target.closest('th[data-hist-sort]');
      if (sortTh) {
        const col = sortTh.dataset.histSort;
        if (this.state.ordemHist === col) {
          this.state.ordemHistDir = this.state.ordemHistDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.ordemHist = col;
          this.state.ordemHistDir = 'desc';
        }
        this.renderConteudo();
      }
    });
  },

  renderConteudo() {
    const c = document.getElementById('devConteudo');
    if (!c) return;
    if (this.state.aba === 'historico') { c.innerHTML = this.renderHistorico(); return; }
    c.innerHTML = this.renderNovaDevolucao();
    this.bindNovaDevEvents();
  },

  // ── NOVA DEVOLUÇÃO ─────────────────────────────────────────────────────────

  renderNovaDevolucao() {
    const venda = this.state.vendaCarregada;

    return `
      <div style="max-width:700px;margin-top:20px">
        <div class="panel-card" style="margin-bottom:20px">
          <div class="panel-card__header">
            <div><h3>Buscar venda</h3><p>Informe o ID da venda para carregar os itens</p></div>
          </div>
          <div class="panel-card__body">
            <div style="display:flex;gap:10px;align-items:flex-end">
              <div class="form-field" style="flex:1;margin:0">
                <label>ID da venda</label>
                <input type="number" id="devVendaId" placeholder="Ex: 42" min="1"
                  value="${venda ? venda.id : ''}" />
              </div>
              <button class="btn btn-light" id="devBuscarVendaBtn">
                <i class="fa-solid fa-magnifying-glass"></i> Buscar
              </button>
            </div>
            <div class="module-feedback" id="devBuscaFeedback" style="margin-top:10px"></div>
          </div>
        </div>

        ${venda ? this.renderFormDevolucao(venda) : ''}
      </div>
    `;
  },

  renderFormDevolucao(venda) {
    const itens = this.state.itensVenda;

    const linhas = itens.map((item, idx) => {
      const variacao = item.atributo1
        ? (item.atributo2 ? `${item.atributo1} / ${item.atributo2}` : item.atributo1)
        : '';
      return `
        <tr>
          <td>
            <strong>${this.esc(item.produto_nome || '-')}</strong>
            ${variacao ? `<small style="display:block;color:var(--text-muted)">${this.esc(variacao)}</small>` : ''}
          </td>
          <td class="text-right">${Number(item.quantidade || 0)}</td>
          <td class="text-right">${this.fmtCur(item.preco_unitario)}</td>
          <td class="text-right">${this.fmtCur(item.total)}</td>
          <td>
            <input type="number" class="dev-qtd-input"
              data-idx="${idx}"
              min="0" max="${Number(item.quantidade)}" step="1" value="0"
              style="width:70px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px;text-align:center"
            />
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="panel-card">
        <div class="panel-card__header">
          <div>
            <h3>Venda #${venda.id} — ${this.esc(venda.cliente_nome || 'Consumidor Final')}</h3>
            <p>Informe a quantidade a devolver por item (0 = não devolver)</p>
          </div>
        </div>
        <div class="panel-card__body">
          <div class="table-wrapper" style="margin-bottom:16px">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th class="text-right">Qtd Vendida</th>
                  <th class="text-right">Preço</th>
                  <th class="text-right">Total</th>
                  <th>Qtd a devolver</th>
                </tr>
              </thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>

          <div class="form-field" style="margin-bottom:12px">
            <label>Motivo da devolução</label>
            <input type="text" id="devMotivo" placeholder="Ex: Produto com defeito, tamanho errado..." maxlength="200" />
          </div>

          <div id="devTotalDinamico" class="dev-total-box" style="display:none">
            <span>Total a devolver</span>
            <strong id="devTotalDinamicoVal">R$ 0,00</strong>
          </div>

          <div class="module-feedback module-feedback--info" style="margin-bottom:12px">
            O estoque dos itens devolvidos será restaurado automaticamente.
            Um lançamento financeiro de devolução será gerado.
          </div>

          <button class="btn btn-primary" id="devRegistrarBtn">
            <i class="fa-solid fa-rotate-left"></i> Registrar Devolução
          </button>
          <div class="module-feedback" id="devRegistrarFeedback" style="margin-top:12px"></div>
        </div>
      </div>
    `;
  },

  bindNovaDevEvents() {
    document.getElementById('devVendaId')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('devBuscarVendaBtn')?.click();
    });

    document.getElementById('devConteudo')?.addEventListener('input', (e) => {
      if (e.target.classList.contains('dev-qtd-input')) this._calcTotalDevolucao();
    });

    document.getElementById('devBuscarVendaBtn')?.addEventListener('click', async () => {
      const vendaId = Number(document.getElementById('devVendaId')?.value || 0);
      const fb = document.getElementById('devBuscaFeedback');
      const btn = document.getElementById('devBuscarVendaBtn');

      if (!vendaId) { if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = 'Informe o ID da venda.'; } return; }

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
      if (fb) { fb.className = 'module-feedback module-feedback--info'; fb.textContent = 'Buscando venda...'; }

      try {
        const result = await api.getVendaDetalheParaDevolucao(vendaId);
        const detalhe = result?.venda || result;

        if (!detalhe) throw new Error('Venda não encontrada');

        this.state.vendaCarregada = detalhe;
        this.state.itensVenda     = detalhe.itens || [];

        if (fb) { fb.className = 'module-feedback module-feedback--success'; fb.textContent = `Venda #${vendaId} carregada — ${(detalhe.itens || []).length} item(s).`; }
        this.renderConteudo();
        this.bindNovaDevEvents();

        // Re-bind após re-render
        document.getElementById('devVendaId').value = vendaId;
      } catch (err) {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = err.message || 'Venda não encontrada.'; }
        this.state.vendaCarregada = null;
        this.state.itensVenda = [];
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Buscar'; }
      }
    });

    document.getElementById('devRegistrarBtn')?.addEventListener('click', async () => {
      const venda  = this.state.vendaCarregada;
      const itens  = this.state.itensVenda;
      const motivo = document.getElementById('devMotivo')?.value?.trim() || '';
      const btn    = document.getElementById('devRegistrarBtn');
      const fb     = document.getElementById('devRegistrarFeedback');

      const itensParaDevolver = [];
      document.querySelectorAll('.dev-qtd-input').forEach((input) => {
        const idx = Number(input.dataset.idx);
        const qtd = Number(input.value || 0);
        if (qtd > 0 && itens[idx]) {
          itensParaDevolver.push({
            produto_id: itens[idx].produto_id,
            grade_id:   itens[idx].grade_id || null,
            quantidade: qtd
          });
        }
      });

      if (itensParaDevolver.length === 0) {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = 'Informe a quantidade a devolver de ao menos um item.'; }
        return;
      }

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...'; }

      try {
        const result = await api.registrarDevolucao({
          venda_id: venda.id,
          motivo,
          itens: itensParaDevolver
        });

        showToast(result?.mensagem || 'Devolução registrada com sucesso!', 'success');
        this.state.vendaCarregada = null;
        this.state.itensVenda = [];
        await this.loadHistorico();
        this.renderConteudo();
      } catch (err) {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = err.message || 'Erro ao registrar devolução.'; }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Registrar Devolução'; }
      }
    });
  },

  // ── HISTÓRICO ─────────────────────────────────────────────────────────────

  renderHistorico() {
    const si = (col) => {
      if (this.state.ordemHist !== col) return '<span class="sort-icon sort-icon--idle">⇅</span>';
      return this.state.ordemHistDir === 'asc'
        ? '<span class="sort-icon sort-icon--asc">↑</span>'
        : '<span class="sort-icon sort-icon--desc">↓</span>';
    };

    const termo = String(this.state.termoBusca || '').toLowerCase();
    let devs = this.state.devolucoes.filter((d) => {
      if (!termo) return true;
      return (
        String(d.numero || '').toLowerCase().includes(termo) ||
        String(d.cliente_nome || '').toLowerCase().includes(termo) ||
        String(d.motivo || '').toLowerCase().includes(termo)
      );
    });

    const dir = this.state.ordemHistDir === 'asc' ? 1 : -1;
    devs = [...devs].sort((a, b) => {
      const col = this.state.ordemHist;
      if (col === 'numero') return dir * (Number(a.numero || 0) - Number(b.numero || 0));
      if (col === 'total')  return dir * (Number(a.total_devolvido || 0) - Number(b.total_devolvido || 0));
      if (col === 'data')   return dir * String(a.criado_em || '').localeCompare(String(b.criado_em || ''));
      return 0;
    });

    const totDev   = this.state.devolucoes.reduce((s, d) => s + Number(d.total_devolvido || 0), 0);
    const totItens = this.state.devolucoes.reduce((s, d) => s + Number(d.total_itens || 0), 0);

    const toolbar = `
      <div class="module-toolbar" style="margin-top:8px;margin-bottom:12px">
        <div class="module-toolbar__search">
          <i class="fa-solid fa-search"></i>
          <input id="devHistBusca" placeholder="Buscar cliente, motivo ou Nº..." value="${this.esc(this.state.termoBusca)}" />
        </div>
        <div class="module-toolbar__stats">
          <div class="mini-stat"><span>Devoluções</span><strong>${this.state.devolucoes.length}</strong></div>
          <div class="mini-stat"><span>Total devolvido</span><strong>${this.fmtCur(totDev)}</strong></div>
          <div class="mini-stat"><span>Itens devolvidos</span><strong>${totItens}</strong></div>
        </div>
      </div>`;

    if (!devs.length) {
      const msg = termo ? 'Nenhuma devolução encontrada para essa busca.' : 'Nenhuma devolução registrada ainda.';
      return toolbar + `
        <div class="empty-table-state">
          <i class="fa-solid fa-rotate-left" style="font-size:2rem;opacity:.22;margin-bottom:4px"></i>
          <strong>Nenhuma devolução encontrada</strong>
          <span>${msg}</span>
        </div>`;
    }

    const linhas = devs.map((d) => `
      <tr>
        <td><strong>#${d.numero}</strong></td>
        <td>${d.venda_id ? `Venda #${d.venda_id}` : '-'}</td>
        <td>${this.esc(d.cliente_nome || 'Consumidor Final')}</td>
        <td>${Number(d.total_itens || 0)}</td>
        <td class="text-right"><strong>${this.fmtCur(d.total_devolvido)}</strong></td>
        <td>${this.esc(d.motivo || '—')}</td>
        <td>${this.fmtStatusBadge(d.status || 'processada')}</td>
        <td>${this.fmtData(d.criado_em)}</td>
      </tr>
    `).join('');

    return toolbar + `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th data-hist-sort="numero" style="cursor:pointer">Nº ${si('numero')}</th>
              <th>Venda</th>
              <th>Cliente</th>
              <th>Itens</th>
              <th class="text-right" data-hist-sort="total" style="cursor:pointer">Total ${si('total')}</th>
              <th>Motivo</th>
              <th>Status</th>
              <th data-hist-sort="data" style="cursor:pointer">Data ${si('data')}</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  },

  // ── HELPERS ───────────────────────────────────────────────────────────────

  setFeedback(msg, type = 'info') {
    const el = document.getElementById('devFeedback');
    if (!el) return;
    if (!msg) { el.className = 'module-feedback'; el.textContent = ''; return; }
    el.className = `module-feedback module-feedback--${type}`;
    el.textContent = msg;
  },

  fmtCur(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  fmtData(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return this.esc(String(val));
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Fortaleza',
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(d);
  },

  fmtStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    const mapa = {
      processada: { cls: 'badge--success', label: 'Processada' },
      aprovada:   { cls: 'badge--success', label: 'Aprovada'   },
      pendente:   { cls: 'badge--warning', label: 'Pendente'   },
      cancelada:  { cls: 'badge--danger',  label: 'Cancelada'  },
    };
    const entry = mapa[s];
    if (entry) return `<span class="badge ${entry.cls}">${entry.label}</span>`;
    return `<span class="badge badge--info">${this.esc(status)}</span>`;
  },

  _calcTotalDevolucao() {
    const itens = this.state.itensVenda;
    let total = 0;
    document.querySelectorAll('.dev-qtd-input').forEach((input) => {
      const idx = Number(input.dataset.idx);
      const qtd = Math.min(Number(input.value || 0), Number(input.max || 0));
      if (qtd > 0 && itens[idx]) {
        total += qtd * Number(itens[idx].preco_unitario || 0);
      }
    });
    const box = document.getElementById('devTotalDinamico');
    const val = document.getElementById('devTotalDinamicoVal');
    if (box) box.style.display = total > 0 ? '' : 'none';
    if (val) val.textContent = this.fmtCur(total);
  },

  _injectStyles() {
    if (document.getElementById('_devStyles')) return;
    const style = document.createElement('style');
    style.id = '_devStyles';
    style.textContent = `
      .sort-icon { font-size:.75rem; margin-left:3px; }
      .sort-icon--idle { opacity:.35; }
      .sort-icon--asc, .sort-icon--desc { color:var(--primary,#2563eb); opacity:.9; }
      .dev-total-box { display:flex; align-items:center; justify-content:space-between;
        padding:12px 16px; border-radius:10px; background:rgba(37,99,235,.08);
        border:1px solid rgba(37,99,235,.18); margin-bottom:12px; font-size:.9rem; }
      .dev-total-box strong { font-size:1.1rem; color:var(--primary,#2563eb); }
      @media (prefers-color-scheme:dark) {
        .dev-total-box { background:rgba(96,165,250,.1); border-color:rgba(96,165,250,.2); }
        .dev-total-box strong { color:#60a5fa; }
      }
    `;
    document.head.appendChild(style);
  },

  esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
};

export async function initDevolucoesModule() {
  DevolucoesModule.init();
  await DevolucoesModule.loadHistorico();
}

export default DevolucoesModule;
