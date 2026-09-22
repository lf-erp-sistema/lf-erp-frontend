import api from './api.js';
import { getAuth } from './auth.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, calcPeriodoLocal, debounce } from './utils.js';

const ComprasModule = {
  state: {
    items: [],
    fornecedores: [],
    produtos: [],
    filteredItems: [],
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
      this.cache();
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

  bind() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;
    this._injectStyles();

    const debouncedSearch = debounce((v) => this.search(v), 350);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'comprasSearch') {
        debouncedSearch(e.target.value);
      }
    });

    document.addEventListener('change', (e) => {
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
        document.getElementById('xmlNFInput')?.click();
        return;
      }

      if (btn.id === 'novaCompraBtn' || btn.id === 'comprasEmptyNewBtn') {
        this.openModal();
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
      const [compras, fornecedores, produtos] = await Promise.all([
        api.getCompras(),
        api.getFornecedores(),
        api.getProdutos()
      ]);

      this.state.items = Array.isArray(compras) ? compras : (compras?.dados ?? []);
      this.state.fornecedores = Array.isArray(fornecedores) ? fornecedores : (fornecedores?.dados ?? []);
      this.state.produtos = Array.isArray(produtos) ? produtos : (produtos?.dados ?? []);

      this.render();
      this.cache();
      this.search('');
      this.setFeedback('', '');
    } catch (error) {
      console.error('Erro ao carregar compras:', error);

      this.state.items = [];
      this.state.filteredItems = [];
      this.state.fornecedores = [];
      this.state.produtos = [];

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

        <div class="module-toolbar">
          <div class="module-toolbar__search">
            <i class="fa-solid fa-search"></i>
            <input
              id="comprasSearch"
              placeholder="Buscar por fornecedor, data ou número da compra..."
              value="${escapeHtml(this.getCurrentSearchValue())}"
            />
          </div>

          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="comprasFiltroStatus" class="input" style="height:38px;min-width:140px;width:auto;font-size:13px">
              <option value="">Todos os status</option>
              <option value="finalizada" ${this.state.filtroStatus === 'finalizada' ? 'selected' : ''}>Finalizada</option>
              <option value="pendente" ${this.state.filtroStatus === 'pendente' ? 'selected' : ''}>Pendente</option>
            </select>
            <select id="comprasFiltroFornecedor" class="input" style="height:38px;min-width:160px;width:auto;font-size:13px">
              <option value="">Todos os fornecedores</option>
              ${this.state.fornecedores.map(f => `<option value="${f.id}" ${String(this.state.filtroFornecedor) === String(f.id) ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}
            </select>
          </div>

          <div class="module-toolbar__stats">
            <div class="mini-stat">
              <span>Total</span>
              <strong>${this.state.filteredItems.length}</strong>
            </div>

            <div class="mini-stat">
              <span>Valor</span>
              <strong>${formatCurrency(this.getTotalCompras())}</strong>
            </div>

            <div class="mini-stat">
              <span>Fornecedores</span>
              <strong>${this.getTotalFornecedores()}</strong>
            </div>

            <div class="mini-stat">
              <span>Ticket Médio</span>
              <strong>${this.getTicketMedio()}</strong>
            </div>
          </div>
          <div class="module-card__actions">
            <button class="btn btn-light" id="importarXmlBtn" type="button" title="Importar NF do fornecedor (XML)">
              <i class="fa-solid fa-file-import"></i> Importar XML
            </button>
            <button class="btn btn-primary" id="novaCompraBtn" type="button">
              <i class="fa-solid fa-plus"></i> Nova Compra
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
        <div class="modal-card modal-card--large">
          <div class="modal-card__header">
            <div>
              <h3>Nova compra</h3>
              <p>Lance a compra e atualize automaticamente estoque e financeiro.</p>
            </div>

            <button type="button" class="icon-button" id="cancelCompra" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="compraForm" class="form-grid">
            <div class="form-field">
              <label for="compraFornecedor">Fornecedor</label>
              <select id="compraFornecedor" class="filter-input" required>
                <option value="">Selecione...</option>
                ${this.state.fornecedores
                  .map(
                    (f) => `
                  <option value="${f.id}">
                    ${escapeHtml(f.nome)}
                  </option>
                `
                  )
                  .join('')}
              </select>
            </div>

            <div class="form-field">
              <label for="compraData">Data da compra</label>
              <input type="date" id="compraData" class="filter-input" value="${getTodayDate()}" required />
            </div>

            <div class="form-field">
              <label for="compraFormaPagamento">Forma de pagamento</label>
              <select id="compraFormaPagamento" class="filter-input" required>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Pix">Pix</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Boleto">Boleto</option>
                <option value="Promissoria">Promissória</option>
              </select>
            </div>

            <div class="form-field">
              <label for="compraParcelas">Parcelas</label>
              <input type="number" id="compraParcelas" min="1" value="1" />
            </div>

            <div class="form-field hidden" id="compraPrimeiroVencimentoField">
              <label for="compraPrimeiroVencimento">Primeiro vencimento</label>
              <input type="date" id="compraPrimeiroVencimento" class="filter-input" />
            </div>

            <div class="form-field form-field--span-2">
              <label for="compraObservacao">Observação</label>
              <textarea id="compraObservacao" placeholder="Observações internas da compra"></textarea>
            </div>

            <div class="form-field">
              <label for="compraProduto">Produto</label>
              <select id="compraProduto">
                <option value="">Selecione...</option>
                ${this.state.produtos
                  .map(
                    (p) => `
                  <option value="${p.id}" data-custo="${Number(p.custo || 0)}">
                    ${escapeHtml(p.nome)}
                  </option>
                `
                  )
                  .join('')}
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

            <div class="form-field form-field--span-2">
              <div class="table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Qtd.</th>
                      <th>Custo unit.</th>
                      <th class="text-right">Subtotal</th>
                      <th class="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="compraItensTable"></tbody>
                </table>
              </div>
            </div>

            <div class="form-field form-field--span-2">
              <div class="compra-total-box">
                <span>Total da compra</span>
                <strong id="compraTotalValor">R$ 0,00</strong>
              </div>
            </div>

            <div class="form-field form-field--span-2">
              <div class="modal-card__footer">
                <button type="button" class="btn btn-light" id="cancelCompraFooter">
                  Cancelar
                </button>

                <button type="submit" class="btn btn-primary">
                  <i class="fa-solid fa-check"></i>
                  Salvar compra
                </button>
              </div>
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
            <div class="table-actions">
              <button class="btn-inline" data-action="view-compra" data-id="${id}" type="button">
                <i class="fa-solid fa-eye"></i>
                Detalhes
              </button>

              <button class="btn-inline" data-action="edit-compra" data-id="${id}" type="button">
                <i class="fa-solid fa-pen"></i>
                Editar
              </button>

              <button class="btn-inline btn-inline--danger" data-action="delete-compra" data-id="${id}" type="button">
                <i class="fa-solid fa-trash"></i>
                Excluir
              </button>
            </div>
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

  openModal() {
    this.cache();

    this.state.itensCompra = [];

    if (this.el.form) {
      this.el.form.reset();
    }

    if (this.el.data) {
      this.el.data.value = getTodayDate();
    }

    if (this.el.parcelas) {
      this.el.parcelas.value = '1';
    }

    if (this.el.custoUnitario) {
      this.el.custoUnitario.value = '0';
    }

    if (this.el.quantidade) {
      this.el.quantidade.value = '1';
    }

    this.renderItensCompra();
    this.toggleVencimentoField();

    if (this.el.modal) {
      this.el.modal.classList.remove('hidden');
    }
  },

  async openEditModal(id) {
    try {
      this.showMessage('Carregando compra...', 'info');
      const compra = await api.getCompraDetalhe(id);

      this.state.editingId = Number(id);

      // Salva os itens antes de openModal() resetar state.itensCompra
      const itensCarregados = (compra.itens || []).map(i => ({
        produto_id: i.produto_id,
        produto_nome: i.produto_nome,
        quantidade: Number(i.quantidade),
        custo_unitario: Number(i.custo_unitario || 0),
        subtotal: Number(i.subtotal || 0)
      }));

      this.openModal(); // openModal() faz state.itensCompra = [] — restauramos logo abaixo

      this.state.itensCompra = itensCarregados;

      requestAnimationFrame(() => {
        // Backend retorna campos planificados no topo: compra.fornecedor_id, não compra.compra.fornecedor_id
        if (this.el.fornecedor) this.el.fornecedor.value = compra.fornecedor_id || '';
        if (this.el.data) this.el.data.value = (compra.data || '').slice(0, 10);
        if (this.el.formaPagamento) this.el.formaPagamento.value = compra.pagamento || '';
        if (this.el.parcelas) this.el.parcelas.value = compra.parcelas || 1;
        if (this.el.primeiroVencimento && compra.primeiro_vencimento) {
          this.el.primeiroVencimento.value = String(compra.primeiro_vencimento).slice(0, 10);
        }
        if (this.el.observacao) this.el.observacao.value = compra.observacao || '';
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

  toggleVencimentoField() {
    const formaPagamento = document.getElementById('compraFormaPagamento')?.value || '';
    const field = document.getElementById('compraPrimeiroVencimentoField');

    const exigeVencimento =
      formaPagamento.toLowerCase() === 'boleto' ||
      formaPagamento.toLowerCase() === 'promissoria' ||
      formaPagamento.toLowerCase() === 'promissória';

    if (field) {
      field.classList.toggle('hidden', !exigeVencimento);
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
          <td>${Number(item.quantidade || 0)}</td>
          <td>${formatCurrency(item.custo_unitario || 0)}</td>
          <td class="text-right">
            <strong>${formatCurrency(item.subtotal || 0)}</strong>
          </td>
          <td class="text-right">
            <button
              type="button"
              class="btn-inline btn-inline--danger"
              data-action="remove-item-compra"
              data-index="${index}"
            >
              Remover
            </button>
          </td>
        </tr>
      `
        )
        .join('');
    }

    const total = this.getTotalItensCompra();

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
    `;
    document.head.appendChild(style);
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
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:3500;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';

    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);width:100%;max-width:860px;max-height:90vh;overflow-y:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border)">
          <div>
            <h3 style="margin:0;font-size:1rem;font-weight:700">Importar NF do Fornecedor</h3>
            <p style="margin:4px 0 0;font-size:.83rem;color:var(--text-muted)">NF-e nº ${esc(data.numero_nf || '—')} · ${esc(data.data_emissao || '—')} · Total: ${cur(data.total)}</p>
          </div>
          <button id="_xmlFechar" class="modal-close"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div style="padding:22px;display:grid;gap:18px">

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

          <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border)">
            <button class="btn btn-light" id="_xmlCancelar">Cancelar</button>
            <button class="btn btn-primary" id="_xmlConfirmar">
              <i class="fa-solid fa-basket-shopping"></i> Criar Compra
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

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

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

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
