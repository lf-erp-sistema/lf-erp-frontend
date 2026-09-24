import api from './api.js';
import { getAuth } from './auth.js';
import { showToast, confirmarAcao } from './feedback.js';
import { exportCSV } from './exportUtils.js';
import { escapeHtml, maskPhone, debounce } from './utils.js';

const ClientesModule = {
  state: {
    items: [],
    filteredItems: [],
    empresa: null,
    editingId: null,
    initialized: false,
    eventsBound: false,
    loading: false,
    carregandoMais: false,
    total: 0,
    offset: 0,
    limite: 100
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
      container: document.getElementById('clientesContainer'),
      table: document.getElementById('clientesTable'),
      search: document.getElementById('clientesSearch'),
      modal: document.getElementById('clienteModal'),
      form: document.getElementById('clienteForm'),
      nome: document.getElementById('clienteNome'),
      telefone: document.getElementById('clienteTelefone'),
      cpf: document.getElementById('clienteCpf'),
      nascimento: document.getElementById('clienteNascimento'),
      endereco: document.getElementById('clienteEndereco'),
      feedback: document.getElementById('clientesFeedback'),
      modalTitle: document.getElementById('clienteModalTitle')
    };
  },

  bind() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;

    const debouncedSearch = debounce((v) => this.search(v), 350);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'clientesSearch') {
        debouncedSearch(e.target.value);
      }

      if (e.target.id === 'clienteCpf') {
        e.target.value = maskCPF(e.target.value);
      }

      if (e.target.id === 'clienteTelefone') {
        e.target.value = maskPhone(e.target.value);
      }
    });

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.id === 'exportarClientesBtn') {
        const lista = this.state.filteredItems.length
          ? this.state.filteredItems
          : this.state.items;
        exportCSV(lista.map((c) => ({
          'Nome':        c.nome || '',
          'Telefone':    c.telefone || '',
          'CPF/CNPJ':    c.cpf || c.cpf_cnpj || '',
          'Nascimento':  c.nascimento || '',
          'Endereco':    c.endereco || '',
          'Portal':      c.portal_ativo ? 'Sim' : 'Nao'
        })), 'clientes');
        return;
      }

      if (btn.id === 'abcClientesBtn') {
        this.mostrarABC();
        return;
      }

      if (btn.id === 'novoClienteBtn' || btn.id === 'clientesEmptyNewBtn') {
        this.openModal(false);
      }

      if (btn.id === 'cancelCliente' || btn.id === 'cancelClienteFooter') {
        this.closeModal();
      }

      if (btn.dataset.action === 'edit-cliente') {
        this.edit(btn.dataset.id);
      }

      if (btn.dataset.action === 'extrato-cliente') {
        await this.abrirExtrato(Number(btn.dataset.id), btn.dataset.nome);
      }

      if (btn.dataset.action === 'portal-cliente') {
        await this.configurarPortal(btn.dataset.id, btn.dataset.nome);
      }

      if (btn.dataset.action === 'delete-cliente') {
        await this.delete(btn.dataset.id);
      }

      if (btn.id === 'extratoClienteFecharBtn' || btn.id === 'extratoClienteFecharFooter') {
        document.getElementById('extratoClienteModal')?.classList.add('hidden');
      }

      if (btn.id === 'extratoClienteImprimirBtn') {
        this.imprimirExtrato();
      }
    });

    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'clienteForm') {
        e.preventDefault();
        await this.save();
      }
    });
  },

  async load() {
    this.resolveEmpresa();
    this.state.loading = true;
    this.setFeedback('Carregando clientes...', 'info');
    this.setLoading(true);


    try {
      const res = await api.getClientes({ limit: this.state.limite, offset: 0 });
      const { dados = [], total = 0, limite = 100 } = (res && !Array.isArray(res)) ? res : { dados: Array.isArray(res) ? res : [] };

      this.state.items        = dados;
      this.state.filteredItems = [...dados];
      this.state.total        = total || dados.length;
      this.state.offset       = 0;
      this.state.limite       = limite;

      this.render();
      this.cache();
      this.renderTable();
      this.setFeedback('', '');
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
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

  _injectClStyles() {
    if (document.getElementById('cl-nc-styles')) return;
    const s = document.createElement('style');
    s.id = 'cl-nc-styles';
    s.textContent = `
      .cl-nc-card { width: min(96vw, 560px) !important; max-height: 92vh; }
      .cl-nc-body { overflow-y: auto; }
      .cl-nc-section { padding: 16px 20px 0; }
      .cl-nc-section:last-child { padding-bottom: 20px; }
      .cl-nc-section-title { font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8px; }
      .cl-nc-card-group { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
      .cl-nc-cell { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface); transition: background .1s; }
      .cl-nc-cell:last-child { border-bottom: none; }
      .cl-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
      .cl-nc-cells-2col { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border); }
      .cl-nc-cells-2col:last-child { border-bottom: none; }
      .cl-nc-cells-2col .cl-nc-cell { border-bottom: none; }
      .cl-nc-cells-2col .cl-nc-cell:first-child { border-right: 1px solid var(--border); }
      .cl-nc-cell-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; background: var(--surface-2); color: var(--text-muted); }
      .cl-nc-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
      .cl-nc-cell-ico--blue { background: rgba(37,99,235,.1); color: #2563eb; }
      .cl-nc-cell-ico--red { background: rgba(220,38,38,.1); color: #dc2626; }
      .cl-nc-cell-ico--purple { background: rgba(124,58,237,.1); color: #7c3aed; }
      .cl-nc-cell-ico--orange { background: rgba(234,88,12,.1); color: #ea580c; }
      .cl-nc-cell-content { flex: 1; min-width: 0; }
      .cl-nc-lbl { display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
      .cl-nc-req { color: #dc2626; }
      .cl-nc-cell-input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-size: 0.93rem; font-weight: 600; color: var(--text); width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none; }
      select.cl-nc-cell-input { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat !important; background-position: right 0 center !important; padding-right: 16px !important; }
      .cl-nc-obs { width: 100%; resize: none; font-size: 0.9rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; font-family: inherit; color: var(--text); box-sizing: border-box; }
      @media (max-width: 600px) {
        .cl-nc-section { padding: 14px 16px 0; }
        .cl-nc-cells-2col { grid-template-columns: 1fr; }
        .cl-nc-cells-2col .cl-nc-cell:first-child { border-right: none; border-bottom: 1px solid var(--border); }
      }
    `;
    document.head.appendChild(s);
  },

  render() {
    const c = document.getElementById('clientesContainer');
    if (!c) return;

    c.innerHTML = `
      <section class="module-card">
        <div id="clientesFeedback" class="module-feedback"></div>

        <div class="module-toolbar">
          <div class="module-toolbar__search">
            <i class="fa-solid fa-search"></i>
            <input
              id="clientesSearch"
              placeholder="Buscar por nome, CPF ou telefone..."
              value="${escapeHtml(this.getCurrentSearchValue())}"
            />
          </div>

          <div class="module-toolbar__stats">
            <div class="mini-stat">
              <span>Total</span>
              <strong>${this.state.filteredItems.length}</strong>
            </div>
          </div>
          <div class="module-card__actions">
            <button class="btn btn-light" id="abcClientesBtn" title="Segmentação A/B/C por receita">
              <i class="fa-solid fa-chart-bar"></i> Curva ABC
            </button>
            <button class="btn btn-light" id="exportarClientesBtn">
              <i class="fa-solid fa-file-csv"></i> Exportar CSV
            </button>
            <button class="btn btn-primary" id="novoClienteBtn">
              <i class="fa-solid fa-plus"></i> Novo Cliente
            </button>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>CPF</th>
                <th>Nascimento</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="clientesTable"></tbody>
          </table>
        </div>
      </section>

      <div class="modal-overlay hidden" id="clienteModal">
        <div class="modal-card cl-nc-card">
          <div class="modal-card__header">
            <div>
              <h3 id="clienteModalTitle">${this.state.editingId ? 'Editar cliente' : 'Novo cliente'}</h3>
              <p>Cadastre os dados do cliente no sistema</p>
            </div>

            <button type="button" class="icon-button" id="cancelCliente" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="clienteForm">
            <div class="cl-nc-body">
              <div class="cl-nc-section">
                <p class="cl-nc-section-title">Dados do Cliente</p>
                <div class="cl-nc-card-group">
                  <div class="cl-nc-cell">
                    <span class="cl-nc-cell-ico cl-nc-cell-ico--blue"><i class="fa-solid fa-user"></i></span>
                    <div class="cl-nc-cell-content">
                      <label class="cl-nc-lbl" for="clienteNome">Nome <span class="cl-nc-req">*</span></label>
                      <input type="text" id="clienteNome" class="cl-nc-cell-input" placeholder="Nome completo" autocomplete="off" required />
                    </div>
                  </div>
                  <div class="cl-nc-cells-2col">
                    <div class="cl-nc-cell">
                      <span class="cl-nc-cell-ico cl-nc-cell-ico--green"><i class="fa-solid fa-phone"></i></span>
                      <div class="cl-nc-cell-content">
                        <label class="cl-nc-lbl" for="clienteTelefone">Telefone</label>
                        <input type="text" id="clienteTelefone" class="cl-nc-cell-input" placeholder="(88) 99999-9999" autocomplete="off" />
                      </div>
                    </div>
                    <div class="cl-nc-cell">
                      <span class="cl-nc-cell-ico"><i class="fa-solid fa-id-card"></i></span>
                      <div class="cl-nc-cell-content">
                        <label class="cl-nc-lbl" for="clienteCpf">CPF</label>
                        <input type="text" id="clienteCpf" class="cl-nc-cell-input" placeholder="000.000.000-00" autocomplete="off" />
                      </div>
                    </div>
                  </div>
                  <div class="cl-nc-cells-2col">
                    <div class="cl-nc-cell">
                      <span class="cl-nc-cell-ico cl-nc-cell-ico--blue"><i class="fa-solid fa-calendar-days"></i></span>
                      <div class="cl-nc-cell-content">
                        <label class="cl-nc-lbl" for="clienteNascimento">Nascimento</label>
                        <input type="date" id="clienteNascimento" class="cl-nc-cell-input" />
                      </div>
                    </div>
                    <div class="cl-nc-cell">
                      <span class="cl-nc-cell-ico cl-nc-cell-ico--orange"><i class="fa-solid fa-location-dot"></i></span>
                      <div class="cl-nc-cell-content">
                        <label class="cl-nc-lbl" for="clienteEndereco">Endereço</label>
                        <input type="text" id="clienteEndereco" class="cl-nc-cell-input" placeholder="Rua, número, bairro..." autocomplete="off" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-card__footer">
              <button type="button" class="btn btn-light" id="cancelClienteFooter">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  renderTable() {
    if (!this.el.table) return;

    if (!this.state.filteredItems.length) {
      this.el.table.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state" style="padding:36px 24px">
              <i class="fa-solid fa-users"></i>
              <strong>Nenhum cliente encontrado</strong>
              <p>Tente ajustar a busca ou cadastre um novo cliente.</p>
              <button class="btn btn-primary" id="clientesEmptyNewBtn">
                <i class="fa-solid fa-plus"></i> Novo cliente
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    this.el.table.innerHTML = this.state.filteredItems
      .map((cliente) => {
        const emAberto = Number(cliente.total_em_aberto || 0);
        const emAbertoHtml = emAberto > 0
          ? `<span style="display:inline-block;margin-top:3px;padding:1px 8px;background:rgba(220,38,38,0.1);color:#dc2626;border-radius:99px;font-size:11px;font-weight:700">${emAberto.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em aberto</span>`
          : '';
        return `
      <tr>
        <td>
          <div class="table-primary">
            <strong>${escapeHtml(cliente.nome || '-')}</strong>
            <small style="display:block; color: var(--text-muted); margin-top:4px;">
              ID: ${cliente.id}
            </small>
            ${emAbertoHtml}
          </div>
        </td>

        <td>${escapeHtml(cliente.telefone || '-')}</td>
        <td>${escapeHtml(cliente.cpf || '-')}</td>
        <td>${formatDate(cliente.nascimento)}</td>

        <td class="text-right">
          <div class="table-actions">
            <button class="btn-inline" data-action="edit-cliente" data-id="${cliente.id}">
              Editar
            </button>
            <button class="btn-inline" data-action="extrato-cliente" data-id="${cliente.id}" data-nome="${escapeHtml(cliente.nome || '')}">
              <i class="fa-solid fa-file-invoice-dollar"></i> Extrato
            </button>
            <button class="btn-inline ${cliente.portal_ativo ? 'btn-inline--active' : ''}" data-action="portal-cliente" data-id="${cliente.id}" data-nome="${escapeHtml(cliente.nome || '')}">
              <i class="fa-solid fa-globe"></i> Portal
            </button>
            <button class="btn-inline btn-inline--danger" data-action="delete-cliente" data-id="${cliente.id}">
              Excluir
            </button>
          </div>
        </td>
      </tr>
    `;
      })
      .join('');

    // Rodapé de paginação
    const jaCarregados = this.state.items.length;
    const restantes    = this.state.total - jaCarregados;

    let footer = document.getElementById('clientesPaginacaoFooter');
    if (!footer) {
      footer = document.createElement('div');
      footer.id = 'clientesPaginacaoFooter';
      footer.style.cssText = 'padding:14px 0;text-align:center;';
      this.el.table?.closest('table')?.parentElement?.after(footer);
    }

    if (restantes > 0) {
      footer.innerHTML = `
        <span style="font-size:12px;color:var(--text-muted);margin-right:12px">
          Exibindo ${jaCarregados.toLocaleString('pt-BR')} de ${this.state.total.toLocaleString('pt-BR')} clientes
        </span>
        <button id="clientesCarregarMaisBtn" class="btn btn-light" style="font-size:13px">
          <i class="fa-solid fa-chevron-down"></i> Carregar mais ${restantes.toLocaleString('pt-BR')}
        </button>`;
      document.getElementById('clientesCarregarMaisBtn')
        ?.addEventListener('click', () => this.carregarMais());
    } else if (this.state.total > this.state.limite) {
      footer.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">${jaCarregados.toLocaleString('pt-BR')} clientes carregados</span>`;
    } else {
      footer.innerHTML = '';
    }
  },

  async carregarMais() {
    if (this.state.carregandoMais || this.state.loading) return;
    const novoOffset = this.state.offset + this.state.limite;
    if (novoOffset >= this.state.total) return;

    this.state.carregandoMais = true;
    const btn = document.getElementById('clientesCarregarMaisBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Carregando...'; }

    try {
      const res = await api.getClientes({ limit: this.state.limite, offset: novoOffset });
      const { dados = [] } = (res && !Array.isArray(res)) ? res : { dados: Array.isArray(res) ? res : [] };
      this.state.items  = [...this.state.items, ...dados];
      this.state.offset = novoOffset;
      this.search(this.state.termoBusca || this.el.search?.value || '');
    } catch (e) {
      showToast('Erro ao carregar mais clientes', 'error');
    } finally {
      this.state.carregandoMais = false;
      const btn = document.getElementById('clientesCarregarMaisBtn');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Carregar mais'; }
    }
  },

  search(term) {
    const normalized = String(term || '')
      .trim()
      .toLowerCase();

    this.state.termoBusca = normalized;

    this.state.filteredItems = this.state.items.filter((cliente) => {
      const nome = String(cliente.nome || '').toLowerCase();
      const cpf = String(cliente.cpf || '').toLowerCase();
      const telefone = String(cliente.telefone || '').toLowerCase();

      return nome.includes(normalized) || cpf.includes(normalized) || telefone.includes(normalized);
    });

    this.renderTable();
  },

  getCurrentSearchValue() {
    const existingInput = document.getElementById('clientesSearch');
    return existingInput?.value || '';
  },

  openModal(isEdit = false) {
    this._injectClStyles();
    this.cache();

    if (!this.el.modal) return;

    this.el.modal.classList.remove('hidden');

    if (!isEdit) {
      this.state.editingId = null;
      this.el.form?.reset();

      if (this.el.modalTitle) {
        this.el.modalTitle.textContent = 'Novo cliente';
      }
    } else if (this.el.modalTitle) {
      this.el.modalTitle.textContent = 'Editar cliente';
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
    const cliente = this.state.items.find((item) => String(item.id) === String(id));
    if (!cliente) return;

    this.state.editingId = Number(id);
    this.openModal(true);

    this.cache();

    if (this.el.nome) this.el.nome.value = cliente.nome || '';
    if (this.el.telefone) this.el.telefone.value = cliente.telefone || '';
    if (this.el.cpf) this.el.cpf.value = cliente.cpf || '';
    if (this.el.nascimento) this.el.nascimento.value = normalizeDateInput(cliente.nascimento);
    if (this.el.endereco) this.el.endereco.value = cliente.endereco || '';
  },

  async save() {
    if (this.state.loading) return;
    this.cache();

    const payload = {
      empresa: this.state.empresa,
      empresa_id: api.getEmpresaId(),
      nome: this.el.nome?.value?.trim() || '',
      telefone: this.el.telefone?.value?.trim() || '',
      cpf: this.el.cpf?.value?.trim() || '',
      nascimento: this.el.nascimento?.value || '',
      endereco: this.el.endereco?.value?.trim() || ''
    };

    if (!payload.nome) {
      this.setFeedback('Informe o nome do cliente.', 'error');
      return;
    }

    const cpfNums = payload.cpf.replace(/\D/g, '');
    if (cpfNums.length > 0 && !validarCPF(cpfNums)) {
      this.setFeedback('CPF inválido. Verifique os dígitos.', 'error');
      return;
    }

    this.state.loading = true;
    const btn = this.el.form?.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const message = this.state.editingId ? 'Atualizando cliente...' : 'Salvando cliente...';

      this.setFeedback(message, 'info');

      showToast(message, 'info');

      if (this.state.editingId) {
        await api.updateCliente(this.state.editingId, payload);
      } else {
        await api.createCliente(payload);
      }

      this.closeModal();
      await this.load();
      this.showMessage('Cliente salvo com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    }
  },

  async delete(id) {
    const _cli = this.state.items.find(c => String(c.id) === String(id));
    const _nomeCli = _cli?.nome ? `"${_cli.nome}"` : 'este cliente';
    const ok = await confirmarAcao(`Excluir ${_nomeCli}? Esta ação não pode ser desfeita.`, 'Excluir', 'danger');
    if (!ok) return;
    if (this.state.loading) return;

    this.state.loading = true;
    try {
      this.setFeedback('Excluindo cliente...', 'info');

      showToast('Excluindo cliente...', 'info');

      await api.deleteCliente(id);

      await this.load();
      this.showMessage('Cliente excluído com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      const message = this.buildFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.state.loading = false;
    }
  },

  setFeedback(message, type = '') {
    const feedback = document.getElementById('clientesFeedback');
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

    const btnNovo = document.getElementById('novoClienteBtn');
    if (btnNovo) btnNovo.disabled = value;

    if (btnNovo) {
      btnNovo.innerHTML = value
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Carregando...'
        : '<i class="fa-solid fa-plus"></i> Novo Cliente';
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

  async configurarPortal(clienteId, clienteNome) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 6px;font-size:16px;font-weight:700">Portal do Cliente</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">${escapeHtml(clienteNome)} — defina uma senha de acesso ao portal. Mínimo 8 caracteres.</p>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Nova senha</label>
          <input type="password" id="_portalSenha" placeholder="Mínimo 8 caracteres" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box" />
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
          O cliente acessa em: <strong>/portal.html</strong> com seu CPF/CNPJ + esta senha.
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_portalCancelar" class="btn-cancel">Cancelar</button>
          <button id="_portalSalvar" class="btn-confirm">Salvar senha</button>
        </div>
        <div id="_portalFeedback" style="margin-top:10px;font-size:13px;display:none"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#_portalCancelar').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.querySelector('#_portalSalvar').addEventListener('click', async () => {
      const senha = overlay.querySelector('#_portalSenha').value;
      const feedback = overlay.querySelector('#_portalFeedback');
      const saveBtn = overlay.querySelector('#_portalSalvar');

      if (!senha || senha.length < 8) {
        feedback.style.cssText = 'margin-top:10px;font-size:13px;display:block;color:var(--danger)';
        feedback.textContent = 'A senha deve ter ao menos 8 caracteres.';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';

      try {
        await api.configurarPortalCliente(Number(clienteId), senha);
        feedback.style.cssText = 'margin-top:10px;font-size:13px;display:block;color:var(--success)';
        feedback.textContent = 'Senha configurada! Portal ativado para o cliente.';
        saveBtn.textContent = 'Salvo ✓';
        setTimeout(() => { document.body.removeChild(overlay); this.load(); }, 1500);
      } catch (err) {
        feedback.style.cssText = 'margin-top:10px;font-size:13px;display:block;color:var(--danger)';
        feedback.textContent = err.message || 'Erro ao configurar portal.';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar senha';
      }
    });
  },

  // ── Segmentação A/B/C ──────────────────────────────────────────────────────

  async mostrarABC() {
    const container = document.getElementById('clientesContainer');
    if (!container) return;

    // Skeleton enquanto carrega
    container.innerHTML = `
      <div class="module-card">
        <div class="module-card__header">
          <div>
            <h3>Curva ABC — Segmentação de Clientes</h3>
            <p>Classificação por contribuição de receita (Pareto)</p>
          </div>
          <button class="btn btn-light" id="abcVoltarBtn"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
        </div>
        <div style="padding:32px;text-align:center;color:var(--text-muted)">
          <div class="skeleton" style="height:80px;border-radius:var(--radius-sm);margin-bottom:16px"></div>
          <div class="skeleton" style="height:300px;border-radius:var(--radius-sm)"></div>
        </div>
      </div>`;

    document.getElementById('abcVoltarBtn').addEventListener('click', () => {
      this.render(); this.cache(); this.renderTable();
    });

    try {
      const data = await api.getClientesABC();
      this.renderPainelABC(data, container);
    } catch (err) {
      container.innerHTML = `<div class="module-card">
        <div class="module-feedback module-feedback--error">Erro ao carregar segmentação: ${escapeHtml(err.message || 'Tente novamente.')}</div>
        <button class="btn btn-light" style="margin:16px" id="clientesABCVoltarBtn"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
      </div>`;
      container.querySelector('#clientesABCVoltarBtn')?.addEventListener('click', (e) => {
        e.target.closest('.module-card')?.remove();
      });
    }
  },

  renderPainelABC(data, container) {
    const cur = (v) => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pct = (v) => Number(v||0).toFixed(1) + '%';

    const receitaGeral = Number(data.receita_geral || 0);
    const resumo = data.resumo || {};

    const pctA = receitaGeral > 0 && resumo.A ? ((resumo.A.receita / receitaGeral) * 100) : 0;
    const pctB = receitaGeral > 0 && resumo.B ? ((resumo.B.receita / receitaGeral) * 100) : 0;
    const pctC = receitaGeral > 0 && resumo.C ? ((resumo.C.receita / receitaGeral) * 100) : 0;

    const badgeCls = { A: 'badge--success', B: 'badge--warning', C: 'badge--danger' };

    container.innerHTML = `
      <div class="module-card">
        <div class="module-card__header">
          <div>
            <h3>Curva ABC — Segmentação de Clientes</h3>
            <p>${escapeHtml(String(data.total_clientes ?? 0))} cliente(s) com histórico de compras · Total: ${cur(receitaGeral)}</p>
          </div>
          <button class="btn btn-light" id="abcVoltarBtn2"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
        </div>

        <!-- Cards de resumo -->
        <div class="abc-resumo-grid">
          ${['A','B','C'].map(cls => {
            const r = resumo[cls] || { receita: 0, clientes: 0 };
            const p = receitaGeral > 0 ? ((r.receita / receitaGeral) * 100).toFixed(1) : '0.0';
            const desc = cls === 'A' ? 'Clientes estratégicos — prioridade máxima'
                       : cls === 'B' ? 'Clientes importantes — fidelização ativa'
                       : 'Clientes ocasionais — potencial de crescimento';
            return `
              <div class="abc-classe-card abc-classe-card--${cls.toLowerCase()}">
                <span class="abc-classe-card__label">Classe ${cls}</span>
                <span class="abc-classe-card__qtd">${r.clientes}</span>
                <span class="abc-classe-card__receita">${cur(r.receita)}</span>
                <span class="abc-classe-card__pct">${p}% da receita total</span>
                <span style="font-size:.75rem;color:var(--text-muted);margin-top:4px">${desc}</span>
              </div>`;
          }).join('')}
        </div>

        <!-- Barra proporcional -->
        <div class="abc-barra-wrap" title="Distribuição de receita por classe">
          <div class="abc-barra-a" style="width:${pctA.toFixed(1)}%" title="Classe A: ${pctA.toFixed(1)}%"></div>
          <div class="abc-barra-b" style="width:${pctB.toFixed(1)}%" title="Classe B: ${pctB.toFixed(1)}%"></div>
          <div class="abc-barra-c" style="width:${pctC.toFixed(1)}%" title="Classe C: ${pctC.toFixed(1)}%"></div>
        </div>

        <!-- Tabela ranking -->
        ${data.clientes.length === 0
          ? `<div class="empty-state" style="padding:40px;text-align:center;color:var(--text-muted)">
               <i class="fa-solid fa-chart-bar" style="font-size:2rem;opacity:.3;display:block;margin-bottom:12px"></i>
               <p>Nenhuma venda vinculada a clientes encontrada.</p>
             </div>`
          : `<div class="table-wrapper">
               <table class="data-table">
                 <thead>
                   <tr>
                     <th>#</th>
                     <th>Cliente</th>
                     <th>Vendas</th>
                     <th class="text-right">Receita</th>
                     <th class="text-right">% do total</th>
                     <th class="text-right">% acumulado</th>
                     <th>Classe</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${data.clientes.map((c, i) => `
                     <tr>
                       <td style="color:var(--text-muted);font-size:.85rem">${i + 1}</td>
                       <td><strong>${escapeHtml(c.nome)}</strong></td>
                       <td>${c.num_vendas}</td>
                       <td class="text-right">${cur(c.receita_total)}</td>
                       <td class="text-right">${pct(c.percentual)}</td>
                       <td class="text-right">${pct(c.percentual_acumulado)}</td>
                       <td><span class="badge ${badgeCls[c.classe]}">${c.classe}</span></td>
                     </tr>`).join('')}
                 </tbody>
               </table>
             </div>`
        }
      </div>`;

    document.getElementById('abcVoltarBtn2').addEventListener('click', () => {
      this.render(); this.cache(); this.renderTable();
    });
  },

  // ── Extrato do cliente ──────────────────────────────────────────────────────

  async abrirExtrato(clienteId, clienteNome) {
    // Injeta modal se ainda não existe
    if (!document.getElementById('extratoClienteModal')) {
      const el = document.createElement('div');
      el.className = 'modal-overlay hidden';
      el.id = 'extratoClienteModal';
      el.innerHTML = `
        <div class="modal-card" style="max-width:780px;width:95vw">
          <div class="modal-card__header">
            <div>
              <h3 id="extratoClienteTitulo">Extrato</h3>
              <p id="extratoClienteSubtitulo" style="color:var(--text-muted);font-size:.9rem"></p>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button type="button" class="btn btn-light btn-sm" id="extratoClienteImprimirBtn">
                <i class="fa-solid fa-print"></i> Imprimir
              </button>
              <button type="button" class="icon-button" id="extratoClienteFecharBtn">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
          <div id="extratoClienteCorpo" style="padding:20px 24px 24px;overflow-y:auto;max-height:70vh">
            <div class="skeleton-line" style="height:80px;border-radius:12px;margin-bottom:16px"></div>
            <div class="skeleton-line" style="height:200px;border-radius:12px"></div>
          </div>
          <div class="modal-card__footer" style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
            <button type="button" class="btn btn-light" id="extratoClienteFecharFooter">Fechar</button>
          </div>
        </div>`;
      document.body.appendChild(el);
    }

    const modal = document.getElementById('extratoClienteModal');
    const titulo = document.getElementById('extratoClienteTitulo');
    const subtitulo = document.getElementById('extratoClienteSubtitulo');
    const corpo = document.getElementById('extratoClienteCorpo');

    if (titulo) titulo.textContent = `Extrato — ${escapeHtml(clienteNome || 'Cliente')}`;
    if (subtitulo) subtitulo.textContent = 'Carregando...';
    modal.classList.remove('hidden');

    try {
      const data = await api.request(`/clientes/${clienteId}/extrato`, { method: 'GET', query: { empresa_id: api.getEmpresaId() } });
      this._extratoAtual = data;
      this._renderExtratoCorpo(data, corpo, subtitulo);
    } catch (err) {
      if (corpo) corpo.innerHTML = `<div class="module-feedback module-feedback--error">${escapeHtml(err.message || 'Erro ao carregar extrato')}</div>`;
    }
  },

  _renderExtratoCorpo(data, corpo, subtitulo) {
    const { cliente, resumo, parcelas } = data;
    const cur = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dt  = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR') : '-';

    const statusLabel = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado', parcial: 'Parcial', parcial_atrasado: 'Parcial em atraso' };
    const statusClass = { pago: 'badge--success', pendente: 'badge--warning', atrasado: 'badge--danger', parcial: 'badge--info', parcial_atrasado: 'badge--danger' };

    if (subtitulo) {
      subtitulo.textContent = resumo.qtd_pendente > 0
        ? `${resumo.qtd_pendente} parcela(s) em aberto · Total: ${cur(resumo.total_aberto)}`
        : 'Sem pendências financeiras';
    }

    corpo.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:20px">
        ${[
          ['Em aberto',   resumo.total_aberto,   resumo.total_aberto > 0   ? 'var(--warning,#d69e2e)' : 'var(--text-muted)'],
          ['Atrasado',    resumo.total_atrasado,  resumo.total_atrasado > 0 ? 'var(--danger,#e53e3e)'  : 'var(--text-muted)'],
          ['Já recebido', resumo.total_pago,      'var(--success,#38a169)'],
          ['Parcial',     resumo.total_parcial,   resumo.total_parcial > 0  ? 'var(--info,#3182ce)'    : 'var(--text-muted)']
        ].map(([label, valor, cor]) => `
          <div style="border:1px solid var(--border);border-radius:14px;padding:14px">
            <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:4px">${label}</div>
            <div style="font-size:1.1rem;font-weight:800;color:${cor}">${cur(valor)}</div>
          </div>`).join('')}
      </div>

      ${parcelas.length === 0
        ? `<div class="empty-state">Nenhum lançamento financeiro encontrado para este cliente.</div>`
        : `<div class="table-wrapper">
           <table class="data-table">
             <thead><tr>
               <th>Venda</th><th>Parcela</th><th>Vencimento</th>
               <th class="text-right">Valor</th><th class="text-right">Atualizado</th>
               <th>Pagamento</th><th>Status</th>
             </tr></thead>
             <tbody>
               ${parcelas.map((p) => `
                 <tr>
                   <td><small>#${escapeHtml(String(p.venda_id || '-'))}</small></td>
                   <td>${p.parcela}/${p.total_parcelas}</td>
                   <td>${dt(p.data_vencimento)}${p.dias_atraso > 0 ? `<br><small style="color:var(--danger,#e53e3e)">${p.dias_atraso}d atraso</small>` : ''}</td>
                   <td class="text-right">${cur(p.valor)}</td>
                   <td class="text-right">${p.valor_atualizado !== p.valor ? `<strong>${cur(p.valor_atualizado)}</strong>` : cur(p.valor)}</td>
                   <td>${dt(p.data_pagamento)}</td>
                   <td><span class="badge ${statusClass[p.status] || ''}">${statusLabel[p.status] || escapeHtml(String(p.status || ''))}</span></td>
                 </tr>`).join('')}
             </tbody>
           </table>
           </div>`}`;
  },

  imprimirExtrato() {
    const data = this._extratoAtual;
    if (!data) return;

    const { cliente, resumo, parcelas } = data;
    const cur = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dt  = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR') : '-';
    const statusLabel = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado', parcial: 'Parcial', parcial_atrasado: 'Parcial em atraso' };

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Extrato — ${escapeHtml(cliente.nome || '')}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 24px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .resumo { display: flex; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
        .resumo-item { border: 1px solid #ddd; border-radius: 8px; padding: 10px 16px; min-width: 130px; }
        .resumo-item .label { font-size: 11px; color: #666; }
        .resumo-item .valor { font-size: 15px; font-weight: bold; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #f5f5f5; text-align: left; padding: 7px 10px; font-size: 12px; }
        td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
        .text-right { text-align: right; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>Extrato — ${escapeHtml(cliente.nome || '')}</h1>
      <div style="color:#666;font-size:12px">
        ${cliente.cpf || cliente.cpf_cnpj ? `CPF/CNPJ: ${escapeHtml(cliente.cpf || cliente.cpf_cnpj)} &nbsp;|&nbsp;` : ''}
        ${cliente.telefone ? `Tel: ${escapeHtml(cliente.telefone)} &nbsp;|&nbsp;` : ''}
        Gerado em: ${new Date().toLocaleDateString('pt-BR')}
      </div>
      <div class="resumo">
        <div class="resumo-item"><div class="label">Em aberto</div><div class="valor">${cur(resumo.total_aberto)}</div></div>
        <div class="resumo-item"><div class="label">Atrasado</div><div class="valor" style="color:#c53030">${cur(resumo.total_atrasado)}</div></div>
        <div class="resumo-item"><div class="label">Já recebido</div><div class="valor" style="color:#276749">${cur(resumo.total_pago)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Venda</th><th>Parcela</th><th>Vencimento</th>
          <th class="text-right">Valor</th><th class="text-right">Atualizado</th>
          <th>Pagamento</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${parcelas.map((p) => `
            <tr>
              <td>#${p.venda_id || '-'}</td>
              <td>${p.parcela}/${p.total_parcelas}</td>
              <td>${dt(p.data_vencimento)}</td>
              <td class="text-right">${cur(p.valor)}</td>
              <td class="text-right">${cur(p.valor_atualizado)}</td>
              <td>${dt(p.data_pagamento)}</td>
              <td>${statusLabel[p.status] || escapeHtml(String(p.status || ''))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </body></html>`;

    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) {
      showToast('Popup bloqueado. Permita popups para imprimir o extrato.', 'warning');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }
};

function maskCPF(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function validarCPF(cpf) {
  const n = String(cpf).replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i);
  let d1 = (s * 10) % 11; if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(n[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i);
  let d2 = (s * 10) % 11; if (d2 >= 10) d2 = 0;
  return d2 === parseInt(n[10]);
}


function formatDate(value) {
  if (!value) return '-';

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('pt-BR');
}

function normalizeDateInput(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(date);
}


export async function initClientesModule() {
  ClientesModule.init();
  await ClientesModule.load();
}
