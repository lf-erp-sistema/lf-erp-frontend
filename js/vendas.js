import api from './api.js';
import { getAuth } from './auth.js';
import { showToast, confirmarAcao } from './feedback.js';
import { exportCSV, numCSV } from './exportUtils.js';
import { todayFortaleza, escapeHtml, calcPeriodoLocal } from './utils.js';

const VendasModule = {
  state: {
    initialized: false,
    eventsBound: false,
    empresa: null,
    vendas: [],
    vendasFiltradas: [],
    loading: false,
    carregandoMais: false,
    total: 0,
    offset: 0,
    limite: 100,
    vendaDetalheAtual: null,
    produtosAdicionar: [],
    filtros: {
      busca: '',
      pagamento: '',
      status: '',
      dataInicial: '',
      dataFinal: ''
    },
    ordem: 'data',
    ordemDir: 'desc'
  },

  init() {
    this.resolveEmpresa();

    if (!this.state.initialized) {
      this.state.initialized = true;
      this.carregarFiltros();
      this.render();
      this.cache();
      this.bindEvents();
    } else {
      this.state.filtros.dataInicial = '';
      this.state.filtros.dataFinal   = '';
      const iniEl = document.getElementById('vendasDataInicial');
      const fimEl = document.getElementById('vendasDataFinal');
      if (iniEl) iniEl.value = '';
      if (fimEl) fimEl.value = '';
      this.cache();
    }
  },

  resolveEmpresa() {
    const auth = getAuth();

    this.state.empresa = auth?.empresa?.nome || auth?.user?.empresa || 'LF ERP';
  },

  cache() {
    this.el = {
      container: document.getElementById('vendasContainer'),
      feedback: document.getElementById('vendasFeedback'),

      busca: document.getElementById('vendasBusca'),
      pagamento: document.getElementById('vendasPagamento'),
      status: document.getElementById('vendasStatus'),
      dataInicial: document.getElementById('vendasDataInicial'),
      dataFinal: document.getElementById('vendasDataFinal'),

      btnFiltrar: document.getElementById('vendasFiltrarBtn'),
      btnLimpar: document.getElementById('vendasLimparBtn'),
      btnAtualizar: document.getElementById('vendasAtualizarBtn'),

      tbody: document.getElementById('vendasTableBody'),
      empty: document.getElementById('vendasEmptyState'),

      totalVendas: document.getElementById('vendasStatsTotal'),
      totalValor: document.getElementById('vendasStatsValor'),
      totalItens: document.getElementById('vendasStatsItens')
    };
  },

  bindEvents() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;

    document.addEventListener('input', (event) => {
      if (event.target.id === 'vendasBusca') {
        this.state.filtros.busca = event.target.value || '';
        this.applyLocalFilters();
        this.salvarFiltros();
      }

      if (event.target.id === 'buscaProdutoAdd') {
        this.filtrarProdutosAdicionar(event.target.value || '');
      }
    });

    document.addEventListener('change', (event) => {
      if (event.target.id === 'vendasPagamento') {
        this.state.filtros.pagamento = event.target.value || '';
        this.applyLocalFilters();
        this.salvarFiltros();
      }

      if (event.target.id === 'vendasStatus') {
        this.state.filtros.status = event.target.value || '';
        this.applyLocalFilters();
        this.salvarFiltros();
      }

      if (event.target.id === 'vendasDataInicial') {
        this.state.filtros.dataInicial = event.target.value || '';
        this.salvarFiltros();
      }

      if (event.target.id === 'vendasDataFinal') {
        this.state.filtros.dataFinal = event.target.value || '';
        this.salvarFiltros();
      }

      if (event.target.dataset.action === 'editar-qtd-item-venda') {
        const index = Number(event.target.dataset.index);
        const novaQuantidade = Number(event.target.value || 0);
        const venda = this.state.vendaDetalheAtual;

        if (!venda || !Array.isArray(venda.itens) || !venda.itens[index]) return;

        if (novaQuantidade <= 0) {
          event.target.value = venda.itens[index].quantidade || 1;
          this.showMessage('A quantidade precisa ser maior que zero.', 'error');
          return;
        }

        venda.itens[index].quantidade = novaQuantidade;
        venda.itens[index].total =
          Number(novaQuantidade) * Number(venda.itens[index].preco_unitario || 0);

        if (!this.recalcularVendaEmEdicao()) return;
        this.renderDetalheModal(venda);

        showToast('Quantidade atualizada', 'info');
      }
    });

    document.addEventListener('click', async (event) => {
      if (event.target.closest('#vendasEmptyPdvBtn')) {
        document.querySelector('.nav-item[data-view=pdv], .nav-subitem[data-view=pdv]')?.click();
        return;
      }

      // Ordenação por coluna
      const th = event.target.closest('th[data-sort-col]');
      if (th) {
        const col = th.dataset.sortCol;
        if (this.state.ordem === col) {
          this.state.ordemDir = this.state.ordemDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.ordem = col;
          this.state.ordemDir = col === 'data' ? 'desc' : 'asc';
        }
        this.applyLocalFilters();
        return;
      }

      const itemProdutoAdd = event.target.closest('.item-produto-add');

      if (itemProdutoAdd) {
        event.preventDefault();

        const produtoId = Number(itemProdutoAdd.dataset.id);
        const nome = itemProdutoAdd.dataset.nome || '';
        const preco = Number(itemProdutoAdd.dataset.preco || 0);
        const custo = Number(itemProdutoAdd.dataset.custo || 0);
        const qtd = Number(document.getElementById('qtdProdutoAdd')?.value || 1);
        const venda = this.state.vendaDetalheAtual;

        if (!venda) {
          this.showMessage('Venda não carregada.', 'error');
          return;
        }

        if (!Array.isArray(venda.itens)) {
          venda.itens = [];
        }

        if (!produtoId || qtd <= 0) {
          this.showMessage('Informe um produto e uma quantidade válida.', 'error');
          return;
        }

        const itemExistente = venda.itens.find((item) => {
          return Number(item.produto_id) === produtoId;
        });

        if (itemExistente) {
          itemExistente.quantidade = Number(itemExistente.quantidade || 0) + qtd;
          itemExistente.total =
            Number(itemExistente.quantidade || 0) * Number(itemExistente.preco_unitario || 0);
        } else {
          venda.itens.push({
            produto_id: produtoId,
            produto_nome: nome,
            quantidade: qtd,
            preco_unitario: preco,
            custo_unitario: custo,
            total: Number((qtd * preco).toFixed(2))
          });
        }

        if (!this.recalcularVendaEmEdicao()) return;

        document.getElementById('modalAddProduto')?.remove();
        this.renderDetalheModal(venda);

        showToast('Produto adicionado', 'success');

        return;
      }

      const button = event.target.closest('button');
      if (!button) return;

      if (button.dataset.preset) {
        event.preventDefault();
        const today = todayFortaleza();
        const [y, m] = today.split('-').map(Number);
        let ini = today;
        if (button.dataset.preset === 'hoje') {
          ini = today;
        } else if (button.dataset.preset === 'semana') {
          const d = new Date(`${today}T12:00:00`);
          d.setDate(d.getDate() - d.getDay());
          ini = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        } else if (button.dataset.preset === 'mes') {
          ini = `${y}-${String(m).padStart(2,'0')}-01`;
        } else if (button.dataset.preset === 'trimestre') {
          let tm = m - 3, ty = y;
          if (tm <= 0) { tm += 12; ty -= 1; }
          ini = `${ty}-${String(tm).padStart(2,'0')}-01`;
        }
        this.state.filtros.dataInicial = ini;
        this.state.filtros.dataFinal   = today;
        const iniEl = document.getElementById('vendasDataInicial');
        const fimEl = document.getElementById('vendasDataFinal');
        if (iniEl) iniEl.value = ini;
        if (fimEl) fimEl.value = today;
        this.salvarFiltros();
        await this.load();
        return;
      }

      if (button.id === 'vendasFiltrarBtn') {
        event.preventDefault();
        await this.load();
        return;
      }

      if (button.id === 'vendasLimparBtn') {
        event.preventDefault();
        this.clearFilters();
        await this.load();
        return;
      }

      if (button.id === 'vendasExportarBtn') {
        event.preventDefault();
        const lista = this.state.vendasFiltradas.length
          ? this.state.vendasFiltradas
          : this.state.vendas;
        exportCSV(lista.map((v) => ({
          'Data':        v.data || '',
          'Cliente':     v.cliente_nome || 'Consumidor Final',
          'Pagamento':   v.pagamento || '',
          'Status':      v.status_pagamento || '',
          'Subtotal (R$)': numCSV(v.subtotal),
          'Desconto (R$)': numCSV(v.desconto),
          'Total (R$)':    numCSV(v.total),
          'Observacao':  v.observacao || ''
        })), 'vendas');
        return;
      }

      if (button.id === 'vendasAtualizarBtn') {
        event.preventDefault();
        await this.load();
        return;
      }

      if (button.id === 'vendasMetasBtn') {
        event.preventDefault();
        await this.abrirMetas();
        return;
      }

      if (button.id === 'metasFecharBtn') {
        document.getElementById('metasModal')?.classList.add('hidden');
        return;
      }

      if (button.id === 'metasNovaBtn') {
        await this.criarMeta();
        return;
      }

      if (button.dataset.action === 'detalhar-venda') {
        event.preventDefault();
        const id = Number(button.dataset.id);
        await this.openDetalhe(id);
        return;
      }

      if (button.dataset.action === 'imprimir-recibo-venda') {
        event.preventDefault();
        await this.imprimirRecibo(Number(button.dataset.id));
        return;
      }

      if (button.dataset.action === 'emitir-nfce-venda') {
        event.preventDefault();
        const id = Number(button.dataset.id);
        await this.emitirNfce(id, button);
        return;
      }

      if (button.dataset.action === 'estornar-parcela-venda') {
        event.preventDefault();
        const id = Number(button.dataset.id);
        await this.estornarParcelaVenda(id);
        return;
      }

      if (button.dataset.action === 'baixar-parcela-venda') {
        event.preventDefault();
        const id = Number(button.dataset.id);
        await this.baixarParcelaVenda(id);
        return;
      }

      if (button.dataset.action === 'editar-observacao-venda') {
        event.preventDefault();
        await this.editarObservacaoVenda();
        return;
      }

      if (button.dataset.action === 'abrir-adicionar-produto') {
        event.preventDefault();
        await this.abrirModalAdicionarProduto();
        return;
      }

      if (button.dataset.action === 'editar-venda-modal') {
        event.preventDefault();
        await this.handleEditarVenda();
        return;
      }

      if (button.dataset.action === 'remover-item-venda') {
        event.preventDefault();

        const index = Number(button.dataset.index);
        const venda = this.state.vendaDetalheAtual;

        if (!venda || !Array.isArray(venda.itens)) return;

        if (venda.itens.length <= 1) {
          this.showMessage('A venda precisa ter pelo menos 1 item.', 'error');
          return;
        }

        venda.itens.splice(index, 1);
        if (!this.recalcularVendaEmEdicao()) return;
        this.renderDetalheModal(venda);

        showToast('Item removido da venda', 'info');

        return;
      }

      if (button.dataset.action === 'excluir-venda-modal') {
        event.preventDefault();
        const id = Number(button.dataset.id);
        await this.confirmarExcluirVenda(id);
      }
    });
  },

  async load() {
    this.resolveEmpresa();
    this.cache();

    if (!this.state.empresa) {
      this.setFeedback('Empresa não identificada para carregar vendas.', 'error');
      return;
    }

    this.state.loading = true;
    this.setFeedback('Carregando vendas...', 'info');

    this.setLoading(true);

    try {
      const res = await this.fetchVendas({ offset: 0 });
      const { dados = [], total = 0, limite = 100 } = res || {};

      this.state.vendas  = dados;
      this.state.total   = total;
      this.state.offset  = 0;
      this.state.limite  = limite;
      this.applyLocalFilters();
      this.setFeedback('', '');
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);

      this.state.vendas = [];
      this.state.vendasFiltradas = [];

      this.renderStats();
      this.renderTable();
      this.toggleEmptyState('Não foi possível carregar as vendas.');
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
      this.setLoading(false);
    }
  },

  async fetchVendas({ offset = 0 } = {}) {
    const params = { limit: this.state.limite, offset };

    if (this.state.filtros.busca)        params.busca            = this.state.filtros.busca;
    if (this.state.filtros.dataInicial)  params.data_inicial     = this.state.filtros.dataInicial;
    if (this.state.filtros.dataFinal)    params.data_final       = this.state.filtros.dataFinal;
    if (this.state.filtros.pagamento)    params.pagamento        = this.state.filtros.pagamento;
    if (this.state.filtros.status)       params.status_pagamento = this.state.filtros.status;

    return api.getVendas(params);
  },

  async carregarMais() {
    if (this.state.carregandoMais || this.state.loading) return;
    const novoOffset = this.state.offset + this.state.limite;
    if (novoOffset >= this.state.total) return;

    this.state.carregandoMais = true;
    const btn = document.getElementById('vendasCarregarMaisBtn');
    if (btn) btn.disabled = true;

    try {
      const res = await this.fetchVendas({ offset: novoOffset });
      const { dados = [] } = res || {};
      this.state.vendas  = [...this.state.vendas, ...dados];
      this.state.offset  = novoOffset;
      this.applyLocalFilters();
    } catch (e) {
      showToast('Erro ao carregar mais vendas', 'error');
    } finally {
      this.state.carregandoMais = false;
      const btn = document.getElementById('vendasCarregarMaisBtn');
      if (btn) btn.disabled = false;
    }
  },

  getGlobalFilters() {
    return {
      data_inicial: document.getElementById('filtroDataInicial')?.value || '',
      data_final: document.getElementById('filtroDataFinal')?.value || '',
      busca: document.getElementById('filtroBuscaGlobal')?.value?.trim() || ''
    };
  },

  render() {
    const container = document.getElementById('vendasContainer');
    if (!container) return;

    const si = (col) => {
      if (this.state.ordem !== col) return `<i class="fa-solid fa-sort vnd-sort-icon"></i>`;
      const ic = this.state.ordemDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
      return `<i class="fa-solid ${ic} vnd-sort-icon vnd-sort-icon--active"></i>`;
    };

    container.innerHTML = `
      <section class="module-card vendas-module-card">
        <div id="vendasFeedback" class="module-feedback"></div>

        <div class="module-toolbar vendas-toolbar">
          <div class="module-toolbar__search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              id="vendasBusca"
              placeholder="Buscar por cliente, pagamento, observação ou número..."
              value="${escapeHtml(this.state.filtros.busca)}"
            />
          </div>

          <div class="module-toolbar__stats">
            <div class="mini-stat">
              <span>Total de vendas</span>
              <strong id="vendasStatsTotal">0</strong>
            </div>

            <div class="mini-stat">
              <span>Valor total</span>
              <strong id="vendasStatsValor">R$ 0,00</strong>
            </div>

            <div class="mini-stat">
              <span>Itens vendidos</span>
              <strong id="vendasStatsItens">0</strong>
            </div>

            <div class="mini-stat">
              <span>Ticket médio</span>
              <strong id="vendasStatsTicket">R$ 0,00</strong>
            </div>
          </div>
          <div class="module-card__actions">
            <button type="button" class="btn btn-light" id="vendasMetasBtn">
              <i class="fa-solid fa-bullseye"></i> Metas
            </button>
            <button type="button" class="btn btn-light" id="vendasExportarBtn">
              <i class="fa-solid fa-file-csv"></i> Exportar CSV
            </button>
            <button type="button" class="btn btn-light" id="vendasAtualizarBtn">
              <i class="fa-solid fa-rotate"></i> Atualizar
            </button>
          </div>
        </div>

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:10px 0 2px">
          <span style="font-size:12px;color:var(--text-muted);font-weight:700;white-space:nowrap">Período rápido:</span>
          <button type="button" class="btn btn-light" style="font-size:12px;padding:4px 10px;height:30px" data-preset="hoje">Hoje</button>
          <button type="button" class="btn btn-light" style="font-size:12px;padding:4px 10px;height:30px" data-preset="semana">Esta semana</button>
          <button type="button" class="btn btn-light" style="font-size:12px;padding:4px 10px;height:30px" data-preset="mes">Este mês</button>
          <button type="button" class="btn btn-light" style="font-size:12px;padding:4px 10px;height:30px" data-preset="trimestre">3 meses</button>
        </div>

        <div class="vendas-filters-grid">
          <div class="form-field">
            <label for="vendasPagamento">Pagamento</label>
            <select id="vendasPagamento">
              <option value="">Todos</option>
              <option value="Dinheiro" ${this.state.filtros.pagamento === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
              <option value="Pix" ${this.state.filtros.pagamento === 'Pix' ? 'selected' : ''}>Pix</option>
              <option value="Cartão de Débito" ${this.state.filtros.pagamento === 'Cartão de Débito' ? 'selected' : ''}>Cartão de Débito</option>
              <option value="Cartão de Crédito" ${this.state.filtros.pagamento === 'Cartão de Crédito' ? 'selected' : ''}>Cartão de Crédito</option>
              <option value="Promissória" ${this.state.filtros.pagamento === 'Promissória' ? 'selected' : ''}>Promissória</option>
            </select>
          </div>

          <div class="form-field">
            <label for="vendasStatus">Status</label>
            <select id="vendasStatus">
              <option value="">Todos</option>
              <option value="pago" ${this.state.filtros.status === 'pago' ? 'selected' : ''}>Pago</option>
              <option value="pendente" ${this.state.filtros.status === 'pendente' ? 'selected' : ''}>Pendente</option>
              <option value="parcial" ${this.state.filtros.status === 'parcial' ? 'selected' : ''}>Parcial</option>
              <option value="atrasado" ${this.state.filtros.status === 'atrasado' ? 'selected' : ''}>Atrasado</option>
              <option value="parcial_atrasado" ${this.state.filtros.status === 'parcial_atrasado' ? 'selected' : ''}>Parcial em atraso</option>
              <option value="cancelado" ${this.state.filtros.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>

          <div class="form-field">
            <label for="vendasDataInicial">Data inicial</label>
            <input
              type="date"
              id="vendasDataInicial"
              value="${escapeHtml(this.state.filtros.dataInicial)}"
            />
          </div>

          <div class="form-field">
            <label for="vendasDataFinal">Data final</label>
            <input
              type="date"
              id="vendasDataFinal"
              value="${escapeHtml(this.state.filtros.dataFinal)}"
            />
          </div>

          <div class="vendas-filter-actions">
            <button type="button" class="btn btn-primary" id="vendasFiltrarBtn">
              <i class="fa-solid fa-filter"></i>
              Filtrar
            </button>

            <button type="button" class="btn btn-light" id="vendasLimparBtn">
              <i class="fa-solid fa-eraser"></i>
              Limpar
            </button>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table vendas-table">
            <thead>
              <tr>
                <th>Venda</th>
                <th data-sort-col="cliente_nome">Cliente ${si('cliente_nome')}</th>
                <th data-sort-col="data">Data ${si('data')}</th>
                <th>Pagamento</th>
                <th data-sort-col="status_pagamento">Status ${si('status_pagamento')}</th>
                <th class="text-right" data-sort-col="total">Total ${si('total')}</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="vendasTableBody"></tbody>
          </table>
        </div>

        <div class="empty-state hidden" id="vendasEmptyState">
          <i class="fa-solid fa-cart-shopping"></i>
          <strong>Nenhuma venda encontrada</strong>
          <p>Tente ajustar os filtros ou registre uma nova venda pelo PDV.</p>
          <button class="btn btn-primary" id="vendasEmptyPdvBtn">
            <i class="fa-solid fa-cash-register"></i> Ir para o PDV
          </button>
        </div>
      </section>
    `;

    this.injectProfessionalStyles();
    this.cache();
  },

  applyLocalFilters() {
    const busca = String(this.state.filtros.busca || '')
      .trim()
      .toLowerCase();
    const pagamento = String(this.state.filtros.pagamento || '')
      .trim()
      .toLowerCase();
    const status = String(this.state.filtros.status || '')
      .trim()
      .toLowerCase();

    this.state.vendasFiltradas = this.state.vendas.filter((venda) => {
      const texto = [
        venda.id,
        venda.cliente_nome,
        venda.pagamento,
        venda.status_pagamento,
        venda.data,
        venda.total,
        venda.observacao
      ]
        .join(' ')
        .toLowerCase();

      const matchBusca = !busca || texto.includes(busca);
      const matchPagamento =
        !pagamento || String(venda.pagamento || '').toLowerCase() === pagamento;
      const matchStatus = !status || String(venda.status_pagamento || '').toLowerCase() === status;

      return matchBusca && matchPagamento && matchStatus;
    });

    this.state.vendasFiltradas = this._sortVendas(this.state.vendasFiltradas);

    this.renderStats();
    this.renderTable();
    this.toggleEmptyState();
  },

  _sortVendas(arr) {
    const { ordem, ordemDir } = this.state;
    return [...arr].sort((a, b) => {
      let va = a[ordem] ?? '';
      let vb = b[ordem] ?? '';
      if (ordem === 'total') {
        va = Number(va); vb = Number(vb);
        return ordemDir === 'asc' ? va - vb : vb - va;
      }
      if (ordem === 'data') {
        va = String(va); vb = String(vb);
        return ordemDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      const c = va.localeCompare(vb, 'pt-BR');
      return ordemDir === 'asc' ? c : -c;
    });
  },

  renderStats() {
    this.cache();

    const totalVendas = this.state.vendasFiltradas.length;

    const valorTotal = this.state.vendasFiltradas.reduce((acc, venda) => {
      return acc + Number(venda.total || 0);
    }, 0);

    const totalItens = this.state.vendasFiltradas.reduce((acc, venda) => {
      return acc + Number(venda.total_itens || venda.quantidade_itens || 0);
    }, 0);

    const ticketMedio = totalVendas > 0 ? valorTotal / totalVendas : 0;
    const ticketEl = document.getElementById('vendasStatsTicket');

    if (this.el.totalVendas) this.el.totalVendas.textContent = String(totalVendas);
    if (this.el.totalValor) this.el.totalValor.textContent = formatCurrency(valorTotal);
    if (this.el.totalItens) this.el.totalItens.textContent = totalItens > 0 ? String(totalItens) : '—';
    if (ticketEl) ticketEl.textContent = formatCurrency(ticketMedio);
  },

  renderTable() {
    this.cache();

    if (!this.el.tbody) return;

    if (!this.state.vendasFiltradas.length) {
      this.el.tbody.innerHTML = '';
      return;
    }

    const busca = String(this.state.filtros.busca || '').trim();

    this.el.tbody.innerHTML = this.state.vendasFiltradas
      .map((venda) => {
        const id = Number(venda.id || 0);
        const cliente = venda.cliente_nome || 'Consumidor não informado';
        const pagamento = venda.pagamento || '-';
        const status = venda.status_pagamento || 'pago';
        const numItens = Number(venda.total_itens || venda.quantidade_itens || 0);
        const desconto = Number(venda.desconto || 0);

        return `
        <tr>
          <td>
            <div class="table-primary">
              <strong>#${id}</strong>
              <small>${numItens > 0 ? `${numItens} item(ns)` : 'Venda'}${desconto > 0 ? ` · <span class="vnd-desc-badge">DESC</span>` : ''}</small>
            </div>
          </td>

          <td>
            <div class="table-primary">
              <strong>${this._highlight(cliente, busca)}</strong>
            </div>
          </td>

          <td>${formatDate(venda.data)}</td>

          <td>${badgePagamento(pagamento)}</td>

          <td>
            <span class="${this.getStatusBadgeClass(status)}">
              ${formatStatusVenda(status)}
            </span>
          </td>

          <td class="text-right">
            <strong>${formatCurrency(venda.total || 0)}</strong>
          </td>

          <td class="text-right">
            <div class="table-actions">
              <button type="button" class="btn-inline" data-action="detalhar-venda" data-id="${id}">
                <i class="fa-solid fa-eye"></i> Detalhes
              </button>
              <button type="button" class="btn-inline" data-action="imprimir-recibo-venda" data-id="${id}" title="Imprimir recibo simples">
                <i class="fa-solid fa-receipt"></i> Recibo
              </button>
              <button type="button" class="btn-inline" data-action="emitir-nfce-venda" data-id="${id}" title="Emitir NFC-e para esta venda">
                <i class="fa-solid fa-file-invoice"></i> NFC-e
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    // Rodapé de paginação
    const jaCarregados = this.state.vendas.length;
    const restantes    = this.state.total - jaCarregados;

    let footer = document.getElementById('vendasPaginacaoFooter');
    if (!footer) {
      footer = document.createElement('div');
      footer.id = 'vendasPaginacaoFooter';
      footer.style.cssText = 'padding:14px 0;text-align:center;';
      const tbl = this.el.tbody?.closest('table');
      if (tbl?.parentElement) tbl.parentElement.after(footer);
    }

    if (restantes > 0) {
      footer.innerHTML = `
        <span style="font-size:12px;color:var(--text-muted);margin-right:12px">
          Exibindo ${jaCarregados.toLocaleString('pt-BR')} de ${this.state.total.toLocaleString('pt-BR')} vendas
        </span>
        <button id="vendasCarregarMaisBtn" class="btn btn-light" style="font-size:13px">
          <i class="fa-solid fa-chevron-down"></i> Carregar mais ${restantes.toLocaleString('pt-BR')}
        </button>`;
      document.getElementById('vendasCarregarMaisBtn')
        ?.addEventListener('click', () => this.carregarMais());
    } else if (this.state.total > this.state.limite) {
      footer.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">${jaCarregados.toLocaleString('pt-BR')} vendas carregadas</span>`;
    } else {
      footer.innerHTML = '';
    }
  },

  toggleEmptyState(customMessage = '') {
    this.cache();

    if (!this.el.empty) return;

    const isEmpty = !this.state.vendasFiltradas.length;

    this.el.empty.classList.toggle('hidden', !isEmpty);
    const emptyStrong = this.el.empty.querySelector('strong');
    if (emptyStrong) emptyStrong.textContent = customMessage || 'Nenhuma venda encontrada.';
  },

  salvarFiltros() {
    const { busca, pagamento, status } = this.state.filtros;
    try { sessionStorage.setItem('lf_filtros_vendas', JSON.stringify({ busca, pagamento, status })); } catch {}
  },

  carregarFiltros() {
    try {
      const s = JSON.parse(sessionStorage.getItem('lf_filtros_vendas') || 'null');
      if (s) {
        const { busca, pagamento, status } = s;
        Object.assign(this.state.filtros, { busca: busca || '', pagamento: pagamento || '', status: status || '' });
      }
    } catch {}
  },

  clearFilters() {
    this.state.filtros = {
      busca: '',
      pagamento: '',
      status: '',
      dataInicial: '',
      dataFinal: ''
    };
    this.salvarFiltros();
    this.render();
    this.applyLocalFilters();
  },

  async openDetalhe(id) {
    try {
      const detalhe = await api.getVendaDetalhe(id);
      this.state.vendaDetalheAtual = detalhe;
      this.renderDetalheModal(detalhe);
    } catch (error) {
      console.error('Erro ao carregar detalhe da venda:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    }
  },

  async abrirModalAdicionarProduto() {
    const venda = this.state.vendaDetalheAtual;

    if (!venda) {
      this.showMessage('Venda não carregada para adicionar produto.', 'error');
      return;
    }

    const modalExistente = document.getElementById('modalAddProduto');
    if (modalExistente) modalExistente.remove();

    const modal = document.createElement('div');
    modal.id = 'modalAddProduto';
    modal.className = 'modal-overlay venda-add-product-overlay';

    modal.innerHTML = `
      <div class="modal-card venda-add-product-card">
        <div class="venda-add-product-header">
          <div>
            <span class="venda-detail-eyebrow">Adicionar item</span>
            <h3>Adicionar produto à venda #${escapeHtml(venda.id || '-')}</h3>
            <p>Selecione um produto cadastrado para incluir no reprocessamento da venda.</p>
          </div>

          <button type="button" class="icon-button" id="fecharAddProduto" aria-label="Fechar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="venda-add-product-body">
          <div class="form-field">
            <label for="buscaProdutoAdd">Buscar produto</label>
            <input
              type="text"
              id="buscaProdutoAdd"
              placeholder="Digite o nome do produto..."
              autocomplete="off"
            />
          </div>

          <div class="form-field">
            <label for="qtdProdutoAdd">Quantidade</label>
            <input
              type="number"
              id="qtdProdutoAdd"
              min="1"
              value="1"
            />
          </div>

          <div class="venda-add-product-list" id="listaProdutosAdd">
            <div class="empty-detail-state">Carregando produtos...</div>
          </div>
        </div>

        <div class="venda-add-product-footer">
          <button type="button" class="btn btn-light" id="cancelarAddProduto">
            Cancelar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('fecharAddProduto')?.addEventListener('click', () => modal.remove());
    document.getElementById('cancelarAddProduto')?.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });

    await this.carregarProdutosParaSelecao();
  },

  async carregarProdutosParaSelecao() {
    const container = document.getElementById('listaProdutosAdd');

    try {
      const produtos = await api.getProdutos();

      this.state.produtosAdicionar = Array.isArray(produtos) ? produtos : [];

      if (!container) return;

      if (!this.state.produtosAdicionar.length) {
        container.innerHTML = `<div class="empty-detail-state">Nenhum produto encontrado.</div>`;
        return;
      }

      container.innerHTML = this.state.produtosAdicionar
        .map((produto) => {
          const estoque = Number(produto.estoque || 0);

          return `
          <button
            type="button"
            class="item-produto-add"
            data-id="${Number(produto.id || 0)}"
            data-nome="${escapeHtml(produto.nome || '')}"
            data-preco="${Number(produto.preco || 0)}"
            data-custo="${Number(produto.custo || 0)}"
            ${estoque <= 0 ? 'disabled' : ''}
          >
            <div>
              <strong>${escapeHtml(produto.nome || 'Produto')}</strong>
              <small>Estoque: ${estoque}</small>
            </div>

            <span>${formatCurrency(produto.preco || 0)}</span>
          </button>
        `;
        })
        .join('');
    } catch (error) {
      console.error('Erro ao carregar produtos para adicionar:', error);

      if (container) {
        container.innerHTML = `<div class="empty-detail-state">Erro ao carregar produtos.</div>`;
      }

      this.showMessage('Erro ao carregar produtos.', 'error');
    }
  },

  filtrarProdutosAdicionar(termo = '') {
    const busca = String(termo || '')
      .trim()
      .toLowerCase();
    const itens = document.querySelectorAll('.item-produto-add');

    itens.forEach((item) => {
      const nome = String(item.dataset.nome || '').toLowerCase();
      item.style.display = !busca || nome.includes(busca) ? '' : 'none';
    });
  },

  vendaPossuiParcelaPaga(venda) {
    const contas = Array.isArray(venda?.contas_receber) ? venda.contas_receber : [];

    return contas.some((conta) => {
      return (
        String(conta.status || '')
          .trim()
          .toLowerCase() === 'pago'
      );
    });
  },

  renderDetalheModal(venda) {
    const modalExistente = document.getElementById('vendaDetalheModal');
    if (modalExistente) modalExistente.remove();

    const itens = Array.isArray(venda?.itens) ? venda.itens : [];
    const contas = Array.isArray(venda?.contas_receber) ? venda.contas_receber : [];

    const subtotal = Number(venda?.subtotal || 0);
    const desconto = Number(venda?.desconto || 0);
    const acrescimo = Number(venda?.acrescimo || 0);
    const total = Number(venda?.total || 0);
    const vendaId = Number(venda?.id || 0);
    const vendaBloqueada = this.vendaPossuiParcelaPaga(venda);

    const modal = document.createElement('div');
    modal.id = 'vendaDetalheModal';
    modal.className = 'modal-overlay venda-detail-overlay';

    modal.innerHTML = `
      <div class="modal-card venda-detail-card">
        <div class="venda-detail-header">
          <div>
            <span class="venda-detail-eyebrow">Venda #${escapeHtml(vendaId || '-')}</span>
            <h3>Detalhes da venda</h3>
            <p>${escapeHtml(venda?.cliente_nome || 'Consumidor não informado')}</p>
          </div>

          <button type="button" class="icon-button" id="fecharVendaDetalhe" aria-label="Fechar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="venda-detail-body">
          <section class="venda-detail-summary">
            <article class="venda-detail-summary__main">
              <span>Total da venda</span>
              <strong id="vendaTotalPreview">${formatCurrency(total)}</strong>
              <small>${formatDate(venda?.data)}</small>
            </article>

            <article>
              <span>Pagamento</span>
              <strong>${escapeHtml(venda?.pagamento || '-')}</strong>
            </article>

            <article>
              <span>Parcelas</span>
              <strong>${Number(venda?.parcelas || 1)}x</strong>
            </article>

            <article>
              <span>Status</span>
              <strong>${escapeHtml(capitalize(venda?.status_pagamento || 'pago'))}</strong>
            </article>
          </section>

          <section class="venda-detail-actions">
          <button
            type="button"
            class="btn btn-light"
            data-action="editar-observacao-venda"
            data-id="${vendaId}"
          >
            <i class="fa-solid fa-note-sticky"></i>
            Editar observação
          </button>
          ${
            vendaBloqueada
              ? `
            <div class="venda-lock-alert">
              <i class="fa-solid fa-lock"></i>
              Esta venda possui parcela paga e não pode ser editada. Estorne o recebimento antes de alterar itens, estoque ou financeiro.
            </div>
          `
              : ''
          }
            <button
              type="button"
              class="btn btn-primary"
              data-action="abrir-adicionar-produto"
              data-id="${vendaId}"
              ${vendaBloqueada ? 'disabled' : ''}
              title="${vendaBloqueada ? 'Venda bloqueada: existe parcela paga.' : 'Adicionar produto'}"
            >
              <i class="fa-solid fa-plus"></i>
              Adicionar produto
            </button>

            <button
              type="button"
              class="btn btn-light"
              data-action="editar-venda-modal"
              data-id="${vendaId}"
              ${vendaBloqueada ? 'disabled' : ''}
              title="${vendaBloqueada ? 'Venda bloqueada: existe parcela paga.' : 'Salvar edição'}"
            >
              <i class="fa-solid fa-floppy-disk"></i>
              Salvar edição
            </button>

            <button
              type="button"
              class="btn btn-danger"
              data-action="excluir-venda-modal"
              data-id="${vendaId}"
            >
              <i class="fa-solid fa-trash"></i>
              Excluir venda
            </button>
          </section>

          <section class="venda-detail-values">
            <article>
              <span>Subtotal</span>
              <strong id="vendaSubtotalPreview">${formatCurrency(subtotal)}</strong>
            </article>

            <article>
              <span>Desconto</span>
              <strong>${formatCurrency(desconto)}</strong>
            </article>

            <article>
              <span>Acréscimo</span>
              <strong>${formatCurrency(acrescimo)}</strong>
            </article>

            <article>
              <span>Resultado</span>
              <strong id="vendaResultadoPreview">${formatCurrency(total)}</strong>
            </article>
          </section>

          <section class="venda-detail-note">
            <span>Observação</span>
            <p>${escapeHtml(venda?.observacao || 'Nenhuma observação registrada.')}</p>
          </section>

          <section class="venda-detail-section venda-detail-section--editing">
            <div class="venda-detail-section__header">
              <div>
                <h4>Itens vendidos</h4>
                <p>Altere quantidades, remova ou adicione produtos antes de salvar a edição.</p>
              </div>
              <span>${itens.length} item(ns)</span>
            </div>

            <div class="venda-detail-list">
              ${
                itens.length
                  ? itens
                      .map(
                        (item, index) => `
                    <div class="venda-detail-row venda-detail-row--edit">
                      <div>
                        <strong>${escapeHtml(item.produto_nome || 'Produto')}</strong>
                        <small>
                          Qtd.
                          <input
                            type="number"
                            min="1"
                            value="${Number(item.quantidade || 0)}"
                            data-action="editar-qtd-item-venda"
                            data-index="${index}"
                            class="venda-edit-qtd-input"
                            ${vendaBloqueada ? 'disabled' : ''}
                          />
                        </small>
                      </div>

                      <div>
                        <span>Preço unit.</span>
                        <strong>${formatCurrency(item.preco_unitario || 0)}</strong>
                      </div>

                      <div>
                        <span>Custo unit.</span>
                        <strong>${formatCurrency(item.custo_unitario || 0)}</strong>
                      </div>

                      <div>
                        <span>Total</span>
                        <strong>${formatCurrency(Number(item.quantidade || 0) * Number(item.preco_unitario || 0))}</strong>
                      </div>

                      <div>
                        <button
                          type="button"
                          class="btn-inline btn-danger"
                          data-action="remover-item-venda"
                          data-index="${index}"
                          ${vendaBloqueada ? 'disabled' : ''}
                        >
                          <i class="fa-solid fa-trash"></i>
                          Remover
                        </button>
                      </div>
                    </div>
                  `
                      )
                      .join('')
                  : `<div class="empty-detail-state">Nenhum item vinculado.</div>`
              }
            </div>
          </section>

          <section class="venda-detail-section">
            <div class="venda-detail-section__header">
              <div>
                <h4>Contas a receber</h4>
                <p>Parcelas financeiras vinculadas à venda</p>
              </div>
              <span>${contas.length} parcela(s)</span>
            </div>

            <div class="venda-detail-list">
              ${
                contas.length
                  ? contas
                      .map(
                        (conta) => `
                    <div class="venda-detail-row venda-detail-row--receber">
                      <div>
                        <strong>Parcela ${Number(conta.parcela || 1)}/${Number(conta.total_parcelas || 1)}</strong>
                        <small>Vencimento: ${formatDate(conta.data_vencimento)}</small>
                      </div>

                      <div>
                        <span>Status</span>
                        <strong>${escapeHtml(capitalize(conta.status || 'pendente'))}</strong>
                      </div>

                      <div>
                        <span>Valor</span>
                        <strong>${formatCurrency(conta.valor_atualizado || conta.valor || 0)}</strong>
                        ${
                          Number(conta.dias_atraso || 0) > 0
                            ? `<small>
      ${Number(conta.dias_atraso || 0)} dia(s) em atraso ·
      Multa ${formatCurrency(conta.multa || 0)} ·
      Juros ${formatCurrency(conta.juros || 0)}
    </small>`
                            : ''
                        }
</div>
<div>
  ${
    String(conta.status || '').toLowerCase() === 'pago'
      ? `
        <button
          type="button"
          class="btn-inline btn-warning"
          data-action="estornar-parcela-venda"
          data-id="${Number(conta.id || 0)}"
        >
          <i class="fa-solid fa-rotate-left"></i>
          Estornar
        </button>
      `
      : `
        <button
          type="button"
          class="btn-inline btn-success"
          data-action="baixar-parcela-venda"
          data-id="${Number(conta.id || 0)}"
        >
          <i class="fa-solid fa-check"></i>
          Baixar
        </button>
      `
  }
</div>
                    </div>
                  `
                      )
                      .join('')
                  : `<div class="empty-detail-state">Nenhuma conta a receber gerada.</div>`
              }
            </div>
          </section>
        </div>

        <div class="venda-detail-footer">
          <button type="button" class="btn btn-light" id="fecharVendaDetalheFooter">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('fecharVendaDetalhe')?.addEventListener('click', () => modal.remove());
    document
      .getElementById('fecharVendaDetalheFooter')
      ?.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
  },

  recalcularVendaEmEdicao() {
    const venda = this.state.vendaDetalheAtual;
    if (this.vendaPossuiParcelaPaga(venda)) {
      this.showMessage(
        'Esta venda possui parcela paga. Estorne o recebimento antes de editar.',
        'error'
      );
      return false;
    }

    if (!venda || !Array.isArray(venda.itens)) return false;

    const subtotal = venda.itens.reduce((acc, item) => {
      const quantidade = Number(item.quantidade || 0);
      const preco = Number(item.preco_unitario || 0);
      return acc + quantidade * preco;
    }, 0);

    const desconto = Number(venda.desconto || 0);
    const acrescimo = Number(venda.acrescimo || 0);
    const total = Math.max(0, subtotal - desconto + acrescimo);

    venda.subtotal = Number(subtotal.toFixed(2));
    venda.total = Number(total.toFixed(2));

    venda.itens = venda.itens.map((item) => {
      const quantidade = Number(item.quantidade || 0);
      const preco = Number(item.preco_unitario || 0);

      return {
        ...item,
        quantidade,
        total: Number((quantidade * preco).toFixed(2))
      };
    });

    const subtotalEl = document.getElementById('vendaSubtotalPreview');
    const totalEl = document.getElementById('vendaTotalPreview');
    const resultadoEl = document.getElementById('vendaResultadoPreview');

    if (subtotalEl) subtotalEl.textContent = formatCurrency(venda.subtotal);
    if (totalEl) totalEl.textContent = formatCurrency(venda.total);
    if (resultadoEl) resultadoEl.textContent = formatCurrency(venda.total);

    return true;
  },

  async estornarParcelaVenda(id) {
    if (!id) {
      this.showMessage('Parcela inválida para estorno.', 'error');
      return;
    }

    if (this.state._estornandoParcela) return;

    const confirmar = await confirmarAcao('Estornar a baixa desta parcela? Ela voltará para pendente ou atrasada conforme o vencimento.', 'Estornar', 'warning');

    if (!confirmar) return;

    this.state._estornandoParcela = true;
    try {
      showToast('Estornando baixa da parcela...', 'info');

      await api.estornarContaReceber(id, {
        empresa: this.state.empresa,
        empresa_id: api.getEmpresaId()
      });

      this.showMessage('Baixa estornada com sucesso.', 'success');

      if (this.state.vendaDetalheAtual?.id) {
        await this.openDetalhe(this.state.vendaDetalheAtual.id);
      }

      await this.load();
    } catch (error) {
      console.error('Erro ao estornar parcela:', error);
      this.showMessage(this.buildFriendlyError(error), 'error');
    } finally {
      this.state._estornandoParcela = false;
    }
  },

  async baixarParcelaVenda(id) {
    if (!id) {
      this.showMessage('Parcela inválida para baixa.', 'error');
      return;
    }

    const conta = this.state.vendaDetalheAtual?.contas_receber?.find((item) => {
      return Number(item.id) === Number(id);
    });

    const valorSugerido = Number(conta?.valor_atualizado || conta?.valor || 0);
    const hoje = todayFortaleza();

    const resultado = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 16px;font-size:16px;font-weight:700">Confirmar recebimento</h3>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Valor pago (R$)</label>
            <input id="_bpValor" type="number" step="0.01" min="0.01" inputmode="decimal" value="${valorSugerido.toFixed(2)}" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box" />
          </div>
          <div style="margin-bottom:20px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Data do pagamento</label>
            <input id="_bpData" type="date" value="${hoje}" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box" />
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="_bpCancelar" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-3);font-size:13px;cursor:pointer">Cancelar</button>
            <button id="_bpConfirmar" style="padding:8px 16px;border-radius:8px;border:none;background:var(--success);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Confirmar pagamento</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#_bpCancelar').addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
      let _bpClicado = false;
      overlay.querySelector('#_bpConfirmar').addEventListener('click', () => {
        if (_bpClicado) return;
        _bpClicado = true;
        const val = Number(overlay.querySelector('#_bpValor').value);
        const data = overlay.querySelector('#_bpData').value;
        document.body.removeChild(overlay);
        resolve({ valor: val, data });
      });
    });

    if (!resultado) return;
    const valorNormalizado = resultado.valor;

    if (!valorNormalizado || valorNormalizado <= 0) {
      this.showMessage('Informe um valor válido para pagamento.', 'error');
      return;
    }

    if (this.state._baixandoParcela) return;
    this.state._baixandoParcela = true;
    try {
      showToast('Registrando baixa da parcela...', 'info');

      await api.baixarContaReceber(id, {
        valor_pago: valorNormalizado,
        data_pagamento: resultado.data || todayFortaleza(),
        empresa: this.state.empresa,
        empresa_id: api.getEmpresaId()
      });

      this.showMessage('Parcela baixada com sucesso.', 'success');

      if (this.state.vendaDetalheAtual?.id) {
        await this.openDetalhe(this.state.vendaDetalheAtual.id);
      }

      await this.load();
    } catch (error) {
      console.error('Erro ao baixar parcela:', error);
      this.showMessage(this.buildFriendlyError(error), 'error');
    } finally {
      this.state._baixandoParcela = false;
    }
  },

  async editarObservacaoVenda() {
    const venda = this.state.vendaDetalheAtual;

    if (!venda) {
      this.showMessage('Venda não carregada.', 'error');
      return;
    }

    const novaObservacao = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 12px;font-size:16px;font-weight:700">Observação da venda</h3>
          <textarea id="_obsInput" rows="4" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box">${escapeHtml(venda.observacao || '')}</textarea>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button id="_obsCancelar" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-3);font-size:13px;cursor:pointer">Cancelar</button>
            <button id="_obsSalvar" style="padding:8px 16px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Salvar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#_obsCancelar').addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
      let _obsClicado = false;
      overlay.querySelector('#_obsSalvar').addEventListener('click', () => {
        if (_obsClicado) return;
        _obsClicado = true;
        const v = overlay.querySelector('#_obsInput').value;
        document.body.removeChild(overlay);
        resolve(v);
      });
    });

    if (novaObservacao === null) return;

    if (this.state._editandoObs) return;
    this.state._editandoObs = true;
    try {
      showToast('Atualizando observação...', 'info');

      await api.updateVendaObservacao(venda.id, novaObservacao);

      venda.observacao = novaObservacao;

      this.renderDetalheModal(venda);
      this.showMessage('Observação atualizada com sucesso.', 'success');

      await this.load();
    } catch (error) {
      console.error('Erro ao editar observação:', error);
      this.showMessage(this.buildFriendlyError(error), 'error');
    } finally {
      this.state._editandoObs = false;
    }
  },

  async handleEditarVenda() {
    const venda = this.state.vendaDetalheAtual;

    if (!venda) {
      this.showMessage('Venda não carregada para edição.', 'error');
      return;
    }

    if (!Array.isArray(venda.itens) || venda.itens.length === 0) {
      this.showMessage('A venda precisa ter pelo menos 1 item.', 'error');
      return;
    }

    const novoObservacao = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 8px;font-size:16px;font-weight:700">Salvar edição da venda</h3>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">O sistema reprocessará estoque e financeiro com segurança.</p>
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Observação</label>
          <textarea id="_seObs" rows="3" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box">${escapeHtml(venda.observacao || '')}</textarea>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button id="_seCancelar" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-3);font-size:13px;cursor:pointer">Cancelar</button>
            <button id="_seConfirmar" style="padding:8px 16px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Salvar edição</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#_seCancelar').addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
      let _seClicado = false;
      overlay.querySelector('#_seConfirmar').addEventListener('click', () => {
        if (_seClicado) return;
        _seClicado = true;
        const v = overlay.querySelector('#_seObs').value;
        document.body.removeChild(overlay);
        resolve(v);
      });
    });

    if (novoObservacao === null) return;

    if (this.state._editandoVenda) return;
    this.state._editandoVenda = true;
    try {
      showToast('Reprocessando venda...', 'info');

      if (this.recalcularVendaEmEdicao() === false) { this.state._editandoVenda = false; return; }

      const vendaEditada = this.state.vendaDetalheAtual;

      await api.updateVenda(venda.id, {
        empresa: this.state.empresa,
        empresa_id: api.getEmpresaId(),

        cliente_id: vendaEditada.cliente_id || null,
        cliente_nome: vendaEditada.cliente_nome || '',

        subtotal: vendaEditada.subtotal || 0,
        desconto: vendaEditada.desconto || 0,
        acrescimo: vendaEditada.acrescimo || 0,
        total: vendaEditada.total || 0,

        pagamento: vendaEditada.pagamento || 'Dinheiro',
        parcelas: vendaEditada.parcelas || 1,
        status_pagamento: vendaEditada.status_pagamento || 'pago',

        data: vendaEditada.data,
        observacao: novoObservacao,

        conta_receber:
          Array.isArray(vendaEditada.contas_receber) && vendaEditada.contas_receber.length > 0,

        itens: Array.isArray(vendaEditada.itens) ? vendaEditada.itens : []
      });

      document.getElementById('vendaDetalheModal')?.remove();

      this.showMessage('Venda editada com sucesso.', 'success');

      await this.load();
    } catch (error) {
      console.error('Erro ao editar venda:', error);
      this.showMessage(this.buildFriendlyError(error), 'error');
    } finally {
      this.state._editandoVenda = false;
    }
  },

  async confirmarExcluirVenda(id) {
    if (!id) {
      this.showMessage('Venda inválida para exclusão.', 'error');
      return;
    }

    const confirmar = await confirmarAcao('Excluir esta venda? O estoque será estornado e as contas a receber removidas (se não pagas).', 'Excluir', 'danger');

    if (!confirmar) return;

    await this.excluirVenda(id);
  },

  async excluirVenda(id) {
    const modal = document.getElementById('vendaDetalheModal');
    const btnExcluir = modal?.querySelector('[data-action="excluir-venda-modal"]');

    try {
      if (btnExcluir) {
        btnExcluir.disabled = true;
        btnExcluir.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...';
      }

      showToast('Excluindo venda...', 'info');

      await this.deleteVendaRequest(id);

      if (modal) modal.remove();

      this.showMessage('Venda excluída com sucesso.', 'success');

      await this.load();
    } catch (error) {
      console.error('Erro ao excluir venda:', error);
      const message = this.buildFriendlyError(error);
      this.showMessage(message || 'Erro ao excluir venda.', 'error');

      if (btnExcluir) {
        btnExcluir.disabled = false;
        btnExcluir.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir venda';
      }
    }
  },

  async deleteVendaRequest(id) {
    if (typeof api.deleteVenda === 'function') {
      return api.deleteVenda(id);
    }

    if (typeof api.delete === 'function') {
      return api.delete(`/vendas/${id}`);
    }

    if (typeof api.request === 'function') {
      return api.request(`/vendas/${id}`, {
        method: 'DELETE'
      });
    }

    throw new Error(
      'Método de exclusão não encontrado em api.js. Adicione api.deleteVenda(id) para chamar DELETE /vendas/:id.'
    );
  },

  setFeedback(message, type = 'info') {
    const feedback = document.getElementById('vendasFeedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.className = `module-feedback ${message ? `module-feedback--${type}` : ''}`;
  },

  showMessage(message, type = 'info') {
    this.setFeedback(message, type);
    showToast(message, type);
  },

  setLoading(value) {
    this.cache();

    if (this.el.btnFiltrar) this.el.btnFiltrar.disabled = value;
    if (this.el.btnLimpar) this.el.btnLimpar.disabled = value;
    if (this.el.btnAtualizar) this.el.btnAtualizar.disabled = value;

    if (this.el.btnAtualizar) {
      this.el.btnAtualizar.innerHTML = value
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...'
        : '<i class="fa-solid fa-rotate"></i> Atualizar';
    }
  },

  getStatusBadgeClass(status) {
    const normalized = String(status || '').toLowerCase();

    if (normalized === 'pago')              return 'badge badge--success';
    if (normalized === 'cancelado')          return 'badge badge--danger';
    if (normalized === 'atrasado')           return 'badge badge--danger';
    if (normalized === 'parcial')            return 'badge badge--warning';
    if (normalized === 'parcial_atrasado')   return 'badge badge--warning';

    return 'badge badge--info';
  },

  _highlight(text, term) {
    const safe = escapeHtml(String(text || ''));
    if (!term) return safe;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="vnd-hl">$1</mark>');
  },

  buildFriendlyError(error) {
    const message = error?.message || '';

    if (message.includes('Failed to fetch')) {
      return 'Não foi possível conectar ao backend.';
    }

    if (error?.status === 403) {
      return 'Acesso negado ou limite do plano atingido.';
    }

    if (error?.status === 400) {
      return message || 'Não foi possível concluir a operação.';
    }

    return message || 'Não foi possível carregar vendas.';
  },

  injectProfessionalStyles() {
    if (document.getElementById('vendasProfessionalStyles')) return;

    const style = document.createElement('style');
    style.id = 'vendasProfessionalStyles';
    style.textContent = `
      th[data-sort-col] { cursor: pointer; user-select: none; white-space: nowrap; }
      th[data-sort-col]:hover { color: var(--primary); }
      .vnd-sort-icon { margin-left: 4px; font-size: .7rem; opacity: .45; }
      .vnd-sort-icon--active { opacity: 1; color: var(--primary); }

      mark.vnd-hl { background: #fef08a; color: inherit; border-radius: 2px; padding: 0 1px; }
      [data-theme="dark"] mark.vnd-hl { background: #854d0e; }

      .vnd-desc-badge {
        display: inline-block; padding: 1px 5px; border-radius: 4px;
        font-size: .62rem; font-weight: 800; letter-spacing: .03em;
        background: #fee2e2; color: #dc2626;
      }
      [data-theme="dark"] .vnd-desc-badge { background: #450a0a; color: #fca5a5; }

      .vnd-pay {
        display: inline-block; padding: 2px 9px; border-radius: 99px;
        font-size: .72rem; font-weight: 700; letter-spacing: .02em;
      }
      .vnd-pay--pix         { background: #d1fae5; color: #065f46; }
      .vnd-pay--dinheiro    { background: #f1f5f9; color: #475569; }
      .vnd-pay--debito      { background: #dbeafe; color: #1e40af; }
      .vnd-pay--credito     { background: #ede9fe; color: #5b21b6; }
      .vnd-pay--promissoria { background: #fef3c7; color: #92400e; }
      .vnd-pay--other       { background: var(--info-soft, #e0f2fe); color: #0e7490; }
      [data-theme="dark"] .vnd-pay--pix         { background: #052e16; color: #6ee7b7; }
      [data-theme="dark"] .vnd-pay--dinheiro    { background: #1e293b; color: #94a3b8; }
      [data-theme="dark"] .vnd-pay--debito      { background: #1e3a5f; color: #93c5fd; }
      [data-theme="dark"] .vnd-pay--credito     { background: #2e1065; color: #c4b5fd; }
      [data-theme="dark"] .vnd-pay--promissoria { background: #3b2a00; color: #fcd34d; }
      [data-theme="dark"] .vnd-pay--other       { background: #0c4a6e; color: #7dd3fc; }

      .vendas-filters-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(150px, 1fr)) auto;
        gap: 14px;
        align-items: end;
        margin-bottom: 20px;
      }

      .vendas-filter-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .vendas-table .badge--info {
        background: var(--info-soft);
        color: #0e7490;
        border-color: rgba(8, 145, 178, 0.16);
      }

      .badge--warning {
        background: var(--warning-soft);
        color: #a16207;
        border-color: rgba(217, 119, 6, 0.16);
      }

      .venda-detail-overlay {
        padding: 18px;
        align-items: flex-start;
        justify-content: center;
        overflow-y: auto;
      }

      .venda-detail-card {
        width: min(100%, 980px);
        max-height: none;
        min-height: auto;
        overflow: visible;
        display: flex;
        flex-direction: column;
        border-radius: 26px;
        padding: 0;
        margin: 18px auto;
      }

      .venda-detail-body {
        padding: 18px 22px;
        display: grid;
        gap: 14px;
        overflow: visible;
        max-height: none;
      }

      .venda-detail-header {
        padding: 20px 22px 16px;
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        background:
          radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 32%),
          var(--surface);
      }

      .venda-detail-eyebrow {
        display: inline-flex;
        width: fit-content;
        padding: 5px 10px;
        margin-bottom: 8px;
        border-radius: 999px;
        background: var(--primary-soft);
        color: var(--primary-hover);
        font-size: 0.74rem;
        font-weight: 800;
      }

      .venda-detail-header h3 {
        font-size: 1.28rem;
        font-weight: 800;
        letter-spacing: -0.04em;
        color: var(--text);
        margin-bottom: 4px;
      }

      .venda-detail-header p {
        color: var(--text-muted);
        font-size: 0.9rem;
        font-weight: 600;
      }

      .venda-detail-summary {
        display: grid;
        grid-template-columns: 1.25fr repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .venda-detail-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: var(--surface-2);
        flex-wrap: wrap;
      }

      .venda-detail-actions .btn {
        min-height: 40px;
      }

      .btn-danger {
        background: #dc2626;
        color: #ffffff;
        border-color: #dc2626;
      }
      
            .btn-danger:hover {
        background: #b91c1c;
        border-color: #b91c1c;
      }

      .venda-detail-values {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .venda-detail-summary article,
      .venda-detail-values article,
      .venda-detail-note {
        border: 1px solid var(--border);
        background: var(--surface-2);
        border-radius: 18px;
        padding: 14px 16px;
        min-width: 0;
      }

      .venda-detail-summary article span,
      .venda-detail-values article span,
      .venda-detail-note span {
        display: block;
        color: var(--text-muted);
        font-size: 0.76rem;
        font-weight: 800;
        margin-bottom: 6px;
      }

      .venda-detail-summary article strong,
      .venda-detail-values article strong {
        display: block;
        color: var(--text);
        font-size: 0.98rem;
        font-weight: 800;
        line-height: 1.25;
        word-break: break-word;
      }

      .venda-detail-summary__main strong {
        font-size: 1.35rem !important;
        letter-spacing: -0.04em;
      }

      .venda-detail-summary article small {
        display: block;
        margin-top: 6px;
        color: var(--text-muted);
        font-weight: 700;
      }

      .venda-detail-note {
        padding: 12px 16px;
      }

      .venda-detail-note p {
        color: var(--text);
        font-weight: 700;
        line-height: 1.45;
      }

      .venda-detail-section {
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--surface);
        overflow: hidden;
      }

      .venda-detail-section--editing .venda-detail-section__header::after {
        content: "Modo edição";
        font-size: 0.72rem;
        font-weight: 900;
        color: var(--primary-hover);
        background: var(--primary-soft);
        border: 1px solid rgba(37, 99, 235, 0.14);
        padding: 6px 9px;
        border-radius: 999px;
      }

      .venda-detail-section__header {
        padding: 13px 16px;
        background: var(--surface-2);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .venda-detail-section__header h4 {
        color: var(--text);
        font-size: 0.98rem;
        font-weight: 800;
        margin-bottom: 3px;
      }

      .venda-detail-section__header p {
        color: var(--text-muted);
        font-size: 0.82rem;
        font-weight: 600;
      }

      .venda-detail-section__header > span {
        flex-shrink: 0;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text-muted);
        padding: 7px 10px;
        font-size: 0.78rem;
        font-weight: 800;
      }

      .venda-detail-list {
        display: grid;
      }

      .venda-detail-row {
        display: grid;
        grid-template-columns: 1.35fr 0.75fr 0.75fr 0.75fr auto;
        gap: 14px;
        align-items: center;
        padding: 13px 16px;
        border-bottom: 1px solid var(--border);
      }

      .venda-detail-row--receber {
        grid-template-columns: 1.4fr 0.8fr 0.8fr auto;
      }

      .venda-detail-row:last-child {
        border-bottom: none;
      }

      .venda-detail-row strong {
        color: var(--text);
        font-size: 0.92rem;
        font-weight: 800;
      }

      .venda-detail-row small,
      .venda-detail-row span {
        display: block;
        color: var(--text-muted);
        font-size: 0.76rem;
        font-weight: 700;
        margin-bottom: 3px;
      }

      .venda-edit-qtd-input {
        width: 72px;
        margin-left: 8px;
        padding: 7px 9px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
        color: var(--text);
        font-weight: 800;
        text-align: center;
        outline: none;
      }

      .venda-edit-qtd-input:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      }

      .venda-detail-row .btn-danger {
        padding: 8px 11px;
        border-radius: 10px;
        font-size: 0.78rem;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        justify-content: center;
      }

      .venda-detail-row > div:last-child {
        display: flex;
        justify-content: flex-end;
      }

      .empty-detail-state {
        padding: 18px 16px;
        color: var(--text-muted);
        font-weight: 700;
      }

      .venda-detail-footer {
        padding: 14px 22px 18px;
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: flex-end;
        background: var(--surface);
      }

      .venda-add-product-overlay {
        padding: 18px;
        align-items: flex-start;
        justify-content: center;
        overflow-y: auto;
      }

      .venda-add-product-card {
        width: min(100%, 540px);
        border-radius: 24px;
        padding: 0;
        margin: 30px auto;
        overflow: hidden;
      }

      .venda-add-product-header {
        padding: 20px 22px 16px;
        border-bottom: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        gap: 14px;
        background: var(--surface);
      }

      .venda-add-product-header h3 {
        font-size: 1.15rem;
        font-weight: 900;
        color: var(--text);
        margin-bottom: 4px;
      }

      .venda-add-product-header p {
        font-size: 0.86rem;
        color: var(--text-muted);
        font-weight: 600;
      }

      .venda-add-product-body {
        padding: 18px 22px;
        display: grid;
        gap: 12px;
      }

      .venda-add-product-list {
        display: grid;
        gap: 8px;
        max-height: 300px;
        overflow-y: auto;
        padding-right: 4px;
      }

      .item-produto-add {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface-2);
        padding: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        text-align: left;
        color: var(--text);
      }

      .item-produto-add:hover {
        border-color: var(--primary);
        background: var(--primary-soft);
      }

      .item-produto-add:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .item-produto-add strong {
        display: block;
        font-weight: 900;
        color: var(--text);
      }

      .item-produto-add small {
        display: block;
        color: var(--text-muted);
        font-weight: 700;
        margin-top: 2px;
      }

      .item-produto-add span {
        color: var(--primary-hover);
        font-weight: 900;
        flex-shrink: 0;
      }

      .venda-add-product-footer {
        padding: 14px 22px 18px;
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: flex-end;
      }

      .btn-success {
  background: #16a34a;
  color: #ffffff;
  border-color: #16a34a;
}

.btn-success:hover {
  background: #15803d;
  border-color: #15803d;
}

.btn-warning {
  background: #d97706;
  color: #ffffff;
  border-color: #d97706;
}

.btn-warning:hover {
  background: #b45309;
  border-color: #b45309;
}

      @media (max-width: 980px) {
        .vendas-filters-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .vendas-filter-actions {
          grid-column: 1 / -1;
        }

        .venda-detail-summary,
        .venda-detail-values {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .venda-detail-actions {
          justify-content: stretch;
        }

        .venda-detail-actions .btn {
          flex: 1;
        }

        .venda-detail-row,
        .venda-detail-row--receber {
          grid-template-columns: 1fr;
          gap: 8px;
        }

        .venda-detail-row > div:last-child {
          justify-content: flex-start;
        }

        .venda-edit-qtd-input {
          width: 90px;
        }
      }

      @media (max-width: 560px) {
        .vendas-filters-grid,
        .venda-detail-summary,
        .venda-detail-values {
          grid-template-columns: 1fr;
        }

        .venda-detail-overlay,
        .venda-add-product-overlay {
          padding: 10px;
          align-items: flex-start;
        }

        .venda-detail-card,
        .venda-add-product-card {
          border-radius: 20px;
        }

        .venda-detail-body,
        .venda-add-product-body {
          padding: 14px;
        }

        .vendas-filter-actions,
        .venda-detail-actions {
          flex-direction: column;
        }

        .vendas-filter-actions .btn,
        .venda-detail-actions .btn {
          width: 100%;
        }
        
        .venda-lock-alert {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(220, 38, 38, 0.18);
  background: rgba(220, 38, 38, 0.08);
  color: #991b1b;
  font-size: 0.86rem;
  font-weight: 800;
}

.venda-detail-actions .btn:disabled,
.venda-edit-qtd-input:disabled,
.venda-detail-row button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

      .btn-success {
  background: #16a34a;
  color: #ffffff;
  border-color: #16a34a;
}

.btn-success:hover {
  background: #15803d;
  border-color: #15803d;
}
      }
    `;

    document.head.appendChild(style);
  },

  async emitirNfce(vendaId, btn) {
    const original = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try {
      const result = await api.emitirNfce(vendaId);
      if (result.status === 'autorizado') {
        showToast(`NFC-e autorizada! Nº ${result.numero || '—'}`, 'success');
      } else if (result.status === 'processando') {
        showToast('NFC-e em processamento na SEFAZ. Consulte em alguns instantes.', 'info');
      } else {
        showToast(`NFC-e: ${result.mensagem || result.status}`, 'warning');
      }
    } catch (err) {
      showToast(err?.message || 'Erro ao emitir NFC-e', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  },

  // ── Metas de vendas ──────────────────────────────────────────────────────────

  async abrirMetas() {
    if (!document.getElementById('metasModal')) {
      const el = document.createElement('div');
      el.className = 'modal-overlay hidden';
      el.id = 'metasModal';
      el.innerHTML = `
        <div class="modal-card" style="max-width:680px;width:95vw">
          <div class="modal-card__header">
            <div>
              <h3><i class="fa-solid fa-bullseye" style="margin-right:8px"></i>Metas de Vendas</h3>
              <p id="metasSubtitulo" style="color:var(--text-muted);font-size:.9rem"></p>
            </div>
            <button type="button" class="icon-button" id="metasFecharBtn">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center">
            <label style="font-size:.88rem;font-weight:600">Período:</label>
            <input type="month" id="metasPeriodoInput" class="filter-input" />
            <button class="btn btn-light btn-sm" id="metasCarregarBtn">
              <i class="fa-solid fa-search"></i> Carregar
            </button>
          </div>
          <div id="metasCorpo" style="padding:20px 24px;overflow-y:auto;max-height:60vh"></div>
          <div class="modal-card__footer" style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:space-between">
            <button type="button" class="btn btn-primary btn-sm" id="metasNovaBtn">
              <i class="fa-solid fa-plus"></i> Nova meta
            </button>
            <button type="button" class="btn btn-light" id="metasFecharFooter">Fechar</button>
          </div>
        </div>`;
      document.body.appendChild(el);

      const hoje = todayFortaleza().slice(0, 7);
      document.getElementById('metasPeriodoInput').value = hoje;
      document.getElementById('metasCarregarBtn').addEventListener('click', () => {
        const p = document.getElementById('metasPeriodoInput').value;
        if (p) this._carregarMetas(p);
      });
      document.getElementById('metasFecharFooter').addEventListener('click', () => {
        document.getElementById('metasModal').classList.add('hidden');
      });
    }

    document.getElementById('metasModal').classList.remove('hidden');
    const periodo = document.getElementById('metasPeriodoInput').value || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date()).slice(0, 7);
    await this._carregarMetas(periodo);
  },

  async _carregarMetas(periodo) {
    const corpo = document.getElementById('metasCorpo');
    const sub   = document.getElementById('metasSubtitulo');
    if (!corpo) return;
    corpo.innerHTML = `<div class="module-feedback module-feedback--info">Carregando metas...</div>`;

    try {
      const data = await api.request('/metas-vendas', { method: 'GET', query: { periodo, empresa_id: api.getEmpresaId() } });
      const metas = data.metas || [];

      if (sub) sub.textContent = `Período: ${periodo} · ${metas.length} meta(s) cadastrada(s)`;

      if (!metas.length) {
        corpo.innerHTML = `<div class="empty-state">Nenhuma meta cadastrada para este período. Clique em "Nova meta" para adicionar.</div>`;
        return;
      }

      const cur = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      corpo.innerHTML = metas.map((m) => {
        const pct = m.percentual || 0;
        const cor = pct >= 100 ? 'var(--success,#38a169)' : pct >= 70 ? 'var(--warning,#d69e2e)' : 'var(--danger,#e53e3e)';
        return `
          <div style="border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div>
                <strong style="font-size:.95rem">${escapeHtml(m.vendedor_nome || m.vendedor_usuario || 'Meta global da empresa')}</strong>
                ${m.descricao ? `<div style="font-size:.8rem;color:var(--text-muted)">${escapeHtml(m.descricao)}</div>` : ''}
              </div>
              <button class="btn-inline btn-inline--danger js-excluir-meta" data-meta-id="${Number(m.id)}" aria-label="Excluir meta">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;font-size:.85rem">
              <div><span style="color:var(--text-muted);display:block">Meta</span><strong>${cur(m.valor_meta)}</strong></div>
              <div><span style="color:var(--text-muted);display:block">Realizado</span><strong style="color:${cor}">${cur(m.realizado)}</strong></div>
              <div><span style="color:var(--text-muted);display:block">Faltando</span><strong>${cur(m.faltando)}</strong></div>
            </div>
            <div style="background:var(--surface-2);border-radius:999px;height:10px;overflow:hidden">
              <div style="width:${Math.min(100,pct)}%;height:100%;background:${cor};border-radius:999px;transition:width .4s"></div>
            </div>
            <div style="text-align:right;font-size:.8rem;color:${cor};font-weight:700;margin-top:4px">${pct}%</div>
          </div>`;
      }).join('');

      if (!corpo.dataset.metaClickBound) {
        corpo.dataset.metaClickBound = '1';
        corpo.addEventListener('click', (ev) => {
          const btn = ev.target.closest('.js-excluir-meta');
          if (btn) {
            const p = document.getElementById('metasPeriodoInput')?.value || '';
            VendasModule.excluirMeta(Number(btn.dataset.metaId), p);
          }
        });
      }

    } catch (err) {
      corpo.innerHTML = `<div class="module-feedback module-feedback--error">${escapeHtml(err.message) || 'Erro ao carregar metas'}</div>`;
    }
  },

  async criarMeta() {
    const periodo = document.getElementById('metasPeriodoInput')?.value || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date()).slice(0, 7);

    const resultado = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      const div = document.createElement('div');
      div.style.cssText = 'background:var(--surface);border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)';
      div.innerHTML = `
        <h3 style="margin:0 0 16px;font-size:16px;font-weight:700">Meta — ${escapeHtml(periodo)}</h3>
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:4px">Valor (R$)</label>
        <input id="_metaValorInput" type="number" min="0" step="0.01" placeholder="0,00" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:12px" />
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:4px">Descrição (opcional)</label>
        <input id="_metaDescInput" type="text" placeholder="Ex: Meta mensal" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:20px" />
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_metaCancelarBtn" class="btn-cancel">Cancelar</button>
          <button id="_metaConfirmarBtn" class="btn-confirm btn-confirm--success">Criar meta</button>
        </div>`;
      overlay.appendChild(div);
      document.body.appendChild(overlay);
      overlay.querySelector('#_metaCancelarBtn').addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
      overlay.querySelector('#_metaConfirmarBtn').addEventListener('click', (e) => {
        const valor = overlay.querySelector('#_metaValorInput').value.trim();
        if (!valor || isNaN(Number(valor)) || Number(valor) <= 0) {
          overlay.querySelector('#_metaValorInput').focus(); return;
        }
        e.currentTarget.disabled = true;
        const descricao = overlay.querySelector('#_metaDescInput').value.trim();
        document.body.removeChild(overlay);
        resolve({ valor: Number(valor), descricao });
      });
      setTimeout(() => overlay.querySelector('#_metaValorInput')?.focus(), 50);
    });

    if (!resultado) return;

    try {
      await api.request('/metas-vendas', {
        method: 'POST',
        body: { periodo, valor_meta: resultado.valor, descricao: resultado.descricao || null, empresa_id: api.getEmpresaId() }
      });
      showToast('Meta criada!', 'success');
      await this._carregarMetas(periodo);
    } catch (err) {
      showToast(err.message || 'Erro ao criar meta', 'error');
    }
  },

  async excluirMeta(id, periodo) {
    if (!await confirmarAcao('Excluir esta meta?', 'Excluir', 'danger')) return;
    try {
      await api.request(`/metas-vendas/${id}`, { method: 'DELETE', query: { empresa_id: api.getEmpresaId() } });
      showToast('Meta excluída', 'success');
      await this._carregarMetas(periodo);
    } catch (err) {
      showToast(err.message || 'Erro ao excluir', 'error');
    }
  },

  // ── Recibo simples (não fiscal) ──────────────────────────────────────────────

  async imprimirRecibo(vendaId) {
    if (!vendaId) return;
    try {
      const venda = await api.getVendaDetalhe(vendaId);
      this._abrirJanelaRecibo(venda);
    } catch (err) {
      showToast(err?.message || 'Erro ao carregar dados da venda', 'error');
    }
  },

  _abrirJanelaRecibo(venda) {
    const cur = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dt  = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR') : '-';
    const esc = escapeHtml;

    const empresa = window.LfErpApi?.getEmpresaNome?.() || '';

    const itens = (venda.itens || []).map((i) => `
      <tr>
        <td>${esc(i.produto_nome || '-')}</td>
        <td class="center">${Number(i.quantidade || 0)}</td>
        <td class="right">${cur(i.preco_unitario)}</td>
        <td class="right">${cur(i.total)}</td>
      </tr>`).join('');

    const pagamentos = Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1
      ? venda.pagamentos.map((p) => `<div style="display:flex;justify-content:space-between"><span>${esc(p.forma)}</span><span>${cur(p.valor)}</span></div>`).join('')
      : '';

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Recibo #${venda.id}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #222; padding: 20px; max-width: 380px; margin: 0 auto; }
        h1 { font-size: 16px; text-align: center; margin-bottom: 2px; }
        .empresa { text-align: center; font-size: 13px; font-weight: bold; margin-bottom: 12px; }
        .sep { border: none; border-top: 1px dashed #aaa; margin: 10px 0; }
        .info { margin-bottom: 10px; }
        .info div { display: flex; justify-content: space-between; margin-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th { text-align: left; border-bottom: 1px solid #ccc; padding: 4px 0; font-size: 11px; }
        td { padding: 4px 0; vertical-align: top; font-size: 11px; }
        td.right, th.right { text-align: right; }
        td.center { text-align: center; }
        .totais { border-top: 1px dashed #aaa; padding-top: 8px; margin-top: 4px; }
        .totais div { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .totais .total-final { font-size: 14px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 6px; margin-top: 4px; }
        .rodape { text-align: center; margin-top: 16px; font-size: 10px; color: #666; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <div class="empresa">${esc(empresa)}</div>
      <h1>RECIBO DE VENDA</h1>
      <hr class="sep">
      <div class="info">
        <div><span>Nº da venda:</span><span>#${venda.id}</span></div>
        <div><span>Data:</span><span>${dt(venda.data)}</span></div>
        ${venda.cliente_nome ? `<div><span>Cliente:</span><span>${esc(venda.cliente_nome)}</span></div>` : ''}
      </div>
      <hr class="sep">
      <table>
        <thead><tr>
          <th>Produto</th><th class="center">Qtd</th>
          <th class="right">Unit.</th><th class="right">Total</th>
        </tr></thead>
        <tbody>${itens}</tbody>
      </table>
      <div class="totais">
        ${Number(venda.desconto || 0) > 0 ? `<div><span>Subtotal</span><span>${cur(venda.subtotal)}</span></div><div><span>Desconto</span><span>- ${cur(venda.desconto)}</span></div>` : ''}
        ${Number(venda.acrescimo || 0) > 0 ? `<div><span>Acréscimo</span><span>+ ${cur(venda.acrescimo)}</span></div>` : ''}
        <div class="total-final"><span>TOTAL</span><span>${cur(venda.total)}</span></div>
        ${pagamentos ? `<div style="margin-top:6px;font-size:11px;color:#555">${pagamentos}</div>` : `<div style="margin-top:4px;font-size:11px;color:#555"><span>Pagamento:</span><span>${esc(venda.pagamento || '-')}</span></div>`}
      </div>
      ${venda.observacao ? `<hr class="sep"><div style="font-size:11px;color:#666">Obs: ${esc(venda.observacao)}</div>` : ''}
      <div class="rodape">
        Documento sem valor fiscal · Gerado em ${new Date().toLocaleDateString('pt-BR')}
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`;

    const win = window.open('', '_blank', 'width=420,height=600');
    if (win) { win.document.write(html); win.document.close(); }
    else showToast('Permita pop-ups para imprimir o recibo.', 'warning');
  }
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';

  const normalized = String(value).slice(0, 10);
  const date = new Date(`${normalized}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(String(value));
  }

  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
}


function capitalize(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatStatusVenda(status) {
  const mapa = {
    pago:             'Pago',
    pendente:         'Pendente',
    parcial:          'Parcial',
    atrasado:         'Atrasado',
    parcial_atrasado: 'Parcial em atraso',
    cancelado:        'Cancelado'
  };
  return escapeHtml(mapa[String(status || '').toLowerCase()] || capitalize(status));
}

function badgePagamento(pagamento) {
  const p = String(pagamento || '').trim();
  const pl = p.toLowerCase();
  let cls = 'vnd-pay--other';
  if (pl === 'pix')                                          cls = 'vnd-pay--pix';
  else if (pl === 'dinheiro')                                cls = 'vnd-pay--dinheiro';
  else if (pl.includes('débito') || pl.includes('debito'))   cls = 'vnd-pay--debito';
  else if (pl.includes('crédito') || pl.includes('credito')) cls = 'vnd-pay--credito';
  else if (pl === 'promissória' || pl === 'promissoria')     cls = 'vnd-pay--promissoria';
  return `<span class="vnd-pay ${cls}">${escapeHtml(p || '-')}</span>`;
}

export function initVendasModule() {
  VendasModule.init();
  return VendasModule.load();
}

// Expõe globalmente para onclick inline dentro dos modais de metas
window.VendasModule = VendasModule;

export default VendasModule;
