import api from './api.js';
import { getAuth } from './auth.js';
import { showToast } from './feedback.js';
import * as PdvOffline from './pdvOffline.js';

const PDVModule = {
  state: {
    initialized: false,
    empresa: null,
    clientes: [],
    produtos: [],
    produtosFiltrados: [],
    carrinho: [],
    clienteId: '',
    clienteNome: '',
    desconto: 0,
    acrescimo: 0,
    observacao: '',
    salvando: false,
    pagamentos: [{ forma: 'Dinheiro', valor: 0, parcelas: 1, vencimento: '' }],
    activeTab: 'produtos',
    gradeModalProduto: null,
    gradesDisponiveis: [],
    _gradeReqId: 0,
    _recalcReqId: 0,
    _pixCleanup: null,
    _salOrc: false
  },

  init() {
    this._eventsBound = false;
    // _keyboardBound e _offlineBound NÃO são resetados: listeners no document são registrados uma única vez
    this.state.carrinho = [];
    this.state.clientes = [];
    this.state.produtos = [];
    this.state.produtosFiltrados = [];
    this.state.pagamentos = [{ forma: 'Dinheiro', valor: 0, parcelas: 1, vencimento: '' }];
    this.state.salvando = false;
    this.state.activeTab = 'produtos';
    this.state.gradeModalProduto = null;
    this.state.gradesDisponiveis = [];
    this.state.clienteId = '';
    this.state.clienteNome = '';
    this.state.desconto = 0;
    this.state.acrescimo = 0;
    this.state.observacao = '';
    this.resolveEmpresa();
    this.render();
    this.cache();
    this.bindLocalEvents();
    this.bindOfflineEvents();
  },

  resolveEmpresa() {
    const auth = getAuth();
    this.state.empresa = auth?.empresa?.nome || auth?.user?.empresa || 'LF ERP';
    PdvOffline.setEmpresaId(api.getEmpresaId());
  },

  cache() {
    this.el = {
      container: document.getElementById('pdvContainer'),
      clienteSelect: document.getElementById('pdvCliente'),
      clienteBusca: document.getElementById('pdvClienteBusca'),
      clienteDropdown: document.getElementById('pdvClienteDropdown'),
      clienteNomeInfo: document.getElementById('pdvClienteNomeInfo'),
      buscaProduto: document.getElementById('pdvBuscaProduto'),
      listaProdutos: document.getElementById('pdvListaProdutos'),
      carrinhoBody: document.getElementById('pdvCarrinhoBody'),
      emptyCarrinho: document.getElementById('pdvCarrinhoEmpty'),
      pagamentosLista: document.getElementById('pdvPagamentosLista'),
      splitRestante: document.getElementById('pdvSplitRestante'),
      addPagamentoBtn: document.getElementById('pdvAddPagamentoBtn'),
      desconto: document.getElementById('pdvDesconto'),
      acrescimo: document.getElementById('pdvAcrescimo'),
      observacao: document.getElementById('pdvObservacao'),
      subtotal: document.getElementById('pdvSubtotal'),
      total: document.getElementById('pdvTotal'),
      totalItens: document.getElementById('pdvTotalItens'),
      formFeedback: document.getElementById('pdvFormFeedback'),
      finalizarBtn: document.getElementById('pdvFinalizarBtn'),
      limparBtn: document.getElementById('pdvLimparBtn'),
      atualizarBtn: document.getElementById('pdvAtualizarBtn')
    };
  },

  bindLocalEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    this.cache();

    this.el.buscaProduto?.addEventListener('input', (event) => {
      clearTimeout(this._buscaTimer);
      this._buscaTimer = setTimeout(() => this.filterProdutos(event.target.value), 250);
    });

    this.el.desconto?.addEventListener('input', (event) => {
      this.state.desconto = this.parseMoneyInput(event.target.value);
      this.renderResumo();
    });

    this.el.acrescimo?.addEventListener('input', (event) => {
      this.state.acrescimo = this.parseMoneyInput(event.target.value);
      this.renderResumo();
    });

    this.el.observacao?.addEventListener('input', (event) => {
      this.state.observacao = event.target.value || '';
    });

    // Autocomplete de cliente
    this.el.clienteBusca?.addEventListener('input', () => {
      const term = this.el.clienteBusca.value.trim();
      if (!term) { this.limparCliente(); this.renderClienteDropdown([]); return; }
      this.renderClienteDropdown(this.filterClientes(term));
    });
    this.el.clienteBusca?.addEventListener('blur', () => {
      setTimeout(() => this.renderClienteDropdown([]), 200);
    });
    this.el.clienteBusca?.addEventListener('focus', () => {
      const term = this.el.clienteBusca.value.trim();
      if (term) this.renderClienteDropdown(this.filterClientes(term));
    });

    // â”€â”€ Split de pagamento — delegação de eventos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.getElementById('pdvAddPagamentoBtn')?.addEventListener('click', () => {
      this.addPagamento();
    });

    document.getElementById('pdvPagamentosLista')?.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.idx);
      if (isNaN(idx)) return;

      if (e.target.classList.contains('pdv-split-forma')) {
        this.state.pagamentos[idx].forma = e.target.value;
        this.renderPagamentos();
      } else if (e.target.classList.contains('pdv-split-parcelas')) {
        this.state.pagamentos[idx].parcelas = Math.max(1, Number(e.target.value) || 1);
      } else if (e.target.classList.contains('pdv-split-vencimento')) {
        this.state.pagamentos[idx].vencimento = e.target.value || '';
      }
    });

    document.getElementById('pdvPagamentosLista')?.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.idx);
      if (isNaN(idx)) return;

      if (e.target.classList.contains('pdv-split-valor')) {
        this.state.pagamentos[idx].valor = this.parseMoneyInput(e.target.value);
        this.renderSplitRestante();
      }
    });

    document.getElementById('pdvPagamentosLista')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pdv-split-remove');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (isNaN(idx)) return;
      this.removePagamento(idx);
    });

    // â”€â”€ Eventos do modal de grade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!this._gradeModalBound) {
      this._gradeModalBound = true;

      document.getElementById('pdvGradeModalClose')?.addEventListener('click', () => {
        this.closeGradeSelector();
      });

      document.getElementById('pdvGradeModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('pdvGradeModal')) this.closeGradeSelector();
      });

      document.getElementById('pdvGradeGrid')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pdv-grade-id]');
        if (!btn) return;
        const gradeId  = Number(btn.dataset.pdvGradeId);
        const estoque  = Number(btn.dataset.estoque);
        const preco    = Number(btn.dataset.preco) || null;
        const atrib1   = btn.dataset.atrib1;
        const atrib2   = btn.dataset.atrib2 || '';
        if (estoque <= 0) { showToast('Variação sem estoque.', 'error'); return; }
        this.selectGrade(gradeId, atrib1, atrib2, estoque, preco);
      });
    }

    // â”€â”€ Abas mobile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.getElementById('pdvTabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.switchTab(btn.dataset.tab);
    });

    document.getElementById('pdvNovaVendaBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.resetVenda();
    });

    document.getElementById('pdvNovoClienteBtn')?.addEventListener('click', () => {
      this.abrirNovoClienteModal();
    });

    document.getElementById('pdvCobrarOSBtn')?.addEventListener('click', () => {
      this.abrirCobrarOS();
    });

    this.el.atualizarBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.load();
    });

    this.el.limparBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      if (this.state.carrinho.length > 0 && !confirm('Excluir venda e limpar o carrinho?')) return;
      this.resetVenda();
    });

    document.getElementById('pdvSalvarOrcamentoBtn')?.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.salvarOrcamento();
    });

    this.el.finalizarBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.finalizarVenda();
    });

    this.el.listaProdutos?.addEventListener('click', (event) => {
      const button = event.target.closest("[data-action='pdv-add-produto']");
      if (!button) return;

      event.preventDefault();
      const id = Number(button.dataset.id);
      this.addProduto(id);
    });

    this.el.carrinhoBody?.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      event.preventDefault();

      if (button.dataset.action === 'pdv-remove-item') {
        const index = Number(button.dataset.index);
        this.removeItem(index);
        return;
      }

      if (button.dataset.action === 'pdv-qty-minus') {
        const index = Number(button.dataset.index);
        this.updateQuantidade(index, -1);
        return;
      }

      if (button.dataset.action === 'pdv-qty-plus') {
        const index = Number(button.dataset.index);
        this.updateQuantidade(index, 1);
      }
    });

    this.el.carrinhoBody?.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.index);
      if (isNaN(idx) || !this.state.carrinho[idx]) return;
      if (e.target.classList.contains('pdv-item-desc')) {
        this.state.carrinho[idx].desconto_pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        this.renderResumo();
      } else if (e.target.classList.contains('pdv-item-preco')) {
        this.state.carrinho[idx].preco_unitario = parseFloat(String(e.target.value).replace(',', '.')) || 0;
        this.renderResumo();
      }
    });

    this.el.carrinhoBody?.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.index);
      if (isNaN(idx) || !this.state.carrinho[idx]) return;
      if (e.target.classList.contains('pdv-item-desc')) {
        const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        e.target.value = val || '';
        this.state.carrinho[idx].desconto_pct = val;
        this.renderCarrinho();
        this.renderResumo();
      } else if (e.target.classList.contains('pdv-item-preco')) {
        const preco = parseFloat(String(e.target.value).replace(',', '.')) || 0;
        this.state.carrinho[idx].preco_unitario = preco;
        e.target.value = preco.toFixed(2).replace('.', ',');
        this.renderCarrinho();
        this.renderResumo();
      }
    });

    this.bindKeyboardShortcuts();
  },

  bindKeyboardShortcuts() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;

    document.addEventListener('keydown', (e) => {
      // Só ativa quando o PDV está visível
      const buscaEl = document.getElementById('pdvBuscaProduto');
      if (!buscaEl || !buscaEl.offsetParent) return;

      const tag      = document.activeElement?.tagName?.toLowerCase();
      const inInput  = ['input', 'textarea', 'select'].includes(tag);
      const inBusca  = document.activeElement === this.el.buscaProduto;

      // F2 — focar campo de busca de produto
      // Alt+Z — aba Produto / Alt+C — aba Cliente / Alt+B — aba Pagamento
      if (e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.switchTab('produtos');
        this.el.buscaProduto?.focus();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this.switchTab('cliente');
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.switchTab('pagamento');
        return;
      }

      // Alt+N — nova venda
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.resetVenda();
        return;
      }

      // Alt+S — finalizar venda
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!this.state.salvando && this.state.carrinho.length > 0) {
          this.finalizarVenda();
        }
        return;
      }

      // Alt+Q — excluir/limpar venda
      if (e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        if (this.state.carrinho.length > 0) this.resetVenda();
        return;
      }

      // F2 — focar campo de busca de produto
      if (e.key === 'F2') {
        e.preventDefault();
        this.switchTab('produtos');
        this.el.buscaProduto?.focus();
        this.el.buscaProduto?.select();
        return;
      }

      // / — focar busca se não estiver em nenhum input
      if (e.key === '/' && !inInput) {
        e.preventDefault();
        this.el.buscaProduto?.focus();
        this.el.buscaProduto?.select();
        return;
      }

      // F9 — finalizar venda
      if (e.key === 'F9') {
        e.preventDefault();
        if (!this.state.salvando && this.state.carrinho.length > 0) {
          this.finalizarVenda();
        }
        return;
      }

      // F8 — limpar venda
      if (e.key === 'F8') {
        e.preventDefault();
        if (this.state.carrinho.length > 0) this.resetVenda();
        return;
      }

      // Escape — fecha modal de grade, ou limpa o campo de busca
      if (e.key === 'Escape') {
        const gradeModal = document.getElementById('pdvGradeModal');
        if (gradeModal && !gradeModal.classList.contains('hidden')) {
          this.closeGradeSelector();
          return;
        }
        if (inBusca) {
          this.el.buscaProduto.value = '';
          this.filterProdutos('');
        }
        return;
      }

      // Enter na busca — adiciona o primeiro produto visível e limpa a busca
      if (e.key === 'Enter' && inBusca) {
        e.preventDefault();
        const primeiroBtn = this.el.listaProdutos
          ?.querySelector("[data-action='pdv-add-produto']");
        if (primeiroBtn) {
          this.addProduto(Number(primeiroBtn.dataset.id));
          this.el.buscaProduto.value = '';
          this.filterProdutos('');
          this.el.buscaProduto.focus();
        }
        return;
      }

      // + / = — aumentar quantidade do Ãºltimo item do carrinho
      if (!inInput && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        if (this.state.carrinho.length > 0) {
          this.updateQuantidade(this.state.carrinho.length - 1, 1);
        }
        return;
      }

      // - — diminuir quantidade do Ãºltimo item do carrinho
      if (!inInput && e.key === '-') {
        e.preventDefault();
        if (this.state.carrinho.length > 0) {
          this.updateQuantidade(this.state.carrinho.length - 1, -1);
        }
        return;
      }

      // Delete — remover Ãºltimo item do carrinho
      if (!inInput && e.key === 'Delete') {
        e.preventDefault();
        if (this.state.carrinho.length > 0) {
          this.removeItem(this.state.carrinho.length - 1);
        }
        return;
      }
    });
  },

  async load() {
    this.resolveEmpresa();
    this.cache();

    if (!this.state.empresa) {
      this.setFeedback('Empresa não identificada para carregar o PDV.', 'error');
      return;
    }

    const isOnline = navigator.onLine;
    this.updateOfflineIndicator(isOnline);
    this.setLoading(true);
    this.setFeedback('Carregando dados do PDV...', 'info');

    try {
      if (isOnline) {
        const [clientes, produtos] = await Promise.all([
          this.fetchClientes(),
          this.fetchProdutos(),
          this.syncPendentesIfOnline().catch(() => {})
        ]);
        this.state.clientes = Array.isArray(clientes) ? clientes : [];
        this.state.produtos = Array.isArray(produtos) ? produtos : [];
        PdvOffline.salvarProdutos(this.state.produtos).catch(() => {});
        PdvOffline.salvarClientes(this.state.clientes).catch(() => {});
      } else {
        const [produtos, clientes] = await Promise.all([PdvOffline.getProdutos(), PdvOffline.getClientes()]);
        this.state.produtos = produtos;
        this.state.clientes = clientes;
      }

      this.renderClientes();
      this.filterProdutos('');
      this.renderCarrinho();
      this.renderResumo();

      if (!isOnline) {
        const pendentes = await PdvOffline.contarVendasPendentes();
        if (!this.state.produtos.length) {
          this.setFeedback('Sem conexão e sem dados em cache. Aguarde a conexão.', 'error');
        } else {
          const msg = pendentes > 0
            ? `Offline — ${this.state.produtos.length} produto(s) em cache. ${pendentes} venda(s) aguardando sincronização.`
            : `Offline — ${this.state.produtos.length} produto(s) em cache.`;
          this.setFeedback(msg, 'warning');
        }
      } else {
        this.setFeedback('', 'info');
      }
    } catch (error) {
      console.error('Erro ao carregar PDV:', error);

      if (!navigator.onLine) {
        try {
          this.state.produtos = await PdvOffline.getProdutos();
          this.state.clientes = await PdvOffline.getClientes();
          this.state.produtosFiltrados = [...this.state.produtos];
          this.renderClientes();
          this.renderProdutos();
          this.renderCarrinho();
          this.renderResumo();
          this.setFeedback(`Sem conexão — usando ${this.state.produtos.length} produto(s) do cache.`, 'warning');
          return;
        } catch { /* sem cache */ }
      }

      this.state.clientes = [];
      this.state.produtos = [];
      this.state.produtosFiltrados = [];
      this.renderClientes();
      this.renderProdutos();
      this.renderCarrinho();
      this.renderResumo();
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
      showToast(message, 'error');
    } finally {
      this.setLoading(false);
    }
  },

  render() {
    const container = document.getElementById('pdvContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="pdv-v2">

        <!-- ── Cabeçalho ─────────────────────────────────────────────────── -->
        <header class="pdv-v2__header">
          <div class="pdv-v2__header-left">
            <span id="pdvOfflineIndicator" class="pdv-offline-badge hidden">
              <i class="fa-solid fa-wifi-slash"></i> Offline
            </span>
            <div class="module-feedback pdv-v2__feedback" id="pdvFormFeedback"></div>
          </div>
          <div class="pdv-v2__header-right">
            <button type="button" class="btn btn-light btn-sm" id="pdvCobrarOSBtn">
              <i class="fa-solid fa-screwdriver-wrench"></i> Cobrar OS
            </button>
            <button type="button" class="btn btn-light btn-sm" id="pdvSalvarOrcamentoBtn">
              <i class="fa-solid fa-file-lines"></i> Orçamento
            </button>
            <button type="button" class="btn btn-primary" id="pdvNovaVendaBtn">
              <i class="fa-solid fa-plus"></i> Nova venda
            </button>
            <button type="button" class="btn btn-light btn-icon" id="pdvAtualizarBtn" title="Atualizar dados">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
        </header>

        <!-- ── Corpo principal ───────────────────────────────────────────── -->
        <div class="pdv-v2__body">

          <!-- Painel esquerdo: Tabs + conteúdo -->
          <div class="pdv-v2__left">

            <!-- Tabs -->
            <div class="pdv-v2__tabs" id="pdvTabs">
              <button type="button" class="pdv-v2__tab pdv-v2__tab--active" data-tab="produtos">Produto</button>
              <button type="button" class="pdv-v2__tab" data-tab="cliente">Cliente</button>
              <button type="button" class="pdv-v2__tab" data-tab="pagamento">Pagamento</button>
            </div>

            <!-- Painel: Produto -->
            <div class="pdv-v2__panel pdv-v2__panel--active" data-pdv-panel="produtos">
              <div class="pdv-v2__search-wrap">
                <i class="fa-solid fa-magnifying-glass pdv-v2__search-icon"></i>
                <input type="text" id="pdvBuscaProduto" class="pdv-v2__search-input"
                  inputmode="search" autocomplete="off"
                  placeholder="Pesquise por código, descrição ou código de barras" />
                <div class="pdv-v2__shortcuts-hint">
                  <i class="fa-solid fa-keyboard"></i>
                  <div class="pdv-v2__shortcuts-tooltip">
                    <span><kbd>Enter</kbd> Adicionar produto</span>
                    <span><kbd>Alt+Z</kbd> Aba Produto</span>
                    <span><kbd>Alt+C</kbd> Aba Cliente</span>
                    <span><kbd>Alt+B</kbd> Aba Pagamento</span>
                    <span><kbd>Alt+N</kbd> Nova venda</span>
                    <span><kbd>Alt+S</kbd> Finalizar venda</span>
                    <span><kbd>Alt+Q</kbd> Excluir venda</span>
                    <span><kbd>F2</kbd> Focar busca</span>
                    <span><kbd>Esc</kbd> Limpar busca</span>
                  </div>
                </div>
              </div>
              <div class="pdv-products__list" id="pdvListaProdutos"></div>
            </div>

            <!-- Painel: Cliente -->
            <div class="pdv-v2__panel" data-pdv-panel="cliente">
              <div class="form-field" style="margin-bottom:14px">
                <label>Cliente</label>
                <div style="display:flex;gap:6px;align-items:flex-start">
                  <div style="position:relative;flex:1">
                    <input type="text" id="pdvClienteBusca" class="pdv-v2__search-input" autocomplete="off"
                      placeholder="Buscar pelo nome — ou deixar vazio para consumidor sem cadastro">
                    <input type="hidden" id="pdvCliente" value="">
                    <div id="pdvClienteDropdown" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 2px);z-index:200;background:var(--surface);border:1px solid var(--border);border-radius:10px;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.12)"></div>
                  </div>
                  <button type="button" class="btn btn-light btn-sm" id="pdvNovoClienteBtn" style="white-space:nowrap;height:40px" title="Cadastrar novo cliente">
                    <i class="fa-solid fa-user-plus"></i> Novo
                  </button>
                </div>
                <small class="pdv-helper" id="pdvClienteNomeInfo">Nenhum cliente selecionado.</small>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
                <div class="form-field">
                  <label for="pdvDesconto">Desconto (R$)</label>
                  <input type="number" min="0" step="0.01" id="pdvDesconto" value="0" inputmode="decimal" />
                </div>
                <div class="form-field">
                  <label for="pdvAcrescimo">Acréscimo (R$)</label>
                  <input type="number" min="0" step="0.01" id="pdvAcrescimo" value="0" inputmode="decimal" />
                </div>
              </div>
              <div class="form-field">
                <label for="pdvObservacao">Observação</label>
                <textarea id="pdvObservacao" rows="3"
                  placeholder="Informações adicionais da venda"></textarea>
              </div>
            </div>

            <!-- Painel: Pagamento -->
            <div class="pdv-v2__panel" data-pdv-panel="pagamento">
              <div class="form-field">
                <label>Formas de pagamento</label>
                <div id="pdvPagamentosLista" class="pdv-split-lista"></div>
                <div class="pdv-split-footer" style="margin-top:10px">
                  <span id="pdvSplitRestante" class="pdv-split-restante"></span>
                  <button type="button" class="btn btn-light btn-sm" id="pdvAddPagamentoBtn">
                    <i class="fa-solid fa-plus"></i> Adicionar forma
                  </button>
                </div>
              </div>
              <div class="pdv-v2__pay-summary">
                <div class="pdv-summary__row">
                  <span>Subtotal</span><strong id="pdvSubtotal">R$ 0,00</strong>
                </div>
                <div class="pdv-summary__row">
                  <span>Itens</span><strong id="pdvTotalItens">0</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Painel direito: Carrinho -->
          <div class="pdv-v2__right">
            <!-- Estado vazio -->
            <div class="pdv-v2__cart-empty" id="pdvCarrinhoEmpty">
              <i class="fa-solid fa-store"></i>
              <p>Carrinho vazio</p>
              <small>Busque produtos na aba <strong>Produto</strong></small>
            </div>

            <!-- Tabela de itens -->
            <div class="pdv-v2__cart-wrap">
              <div class="table-wrapper" style="border-radius:14px">
                <table class="data-table pdv-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th style="width:110px">Qtd</th>
                      <th style="width:100px">Preço</th>
                      <th style="width:72px">Desc%</th>
                      <th style="width:100px">Total</th>
                      <th style="width:44px"></th>
                    </tr>
                  </thead>
                  <tbody id="pdvCarrinhoBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Rodapé fixo ────────────────────────────────────────────────── -->
        <footer class="pdv-v2__footer">
          <button type="button" class="btn pdv-v2__btn-excluir" id="pdvLimparBtn">
            <i class="fa-solid fa-trash"></i> Excluir venda
          </button>
          <button type="button" class="btn btn-primary pdv-v2__btn-finalizar" id="pdvFinalizarBtn">
            <i class="fa-solid fa-check"></i> Finalizar venda
          </button>
          <div class="pdv-v2__total">
            <span id="pdvFooterItens" style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:1px;min-height:14px"></span>
            <span>Total</span>
            <strong id="pdvTotal">R$ 0,00</strong>
          </div>
        </footer>

      </div>
    `;

    this.injectStyles();

    // Modal: novo cliente rápido
    if (!document.getElementById('pdvNovoClienteModal')) {
      const m = document.createElement('div');
      m.className = 'modal-overlay hidden';
      m.id = 'pdvNovoClienteModal';
      m.innerHTML = `
        <div class="modal-card pdv-nc-card">
          <div class="modal-card__header">
            <div><h3>Novo Cliente</h3><p style="margin:0;font-size:13px;color:var(--text-muted)">Cadastro rápido durante a venda</p></div>
            <button type="button" class="icon-button" id="pdvNovoClienteFechar"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="pdv-nc-body">
            <div class="pdv-nc-section">
              <p class="pdv-nc-section-title">Novo Cliente</p>
              <div class="pdv-nc-card-group">
                <div class="pdv-nc-cell">
                  <span class="pdv-nc-cell-ico pdv-nc-cell-ico--green"><i class="fa-solid fa-user"></i></span>
                  <div class="pdv-nc-cell-content">
                    <label class="pdv-nc-lbl" for="pdvNCNome">Nome <span class="pdv-nc-req">*</span></label>
                    <input type="text" id="pdvNCNome" class="pdv-nc-cell-input" placeholder="Nome completo" autocomplete="off">
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr">
                  <div class="pdv-nc-cell" style="border-bottom:none;border-right:1px solid var(--border)">
                    <span class="pdv-nc-cell-ico"><i class="fa-solid fa-phone"></i></span>
                    <div class="pdv-nc-cell-content">
                      <label class="pdv-nc-lbl" for="pdvNCTelefone">Telefone</label>
                      <input type="text" id="pdvNCTelefone" class="pdv-nc-cell-input" placeholder="(00) 00000-0000">
                    </div>
                  </div>
                  <div class="pdv-nc-cell" style="border-bottom:none">
                    <span class="pdv-nc-cell-ico"><i class="fa-solid fa-id-card"></i></span>
                    <div class="pdv-nc-cell-content">
                      <label class="pdv-nc-lbl" for="pdvNCCpf">CPF</label>
                      <input type="text" id="pdvNCCpf" class="pdv-nc-cell-input" placeholder="000.000.000-00">
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="pdvNCFeedback" style="padding:0 20px 4px"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;padding:8px 20px 20px">
              <button type="button" class="btn btn-light" id="pdvNCCancelarBtn">Cancelar</button>
              <button type="button" class="btn btn-primary" id="pdvNCSalvarBtn"><i class="fa-solid fa-floppy-disk"></i> Salvar e selecionar</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(m);
    }

    // Modal: cobrar OS
    if (!document.getElementById('pdvCobrarOSModal')) {
      const m = document.createElement('div');
      m.className = 'modal-overlay hidden';
      m.id = 'pdvCobrarOSModal';
      m.innerHTML = `
        <div class="modal-card" style="max-width:560px">
          <div class="modal-card__header">
            <div><h3>Cobrar Ordem de Serviço</h3><p style="margin:0;font-size:13px;color:var(--text-muted)">Busque a OS pelo número ou nome do cliente</p></div>
            <button type="button" class="icon-button" id="pdvCobrarOSFechar"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="padding:20px 24px 24px">
            <div style="display:flex;gap:8px;margin-bottom:14px">
              <input type="text" id="pdvCobrarOSBusca" class="input" style="flex:1" placeholder="Nº OS (ex: OS-0001) ou nome do cliente...">
              <button type="button" class="btn btn-primary btn-sm" id="pdvCobrarOSBuscarBtn"><i class="fa-solid fa-magnifying-glass"></i> Buscar</button>
            </div>
            <div id="pdvCobrarOSResultados" style="max-height:320px;overflow-y:auto"></div>
          </div>
        </div>`;
      document.body.appendChild(m);
    }

    // Modal de seleção de grade (injetado uma vez)
    if (!document.getElementById('pdvGradeModal')) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay hidden';
      overlay.id = 'pdvGradeModal';
      overlay.innerHTML = `
        <div class="modal-card" style="max-width:520px">
          <div class="modal-card__header">
            <div>
              <h3 id="pdvGradeModalTitle">Selecionar variação</h3>
              <p id="pdvGradeModalSub">Escolha o tamanho/cor disponível.</p>
            </div>
            <button type="button" class="icon-button" id="pdvGradeModalClose">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div style="padding:20px 24px 24px">
            <div class="grade-grid" id="pdvGradeGrid"></div>
            <div class="section-empty hidden" id="pdvGradeEmpty">Nenhuma variação disponível.</div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }
  },

  injectStyles() {
    // estilos migrados para style.css
  },

  async fetchClientes() {
    const r = await api.getClientes();
    return r?.dados ?? r;
  },

  async fetchProdutos() {
    return api.getProdutos();
  },

  async postVenda(payload) {
    return api.createVenda(payload);
  },

  renderClientes() {
    // Clientes armazenados em state.clientes; autocomplete via filterClientes()
    this.updateClienteInfo();
  },

  renderProdutos() {
    this.cache();
    if (!this.el.listaProdutos) return;

    if (!this.state.produtosFiltrados.length) {
      this.el.listaProdutos.innerHTML = `
        <div class="pdv-v2__prod-hint">
          <i class="fa-solid fa-magnifying-glass"></i>
          <span>${this.state._buscaAtiva ? 'Nenhum produto encontrado.' : 'Pesquise para ver produtos.'}</span>
          ${!this.state._buscaAtiva ? '<small style="display:block;margin-top:6px;color:var(--text-muted);font-size:11px">Dica: pressione <kbd style="border:1px solid var(--border);border-radius:4px;padding:0 4px;font-size:10px">F2</kbd> para focar a busca</small>' : ''}
        </div>
      `;
      return;
    }

    const isTop3 = !this.state._buscaAtiva;
    const hint = isTop3
      ? `<div class="pdv-v2__prod-label">Mais vendidos — pesquise para ver todos</div>`
      : '';

    this.el.listaProdutos.innerHTML = hint + this.state.produtosFiltrados
      .map((produto) => {
        const estoque = Number(produto.estoque || 0);
        const semEstoque = estoque <= 0;

        return `
          <div class="pdv-product-card">
            <div class="pdv-product-card__info">
              <strong>${this.escapeHtml(produto.nome || 'Produto')}</strong>
              <span class="pdv-product-card__sub">${this.escapeHtml(produto.categoria || '-')}  ·  ${estoque} un.</span>
            </div>
            <div class="pdv-product-card__right">
              <span class="pdv-product-card__price">${this.toCurrency(produto.preco)}</span>
              <button
                type="button"
                class="btn btn-sm ${semEstoque ? 'btn-light' : 'btn-primary'}"
                data-action="pdv-add-produto"
                data-id="${produto.id}"
                ${semEstoque ? 'disabled' : ''}
              ><i class="fa-solid fa-plus"></i> ${semEstoque ? 'Sem estoque' : 'Adicionar'}</button>
            </div>
          </div>
        `;
      })
      .join('');
  },

  renderCarrinho() {
    this.cache();

    if (!this.el.carrinhoBody || !this.el.emptyCarrinho) return;

    const cartWrap = document.querySelector('.pdv-v2__cart-wrap');

    if (!this.state.carrinho.length) {
      this.el.carrinhoBody.innerHTML = '';
      this.el.emptyCarrinho.classList.remove('hidden');
      cartWrap?.classList.remove('pdv-v2__cart-wrap--visible');
      return;
    }

    this.el.emptyCarrinho.classList.add('hidden');
    cartWrap?.classList.add('pdv-v2__cart-wrap--visible');

    this.el.carrinhoBody.innerHTML = this.state.carrinho
      .map((item, index) => {
        const descPct = Number(item.desconto_pct || 0);
        const precoComDesconto = Number(item.preco_unitario || 0) * (1 - descPct / 100);
        const totalItem = Number(item.quantidade || 0) * precoComDesconto;

        return `
          <tr>
            <td data-label="Produto">
              <div class="table-primary">
                <strong>${this.escapeHtml(item.produto_nome || 'Produto')}</strong>
                ${item.grade_label ? `<small style="display:block;color:var(--text-muted);margin-top:2px">${this.escapeHtml(item.grade_label)}</small>` : ''}
              </div>
            </td>

            <td data-label="Qtd">
              <div class="pdv-qty">
                <button type="button" class="pdv-mini-btn" data-action="pdv-qty-minus" data-index="${index}">
                  <i class="fa-solid fa-minus"></i>
                </button>
                <span class="pdv-qty__value">${Number(item.quantidade || 0)}</span>
                <button type="button" class="pdv-mini-btn" data-action="pdv-qty-plus" data-index="${index}">
                  <i class="fa-solid fa-plus"></i>
                </button>
              </div>
            </td>

            <td data-label="Preço">
              <input
                type="text"
                class="pdv-item-preco"
                data-index="${index}"
                value="${Number(item.preco_unitario || 0).toFixed(2).replace('.', ',')}"
                inputmode="decimal"
                style="width:80px;text-align:right;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-size:.88rem;background:var(--surface);color:var(--text)"
              >
              ${descPct > 0 ? `<small style="color:var(--success,#16a34a);display:block;font-size:.78em;margin-top:2px">${this.toCurrency(precoComDesconto)} c/desc</small>` : ''}
            </td>

            <td data-label="Desc%">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value="${descPct || ''}"
                placeholder="0"
                class="pdv-item-desc"
                data-index="${index}"
                inputmode="decimal"
                style="width:56px;text-align:center;padding:4px 6px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--surface)"
              />
            </td>

            <td data-label="Total">${this.toCurrency(totalItem)}</td>

            <td class="text-right">
              <button
                type="button"
                class="btn-inline btn-inline--danger"
                data-action="pdv-remove-item"
                data-index="${index}"
              >
                <i class="fa-solid fa-xmark"></i>
                <span class="pdv-remove-label">Remover</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  renderResumo() {
    this.cache();

    const subtotal = this.getSubtotal();
    const totalItens = this.state.carrinho.reduce(
      (acc, item) => acc + Number(item.quantidade || 0),
      0
    );
    const desconto = Number(this.state.desconto || 0);
    const acrescimo = Number(this.state.acrescimo || 0);
    const total = Math.max(0, subtotal - desconto + acrescimo);

    if (this.el.subtotal) this.el.subtotal.textContent = this.toCurrency(subtotal);
    if (this.el.total) this.el.total.textContent = this.toCurrency(total);
    if (this.el.totalItens) this.el.totalItens.textContent = String(totalItens);

    const footerItens = document.getElementById('pdvFooterItens');
    if (footerItens) footerItens.textContent = totalItens > 0 ? `${totalItens} item${totalItens > 1 ? 's' : ''}` : '';

    // Sticky mobile footer
    const stickyTotal = document.getElementById('pdvMobileStickyTotal');
    if (stickyTotal) stickyTotal.textContent = this.toCurrency(total);

    // Badge da aba carrinho
    const badge = document.getElementById('pdvTabCarrinhoBadge');
    if (badge) {
      if (totalItens > 0) {
        badge.textContent = String(totalItens);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Ajusta o valor da Ãºnica forma de pagamento quando total muda e só hÃ¡ uma
    if (this.state.pagamentos.length === 1) {
      this.state.pagamentos[0].valor = total;
    }
    this.renderPagamentos();
  },

  // â”€â”€ Abas mobile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  switchTab(tab) {
    this.state.activeTab = tab;

    document.querySelectorAll('[data-pdv-panel]').forEach((panel) => {
      const active = panel.dataset.pdvPanel === tab;
      panel.classList.toggle('pdv-v2__panel--active', active);
      panel.classList.toggle('pdv-panel--active', active);
      if (active) panel.scrollTop = 0;
    });

    document.querySelectorAll('[data-tab]').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('pdv-v2__tab--active', active);
      btn.classList.toggle('pdv-tab--active', active);
    });
  },

  // â”€â”€ Split de pagamento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  FORMAS_PAGAMENTO: ['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito', 'Promissória'],

  getSomaPagamentos() {
    return this.state.pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
  },

  getPagamentoTotal() {
    const subtotal = this.getSubtotal();
    const desconto = Number(this.state.desconto || 0);
    const acrescimo = Number(this.state.acrescimo || 0);
    return Math.max(0, subtotal - desconto + acrescimo);
  },

  getPagamentoRestante() {
    return Number((this.getPagamentoTotal() - this.getSomaPagamentos()).toFixed(2));
  },

  addPagamento() {
    const restante = this.getPagamentoRestante();
    this.state.pagamentos.push({
      forma: 'Dinheiro',
      valor: Math.max(0, restante),
      parcelas: 1,
      vencimento: ''
    });
    this.renderPagamentos();
  },

  removePagamento(idx) {
    if (this.state.pagamentos.length <= 1) return;
    this.state.pagamentos.splice(idx, 1);
    this.renderPagamentos();
  },

  renderPagamentos() {
    this.cache();
    const lista = this.el.pagamentosLista;
    if (!lista) return;

    lista.innerHTML = this.state.pagamentos.map((p, i) => {
      const ehPromissoria = p.forma === 'Promissória';
      const opcoesForma = this.FORMAS_PAGAMENTO.map((f) =>
        `<option value="${f}" ${p.forma === f ? 'selected' : ''}>${f}</option>`
      ).join('');

      return `
        <div class="pdv-split-row" data-idx="${i}">
          <select class="pdv-split-forma form-control" data-idx="${i}">${opcoesForma}</select>
          <input type="number" class="pdv-split-valor form-control" data-idx="${i}"
            min="0" step="0.01" inputmode="decimal" value="${Number(p.valor || 0).toFixed(2)}" />
          ${ehPromissoria ? `
            <div class="pdv-split-promissoria">
              <select class="pdv-split-parcelas form-control" data-idx="${i}">
                ${[1,2,3,4,5,6,8,10,12].map((n) => `<option value="${n}" ${p.parcelas === n ? 'selected' : ''}>${n}x</option>`).join('')}
              </select>
              <input type="date" class="pdv-split-vencimento form-control" data-idx="${i}"
                min="${new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' })}"
                value="${p.vencimento || ''}" placeholder="1Âº vencimento" />
            </div>` : ''}
          ${this.state.pagamentos.length > 1
            ? `<button type="button" class="pdv-split-remove" data-idx="${i}" title="Remover">
                <i class="fa-solid fa-xmark"></i>
               </button>`
            : ''}
        </div>`;
    }).join('');

    this.renderSplitRestante();
  },

  renderSplitRestante() {
    this.cache();
    const el = this.el.splitRestante;
    if (!el) return;
    const restante = this.getPagamentoRestante();
    if (Math.abs(restante) < 0.01) {
      el.textContent = '';
      el.className = 'pdv-split-restante pdv-split-restante--ok';
    } else if (restante > 0) {
      el.textContent = `Restante: ${this.toCurrency(restante)}`;
      el.className = 'pdv-split-restante pdv-split-restante--pendente';
    } else {
      el.textContent = `Excesso: ${this.toCurrency(Math.abs(restante))}`;
      el.className = 'pdv-split-restante pdv-split-restante--excesso';
    }
  },

  handleClienteChange(clienteId) {
    this.state.clienteId = clienteId || '';

    const cliente = this.state.clientes.find((item) => String(item.id) === String(clienteId));
    this.state.clienteNome = cliente?.nome || '';

    this.updateClienteInfo();

    // Recalcula preÃ§os do carrinho pela tabela de preÃ§os do cliente
    if (this.state.carrinho.length) {
      this.recalcularPrecosCarrinho();
    }
  },

  updateClienteInfo() {
    this.cache();
    if (!this.el.clienteNomeInfo) return;

    if (!this.state.clienteId) {
      this.el.clienteNomeInfo.textContent = 'Nenhum cliente selecionado.';
      return;
    }

    this.el.clienteNomeInfo.textContent = `Cliente selecionado: ${this.state.clienteNome}`;
  },

  // ── Contador de frequência de uso (localStorage) ─────────────────────────
  _topKey() {
    return `pdv_top_${api.getEmpresaId() || this.state.empresa || 'default'}`;
  },

  _getFreqMap() {
    try { return JSON.parse(localStorage.getItem(this._topKey()) || '{}'); } catch { return {}; }
  },

  _recordProdutoAdded(produtoId) {
    const map = this._getFreqMap();
    map[produtoId] = (map[produtoId] || 0) + 1;
    try { localStorage.setItem(this._topKey(), JSON.stringify(map)); } catch { /* quota */ }
  },

  _getTopProdutos(n) {
    const map = this._getFreqMap();
    return [...this.state.produtos]
      .filter((p) => Number(p.estoque || 0) > 0)
      .sort((a, b) => (map[b.id] || 0) - (map[a.id] || 0))
      .slice(0, n);
  },

  filterProdutos(term) {
    const normalized = String(term || '').trim().toLowerCase();

    if (!normalized) {
      this.state.produtosFiltrados = this._getTopProdutos(3);
      this.state._buscaAtiva = false;
    } else {
      this.state._buscaAtiva = true;
      this.state.produtosFiltrados = this.state.produtos.filter((produto) => {
        return [produto.nome, produto.categoria, produto.codigo_barras]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(normalized));
      });
    }

    this.renderProdutos();
  },

  async addProduto(produtoId) {
    const produto = this.state.produtos.find((item) => Number(item.id) === Number(produtoId));
    if (!produto) {
      this.showMessage('Produto não encontrado.', 'error');
      return;
    }

    const estoqueDisponivel = Number(produto.estoque || 0);
    if (estoqueDisponivel <= 0) {
      this.showMessage(`O produto "${produto.nome}" está sem estoque.`, 'error');
      return;
    }

    // Produto com grade â†’ abre modal de seleção de variação
    if (produto.tem_grade) {
      await this.openGradeSelector(produto);
      return;
    }

    await this._addProdutoSemGrade(produto, estoqueDisponivel);
  },

  async _addProdutoSemGrade(produto, estoqueDisponivel) {
    const precoResolvido = await this.resolverPrecoItem(produto.id, null, this.state.clienteId, 1);
    const preco = precoResolvido ?? Number(produto.preco || 0);

    const existenteIndex = this.state.carrinho.findIndex(
      (item) => Number(item.produto_id) === Number(produto.id) && !item.grade_id
    );

    if (existenteIndex >= 0) {
      const itemAtual = this.state.carrinho[existenteIndex];
      if (Number(itemAtual.quantidade || 0) + 1 > estoqueDisponivel) {
        this.showMessage(`Estoque insuficiente para "${produto.nome}".`, 'error');
        return;
      }
      this.state.carrinho[existenteIndex].quantidade += 1;
      if (precoResolvido !== null) this.state.carrinho[existenteIndex].preco_unitario = preco;
    } else {
      this.state.carrinho.push({
        produto_id: Number(produto.id),
        produto_nome: produto.nome,
        grade_id: null,
        grade_label: '',
        quantidade: 1,
        preco_unitario: preco,
        preco_padrao: Number(produto.preco || 0),
        custo_unitario: Number(produto.custo || 0),
        estoque_disponivel: estoqueDisponivel,
        desconto_pct: 0
      });
    }

    this._recordProdutoAdded(produto.id);
    this.renderCarrinho();
    this.renderResumo();
    this.setFeedback('', 'info');

    // No mobile, ao adicionar o primeiro item troca para a aba do carrinho
    if (this.state.carrinho.length === 1 && window.innerWidth < 768) {
      this.switchTab('pagamento');
    }
  },

  // â”€â”€ SELETOR DE GRADE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async openGradeSelector(produto) {
    this.state.gradeModalProduto = produto;
    this.state.gradesDisponiveis = [];

    const modal = document.getElementById('pdvGradeModal');
    if (!modal) return;

    modal.classList.remove('hidden');

    const grid = document.getElementById('pdvGradeGrid');
    if (grid) grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">Carregando variações...</div>';

    const reqId = ++(this.state._gradeReqId);

    try {
      const result = await api.getGradesProduto(produto.id);
      if (reqId !== this.state._gradeReqId) return; // request obsoleto
      this.state.gradesDisponiveis = result?.grades || (Array.isArray(result) ? result : []);
    } catch {
      if (reqId !== this.state._gradeReqId) return; // request obsoleto
      this.state.gradesDisponiveis = [];
    }

    this.renderGradeGrid();
  },

  closeGradeSelector() {
    this.state.gradeModalProduto = null;
    this.state.gradesDisponiveis = [];
    document.getElementById('pdvGradeModal')?.classList.add('hidden');
  },

  async selectGrade(gradeId, atrib1, atrib2, estoque, precoPadrao) {
    const produto = this.state.gradeModalProduto;
    if (!produto) return;

    this.closeGradeSelector();

    const gradeLabel = atrib2 ? `${atrib1} / ${atrib2}` : atrib1;
    const precoBase = Number(precoPadrao) > 0 ? Number(precoPadrao) : Number(produto.preco || 0);
    const precoResolvido = await this.resolverPrecoItem(produto.id, gradeId, this.state.clienteId, 1);
    const preco = precoResolvido ?? precoBase;

    const existenteIndex = this.state.carrinho.findIndex(
      (item) => Number(item.produto_id) === Number(produto.id) && Number(item.grade_id) === Number(gradeId)
    );

    if (existenteIndex >= 0) {
      const itemAtual = this.state.carrinho[existenteIndex];
      if (Number(itemAtual.quantidade) + 1 > estoque) {
        this.showMessage(`Estoque insuficiente para "${produto.nome} — ${gradeLabel}".`, 'error');
        return;
      }
      this.state.carrinho[existenteIndex].quantidade += 1;
      if (precoResolvido !== null) this.state.carrinho[existenteIndex].preco_unitario = preco;
    } else {
      this.state.carrinho.push({
        produto_id: Number(produto.id),
        produto_nome: produto.nome,
        grade_id: Number(gradeId),
        grade_label: gradeLabel,
        quantidade: 1,
        preco_unitario: preco,
        preco_padrao: precoBase,
        custo_unitario: Number(produto.custo || 0),
        estoque_disponivel: estoque,
        desconto_pct: 0
      });
    }

    this._recordProdutoAdded(produto.id);
    this.renderCarrinho();
    this.renderResumo();
    this.setFeedback('', 'info');

    if (this.state.carrinho.length === 1 && window.innerWidth < 768) {
      this.switchTab('pagamento');
    }
  },

  renderGradeGrid() {
    const grid  = document.getElementById('pdvGradeGrid');
    const empty = document.getElementById('pdvGradeEmpty');
    const title = document.getElementById('pdvGradeModalTitle');
    const sub   = document.getElementById('pdvGradeModalSub');
    if (!grid) return;

    const produto = this.state.gradeModalProduto;
    if (title) title.textContent = produto?.nome || 'Selecionar variação';
    if (sub)   sub.textContent   = 'Escolha o tamanho/cor disponível.';

    const grades = this.state.gradesDisponiveis;

    if (!grades.length) {
      grid.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }

    empty?.classList.add('hidden');

    grid.innerHTML = grades.map((g) => {
      const label      = g.atributo2 ? `${g.atributo1} / ${g.atributo2}` : g.atributo1;
      const est        = Number(g.estoque || 0);
      const semEstoque = est <= 0;
      return `
        <button
          type="button"
          class="grade-btn${semEstoque ? ' grade-btn--esgotado' : ''}"
          data-pdv-grade-id="${g.id}"
          data-estoque="${est}"
          data-preco="${Number(g.preco || 0)}"
          data-atrib1="${this.escapeHtml(g.atributo1 || '')}"
          data-atrib2="${this.escapeHtml(g.atributo2 || '')}"
          ${semEstoque ? 'disabled' : ''}
        >
          <span class="grade-btn__label">${this.escapeHtml(label)}</span>
          <span class="grade-btn__estoque">${semEstoque ? 'Esgotado' : `Est: ${est}`}</span>
        </button>
      `;
    }).join('');
  },

  // â”€â”€ TABELA DE PREÃ‡OS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async resolverPrecoItem(produtoId, gradeId, clienteId, quantidade) {
    if (!clienteId) return null;
    try {
      const result = await api.resolverPrecoTabela({
        produtoId,
        gradeId: gradeId || null,
        clienteId,
        quantidade: quantidade || 1,
        empresa_id: api.getEmpresaId() || null
      });
      return result?.preco != null ? Number(result.preco) : null;
    } catch {
      return null;
    }
  },

  async recalcularPrecosCarrinho() {
    if (!this.state.carrinho.length) return;

    this.state._recalcReqId += 1;
    const reqId = this.state._recalcReqId;

    await Promise.all(
      this.state.carrinho.map(async (item, i) => {
        let preco = null;

        if (this.state.clienteId) {
          preco = await this.resolverPrecoItem(
            item.produto_id,
            item.grade_id || null,
            this.state.clienteId,
            item.quantidade
          );
        }

        if (preco === null) {
          preco = item.preco_padrao ?? item.preco_unitario;
        }

        if (reqId === this.state._recalcReqId) {
          this.state.carrinho[i].preco_unitario = preco;
        }
      })
    );

    if (reqId !== this.state._recalcReqId) return;
    this.renderCarrinho();
    this.renderResumo();
  },

  updateQuantidade(index, delta) {
    const item = this.state.carrinho[index];
    if (!item) return;

    const produto = this.state.produtos.find((prod) => Number(prod.id) === Number(item.produto_id));
    const estoqueDisponivel = item.estoque_disponivel != null
      ? Number(item.estoque_disponivel)
      : Number(produto?.estoque || 0);
    const novaQuantidade = Number(item.quantidade || 0) + Number(delta || 0);

    if (novaQuantidade <= 0) {
      this.removeItem(index);
      return;
    }

    if (novaQuantidade > estoqueDisponivel) {
      this.showMessage(`Estoque insuficiente para "${item.produto_nome}".`, 'error');
      return;
    }

    this.state.carrinho[index].quantidade = novaQuantidade;
    this.renderCarrinho();
    this.renderResumo();
  },

  removeItem(index) {
    this.state.carrinho.splice(index, 1);
    this.renderCarrinho();
    this.renderResumo();
  },

  getSubtotal() {
    return this.state.carrinho.reduce((acc, item) => {
      const descPct = Number(item.desconto_pct || 0);
      const precoComDesconto = Number(item.preco_unitario || 0) * (1 - descPct / 100);
      return acc + Number(item.quantidade || 0) * precoComDesconto;
    }, 0);
  },


  async finalizarVenda() {
    if (this.state.salvando) return;
    this.state.salvando = true; // set before first async to prevent race condition on double-click

    if (!this.state.carrinho.length) {
      this.state.salvando = false;
      this.showMessage('Adicione pelo menos um produto ao carrinho.', 'error');
      return;
    }

    try {
      const sessao = await api.getCaixaSessaoAtiva();
      if (!sessao) {
        this.state.salvando = false;
        this.showMessage('Abra o caixa antes de registrar uma venda.', 'error');
        return;
      }
    } catch {
      this.state.salvando = false;
      this.showMessage('Não foi possível verificar o caixa. Tente novamente.', 'error');
      return;
    }

    const subtotal = Math.round(this.getSubtotal() * 100) / 100;
    const desconto = Number(this.state.desconto || 0);
    const acrescimo = Number(this.state.acrescimo || 0);
    const total = Math.round(Math.max(0, subtotal - desconto + acrescimo) * 100) / 100;

    if (total <= 0) {
      this.showMessage('O total da venda deve ser maior que zero.', 'error');
      return;
    }

    if (desconto > 0 && subtotal > 0 && desconto > subtotal * 0.5) {
      const pct = Math.round((desconto / subtotal) * 100);
      if (!confirm(`Desconto de ${this.toCurrency(desconto)} (${pct}% do subtotal). Confirmar?`)) return;
    }

    // ValidaÃ§Ã£o do split
    const restante = this.getPagamentoRestante();
    if (restante > 0.01) {
      this.showMessage(`Faltam ${this.toCurrency(restante)} para cobrir o total.`, 'error');
      return;
    }
    // Snapshot antes de qualquer mutação em pagamentos para rollback em caso de erro
    const pagamentosSnapshot = JSON.parse(JSON.stringify(this.state.pagamentos));

    const troco = restante < -0.01 ? Math.abs(restante) : 0;
    if (troco > 0) {
      const todosDinheiro = this.state.pagamentos.every((p) => p.forma === 'Dinheiro');
      if (!todosDinheiro) {
        this.showMessage(`O total dos pagamentos excede o valor da venda em ${this.toCurrency(troco)}.`, 'error');
        return;
      }
      // Troco em Dinheiro: subtrai do primeiro pagamento em Dinheiro apenas
      let trocoRestante = troco;
      this.state.pagamentos = this.state.pagamentos.map((p) => {
        if (p.forma === 'Dinheiro' && trocoRestante > 0) {
          const valorAtual = Number(p.valor || 0);
          const deducao = Math.min(trocoRestante, valorAtual);
          trocoRestante -= deducao;
          const novoValor = Number((valorAtual - deducao).toFixed(2));
          return { ...p, valor: novoValor };
        }
        return p;
      });
    }

    // Valida preços — impede envio de preços negativos ou zerados forçados via console
    for (const item of this.state.carrinho) {
      if (Number(item.preco_unitario) < 0) {
        this.showMessage('Preço inválido no carrinho. Remova o item e adicione novamente.', 'error');
        return;
      }
      const precoFinalCalculado = Number(item.preco_unitario) * (1 - (Number(item.desconto_pct) || 0) / 100);
      if (precoFinalCalculado < 0) {
        this.showMessage('Desconto inválido no carrinho. Revise os itens.', 'error');
        return;
      }
    }

    // Valida vencimento para Promissória
    const promissoriaEntry = this.state.pagamentos.find((p) => p.forma === 'Promissória');
    if (promissoriaEntry && !promissoriaEntry.vencimento) {
      this.showMessage('Informe o primeiro vencimento para a promissória.', 'error');
      return;
    }

    const pagamentoPrincipal = this.state.pagamentos[0]?.forma || 'Dinheiro';
    const temPromissoria = !!promissoriaEntry;
    const outrosPagamentos = this.state.pagamentos
      .filter((p) => p.forma !== 'Promissória')
      .reduce((acc, p) => acc + Number(p.valor || 0), 0);
    const status_pagamento = temPromissoria
      ? (outrosPagamentos > 0 ? 'parcial' : 'pendente')
      : 'pago';

    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const payload = {
      empresa: this.state.empresa,
      empresa_id: api.getEmpresaId() || null,
      idempotency_key: idempotencyKey,
      cliente_id: this.state.clienteId ? Number(this.state.clienteId) : null,
      cliente_nome: this.state.clienteNome || '',
      itens: this.state.carrinho.map((item) => {
        const descPct = Number(item.desconto_pct || 0);
        const precoFinal = Number((Number(item.preco_unitario || 0) * (1 - descPct / 100)).toFixed(2));
        return {
          produto_id: item.produto_id ? Number(item.produto_id) : null,
          grade_id: item.grade_id ? Number(item.grade_id) : null,
          quantidade: Number(item.quantidade),
          preco_unitario: precoFinal,
          custo_unitario: Number(item.custo_unitario || 0),
          descricao: item.produto_id ? undefined : item.produto_nome,
          os_id: item._os_id || undefined
        };
      }),
      subtotal,
      desconto,
      acrescimo,
      total,
      troco,
      pagamento: pagamentoPrincipal,
      pagamentos: this.state.pagamentos.map((p) => ({
        forma: p.forma,
        valor: Number(p.valor || 0),
        parcelas: Number(p.parcelas || 1),
        vencimento: p.vencimento || null
      })),
      parcelas: promissoriaEntry ? Number(promissoriaEntry.parcelas || 1) : 1,
      status_pagamento,
      data: this.today(),
      observacao: this.state.observacao || '',
      conta_receber: null
    };

    // Offline — salvar na fila local
    if (!navigator.onLine) {
      this.state.salvando = true;
      this.setLoading(true);
      if (this.el.finalizarBtn) {
        this.el.finalizarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando offline...';
      }
      try {
        const pendingId = await PdvOffline.salvarVendaPendente(payload);
        const msg = pendingId
          ? `Venda salva offline (fila #${pendingId}). Será enviada quando a conexão retornar.`
          : 'Venda salva offline. Será enviada quando a conexão retornar.';
        this.setFeedback(msg, 'warning');
        showToast(msg, 'warning');
        this.resetVenda();
        await this.load();
      } catch {
        this.setFeedback('Erro ao salvar a venda offline.', 'error');
        showToast('Não foi possível salvar a venda offline.', 'error');
      } finally {
        this.state.salvando = false;
        this.setLoading(false);
        if (this.el.finalizarBtn) {
          this.el.finalizarBtn.innerHTML = '<i class="fa-solid fa-check"></i> Finalizar venda';
        }
      }
      return;
    }

    this.state.salvando = true;
    this.setLoading(true);
    this.setFeedback('Finalizando venda...', 'info');

    if (this.el.finalizarBtn) {
      this.el.finalizarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
    }

    try {
      const result = await this.postVenda(payload);
      const vendaId = result?.id || result?.venda_id || null;

      const pixEntries = this.state.pagamentos.filter(
        (p) => (p.forma || '').toLowerCase() === 'pix'
      );

      if (pixEntries.length > 0) {
        const valorPix = pixEntries.reduce((s, p) => s + Number(p.valor || 0), 0);
        const msg = vendaId ? `Venda #${vendaId} registrada. Gerando QR Code PIX...` : 'Venda registrada. Gerando QR Code PIX...';
        this.setFeedback(msg, 'info');
        showToast(msg, 'info');
        await this.abrirModalPix(vendaId, valorPix, this.state.clienteNome || '');
      } else {
        const trocoMsg = troco > 0 ? ` | Troco: ${this.toCurrency(troco)}` : '';
        const message = vendaId
          ? `Venda #${vendaId} finalizada com sucesso!${trocoMsg}`
          : `Venda finalizada com sucesso.${trocoMsg}`;
        this.setFeedback(message, 'success');
        showToast(message, 'success');
      }

      this.resetVenda();
      await this.load();
    } catch (error) {
      // Restaura pagamentos ao estado pré-mutação para permitir retry correto
      if (pagamentosSnapshot) this.state.pagamentos = pagamentosSnapshot;
      console.error('Erro ao finalizar venda:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
      // Recarrega lista de produtos em background para mostrar estoque real após erro
      if (error.status === 400 || error.status === 409) {
        this.fetchProdutos().then(produtos => {
          if (Array.isArray(produtos)) {
            this.state.produtos = produtos;
            this.filterProdutos(this.el.buscaProduto?.value || '');
          }
        }).catch(() => {});
      }
    } finally {
      this.state.salvando = false;
      this.setLoading(false);

      if (this.el.finalizarBtn) {
        this.el.finalizarBtn.innerHTML = '<i class="fa-solid fa-check"></i> Finalizar venda';
      }
    }
  },

  resetVenda() {
    if (this.state._pixCleanup) { this.state._pixCleanup(); this.state._pixCleanup = null; }
    this.closeGradeSelector();
    this.state.carrinho = [];
    this.state.clienteId = '';
    this.state.clienteNome = '';
    this.state.pagamentos = [{ forma: 'Dinheiro', valor: 0, parcelas: 1, vencimento: '' }];
    this.state.desconto = 0;
    this.state.acrescimo = 0;
    this.state.observacao = '';

    this.cache();

    if (this.el.clienteSelect) this.el.clienteSelect.value = '';
    if (this.el.desconto) this.el.desconto.value = '0';
    if (this.el.acrescimo) this.el.acrescimo.value = '0';
    if (this.el.observacao) this.el.observacao.value = '';
    if (this.el.buscaProduto) this.el.buscaProduto.value = '';

    this.switchTab('produtos');
    this.updateClienteInfo();
    this.filterProdutos('');
    this.renderCarrinho();
    this.renderResumo();
    this.setFeedback('', 'info');
  },

  async abrirModalPix(vendaId, valor, clienteNome) {
    const empresa = this.state.empresa;

    return new Promise((resolve) => {
      let pollInterval = null;
      let txid = null;
      let segundosRestantes = 900; // 15 minutos
      let timerInterval = null;

      const fmtValor = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const fmtTempo = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px';

      overlay.innerHTML = `
        <div id="_pixModal" style="background:var(--surface);border-radius:20px;padding:32px 28px;max-width:420px;width:100%;box-shadow:0 32px 64px rgba(0,0,0,.3);text-align:center;position:relative">
          <button id="_pixFechar" style="position:absolute;top:14px;right:16px;background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted)" title="Fechar">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <div id="_pixConteudo">
            <div style="font-size:36px;color:#32b768;margin-bottom:8px"><i class="fa-brands fa-pix"></i></div>
            <h3 style="margin:0 0 4px;font-size:18px;font-weight:800">PIX — ${fmtValor(valor)}</h3>
            ${clienteNome ? `<p style="margin:0 0 16px;font-size:13px;color:var(--text-muted)">${this.escapeHtml(clienteNome)}</p>` : '<div style="margin-bottom:16px"></div>'}
            <div id="_pixStatus" style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
              <i class="fa-solid fa-spinner fa-spin"></i> Gerando QR Code...
            </div>
            <div id="_pixQrArea" style="display:none">
              <div id="_pixQrImg" style="margin:0 auto 12px;width:200px;height:200px;border:2px solid var(--border);border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden"></div>
              <div style="margin-bottom:12px">
                <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:4px">PIX Copia e Cola</label>
                <div style="display:flex;gap:6px">
                  <input id="_pixCopiaCola" readonly style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:monospace;background:var(--surface-2);color:var(--text);min-width:0" />
                  <button id="_pixCopiar" style="padding:8px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);cursor:pointer;font-size:13px" title="Copiar código">
                    <i class="fa-solid fa-copy"></i>
                  </button>
                </div>
              </div>
              <div id="_pixTimer" style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
                Expira em <strong id="_pixTempoRestante">15:00</strong>
              </div>
              <div id="_pixStatusPagamento" style="padding:10px;border-radius:10px;background:var(--surface-2);font-size:13px;font-weight:600;color:var(--text-muted)">
                <i class="fa-solid fa-clock"></i> Aguardando pagamento...
              </div>
            </div>
            <div id="_pixErroArea" style="display:none;color:var(--danger);font-size:13px;padding:12px;background:var(--danger-soft);border-radius:10px;margin-top:8px"></div>
          </div>
          <div id="_pixSucessoArea" style="display:none">
            <div style="font-size:56px;color:#22c55e;margin-bottom:12px"><i class="fa-solid fa-circle-check"></i></div>
            <h3 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#22c55e">Pagamento Confirmado!</h3>
            <p style="margin:0;font-size:14px;color:var(--text-muted)">PIX recebido com sucesso.<br>Obrigado!</p>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      let _pixFechado = false;
      const fechar = () => {
        _pixFechado = true;
        clearInterval(pollInterval);
        clearInterval(timerInterval);
        this.state._pixCleanup = null;
        window._lf_pixCleanup = null;
        if (overlay.parentNode) document.body.removeChild(overlay);
        resolve();
      };
      this.state._pixCleanup = fechar;
      window._lf_pixCleanup = fechar;

      overlay.querySelector('#_pixFechar').onclick = fechar;
      overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });

      const mostrarSucesso = () => {
        clearInterval(pollInterval);
        clearInterval(timerInterval);
        overlay.querySelector('#_pixConteudo').style.display = 'none';
        overlay.querySelector('#_pixSucessoArea').style.display = 'block';
        showToast('PIX recebido! Pagamento confirmado.', 'success');
        setTimeout(fechar, 2500);
      };

      const iniciarPoll = () => {
        if (!txid) return;
        pollInterval = setInterval(async () => {
          try {
            const st = await api.verificarStatusPIX(txid);
            if (st?.status === 'CONCLUIDA') mostrarSucesso();
          } catch { /* silencioso — continua tentando */ }
        }, 4000);
      };

      const iniciarTimer = (expiracaoISO) => {
        if (!expiracaoISO) return;
        const expMs = new Date(expiracaoISO).getTime();
        timerInterval = setInterval(() => {
          segundosRestantes = Math.max(0, Math.round((expMs - Date.now()) / 1000));
          const el = overlay.querySelector('#_pixTempoRestante');
          if (el) el.textContent = fmtTempo(segundosRestantes);
          if (segundosRestantes === 0) {
            clearInterval(timerInterval);
            const sp = overlay.querySelector('#_pixStatusPagamento');
            if (sp) { sp.style.color = '#ef4444'; sp.innerHTML = '<i class="fa-solid fa-clock"></i> QR Code expirado. Gere um novo.'; }
          }
        }, 1000);
      };

      // Gera o QR Code
      (async () => {
        try {
          const dados = await api.gerarPIX({
            valor: Number(valor),
            cliente_nome: clienteNome || '',
            empresa: this.state.empresa,
            empresa_id: api.getEmpresaId() || null,
          });

          txid = dados?.txid || null;

          const qrArea = overlay.querySelector('#_pixQrArea');
          const qrImg  = overlay.querySelector('#_pixQrImg');
          const ccInput = overlay.querySelector('#_pixCopiaCola');
          const st      = overlay.querySelector('#_pixStatus');

          if (st) st.style.display = 'none';

          if (dados?.qr_image) {
            const pixImg = document.createElement('img');
            pixImg.src = `data:image/png;base64,${dados.qr_image}`;
            pixImg.style.cssText = 'width:100%;height:100%;object-fit:contain';
            pixImg.alt = 'QR Code PIX';
            qrImg.innerHTML = '';
            qrImg.appendChild(pixImg);
          } else {
            qrImg.innerHTML = `<div style="padding:16px;font-size:11px;color:var(--text-muted);line-height:1.5"><i class="fa-solid fa-qrcode" style="font-size:32px;display:block;margin-bottom:8px"></i>QR Code disponível<br>em produção</div>`;
          }

          if (ccInput && dados?.pix_copia_e_cola) ccInput.value = dados.pix_copia_e_cola;

          qrArea.style.display = 'block';
          if (!_pixFechado) iniciarTimer(dados?.expiracao);
          if (!_pixFechado) iniciarPoll();

          const btnCopiar = overlay.querySelector('#_pixCopiar');
          if (btnCopiar) {
            btnCopiar.onclick = async () => {
              try {
                await navigator.clipboard.writeText(dados.pix_copia_e_cola || '');
                btnCopiar.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => { btnCopiar.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 1800);
              } catch { /* fallback silencioso */ }
            };
          }
        } catch (e) {
          const errArea = overlay.querySelector('#_pixErroArea');
          const st = overlay.querySelector('#_pixStatus');
          if (st) st.style.display = 'none';
          if (errArea) {
            errArea.style.display = 'block';
            errArea.textContent = `Erro ao gerar PIX: ${e.message || 'verifique as configurações de PIX nas Configurações do sistema.'}`;
          }
        }
      })();
    });
  },

  async salvarOrcamento() {
    if (this.state._salOrc) return;
    if (!this.state.carrinho.length) {
      this.showMessage('Adicione ao menos um produto ao carrinho.', 'error');
      return;
    }

    this.state._salOrc = true;
    const btn = document.getElementById('pdvSalvarOrcamentoBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }

    try {
      const result = await api.createOrcamento({
        cliente_id: this.state.clienteId ? Number(this.state.clienteId) : null,
        cliente_nome: this.state.clienteNome || '',
        itens: this.state.carrinho.map((item) => ({
          produto_id: Number(item.produto_id),
          produto_nome: item.produto_nome,
          grade_id: item.grade_id ? Number(item.grade_id) : null,
          quantidade: Number(item.quantidade),
          preco_unitario: Number(item.preco_unitario)
        })),
        desconto: Number(this.state.desconto || 0),
        acrescimo: Number(this.state.acrescimo || 0),
        observacao: this.state.observacao || ''
      });

      const numero = result?.orcamento?.numero ?? result?.numero ?? '?';
      const msg = `Orçamento #${numero} salvo com sucesso.`;
      this.showMessage(msg, 'success');
      showToast(msg, 'success');
      this.resetVenda();
    } catch (err) {
      this.showMessage(err.message || 'Erro ao salvar orçamento.', 'error');
    } finally {
      this.state._salOrc = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-lines"></i> Orçamento'; }
    }
  },

  // ── Autocomplete de clientes ─────────────────────────────────────────────

  filterClientes(term) {
    const t = String(term || '').toLowerCase().trim();
    if (!t) return this.state.clientes.slice(0, 8);
    return this.state.clientes
      .filter(c => (c.nome || '').toLowerCase().includes(t) || (c.telefone || '').includes(t))
      .slice(0, 10);
  },

  renderClienteDropdown(items) {
    this.cache();
    const dd = this.el.clienteDropdown || document.getElementById('pdvClienteDropdown');
    if (!dd) return;
    if (!items.length) { dd.style.display = 'none'; return; }

    dd.innerHTML = [
      `<div class="pdv-cliente-item" data-id="" data-nome="" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-muted)"><i class="fa-solid fa-user-slash" style="margin-right:6px"></i>Consumidor sem cadastro</div>`,
      ...items.map(c => `
        <div class="pdv-cliente-item" data-id="${c.id}" data-nome="${this.escapeHtml(c.nome)}"
          style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px">
          <strong>${this.escapeHtml(c.nome)}</strong>
          ${c.telefone ? `<small style="display:block;color:var(--text-muted);font-size:11px">${c.telefone}</small>` : ''}
        </div>`)
    ].join('');

    dd.style.display = 'block';
    dd.querySelectorAll('.pdv-cliente-item').forEach(el => {
      el.addEventListener('mouseenter', () => { el.style.background = 'var(--bg-subtle,#f8fafc)'; });
      el.addEventListener('mouseleave', () => { el.style.background = ''; });
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        this.selecionarCliente(el.dataset.id, el.dataset.nome);
      });
    });
  },

  selecionarCliente(id, nome) {
    this.cache();
    const dd = document.getElementById('pdvClienteDropdown');
    if (dd) dd.style.display = 'none';
    if (this.el.clienteBusca) this.el.clienteBusca.value = nome || '';
    if (this.el.clienteSelect) this.el.clienteSelect.value = id || '';
    this.handleClienteChange(id || '');
  },

  limparCliente() {
    this.cache();
    if (this.el.clienteSelect) this.el.clienteSelect.value = '';
    this.handleClienteChange('');
  },

  // ── Novo cliente rápido ──────────────────────────────────────────────────

  _injectPdvNcStyles() {
    if (document.getElementById('pdv-nc-styles')) return;
    const s = document.createElement('style');
    s.id = 'pdv-nc-styles';
    s.textContent = `
      .pdv-nc-card { width: min(96vw, 480px) !important; }
      .pdv-nc-body { overflow-y: auto; }
      .pdv-nc-section { padding: 16px 20px; }
      .pdv-nc-section-title { font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8px; }
      .pdv-nc-card-group { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
      .pdv-nc-cell { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface); transition: background .1s; }
      .pdv-nc-cell:last-child { border-bottom: none; }
      .pdv-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
      .pdv-nc-cell-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; background: var(--surface-2); color: var(--text-muted); }
      .pdv-nc-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
      .pdv-nc-cell-content { flex: 1; min-width: 0; }
      .pdv-nc-lbl { display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
      .pdv-nc-req { color: #dc2626; }
      .pdv-nc-cell-input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-size: 0.93rem; font-weight: 600; color: var(--text); width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none; }
    `;
    document.head.appendChild(s);
  },

  abrirNovoClienteModal() {
    this._injectPdvNcStyles();
    const m = document.getElementById('pdvNovoClienteModal');
    if (!m) return;
    const nome = document.getElementById('pdvNCNome');
    const tel  = document.getElementById('pdvNCTelefone');
    const cpf  = document.getElementById('pdvNCCpf');
    const fb   = document.getElementById('pdvNCFeedback');
    if (nome) nome.value = '';
    if (tel)  tel.value  = '';
    if (cpf)  cpf.value  = '';
    if (fb)   fb.innerHTML = '';
    m.classList.remove('hidden');

    if (!this._ncBound) {
      this._ncBound = true;
      document.getElementById('pdvNovoClienteFechar')?.addEventListener('click', () => {
        document.getElementById('pdvNovoClienteModal')?.classList.add('hidden');
      });
      document.getElementById('pdvNCCancelarBtn')?.addEventListener('click', () => {
        document.getElementById('pdvNovoClienteModal')?.classList.add('hidden');
      });
      document.getElementById('pdvNCSalvarBtn')?.addEventListener('click', () => {
        this.salvarNovoCliente();
      });
      document.getElementById('pdvNovoClienteModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('pdvNovoClienteModal'))
          document.getElementById('pdvNovoClienteModal').classList.add('hidden');
      });
    }

    setTimeout(() => document.getElementById('pdvNCNome')?.focus(), 50);
  },

  async salvarNovoCliente() {
    const nome = document.getElementById('pdvNCNome')?.value.trim();
    const tel  = document.getElementById('pdvNCTelefone')?.value.trim();
    const cpf  = document.getElementById('pdvNCCpf')?.value.trim();
    const fb   = document.getElementById('pdvNCFeedback');
    const btn  = document.getElementById('pdvNCSalvarBtn');

    if (!nome) {
      if (fb) fb.innerHTML = '<p style="color:var(--danger,#ef4444);font-size:12px;margin:0">Informe o nome do cliente.</p>';
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
    if (fb)  fb.innerHTML = '';

    try {
      const result = await api.createCliente({ nome, telefone: tel || '', cpf: cpf || '' });
      const cliente = result?.cliente || result;
      this.state.clientes.unshift(cliente);
      document.getElementById('pdvNovoClienteModal')?.classList.add('hidden');
      this.cache();
      if (this.el.clienteBusca) this.el.clienteBusca.value = cliente.nome;
      this.selecionarCliente(String(cliente.id), cliente.nome);
      showToast(`Cliente "${cliente.nome}" cadastrado e selecionado.`, 'success');
    } catch (err) {
      if (fb) fb.innerHTML = `<p style="color:var(--danger,#ef4444);font-size:12px;margin:0">${err.message || 'Erro ao cadastrar cliente.'}</p>`;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar e selecionar'; }
    }
  },

  // ── Cobrar OS no PDV ─────────────────────────────────────────────────────

  abrirCobrarOS() {
    const m = document.getElementById('pdvCobrarOSModal');
    if (!m) return;
    const busca = document.getElementById('pdvCobrarOSBusca');
    const res   = document.getElementById('pdvCobrarOSResultados');
    if (busca) busca.value = '';
    if (res)   res.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px 0">Digite para buscar ordens de serviço prontas para retirada.</p>';
    m.classList.remove('hidden');

    if (!this._osBound) {
      this._osBound = true;
      document.getElementById('pdvCobrarOSFechar')?.addEventListener('click', () => {
        document.getElementById('pdvCobrarOSModal')?.classList.add('hidden');
      });
      document.getElementById('pdvCobrarOSModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('pdvCobrarOSModal'))
          document.getElementById('pdvCobrarOSModal').classList.add('hidden');
      });
      document.getElementById('pdvCobrarOSBuscarBtn')?.addEventListener('click', () => {
        const t = document.getElementById('pdvCobrarOSBusca')?.value.trim();
        if (t) this.buscarOSCobranca(t);
      });
      document.getElementById('pdvCobrarOSBusca')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const t = e.target.value.trim();
          if (t) this.buscarOSCobranca(t);
        }
      });
    }

    setTimeout(() => document.getElementById('pdvCobrarOSBusca')?.focus(), 50);
  },

  async buscarOSCobranca(termo) {
    const res = document.getElementById('pdvCobrarOSResultados');
    if (!res) return;
    res.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px"><i class="fa-solid fa-spinner fa-spin"></i> Buscando...</p>';
    try {
      const result = await api.getOrdensServico({ busca: termo, limit: 20 });
      const ordens = result?.ordens || [];
      const STATUS_LABEL_OS = { aberta:'Aberta', diagnostico:'Em Diagnóstico', aguardando_peca:'Aguardando Peça', em_execucao:'Em Execução', pronto:'Pronto p/ Retirada', entregue:'Entregue', cancelada:'Cancelada' };
      const fmt = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

      if (!ordens.length) {
        res.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">Nenhuma OS encontrada.</p>';
        return;
      }

      res.innerHTML = ordens.map(os => {
        const equip = [os.equipamento_tipo, os.equipamento_marca, os.equipamento_modelo].filter(Boolean).join(' · ') || '—';
        const pode = os.status !== 'entregue' && os.status !== 'cancelada';
        return `
          <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div style="min-width:0">
              <strong style="font-size:13px">${os.numero}</strong>
              <span style="font-size:12px;color:var(--text-muted);margin-left:8px">${STATUS_LABEL_OS[os.status]||os.status}</span>
              <p style="margin:2px 0 0;font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${os.cliente_nome||'—'} · ${equip}</p>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <strong style="font-size:13px;font-variant-numeric:tabular-nums">${fmt(os.valor_total)}</strong>
              ${pode ? `<button class="btn btn-primary btn-sm pdv-os-cobrar-btn" data-os-id="${os.id}" data-os-num="${os.numero}" data-os-nome="${this.escapeHtml(os.cliente_nome||'')}" data-os-equip="${this.escapeHtml(equip)}" data-os-valor="${os.valor_total||0}" style="font-size:12px;padding:4px 10px">Cobrar</button>` : '<span style="font-size:11px;color:var(--text-muted)">Encerrada</span>'}
            </div>
          </div>`;
      }).join('');

      res.querySelectorAll('.pdv-os-cobrar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.adicionarOSAoCarrinho({
            id:     btn.dataset.osId,
            numero: btn.dataset.osNum,
            cliente_nome: btn.dataset.osNome,
            equipamento: btn.dataset.osEquip,
            valor_total: btn.dataset.osValor
          });
          document.getElementById('pdvCobrarOSModal')?.classList.add('hidden');
        });
      });
    } catch (err) {
      res.innerHTML = `<p style="color:var(--danger,#ef4444);font-size:13px;text-align:center;padding:16px">${err.message||'Erro ao buscar OS.'}</p>`;
    }
  },

  adicionarOSAoCarrinho(os) {
    const nome = `OS ${os.numero}${os.equipamento ? ' — ' + os.equipamento : ''}`;
    this.state.carrinho.push({
      produto_id: null,
      produto_nome: nome,
      grade_id: null,
      grade_label: os.cliente_nome || '',
      quantidade: 1,
      preco_unitario: Number(os.valor_total) || 0,
      preco_padrao: Number(os.valor_total) || 0,
      custo_unitario: 0,
      estoque_disponivel: 999,
      desconto_pct: 0,
      _is_os: true,
      _os_id: Number(os.id) || null
    });
    this.renderCarrinho();
    this.renderResumo();
    this.switchTab('pagamento');
    showToast(`${nome} adicionado ao carrinho.`, 'success');
  },

  setLoading(value) {
    this.cache();

    if (this.el.finalizarBtn) this.el.finalizarBtn.disabled = value;
    if (this.el.limparBtn) this.el.limparBtn.disabled = value;
    if (this.el.atualizarBtn) this.el.atualizarBtn.disabled = value;
    const orcBtn = document.getElementById('pdvSalvarOrcamentoBtn');
    if (orcBtn) orcBtn.disabled = value;
  },

  setFeedback(message, type = 'info') {
    this.cache();

    if (!this.el.formFeedback) return;

    if (!message) {
      this.el.formFeedback.className = 'module-feedback';
      this.el.formFeedback.textContent = '';
      return;
    }

    this.el.formFeedback.className = `module-feedback module-feedback--${type}`;
    this.el.formFeedback.textContent = message;
  },

  showMessage(message, type = 'info') {
    this.setFeedback(message, type);
    showToast(message, type);
  },

  buildFriendlyError(error) {
    if (!error) return 'Erro inesperado.';

    if (typeof api.formatPlanError === 'function') {
      return api.formatPlanError(error);
    }

    if (error.status === 400) return error.message || 'Dados inválidos para a venda.';
    if (error.status === 403) return error.message || 'Sem permissão para realizar esta venda.';
    if (error.status === 404) return error.message || 'Recurso não encontrado.';
    if (error.status === 500) return 'Erro interno no backend ao finalizar a venda.';
    if (String(error.message || '').includes('Failed to fetch')) {
      return 'Não foi possível conectar ao backend.';
    }

    return error.message || 'Falha ao concluir a venda.';
  },

  updateOfflineIndicator(isOnline) {
    const el = document.getElementById('pdvOfflineIndicator');
    if (el) el.classList.toggle('hidden', isOnline);
  },

  async syncPendentesIfOnline() {
    if (!navigator.onLine) return 0;
    const pendentes = await PdvOffline.getVendasPendentes();
    if (!pendentes.length) return 0;

    let sincronizadas = 0;
    let erros = 0;

    for (const venda of pendentes) {
      try {
        const { id: localId, _queued_at, ...rest } = venda;
        const payload = {
          ...rest,
          idempotency_key: rest.idempotency_key || `offline-sync-${localId}-${_queued_at || Date.now()}`
        };
        await this.postVenda(payload);
        await PdvOffline.removerVendaPendente(localId);
        sincronizadas++;
      } catch (err) {
        console.error('[PDV Sync] Erro ao sincronizar venda pendente:', err.message || err);
        erros++;
      }
    }

    if (sincronizadas > 0) {
      showToast(`${sincronizadas} venda(s) offline sincronizada(s) com sucesso!`, 'success');
    }
    if (erros > 0) {
      showToast(`${erros} venda(s) falharam na sincronização. Verifique e tente novamente.`, 'error');
    }

    return sincronizadas;
  },

  bindOfflineEvents() {
    if (this._offlineBound) return;
    this._offlineBound = true;
    window.addEventListener('online', async () => {
      if (!api.getAuthToken()) return;
      this.updateOfflineIndicator(true);
      showToast('Conexão restaurada. Sincronizando vendas pendentes...', 'success');
      await this.syncPendentesIfOnline().catch(() => {});
      await this.load();
    });

    window.addEventListener('offline', () => {
      this.updateOfflineIndicator(false);
      showToast('Sem conexão. Modo offline ativado — vendas serão salvas localmente.', 'warning');
    });
  },

  parseMoneyInput(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  },

  today() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
  },

  toCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
};

export async function initPDVModule() {
  PDVModule.init();
  await PDVModule.load();
}

export default PDVModule;

