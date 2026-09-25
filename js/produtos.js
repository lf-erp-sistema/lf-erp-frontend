import api from './api.js';
import { getAuth } from './auth.js';
import { showToast, confirmarAcao } from './feedback.js';
import { exportCSV, numCSV } from './exportUtils.js';
import { escapeHtml, buildFriendlyError, debounce } from './utils.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}


// ─── Module ───────────────────────────────────────────────────────────────────

const ProdutosModule = {
  ITENS_POR_PAGINA: 20,

  state: {
    items: [],
    filteredItems: [],
    loading: false,
    editingId: null,
    empresa: null,
    initialized: false,
    eventsBound: false,
    activeTab: 'dados',
    selectedIds: new Set(),
    searchTerm: '',
    filtroCategoria: '',
    filtroAlerta: '',
    filtroOrdem: '',
    filtroPromocao: '',
    filtroTipo: '',
    pagina: 1,
    // grade
    grades: [],
    // kit
    kitComponentes: [],
    kitEstoque: 0,
    allProdutos: [],
    // imagens
    imagens: [],
    // preço sugerido
    precoEditado: false,
    margemAlvo: 30
  },

  init() {
    try {
      const m = parseInt(localStorage.getItem('lf_margem_alvo') || '30', 10);
      if (m > 0) this.state.margemAlvo = m;
    } catch { /* silent */ }
    this.resolveEmpresa();
    if (!this.state.initialized) {
      this.state.initialized = true;
      this.renderInitialState();
      this.cacheElements();
      this.bindEvents();
    } else {
      this.cacheElements();
    }
  },

  resolveEmpresa() {
    const auth = getAuth();
    this.state.empresa = auth?.empresa?.nome || auth?.user?.empresa || 'LF ERP';
  },

  cacheElements() {
    this.el = {
      container:      document.getElementById('produtosContainer'),
      toolbarSearch:  document.getElementById('produtosSearchInput'),
      toolbarRefresh: document.getElementById('produtosRefreshBtn'),
      toolbarNew:     document.getElementById('produtosNewBtn'),
      statsTotal:     document.getElementById('produtosStatsTotal'),
      statsStock:     document.getElementById('produtosStatsStock'),
      statsAlert:     document.getElementById('produtosStatsAlert'),
      tableBody:      document.getElementById('produtosTableBody'),
      emptyState:     document.getElementById('produtosEmptyState'),
      feedback:       document.getElementById('produtosFeedback'),
      modal:          document.getElementById('produtoModal'),
      modalTitle:     document.getElementById('produtoModalTitle'),
      form:           document.getElementById('produtoForm'),
      id:             document.getElementById('produtoId'),
      nome:           document.getElementById('produtoNome'),
      categoria:      document.getElementById('produtoCategoria'),
      codigoBarras:   document.getElementById('produtoCodigoBarras'),
      preco:          document.getElementById('produtoPreco'),
      custo:          document.getElementById('produtoCusto'),
      precoPromocional: document.getElementById('produtoPrecoPromocional'),
      promocaoAtiva:  document.getElementById('produtoPromocaoAtiva'),
      estoque:        document.getElementById('produtoEstoque'),
      estoqueMinimo:  document.getElementById('produtoEstoqueMinimo'),
      ncm:            document.getElementById('produtoNcm'),
      unidade:        document.getElementById('produtoUnidade'),
      saveBtn:        document.getElementById('produtoSaveBtn'),
      cancelBtn:      document.getElementById('produtoCancelBtn'),
      closeBtn:       document.getElementById('produtoModalCloseBtn'),
      formFeedback:   document.getElementById('produtoFormFeedback'),
      tabs:           document.getElementById('produtoTabs'),
      tabDados:       document.getElementById('produtoTabDados'),
      tabImagens:     document.getElementById('produtoTabImagens'),
      tabGrade:       document.getElementById('produtoTabGrade'),
      tabKit:         document.getElementById('produtoTabKit'),
      colsBtn:        document.getElementById('produtosColsBtn'),
      colsDropdown:   document.getElementById('colPickerDropdown'),
      produtosTable:  document.querySelector('#produtosSection .data-table'),
    };
  },

  // ── Eventos ────────────────────────────────────────────────────────────────

  bindEvents() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;

    // Estilo de linha selecionada para impressão em lote
    if (!document.getElementById('prod-lote-styles')) {
      const s = document.createElement('style');
      s.id = 'prod-lote-styles';
      s.textContent = `
        .row--selected { background: color-mix(in srgb, var(--primary) 8%, transparent); }
        .row--alert > td:first-child { border-left: 3px solid var(--danger, #ef4444); }
        mark.search-hl { background: #fff3cd; color: inherit; border-radius: 2px; }
        @media (max-width: 768px) { #produtosFiltrosToggle { display:inline-flex!important } #produtosFiltrosContent.filtros-collapsed { display:none!important } }
        @media (min-width: 769px) { #produtosFiltrosToggle { display:none!important } #produtosFiltrosContent { display:flex!important } }
        .prod-filter-box { display:flex; align-items:center; }
        .prod-filter-box select {
          border: 1px solid var(--border);
          border-radius: 14px;
          background: var(--bg-card, var(--surface));
          color: var(--text);
          font-size: 13px;
          padding: 0 12px;
          min-height: 44px;
          min-width: 140px;
          outline: none;
          cursor: pointer;
          transition: border-color .15s;
        }
        .prod-filter-box select:focus { border-color: var(--primary); }
      `;
      document.head.appendChild(s);
    }

    const _debouncedSearchProd = debounce((val) => {
      this.state.pagina = 1;
      this.applySearch(val);
    }, 350);

    document.addEventListener('input', (e) => {
      if (e.target?.id === 'produtosSearchInput') {
        _debouncedSearchProd(e.target.value);
      }

      // Preço sugerido: atualiza quando custo muda e o usuário não digitou preço
      if (e.target?.id === 'produtoCusto') {
        if (!this.state.precoEditado) {
          const custo = parseFloat(e.target.value) || 0;
          const preco = this.el.preco;
          const hint  = document.getElementById('produtoPrecoHint');
          if (custo > 0 && preco) {
            const m = this.state.margemAlvo;
            const sugerido = parseFloat((custo * (1 + m / 100)).toFixed(2));
            preco.value = sugerido;
            preco.classList.add('input--sugerido');
            if (hint) hint.textContent = `— sugerido (+${m}%)`;
          } else if (preco) {
            preco.value = '';
            preco.classList.remove('input--sugerido');
            if (hint) hint.textContent = '';
          }
        }
      }
      // Margem alvo configurável
      if (e.target?.id === 'produtoMargemAlvo') {
        const m = parseInt(e.target.value, 10);
        if (m > 0) {
          this.state.margemAlvo = m;
          try { localStorage.setItem('lf_margem_alvo', String(m)); } catch { /* silent */ }
        }
      }

      // Quando o usuário digita no campo de preço, marca como editado manualmente
      if (e.target?.id === 'produtoPreco') {
        this.state.precoEditado = true;
        e.target.classList.remove('input--sugerido');
        const hint = document.getElementById('produtoPrecoHint');
        if (hint) hint.textContent = '';
      }
    });

    document.addEventListener('change', (e) => {
      const filtroIds = ['produtosFiltroCategoria', 'produtosFiltroAlerta',
                         'produtosFiltroOrdem', 'produtosFiltroPromocao', 'produtosFiltroTipo'];
      if (filtroIds.includes(e.target.id)) {
        this.state.filtroCategoria = document.getElementById('produtosFiltroCategoria')?.value || '';
        this.state.filtroAlerta    = document.getElementById('produtosFiltroAlerta')?.value || '';
        this.state.filtroOrdem     = document.getElementById('produtosFiltroOrdem')?.value || '';
        this.state.filtroPromocao  = document.getElementById('produtosFiltroPromocao')?.value || '';
        this.state.filtroTipo      = document.getElementById('produtosFiltroTipo')?.value || '';
        this.state.pagina = 1;
        this.applySearch(document.getElementById('produtosSearchInput')?.value || '');
      }
    });

    // Toggle promoção ativa → mostrar/ocultar campo de preço promocional
    document.addEventListener('change', (e) => {
      if (e.target?.id === 'produtoPromocaoAtiva') {
        const promoRow = document.getElementById('prdPromoPrecoRow');
        if (promoRow) promoRow.style.display = e.target.checked ? 'flex' : 'none';
      }
    });

    // Checkboxes de seleção para impressão em lote
    document.addEventListener('change', (e) => {
      if (e.target.id === 'produtosSelectAll') {
        if (e.target.checked) {
          this.state.filteredItems.forEach((i) => this.state.selectedIds.add(i.id));
        } else {
          this.state.selectedIds.clear();
        }
        this.renderTable();
        this.atualizarBotaoLote();
        return;
      }
      if (e.target.classList.contains('prod-sel-chk')) {
        const id = Number(e.target.dataset.id);
        if (e.target.checked) {
          this.state.selectedIds.add(id);
        } else {
          this.state.selectedIds.delete(id);
          const selAll = document.getElementById('produtosSelectAll');
          if (selAll) selAll.checked = false;
        }
        e.target.closest('tr')?.classList.toggle('row--selected', e.target.checked);
        this.atualizarBotaoLote();
      }
    });

    document.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-prod-action]') || e.target.closest('button');
      if (!t) return;

      const action = t.dataset.prodAction || t.id;

      // ── empty state
      if (action === 'produtosEmptyNewBtn') { this.el.toolbarNew?.click(); return; }

      // ── toolbar
      if (action === 'produtosExportBtn') {
        const lista = this.state.filteredItems.length
          ? this.state.filteredItems
          : this.state.items;
        exportCSV(lista.map((p) => ({
          'Nome':          p.nome || '',
          'Categoria':     p.categoria || '',
          'Preco (R$)':    numCSV(p.preco),
          'Custo (R$)':    numCSV(p.custo),
          'Estoque':       p.estoque ?? 0,
          'Estoque Min':   p.estoque_minimo ?? 0,
          'Codigo Barras': p.codigo_barras || '',
          'NCM':           p.ncm || '',
          'Unidade':       p.unidade || 'UN',
          'Grade':         p.tem_grade ? 'Sim' : 'Nao'
        })), 'produtos');
        return;
      }
      if (action === 'produtosNewBtn')         { this.openCreateModal(); return; }
      if (action === 'produtosLoteBtn')             { this.imprimirLote(); return; }
      if (action === 'produtosMarketplaceBtn')       { await this.abrirMarketplace(); return; }
      if (action === 'produtosTodasEtiquetasBtn')    { this.imprimirTodas(); return; }
      if (action === 'produtosHojeEtiquetasBtn')     { await this.imprimirHoje(); return; }

      // ── modal básico
      if (action === 'produtoCancelBtn' || action === 'produtoModalCloseBtn') {
        this.closeModal(); return;
      }
      if (t.dataset.action === 'etiqueta')      { this.abrirEtiqueta(Number(t.dataset.id)); return; }
      if (t.dataset.action === 'edit')          { this.openEditModal(Number(t.dataset.id)).catch((err) => { console.error('Erro ao abrir modal de edição:', err); showToast('Erro ao abrir produto para edição.', 'error'); }); return; }
      if (t.dataset.action === 'delete')        { await this.handleDelete(Number(t.dataset.id)); return; }
      if (t.dataset.action === 'duplicate')     { this.duplicarProduto(Number(t.dataset.id)); return; }
      if (t.dataset.action === 'adjust-stock')  { this.ajustarEstoqueInline(Number(t.dataset.id)); return; }
      if (action === 'produtosFiltrosToggle') {
        const content = document.getElementById('produtosFiltrosContent');
        const chevron = document.getElementById('produtosFiltrosChevron');
        if (!content) return;
        const collapsed = content.classList.toggle('filtros-collapsed');
        if (chevron) chevron.style.transform = collapsed ? '' : 'rotate(180deg)';
        return;
      }

      // ── paginação
      if (t.dataset.action === 'prod-pagina') {
        if (this.state.loading) return;
        const totalPaginas = Math.ceil(this.state.filteredItems.length / this.ITENS_POR_PAGINA);
        const page = t.dataset.page;
        if (page === 'prev' && this.state.pagina > 1) this.state.pagina--;
        else if (page === 'next' && this.state.pagina < totalPaginas) this.state.pagina++;
        this.renderTable();
        this.renderPagination();
        return;
      }

      // ── tabs
      if (t.dataset.tab) { this.switchTab(t.dataset.tab); return; }

      // ── GRADE
      if (action === 'gradeToggleBtn')  { await this.handleGradeToggle(); return; }
      if (action === 'gradeAddBtn')     { await this.handleGradeAdd(); return; }
      if (t.dataset.action === 'gradeDelete')  { await this.handleGradeDelete(Number(t.dataset.id)); return; }
      if (t.dataset.action === 'gradeEdit')    { this.handleGradeEditInline(Number(t.dataset.id)); return; }
      if (t.dataset.action === 'gradeEditSave')  { await this.handleGradeEditSave(Number(t.dataset.id)); return; }
      if (t.dataset.action === 'gradeEditCancel') { this.renderGrades(); return; }

      // ── KIT
      if (action === 'kitToggleBtn')  { await this.handleKitToggle(); return; }
      if (action === 'kitAddBtn')     { await this.handleKitAdd(); return; }
      if (t.dataset.action === 'kitDelete')    { await this.handleKitDelete(Number(t.dataset.id)); return; }

      // ── IMAGENS
      if (action === 'imagemUploadBtn'){ document.getElementById('imagemFileInput')?.click(); return; }
      if (t.dataset.action === 'imagemPrincipal') { await this.handleImagemPrincipal(Number(t.dataset.id)); return; }
      if (t.dataset.action === 'imagemDelete')    { await this.handleImagemDelete(Number(t.dataset.id)); return; }
    });

    document.addEventListener('change', async (e) => {
      if (e.target?.id === 'imagemFileInput') {
        await this.handleImagemUpload(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.addEventListener('submit', async (e) => {
      if (e.target?.id === 'produtoForm') {
        e.preventDefault();
        await this.handleSubmit();
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target === document.getElementById('produtoModal')) this.closeModal();
    });

    // ── "Mais ações" dropdown
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#produtosActionsBtn');
      const dropdown = document.getElementById('produtosActionsDropdown');
      if (!dropdown) return;
      if (btn) { dropdown.classList.toggle('hidden'); return; }
      if (!e.target.closest('#produtosActionsWrapper')) {
        dropdown.classList.add('hidden');
      }
    });

    // ── Col-picker (colunas configuráveis)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#produtosColsBtn');
      const dropdown = document.getElementById('colPickerDropdown');
      if (!dropdown) return;
      if (btn) { dropdown.classList.toggle('hidden'); return; }
      if (!e.target.closest('#colPickerDropdown') && !e.target.closest('#colPickerWrapper')) {
        dropdown.classList.add('hidden');
      }
    });

    document.addEventListener('change', (e) => {
      if (!e.target.matches('#colPickerDropdown input[data-col]')) return;
      const col = e.target.dataset.col;
      const table = document.querySelector('#produtosSection .data-table');
      if (!table) return;
      table.classList.toggle(`hide-col-${col}`, !e.target.checked);
      this._saveColState();
    });
  },

  _saveColState() {
    const checks = document.querySelectorAll('#colPickerDropdown input[data-col]');
    const state = {};
    checks.forEach((chk) => { state[chk.dataset.col] = chk.checked; });
    try { localStorage.setItem('lf_cols_produtos', JSON.stringify(state)); } catch (_) {}
  },

  _restoreColState() {
    const table = document.querySelector('#produtosSection .data-table');
    if (!table) return;
    let saved;
    try { saved = JSON.parse(localStorage.getItem('lf_cols_produtos') || 'null'); } catch { saved = null; }
    const checks = document.querySelectorAll('#colPickerDropdown input[data-col]');
    checks.forEach((chk) => {
      const col = chk.dataset.col;
      const visible = saved ? (saved[col] !== false) : true;
      chk.checked = visible;
      table.classList.toggle(`hide-col-${col}`, !visible);
    });
  },

  // ── Load & Render ──────────────────────────────────────────────────────────

  async load() {
    this.resolveEmpresa();
    this.cacheElements();
    this._restoreColState();
    if (!this.state.empresa) { this.showModuleMessage('Empresa não identificada.', 'error'); return; }
    this.setLoading(true);
    this.showModuleMessage('Carregando...', 'info');
    try {
      const items = await api.getProdutos();
      this.state.items = Array.isArray(items) ? items : [];
      this.state.selectedIds.clear();
      this.atualizarBotaoLote();
      this.renderStats();
      this.popularCategorias();
      // Restaura os valores visuais dos filtros e reaplica sobre a lista recém-carregada,
      // preservando busca/categoria/alerta entre navegações (ex: ao voltar de outra tela).
      if (this.el.toolbarSearch) this.el.toolbarSearch.value = this.state.searchTerm || '';
      const selCategoria = document.getElementById('produtosFiltroCategoria');
      if (selCategoria) selCategoria.value = this.state.filtroCategoria || '';
      const selAlerta = document.getElementById('produtosFiltroAlerta');
      if (selAlerta) selAlerta.value = this.state.filtroAlerta || '';
      const selOrdem = document.getElementById('produtosFiltroOrdem');
      if (selOrdem) selOrdem.value = this.state.filtroOrdem || '';
      const selPromo = document.getElementById('produtosFiltroPromocao');
      if (selPromo) selPromo.value = this.state.filtroPromocao || '';
      const selTipo = document.getElementById('produtosFiltroTipo');
      if (selTipo) selTipo.value = this.state.filtroTipo || '';
      this.applySearch(this.state.searchTerm || '');
      this.toggleEmptyState();
      this.showModuleMessage('', 'info');
    } catch (err) {
      this.state.items = []; this.state.filteredItems = [];
      this.renderStats(); this.renderTable();
      this.toggleEmptyState('Não foi possível carregar os produtos.');
      this.showModuleMessage(buildFriendlyError(err), 'error');
    } finally { this.setLoading(false); }
  },

  renderStats() {
    const total = this.state.items.length;
    const stock = this.state.items.reduce((s, i) => s + Number(i.estoque || 0), 0);
    const alert = this.state.items.filter((i) => Boolean(i.alerta_estoque)).length;
    if (this.el.statsTotal) this.el.statsTotal.textContent = total;
    if (this.el.statsStock) this.el.statsStock.textContent = stock;
    if (this.el.statsAlert) this.el.statsAlert.textContent = alert;
  },

  _getPagedItems() {
    const start = (this.state.pagina - 1) * this.ITENS_POR_PAGINA;
    return this.state.filteredItems.slice(start, start + this.ITENS_POR_PAGINA);
  },

  renderPagination() {
    const el = document.getElementById('produtosPagination');
    if (!el) return;
    const total = this.state.filteredItems.length;
    const totalPaginas = Math.max(1, Math.ceil(total / this.ITENS_POR_PAGINA));
    if (this.state.pagina > totalPaginas) this.state.pagina = totalPaginas;
    if (totalPaginas <= 1) { el.innerHTML = ''; return; }
    const p = this.state.pagina;
    const inicio = (p - 1) * this.ITENS_POR_PAGINA + 1;
    const fim = Math.min(p * this.ITENS_POR_PAGINA, total);
    el.innerHTML = `
      <div class="lf-pagination">
        <button class="lf-pagination__btn" type="button" data-action="prod-pagina" data-page="prev"
          ${p <= 1 ? 'disabled' : ''} aria-label="Página anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="lf-pagination__info">Página ${p} de ${totalPaginas}
          <small>(${inicio}–${fim} de ${total} produtos)</small>
        </span>
        <button class="lf-pagination__btn" type="button" data-action="prod-pagina" data-page="next"
          ${p >= totalPaginas ? 'disabled' : ''} aria-label="Próxima página">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>`;
  },

  renderTable() {
    if (!this.el.tableBody) return;
    if (!this.state.filteredItems.length) { this.el.tableBody.innerHTML = ''; return; }
    const pageItems = this._getPagedItems();
    const q = this.state.searchTerm || '';
    this.el.tableBody.innerHTML = pageItems.map((item) => {
      const alerta = Boolean(item.alerta_estoque);
      const statusClass = alerta ? 'badge badge--danger' : 'badge badge--success';

      const badges = [
        item.tem_grade ? '<span class="badge badge--warning" style="font-size:11px;padding:3px 8px">Grade</span>' : '',
        item.e_kit     ? '<span class="badge" style="font-size:11px;padding:3px 8px;background:var(--primary-soft);color:var(--primary)">Kit</span>' : ''
      ].filter(Boolean).join(' ');

      const selecionado = this.state.selectedIds.has(item.id);
      return `
        <tr class="${selecionado ? 'row--selected' : ''}${alerta ? ' row--alert' : ''}">
          <td style="padding-right:0">
            <input type="checkbox" class="prod-sel-chk" data-id="${item.id}"
              ${selecionado ? 'checked' : ''}
              style="width:16px;height:16px;cursor:pointer" />
          </td>
          <td>
            <div class="table-primary">
              <strong>${this._highlight(item.nome || '-', q)}</strong>
              ${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}
            </div>
          </td>
          <td>${escapeHtml(item.categoria || '-')}</td>
          <td style="font-size:12px;color:var(--text-muted)">${escapeHtml(item.codigo_barras || '-')}</td>
          <td>${item.promocao_ativa && Number(item.preco_promocional) > 0
            ? `<div class="price-stack"><small class="price-old">${toCurrency(item.preco)}</small><strong class="price-promo">${toCurrency(item.preco_promocional)}</strong></div>`
            : toCurrency(item.preco)}</td>
          <td>${toCurrency(item.custo_medio || item.custo)}</td>
          <td class="${Number(item.lucro_unitario || 0) >= 0 ? 'text-success' : 'text-danger'}">${toCurrency(item.lucro_unitario || 0)}</td>
          <td><span class="badge ${Number(item.margem_lucro||0)>=30?'badge--success':Number(item.margem_lucro||0)>=10?'badge--warning':'badge--danger'}">${Number(item.margem_lucro||0).toFixed(1)}%</span></td>
          <td>
            <span>${Number(item.estoque || 0)}</span>
            <button type="button" class="btn-inline" data-action="adjust-stock" data-id="${item.id}" title="Ajustar estoque" style="padding:2px 6px;margin-left:4px;font-size:11px">±</button>
          </td>
          <td>${Number(item.estoque_minimo || 0)}</td>
          <td><span class="${statusClass}">${alerta ? 'Alerta' : 'Ok'}</span></td>
          <td class="text-right">
            <div class="table-actions">
              <button type="button" class="btn-inline" data-action="etiqueta" data-id="${item.id}">
                <i class="fa-solid fa-tag"></i> Etiqueta
              </button>
              <button type="button" class="btn-inline" data-action="duplicate" data-id="${item.id}" title="Duplicar produto">
                <i class="fa-solid fa-copy"></i>
              </button>
              <button type="button" class="btn-inline" data-action="edit" data-id="${item.id}">Editar</button>
              <button type="button" class="btn-inline btn-inline--danger" data-action="delete" data-id="${item.id}">Excluir</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  },

  toggleEmptyState(msg = 'Nenhum produto encontrado.') {
    if (!this.el.emptyState) return;
    if (this.state.filteredItems.length) { this.el.emptyState.classList.add('hidden'); return; }
    const strong = this.el.emptyState.querySelector('strong');
    if (strong) strong.textContent = msg;
    this.el.emptyState.classList.remove('hidden');
  },

  applySearch(term) {
    this.state.searchTerm = term || '';
    const q      = String(term||'').trim().toLowerCase();
    const cat    = this.state.filtroCategoria || '';
    const alrt   = this.state.filtroAlerta    || '';
    const promo  = this.state.filtroPromocao  || '';
    const tipo   = this.state.filtroTipo      || '';

    let result = this.state.items.filter((i) => {
      if (q && ![i.nome, i.categoria, i.codigo_barras].filter(Boolean).some((f) => String(f).toLowerCase().includes(q))) return false;
      if (cat && (i.categoria || '') !== cat) return false;
      if (alrt === 'alerta' && !i.alerta_estoque)  return false;
      if (alrt === 'ok'     && Boolean(i.alerta_estoque))  return false;
      if (promo === 'sim'   && !(i.promocao_ativa && Number(i.preco_promocional) > 0)) return false;
      if (promo === 'nao'   && (i.promocao_ativa && Number(i.preco_promocional) > 0))  return false;
      if (tipo === 'grade'  && !i.tem_grade)  return false;
      if (tipo === 'kit'    && !i.e_kit)      return false;
      if (tipo === 'normal' && (i.tem_grade || i.e_kit)) return false;
      return true;
    });

    // ordenação
    const ordem = this.state.filtroOrdem || '';
    if (ordem) {
      result = [...result].sort((a, b) => {
        if (ordem === 'nome_az')   return (a.nome||'').localeCompare(b.nome||'');
        if (ordem === 'nome_za')   return (b.nome||'').localeCompare(a.nome||'');
        if (ordem === 'preco_a')   return Number(a.preco||0) - Number(b.preco||0);
        if (ordem === 'preco_d')   return Number(b.preco||0) - Number(a.preco||0);
        if (ordem === 'estoque_a') return Number(a.estoque||0) - Number(b.estoque||0);
        if (ordem === 'estoque_d') return Number(b.estoque||0) - Number(a.estoque||0);
        if (ordem === 'margem_a')  return Number(a.margem_lucro||0) - Number(b.margem_lucro||0);
        if (ordem === 'margem_d')  return Number(b.margem_lucro||0) - Number(a.margem_lucro||0);
        return 0;
      });
    }

    this.state.filteredItems = result;
    this.renderTable();
    this.renderPagination();
    this.toggleEmptyState();
  },

  popularCategorias() {
    const sel = document.getElementById('produtosFiltroCategoria');
    if (!sel) return;
    const cats = [...new Set(this.state.items.map((i) => i.categoria).filter(Boolean))].sort();
    const prev = sel.value;
    sel.innerHTML = '<option value="">Todas as categorias</option>' +
      cats.map((c) => `<option value="${escapeHtml(c)}" ${prev === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    // Preenche datalist para autocomplete no formulário
    const dl = document.getElementById('produtosCatList');
    if (dl) dl.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  },

  // ── Modal ──────────────────────────────────────────────────────────────────

  _injectPrdStyles() {
    if (document.getElementById('prd-nc-styles')) return;
    const s = document.createElement('style');
    s.id = 'prd-nc-styles';
    s.textContent = `
      /* ── Modal container ─────────────────────────────────────── */
      .prd-nc-card {
        width: min(96vw, 780px) !important;
        max-height: 92vh;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        border-radius: 24px !important;
        box-shadow: 0 24px 80px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08) !important;
      }
      /* Header */
      .prd-nc-card .modal-card__header {
        padding: 22px 26px 18px !important;
        border-bottom: 1px solid var(--border) !important;
        flex-shrink: 0;
      }
      .prd-nc-card .modal-card__header h3 {
        font-size: 1.1rem !important; font-weight: 900 !important; margin: 0 0 3px !important;
      }
      .prd-nc-card .modal-card__header p {
        font-size: 0.82rem !important; color: var(--text-muted) !important; margin: 0 !important;
      }
      /* Tabs */
      .prd-nc-card .prod-tabs { flex-shrink: 0; border-bottom: 1px solid var(--border); }
      /* Tab panels e form — estrutura flex sem overflow externo */
      .prd-nc-card .prod-tab-panel { display: none; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }
      .prd-nc-card .prod-tab-panel.active { display: flex; }
      .prd-nc-card form { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }
      /* Body: grid 2 colunas — Identificação à esq, Preços+Estoque à dir — sem overflow */
      .prd-nc-body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: start;
        gap: 0;
        padding: 20px 24px;
        column-gap: 20px;
        overflow: visible;
      }
      /* Identificação (1ª seção) — coluna esquerda, 2 linhas */
      .prd-nc-body > .prd-nc-section:nth-child(1) { grid-column: 1; grid-row: 1 / span 2; }
      /* Preços (2ª seção) — coluna direita linha 1 */
      .prd-nc-body > .prd-nc-section:nth-child(2) { grid-column: 2; grid-row: 1; }
      /* Estoque (3ª seção) — coluna direita linha 2 */
      .prd-nc-body > .prd-nc-section:nth-child(3) { grid-column: 2; grid-row: 2; margin-top: 16px; }
      /* Footer fixo */
      .prd-nc-card .modal-card__footer { flex-shrink: 0; padding: 16px 24px !important; border-top: 1px solid var(--border) !important; }

      /* ── Seções ───────────────────────────────────────────────── */
      .prd-nc-section { padding: 0; }
      .prd-nc-section-title {
        font-size: 0.65rem; font-weight: 900; color: var(--text-muted);
        text-transform: uppercase; letter-spacing: .1em; margin: 0 0 10px;
      }
      .prd-nc-card-group {
        border: 1px solid var(--border); border-radius: 16px;
        overflow: hidden; background: var(--surface);
        box-shadow: 0 1px 4px rgba(0,0,0,.05);
      }

      /* ── Células ──────────────────────────────────────────────── */
      .prd-nc-cell {
        display: flex; align-items: center; gap: 13px;
        padding: 13px 16px; border-bottom: 1px solid var(--border);
        background: var(--surface); transition: background .12s;
      }
      .prd-nc-cell:last-child { border-bottom: none; }
      .prd-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
      .prd-nc-cells-2col { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border); }
      .prd-nc-cells-2col:last-child { border-bottom: none; }
      .prd-nc-cells-2col .prd-nc-cell { border-bottom: none; }
      .prd-nc-cells-2col .prd-nc-cell:first-child { border-right: 1px solid var(--border); }
      .prd-nc-cells-3col { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid var(--border); }
      .prd-nc-cells-3col:last-child { border-bottom: none; }
      .prd-nc-cells-3col .prd-nc-cell { border-bottom: none; }
      .prd-nc-cells-3col .prd-nc-cell:not(:last-child) { border-right: 1px solid var(--border); }

      /* ── Ícones ───────────────────────────────────────────────── */
      .prd-nc-cell-ico {
        width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 0.85rem; background: var(--surface-2); color: var(--text-muted);
      }
      .prd-nc-cell-ico--green  { background: rgba(22,163,74,.12);  color: #16a34a; }
      .prd-nc-cell-ico--blue   { background: rgba(37,99,235,.12);  color: #2563eb; }
      .prd-nc-cell-ico--red    { background: rgba(220,38,38,.12);  color: #dc2626; }
      .prd-nc-cell-ico--purple { background: rgba(124,58,237,.12); color: #7c3aed; }
      .prd-nc-cell-ico--orange { background: rgba(234,88,12,.12);  color: #ea580c; }
      .prd-nc-cell-ico--yellow { background: rgba(202,138,4,.12);  color: #ca8a04; }

      /* ── Conteúdo ─────────────────────────────────────────────── */
      .prd-nc-cell-content { flex: 1; min-width: 0; }
      .prd-nc-lbl {
        display: block; font-size: 0.63rem; font-weight: 900;
        color: var(--text-muted); text-transform: uppercase;
        letter-spacing: .07em; margin-bottom: 2px;
      }
      .prd-nc-req { color: #dc2626; }
      .prd-nc-cell-input {
        border: none !important; outline: none !important;
        background: transparent !important; padding: 0 !important;
        font-size: 0.93rem; font-weight: 600; color: var(--text);
        width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none;
      }
      select.prd-nc-cell-input {
        cursor: pointer;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
        background-repeat: no-repeat !important; background-position: right 0 center !important; padding-right: 16px !important;
      }
      .prd-nc-valor { font-size: 1.08rem !important; font-weight: 800 !important; letter-spacing: -.02em; }

      /* ── Toggle promoção ──────────────────────────────────────── */
      .prd-nc-promo-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 13px 16px; border-bottom: 1px solid var(--border);
        font-size: 0.9rem; font-weight: 600;
      }
      .prd-nc-toggle { position: relative; width: 42px; height: 24px; }
      .prd-nc-toggle input { opacity: 0; width: 0; height: 0; }
      .prd-nc-toggle-slider {
        position: absolute; inset: 0; background: var(--border);
        border-radius: 24px; transition: .2s; cursor: pointer;
      }
      .prd-nc-toggle-slider::before {
        content: ''; position: absolute; left: 3px; bottom: 3px;
        width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: .2s;
      }
      .prd-nc-toggle input:checked + .prd-nc-toggle-slider { background: #16a34a; }
      .prd-nc-toggle input:checked + .prd-nc-toggle-slider::before { transform: translateX(18px); }

      /* ── Responsivo ───────────────────────────────────────────── */
      @media (max-width: 680px) {
        .prd-nc-card { max-height: 95vh !important; border-radius: 20px !important; }
        .prd-nc-body {
          grid-template-columns: 1fr !important;
          overflow-y: auto !important;
          scrollbar-width: thin;
        }
        .prd-nc-body > .prd-nc-section:nth-child(1),
        .prd-nc-body > .prd-nc-section:nth-child(2),
        .prd-nc-body > .prd-nc-section:nth-child(3) {
          grid-column: 1 !important; grid-row: auto !important; margin-top: 0 !important;
        }
        .prd-nc-body > .prd-nc-section + .prd-nc-section { margin-top: 16px; }
        .prd-nc-cells-2col, .prd-nc-cells-3col { grid-template-columns: 1fr; }
        .prd-nc-cells-2col .prd-nc-cell:first-child,
        .prd-nc-cells-3col .prd-nc-cell:not(:last-child) { border-right: none; border-bottom: 1px solid var(--border); }
      }
    `;
    document.head.appendChild(s);
  },

  renderInitialState() {
    const container = document.getElementById('produtosContainer');
    if (!container) return;
    this._injectPrdStyles();
    container.innerHTML = `
      <section class="module-card" id="produtosSection">
        <div class="module-toolbar">
          <div class="module-toolbar__search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="produtosSearchInput" placeholder="Buscar por nome, categoria ou código" />
          </div>
          <div>
            <button type="button" class="btn btn-light btn-sm" id="produtosFiltrosToggle" style="display:none" aria-expanded="false">
              <i class="fa-solid fa-sliders"></i> Filtros
              <i id="produtosFiltrosChevron" class="fa-solid fa-chevron-down" style="font-size:10px;margin-left:2px"></i>
            </button>
            <div id="produtosFiltrosContent" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <div class="prod-filter-box">
                <select id="produtosFiltroCategoria" style="min-width:150px">
                  <option value="">Todas as categorias</option>
                </select>
              </div>
              <div class="prod-filter-box">
                <select id="produtosFiltroAlerta">
                  <option value="">Todos os status</option>
                  <option value="alerta">Em alerta</option>
                  <option value="ok">Estoque ok</option>
                </select>
              </div>
              <div class="prod-filter-box">
                <select id="produtosFiltroPromocao">
                  <option value="">Promoção: Todas</option>
                  <option value="sim">Em promoção</option>
                  <option value="nao">Sem promoção</option>
                </select>
              </div>
              <div class="prod-filter-box">
                <select id="produtosFiltroTipo">
                  <option value="">Tipo: Todos</option>
                  <option value="normal">Normal</option>
                  <option value="grade">Com grade</option>
                  <option value="kit">Kit</option>
                </select>
              </div>
              <div class="prod-filter-box">
                <select id="produtosFiltroOrdem" style="min-width:155px">
                  <option value="">Ordenar: Padrão</option>
                  <option value="nome_az">Nome A→Z</option>
                  <option value="nome_za">Nome Z→A</option>
                  <option value="preco_a">Preço ↑</option>
                  <option value="preco_d">Preço ↓</option>
                  <option value="estoque_a">Estoque ↑</option>
                  <option value="estoque_d">Estoque ↓</option>
                  <option value="margem_a">Margem ↑</option>
                  <option value="margem_d">Margem ↓</option>
                </select>
              </div>
            </div>
          </div>
          <div class="module-toolbar__stats">
            <div class="mini-stat"><span>Total</span><strong id="produtosStatsTotal">0</strong></div>
            <div class="mini-stat"><span>Estoque</span><strong id="produtosStatsStock">0</strong></div>
            <div class="mini-stat"><span>Em alerta</span><strong id="produtosStatsAlert">0</strong></div>
          </div>
          <div class="module-card__actions">
            <div class="actions-menu-wrapper" id="produtosActionsWrapper">
              <button type="button" class="btn btn-light" id="produtosActionsBtn">
                <i class="fa-solid fa-ellipsis"></i> Mais ações <i class="fa-solid fa-chevron-down" style="font-size:10px;margin-left:2px"></i>
              </button>
              <div class="actions-menu-dropdown hidden" id="produtosActionsDropdown">
                <button type="button" class="actions-menu-item" id="produtosMarketplaceBtn">
                  <i class="fa-solid fa-store"></i> Marketplace
                </button>
                <div class="actions-menu-divider"></div>
                <button type="button" class="actions-menu-item" id="produtosTodasEtiquetasBtn">
                  <i class="fa-solid fa-print"></i> Todas as Etiquetas
                </button>
                <button type="button" class="actions-menu-item" id="produtosHojeEtiquetasBtn">
                  <i class="fa-solid fa-calendar-day"></i> Etiquetas de Hoje
                </button>
                <div class="actions-menu-divider"></div>
                <button type="button" class="actions-menu-item" id="produtosExportBtn">
                  <i class="fa-solid fa-file-csv"></i> Exportar CSV
                </button>
              </div>
            </div>
            <button type="button" class="btn btn-light" id="produtosLoteBtn" style="display:none">
              <i class="fa-solid fa-tags"></i>
              Etiquetas <span id="produtosLoteBadge" class="badge badge--primary" style="margin-left:4px;font-size:.75rem">0</span>
            </button>
            <div class="col-picker-wrapper" id="colPickerWrapper">
              <button type="button" class="btn btn-light" id="produtosColsBtn" title="Configurar colunas visíveis">
                <i class="fa-solid fa-table-columns"></i>
              </button>
              <div class="col-picker-dropdown hidden" id="colPickerDropdown">
                <div class="col-picker-dropdown__title">Colunas visíveis</div>
                <label class="col-picker-item"><input type="checkbox" data-col="2" /> Produto</label>
                <label class="col-picker-item"><input type="checkbox" data-col="3" /> Categoria</label>
                <label class="col-picker-item"><input type="checkbox" data-col="4" /> Código</label>
                <label class="col-picker-item"><input type="checkbox" data-col="5" /> Preço</label>
                <label class="col-picker-item"><input type="checkbox" data-col="6" /> Custo Médio</label>
                <label class="col-picker-item"><input type="checkbox" data-col="7" /> Lucro</label>
                <label class="col-picker-item"><input type="checkbox" data-col="8" /> Margem</label>
                <label class="col-picker-item"><input type="checkbox" data-col="9" /> Estoque</label>
                <label class="col-picker-item"><input type="checkbox" data-col="10" /> Mínimo</label>
                <label class="col-picker-item"><input type="checkbox" data-col="11" /> Status</label>
              </div>
            </div>
            <button type="button" class="btn btn-primary" id="produtosNewBtn"><i class="fa-solid fa-plus"></i> Novo produto</button>
          </div>
        </div>
        <div class="module-feedback" id="produtosFeedback"></div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:36px;padding-right:0">
                  <input type="checkbox" id="produtosSelectAll" title="Selecionar todos"
                    style="width:16px;height:16px;cursor:pointer" />
                </th>
                <th>Produto</th><th>Categoria</th><th>Código</th>
                <th>Preço</th><th>Custo Médio</th><th>Lucro</th><th>Margem</th>
                <th>Estoque</th><th>Mínimo</th><th>Status</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="produtosTableBody"></tbody>
          </table>
        </div>
        <div id="produtosPagination"></div>
        <div class="empty-state hidden" id="produtosEmptyState">
          <i class="fa-solid fa-box-open"></i>
          <strong>Nenhum produto encontrado</strong>
          <p>Tente ajustar os filtros ou cadastre um novo produto.</p>
          <button class="btn btn-primary" id="produtosEmptyNewBtn">
            <i class="fa-solid fa-plus"></i> Novo produto
          </button>
        </div>
      </section>

      <!-- MODAL PRODUTO -->
      <div class="modal-overlay hidden" id="produtoModal">
        <div class="modal-card modal-card--xl prd-nc-card">
          <div class="modal-card__header">
            <div>
              <h3 id="produtoModalTitle">Novo produto</h3>
              <p id="produtoModalSub">Preencha os dados básicos do produto.</p>
            </div>
            <button type="button" class="icon-button" id="produtoModalCloseBtn" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Tabs (visíveis só ao editar) -->
          <div class="prod-tabs hidden" id="produtoTabs">
            <button class="prod-tab active" data-tab="dados">Dados</button>
            <button class="prod-tab" data-tab="imagens">
              <i class="fa-solid fa-image" style="font-size:12px"></i> Imagens
              <span class="prod-tab-badge" id="tabBadgeImagens">0</span>
            </button>
            <button class="prod-tab" data-tab="grade">
              <i class="fa-solid fa-layer-group" style="font-size:12px"></i> Grade
              <span class="prod-tab-badge" id="tabBadgeGrade">0</span>
            </button>
            <button class="prod-tab" data-tab="kit">
              <i class="fa-solid fa-cubes" style="font-size:12px"></i> Kit
              <span class="prod-tab-badge" id="tabBadgeKit">0</span>
            </button>
          </div>

          <!-- TAB: DADOS -->
          <div class="prod-tab-panel active" id="produtoTabDados">
            <form id="produtoForm">
              <input type="hidden" id="produtoId" />
              <div class="prd-nc-body">

                <!-- Seção: Identificação -->
                <div class="prd-nc-section">
                  <p class="prd-nc-section-title">Identificação</p>
                  <div class="prd-nc-card-group">
                    <!-- Nome -->
                    <div class="prd-nc-cell">
                      <span class="prd-nc-cell-ico"><i class="fa-solid fa-box"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="produtoNome">Nome <span class="prd-nc-req">*</span></label>
                        <input type="text" id="produtoNome" class="prd-nc-cell-input" placeholder="Nome do produto" autocomplete="off" required />
                      </div>
                    </div>
                    <!-- Categoria + Código de barras -->
                    <div class="prd-nc-cells-2col">
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico"><i class="fa-solid fa-tag"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoCategoria">Categoria</label>
                          <input type="text" id="produtoCategoria" class="prd-nc-cell-input" list="produtosCatList" autocomplete="off" placeholder="Ex: Roupas" />
                          <datalist id="produtosCatList"></datalist>
                        </div>
                      </div>
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico"><i class="fa-solid fa-barcode"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoCodigoBarras">Código de barras</label>
                          <input type="text" id="produtoCodigoBarras" class="prd-nc-cell-input" placeholder="Gerado automaticamente" />
                        </div>
                      </div>
                    </div>
                    <!-- NCM + Unidade -->
                    <div class="prd-nc-cells-2col">
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico"><i class="fa-solid fa-file-invoice"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoNcm">NCM</label>
                          <input type="text" id="produtoNcm" class="prd-nc-cell-input" placeholder="Ex: 8517.12.31" maxlength="15" />
                        </div>
                      </div>
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico"><i class="fa-solid fa-ruler"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoUnidade">Unidade</label>
                          <select id="produtoUnidade" class="prd-nc-cell-input">
                            <option value="UN">UN — Unidade</option>
                            <option value="PC">PC — Peça</option>
                            <option value="KG">KG — Quilograma</option>
                            <option value="G">G — Grama</option>
                            <option value="L">L — Litro</option>
                            <option value="ML">ML — Mililitro</option>
                            <option value="M">M — Metro</option>
                            <option value="M2">M² — Metro quadrado</option>
                            <option value="CX">CX — Caixa</option>
                            <option value="SC">SC — Saco</option>
                            <option value="PCT">PCT — Pacote</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Seção: Preços -->
                <div class="prd-nc-section">
                  <p class="prd-nc-section-title">Preços</p>
                  <div class="prd-nc-card-group">
                    <!-- Custo + Margem% + Preço de Venda -->
                    <div class="prd-nc-cells-3col">
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico prd-nc-cell-ico--green"><i class="fa-solid fa-brazilian-real-sign"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoCusto">Custo</label>
                          <input type="number" id="produtoCusto" class="prd-nc-cell-input prd-nc-valor" min="0" step="0.01" placeholder="0.00" />
                        </div>
                      </div>
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico prd-nc-cell-ico--orange"><i class="fa-solid fa-percent"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoMargemAlvo">Margem %</label>
                          <input type="number" id="produtoMargemAlvo" class="prd-nc-cell-input" min="1" max="999" step="1" placeholder="30" />
                        </div>
                      </div>
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico prd-nc-cell-ico--green"><i class="fa-solid fa-tag"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoPreco">Preço de venda <span class="prd-nc-req">*</span> <small id="produtoPrecoHint" style="font-weight:400;color:var(--text-muted);font-size:10px;text-transform:none;letter-spacing:0"></small></label>
                          <input type="number" id="produtoPreco" class="prd-nc-cell-input prd-nc-valor" min="0" step="0.01" required placeholder="0.00" />
                        </div>
                      </div>
                    </div>
                    <!-- Toggle promoção ativa -->
                    <div class="prd-nc-promo-row">
                      <span>Promoção ativa</span>
                      <label class="prd-nc-toggle">
                        <input type="checkbox" id="produtoPromocaoAtiva" />
                        <span class="prd-nc-toggle-slider"></span>
                      </label>
                    </div>
                    <!-- Preço promocional (visível quando toggle ativo) -->
                    <div class="prd-nc-cell" id="prdPromoPrecoRow" style="display:none">
                      <span class="prd-nc-cell-ico prd-nc-cell-ico--red"><i class="fa-solid fa-percent"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="produtoPrecoPromocional">Preço promocional</label>
                        <input type="number" id="produtoPrecoPromocional" class="prd-nc-cell-input prd-nc-valor" min="0" step="0.01" placeholder="0.00" />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Seção: Estoque -->
                <div class="prd-nc-section">
                  <p class="prd-nc-section-title">Estoque</p>
                  <div class="prd-nc-card-group">
                    <div class="prd-nc-cells-2col">
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico prd-nc-cell-ico--blue"><i class="fa-solid fa-warehouse"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoEstoque">Estoque inicial</label>
                          <input type="number" id="produtoEstoque" class="prd-nc-cell-input" min="0" step="1" placeholder="0" />
                        </div>
                      </div>
                      <div class="prd-nc-cell">
                        <span class="prd-nc-cell-ico prd-nc-cell-ico--orange"><i class="fa-solid fa-triangle-exclamation"></i></span>
                        <div class="prd-nc-cell-content">
                          <label class="prd-nc-lbl" for="produtoEstoqueMinimo">Estoque mínimo</label>
                          <input type="number" id="produtoEstoqueMinimo" class="prd-nc-cell-input" min="0" step="1" placeholder="0" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              <div class="form-feedback" id="produtoFormFeedback" style="margin:0 20px"></div>
              <div class="modal-card__footer" style="padding:16px 20px">
                <button type="button" class="btn btn-light" id="produtoCancelBtn">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="produtoSaveBtn">Salvar produto</button>
              </div>
            </form>
          </div>

          <!-- TAB: IMAGENS -->
          <div class="prod-tab-panel hidden" id="produtoTabImagens">
            <div class="imagem-upload-area" id="imagemUploadBtn">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:22px;margin-bottom:6px;display:block"></i>
              Clique para enviar uma imagem (JPG, PNG, WebP — máx. 5MB)
            </div>
            <input type="file" id="imagemFileInput" accept="image/jpeg,image/png,image/webp" class="hidden" />
            <div class="imagem-grid" id="imagemGrid"></div>
            <div class="section-empty hidden" id="imagemEmpty">Nenhuma imagem cadastrada ainda.</div>
          </div>

          <!-- TAB: GRADE -->
          <div class="prod-tab-panel hidden" id="produtoTabGrade">
            <div class="prd-nc-section" style="padding-top:20px">
              <div class="prd-nc-card-group">
                <div class="prd-nc-promo-row">
                  <div>
                    <div style="font-size:0.9rem;font-weight:700">Variações (Grade)</div>
                    <div style="font-size:0.78rem;font-weight:400;color:var(--text-muted)">Ativa tamanho, cor e estoque por variação</div>
                  </div>
                  <label class="prd-nc-toggle">
                    <input type="checkbox" id="gradeToggleInput" />
                    <span class="prd-nc-toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
            <div id="gradeContent" class="hidden">
              <div class="prd-nc-section">
                <p class="prd-nc-section-title">Variações cadastradas</p>
                <div class="grade-grid" id="gradeGrid"></div>
                <div class="section-empty hidden" id="gradeEmpty">Nenhuma variação. Adicione abaixo.</div>
              </div>
              <div class="prd-nc-section">
                <p class="prd-nc-section-title">Adicionar variação</p>
                <div class="prd-nc-card-group">
                  <div class="prd-nc-cells-2col">
                    <div class="prd-nc-cell">
                      <span class="prd-nc-cell-ico prd-nc-cell-ico--purple"><i class="fa-solid fa-palette"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="gradeAtrib1">Atrib. 1 (Tamanho/Cor) <span class="prd-nc-req">*</span></label>
                        <input type="text" id="gradeAtrib1" class="prd-nc-cell-input" placeholder="Ex: M, 38, Azul..." />
                      </div>
                    </div>
                    <div class="prd-nc-cell">
                      <span class="prd-nc-cell-ico"><i class="fa-solid fa-layer-group"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="gradeAtrib2">Atrib. 2 (opcional)</label>
                        <input type="text" id="gradeAtrib2" class="prd-nc-cell-input" placeholder="Opcional" />
                      </div>
                    </div>
                  </div>
                  <div class="prd-nc-cells-2col">
                    <div class="prd-nc-cell">
                      <span class="prd-nc-cell-ico prd-nc-cell-ico--blue"><i class="fa-solid fa-warehouse"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="gradeEstoque">Estoque</label>
                        <input type="number" id="gradeEstoque" class="prd-nc-cell-input" min="0" value="0" placeholder="0" />
                      </div>
                    </div>
                    <div class="prd-nc-cell">
                      <span class="prd-nc-cell-ico prd-nc-cell-ico--green"><i class="fa-solid fa-brazilian-real-sign"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="gradePreco">Preço (R$)</label>
                        <input type="number" id="gradePreco" class="prd-nc-cell-input" min="0" step="0.01" placeholder="Padrão" />
                      </div>
                    </div>
                  </div>
                </div>
                <div style="padding:12px 0 4px;display:flex;justify-content:flex-end">
                  <button type="button" id="gradeAddBtn" class="btn btn-primary">
                    <i class="fa-solid fa-plus"></i> Adicionar variação
                  </button>
                </div>
              </div>
            </div>
            <div class="section-empty" id="gradeDisabledMsg" style="border-style:solid;background:var(--surface-2)">
              Ative o modo grade para gerenciar variações deste produto.
            </div>
          </div>

          <!-- TAB: KIT -->
          <div class="prod-tab-panel hidden" id="produtoTabKit">
            <div class="prd-nc-section" style="padding-top:20px">
              <div class="prd-nc-card-group">
                <div class="prd-nc-promo-row">
                  <div>
                    <div style="font-size:0.9rem;font-weight:700">Produto Composto (Kit)</div>
                    <div style="font-size:0.78rem;font-weight:400;color:var(--text-muted)">Ao vender, debita automaticamente cada componente</div>
                  </div>
                  <label class="prd-nc-toggle">
                    <input type="checkbox" id="kitToggleInput" />
                    <span class="prd-nc-toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
            <div id="kitContent" class="hidden">
              <div class="prd-nc-section">
                <div class="estoque-kit-info" id="kitEstoqueInfo" style="margin-bottom:8px">
                  <i class="fa-solid fa-boxes-stacked"></i>
                  <span id="kitEstoqueVal">0</span> kits disponíveis
                </div>
                <p class="prd-nc-section-title">Componentes do kit</p>
                <div id="kitList"></div>
                <div class="section-empty hidden" id="kitEmpty">Nenhum componente. Adicione abaixo.</div>
              </div>
              <div class="prd-nc-section">
                <p class="prd-nc-section-title">Adicionar componente</p>
                <div class="prd-nc-card-group">
                  <div class="prd-nc-cells-2col">
                    <div class="prd-nc-cell">
                      <span class="prd-nc-cell-ico prd-nc-cell-ico--blue"><i class="fa-solid fa-cube"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="kitProdutoSelect">Produto componente <span class="prd-nc-req">*</span></label>
                        <select id="kitProdutoSelect" class="prd-nc-cell-input">
                          <option value="">Selecione o produto...</option>
                        </select>
                      </div>
                    </div>
                    <div class="prd-nc-cell">
                      <span class="prd-nc-cell-ico prd-nc-cell-ico--orange"><i class="fa-solid fa-hashtag"></i></span>
                      <div class="prd-nc-cell-content">
                        <label class="prd-nc-lbl" for="kitQtd">Quantidade <span class="prd-nc-req">*</span></label>
                        <input type="number" id="kitQtd" class="prd-nc-cell-input" min="0.001" step="0.001" value="1" />
                      </div>
                    </div>
                  </div>
                </div>
                <div style="padding:12px 0 4px;display:flex;justify-content:flex-end">
                  <button type="button" id="kitAddBtn" class="btn btn-primary">
                    <i class="fa-solid fa-plus"></i> Adicionar componente
                  </button>
                </div>
              </div>
            </div>
            <div class="section-empty" id="kitDisabledMsg" style="border-style:solid;background:var(--surface-2)">
              Ative o modo kit para definir os componentes deste produto.
            </div>
          </div>

        </div>
      </div>`;
  },

  openCreateModal() {
    this.state.editingId = null;
    this.state.activeTab = 'dados';
    this.state.precoEditado = false;
    this.cacheElements();
    if (this.el.modalTitle) this.el.modalTitle.textContent = 'Novo produto';
    if (this.el.form) this.el.form.reset();
    if (this.el.id) this.el.id.value = '';
    if (this.el.preco) this.el.preco.classList.remove('input--sugerido');
    const hint = document.getElementById('produtoPrecoHint');
    if (hint) hint.textContent = '';
    const margemEl = document.getElementById('produtoMargemAlvo');
    if (margemEl) margemEl.value = this.state.margemAlvo;
    if (this.el.tabs) this.el.tabs.classList.add('hidden');
    this.switchTab('dados');
    this.setFormFeedback('', 'info');
    const promoRowCreate = document.getElementById('prdPromoPrecoRow');
    if (promoRowCreate) promoRowCreate.style.display = 'none';
    this.el.modal?.classList.remove('hidden');
  },

  async openEditModal(id) {
    const item = this.state.items.find((p) => Number(p.id) === Number(id));
    if (!item) { this.showModuleMessage('Produto não encontrado.', 'error'); return; }

    this.state.editingId = id;
    this.state.precoEditado = true;
    this.cacheElements();

    if (this.el.modalTitle) this.el.modalTitle.textContent = 'Editar produto';
    if (this.el.id) this.el.id.value = String(item.id);
    if (this.el.nome) this.el.nome.value = item.nome || '';
    if (this.el.categoria) this.el.categoria.value = item.categoria || '';
    if (this.el.codigoBarras) this.el.codigoBarras.value = item.codigo_barras || '';
    if (this.el.preco) { this.el.preco.value = Number(item.preco || 0); this.el.preco.classList.remove('input--sugerido'); }
    if (this.el.custo) this.el.custo.value = Number(item.custo || 0);
    if (this.el.precoPromocional) this.el.precoPromocional.value = Number(item.preco_promocional || 0);
    if (this.el.promocaoAtiva) this.el.promocaoAtiva.checked = Boolean(item.promocao_ativa);
    const promoRowEdit = document.getElementById('prdPromoPrecoRow');
    if (promoRowEdit) promoRowEdit.style.display = item.promocao_ativa ? 'flex' : 'none';
    if (this.el.estoque) this.el.estoque.value = Number(item.estoque || 0);
    if (this.el.estoqueMinimo) this.el.estoqueMinimo.value = Number(item.estoque_minimo || 0);
    if (this.el.ncm) this.el.ncm.value = item.ncm || '';
    if (this.el.unidade) this.el.unidade.value = item.unidade || 'UN';
    const margemEl = document.getElementById('produtoMargemAlvo');
    if (margemEl) margemEl.value = this.state.margemAlvo;

    if (this.el.tabs) this.el.tabs.classList.remove('hidden');
    this.switchTab('dados');
    this.setFormFeedback('', 'info');
    this.el.modal?.classList.remove('hidden');

    // Carrega tabs em paralelo
    await Promise.all([
      this.loadImagens(id),
      this.loadGrade(item),
      this.loadKit(item)
    ]);
  },

  closeModal() {
    this.cacheElements();
    this.el.modal?.classList.add('hidden');
    this.state.editingId = null;
    this.el.form?.reset();
    this.setFormFeedback('', 'info');
  },

  // ── Tabs ───────────────────────────────────────────────────────────────────

  switchTab(tab) {
    this.state.activeTab = tab;
    document.querySelectorAll('.prod-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.prod-tab-panel').forEach((panel) => {
      const id = panel.id.replace('produtoTab', '').toLowerCase();
      panel.classList.toggle('active', id === tab);
      panel.classList.toggle('hidden', id !== tab);
    });
  },

  // ── Submit básico ──────────────────────────────────────────────────────────

  async handleSubmit() {
    this.cacheElements();
    const payload = {
      empresa: this.state.empresa,
      empresa_id: api.getEmpresaId(),
      nome: this.el.nome?.value?.trim() || '',
      categoria: this.el.categoria?.value?.trim() || '',
      codigo_barras: this.el.codigoBarras?.value?.trim() || '',
      preco: Number(this.el.preco?.value || 0),
      custo: Number(this.el.custo?.value || 0),
      preco_promocional: Number(this.el.precoPromocional?.value || 0),
      promocao_ativa: Boolean(this.el.promocaoAtiva?.checked),
      estoque: Number(this.el.estoque?.value || 0),
      estoque_minimo: Number(this.el.estoqueMinimo?.value || 0),
      ncm: this.el.ncm?.value?.trim() || '',
      unidade: this.el.unidade?.value || 'UN'
    };
    if (!payload.nome) { this.setFormFeedback('Informe o nome do produto.', 'error'); return; }
    if (payload.preco <= 0) { this.setFormFeedback('O preço de venda deve ser maior que R$0,00.', 'error'); return; }

    if (this.el.saveBtn) this.el.saveBtn.disabled = true;
    this.setFormFeedback('Salvando...', 'info');
    try {
      if (this.state.editingId) {
        await api.updateProduto(this.state.editingId, payload);
        showToast('Produto atualizado com sucesso.', 'success');
      } else {
        await api.createProduto(payload);
        showToast('Produto cadastrado com sucesso!', 'success');
        await this.load();
        this.openCreateModal();
        return;
      }
      this.closeModal();
      await this.load();
    } catch (err) {
      this.setFormFeedback(buildFriendlyError(err), 'error');
    } finally {
      if (this.el.saveBtn) this.el.saveBtn.disabled = false;
    }
  },

  async handleDelete(id) {
    const item = this.state.items.find((p) => Number(p.id) === Number(id));
    if (!item) { this.showModuleMessage('Produto não encontrado.', 'error'); return; }
    const ok = await confirmarAcao(`Excluir o produto "${item.nome}"?`, 'Excluir', 'danger');
    if (!ok) return;
    if (this.state.loading) return;
    this.state.loading = true;
    this.showModuleMessage('Excluindo...', 'info');
    try {
      await api.deleteProduto(id);
      showToast('Produto excluído.', 'success');
      await this.load();
    } catch (err) {
      this.showModuleMessage(buildFriendlyError(err), 'error');
    } finally {
      this.state.loading = false;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGENS
  // ═══════════════════════════════════════════════════════════════════════════

  async loadImagens(produtoId) {
    try {
      const res = await api.getImagensProduto(produtoId);
      this.state.imagens = Array.isArray(res) ? res : (res?.imagens || []);
    } catch { this.state.imagens = []; }
    this.renderImagens();
  },

  renderImagens() {
    const grid  = document.getElementById('imagemGrid');
    const empty = document.getElementById('imagemEmpty');
    const badge = document.getElementById('tabBadgeImagens');
    if (!grid) return;

    if (badge) badge.textContent = this.state.imagens.length;

    if (!this.state.imagens.length) {
      grid.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    grid.innerHTML = this.state.imagens.map((img) => `
      <div class="imagem-card ${img.principal ? 'imagem-card--principal' : ''}">
        <img src="${escapeHtml(img.url_thumbnail || img.url)}" alt="Imagem do produto" loading="lazy" />
        ${img.principal ? '<span class="imagem-card__badge">Principal</span>' : ''}
        <div class="imagem-card__actions">
          ${!img.principal ? `<button type="button" class="btn-star" data-action="imagemPrincipal" data-id="${img.id}" title="Definir como principal"><i class="fa-solid fa-star"></i></button>` : ''}
          <button type="button" data-action="imagemDelete" data-id="${img.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join('');
  },

  async _validarMagicBytes(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = (e) => {
        const arr = new Uint8Array(e.target.result);
        const isJpeg = arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF;
        const isPng  = arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47;
        const isWebp = arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46
                    && arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50;
        resolve(isJpeg || isPng || isWebp);
      };
      reader.onerror = () => resolve(false);
      reader.readAsArrayBuffer(file.slice(0, 12));
    });
  },

  async handleImagemUpload(file) {
    if (!file || !this.state.editingId) return;
    if (this.state._uploadingImagem) return;
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
      showToast('Apenas imagens JPG, PNG ou WebP são permitidas.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 5 MB.', 'error');
      return;
    }
    const magicOk = await this._validarMagicBytes(file);
    if (!magicOk) {
      showToast('Arquivo inválido. Certifique-se de que é uma imagem real (JPG, PNG ou WebP).', 'error');
      return;
    }
    this.state._uploadingImagem = true;
    const btn = document.getElementById('imagemUploadBtn');
    if (btn) btn.textContent = 'Enviando...';
    try {
      await api.uploadImagemProduto(this.state.editingId, file);
      await this.loadImagens(this.state.editingId);
      showToast('Imagem enviada com sucesso.', 'success');
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      this.state._uploadingImagem = false;
      if (btn) btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" style="font-size:22px;margin-bottom:6px;display:block"></i>Clique para enviar uma imagem (JPG, PNG, WebP — máx. 5MB)';
    }
  },

  async handleImagemPrincipal(id) {
    try {
      await api.setPrincipalImagem(id);
      await this.loadImagens(this.state.editingId);
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  async handleImagemDelete(id) {
    const ok = await confirmarAcao('Excluir esta imagem?', 'Excluir', 'danger');
    if (!ok) return;
    try {
      await api.deletarImagem(id);
      await this.loadImagens(this.state.editingId);
      showToast('Imagem excluída.', 'success');
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRADE
  // ═══════════════════════════════════════════════════════════════════════════

  async loadGrade(item) {
    const toggle = document.getElementById('gradeToggleInput');
    const content = document.getElementById('gradeContent');
    const disabledMsg = document.getElementById('gradeDisabledMsg');
    if (!toggle) return;

    const temGrade = Boolean(item.tem_grade);
    toggle.checked = temGrade;

    if (temGrade) {
      content?.classList.remove('hidden');
      disabledMsg?.classList.add('hidden');
      try {
        const res = await api.getGradesProduto(item.id);
        this.state.grades = Array.isArray(res) ? res : (res?.grades || []);
      } catch { this.state.grades = []; }
      this.renderGrades();
    } else {
      content?.classList.add('hidden');
      disabledMsg?.classList.remove('hidden');
      this.state.grades = [];
      this.renderGrades();
    }
  },

  renderGrades() {
    const grid  = document.getElementById('gradeGrid');
    const empty = document.getElementById('gradeEmpty');
    const badge = document.getElementById('tabBadgeGrade');
    if (!grid) return;

    if (badge) badge.textContent = this.state.grades.length;

    if (!this.state.grades.length) {
      grid.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    grid.innerHTML = this.state.grades.map((g) => {
      const alert = Number(g.estoque) <= Number(g.estoque_minimo || 0) && Number(g.estoque_minimo || 0) > 0;
      return `
        <div class="grade-card ${alert ? 'grade-card--alert' : ''}">
          <div class="grade-card__label">${escapeHtml(g.atributo1)}</div>
          ${g.atributo2 ? `<div class="grade-card__sub">${escapeHtml(g.atributo2)}</div>` : ''}
          <div class="grade-card__estoque">Estoque: <strong>${Number(g.estoque || 0)}</strong></div>
          ${g.preco ? `<div style="font-size:12px;color:var(--primary);margin-bottom:6px">${toCurrency(g.preco)}</div>` : ''}
          <div class="grade-card__actions">
            <button type="button" class="btn-inline" data-action="gradeEdit" data-id="${g.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="btn-inline btn-inline--danger" data-action="gradeDelete" data-id="${g.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('');
  },

  async handleGradeToggle() {
    if (!this.state.editingId || this.state._toggling) return;
    this.state._toggling = true;
    const toggle = document.getElementById('gradeToggleInput');
    const content = document.getElementById('gradeContent');
    const disabledMsg = document.getElementById('gradeDisabledMsg');

    const item = this.state.items.find((p) => Number(p.id) === Number(this.state.editingId));
    if (item?.e_kit) {
      showToast('Não é possível ativar grade em um produto que já é kit.', 'error');
      if (toggle) toggle.checked = false;
      return;
    }

    try {
      const res = await api.toggleGrade(this.state.editingId);
      const ativo = res.tem_grade;
      if (toggle) toggle.checked = ativo;
      content?.classList.toggle('hidden', !ativo);
      disabledMsg?.classList.toggle('hidden', ativo);
      if (ativo) {
        const r = await api.getGradesProduto(this.state.editingId);
        this.state.grades = r.grades || [];
        this.renderGrades();
      }
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
      const item2 = this.state.items.find((p) => Number(p.id) === Number(this.state.editingId));
      if (toggle && item2) toggle.checked = Boolean(item2.tem_grade);
    } finally {
      this.state._toggling = false;
    }
  },

  async handleGradeAdd() {
    if (!this.state.editingId) return;
    const atrib1  = document.getElementById('gradeAtrib1')?.value?.trim();
    const atrib2  = document.getElementById('gradeAtrib2')?.value?.trim();
    const estoque = Number(document.getElementById('gradeEstoque')?.value || 0);
    const preco   = Number(document.getElementById('gradePreco')?.value || 0) || null;

    if (!atrib1) { showToast('Informe o atributo 1 (ex: tamanho).', 'error'); return; }

    const btn = document.getElementById('gradeAddBtn');
    if (btn) btn.disabled = true;
    try {
      await api.createGrade(this.state.editingId, { atributo1: atrib1, atributo2: atrib2 || null, estoque, preco });
      document.getElementById('gradeAtrib1').value = '';
      document.getElementById('gradeAtrib2').value = '';
      document.getElementById('gradeEstoque').value = '0';
      document.getElementById('gradePreco').value = '';
      const res = await api.getGradesProduto(this.state.editingId);
      this.state.grades = res.grades || [];
      this.renderGrades();
      await this.load();
      showToast('Variação adicionada.', 'success');
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
    finally { if (btn) btn.disabled = false; }
  },

  handleGradeEditInline(gradeId) {
    const card = document.querySelector(`[data-action="gradeEdit"][data-id="${gradeId}"]`)?.closest('.grade-card');
    if (!card) return;
    const grade = this.state.grades.find((g) => Number(g.id) === gradeId);
    if (!grade) return;

    card.innerHTML = `
      <input type="text" value="${escapeHtml(grade.atributo1)}" id="gradeEditAtrib1_${gradeId}" style="width:100%;margin-bottom:4px;padding:5px;border:1px solid var(--border);border-radius:4px;font-size:12px" />
      <input type="text" value="${escapeHtml(grade.atributo2||'')}" placeholder="Cor (opcional)" id="gradeEditAtrib2_${gradeId}" style="width:100%;margin-bottom:4px;padding:5px;border:1px solid var(--border);border-radius:4px;font-size:12px" />
      <input type="number" value="${Number(grade.estoque||0)}" id="gradeEditEstoque_${gradeId}" style="width:100%;margin-bottom:4px;padding:5px;border:1px solid var(--border);border-radius:4px;font-size:12px" />
      <div class="grade-card__actions">
        <button type="button" class="btn-inline" data-action="gradeEditSave" data-id="${gradeId}">Salvar</button>
        <button type="button" class="btn-inline btn-inline--danger" data-action="gradeEditCancel" data-id="${gradeId}">×</button>
      </div>`;
  },

  async handleGradeEditSave(gradeId) {
    const atrib1  = document.getElementById(`gradeEditAtrib1_${gradeId}`)?.value?.trim();
    const atrib2  = document.getElementById(`gradeEditAtrib2_${gradeId}`)?.value?.trim();
    const estoque = Number(document.getElementById(`gradeEditEstoque_${gradeId}`)?.value || 0);
    if (!atrib1) { showToast('Atributo 1 é obrigatório.', 'error'); return; }
    try {
      await api.updateGrade(gradeId, { atributo1: atrib1, atributo2: atrib2 || null, estoque });
      const res = await api.getGradesProduto(this.state.editingId);
      this.state.grades = res.grades || [];
      this.renderGrades();
      await this.load();
      showToast('Variação atualizada.', 'success');
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  async handleGradeDelete(gradeId) {
    const ok = await confirmarAcao('Excluir esta variação?', 'Excluir', 'danger');
    if (!ok) return;
    try {
      await api.deleteGrade(gradeId);
      const res = await api.getGradesProduto(this.state.editingId);
      this.state.grades = res.grades || [];
      this.renderGrades();
      await this.load();
      showToast('Variação excluída.', 'success');
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KIT
  // ═══════════════════════════════════════════════════════════════════════════

  async loadKit(item) {
    const toggle = document.getElementById('kitToggleInput');
    const content = document.getElementById('kitContent');
    const disabledMsg = document.getElementById('kitDisabledMsg');
    if (!toggle) return;

    const eKit = Boolean(item.e_kit);
    toggle.checked = eKit;

    if (eKit) {
      content?.classList.remove('hidden');
      disabledMsg?.classList.add('hidden');
      await this.refreshKitData(item.id);
    } else {
      content?.classList.add('hidden');
      disabledMsg?.classList.remove('hidden');
    }

    // Popula select de produtos
    await this.populateKitSelect(item.id);
  },

  async refreshKitData(kitId) {
    try {
      const res = await api.getKitComponentes(kitId);
      this.state.kitComponentes = res.componentes || [];
      this.state.kitEstoque = res.estoque_kit || 0;
    } catch { this.state.kitComponentes = []; this.state.kitEstoque = 0; }
    this.renderKitComponentes();
  },

  async populateKitSelect(kitId) {
    const sel = document.getElementById('kitProdutoSelect');
    if (!sel) return;
    try {
      const items = await api.getProdutos();
      this.state.allProdutos = Array.isArray(items) ? items : [];
      const disponíveis = this.state.allProdutos.filter((p) => Number(p.id) !== Number(kitId) && !p.e_kit);
      sel.innerHTML = '<option value="">Selecione o produto...</option>' +
        disponíveis.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)} (Est: ${p.estoque})</option>`).join('');
    } catch { /* silencioso */ }
  },

  renderKitComponentes() {
    const list  = document.getElementById('kitList');
    const empty = document.getElementById('kitEmpty');
    const badge = document.getElementById('tabBadgeKit');
    const estoqueInfo = document.getElementById('kitEstoqueVal');
    if (!list) return;

    if (badge) badge.textContent = this.state.kitComponentes.length;
    if (estoqueInfo) estoqueInfo.textContent = this.state.kitEstoque;

    if (!this.state.kitComponentes.length) {
      list.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    list.innerHTML = this.state.kitComponentes.map((comp) => `
      <div class="kit-row">
        <div class="kit-row__nome">${escapeHtml(comp.componente_nome || '-')}</div>
        <div class="kit-row__info">${Number(comp.quantidade)} por kit</div>
        <div class="kit-row__estoque">Est: ${comp.estoque_componente ?? '-'}</div>
        <button type="button" class="btn-inline btn-inline--danger" data-action="kitDelete" data-id="${comp.id}" style="flex-shrink:0">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`).join('');
  },

  async handleKitToggle() {
    if (!this.state.editingId || this.state._toggling) return;
    this.state._toggling = true;
    const toggle = document.getElementById('kitToggleInput');
    const content = document.getElementById('kitContent');
    const disabledMsg = document.getElementById('kitDisabledMsg');

    const item = this.state.items.find((p) => Number(p.id) === Number(this.state.editingId));
    if (item?.tem_grade) {
      showToast('Não é possível ativar kit em um produto com grade. Desative a grade primeiro.', 'error');
      if (toggle) toggle.checked = false;
      return;
    }

    try {
      const res = await api.toggleKit(this.state.editingId);
      const ativo = res.e_kit;
      if (toggle) toggle.checked = ativo;
      content?.classList.toggle('hidden', !ativo);
      disabledMsg?.classList.toggle('hidden', ativo);
      if (ativo) await this.refreshKitData(this.state.editingId);
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
      const item2 = this.state.items.find((p) => Number(p.id) === Number(this.state.editingId));
      if (toggle && item2) toggle.checked = Boolean(item2.e_kit);
    } finally {
      this.state._toggling = false;
    }
  },

  async handleKitAdd() {
    if (!this.state.editingId) return;
    const sel = document.getElementById('kitProdutoSelect');
    const qtd = Number(document.getElementById('kitQtd')?.value || 1);
    const compId = Number(sel?.value);

    if (!compId) { showToast('Selecione um produto componente.', 'error'); return; }
    if (!qtd || qtd <= 0) { showToast('Informe uma quantidade válida.', 'error'); return; }

    const btn = document.getElementById('kitAddBtn');
    if (btn) btn.disabled = true;
    try {
      await api.addKitComponente(this.state.editingId, { componente_id: compId, quantidade: qtd });
      if (sel) sel.value = '';
      document.getElementById('kitQtd').value = '1';
      await this.refreshKitData(this.state.editingId);
      await this.load();
      showToast('Componente adicionado.', 'success');
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
    finally { if (btn) btn.disabled = false; }
  },

  async handleKitDelete(compId) {
    const ok = await confirmarAcao('Remover este componente do kit?', 'Remover', 'danger');
    if (!ok) return;
    try {
      await api.deleteKitComponente(this.state.editingId, compId);
      await this.refreshKitData(this.state.editingId);
      await this.load();
      showToast('Componente removido.', 'success');
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  // ── Utilitários ────────────────────────────────────────────────────────────

  setLoading(value) {
    this.state.loading = value;
    this.cacheElements();
    if (this.el.toolbarRefresh) this.el.toolbarRefresh.disabled = value;
    if (this.el.toolbarNew) this.el.toolbarNew.disabled = value;
  },

  // ── Marketplace ──────────────────────────────────────────────────────────────

  async abrirMarketplace() {
    if (!document.getElementById('mktModal')) {
      const el = document.createElement('div');
      el.className = 'modal-overlay hidden';
      el.id = 'mktModal';
      el.innerHTML = `
        <div class="modal-card" style="max-width:720px;width:95vw">
          <div class="modal-card__header">
            <div>
              <h3><i class="fa-solid fa-store" style="margin-right:8px"></i>Marketplace</h3>
              <p style="color:var(--text-muted);font-size:.9rem">Sincronize produtos com Mercado Livre e Shopee</p>
            </div>
            <button type="button" class="icon-button" id="mktFecharX">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div id="mktCorpo" style="padding:20px 24px;overflow-y:auto;max-height:70vh"></div>
          <div class="modal-card__footer" style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
            <button type="button" class="btn btn-light" id="mktFecharBtn">Fechar</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('#mktFecharX').addEventListener('click', () => el.classList.add('hidden'));
      el.querySelector('#mktFecharBtn').addEventListener('click', () => el.classList.add('hidden'));
    }
    document.getElementById('mktModal').classList.remove('hidden');
    await this._renderMarketplace();
  },

  async _renderMarketplace() {
    const corpo = document.getElementById('mktCorpo');
    if (!corpo) return;
    corpo.innerHTML = `<div class="module-feedback module-feedback--info">Carregando...</div>`;

    try {
      const [cfgData, prodData] = await Promise.all([
        api.request('/marketplace/config'),
        api.request('/marketplace/produtos')
      ]);

      const plataformas = cfgData.plataformas || [];
      const produtos    = prodData.produtos    || [];

      const statusBadge = (s) => s === 'conectado'
        ? `<span class="badge badge--success">Conectado</span>`
        : `<span class="badge badge--warning">Desconectado</span>`;

      corpo.innerHTML = `
        <!-- Plataformas conectadas -->
        <h4 style="font-size:.9rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">Plataformas</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
          ${['mercadolivre', 'shopee'].map((plat) => {
            const cfg = plataformas.find((p) => p.plataforma === plat);
            return `
              <div style="border:1px solid var(--border);border-radius:14px;padding:14px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <strong style="text-transform:capitalize">${plat.replace('mercadolivre','Mercado Livre')}</strong>
                  ${statusBadge(cfg?.status_conexao || 'desconectado')}
                </div>
                ${cfg?.seller_id ? `<div style="font-size:.8rem;color:var(--text-muted)">Seller ID: ${escapeHtml(String(cfg.seller_id))}</div>` : ''}
                <div style="margin-top:10px;display:flex;gap:8px">
                  <button class="btn btn-light btn-sm" data-action="config-mkt" data-plat="${plat}">
                    <i class="fa-solid fa-gear"></i> Config
                  </button>
                  ${plat === 'mercadolivre' ? `
                    <button class="btn btn-light btn-sm" data-action="autorizar-mkt" data-plat="${plat}">
                      <i class="fa-solid fa-link"></i> Autorizar
                    </button>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>

        <!-- Produtos vinculados -->
        <h4 style="font-size:.9rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">
          Produtos vinculados (${produtos.length})
        </h4>
        ${produtos.length === 0
          ? `<div class="empty-state">Nenhum produto vinculado ainda. Use o botão na linha do produto para vincular.</div>`
          : `<div class="table-wrapper">
             <table class="data-table">
               <thead><tr>
                 <th>Produto</th><th>Plataforma</th><th>Listing ID</th>
                 <th class="text-right">Est. LF</th><th class="text-right">Est. pub.</th>
                 <th class="text-right">Ações</th>
               </tr></thead>
               <tbody>
                 ${produtos.map((p) => `
                   <tr>
                     <td><strong>${escapeHtml(p.produto_nome)}</strong></td>
                     <td style="text-transform:capitalize">${escapeHtml(p.plataforma.replace('mercadolivre','ML'))}</td>
                     <td><code style="font-size:.82rem">${escapeHtml(p.listing_id)}</code></td>
                     <td class="text-right">${p.estoque_lferp}</td>
                     <td class="text-right">${p.estoque_publicado}</td>
                     <td class="text-right">
                       <button class="btn-inline" data-action="sync-estoque" data-id="${Number(p.produto_id)}" data-plat="${escapeHtml(p.plataforma)}">
                         <i class="fa-solid fa-sync"></i> Sync
                       </button>
                       <button class="btn-inline btn-inline--danger" data-action="desvincular" data-id="${Number(p.id)}">
                         <i class="fa-solid fa-unlink"></i>
                       </button>
                     </td>
                   </tr>`).join('')}
               </tbody>
             </table>
             </div>`}`;

    if (!corpo.dataset.delegated) {
      corpo.dataset.delegated = '1';
      corpo.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        const act = btn.dataset.action;
        if (act === 'config-mkt') ProdutosModule._configurarMkt(btn.dataset.plat);
        else if (act === 'autorizar-mkt') ProdutosModule._autorizarMkt(btn.dataset.plat);
        else if (act === 'sync-estoque') ProdutosModule._syncEstoque(Number(btn.dataset.id), btn.dataset.plat);
        else if (act === 'desvincular') ProdutosModule._desvincular(Number(btn.dataset.id));
      });
    }
    } catch (err) {
      corpo.innerHTML = `<div class="module-feedback module-feedback--error">${escapeHtml(err.message)}</div>`;
    }
  },

  async _configurarMkt(plataforma) {
    const resultado = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:400px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <p style="font-weight:600;margin:0 0 16px;font-size:15px">Configurar ${escapeHtml(plataforma)}</p>
          <label style="display:block;font-size:13px;margin-bottom:4px">App ID / Client ID</label>
          <input id="_mkt_appid" type="text" autocomplete="off" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:12px;box-sizing:border-box" />
          <label style="display:block;font-size:13px;margin-bottom:4px">Client Secret</label>
          <input id="_mkt_secret" type="password" autocomplete="new-password" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:20px;box-sizing:border-box" />
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="_mkt_cancel" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-3);font-size:13px;cursor:pointer">Cancelar</button>
            <button id="_mkt_save" style="padding:8px 16px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Salvar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      let done = false;
      const fechar = (val) => { if (done) return; done = true; overlay.remove(); resolve(val); };
      overlay.querySelector('#_mkt_save').addEventListener('click', () => {
        const appId = overlay.querySelector('#_mkt_appid').value.trim();
        const secret = overlay.querySelector('#_mkt_secret').value;
        fechar(appId ? { appId, secret } : null);
      });
      overlay.querySelector('#_mkt_cancel').addEventListener('click', () => fechar(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(null); });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); fechar(null); }
      });
      overlay.querySelector('#_mkt_appid').focus();
    });
    if (!resultado) return;
    try {
      await api.request('/marketplace/config', {
        method: 'PUT',
        body: { plataforma, app_id: resultado.appId, client_secret: resultado.secret }
      });
      showToast('Configuração salva! Agora clique em Autorizar.', 'success');
      await this._renderMarketplace();
    } catch (e) { showToast(e.message, 'error'); }
  },

  async _autorizarMkt(plataforma) {
    try {
      const data = await api.request('/marketplace/oauth/url', { method: 'GET', query: { plataforma } });
      if (data.url) window.open(data.url, '_blank', 'width=600,height=700');
    } catch (e) { showToast(e.message, 'error'); }
  },

  async _syncEstoque(produtoId, plataforma) {
    try {
      const r = await api.request('/marketplace/sync-estoque', {
        method: 'POST',
        body: { produto_id: produtoId, plataforma }
      });
      showToast(r.mensagem || 'Sincronizado!', 'success');
      await this._renderMarketplace();
    } catch (e) { showToast(e.message, 'error'); }
  },

  async _desvincular(id) {
    if (!await confirmarAcao('Remover vínculo com esta plataforma?', 'Remover', 'danger')) return;
    try {
      await api.request(`/marketplace/vincular/${id}`, { method: 'DELETE', query: { empresa_id: api.getEmpresaId() } });
      showToast('Vínculo removido', 'success');
      await this._renderMarketplace();
    } catch (e) { showToast(e.message, 'error'); }
  },

  atualizarBotaoLote() {
    const btn   = document.getElementById('produtosLoteBtn');
    const badge = document.getElementById('produtosLoteBadge');
    const n = this.state.selectedIds.size;
    if (btn)   { btn.style.display = n > 0 ? '' : 'none'; }
    if (badge) badge.textContent = String(n);
  },

  imprimirLote() {
    const ids = [...this.state.selectedIds];
    if (!ids.length) return;

    const selecionados = ids
      .map((id) => this.state.items.find((p) => p.id === id))
      .filter(Boolean);

    if (!selecionados.length) return;

    // Pede quantidade uniforme de cópias extras
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 6px;font-size:16px;font-weight:700">
          <i class="fa-solid fa-tags"></i> Imprimir etiquetas em lote
        </h3>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">
          <strong>${selecionados.length}</strong> produto(s) selecionado(s).
        </p>
        <div style="margin-bottom:16px">
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Cópias por produto</label>
          <input type="number" id="_loteQtd" value="1" min="1" max="100"
            style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;box-sizing:border-box" />
          <small style="color:var(--text-muted);font-size:11px">Cada produto imprimirá esta quantidade de etiquetas</small>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_loteCancelar" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-3);font-size:13px;cursor:pointer">Cancelar</button>
          <button id="_loteAbrir" style="padding:8px 16px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer">
            <i class="fa-solid fa-print"></i> Abrir para impressão
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#_loteCancelar').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.querySelector('#_loteAbrir').addEventListener('click', () => {
      const qtd = Math.max(1, Number(overlay.querySelector('#_loteQtd').value) || 1);
      document.body.removeChild(overlay);

      const dados = selecionados.map((item) => ({
        nome:          item.nome || '',
        preco:         Number(item.preco || 0),
        codigo_barras: item.codigo_barras || '',
        categoria:     item.categoria || '',
        empresa_nome:  this.state.empresa || 'LF ERP',
        variacao:      '',
        quantidade:    qtd
      }));

      localStorage.setItem('lf_erp_etiquetas', JSON.stringify(dados));
      window.open('./etiquetas.html', '_blank');
    });
  },

  imprimirTodas() {
    const lista = this.state.filteredItems.length
      ? this.state.filteredItems
      : this.state.items;

    if (!lista.length) {
      showToast('Nenhum produto carregado para imprimir', 'warning');
      return;
    }

    const dados = lista.map((item) => ({
      nome:          item.nome || '',
      preco:         Number(item.preco || 0),
      codigo_barras: item.codigo_barras || '',
      categoria:     item.categoria || '',
      empresa_nome:  this.state.empresa || 'LF ERP',
      variacao:      '',
      quantidade:    1
    }));

    localStorage.setItem('lf_erp_etiquetas', JSON.stringify(dados));
    window.open('./etiquetas.html', '_blank');
  },

  async imprimirHoje() {
    try {
      showToast('Buscando produtos de hoje…', 'info');
      const resp = await api.request(`/produtos/etiquetas-hoje/${encodeURIComponent(this.state.empresa)}`);
      const itens = Array.isArray(resp) ? resp : (resp?.dados || []);

      if (!itens.length) {
        showToast('Nenhum produto registrado hoje', 'warning');
        return;
      }

      const dados = itens.map((item) => ({
        nome:          item.nome || '',
        preco:         Number(item.preco || 0),
        codigo_barras: item.codigo_barras || '',
        categoria:     item.categoria || '',
        empresa_nome:  this.state.empresa || 'LF ERP',
        variacao:      '',
        quantidade:    1
      }));

      localStorage.setItem('lf_erp_etiquetas', JSON.stringify(dados));
      window.open('./etiquetas.html', '_blank');
    } catch (e) {
      showToast(e.message || 'Erro ao buscar produtos de hoje', 'error');
    }
  },

  abrirEtiqueta(produtoId) {
    const item = this.state.items.find((p) => Number(p.id) === produtoId);
    if (!item) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 6px;font-size:16px;font-weight:700"><i class="fa-solid fa-tag"></i> Imprimir Etiqueta</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">${escapeHtml(String(item.nome).substring(0, 50))}</p>
        <div style="display:grid;gap:12px;margin-bottom:16px">
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Quantidade de etiquetas</label>
            <input type="number" id="_etiqQtd" value="1" min="1" max="100"
              style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;box-sizing:border-box" />
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_etiqCancelar" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-3);font-size:13px;cursor:pointer">Cancelar</button>
          <button id="_etiqAbrir" style="padding:8px 16px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer">
            <i class="fa-solid fa-print"></i> Abrir para impressão
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#_etiqCancelar').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.querySelector('#_etiqAbrir').addEventListener('click', () => {
      const qtd = Math.max(1, Number(overlay.querySelector('#_etiqQtd').value) || 1);
      document.body.removeChild(overlay);

      const dados = [{
        nome:          item.nome || '',
        preco:         Number(item.preco || 0),
        codigo_barras: item.codigo_barras || '',
        categoria:     item.categoria || '',
        empresa_nome:  this.state.empresa || 'LF ERP',
        variacao:      '',
        quantidade:    qtd
      }];

      localStorage.setItem('lf_erp_etiquetas', JSON.stringify(dados));
      window.open('./etiquetas.html', '_blank');
    });
  },

  // ── Helpers de destaque de busca ──────────────────────────────────────────

  _highlight(text, term) {
    const safe = escapeHtml(String(text || ''));
    if (!term) return safe;
    const q = escapeHtml(term.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!q) return safe;
    return safe.replace(new RegExp(`(${q})`, 'gi'), '<mark class="search-hl">$1</mark>');
  },

  // ── Duplicar produto ───────────────────────────────────────────────────────

  duplicarProduto(id) {
    const item = this.state.items.find((p) => Number(p.id) === Number(id));
    if (!item) return;
    this.state.editingId = null;
    this.state.activeTab = 'dados';
    this.state.precoEditado = true;
    this.cacheElements();
    if (this.el.modalTitle) this.el.modalTitle.textContent = 'Duplicar produto';
    if (this.el.form) this.el.form.reset();
    if (this.el.id) this.el.id.value = '';
    if (this.el.nome) this.el.nome.value = `Cópia de ${item.nome}`;
    if (this.el.categoria) this.el.categoria.value = item.categoria || '';
    if (this.el.codigoBarras) this.el.codigoBarras.value = '';
    if (this.el.preco) { this.el.preco.value = Number(item.preco || 0); this.el.preco.classList.remove('input--sugerido'); }
    if (this.el.custo) this.el.custo.value = Number(item.custo || 0);
    if (this.el.precoPromocional) this.el.precoPromocional.value = 0;
    if (this.el.promocaoAtiva) this.el.promocaoAtiva.checked = false;
    if (this.el.estoque) this.el.estoque.value = 0;
    if (this.el.estoqueMinimo) this.el.estoqueMinimo.value = Number(item.estoque_minimo || 0);
    if (this.el.ncm) this.el.ncm.value = item.ncm || '';
    if (this.el.unidade) this.el.unidade.value = item.unidade || 'UN';
    const margemEl = document.getElementById('produtoMargemAlvo');
    if (margemEl) margemEl.value = this.state.margemAlvo;
    if (this.el.tabs) this.el.tabs.classList.add('hidden');
    this.switchTab('dados');
    this.setFormFeedback('', 'info');
    this.el.modal?.classList.remove('hidden');
  },

  // ── Ajuste de estoque inline ───────────────────────────────────────────────

  ajustarEstoqueInline(id) {
    const item = this.state.items.find((p) => Number(p.id) === Number(id));
    if (!item) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 6px;font-size:16px;font-weight:700"><i class="fa-solid fa-boxes-stacked"></i> Ajustar Estoque</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">${escapeHtml(String(item.nome).substring(0, 50))}</p>
        <p style="font-size:13px;margin:0 0 12px">Estoque atual: <strong>${Number(item.estoque || 0)}</strong></p>
        <div style="margin-bottom:16px">
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Novo valor de estoque</label>
          <input type="number" id="_adjEstoque" value="${Number(item.estoque || 0)}" min="0" step="1"
            style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;box-sizing:border-box" />
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_adjCancelar" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-3);font-size:13px;cursor:pointer">Cancelar</button>
          <button id="_adjSalvar" style="padding:8px 16px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer">
            <i class="fa-solid fa-check"></i> Salvar
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#_adjEstoque');
    input.focus(); input.select();

    overlay.querySelector('#_adjCancelar').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.querySelector('#_adjSalvar').addEventListener('click', async () => {
      const novoEstoque = Number(input.value);
      if (isNaN(novoEstoque) || novoEstoque < 0) { showToast('Informe um estoque válido.', 'error'); return; }
      const btn = overlay.querySelector('#_adjSalvar');
      btn.disabled = true;
      try {
        await api.updateProduto(id, {
          empresa: this.state.empresa,
          empresa_id: api.getEmpresaId(),
          estoque: novoEstoque
        });
        document.body.removeChild(overlay);
        showToast('Estoque atualizado.', 'success');
        await this.load();
      } catch (err) {
        showToast(buildFriendlyError(err), 'error');
        btn.disabled = false;
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
  },

  showModuleMessage(message, type = 'info') {
    this.cacheElements();
    if (!this.el.feedback) return;
    if (!message) { this.el.feedback.className = 'module-feedback'; this.el.feedback.textContent = ''; return; }
    this.el.feedback.className = `module-feedback module-feedback--${type}`;
    this.el.feedback.textContent = message;
  },

  setFormFeedback(message, type = 'info') {
    this.cacheElements();
    if (!this.el.formFeedback) return;
    if (!message) { this.el.formFeedback.className = 'form-feedback'; this.el.formFeedback.textContent = ''; return; }
    this.el.formFeedback.className = `form-feedback form-feedback--${type}`;
    this.el.formFeedback.textContent = message;
  }
};

export async function initProdutosModule() {
  window.ProdutosModule = ProdutosModule;
  ProdutosModule.init();
  await ProdutosModule.load();
}

export default ProdutosModule;
