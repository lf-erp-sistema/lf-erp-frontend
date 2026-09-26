import api from './api.js';
import { getAuth } from './auth.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, debounce } from './utils.js';

const EstoqueModule = {
  state: {
    items: [],
    filteredItems: [],
    initialized: false,
    eventsBound: false,
    loading: false,
    empresa: '',
    ordem: 'nome',
    ordemDir: 'asc',
    viewMode: 'em_estoque' // 'em_estoque' | 'em_falta'
  },

  init() {
    const auth = getAuth();
    this.state.empresa = api.getEmpresaNome() || auth?.empresa?.nome || auth?.user?.empresa || '';

    if (!this.state.initialized) {
      this.state.initialized = true;
      this.render();
      this.cache();
      this.bind();
    } else {
      this.cache();
    }
  },

  cache() {
    this.el = {
      table: document.getElementById('estoqueTable'),
      search: document.getElementById('estoqueSearch'),
      status: document.getElementById('estoqueStatusFiltro'),
      totalProdutos: document.getElementById('estoqueTotalProdutos'),
      totalBaixo: document.getElementById('estoqueTotalBaixo'),
      totalZerado: document.getElementById('estoqueTotalZerado'),
      feedback: document.getElementById('estoqueFeedback'),
      faltaBtn: document.getElementById('estoqueFaltaBtn'),
      faltaCount: document.getElementById('estoqueFaltaCount'),
      viewTitle: document.getElementById('estoqueViewTitle')
    };
  },

  bind() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;
    this._injectStyles();

    const debouncedFilters = debounce(() => this.applyFilters(), 350);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'estoqueSearch') {
        debouncedFilters();
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'estoqueStatusFiltro') {
        this.applyFilters();
      }
    });

    document.addEventListener('click', async (e) => {
      const th = e.target.closest('th[data-sort-col]');
      if (th) {
        const col = th.dataset.sortCol;
        if (this.state.ordem === col) {
          this.state.ordemDir = this.state.ordemDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.ordem = col;
          this.state.ordemDir = (col === 'estoque' || col === 'preco' || col === 'custo') ? 'desc' : 'asc';
        }
        this.render();
        this.cache();
        this.applyFilters();
        return;
      }

      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.id === 'estoqueAtualizarBtn') {
        await this.load();
      }

      if (btn.id === 'estoqueFaltaBtn') {
        this.state.viewMode = this.state.viewMode === 'em_falta' ? 'em_estoque' : 'em_falta';
        this.applyFilters();
        this.updateFaltaBtn();
      }

      if (btn.id === 'estoqueSugestaoBtn') {
        await this.abrirSugestaoCompra();
      }

      if (btn.id === 'estoqueDepositosBtn') {
        await this.abrirDepositos();
      }

      if (btn.id === 'sugestaoFecharBtn') {
        document.getElementById('sugestaoCompraModal')?.classList.add('hidden');
      }

      if (btn.id === 'depositosFecharBtn') {
        document.getElementById('depositosModal')?.classList.add('hidden');
      }

      if (btn.id === 'depositoNovoBtn') {
        await this.criarDeposito();
      }

      if (btn.id === 'depositosFecharBtn2') {
        document.getElementById('depositosModal')?.classList.add('hidden');
      }

      if (btn.dataset.action === 'verEstoqueDeposito') {
        await this.verEstoqueDeposito(Number(btn.dataset.id), btn.dataset.nome || '');
      }

      if (btn.dataset.action === 'excluirDeposito') {
        await this.excluirDeposito(Number(btn.dataset.id));
      }

      if (btn.dataset.action === 'renderDepositos') {
        await this._renderDepositos();
      }
    });
  },

  async load() {
    this.state.loading = true;
    this.state.viewMode = 'em_estoque';
    this.setFeedback('Carregando estoque...', 'info');
    this.setLoading(true);
    try {
      const data = await api.getProdutos();

      this.state.items = Array.isArray(data) ? data : [];

      this.render();
      this.cache();
      this.applyFilters();
      this.setFeedback('', 'info');
    } catch (error) {
      console.error('Erro ao carregar estoque:', error);
      this.state.items = [];

      this.render();
      this.cache();
      this.applyFilters();
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
      this.setLoading(false);
    }
  },

  render() {
    const c = document.getElementById('estoqueContainer');
    if (!c) return;

    const si = (col) => {
      if (this.state.ordem !== col) return '<span class="sort-icon sort-icon--idle">⇅</span>';
      return this.state.ordemDir === 'asc'
        ? '<span class="sort-icon sort-icon--asc">↑</span>'
        : '<span class="sort-icon sort-icon--desc">↓</span>';
    };

    c.innerHTML = `
      <section class="module-card">
        <div id="estoqueFeedback" class="module-feedback"></div>

        <!-- Toolbar unificado -->
        <div class="est-top-bar">
          <span id="estoqueViewTitle" class="est-view-title">Produtos em estoque</span>
          <div class="estoque-search-box" style="flex:1;min-width:180px">
            <i class="fa-solid fa-search"></i>
            <input id="estoqueSearch" placeholder="Buscar por nome, categoria ou código de barras..."
              value="${escapeHtml(this.getCurrentSearchValue())}" />
          </div>
          <select id="estoqueStatusFiltro" class="est-sel">
            <option value="">Todos</option>
            <option value="normal" ${this.getCurrentStatusValue() === 'normal' ? 'selected' : ''}>Estoque normal</option>
            <option value="baixo" ${this.getCurrentStatusValue() === 'baixo' ? 'selected' : ''}>Baixo estoque</option>
            <option value="sem_estoque" ${this.getCurrentStatusValue() === 'sem_estoque' ? 'selected' : ''}>Sem estoque</option>
          </select>
          <div class="est-top-actions">
            <div class="est-btn-group">
              <button class="est-group-btn" id="estoqueFaltaBtn" type="button">
                <i class="fa-solid fa-circle-exclamation"></i>
                <span class="est-lbl">Em falta</span>
                <span id="estoqueFaltaCount" class="badge badge--danger" style="margin-left:4px;display:none">0</span>
              </button>
              <button class="est-group-btn" id="estoqueDepositosBtn" type="button">
                <i class="fa-solid fa-warehouse"></i><span class="est-lbl">Depósitos</span>
              </button>
              <button class="est-group-btn" id="estoqueSugestaoBtn" type="button">
                <i class="fa-solid fa-cart-shopping"></i><span class="est-lbl">Sugestão</span>
              </button>
            </div>
            <button class="est-refresh-btn" id="estoqueAtualizarBtn" type="button" title="Atualizar">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
        </div>

        <!-- KPI strip conectado -->
        <div class="est-kpi-strip">
          <div class="est-kpi-item">
            <span class="est-kpi-lbl">Total de produtos</span>
            <strong class="est-kpi-val" id="estoqueTotalProdutos">0</strong>
          </div>
          <div class="est-kpi-sep"></div>
          <div class="est-kpi-item">
            <span class="est-kpi-lbl">Total em estoque</span>
            <strong class="est-kpi-val" id="estoqueTotalUnidades">0</strong>
          </div>
          <div class="est-kpi-sep"></div>
          <div class="est-kpi-item">
            <span class="est-kpi-lbl">Baixo estoque</span>
            <strong class="est-kpi-val est-kpi-warn" id="estoqueTotalBaixo">0</strong>
          </div>
          <div class="est-kpi-sep"></div>
          <div class="est-kpi-item">
            <span class="est-kpi-lbl">Sem estoque</span>
            <strong class="est-kpi-val est-kpi-danger" id="estoqueTotalZerado">0</strong>
          </div>
          <div class="est-kpi-sep est-kpi-sep--group"></div>
          <div class="est-kpi-item">
            <span class="est-kpi-lbl">Custo do estoque</span>
            <strong class="est-kpi-val" id="estoqueValorCusto">R$ 0,00</strong>
          </div>
          <div class="est-kpi-sep"></div>
          <div class="est-kpi-item">
            <span class="est-kpi-lbl">Valor de venda</span>
            <strong class="est-kpi-val" id="estoqueValorVenda">R$ 0,00</strong>
          </div>
          <div class="est-kpi-sep"></div>
          <div class="est-kpi-item">
            <span class="est-kpi-lbl">Lucro estimado</span>
            <strong class="est-kpi-val est-kpi-ok" id="estoqueValorLucro">R$ 0,00</strong>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th data-sort-col="nome" style="cursor:pointer">Produto ${si('nome')}</th>
                <th data-sort-col="categoria" style="cursor:pointer">Categoria ${si('categoria')}</th>
                <th>Código</th>
                <th data-sort-col="preco" style="cursor:pointer">Preço ${si('preco')}</th>
                <th data-sort-col="custo" style="cursor:pointer">Custo ${si('custo')}</th>
                <th data-sort-col="estoque" style="cursor:pointer">Estoque ${si('estoque')}</th>
                <th>Mínimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="estoqueTable"></tbody>
          </table>
        </div>
      </section>
    `;
  },

  renderTable() {
    if (!this.el.table) return;

    if (!this.state.filteredItems.length) {
      const emFalta = this.state.viewMode === 'em_falta';
      const msg = emFalta
        ? 'Nenhum produto com estoque zerado no momento.'
        : 'Nenhum produto encontrado com os filtros aplicados.';
      this.el.table.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-table-state">
              <i class="fa-solid fa-warehouse" style="font-size:2rem;opacity:.22;margin-bottom:4px"></i>
              <strong>Nenhum produto encontrado</strong>
              <span>${msg}</span>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const termo = String(this.el.search?.value || '').trim().toLowerCase();

    this.el.table.innerHTML = this.state.filteredItems
      .map((produto) => {
        const estoque = Number(produto.estoque || 0);
        const estoqueMinimo = Number(produto.estoque_minimo || 0);
        const status = this.getStatusProduto(produto);
        const preco = Number(produto.preco || 0);
        const custo = Number(produto.custo || 0);
        const margem = preco > 0 ? Math.round(((preco - custo) / preco) * 100) : null;
        const margemHtml = margem !== null
          ? `<span class="est-margem ${margem < 0 ? 'est-margem--neg' : margem < 20 ? 'est-margem--low' : 'est-margem--ok'}">${margem}% mg</span>`
          : '';
        const estoqueClass = estoque === 0 ? 'est-qty--zero' : (estoqueMinimo > 0 && estoque <= estoqueMinimo ? 'est-qty--baixo' : '');
        const codigo = produto.codigo_barras || '';
        const codigoDisplay = codigo.length > 14 ? codigo.slice(0, 13) + '…' : codigo;

        return `
        <tr>
          <td>
            <div class="table-primary">
              <strong>${this._highlight(escapeHtml(produto.nome || '-'), termo)}</strong>
            </div>
          </td>
          <td>${this._highlight(escapeHtml(produto.categoria || '-'), termo)}</td>
          <td>${codigo ? `<span title="${escapeHtml(codigo)}">${this._highlight(escapeHtml(codigoDisplay), termo)}</span>` : '-'}</td>
          <td>${formatCurrency(preco)}</td>
          <td>
            ${formatCurrency(custo)}
            ${margemHtml}
          </td>
          <td class="${estoqueClass}">${estoque}</td>
          <td>${estoqueMinimo || '-'}</td>
          <td>${status}</td>
        </tr>
      `;
      })
      .join('');
  },

  applyFilters() {
    const termo = String(this.el.search?.value || '').trim().toLowerCase();
    const status = String(this.el.status?.value || '').trim();
    const emFalta = this.state.viewMode === 'em_falta';
    const mostrarSemEstoque = status === 'sem_estoque';

    this.state.filteredItems = this.state.items.filter((produto) => {
      const estoque = Number(produto.estoque || 0);
      const estoqueMinimo = Number(produto.estoque_minimo || 0);

      if (mostrarSemEstoque) {
        if (estoque !== 0) return false;
      } else if (emFalta) {
        if (estoque !== 0) return false;
      } else {
        if (estoque === 0) return false;
      }

      const nome = String(produto.nome || '').toLowerCase();
      const categoria = String(produto.categoria || '').toLowerCase();
      const codigo = String(produto.codigo_barras || '').toLowerCase();
      const matchTexto = !termo || nome.includes(termo) || categoria.includes(termo) || codigo.includes(termo);
      if (!matchTexto) return false;

      if (!emFalta && !mostrarSemEstoque && status) {
        if (status === 'baixo') return estoqueMinimo > 0 && estoque <= estoqueMinimo;
        if (status === 'normal') return estoqueMinimo <= 0 || estoque > estoqueMinimo;
      }

      return true;
    });

    this._sortItems();
    this.updateStats();
    this.renderTable();

    if (!this.state.filteredItems.length) {
      this.setFeedback(
        emFalta ? 'Nenhum produto com estoque zerado.' : 'Nenhum produto encontrado com os filtros aplicados.',
        'info'
      );
    } else {
      this.setFeedback('', 'info');
    }
  },

  updateStats() {
    const totalProdutos = this.state.filteredItems.length;
    const totalUnidades = this.state.items.reduce((acc, p) => acc + Number(p.estoque || 0), 0);
    const totalBaixo = this.state.filteredItems.filter((produto) => {
      const estoque = Number(produto.estoque || 0);
      const estoqueMinimo = Number(produto.estoque_minimo || 0);
      return estoque > 0 && estoqueMinimo > 0 && estoque <= estoqueMinimo;
    }).length;

    // Total zerado calculado sobre TODOS os itens (não só filtrados)
    const totalZerado = this.state.items.filter((p) => Number(p.estoque || 0) === 0).length;

    const { custo, venda, lucro } = this.getValoresEstoque();

    if (this.el.totalProdutos) this.el.totalProdutos.textContent = String(totalProdutos);
    const elUnidades = document.getElementById('estoqueTotalUnidades');
    if (elUnidades) elUnidades.textContent = totalUnidades.toLocaleString('pt-BR');
    if (this.el.totalBaixo) this.el.totalBaixo.textContent = String(totalBaixo);
    if (this.el.totalZerado) this.el.totalZerado.textContent = String(totalZerado);
    const elCusto = document.getElementById('estoqueValorCusto');
    const elVenda = document.getElementById('estoqueValorVenda');
    const elLucro = document.getElementById('estoqueValorLucro');
    if (elCusto) elCusto.textContent = custo;
    if (elVenda) elVenda.textContent = venda;
    if (elLucro) elLucro.textContent = lucro;

    this.updateFaltaBtn(totalZerado);
  },

  updateFaltaBtn(totalZerado) {
    const count = totalZerado !== undefined
      ? totalZerado
      : this.state.items.filter((p) => Number(p.estoque || 0) === 0).length;

    const emFalta = this.state.viewMode === 'em_falta';

    if (this.el.faltaBtn) {
      this.el.faltaBtn.innerHTML = emFalta
        ? '<i class="fa-solid fa-arrow-left"></i><span class="est-lbl">Ver todos</span>'
        : `<i class="fa-solid fa-circle-exclamation"></i><span class="est-lbl">Em falta</span>${count > 0 ? ` <span class="badge badge--danger" style="margin-left:4px">${count}</span>` : ''}`;
      this.el.faltaBtn.className = emFalta ? 'est-group-btn active' : 'est-group-btn';
    }

    if (this.el.viewTitle) {
      this.el.viewTitle.textContent = emFalta ? 'Produtos em falta (sem estoque)' : 'Produtos em estoque';
    }
  },

  getStatusProduto(produto) {
    const estoque = Number(produto.estoque || 0);
    const estoqueMinimo = Number(produto.estoque_minimo || 0);

    if (estoque === 0) {
      return `<span class="badge badge--danger">Crítico</span>`;
    }

    if (estoqueMinimo > 0 && estoque <= estoqueMinimo) {
      return `<span class="badge badge--warning">Baixo</span>`;
    }

    return `<span class="badge badge--success">Normal</span>`;
  },

  getCurrentSearchValue() {
    return document.getElementById('estoqueSearch')?.value || '';
  },

  getCurrentStatusValue() {
    return document.getElementById('estoqueStatusFiltro')?.value || '';
  },

  setFeedback(message, type = '') {
    const feedback = document.getElementById('estoqueFeedback');
    if (!feedback) return;

    feedback.className = 'module-feedback';

    if (!message) {
      feedback.innerHTML = '';
      return;
    }

    if (type === 'success') {
      feedback.classList.add('module-feedback--success');
    } else if (type === 'error') {
      feedback.classList.add('module-feedback--error');
    } else {
      feedback.classList.add('module-feedback--info');
    }

    feedback.textContent = message;
  },

  showMessage(message, type = 'info') {
    this.setFeedback(message, type);

    showToast(message, type);
  },

  setLoading(value) {
    this.state.loading = value;
    this.cache();

    if (this.el.search) this.el.search.disabled = value;
    if (this.el.status) this.el.status.disabled = value;

    const btnAtualizar = document.getElementById('estoqueAtualizarBtn');
    if (btnAtualizar) btnAtualizar.disabled = value;

    if (btnAtualizar) {
      btnAtualizar.innerHTML = value
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...'
        : '<i class="fa-solid fa-rotate"></i> Atualizar';
    }
  },

  buildFriendlyError(error) {
    const message = error?.message || '';

    if (message.includes('Failed to fetch')) {
      return 'Não foi possível conectar ao backend.';
    }

    if (error?.status === 403) {
      return 'Acesso negado ou limite do plano atingido.';
    }

    return message || 'Não foi possível concluir a operação.';
  },

  getValoresEstoque() {
    let totalCusto = 0;
    let totalVenda = 0;
    this.state.items.forEach((p) => {
      const qty = Number(p.estoque || 0);
      totalCusto += qty * Number(p.custo_medio || p.custo || 0);
      totalVenda += qty * Number(p.preco || 0);
    });
    const lucro = totalVenda - totalCusto;
    return {
      custo: formatCurrency(totalCusto),
      venda: formatCurrency(totalVenda),
      lucro: formatCurrency(lucro),
    };
  },

  _sortItems() {
    const { ordem, ordemDir } = this.state;
    const dir = ordemDir === 'asc' ? 1 : -1;
    this.state.filteredItems.sort((a, b) => {
      if (ordem === 'estoque') return dir * (Number(a.estoque || 0) - Number(b.estoque || 0));
      if (ordem === 'preco')   return dir * (Number(a.preco || 0) - Number(b.preco || 0));
      if (ordem === 'custo')   return dir * (Number(a.custo || 0) - Number(b.custo || 0));
      if (ordem === 'nome')    return dir * String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      if (ordem === 'categoria') return dir * String(a.categoria || '').localeCompare(String(b.categoria || ''), 'pt-BR');
      return 0;
    });
  },

  _highlight(text, term) {
    if (!term) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="est-hl">$1</mark>');
  },

  _injectStyles() {
    if (document.getElementById('_estoqueStyles')) return;
    const style = document.createElement('style');
    style.id = '_estoqueStyles';
    style.textContent = `
      .sort-icon { font-size:.75rem; margin-left:3px; }
      .sort-icon--idle { opacity:.35; }
      .sort-icon--asc, .sort-icon--desc { color:var(--primary,#2563eb); opacity:.9; }
      mark.est-hl { background:rgba(234,179,8,.35); color:inherit; border-radius:2px; padding:0 1px; }
      .est-qty--zero  { color:var(--danger,#dc2626); font-weight:700; }
      .est-qty--baixo { color:var(--warning,#d97706); font-weight:700; }
      .est-margem { display:inline-block; font-size:.7rem; font-weight:600; padding:1px 5px; border-radius:8px; margin-top:2px; }
      .est-margem--ok  { background:rgba(34,197,94,.14); color:#15803d; }
      .est-margem--low { background:rgba(234,179,8,.18); color:#92400e; }
      .est-margem--neg { background:rgba(239,68,68,.13); color:#b91c1c; }
      @media (prefers-color-scheme:dark) {
        .est-qty--zero  { color:#f87171; }
        .est-qty--baixo { color:#fbbf24; }
        .est-margem--ok  { background:rgba(34,197,94,.18); color:#4ade80; }
        .est-margem--low { background:rgba(234,179,8,.2); color:#fbbf24; }
        .est-margem--neg { background:rgba(239,68,68,.18); color:#f87171; }
      }
      /* ── Toolbar unificado ─────────────────────── */
      .est-top-bar {
        display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;
      }
      .est-view-title {
        font-size: .78rem; font-weight: 700; color: var(--text-muted); white-space: nowrap; flex-shrink: 0;
      }
      .estoque-search-box {
        display: flex; align-items: center; gap: 8px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 12px; padding: 0 14px; min-height: 40px; transition: border-color .15s;
      }
      .estoque-search-box:focus-within { border-color: var(--primary); }
      .estoque-search-box i { color: var(--text-muted); font-size: .85rem; flex-shrink: 0; }
      .estoque-search-box input {
        border: none; background: transparent; flex: 1;
        font-size: 14px; outline: none; color: var(--text);
      }
      .est-sel {
        border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); color: var(--text);
        font-size: 13px; padding: 0 12px; min-height: 40px; min-width: 148px;
        outline: none; cursor: pointer; transition: border-color .15s;
      }
      .est-sel:focus { border-color: var(--primary); }
      .est-top-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
      .est-btn-group {
        display: flex; align-items: stretch;
        border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
        background: var(--surface);
      }
      .est-group-btn {
        border: none; border-left: 1px solid var(--border);
        background: transparent; color: var(--text-muted);
        font-size: 13px; font-weight: 500; height: 40px; padding: 0 14px;
        display: flex; align-items: center; gap: 6px;
        cursor: pointer; white-space: nowrap; transition: background .15s, color .15s;
      }
      .est-group-btn:first-child { border-left: none; }
      .est-group-btn:hover { background: var(--hover, rgba(0,0,0,.05)); color: var(--text); }
      .est-group-btn.active { background: rgba(var(--primary-rgb, 59,130,246),.08); color: var(--primary); }
      .est-refresh-btn {
        width: 40px; height: 40px; padding: 0; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); color: var(--text-muted);
        cursor: pointer; transition: background .15s, color .15s;
      }
      .est-refresh-btn:hover { background: var(--hover, rgba(0,0,0,.05)); color: var(--text); }
      @media (max-width: 860px) { .est-lbl { display: none; } }

      /* ── KPI strip conectado ────────────────────── */
      .est-kpi-strip {
        display: flex; align-items: stretch;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 18px; margin-bottom: 20px; overflow-x: auto; overflow-y: hidden;
        box-shadow: 0 1px 6px rgba(0,0,0,.05);
      }
      .est-kpi-item {
        flex: 1 1 110px; min-width: 110px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;
      }
      .est-kpi-lbl {
        font-size: .64rem; font-weight: 800; color: var(--text-muted);
        text-transform: uppercase; letter-spacing: .06em;
        white-space: normal; line-height: 1.3;
      }
      .est-kpi-val {
        font-size: 1.15rem; font-weight: 900; color: var(--text);
        letter-spacing: -.02em; font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .est-kpi-warn   { color: var(--warning, #ca8a04); }
      .est-kpi-danger { color: var(--danger,  #dc2626); }
      .est-kpi-ok     { color: var(--success, #16a34a); }
      .est-kpi-sep {
        width: 1px; background: var(--border); margin: 10px 0; flex-shrink: 0;
      }
      .est-kpi-sep--group { margin: 0; background: var(--border); opacity: .7; }
      @media (max-width: 900px) {
        .est-kpi-strip { flex-wrap: wrap; }
        .est-kpi-sep { display: none; }
        .est-kpi-item { flex: 0 0 33.33%; border-bottom: 1px solid var(--border); padding: 12px 14px; }
      }
    `;
    document.head.appendChild(style);
  },

  _injectEstStyles() {
    if (document.getElementById('est-nc-styles')) return;
    const s = document.createElement('style');
    s.id = 'est-nc-styles';
    s.textContent = `
      .est-nc-card { width: min(96vw, 560px) !important; max-height: 92vh; }
      .est-nc-body { overflow-y: auto; }
      .est-nc-section { padding: 16px 20px 0; }
      .est-nc-section:last-child { padding-bottom: 20px; }
      .est-nc-section-title { font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8px; }
      .est-nc-card-group { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
      .est-nc-cell { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface); transition: background .1s; }
      .est-nc-cell:last-child { border-bottom: none; }
      .est-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
      .est-nc-cells-2col { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border); }
      .est-nc-cells-2col:last-child { border-bottom: none; }
      .est-nc-cells-2col .est-nc-cell { border-bottom: none; }
      .est-nc-cells-2col .est-nc-cell:first-child { border-right: 1px solid var(--border); }
      .est-nc-cell-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; background: var(--surface-2); color: var(--text-muted); }
      .est-nc-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
      .est-nc-cell-ico--blue { background: rgba(37,99,235,.1); color: #2563eb; }
      .est-nc-cell-ico--red { background: rgba(220,38,38,.1); color: #dc2626; }
      .est-nc-cell-ico--purple { background: rgba(124,58,237,.1); color: #7c3aed; }
      .est-nc-cell-ico--orange { background: rgba(234,88,12,.1); color: #ea580c; }
      .est-nc-cell-content { flex: 1; min-width: 0; }
      .est-nc-lbl { display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
      .est-nc-req { color: #dc2626; }
      .est-nc-cell-input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-size: 0.93rem; font-weight: 600; color: var(--text); width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none; }
      select.est-nc-cell-input { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat !important; background-position: right 0 center !important; padding-right: 16px !important; }
      .est-nc-obs { width: 100%; resize: none; font-size: 0.9rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; font-family: inherit; color: var(--text); box-sizing: border-box; }
      @media (max-width: 600px) {
        .est-nc-section { padding: 14px 16px 0; }
        .est-nc-cells-2col { grid-template-columns: 1fr; }
        .est-nc-cells-2col .est-nc-cell:first-child { border-right: none; border-bottom: 1px solid var(--border); }
      }
    `;
    document.head.appendChild(s);
  },

  // ── Sugestão automática de compra ─────────────────────────────────────────

  // ── Multi-depósito ──────────────────────────────────────────────────────────

  async abrirDepositos() {
    this._injectEstStyles();
    if (!document.getElementById('depositosModal')) {
      const el = document.createElement('div');
      el.className = 'modal-overlay hidden';
      el.id = 'depositosModal';
      el.innerHTML = `
        <div class="modal-card" style="max-width:700px;width:95vw">
          <div class="modal-card__header">
            <div>
              <h3><i class="fa-solid fa-warehouse" style="margin-right:8px"></i>Depósitos</h3>
              <p style="color:var(--text-muted);font-size:.9rem">Gerencie locais de armazenamento</p>
            </div>
            <button type="button" class="icon-button" id="depositosFecharBtn" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div id="depositosCorpo" style="padding:20px 24px 24px;overflow-y:auto;max-height:70vh"></div>
          <div class="modal-card__footer" style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <button type="button" class="btn btn-primary" id="depositoNovoBtn">
              <i class="fa-solid fa-plus"></i> Novo depósito
            </button>
            <button type="button" class="btn btn-light" id="depositosFecharBtn2">Fechar</button>
          </div>
        </div>`;
      document.body.appendChild(el);
    }

    document.getElementById('depositosModal').classList.remove('hidden');
    await this._renderDepositos();
  },

  async _renderDepositos() {
    const corpo = document.getElementById('depositosCorpo');
    if (!corpo) return;
    corpo.innerHTML = `<div class="module-feedback module-feedback--info">Carregando...</div>`;

    try {
      const empresa = this.state.empresa || '';
      const data = await api.request('/depositos', { method: 'GET', query: { empresa, empresa_id: api.getEmpresaId() } });
      const lista = data.depositos || [];

      if (!lista.length) {
        corpo.innerHTML = `
          <div class="empty-state">Nenhum depósito cadastrado. Clique em "Novo depósito" para começar.</div>`;
        return;
      }

      corpo.innerHTML = `
        <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Depósito</th><th>Produtos</th><th>Unidades</th><th>Status</th><th class="text-right">Ações</th>
          </tr></thead>
          <tbody>
            ${lista.map((d) => `
              <tr>
                <td>
                  <div class="table-primary">
                    <strong>${escapeHtml(d.nome)}</strong>
                    ${d.principal ? '<span class="badge badge--primary" style="font-size:.7rem;margin-left:6px">Principal</span>' : ''}
                    ${d.descricao ? `<small style="color:var(--text-muted)">${escapeHtml(d.descricao)}</small>` : ''}
                  </div>
                </td>
                <td>${d.total_produtos || 0}</td>
                <td>${d.total_unidades || 0}</td>
                <td><span class="badge ${d.ativo ? 'badge--success' : 'badge--warning'}">${d.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td class="text-right">
                  <button class="btn-inline" type="button" data-action="verEstoqueDeposito" data-id="${d.id}" data-nome="${escapeHtml(d.nome)}">
                    <i class="fa-solid fa-eye"></i> Ver estoque
                  </button>
                  ${!d.principal ? `
                    <button class="btn-inline btn-inline--danger" type="button"
                      data-action="excluirDeposito" data-id="${d.id}" aria-label="Excluir depósito ${escapeHtml(d.nome)}">
                      <i class="fa-solid fa-trash"></i>
                    </button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        </div>`;
    } catch (err) {
      corpo.innerHTML = `<div class="module-feedback module-feedback--error">${escapeHtml(err.message)}</div>`;
    }
  },

  async criarDeposito() {
    const dados = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card est-nc-card" style="max-width:400px">
          <div class="modal-card__header">
            <div>
              <h3>Novo Depósito</h3>
              <p>Cadastre um local de armazenamento de estoque</p>
            </div>
            <button class="icon-button" id="_dep_cancel" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="est-nc-body">
            <div class="est-nc-section">
              <p class="est-nc-section-title">Novo Depósito</p>
              <div class="est-nc-card-group">
                <div class="est-nc-cell">
                  <span class="est-nc-cell-ico"><i class="fa-solid fa-warehouse"></i></span>
                  <div class="est-nc-cell-content">
                    <label class="est-nc-lbl" for="_dep_nome">Nome <span class="est-nc-req">*</span></label>
                    <input type="text" id="_dep_nome" class="est-nc-cell-input" placeholder="Ex: Depósito Principal" maxlength="100" autocomplete="off" />
                  </div>
                </div>
                <div class="est-nc-cell">
                  <span class="est-nc-cell-ico"><i class="fa-solid fa-pen-to-square"></i></span>
                  <div class="est-nc-cell-content">
                    <label class="est-nc-lbl" for="_dep_desc">Descrição</label>
                    <input type="text" id="_dep_desc" class="est-nc-cell-input" placeholder="Opcional..." autocomplete="off" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-card__footer">
            <button class="btn btn-light" id="_dep_cancel2">Cancelar</button>
            <button class="btn btn-primary" id="_dep_criar">Criar depósito</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      let done = false;
      const fechar = (val) => { if (done) return; done = true; overlay.remove(); resolve(val); };
      overlay.querySelector('#_dep_criar').addEventListener('click', () => {
        const nome = overlay.querySelector('#_dep_nome').value.trim();
        const desc = overlay.querySelector('#_dep_desc').value.trim();
        fechar(nome ? { nome, descricao: desc } : null);
      });
      overlay.querySelectorAll('#_dep_cancel, #_dep_cancel2').forEach(b => b.addEventListener('click', () => fechar(null)));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(null); });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); fechar(null); }
      });
      overlay.querySelector('#_dep_nome').focus();
    });
    if (!dados) return;
    try {
      const empresa = this.state.empresa || '';
      await api.request('/depositos', {
        method: 'POST',
        body: { nome: dados.nome, descricao: dados.descricao, empresa, empresa_id: api.getEmpresaId() }
      });
      showToast('Depósito criado!', 'success');
      await this._renderDepositos();
    } catch (err) {
      showToast(err.message || 'Erro ao criar depósito', 'error');
    }
  },

  async excluirDeposito(id) {
    if (this._excluindoDeposito) return;
    const ok = await confirmarAcao('Excluir este depósito? Só é possível se não houver estoque.', 'Excluir');
    if (!ok) return;
    this._excluindoDeposito = true;
    try {
      await api.request(`/depositos/${id}`, { method: 'DELETE', body: { empresa_id: api.getEmpresaId() } });
      showToast('Depósito excluído!', 'success');
      await this._renderDepositos();
    } catch (err) {
      showToast(err.message || 'Erro ao excluir', 'error');
    } finally {
      this._excluindoDeposito = false;
    }
  },

  async verEstoqueDeposito(id, nome) {
    const corpo = document.getElementById('depositosCorpo');
    if (!corpo) return;
    corpo.innerHTML = `
      <div style="margin-bottom:16px">
        <button type="button" class="btn btn-light btn-sm" data-action="renderDepositos">
          <i class="fa-solid fa-arrow-left"></i> Voltar
        </button>
        <strong style="margin-left:12px">${escapeHtml(nome)}</strong>
      </div>
      <div class="module-feedback module-feedback--info">Carregando estoque...</div>`;

    try {
      const data = await api.request(`/depositos/${id}/estoque`, { query: { empresa_id: api.getEmpresaId() } });
      const itens = data.itens || [];

      if (!itens.length) {
        corpo.innerHTML = `<div class="empty-state">Nenhum produto neste depósito.</div>`;
        return;
      }

      const tabela = document.createElement('div');
      tabela.className = 'table-wrapper';
      tabela.innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Produto</th><th>Categoria</th><th>Variação</th>
            <th class="text-right">Estoque</th>
          </tr></thead>
          <tbody>
            ${itens.map((i) => `
              <tr>
                <td><strong>${escapeHtml(i.produto_nome)}</strong></td>
                <td>${escapeHtml(i.categoria || '-')}</td>
                <td>${i.atributo1 ? escapeHtml(`${i.atributo1}${i.atributo2 ? ' / ' + i.atributo2 : ''}`) : '-'}</td>
                <td class="text-right ${Number(i.estoque) <= 0 ? 'text-danger' : ''}">${i.estoque}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;

      corpo.innerHTML = `
        <div style="margin-bottom:16px">
          <button type="button" class="btn btn-light btn-sm" data-action="renderDepositos">
            <i class="fa-solid fa-arrow-left"></i> Voltar
          </button>
          <strong style="margin-left:12px">${escapeHtml(nome)}</strong>
          <span style="color:var(--text-muted);font-size:.85rem;margin-left:8px">(${itens.length} produto(s))</span>
        </div>`;
      corpo.appendChild(tabela);
    } catch (err) {
      showToast(err.message || 'Erro ao carregar estoque', 'error');
    }
  },

  async abrirSugestaoCompra() {
    if (!document.getElementById('sugestaoCompraModal')) {
      const el = document.createElement('div');
      el.className = 'modal-overlay hidden';
      el.id = 'sugestaoCompraModal';
      el.innerHTML = `
        <div class="modal-card" style="max-width:820px;width:95vw">
          <div class="modal-card__header">
            <div>
              <h3>Sugestão de Compra</h3>
              <p id="sugestaoSubtitulo" style="color:var(--text-muted);font-size:.9rem">Produtos abaixo do estoque mínimo</p>
            </div>
            <button type="button" class="icon-button" id="sugestaoFecharBtn">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div id="sugestaoCorpo" style="padding:20px 24px 24px;overflow-y:auto;max-height:70vh">
            <div class="skeleton-line" style="height:200px;border-radius:12px"></div>
          </div>
        </div>`;
      document.body.appendChild(el);
    }

    const modal  = document.getElementById('sugestaoCompraModal');
    const corpo  = document.getElementById('sugestaoCorpo');
    const sub    = document.getElementById('sugestaoSubtitulo');
    modal.classList.remove('hidden');
    if (corpo) corpo.innerHTML = `<div class="module-feedback module-feedback--info">Calculando sugestão...</div>`;

    try {
      const empresa = this.state.empresa || '';
      const data = await api.request('/estoque/sugestao-compra', { method: 'GET', query: { empresa, empresa_id: api.getEmpresaId() } });
      const { itens = [], total_itens = 0, total_estimado = 0 } = data;

      if (sub) sub.textContent = total_itens === 0
        ? 'Todos os produtos estão acima do estoque mínimo'
        : `${total_itens} produto(s) abaixo do mínimo · Custo estimado: ${formatCurrency(total_estimado)}`;

      if (!itens.length) {
        corpo.innerHTML = `<div class="empty-state"><i class="fa-solid fa-check-circle" style="color:var(--success,#38a169);font-size:2rem;margin-bottom:8px"></i><br>Nenhum produto precisa de reposição.</div>`;
        return;
      }

      corpo.innerHTML = `
        <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Produto</th>
            <th>Categoria</th>
            <th class="text-right">Atual</th>
            <th class="text-right">Mínimo</th>
            <th class="text-right">Sugerido</th>
            <th class="text-right">Custo unit.</th>
            <th class="text-right">Total est.</th>
            <th>Fornecedor</th>
          </tr></thead>
          <tbody>
            ${itens.map((i) => `
              <tr>
                <td>
                  <div class="table-primary">
                    <strong>${escapeHtml(i.nome)}</strong>
                    ${i.codigo_barras ? `<small style="display:block;color:var(--text-muted)">${escapeHtml(i.codigo_barras)}</small>` : ''}
                  </div>
                </td>
                <td>${escapeHtml(i.categoria || '-')}</td>
                <td class="text-right" style="color:var(--danger,#e53e3e);font-weight:800">${i.estoque_atual}</td>
                <td class="text-right">${i.estoque_minimo}</td>
                <td class="text-right"><strong>${i.qtd_sugerida}</strong></td>
                <td class="text-right">${i.custo_estimado > 0 ? formatCurrency(i.custo_estimado) : '-'}</td>
                <td class="text-right">${i.custo_estimado > 0 ? formatCurrency(i.qtd_sugerida * i.custo_estimado) : '-'}</td>
                <td>${escapeHtml(i.fornecedor_preferencial || '-')}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:800;border-top:2px solid var(--border)">
              <td colspan="6" class="text-right" style="padding-top:10px">Total estimado:</td>
              <td class="text-right" style="padding-top:10px">${formatCurrency(total_estimado)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>`;
    } catch (err) {
      if (corpo) corpo.innerHTML = `<div class="module-feedback module-feedback--error">${escapeHtml(err.message || 'Erro ao carregar sugestão')}</div>`;
    }
  }
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}


export async function initEstoqueModule() {
  EstoqueModule.init();
  await EstoqueModule.load();
}

