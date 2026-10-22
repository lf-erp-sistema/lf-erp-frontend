import api from './api.js';
import { getAuth } from './auth.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, calcPeriodoLocal, debounce, formatCurrency } from './utils.js';
import { enhanceSelect } from './premiumSelect.js';

const ComprasModule = {
  state: {
    items: [],
    fornecedores: [],
    produtos: [],
    filteredItems: [],
    fornecedoresCarregados: false,
    produtosCarregados: false,
    fornecedoresLoading: null,
    produtosLoading: null,
    catalogosScope: '',
    empresa: null,
    initialized: false,
    eventsBound: false,
    itensCompra: [],
    loading: false,
    filtroStatus: '',
    filtroFornecedor: '',
    ordem: 'data',
    ordemDir: 'desc',
    periodo: { preset: '30dias', dataInicial: '', dataFinal: '' }
  },

  init() {
    this.resolveEmpresa();

    if (!this.state.initialized) {
      this.state.initialized = true;
      this.render();
      ['comprasFiltroStatus', 'comprasFiltroFornecedor'].forEach(id => enhanceSelect(document.getElementById(id)));
      this.cache();
      this._enhanceFormSelects();
      this.bind();
    } else {
      this.cache();
      if (!this.el.modal || this.el.modal.classList.contains('hidden')) {
        this.state.editingId = null;
        this.state.itensCompra = [];
      }
    }
  },

  resolveEmpresa() {
    const auth = getAuth();

    this.state.empresa = auth?.empresa?.nome || auth?.user?.empresa || 'LF ERP';
    const scope = `${auth?.user?.id || ''}:${auth?.empresa?.id || auth?.empresa_id || ''}`;
    if (this.state.catalogosScope && this.state.catalogosScope !== scope) {
      this.state.fornecedores = [];
      this.state.produtos = [];
      this.state.fornecedoresCarregados = false;
      this.state.produtosCarregados = false;
      this.state.fornecedoresLoading = null;
      this.state.produtosLoading = null;
    }
    this.state.catalogosScope = scope;
  },

  cache() {
    this.el = {
      container: document.getElementById('comprasContainer'),
      table: document.getElementById('comprasTable'),
      search: document.getElementById('comprasSearch'),
      feedback: document.getElementById('comprasFeedback'),

      modal: document.getElementById('compraModal'),
      form: document.getElementById('compraForm'),
      fornecedor: document.getElementById('compraFornecedor'),
      data: document.getElementById('compraData'),
      formaPagamento: document.getElementById('compraFormaPagamento'),
      parcelas: document.getElementById('compraParcelas'),
      primeiroVencimento: document.getElementById('compraPrimeiroVencimento'),
      observacao: document.getElementById('compraObservacao'),

      produto: document.getElementById('compraProduto'),
      quantidade: document.getElementById('compraQuantidade'),
      custoUnitario: document.getElementById('compraCustoUnitario'),
      itensTable: document.getElementById('compraItensTable'),
      totalCompra: document.getElementById('compraTotalValor')
    };
  },

  _enhanceFormSelects(sync = false) {
    [this.el?.fornecedor, this.el?.formaPagamento, this.el?.produto].forEach((select) => {
      if (!select) return;
      enhanceSelect(select);
      if (sync) select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  },

  _filtrosCompraAtivos() {
    return [this.state.filtroStatus, this.state.filtroFornecedor].filter(Boolean).length;
  },

  _atualizarBadgeFiltrosCompras() {
    const badge = document.getElementById('comprasFiltrosBadge');
    if (!badge) return;
    const n = this._filtrosCompraAtivos();
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n === 0);
  },

  bind() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;
    this._injectStyles();
    this._injectCmpStyles();

    // ── "Ações" dropdown (status, fornecedor, Importar XML)
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('#comprasActionsBtn');
      const dropdown = document.getElementById('comprasActionsDropdown');
      if (!dropdown) return;
      if (btn) {
        if (!this.state.fornecedoresCarregados) {
          btn.disabled = true;
          try {
            await this.carregarCatalogos({ fornecedores: true, produtos: false });
            this.render();
            this.cache();
            enhanceSelect(document.getElementById('comprasFiltroStatus'));
            enhanceSelect(document.getElementById('comprasFiltroFornecedor'));
            document.getElementById('comprasActionsDropdown')?.classList.remove('hidden');
          } catch (error) {
            showToast('Não foi possível carregar os fornecedores agora.', 'error');
          }
          return;
        }
        dropdown.classList.toggle('hidden');
        return;
      }
      if (!e.target.closest('#comprasActionsWrapper')) {
        dropdown.classList.add('hidden');
      }
    });

    const debouncedSearch = debounce((v) => this.search(v), 350);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'comprasSearch') {
        debouncedSearch(e.target.value);
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.dataset.action === 'update-item-compra') {
        this.updateItem(e.target.dataset.index, e.target.dataset.field, e.target.value);
        return;
      }
      if (e.target.id === 'compraFormaPagamento') {
        this.toggleVencimentoField();
      }
      if (e.target.id === 'xmlNFInput') {
        const file = e.target.files?.[0];
        if (file) this.importarXML(file);
        e.target.value = '';
      }
      if (e.target.id === 'comprasFiltroStatus' || e.target.id === 'comprasFiltroFornecedor') {
        this.state.filtroStatus = document.getElementById('comprasFiltroStatus')?.value || '';
        this.state.filtroFornecedor = document.getElementById('comprasFiltroFornecedor')?.value || '';
        this._atualizarBadgeFiltrosCompras();
        this.search(this.el.search?.value || '');
      }
      if (e.target.id === 'compDataIni' || e.target.id === 'compDataFim') {
        this.state.periodo.dataInicial = document.getElementById('compDataIni')?.value || '';
        this.state.periodo.dataFinal = document.getElementById('compDataFim')?.value || '';
        this.search(this.el.search?.value || '');
      }
    });

    document.addEventListener('click', async (e) => {
      if (e.target.id === 'compraModal') { this.closeModal(); return; }
      if (!e.target.closest('#compraDataPicker')) this.closeCompraDatePicker();

      const dateAction = e.target.closest('[data-cmp-date-action]');
      if (dateAction) {
        const action = dateAction.dataset.cmpDateAction;
        if (action === 'toggle') this.toggleCompraDatePicker();
        if (action === 'prev-month') this.moveCompraDatePickerMonth(-1);
        if (action === 'next-month') this.moveCompraDatePickerMonth(1);
        if (action === 'today') this.selectCompraDate(getTodayDate());
        if (action === 'select') this.selectCompraDate(dateAction.dataset.date);
        return;
      }

      const th = e.target.closest('th[data-sort-col]');
      if (th) {
        const col = th.dataset.sortCol;
        if (this.state.ordem === col) {
          this.state.ordemDir = this.state.ordemDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.ordem = col;
          this.state.ordemDir = col === 'data' || col === 'id' ? 'desc' : 'asc';
        }
        this.render();
        this.cache();
        this.search(this.el.search?.value || '');
        return;
      }

      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.dataset.compPeriod !== undefined) {
        const preset = btn.dataset.compPeriod;
        this.state.periodo.preset = preset;
        if (preset !== 'personalizado') {
          const { dataInicial, dataFinal } = calcPeriodoLocal(preset);
          this.state.periodo.dataInicial = dataInicial;
          this.state.periodo.dataFinal = dataFinal;
        }
        this.render();
        this.cache();
        this.search(this.el.search?.value || '');
        return;
      }

      if (btn.id === 'importarXmlBtn') {
        try {
          await this.carregarCatalogos();
        } catch (error) {
          showToast('Não foi possível preparar os dados para a importação.', 'error');
          return;
        }
        document.getElementById('xmlNFInput')?.click();
        return;
      }

      if (btn.id === 'novaCompraBtn' || btn.id === 'comprasEmptyNewBtn') {
        await this.openModal();
        return;
      }

      if (btn.id === 'cancelCompra' || btn.id === 'cancelCompraFooter') {
        this.closeModal();
        return;
      }

      if (btn.id === 'addItemCompraBtn') {
        this.addItem();
        return;
      }

      if (btn.dataset.action === 'remove-item-compra') {
        this.removeItem(btn.dataset.index);
        return;
      }

      if (btn.dataset.action === 'comp-acoes') {
        const comp = this.state.items.find(x => String(x.id) === String(btn.dataset.id));
        if (comp) this._abrirAcoesCompraModal(comp);
        return;
      }

      if (btn.dataset.action === 'view-compra') {
        await this.showDetails(btn.dataset.id);
        return;
      }

      if (btn.dataset.action === 'edit-compra') {
        await this.openEditModal(btn.dataset.id);
        return;
      }

      if (btn.dataset.action === 'delete-compra') {
        await this.remove(btn.dataset.id);
      }
    });

    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'compraForm') {
        e.preventDefault();
        await this.save();
      }
    });
  },

  async load() {
    this.resolveEmpresa();
    this.state.loading = true;

    if (!this.state.periodo.dataInicial) {
      const datas = calcPeriodoLocal(this.state.periodo.preset);
      this.state.periodo.dataInicial = datas.dataInicial;
      this.state.periodo.dataFinal = datas.dataFinal;
    }

    this.setFeedback('Carregando compras...', 'info');
    this.setLoading(true);

    try {
      const compras = await api.getCompras();

      this.state.items = Array.isArray(compras) ? compras : (compras?.dados ?? []);

      this.render();
      this.cache();
      this.search('');
      this.setFeedback('', '');
    } catch (error) {
      console.error('Erro ao carregar compras:', error);

      this.state.items = [];
      this.state.filteredItems = [];
      this.render();
      this.cache();
      this.search('');
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
      this.setLoading(false);
    }
  },

  async carregarCatalogos({ fornecedores = true, produtos = true } = {}) {
    const tasks = [];

    if (fornecedores && !this.state.fornecedoresCarregados) {
      if (!this.state.fornecedoresLoading) {
        this.state.fornecedoresLoading = api.getFornecedores()
          .then((dados) => {
            this.state.fornecedores = Array.isArray(dados) ? dados : (dados?.dados ?? []);
            this.state.fornecedoresCarregados = true;
          })
          .finally(() => { this.state.fornecedoresLoading = null; });
      }
      tasks.push(this.state.fornecedoresLoading);
    }

    if (produtos && !this.state.produtosCarregados) {
      if (!this.state.produtosLoading) {
        this.state.produtosLoading = api.getProdutos()
          .then((dados) => {
            this.state.produtos = Array.isArray(dados) ? dados : (dados?.dados ?? []);
            this.state.produtosCarregados = true;
          })
          .finally(() => { this.state.produtosLoading = null; });
      }
      tasks.push(this.state.produtosLoading);
    }

    await Promise.all(tasks);
  },

  render() {
    const c = document.getElementById('comprasContainer');
    if (!c) return;

    const si = (col) => {
      if (this.state.ordem !== col) return '<span class="sort-icon sort-icon--idle">⇅</span>';
      return this.state.ordemDir === 'asc'
        ? '<span class="sort-icon sort-icon--asc">↑</span>'
        : '<span class="sort-icon sort-icon--desc">↓</span>';
    };

    c.innerHTML = `
      <section class="module-card">
        <div id="comprasFeedback" class="module-feedback"></div>

        <input type="file" id="xmlNFInput" accept=".xml" style="display:none"/>

        <div class="periodo-local">
          <span class="periodo-local__label">Período:</span>
          <div class="periodo-local__presets">
            ${['hoje','7dias','30dias','mesAtual','mesAnterior'].map(p => {
              const labels = { hoje:'Hoje', '7dias':'7 dias', '30dias':'30 dias', mesAtual:'Este mês', mesAnterior:'Mês ant.' };
              return `<button type="button" class="periodo-local__btn${this.state.periodo.preset===p?' periodo-local__btn--active':''}" data-comp-period="${p}">${labels[p]}</button>`;
            }).join('')}
            <button type="button" class="periodo-local__btn${this.state.periodo.preset==='personalizado'?' periodo-local__btn--active':''}" data-comp-period="personalizado">Personalizado</button>
          </div>
          <div id="compPeriodoCustom" class="periodo-local__custom${this.state.periodo.preset==='personalizado'?'':' hidden'}">
            <input type="date" id="compDataIni" class="input" value="${this.state.periodo.dataInicial}">
            <span>até</span>
            <input type="date" id="compDataFim" class="input" value="${this.state.periodo.dataFinal}">
          </div>
        </div>

        <div class="cl-tb-kpi-strip">
          <div class="cl-tb-kpi-item">
            <span class="cl-tb-kpi-lbl">Total</span>
            <span class="cl-tb-kpi-val">${this.state.filteredItems.length}</span>
          </div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item">
            <span class="cl-tb-kpi-lbl">Valor total</span>
            <span class="cl-tb-kpi-val">${formatCurrency(this.getTotalCompras())}</span>
          </div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item">
            <span class="cl-tb-kpi-lbl">Fornecedores</span>
            <span class="cl-tb-kpi-val cl-tb-kpi-ok">${this.getTotalFornecedores()}</span>
          </div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item">
            <span class="cl-tb-kpi-lbl">Ticket médio</span>
            <span class="cl-tb-kpi-val">${this.getTicketMedio()}</span>
          </div>
        </div>

        <div class="cl-tb-row">
          <div class="cl-tb-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="comprasSearch" placeholder="Buscar por fornecedor, data ou número da compra..."
              value="${escapeHtml(this.getCurrentSearchValue())}" />
          </div>
          <div class="cl-tb-actions">
            <div class="actions-menu-wrapper" id="comprasActionsWrapper">
              <button type="button" class="cl-tb-btn" id="comprasActionsBtn" title="Ações">
                <i class="fa-solid fa-ellipsis"></i>
                <span class="cl-tb-btn-lbl">Ações</span>
                <span id="comprasFiltrosBadge" class="badge badge--primary${this._filtrosCompraAtivos() ? '' : ' hidden'}" style="font-size:.7rem">${this._filtrosCompraAtivos()}</span>
                <i class="fa-solid fa-chevron-down" style="font-size:10px"></i>
              </button>
              <div class="actions-menu-dropdown hidden" id="comprasActionsDropdown" style="min-width:230px;padding:10px 0 4px;max-height:min(560px,80vh);overflow-y:auto">
                <div style="padding:0 14px">
                  <label class="prd-filtro-lbl" for="comprasFiltroStatus">Status</label>
                  <select id="comprasFiltroStatus" class="cl-tb-select" style="width:100%;margin-bottom:12px">
                    <option value="">Todos os status</option>
                    <option value="finalizada" ${this.state.filtroStatus === 'finalizada' ? 'selected' : ''}>Finalizada</option>
                    <option value="pendente" ${this.state.filtroStatus === 'pendente' ? 'selected' : ''}>Pendente</option>
                  </select>
                  <label class="prd-filtro-lbl" for="comprasFiltroFornecedor">Fornecedor</label>
                  <select id="comprasFiltroFornecedor" class="cl-tb-select" style="width:100%">
                    <option value="">Todos os fornecedores</option>
                    ${this.state.fornecedores.map(f => `<option value="${f.id}" ${String(this.state.filtroFornecedor) === String(f.id) ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}
                  </select>
                </div>
                <div class="actions-menu-divider" style="margin:10px 0 4px"></div>
                <button class="actions-menu-item" id="importarXmlBtn" type="button">
                  <i class="fa-solid fa-file-import"></i> Importar XML
                </button>
              </div>
            </div>
            <button class="cl-tb-btn cl-tb-btn--primary" id="novaCompraBtn" type="button">
              <i class="fa-solid fa-plus"></i>
              <span class="cl-tb-btn-lbl">Nova Compra</span>
            </button>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th data-sort-col="id" style="cursor:pointer">Compra ${si('id')}</th>
                <th data-sort-col="fornecedor" style="cursor:pointer">Fornecedor ${si('fornecedor')}</th>
                <th data-sort-col="data" style="cursor:pointer">Data ${si('data')}</th>
                <th>Status</th>
                <th class="text-right" data-sort-col="total" style="cursor:pointer">Total ${si('total')}</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="comprasTable"></tbody>
          </table>
        </div>
      </section>

      <div class="modal-overlay hidden" id="compraModal">
        <div class="modal-card cmp-nc-card">
          <div class="modal-card__header">
            <div>
              <h3>Nova compra</h3>
              <p>Lance a compra e atualize automaticamente estoque e financeiro.</p>
            </div>

            <button type="button" class="icon-button" id="cancelCompra" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="compraForm">
            <div class="cmp-nc-body">

              <div class="cmp-nc-section cmp-nc-section--supplier">
                <div class="cmp-nc-section-heading">
                  <p class="cmp-nc-section-title"><i class="fa-solid fa-building"></i> Fornecedor <span class="cmp-nc-req">*</span></p>
                  <span class="cmp-nc-required-hint">Obrigatório</span>
                </div>
                <div class="cmp-nc-supplier-control">
                  <span class="cmp-nc-cell-ico cmp-nc-cell-ico--supplier" aria-hidden="true">
                    <i class="fa-solid fa-building"></i>
                  </span>
                  <div class="cmp-nc-cell-content">
                    <select id="compraFornecedor" class="cmp-nc-cell-input" data-premium-search="true" aria-label="Fornecedor" required>
                      <option value="">Selecione o fornecedor</option>
                      ${this.state.fornecedores.map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join('')}
                    </select>
                  </div>
                </div>
                <p class="cmp-nc-field-hint">Escolha o fornecedor responsável por esta compra.</p>
              </div>

              <div class="cmp-nc-section">
                <p class="cmp-nc-section-title"><i class="fa-solid fa-wallet"></i> Pagamento</p>
                <div class="cmp-nc-card-group">
                  <div class="cmp-nc-cells-2col">
                    <div class="cmp-nc-cell">
                      <span class="cmp-nc-cell-ico cmp-nc-cell-ico--blue">
                        <i class="fa-solid fa-calendar-days"></i>
                      </span>
                      <div class="cmp-nc-cell-content">
                        <label class="cmp-nc-lbl" for="compraData">Data da compra <span class="cmp-nc-req">*</span></label>
                        <div class="cmp-nc-date-picker" id="compraDataPicker">
                          <input type="hidden" id="compraData" value="${getTodayDate()}" required />
                          <button type="button" class="cmp-nc-date-trigger" id="compraDataTrigger" data-cmp-date-action="toggle" aria-haspopup="dialog" aria-expanded="false">
                            <span id="compraDataLabel"></span>
                            <i class="fa-regular fa-calendar"></i>
                          </button>
                          <div class="cmp-nc-date-popover hidden" id="compraDataPopover" role="dialog" aria-label="Selecionar data da compra"></div>
                        </div>
                      </div>
                    </div>
                    <div class="cmp-nc-cell">
                      <span class="cmp-nc-cell-ico">
                        <i class="fa-solid fa-credit-card"></i>
                      </span>
                      <div class="cmp-nc-cell-content">
                        <label class="cmp-nc-lbl" for="compraFormaPagamento">Forma de pagamento <span class="cmp-nc-req">*</span></label>
                        <select id="compraFormaPagamento" class="cmp-nc-cell-input" required>
                          <option value="Dinheiro">Dinheiro</option>
                          <option value="Pix">Pix</option>
                          <option value="Cartão de Débito">Cartão de Débito</option>
                          <option value="Cartão de Crédito">Cartão de Crédito</option>
                          <option value="Boleto">Boleto</option>
                          <option value="Promissoria">Promissória</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="cmp-nc-cell hidden" id="comprasParcelasRow">
                    <span class="cmp-nc-cell-ico">
                      <i class="fa-solid fa-list-ol"></i>
                    </span>
                    <div class="cmp-nc-cell-content">
                      <label class="cmp-nc-lbl" for="compraParcelas">Parcelas</label>
                      <input type="number" id="compraParcelas" class="cmp-nc-cell-input" min="1" value="1" />
                    </div>
                  </div>
                  <div class="cmp-nc-cell hidden" id="compraPrimeiroVencimentoField">
                    <span class="cmp-nc-cell-ico cmp-nc-cell-ico--blue">
                      <i class="fa-solid fa-calendar-check"></i>
                    </span>
                    <div class="cmp-nc-cell-content">
                      <label class="cmp-nc-lbl" for="compraPrimeiroVencimento">Primeiro vencimento</label>
                      <input type="date" id="compraPrimeiroVencimento" class="cmp-nc-cell-input" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="cmp-nc-section cmp-nc-items-section">
                <p class="cmp-nc-section-title cmp-nc-items-title"><i class="fa-solid fa-basket-shopping"></i> Itens da compra <span id="compraItensCont" class="cmp-nc-items-count">0 itens</span></p>
                <div class="cmp-nc-items-inner">
                  <div class="form-grid cmp-nc-items-add">
                    <div class="form-field">
                      <label for="compraProduto">Produto</label>
                      <select id="compraProduto">
                        <option value="">Selecione...</option>
                        ${this.state.produtos.map((p) => `<option value="${p.id}" data-custo="${Number(p.custo || 0)}">${escapeHtml(p.nome)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-field">
                      <label for="compraQuantidade">Quantidade</label>
                      <input type="number" id="compraQuantidade" min="1" value="1" />
                    </div>
                    <div class="form-field">
                      <label for="compraCustoUnitario">Custo unitário</label>
                      <input type="number" id="compraCustoUnitario" min="0" step="0.01" inputmode="decimal" value="0" />
                    </div>
                    <div class="form-field">
                      <label>&nbsp;</label>
                      <button type="button" class="btn btn-light" id="addItemCompraBtn">
                        <i class="fa-solid fa-plus"></i>
                        Adicionar item
                      </button>
                    </div>
                  </div>

                  <div class="table-wrapper">
                    <table class="data-table cmp-nc-items-table">
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Qtd.</th>
                          <th>Custo</th>
                          <th class="text-right">Subtotal</th>
                          <th class="text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody id="compraItensTable"></tbody>
                    </table>
                  </div>

                  <div class="compra-total-box">
                    <span>Total da compra</span>
                    <strong id="compraTotalValor">R$ 0,00</strong>
                  </div>
                </div>
              </div>

              <div class="cmp-nc-section">
                <p class="cmp-nc-section-title"><i class="fa-regular fa-note-sticky"></i> Observação</p>
                <textarea id="compraObservacao" class="cmp-nc-obs" placeholder="Observações internas da compra" rows="3"></textarea>
              </div>

            </div>

            <div class="modal-card__footer">
              <button type="button" class="btn btn-light" id="cancelCompraFooter">
                Cancelar
              </button>

              <button type="submit" class="btn btn-primary">
                <i class="fa-solid fa-check"></i>
                Salvar compra
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

  },

  renderTable() {
    this.cache();

    if (!this.el.table) return;

    if (!this.state.filteredItems.length) {
      this.el.table.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-table-state">
              <i class="fa-solid fa-basket-shopping" style="font-size:2rem;opacity:.22;margin-bottom:4px"></i>
              <strong>Nenhuma compra encontrada</strong>
              <span>Cadastre uma nova compra para movimentar estoque e financeiro.</span>
              <button class="btn btn-primary" id="comprasEmptyNewBtn" style="margin-top:8px">
                <i class="fa-solid fa-plus"></i> Nova compra
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    this.el.table.innerHTML = this.state.filteredItems
      .map((item) => {
        const id = Number(item.id || 0);
        const fornecedor = item.fornecedor_nome || item.fornecedor || 'Fornecedor não informado';
        const data = formatDate(item.data);
        const total = formatCurrency(item.total || 0);
        const status = item.status || 'finalizada';
        const termo = String(this.el.search?.value || '').trim().toLowerCase();

        return `
        <tr>
          <td>
            <div class="table-primary">
              <strong>#${id}</strong>
              <small>${badgePagamentoCompra(item.pagamento)}</small>
            </div>
          </td>

          <td>
            <div class="table-primary">
              <strong>${this._highlight(escapeHtml(fornecedor), termo)}</strong>
              <small>Fornecedor</small>
            </div>
          </td>

          <td>${data}</td>

          <td>${formatStatusBadge(status)}</td>

          <td class="text-right">
            <strong>${total}</strong>
          </td>

          <td class="text-right">
            <button type="button" class="cr-act-toggle" data-action="comp-acoes" data-id="${id}" title="Mais ações" aria-label="Mais ações">
              <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </td>
        </tr>
      `;
      })
      .join('');
  },

  search(value) {
    const termo = String(value || '').trim().toLowerCase();
    const filtroStatus = this.state.filtroStatus;
    const filtroFornecedor = String(this.state.filtroFornecedor || '');
    const { dataInicial, dataFinal } = this.state.periodo;

    this.state.filteredItems = this.state.items.filter((item) => {
      if (filtroStatus && (item.status || 'finalizada') !== filtroStatus) return false;
      if (filtroFornecedor && String(item.fornecedor_id) !== filtroFornecedor) return false;
      if (dataInicial && item.data && String(item.data).slice(0, 10) < dataInicial) return false;
      if (dataFinal && item.data && String(item.data).slice(0, 10) > dataFinal) return false;
      if (!termo) return true;

      const texto = [
        item.id,
        item.fornecedor_nome,
        item.fornecedor,
        item.data,
        item.total,
        item.status,
        item.observacao
      ]
        .join(' ')
        .toLowerCase();

      return texto.includes(termo);
    });

    this._sortItems();
    this.renderTable();
  },

  async openModal() {
    try {
      await this.carregarCatalogos();
    } catch (error) {
      showToast('Não foi possível carregar produtos e fornecedores agora.', 'error');
      return;
    }

    this.cache();
    this._atualizarCatalogosDoFormulario();
    this._abrirModalPronto();
  },

  _atualizarCatalogosDoFormulario() {
    if (this.el.fornecedor) {
      this.el.fornecedor.innerHTML = `
        <option value="">Selecione o fornecedor</option>
        ${this.state.fornecedores.map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join('')}`;
    }
    if (this.el.produto) {
      this.el.produto.innerHTML = `
        <option value="">Selecione um produto</option>
        ${this.state.produtos.map((p) => `<option value="${p.id}" data-custo="${Number(p.custo || 0)}">${escapeHtml(p.nome)}</option>`).join('')}`;
    }
  },

  _abrirModalPronto() {

    this.state.itensCompra = [];

    if (this.el.form) {
      this.el.form.reset();
    }

    if (this.el.data) {
      this.el.data.value = getTodayDate();
    }
    this.syncCompraDatePicker();

    if (this.el.parcelas) {
      this.el.parcelas.value = '1';
    }

    if (this.el.custoUnitario) {
      this.el.custoUnitario.value = '0';
    }

    if (this.el.quantidade) {
      this.el.quantidade.value = '1';
    }

    this._enhanceFormSelects(true);
    this.renderItensCompra();
    this.toggleVencimentoField();

    if (this.el.modal) {
      this.el.modal.classList.remove('hidden');
    }
  },

  async openEditModal(id) {
    try {
      this.showMessage('Carregando compra...', 'info');
      const [compra] = await Promise.all([
        api.getCompraDetalhe(id),
        this.carregarCatalogos()
      ]);

      this.state.editingId = Number(id);

      // Salva os itens antes de _abrirModalPronto() resetar state.itensCompra
      const itensCarregados = (compra.itens || []).map(i => ({
        produto_id: i.produto_id,
        produto_nome: i.produto_nome,
        quantidade: Number(i.quantidade),
        custo_unitario: Number(i.custo_unitario || 0),
        subtotal: Number(i.subtotal || 0)
      }));

      this.cache();
      this._atualizarCatalogosDoFormulario();
      this._abrirModalPronto();

      this.state.itensCompra = itensCarregados;

      requestAnimationFrame(() => {
        // Backend retorna campos planificados no topo: compra.fornecedor_id, não compra.compra.fornecedor_id
        if (this.el.fornecedor) this.el.fornecedor.value = compra.fornecedor_id || '';
        if (this.el.data) this.el.data.value = (compra.data || '').slice(0, 10);
        this.syncCompraDatePicker();
        if (this.el.formaPagamento) this.el.formaPagamento.value = compra.pagamento || '';
        if (this.el.parcelas) this.el.parcelas.value = compra.parcelas || 1;
        if (this.el.primeiroVencimento && compra.primeiro_vencimento) {
          this.el.primeiroVencimento.value = String(compra.primeiro_vencimento).slice(0, 10);
        }
        if (this.el.observacao) this.el.observacao.value = compra.observacao || '';
        this._enhanceFormSelects(true);
        this.toggleVencimentoField();
        this.renderItensCompra();

        const titulo = document.querySelector('#compraModal h3');
        if (titulo) titulo.textContent = `Editar Compra #${id}`;
      });
    } catch (error) {
      this.showMessage('Erro ao carregar compra para edição.', 'error');
    }
  },

  closeModal() {
    this.cache();

    if (this.el.modal) {
      this.el.modal.classList.add('hidden');
    }

    this.state.itensCompra = [];
    this.state.editingId = null;

    const titulo = document.querySelector('#compraModal h3');
    if (titulo) titulo.textContent = 'Nova Compra';
  },

  syncCompraDatePicker() {
    const input = this.el?.data || document.getElementById('compraData');
    const label = document.getElementById('compraDataLabel');
    if (!label) return;

    const value = input?.value || '';
    const [year, month, day] = value.split('-');
    label.textContent = year && month && day ? `${day}/${month}/${year}` : 'Selecionar data';
  },

  closeCompraDatePicker() {
    document.getElementById('compraDataPopover')?.classList.add('hidden');
    document.getElementById('compraDataTrigger')?.setAttribute('aria-expanded', 'false');
  },

  toggleCompraDatePicker() {
    const popover = document.getElementById('compraDataPopover');
    const trigger = document.getElementById('compraDataTrigger');
    const input = this.el?.data || document.getElementById('compraData');
    if (!popover || !trigger || !input) return;

    if (!popover.classList.contains('hidden')) {
      this.closeCompraDatePicker();
      return;
    }

    this._compraDatePickerMonth = (input.value || getTodayDate()).slice(0, 7);
    this.renderCompraDatePicker();
    popover.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
  },

  moveCompraDatePickerMonth(offset) {
    const [year, month] = String(this._compraDatePickerMonth || getTodayDate().slice(0, 7)).split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    this._compraDatePickerMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    this.renderCompraDatePicker();
  },

  selectCompraDate(value) {
    const input = this.el?.data || document.getElementById('compraData');
    if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this.syncCompraDatePicker();
    this.closeCompraDatePicker();
  },

  renderCompraDatePicker() {
    const popover = document.getElementById('compraDataPopover');
    const input = this.el?.data || document.getElementById('compraData');
    if (!popover || !input) return;

    const [year, month] = String(this._compraDatePickerMonth || input.value || getTodayDate().slice(0, 7)).split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const totalDays = new Date(year, month, 0).getDate();
    const selected = input.value;
    const today = getTodayDate();
    const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const blanks = Array.from({ length: firstDay }, () => '<span class="cmp-nc-date-empty"></span>').join('');
    const days = Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const classes = ['cmp-nc-date-day'];
      if (value === selected) classes.push('is-selected');
      if (value === today) classes.push('is-today');
      return `<button type="button" class="${classes.join(' ')}" data-cmp-date-action="select" data-date="${value}">${day}</button>`;
    }).join('');

    popover.innerHTML = `
      <div class="cmp-nc-date-head">
        <button type="button" class="cmp-nc-date-nav" data-cmp-date-action="prev-month" aria-label="Mês anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <strong>${monthLabel}</strong>
        <button type="button" class="cmp-nc-date-nav" data-cmp-date-action="next-month" aria-label="Próximo mês"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="cmp-nc-date-week">${weekDays.map(day => `<span>${day}</span>`).join('')}</div>
      <div class="cmp-nc-date-grid">${blanks}${days}</div>
      <button type="button" class="cmp-nc-date-today" data-cmp-date-action="today">Hoje</button>
    `;
  },

  toggleVencimentoField() {
    const formaPagamento = document.getElementById('compraFormaPagamento')?.value || '';
    const field = document.getElementById('compraPrimeiroVencimentoField');
    const fp = formaPagamento.toLowerCase();

    const exigeVencimento =
      fp === 'boleto' ||
      fp === 'promissoria' ||
      fp === 'promissória';

    const exigeParcelas =
      fp === 'cartão de crédito' ||
      fp === 'boleto' ||
      fp === 'promissoria' ||
      fp === 'promissória';

    if (field) {
      field.classList.toggle('hidden', !exigeVencimento);
    }

    const parcelasRow = document.getElementById('comprasParcelasRow');
    if (parcelasRow) {
      parcelasRow.classList.toggle('hidden', !exigeParcelas);
    }

    const primeiroVencimento = document.getElementById('compraPrimeiroVencimento');
    if (primeiroVencimento && exigeVencimento && !primeiroVencimento.value) {
      primeiroVencimento.value = getTodayDate();
    }
  },

  addItem() {
    this.cache();

    const produtoId = Number(this.el.produto?.value || 0);
    const quantidade = Number(this.el.quantidade?.value || 0);
    const custoUnitario = Number(this.el.custoUnitario?.value || 0);

    if (!produtoId) {
      this.showMessage('Selecione um produto.', 'error');
      return;
    }

    if (!quantidade || quantidade <= 0) {
      this.showMessage('Informe uma quantidade válida.', 'error');
      return;
    }

    if (custoUnitario < 0) {
      this.showMessage('Informe um custo válido.', 'error');
      return;
    }

    const produto = this.state.produtos.find((p) => Number(p.id) === produtoId);

    if (!produto) {
      this.showMessage('Produto não encontrado.', 'error');
      return;
    }

    const existente = this.state.itensCompra.find((item) => Number(item.produto_id) === produtoId);

    if (existente) {
      existente.quantidade += quantidade;
      existente.custo_unitario = custoUnitario;
      existente.subtotal = Number((existente.quantidade * existente.custo_unitario).toFixed(2));
    } else {
      this.state.itensCompra.push({
        produto_id: produtoId,
        produto_nome: produto.nome,
        quantidade,
        custo_unitario: custoUnitario,
        subtotal: Number((quantidade * custoUnitario).toFixed(2))
      });
    }

    if (this.el.produto) this.el.produto.value = '';
    if (this.el.quantidade) this.el.quantidade.value = '1';
    if (this.el.custoUnitario) this.el.custoUnitario.value = '0';

    this.renderItensCompra();
  },

  removeItem(index) {
    const idx = Number(index);

    if (!Number.isInteger(idx) || idx < 0) return;

    this.state.itensCompra.splice(idx, 1);
    this.renderItensCompra();
  },

  updateItem(index, field, value) {
    const idx = Number(index);
    const item = this.state.itensCompra[idx];
    if (!item || !['quantidade', 'custo_unitario'].includes(field)) return;

    const nextValue = Number(value);
    const minimo = field === 'quantidade' ? 0.001 : 0;
    if (!Number.isFinite(nextValue) || nextValue < minimo) {
      this.showMessage(field === 'quantidade' ? 'Informe uma quantidade válida.' : 'Informe um custo válido.', 'error');
      this.renderItensCompra();
      return;
    }

    item[field] = nextValue;
    item.subtotal = Number((Number(item.quantidade) * Number(item.custo_unitario)).toFixed(2));
    this.renderItensCompra();
  },

  renderItensCompra() {
    this.cache();

    if (!this.el.itensTable) return;

    if (!this.state.itensCompra.length) {
      this.el.itensTable.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-table-state compact">
              Nenhum item adicionado.
            </div>
          </td>
        </tr>
      `;
    } else {
      this.el.itensTable.innerHTML = this.state.itensCompra
        .map(
          (item, index) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.produto_nome)}</strong>
          </td>
          <td>
            <input type="number" class="cmp-nc-item-input" data-action="update-item-compra" data-index="${index}" data-field="quantidade" min="0.001" step="0.001" value="${Number(item.quantidade || 0)}" aria-label="Quantidade de ${escapeHtml(item.produto_nome)}" />
          </td>
          <td>
            <input type="number" class="cmp-nc-item-input" data-action="update-item-compra" data-index="${index}" data-field="custo_unitario" min="0" step="0.01" value="${Number(item.custo_unitario || 0)}" aria-label="Custo unitário de ${escapeHtml(item.produto_nome)}" />
          </td>
          <td class="text-right">
            <strong>${formatCurrency(item.subtotal || 0)}</strong>
          </td>
          <td class="text-right">
            <button
              type="button"
              class="cmp-nc-item-remove"
              data-action="remove-item-compra"
              data-index="${index}"
              aria-label="Remover ${escapeHtml(item.produto_nome)}"
              title="Remover item"
            >
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `
        )
        .join('');
    }

    const total = this.getTotalItensCompra();

    const itensCont = document.getElementById('compraItensCont');
    if (itensCont) {
      const quantidadeItens = this.state.itensCompra.length;
      itensCont.textContent = `${quantidadeItens} ${quantidadeItens === 1 ? 'item' : 'itens'}`;
    }

    if (this.el.totalCompra) {
      this.el.totalCompra.textContent = formatCurrency(total);
    }
  },

  getTotalItensCompra() {
    return this.state.itensCompra.reduce((acc, item) => {
      return acc + Number(item.subtotal || 0);
    }, 0);
  },

  async save() {
    if (this.state.saving || this.state.loading) return;
    this.cache();

    const fornecedorId = Number(this.el.fornecedor?.value || 0);
    const data = this.el.data?.value || '';
    const pagamento = this.el.formaPagamento?.value || '';
    const parcelas = Number(this.el.parcelas?.value || 1);
    const primeiroVencimento = this.el.primeiroVencimento?.value || '';
    const observacao = this.el.observacao?.value || '';

    if (!fornecedorId) {
      this.showMessage('Selecione o fornecedor.', 'error');
      return;
    }

    if (!data) {
      this.showMessage('Informe a data da compra.', 'error');
      return;
    }

    if (!pagamento) {
      this.showMessage('Informe a forma de pagamento.', 'error');
      return;
    }

    if (!this.state.itensCompra.length) {
      this.showMessage('Adicione pelo menos um item à compra.', 'error');
      return;
    }

    this.state.saving = true;
    const btn = this.el.form?.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    const payload = {
      empresa: this.state.empresa,
      empresa_id: api.getEmpresaId(),
      fornecedor_id: fornecedorId,
      data,
      pagamento,
      parcelas: Math.max(1, parcelas || 1),
      primeiro_vencimento: primeiroVencimento || data,
      observacao,
      itens: this.state.itensCompra.map((item) => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        custo_unitario: item.custo_unitario
      }))
    };

    try {
      if (this.state.editingId) {
        await api.updateCompra(this.state.editingId, payload);
        this.showMessage('Compra atualizada com sucesso.', 'success');
      } else {
        await api.createCompra(payload);
        this.showMessage('Compra cadastrada com sucesso.', 'success');
      }

      this.state.editingId = null;
      this.closeModal();
      await this.load();
    } catch (error) {
      console.error('Erro ao salvar compra:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.saving = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar compra'; }
    }
  },

  async remove(id) {
    if (this.state.loading || this.state.saving) return;
    const _cmp = this.state.items.find(c => String(c.id) === String(id));
    const _labelCmp = _cmp ? ` de "${_cmp.fornecedor_nome || _cmp.fornecedor || 'fornecedor'}"` : '';
    const confirmar = await confirmarAcao(`Excluir compra${_labelCmp}? O estoque e as contas vinculadas serão ajustados.`, 'Excluir', 'danger');

    if (!confirmar) return;
    if (this.state.loading || this.state.saving) return;

    this.state.loading = true;
    try {
      await api.deleteCompra(id);
      this.showMessage('Compra excluída com sucesso.', 'success');
      await this.load();
    } catch (error) {
      console.error('Erro ao excluir compra:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
    }
  },

  _abrirAcoesCompraModal(comp) {
    document.getElementById('compAcoesModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'compAcoesModal';
    overlay.className = 'cr-mai-overlay';
    const forn = comp.fornecedor_nome || comp.fornecedor || 'Compra';
    const data  = comp.data ? new Date(comp.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
    overlay.innerHTML = `
      <div class="cr-mai-card">
        <div class="cr-mai-header">
          <div>
            <div style="font-weight:900;font-size:.95rem">${escapeHtml(forn)}</div>
            ${data ? `<div style="font-size:.78rem;color:var(--text-muted)">${data}</div>` : ''}
          </div>
          <button type="button" class="cr-mai-fechar" id="compAcoesFechar" title="Fechar" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="cr-mai-actions">
          <button type="button" class="cr-mai-item" data-action="view-compra" data-id="${comp.id}">
            <span class="cr-mai-ico cr-mai-ico--success"><i class="fa-solid fa-eye"></i></span>
            <span class="cr-mai-texts"><span class="cr-mai-lbl">Detalhes</span><span class="cr-mai-desc">Ver itens e informações da compra</span></span>
          </button>
          <button type="button" class="cr-mai-item" data-action="edit-compra" data-id="${comp.id}">
            <span class="cr-mai-ico cr-mai-ico--pix"><i class="fa-solid fa-pen"></i></span>
            <span class="cr-mai-texts"><span class="cr-mai-lbl">Editar</span><span class="cr-mai-desc">Alterar dados da compra</span></span>
          </button>
          <button type="button" class="cr-mai-item" data-action="delete-compra" data-id="${comp.id}">
            <span class="cr-mai-ico cr-mai-ico--danger"><i class="fa-solid fa-trash"></i></span>
            <span class="cr-mai-texts"><span class="cr-mai-lbl">Excluir</span><span class="cr-mai-desc">Remover compra permanentemente</span></span>
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('compAcoesFechar').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => overlay.remove());
    });
  },

  async showDetails(id) {
    try {
      const detalhe = await api.getCompraDetalhe(id);
      this.renderDetailsModal(detalhe);
    } catch (error) {
      console.error('Erro ao carregar detalhe da compra:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    }
  },

  renderDetailsModal(compra) {
    const modalExistente = document.getElementById('compraDetalheModal');
    if (modalExistente) modalExistente.remove();

    const itens = Array.isArray(compra?.itens) ? compra.itens : [];
    const contas = Array.isArray(compra?.contas_pagar) ? compra.contas_pagar : [];

    const modal = document.createElement('div');
    modal.id = 'compraDetalheModal';
    modal.className = 'modal-overlay compra-detail-overlay';

    modal.innerHTML = `
      <div class="modal-card compra-detail-card">
        <div class="compra-detail-header">
          <div>
            <span class="compra-detail-eyebrow">Compra #${escapeHtml(compra?.id || '-')}</span>
            <h3>Detalhes da compra</h3>
            <p>${escapeHtml(compra?.fornecedor_nome || 'Fornecedor não informado')}</p>
          </div>

          <button type="button" class="icon-button" id="fecharCompraDetalhe" aria-label="Fechar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="compra-detail-body">
          <section class="compra-detail-summary">
            <article class="compra-detail-summary__main">
              <span>Total da compra</span>
              <strong>${formatCurrency(compra?.total || 0)}</strong>
              <small>${formatDate(compra?.data)}</small>
            </article>

            <article>
              <span>Pagamento</span>
              <strong>${escapeHtml(compra?.pagamento || compra?.forma_pagamento || '-')}</strong>
            </article>

            <article>
              <span>Parcelas</span>
              <strong>${escapeHtml(compra?.parcelas || 1)}x</strong>
            </article>

            <article>
              <span>Status</span>
              ${formatStatusBadge(compra?.status || 'finalizada')}
            </article>
          </section>

          <section class="compra-detail-note">
            <span>Observação</span>
            <p>${escapeHtml(compra?.observacao || 'Nenhuma observação registrada.')}</p>
          </section>

          <section class="compra-detail-section">
            <div class="compra-detail-section__header">
              <div>
                <h4>Itens da compra</h4>
                <p>Produtos vinculados a esta entrada de estoque</p>
              </div>
              <span>${itens.length} item(ns)</span>
            </div>

            <div class="compra-detail-list">
              ${
                itens.length
                  ? itens
                      .map(
                        (item) => `
                    <div class="compra-detail-row">
                      <div>
                        <strong>${escapeHtml(item.produto_nome || 'Produto')}</strong>
                        <small>Qtd. ${Number(item.quantidade || 0)}</small>
                      </div>

                      <div>
                        <span>Custo unit.</span>
                        <strong>${formatCurrency(item.custo_unitario || 0)}</strong>
                      </div>

                      <div>
                        <span>Subtotal</span>
                        <strong>${formatCurrency(item.subtotal || 0)}</strong>
                      </div>
                    </div>
                  `
                      )
                      .join('')
                  : `<div class="empty-detail-state">Nenhum item vinculado.</div>`
              }
            </div>
          </section>

          <section class="compra-detail-section">
            <div class="compra-detail-section__header">
              <div>
                <h4>Contas a pagar</h4>
                <p>Parcelas financeiras vinculadas à compra</p>
              </div>
              <span>${contas.length} parcela(s)</span>
            </div>

            <div class="compra-detail-list">
              ${
                contas.length
                  ? contas
                      .map(
                        (conta) => `
                    <div class="compra-detail-row">
                      <div>
                        <strong>Parcela ${Number(conta.parcela || 1)}/${Number(conta.total_parcelas || 1)}</strong>
                        <small>Vencimento: ${formatDate(conta.data_vencimento)}</small>
                      </div>

                      <div>
                        <span>Status</span>
                        ${formatStatusBadge(conta.status || 'pendente')}
                      </div>

                      <div>
                        <span>Valor</span>
                        <strong>${formatCurrency(conta.valor || 0)}</strong>
                      </div>
                    </div>
                  `
                      )
                      .join('')
                  : `<div class="empty-detail-state">Nenhuma conta a pagar gerada.</div>`
              }
            </div>
          </section>
        </div>

        <div class="compra-detail-footer">
          <button type="button" class="btn btn-light" id="fecharCompraDetalheFooter">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('fecharCompraDetalhe')?.addEventListener('click', () => modal.remove());
    document
      .getElementById('fecharCompraDetalheFooter')
      ?.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
  },

  setFeedback(message, type = 'info') {
    const feedback = document.getElementById('comprasFeedback');
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

    if (this.el.search) this.el.search.disabled = value;

    const btnNova = document.getElementById('novaCompraBtn');
    if (btnNova) btnNova.disabled = value;

    if (btnNova) {
      btnNova.innerHTML = value
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Carregando...'
        : '<i class="fa-solid fa-plus"></i> Nova Compra';
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

  getCurrentSearchValue() {
    return document.getElementById('comprasSearch')?.value || '';
  },

  getTotalCompras() {
    return (this.state.filteredItems || this.state.items).reduce((acc, item) => acc + Number(item.total || 0), 0);
  },

  getTotalFornecedores() {
    const fornecedores = new Set(
      (this.state.filteredItems || this.state.items).map((item) => item.fornecedor_nome || item.fornecedor).filter(Boolean)
    );

    return fornecedores.size;
  },

  getTicketMedio() {
    const lista = this.state.filteredItems || this.state.items;
    if (!lista.length) return '—';
    const total = lista.reduce((acc, item) => acc + Number(item.total || 0), 0);
    return formatCurrency(total / lista.length);
  },

  _sortItems() {
    const { ordem, ordemDir } = this.state;
    const dir = ordemDir === 'asc' ? 1 : -1;
    this.state.filteredItems.sort((a, b) => {
      if (ordem === 'id') return dir * (Number(a.id || 0) - Number(b.id || 0));
      if (ordem === 'total') return dir * (Number(a.total || 0) - Number(b.total || 0));
      if (ordem === 'data') {
        const da = String(a.data || '').slice(0, 10);
        const db = String(b.data || '').slice(0, 10);
        return dir * da.localeCompare(db);
      }
      if (ordem === 'fornecedor') {
        const fa = String(a.fornecedor_nome || a.fornecedor || '').toLowerCase();
        const fb = String(b.fornecedor_nome || b.fornecedor || '').toLowerCase();
        return dir * fa.localeCompare(fb, 'pt-BR');
      }
      return 0;
    });
  },

  _highlight(text, term) {
    if (!term) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="cmp-hl">$1</mark>');
  },

  _injectStyles() {
    if (document.getElementById('_comprasStyles')) return;
    const style = document.createElement('style');
    style.id = '_comprasStyles';
    style.textContent = `
      .sort-icon { font-size:.75rem; margin-left:3px; }
      .sort-icon--idle { opacity:.35; }
      .sort-icon--asc, .sort-icon--desc { color:var(--primary,#2563eb); opacity:.9; }
      mark.cmp-hl { background:rgba(234,179,8,.35); color:inherit; border-radius:2px; padding:0 1px; }
      .badge-cmp { display:inline-flex; align-items:center; padding:2px 8px; border-radius:12px; font-size:.74rem; font-weight:600; }
      .badge-cmp--finalizada { background:rgba(34,197,94,.15); color:#15803d; }
      .badge-cmp--pendente   { background:rgba(234,179,8,.18); color:#92400e; }
      .badge-cmp--cancelada  { background:rgba(239,68,68,.13); color:#b91c1c; }
      .badge-cmp--default    { background:rgba(100,116,139,.15); color:#475569; }
      @media (prefers-color-scheme:dark) {
        .badge-cmp--finalizada { background:rgba(34,197,94,.18); color:#4ade80; }
        .badge-cmp--pendente   { background:rgba(234,179,8,.2); color:#fbbf24; }
        .badge-cmp--cancelada  { background:rgba(239,68,68,.18); color:#f87171; }
        .badge-cmp--default    { background:rgba(148,163,184,.15); color:#94a3b8; }
      }
      .cmp-pay { display:inline-flex; align-items:center; padding:2px 7px; border-radius:10px; font-size:.72rem; font-weight:600; }
      .cmp-pay--dinheiro  { background:rgba(34,197,94,.13); color:#15803d; }
      .cmp-pay--pix       { background:rgba(6,182,212,.14); color:#0e7490; }
      .cmp-pay--boleto    { background:rgba(99,102,241,.14); color:#4338ca; }
      .cmp-pay--credito   { background:rgba(168,85,247,.14); color:#7e22ce; }
      .cmp-pay--debito    { background:rgba(59,130,246,.14); color:#1d4ed8; }
      .cmp-pay--promissoria { background:rgba(245,158,11,.15); color:#92400e; }
      .cmp-pay--outros    { background:rgba(100,116,139,.14); color:#475569; }
      @media (prefers-color-scheme:dark) {
        .cmp-pay--dinheiro { background:rgba(34,197,94,.18); color:#4ade80; }
        .cmp-pay--pix      { background:rgba(6,182,212,.18); color:#22d3ee; }
        .cmp-pay--boleto   { background:rgba(99,102,241,.18); color:#818cf8; }
        .cmp-pay--credito  { background:rgba(168,85,247,.18); color:#c084fc; }
        .cmp-pay--debito   { background:rgba(59,130,246,.18); color:#60a5fa; }
        .cmp-pay--promissoria { background:rgba(245,158,11,.2); color:#fbbf24; }
        .cmp-pay--outros   { background:rgba(148,163,184,.15); color:#94a3b8; }
      }
      .cmp-filter-box {
        display: flex;
        align-items: center;
      }
      .cmp-filter-box select {
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--bg-card, var(--surface));
        color: var(--text);
        font-size: 13px;
        padding: 0 12px;
        min-height: 44px;
        min-width: 150px;
        outline: none;
        cursor: pointer;
        transition: border-color .15s;
      }
      .cmp-filter-box select:focus { border-color: var(--primary); }
    `;
    document.head.appendChild(style);
  },

  _injectCmpStyles() {
    if (document.getElementById('cmp-nc-styles')) return;
    const s = document.createElement('style');
    s.id = 'cmp-nc-styles';
    s.textContent = `
      /* O modal usa uma grade fluida: nunca deixa controles escaparem para a
         lateral, mas aproveita uma tela ampla para dar espaço à edição. */
      .cmp-nc-card { width: min(calc(100vw - 32px), 1200px) !important; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
      .cmp-nc-card *, .cmp-nc-card *::before, .cmp-nc-card *::after { box-sizing: border-box; }
      .cmp-nc-card > form { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
      .cmp-nc-body { overflow-y: auto; flex: 1 1 auto; min-height: 0; }
      .cmp-nc-section { padding: 16px 20px 0; }
      .cmp-nc-body > .cmp-nc-section:nth-child(2) { container-type: inline-size; }
      .cmp-nc-section:last-child { padding-bottom: 20px; }
      .cmp-nc-section-title { display: flex; align-items: center; gap: 7px; font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8px; }
      .cmp-nc-section-title > i { color: var(--primary); font-size: .8rem; }
      .cmp-nc-items-title { margin-bottom: 10px; }
      .cmp-nc-items-count { margin-left: auto; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); color: var(--text-muted); font-size: .63rem; letter-spacing: 0; text-transform: none; }
      .cmp-nc-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .cmp-nc-section-heading .cmp-nc-section-title { display: flex; align-items: center; gap: 7px; }
      .cmp-nc-section-heading .cmp-nc-section-title i { color: var(--primary); font-size: .82rem; }
      .cmp-nc-required-hint { padding: 3px 8px; border-radius: 999px; background: var(--primary-soft); color: var(--primary); font-size: .65rem; font-weight: 800; }
      .cmp-nc-card-group { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
      .cmp-nc-cell { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface); transition: background .1s; }
      .cmp-nc-cell:last-child { border-bottom: none; }
      .cmp-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
      .cmp-nc-cells-2col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); border-bottom: 1px solid var(--border); }
      .cmp-nc-cells-2col:last-child { border-bottom: none; }
      .cmp-nc-cells-2col .cmp-nc-cell { border-bottom: none; }
      .cmp-nc-cells-2col .cmp-nc-cell:first-child { border-right: 1px solid var(--border); }
      .cmp-nc-cell { min-width: 0; }
      .cmp-nc-cell-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; background: var(--surface-2); color: var(--text-muted); }
      .cmp-nc-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
      .cmp-nc-cell-ico--blue { background: rgba(37,99,235,.1); color: #2563eb; }
      .cmp-nc-cell-ico--orange { background: rgba(234,88,12,.1); color: #ea580c; }
      .cmp-nc-cell-ico--supplier { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-soft); color: var(--primary); }
      .cmp-nc-cell-content { flex: 1; min-width: 0; }
      .cmp-nc-lbl { display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
      .cmp-nc-req { color: #dc2626; }
      .cmp-nc-cell-input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-size: 0.93rem; font-weight: 600; color: var(--text); width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none; }
      select.cmp-nc-cell-input { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat !important; background-position: right 0 center !important; padding-right: 16px !important; }
      .cmp-nc-date-picker { position: relative; }
      .cmp-nc-date-trigger { display: flex; width: 100%; min-height: 28px; align-items: center; justify-content: space-between; gap: 10px; padding: 0; border: 0; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-size: .95rem; font-weight: 700; text-align: left; }
      .cmp-nc-date-trigger i { color: var(--primary); font-size: .9rem; }
      .cmp-nc-date-popover { position: absolute; z-index: calc(var(--z-modal) + 3); top: calc(100% + 11px); left: -52px; width: 292px; padding: 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: 0 18px 42px rgba(15,23,42,.2); }
      .cmp-nc-date-popover.hidden { display: none; }
      .cmp-nc-date-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; color: var(--text); font-size: .82rem; text-transform: capitalize; }
      .cmp-nc-date-nav { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text-muted); cursor: pointer; }
      .cmp-nc-date-nav:hover { border-color: var(--primary); color: var(--primary); }
      .cmp-nc-date-week, .cmp-nc-date-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; text-align: center; }
      .cmp-nc-date-week { margin-bottom: 4px; color: var(--text-muted); font-size: .63rem; font-weight: 800; }
      .cmp-nc-date-day, .cmp-nc-date-empty { width: 100%; height: 31px; }
      .cmp-nc-date-day { border: 0; border-radius: 8px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-size: .76rem; }
      .cmp-nc-date-day:hover { background: var(--primary-soft); color: var(--primary); }
      .cmp-nc-date-day.is-today { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 48%, var(--border)); }
      .cmp-nc-date-day.is-selected { background: var(--primary); color: var(--white); font-weight: 800; box-shadow: var(--shadow-sm); }
      .cmp-nc-date-today { width: 100%; margin-top: 9px; padding: 8px; border: 0; border-top: 1px solid var(--border); background: transparent; color: var(--primary); cursor: pointer; font: inherit; font-size: .75rem; font-weight: 800; }
      .cmp-nc-supplier-control { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); transition: border-color .15s, box-shadow .15s; }
      .cmp-nc-supplier-control:focus-within { border-color: var(--primary); box-shadow: var(--control-shadow-focus); }
      .cmp-nc-supplier-control .premium-select { width: 100%; }
      .cmp-nc-supplier-control .premium-select__trigger { min-height: 42px; padding: 0 13px; border-color: transparent; border-radius: 10px; background: var(--surface-2); color: var(--text); font-size: .94rem; font-weight: 700; }
      .cmp-nc-supplier-control .premium-select__trigger:hover { background: var(--primary-soft); }
      .cmp-nc-supplier-control .premium-select__menu { z-index: calc(var(--z-modal) + 2); max-height: 230px; }
      .cmp-nc-supplier-control .premium-select__option { min-height: 38px; }
      .cmp-nc-field-hint { margin: 7px 2px 0; color: var(--text-muted); font-size: .72rem; }
      .cmp-nc-obs { width: 100%; resize: none; font-size: 0.9rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; font-family: inherit; color: var(--text); box-sizing: border-box; }
      .cmp-nc-items-section { margin: 0; }
      .cmp-nc-items-inner { padding: 0; }
      .cmp-nc-items-add { display: grid; width: 100%; grid-template-columns: minmax(0, 1.8fr) minmax(0, .65fr) minmax(0, .85fr) minmax(148px, 1fr); gap: 12px; align-items: end; margin-bottom: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface-2); }
      .cmp-nc-items-add .form-field { min-width: 0; }
      .cmp-nc-items-add .btn { width: 100%; min-width: 0; min-height: 44px; padding-inline: 10px; justify-content: center; overflow-wrap: anywhere; }
      .cmp-nc-items-add #addItemCompraBtn { border-color: color-mix(in srgb, var(--primary) 34%, var(--border)); background: var(--primary-soft); color: var(--primary); font-weight: 800; }
      .cmp-nc-items-add #addItemCompraBtn:hover { border-color: var(--primary); background: var(--primary); color: var(--white); }
      .cmp-nc-items-inner .table-wrapper { margin-top: 12px; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
      .cmp-nc-items-table { min-width: 0; width: 100%; table-layout: fixed; }
      .cmp-nc-items-table th,
      .cmp-nc-items-table td { padding: 11px 10px; font-size: .78rem; white-space: normal; }
      .cmp-nc-items-table th { font-size: .67rem; letter-spacing: .045em; }
      .cmp-nc-items-table th:nth-child(1) { width: 39%; }
      .cmp-nc-items-table th:nth-child(2) { width: 12%; }
      .cmp-nc-items-table th:nth-child(3) { width: 17%; }
      .cmp-nc-items-table th:nth-child(4) { width: 21%; }
      .cmp-nc-items-table th:nth-child(5) { width: 11%; }
      .cmp-nc-items-table td:first-child strong { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.3; }
      .cmp-nc-item-input { width: 100%; min-width: 0; height: 34px; padding: 0 7px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text); font: inherit; font-weight: 800; text-align: center; outline: none; }
      .cmp-nc-item-input:focus { border-color: var(--primary); box-shadow: var(--control-shadow-focus); }
      .cmp-nc-item-remove { display: inline-grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 1px solid color-mix(in srgb, var(--danger) 25%, var(--border)); border-radius: 8px; background: transparent; color: var(--danger); cursor: pointer; }
      .cmp-nc-item-remove:hover { background: color-mix(in srgb, var(--danger) 9%, transparent); }
      .cmp-nc-items-inner .compra-total-box { margin-top: 12px; padding: 14px 16px; border-radius: 16px; }
      @media (min-width: 1400px) {
        .cmp-nc-card { padding: 0 !important; border-radius: 24px !important; box-shadow: 0 24px 80px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08) !important; }
        .cmp-nc-card .modal-card__header { padding: 22px 28px 18px; }
        .cmp-nc-card .modal-card__footer { padding: 16px 28px; }
        .cmp-nc-body { display: grid; grid-template-columns: minmax(360px, .85fr) minmax(0, 1.15fr); align-items: start; column-gap: 28px; row-gap: 18px; padding: 22px 28px; overflow-x: hidden; }
        .cmp-nc-body > .cmp-nc-section { padding: 0; min-width: 0; }
        .cmp-nc-body > .cmp-nc-section:nth-child(1) { grid-column: 1; grid-row: 1; }
        .cmp-nc-body > .cmp-nc-section:nth-child(2) { grid-column: 2; grid-row: 1; }
        .cmp-nc-body > .cmp-nc-section:nth-child(3) { grid-column: 1 / -1; grid-row: 2; }
        .cmp-nc-body > .cmp-nc-section:nth-child(4) { grid-column: 1 / -1; grid-row: 3; }
        .cmp-nc-items-add { grid-template-columns: minmax(230px, 1.8fr) minmax(100px, .6fr) minmax(120px, .8fr) minmax(160px, 1fr); }
        .cmp-nc-items-add .form-field:first-child,
        .cmp-nc-items-add .form-field:last-child { grid-column: auto; }
      }
      /* Em janelas compactas, fornecedor e pagamento tornam-se blocos largos.
         Isso evita que a forma de pagamento seja cortada, como ocorria na
         grade de duas colunas em resoluções de notebook. */
      @media (min-width: 601px) and (max-width: 1399px) {
        .cmp-nc-card { padding: 0 !important; border-radius: 24px !important; }
        .cmp-nc-card .modal-card__header { padding: 20px 24px 16px; }
        .cmp-nc-card .modal-card__footer { padding: 14px 24px; }
        .cmp-nc-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; padding: 20px 24px; overflow-x: hidden; }
        .cmp-nc-body > .cmp-nc-section { grid-column: 1 !important; grid-row: auto !important; padding: 0; min-width: 0; }
        .cmp-nc-items-add { grid-template-columns: minmax(0, 1.8fr) minmax(90px, .62fr) minmax(115px, .78fr) minmax(145px, .9fr); }
      }
      /* A largura útil da área de pagamento é a referência, não a largura
         da janela (que muda quando o navegador usa zoom). */
      @container (max-width: 650px) {
        .cmp-nc-cells-2col { grid-template-columns: minmax(0, 1fr); }
        .cmp-nc-cells-2col .cmp-nc-cell:first-child { border-right: 0; border-bottom: 1px solid var(--border); }
      }
      @media (max-width: 600px) {
        .cmp-nc-section { padding: 14px 16px 0; }
        .cmp-nc-cells-2col { grid-template-columns: 1fr; }
        .cmp-nc-cells-2col .cmp-nc-cell:first-child { border-right: none; border-bottom: 1px solid var(--border); }
        .cmp-nc-items-add { grid-template-columns: 1fr 1fr; }
        .cmp-nc-items-inner .table-wrapper { overflow-x: auto; }
        .cmp-nc-items-table { min-width: 560px; }
        .cmp-nc-date-popover { left: 0; width: min(292px, calc(100vw - 64px)); }
      }
      @media (max-width: 420px) {
        .cmp-nc-items-add { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(s);
  },

  // ── Import XML NF de Fornecedor ────────────────────────────────────────────

  async importarXML(file) {
    const MAX_XML_SIZE = 5 * 1024 * 1024; // 5 MB
    if (!file || file.size > MAX_XML_SIZE) {
      showToast('Arquivo XML inválido ou muito grande (máx. 5 MB).', 'error');
      return;
    }
    if (file.type && !['text/xml', 'application/xml'].includes(file.type) && !file.name.endsWith('.xml')) {
      showToast('Selecione um arquivo XML válido.', 'error');
      return;
    }
    const btn = document.getElementById('importarXmlBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

    try {
      const conteudo = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = (e) => res(e.target.result);
        reader.onerror = () => rej(new Error('Erro ao ler arquivo'));
        reader.readAsText(file, 'utf-8');
      });

      const data = await api.importarXmlNF(conteudo);
      this.renderModalXML(data);
    } catch (err) {
      showToast(err?.message || 'Erro ao processar XML', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Importar XML'; }
    }
  },

  renderModalXML(data) {
    const existing = document.getElementById('_xmlNFModal');
    if (existing) existing.remove();

    const esc = escapeHtml;
    const cur = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

    const fornecedorOptions = this.state.fornecedores.map(f =>
      `<option value="${f.id}" ${f.id === data.fornecedor_id ? 'selected' : ''}>${esc(f.nome)}</option>`
    ).join('');

    const itensHTML = (data.itens || []).map((item, idx) => `
      <tr>
        <td style="font-size:.82rem">${esc(item.nome)}</td>
        <td style="text-align:center">${item.quantidade}</td>
        <td style="text-align:right">${cur(item.custo_unitario)}</td>
        <td style="text-align:right"><strong>${cur(item.total)}</strong></td>
        <td>
          <select class="input xml-produto-select" style="font-size:.8rem;padding:4px 8px" data-idx="${idx}">
            <option value="">— Vincular produto —</option>
            ${this.state.produtos.map(p =>
              `<option value="${p.id}">${esc(p.nome)}</option>`
            ).join('')}
          </select>
        </td>
      </tr>`).join('');

    const overlay = document.createElement('div');
    overlay.id = '_xmlNFModal';
    overlay.className = 'modal-overlay modal-overlay--prompt';

    overlay.innerHTML = `
      <div class="modal-card modal-card--large">
        <div class="modal-card__header">
          <div>
            <h3>Importar NF do Fornecedor</h3>
            <p>NF-e nº ${esc(data.numero_nf || '—')} · ${esc(data.data_emissao || '—')} · Total: ${cur(data.total)}</p>
          </div>
          <button id="_xmlFechar" class="modal-close" title="Fechar" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="modal-card__body" style="display:grid;gap:18px">

          ${!data.fornecedor_id ? `<div class="module-feedback module-feedback--info" style="margin:0">
            CNPJ ${esc(data.fornecedor_cnpj)} não encontrado na base. Selecione um fornecedor abaixo ou cadastre-o primeiro.
          </div>` : `<div class="module-feedback module-feedback--success" style="margin:0">
            Fornecedor identificado: <strong>${esc(data.fornecedor_nome)}</strong>
          </div>`}

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="form-field">
              <label>Fornecedor <span style="color:var(--danger)">*</span></label>
              <select id="_xmlFornecedor" class="input" required>
                <option value="">Selecionar...</option>
                ${fornecedorOptions}
              </select>
            </div>
            <div class="form-field">
              <label>Data</label>
              <input id="_xmlData" class="input" type="date" value="${esc(data.data_emissao || '')}" />
            </div>
            <div class="form-field">
              <label>Forma de Pagamento</label>
              <select id="_xmlForma" class="input">
                ${['dinheiro','boleto','pix','transferencia','cartao credito','cartao debito','cheque','promissoria'].map(f =>
                  `<option value="${f}" ${f === data.forma_pagamento ? 'selected' : ''}>${f.charAt(0).toUpperCase()+f.slice(1)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-field">
              <label>Observação</label>
              <input id="_xmlObs" class="input" placeholder="Ex: NF ${esc(data.numero_nf)}" value="NF ${esc(data.numero_nf)}" />
            </div>
          </div>

          <div>
            <h4 style="font-size:.9rem;font-weight:700;margin-bottom:10px">Itens da NF (${(data.itens||[]).length})</h4>
            <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:10px">Vincule cada item da NF a um produto do seu cadastro. Itens sem vínculo serão ignorados.</p>
            <div class="table-wrapper">
              <table class="data-table" style="font-size:.85rem">
                <thead>
                  <tr><th>Produto na NF</th><th>Qtd</th><th class="text-right">Unit</th><th class="text-right">Total</th><th>Produto no sistema</th></tr>
                </thead>
                <tbody>${itensHTML}</tbody>
              </table>
            </div>
          </div>

        </div>
        <div class="modal-card__footer">
          <button class="btn btn-light" id="_xmlCancelar">Cancelar</button>
          <button class="btn btn-primary" id="_xmlConfirmar"><i class="fa-solid fa-basket-shopping"></i> Criar Compra</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    enhanceSelect(document.getElementById('_xmlFornecedor'));
    enhanceSelect(document.getElementById('_xmlForma'));

    document.getElementById('_xmlFechar').addEventListener('click', () => overlay.remove());
    document.getElementById('_xmlCancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('_xmlConfirmar').addEventListener('click', async () => {
      const fornecedorId = Number(document.getElementById('_xmlFornecedor').value);
      const dataVal      = document.getElementById('_xmlData').value;
      const formaVal     = document.getElementById('_xmlForma').value;
      const obsVal       = document.getElementById('_xmlObs').value;

      if (!fornecedorId) { showToast('Selecione o fornecedor.', 'error'); return; }
      if (!dataVal)      { showToast('Informe a data da compra.', 'error'); return; }

      // Coleta itens vinculados
      const itensVinculados = [];
      overlay.querySelectorAll('.xml-produto-select').forEach((sel, idx) => {
        if (!sel.value) return;
        const item = data.itens[idx];
        itensVinculados.push({
          produto_id:    Number(sel.value),
          quantidade:    item.quantidade,
          custo_unitario: item.custo_unitario
        });
      });

      if (!itensVinculados.length) { showToast('Vincule pelo menos um item a um produto.', 'error'); return; }

      const btn = document.getElementById('_xmlConfirmar');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...';

      try {
        await api.createCompra({
          empresa: this.state.empresa,
          empresa_id: api.getEmpresaId(),
          fornecedor_id: fornecedorId,
          data: dataVal,
          pagamento: formaVal,
          observacao: obsVal,
          itens: itensVinculados
        });
        showToast('Compra criada com sucesso a partir da NF!', 'success');
        overlay.remove();
        await this.load();
      } catch (err) {
        showToast(err?.message || 'Erro ao criar compra', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-basket-shopping"></i> Criar Compra';
      }
    });
  }
};

function formatDate(value) {
  if (!value) return '-';

  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(String(value));
  }

  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
}

function getTodayDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
}


function capitalize(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  const mapa = {
    finalizada: { label: 'Finalizada', cls: 'badge-cmp--finalizada' },
    pendente:   { label: 'Pendente',   cls: 'badge-cmp--pendente'   },
    cancelada:  { label: 'Cancelada',  cls: 'badge-cmp--cancelada'  },
  };
  const entry = mapa[s];
  if (entry) return `<span class="badge-cmp ${entry.cls}">${entry.label}</span>`;
  return `<span class="badge-cmp badge-cmp--default">${escapeHtml(capitalize(status))}</span>`;
}

function badgePagamentoCompra(pagamento) {
  if (!pagamento) return '';
  const p = String(pagamento).toLowerCase();
  let cls = 'cmp-pay--outros';
  if (p.includes('dinheiro'))   cls = 'cmp-pay--dinheiro';
  else if (p.includes('pix'))   cls = 'cmp-pay--pix';
  else if (p.includes('boleto')) cls = 'cmp-pay--boleto';
  else if (p.includes('crédito') || p.includes('credito')) cls = 'cmp-pay--credito';
  else if (p.includes('débito') || p.includes('debito'))   cls = 'cmp-pay--debito';
  else if (p.includes('promiss'))  cls = 'cmp-pay--promissoria';
  return `<span class="cmp-pay ${cls}">${escapeHtml(capitalize(pagamento))}</span>`;
}

export function initComprasModule() {
  ComprasModule.init();
  return ComprasModule.load();
}

export default ComprasModule;
