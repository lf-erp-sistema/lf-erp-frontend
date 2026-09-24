import api from './api.js';
import { getAuth } from './auth.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, maskPhone, debounce } from './utils.js';
import { exportCSV, numCSV } from './exportUtils.js';

const FornecedoresModule = {
  ITENS_POR_PAGINA: 20,

  state: {
    items: [],
    filteredItems: [],
    empresa: null,
    editingId: null,
    initialized: false,
    eventsBound: false,
    loading: false,
    pagina: 1,
    ordem: 'nome',
    ordemDir: 'asc',
    filtroTipo: ''
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
    }
  },

  resolveEmpresa() {
    const auth = getAuth();
    this.state.empresa = auth?.empresa?.nome || auth?.user?.empresa || 'LF ERP';
  },

  cache() {
    this.el = {
      container:     document.getElementById('fornecedoresContainer'),
      table:         document.getElementById('fornecedoresTable'),
      search:        document.getElementById('fornecedoresSearch'),
      modal:         document.getElementById('fornecedorModal'),
      form:          document.getElementById('fornecedorForm'),
      nome:          document.getElementById('fornecedorNome'),
      telefone:      document.getElementById('fornecedorTelefone'),
      cnpj:          document.getElementById('fornecedorCnpj'),
      email:         document.getElementById('fornecedorEmail'),
      endereco:      document.getElementById('fornecedorEndereco'),
      observacao:    document.getElementById('fornecedorObservacao'),
      contato:       document.getElementById('fornecedorContato'),
      site:          document.getElementById('fornecedorSite'),
      prazo:         document.getElementById('fornecedorPrazoPagamento'),
      feedback:      document.getElementById('fornecedoresFeedback'),
      modalTitle:    document.getElementById('fornecedorModalTitle'),
      emailHint:     document.getElementById('fornecedorEmailHint')
    };
  },

  _injectStyles() {
    if (document.getElementById('_fornecedoresStyles')) return;
    const style = document.createElement('style');
    style.id = '_fornecedoresStyles';
    style.textContent = `
      .forn-filter-box {
        display: flex;
        align-items: center;
      }
      .forn-filter-box select {
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
      .forn-filter-box select:focus { border-color: var(--primary); }
    `;
    document.head.appendChild(style);
  },

  _injectFoStyles() {
    if (document.getElementById('fo-nc-styles')) return;
    const s = document.createElement('style');
    s.id = 'fo-nc-styles';
    s.textContent = `
      .fo-nc-card { width: min(96vw, 600px) !important; max-height: 92vh; }
      .fo-nc-body { overflow-y: auto; }
      .fo-nc-section { padding: 16px 20px 0; }
      .fo-nc-section:last-child { padding-bottom: 20px; }
      .fo-nc-section-title { font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8px; }
      .fo-nc-card-group { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
      .fo-nc-cell { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface); transition: background .1s; }
      .fo-nc-cell:last-child { border-bottom: none; }
      .fo-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
      .fo-nc-cells-2col { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border); }
      .fo-nc-cells-2col:last-child { border-bottom: none; }
      .fo-nc-cells-2col .fo-nc-cell { border-bottom: none; }
      .fo-nc-cells-2col .fo-nc-cell:first-child { border-right: 1px solid var(--border); }
      .fo-nc-cell-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; background: var(--surface-2); color: var(--text-muted); }
      .fo-nc-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
      .fo-nc-cell-ico--blue { background: rgba(37,99,235,.1); color: #2563eb; }
      .fo-nc-cell-ico--red { background: rgba(220,38,38,.1); color: #dc2626; }
      .fo-nc-cell-ico--purple { background: rgba(124,58,237,.1); color: #7c3aed; }
      .fo-nc-cell-ico--orange { background: rgba(234,88,12,.1); color: #ea580c; }
      .fo-nc-cell-content { flex: 1; min-width: 0; }
      .fo-nc-lbl { display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
      .fo-nc-req { color: #dc2626; }
      .fo-nc-cell-input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-size: 0.93rem; font-weight: 600; color: var(--text); width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none; }
      select.fo-nc-cell-input { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat !important; background-position: right 0 center !important; padding-right: 16px !important; }
      .fo-nc-obs { width: 100%; resize: none; font-size: 0.9rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; font-family: inherit; color: var(--text); box-sizing: border-box; }
      @media (max-width: 600px) {
        .fo-nc-section { padding: 14px 16px 0; }
        .fo-nc-cells-2col { grid-template-columns: 1fr; }
        .fo-nc-cells-2col .fo-nc-cell:first-child { border-right: none; border-bottom: 1px solid var(--border); }
      }
    `;
    document.head.appendChild(s);
  },

  bind() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;
    this._injectStyles();

    const debouncedSearch = debounce((v) => this.search(v), 350);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'fornecedoresSearch') {
        this.state.pagina = 1;
        debouncedSearch(e.target.value);
      }
      if (e.target.id === 'fornecedorTelefone') {
        e.target.value = maskPhone(e.target.value);
      }
      if (e.target.id === 'fornecedorCnpj') {
        e.target.value = maskDocumento(e.target.value);
      }
      // Validação visual de e-mail
      if (e.target.id === 'fornecedorEmail') {
        const hint = document.getElementById('fornecedorEmailHint');
        if (!hint) return;
        const v = e.target.value.trim();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          hint.textContent = 'E-mail inválido';
          hint.style.color = 'var(--danger, #ef4444)';
        } else {
          hint.textContent = '';
        }
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'fornecedoresFiltroTipo') {
        this.state.filtroTipo = e.target.value;
        this.state.pagina = 1;
        this.search(document.getElementById('fornecedoresSearch')?.value || '');
      }
    });

    document.addEventListener('click', async (e) => {
      // Fechar modal ao clicar no overlay
      if (e.target?.id === 'fornecedorModal') { this.closeModal(); return; }

      // Ordenação por coluna
      const th = e.target.closest('th.sortable');
      if (th) {
        const col = th.dataset.sort;
        if (this.state.ordem === col) {
          this.state.ordemDir = this.state.ordemDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.ordem = col;
          this.state.ordemDir = 'asc';
        }
        this.state.pagina = 1;
        this.applyFilterSort();
        return;
      }

      // Paginação
      const btnPag = e.target.closest('[data-action="forn-pagina"]');
      if (btnPag) {
        const total = Math.ceil(this.state.filteredItems.length / this.ITENS_POR_PAGINA);
        if (btnPag.dataset.page === 'prev' && this.state.pagina > 1) this.state.pagina--;
        else if (btnPag.dataset.page === 'next' && this.state.pagina < total) this.state.pagina++;
        this.renderTable();
        this.renderPagination();
        return;
      }

      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.id === 'novoFornecedorBtn')          { this.openModal(false); return; }
      if (btn.id === 'fornecedoresExportBtn')       { this.exportarCSV(); return; }
      if (btn.id === 'cancelFornecedor' || btn.id === 'cancelFornecedorFooter') { this.closeModal(); return; }
      if (btn.dataset.action === 'edit-fornecedor') { this.edit(btn.dataset.id); return; }
      if (btn.dataset.action === 'delete-fornecedor') { await this.delete(btn.dataset.id); return; }
      if (btn.dataset.action === 'historico-fornecedor') { this.abrirHistoricoCompras(Number(btn.dataset.id)); return; }
    });

    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'fornecedorForm') {
        e.preventDefault();
        await this.save();
      }
    });
  },

  async load() {
    this.resolveEmpresa();
    this.state.loading = true;
    this.setFeedback('Carregando fornecedores...', 'info');
    this.setLoading(true);


    try {
      const data = await api.getFornecedores();
      this.state.items = Array.isArray(data) ? data : [];
      this.state.filteredItems = this._sortItems([...this.state.items]);

      this.render();
      this.cache();
      // Restaura filtros visuais
      const selTipo = document.getElementById('fornecedoresFiltroTipo');
      if (selTipo) selTipo.value = this.state.filtroTipo;
      const searchEl = document.getElementById('fornecedoresSearch');
      if (searchEl && searchEl.value) this.search(searchEl.value);
      this.renderTable();
      this.setFeedback('', '');
    } catch (error) {
      console.error('Erro ao carregar fornecedores:', error);
      this.state.items = [];
      this.state.filteredItems = [];

      this.render();
      this.cache();
      this.renderTable();
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
      this.setLoading(false);
    }
  },

  render() {
    const c = document.getElementById('fornecedoresContainer');
    if (!c) return;

    c.innerHTML = `
      <section class="module-card">
        <div id="fornecedoresFeedback" class="module-feedback"></div>

        <div class="module-toolbar">
          <div class="module-toolbar__search">
            <i class="fa-solid fa-search"></i>
            <input id="fornecedoresSearch"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value="${escapeHtml(this.getCurrentSearchValue())}" />
          </div>

          <div class="forn-filter-box">
            <select id="fornecedoresFiltroTipo">
              <option value="">PF + PJ</option>
              <option value="pj">CNPJ (PJ)</option>
              <option value="pf">CPF (PF)</option>
              <option value="sem">Sem documento</option>
            </select>
          </div>

          <div class="module-toolbar__stats">
            <div class="mini-stat">
              <span>Total</span>
              <strong id="fornecedoresCont">${this.state.filteredItems.length}</strong>
            </div>
          </div>
          <div class="module-card__actions">
            <button class="btn btn-light" id="fornecedoresExportBtn">
              <i class="fa-solid fa-file-csv"></i> CSV
            </button>
            <button class="btn btn-primary" id="novoFornecedorBtn">
              <i class="fa-solid fa-plus"></i> Novo Fornecedor
            </button>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th class="sortable" data-sort="nome" style="cursor:pointer;user-select:none">
                  Nome <i class="fa-solid fa-sort" style="font-size:10px;opacity:.5"></i>
                </th>
                <th>Telefone</th>
                <th class="sortable" data-sort="cnpj" style="cursor:pointer;user-select:none">
                  CNPJ/CPF <i class="fa-solid fa-sort" style="font-size:10px;opacity:.5"></i>
                </th>
                <th class="sortable" data-sort="email" style="cursor:pointer;user-select:none">
                  E-mail <i class="fa-solid fa-sort" style="font-size:10px;opacity:.5"></i>
                </th>
                <th>Endereço</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="fornecedoresTable"></tbody>
          </table>
        </div>
        <div id="fornecedoresPagination"></div>
      </section>

      <!-- MODAL FORNECEDOR -->
      <div class="modal-overlay hidden" id="fornecedorModal">
        <div class="modal-card modal-card--large fo-nc-card">
          <div class="modal-card__header">
            <div>
              <h3 id="fornecedorModalTitle">Novo fornecedor</h3>
              <p>Cadastre os dados do fornecedor no sistema</p>
            </div>
            <button type="button" class="icon-button" id="cancelFornecedor" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="fornecedorForm">
            <div class="fo-nc-body">

              <div class="fo-nc-section">
                <p class="fo-nc-section-title">Dados</p>
                <div class="fo-nc-card-group">
                  <div class="fo-nc-cell">
                    <span class="fo-nc-cell-ico fo-nc-cell-ico--blue"><i class="fa-solid fa-building"></i></span>
                    <div class="fo-nc-cell-content">
                      <label class="fo-nc-lbl" for="fornecedorNome">Nome <span class="fo-nc-req">*</span></label>
                      <input type="text" id="fornecedorNome" class="fo-nc-cell-input" placeholder="Razão social ou nome" autocomplete="off" required />
                    </div>
                  </div>
                  <div class="fo-nc-cell">
                    <span class="fo-nc-cell-ico"><i class="fa-solid fa-id-card"></i></span>
                    <div class="fo-nc-cell-content">
                      <label class="fo-nc-lbl" for="fornecedorCnpj">CNPJ / CPF</label>
                      <input type="text" id="fornecedorCnpj" class="fo-nc-cell-input" placeholder="00.000.000/0000-00 ou 000.000.000-00" autocomplete="off" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="fo-nc-section">
                <p class="fo-nc-section-title">Contato</p>
                <div class="fo-nc-card-group">
                  <div class="fo-nc-cells-2col">
                    <div class="fo-nc-cell">
                      <span class="fo-nc-cell-ico fo-nc-cell-ico--green"><i class="fa-solid fa-phone"></i></span>
                      <div class="fo-nc-cell-content">
                        <label class="fo-nc-lbl" for="fornecedorTelefone">Telefone</label>
                        <input type="text" id="fornecedorTelefone" class="fo-nc-cell-input" placeholder="(88) 99999-9999" autocomplete="off" />
                      </div>
                    </div>
                    <div class="fo-nc-cell">
                      <span class="fo-nc-cell-ico fo-nc-cell-ico--blue"><i class="fa-solid fa-envelope"></i></span>
                      <div class="fo-nc-cell-content">
                        <label class="fo-nc-lbl" for="fornecedorEmail">E-mail</label>
                        <input type="text" id="fornecedorEmail" class="fo-nc-cell-input" autocomplete="email" />
                        <small id="fornecedorEmailHint" style="font-size:10px;margin-top:1px;display:block"></small>
                      </div>
                    </div>
                  </div>
                  <div class="fo-nc-cells-2col">
                    <div class="fo-nc-cell">
                      <span class="fo-nc-cell-ico"><i class="fa-solid fa-user"></i></span>
                      <div class="fo-nc-cell-content">
                        <label class="fo-nc-lbl" for="fornecedorContato">Contato</label>
                        <input type="text" id="fornecedorContato" class="fo-nc-cell-input" placeholder="Nome do responsável" autocomplete="off" />
                      </div>
                    </div>
                    <div class="fo-nc-cell">
                      <span class="fo-nc-cell-ico fo-nc-cell-ico--purple"><i class="fa-solid fa-globe"></i></span>
                      <div class="fo-nc-cell-content">
                        <label class="fo-nc-lbl" for="fornecedorSite">Site</label>
                        <input type="text" id="fornecedorSite" class="fo-nc-cell-input" placeholder="https://..." autocomplete="off" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="fo-nc-section">
                <p class="fo-nc-section-title">Comercial</p>
                <div class="fo-nc-card-group">
                  <div class="fo-nc-cells-2col">
                    <div class="fo-nc-cell">
                      <span class="fo-nc-cell-ico fo-nc-cell-ico--orange"><i class="fa-solid fa-clock"></i></span>
                      <div class="fo-nc-cell-content">
                        <label class="fo-nc-lbl" for="fornecedorPrazoPagamento">Prazo (dias)</label>
                        <input type="number" id="fornecedorPrazoPagamento" class="fo-nc-cell-input" min="0" step="1" placeholder="Ex: 30" />
                      </div>
                    </div>
                    <div class="fo-nc-cell">
                      <span class="fo-nc-cell-ico"><i class="fa-solid fa-location-dot"></i></span>
                      <div class="fo-nc-cell-content">
                        <label class="fo-nc-lbl" for="fornecedorEndereco">Endereço</label>
                        <input type="text" id="fornecedorEndereco" class="fo-nc-cell-input" placeholder="Rua, número, cidade..." autocomplete="off" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="fo-nc-section">
                <p class="fo-nc-section-title">Observação</p>
                <textarea id="fornecedorObservacao" class="fo-nc-obs" rows="2" placeholder="Informações adicionais..."></textarea>
              </div>

            </div>

            <div class="modal-card__footer">
              <button type="button" class="btn btn-light" id="cancelFornecedorFooter">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  renderTable() {
    if (!this.el.table) return;

    // Atualiza contador
    const cont = document.getElementById('fornecedoresCont');
    if (cont) cont.textContent = this.state.filteredItems.length;

    // Atualiza ícones de sort nos cabeçalhos
    document.querySelectorAll('th.sortable').forEach((th) => {
      const col = th.dataset.sort;
      const icon = th.querySelector('i');
      if (!icon) return;
      if (col === this.state.ordem) {
        icon.className = `fa-solid fa-sort-${this.state.ordemDir === 'asc' ? 'up' : 'down'}`;
        icon.style.opacity = '1';
        icon.style.color = 'var(--primary)';
      } else {
        icon.className = 'fa-solid fa-sort';
        icon.style.opacity = '.4';
        icon.style.color = '';
      }
    });

    if (!this.state.filteredItems.length) {
      this.el.table.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state" style="padding:36px 24px">
            <i class="fa-solid fa-truck"></i>
            <strong>Nenhum fornecedor encontrado</strong>
            <p>Tente ajustar a busca ou cadastre um novo fornecedor.</p>
          </div>
        </td></tr>`;
      const pag = document.getElementById('fornecedoresPagination');
      if (pag) pag.innerHTML = '';
      return;
    }

    const start = (this.state.pagina - 1) * this.ITENS_POR_PAGINA;
    const page  = this.state.filteredItems.slice(start, start + this.ITENS_POR_PAGINA);

    this.el.table.innerHTML = page.map((f) => {
      const totalCompras = Number(f.total_compras || 0);
      const valorCompras = Number(f.valor_total_compras || 0);
      const comprasHtml = totalCompras > 0
        ? `<button class="btn-inline" data-action="historico-fornecedor" data-id="${f.id}"
             style="padding:1px 8px;font-size:11px;margin-top:3px">
             ${totalCompras} compra(s) · ${valorCompras.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
           </button>`
        : '';
      const contatoHtml = f.contato ? `<small style="display:block;color:var(--text-muted);font-size:11px;margin-top:2px">${escapeHtml(f.contato)}</small>` : '';
      return `
        <tr>
          <td>
            <div class="table-primary">
              <strong>${escapeHtml(f.nome || '-')}</strong>
              ${contatoHtml}
              ${comprasHtml}
            </div>
          </td>
          <td>${escapeHtml(f.telefone || '-')}</td>
          <td>${escapeHtml(f.cnpj || '-')}</td>
          <td>${escapeHtml(f.email || '-')}</td>
          <td>${escapeHtml(f.endereco || '-')}</td>
          <td class="text-right">
            <div class="table-actions">
              <button class="btn-inline" data-action="edit-fornecedor" data-id="${f.id}">
                <i class="fa-solid fa-pen"></i> Editar
              </button>
              <button class="btn-inline btn-inline--danger" data-action="delete-fornecedor" data-id="${f.id}">
                <i class="fa-solid fa-trash"></i> Excluir
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    this.renderPagination();
  },

  renderPagination() {
    const el = document.getElementById('fornecedoresPagination');
    if (!el) return;
    const total = this.state.filteredItems.length;
    const totalPag = Math.max(1, Math.ceil(total / this.ITENS_POR_PAGINA));
    if (totalPag <= 1) { el.innerHTML = ''; return; }
    const p = this.state.pagina;
    const ini = (p - 1) * this.ITENS_POR_PAGINA + 1;
    const fim = Math.min(p * this.ITENS_POR_PAGINA, total);
    el.innerHTML = `
      <div class="lf-pagination">
        <button class="lf-pagination__btn" type="button" data-action="forn-pagina" data-page="prev"
          ${p <= 1 ? 'disabled' : ''} aria-label="Anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <span class="lf-pagination__info">Página ${p} de ${totalPag}
          <small>(${ini}–${fim} de ${total})</small></span>
        <button class="lf-pagination__btn" type="button" data-action="forn-pagina" data-page="next"
          ${p >= totalPag ? 'disabled' : ''} aria-label="Próxima"><i class="fa-solid fa-chevron-right"></i></button>
      </div>`;
  },

  search(term) {
    const q = String(term || '').trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const tipo = this.state.filtroTipo;

    let result = this.state.items.filter((f) => {
      // Filtro por tipo de documento
      if (tipo === 'pj') {
        const d = String(f.cnpj || '').replace(/\D/g, '');
        if (d.length !== 14) return false;
      } else if (tipo === 'pf') {
        const d = String(f.cnpj || '').replace(/\D/g, '');
        if (d.length !== 11) return false;
      } else if (tipo === 'sem') {
        if (String(f.cnpj || '').replace(/\D/g, '').length > 0) return false;
      }

      if (!q) return true;
      const nome    = String(f.nome || '').toLowerCase();
      const tel     = String(f.telefone || '').toLowerCase();
      const email   = String(f.email || '').toLowerCase();
      const end     = String(f.endereco || '').toLowerCase();
      const cnpjD   = String(f.cnpj || '').replace(/\D/g, '');
      const contato = String(f.contato || '').toLowerCase();

      return (
        nome.includes(q) ||
        tel.includes(q) ||
        email.includes(q) ||
        end.includes(q) ||
        contato.includes(q) ||
        (qDigits.length >= 3 && cnpjD.includes(qDigits))
      );
    });

    this.state.filteredItems = this._sortItems(result);
    this.state.pagina = Math.min(
      this.state.pagina,
      Math.max(1, Math.ceil(this.state.filteredItems.length / this.ITENS_POR_PAGINA))
    );
    this.renderTable();
  },

  applyFilterSort() {
    this.state.filteredItems = this._sortItems(this.state.filteredItems);
    this.renderTable();
  },

  _sortItems(arr) {
    const { ordem, ordemDir } = this.state;
    if (!ordem) return arr;
    return [...arr].sort((a, b) => {
      const va = String(a[ordem] || '').toLowerCase();
      const vb = String(b[ordem] || '').toLowerCase();
      const cmp = va.localeCompare(vb, 'pt-BR');
      return ordemDir === 'asc' ? cmp : -cmp;
    });
  },

  getCurrentSearchValue() {
    const existingInput = document.getElementById('fornecedoresSearch');
    return existingInput?.value || '';
  },

  openModal(isEdit = false) {
    this._injectFoStyles();
    this.cache();

    if (!this.el.modal) return;

    this.el.modal.classList.remove('hidden');

    if (!isEdit) {
      this.state.editingId = null;
      this.el.form?.reset();

      if (this.el.modalTitle) {
        this.el.modalTitle.textContent = 'Novo fornecedor';
      }
    } else if (this.el.modalTitle) {
      this.el.modalTitle.textContent = 'Editar fornecedor';
    }
  },

  closeModal() {
    this.cache();

    if (this.el.modal) {
      this.el.modal.classList.add('hidden');
    }

    this.state.editingId = null;
    this.el.form?.reset();
  },

  edit(id) {
    const fornecedor = this.state.items.find((item) => String(item.id) === String(id));
    if (!fornecedor) return;

    this.state.editingId = Number(id);
    this.openModal(true);

    this.cache();

    if (this.el.nome)     this.el.nome.value     = fornecedor.nome || '';
    if (this.el.telefone) this.el.telefone.value = fornecedor.telefone || '';
    if (this.el.email)    this.el.email.value    = fornecedor.email || '';
    if (this.el.endereco) this.el.endereco.value = fornecedor.endereco || '';
    if (this.el.cnpj)     this.el.cnpj.value     = fornecedor.cnpj || '';
    if (this.el.observacao) this.el.observacao.value = fornecedor.observacao || '';
    if (this.el.contato)  this.el.contato.value  = fornecedor.contato || '';
    if (this.el.site)     this.el.site.value     = fornecedor.site || '';
    if (this.el.prazo)    this.el.prazo.value    = fornecedor.prazo_pagamento ?? '';
  },

  async save() {
    if (this.state.loading) return;
    this.cache();

    const payload = {
      empresa: this.state.empresa,
      empresa_id: api.getEmpresaId(),
      nome:            this.el.nome?.value?.trim() || '',
      telefone:        this.el.telefone?.value?.trim() || '',
      cnpj:            this.el.cnpj?.value?.trim() || '',
      email:           this.el.email?.value?.trim() || '',
      endereco:        this.el.endereco?.value?.trim() || '',
      observacao:      this.el.observacao?.value?.trim() || '',
      contato:         this.el.contato?.value?.trim() || '',
      site:            this.el.site?.value?.trim() || '',
      prazo_pagamento: Number(this.el.prazo?.value || 0) || null
    };

    if (!payload.nome) {
      this.setFeedback('Informe o nome do fornecedor.', 'error');
      return;
    }

    const cnpjNums = payload.cnpj.replace(/\D/g, '');
    if (cnpjNums.length > 0 && !validarCNPJ(cnpjNums)) {
      this.setFeedback('CNPJ inválido. Verifique os dígitos.', 'error');
      return;
    }

    this.state.loading = true;
    const btn = this.el.form?.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const message = this.state.editingId ? 'Atualizando fornecedor...' : 'Salvando fornecedor...';

      this.setFeedback(message, 'info');

      showToast(message, 'info');

      if (this.state.editingId) {
        await api.updateFornecedor(this.state.editingId, payload);
      } else {
        await api.createFornecedor(payload);
      }

      this.closeModal();
      await this.load();
      this.showMessage('Fornecedor salvo com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao salvar fornecedor:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    }
  },

  async delete(id) {
    const _forn = this.state.items.find(f => String(f.id) === String(id));
    const _nomeForn = _forn?.nome ? `"${_forn.nome}"` : 'este fornecedor';
    const ok = await confirmarAcao(`Excluir ${_nomeForn}? Esta ação não pode ser desfeita.`, 'Excluir', 'danger');
    if (!ok) return;
    if (this.state.loading) return;

    this.state.loading = true;
    try {
      this.setFeedback('Excluindo fornecedor...', 'info');

      showToast('Excluindo fornecedor...', 'info');

      await api.deleteFornecedor(id);

      await this.load();
      this.showMessage('Fornecedor excluído com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao excluir fornecedor:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
    }
  },

  setFeedback(message, type = '') {
    const feedback = document.getElementById('fornecedoresFeedback');
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

    const btnNovo = document.getElementById('novoFornecedorBtn');
    if (btnNovo) btnNovo.disabled = value;

    if (btnNovo) {
      btnNovo.innerHTML = value
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Carregando...'
        : '<i class="fa-solid fa-plus"></i> Novo Fornecedor';
    }
  },

  exportarCSV() {
    const lista = this.state.filteredItems.length ? this.state.filteredItems : this.state.items;
    exportCSV(lista.map((f) => ({
      'Nome':             f.nome || '',
      'Contato':          f.contato || '',
      'Telefone':         f.telefone || '',
      'CNPJ/CPF':         f.cnpj || '',
      'E-mail':           f.email || '',
      'Site':             f.site || '',
      'Endereço':         f.endereco || '',
      'Prazo Pgto (dias)': f.prazo_pagamento ?? '',
      'Total Compras':    numCSV(f.total_compras || 0),
      'Valor Compras':    numCSV(f.valor_total_compras || 0),
      'Observação':       f.observacao || ''
    })), 'fornecedores');
  },

  async abrirHistoricoCompras(id) {
    const forn = this.state.items.find((f) => Number(f.id) === id);
    if (!forn) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;max-width:700px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 50px rgba(0,0,0,.2)">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div>
            <h3 style="margin:0;font-size:16px">Histórico de Compras</h3>
            <p style="margin:2px 0 0;font-size:13px;color:var(--text-muted)">${escapeHtml(forn.nome)}</p>
          </div>
          <button id="_histFechar" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted)">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="_histCorpo" style="padding:20px 24px;overflow-y:auto;flex:1">
          <p style="color:var(--text-muted)">Carregando...</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#_histFechar').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });

    const corpo = overlay.querySelector('#_histCorpo');
    try {
      const res = await api.request(`/compras?empresa_id=${api.getEmpresaId()}&fornecedor_id=${id}&limit=50`);
      const compras = Array.isArray(res) ? res : (res?.data || res?.compras || []);
      if (!compras.length) {
        corpo.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px 0">Nenhuma compra registrada para este fornecedor.</p>';
        return;
      }
      const total = compras.reduce((s, c) => s + Number(c.valor_total || 0), 0);
      corpo.innerHTML = `
        <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted)">${compras.length} compra(s) · Total: <strong>${total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></p>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr>
              <th>Data</th><th>Nº / Referência</th><th class="text-right">Valor</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${compras.map((c) => `
                <tr>
                  <td>${c.data_compra ? new Date(c.data_compra).toLocaleDateString('pt-BR') : '-'}</td>
                  <td>${escapeHtml(c.numero_nota || c.referencia || String(c.id))}</td>
                  <td class="text-right">${Number(c.valor_total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                  <td><span class="badge badge--${c.status==='pago'?'success':c.status==='pendente'?'warning':'secondary'}">${escapeHtml(c.status||'-')}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      corpo.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message || 'Erro ao carregar compras.')}</p>`;
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
  }
};


function maskDocumento(value) {
  const d = String(value || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    // CPF: 000.000.000-00
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }
  // CNPJ: 00.000.000/0000-00
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function validarCNPJ(cnpj) {
  const n = String(cnpj).replace(/\D/g, '');
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const calc = (len) => {
    let s = 0, p = len - 7;
    for (let i = 0; i < len; i++) { s += parseInt(n[i]) * p--; if (p < 2) p = 9; }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(n[12]) && calc(13) === parseInt(n[13]);
}


export async function initFornecedoresModule() {
  FornecedoresModule.init();
  await FornecedoresModule.load();
}
