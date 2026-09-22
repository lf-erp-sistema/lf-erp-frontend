import api from './api.js';
import { getAuth } from './auth.js';
import { confirmarAcao } from './feedback.js';
import { escapeHtml, debounce } from './utils.js';

const UsuariosModule = {
  state: {
    items: [],
    filteredItems: [],
    empresa: null,
    editingId: null,
    initialized: false,
    eventsBound: false,
    loading: false,
    filtroTipo: '',
    ordem: 'nome',
    ordemDir: 'asc'
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
      container: document.getElementById('usuariosContainer'),
      table: document.getElementById('usuariosTable'),
      search: document.getElementById('usuariosSearch'),
      modal: document.getElementById('usuarioModal'),
      form: document.getElementById('usuarioForm'),
      nome: document.getElementById('usuarioNome'),
      usuario: document.getElementById('usuarioLogin'),
      senha: document.getElementById('usuarioSenha'),
      email: document.getElementById('usuarioEmail'),
      tipo: document.getElementById('usuarioTipo'),
      feedback: document.getElementById('usuariosFeedback'),
      modalTitle: document.getElementById('usuarioModalTitle')
    };
  },

  bind() {
    if (this.state.eventsBound) return;
    this.state.eventsBound = true;

    this._injectStyles();

    const debouncedSearch = debounce((v) => this.search(v), 350);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'usuariosSearch') {
        debouncedSearch(e.target.value);
      }
      if (e.target.id === 'usuarioSenha') {
        this.atualizarMedidorSenha(e.target.value);
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'usuariosFiltroTipo') {
        this.state.filtroTipo = e.target.value;
        this.search(document.getElementById('usuariosSearch')?.value || '');
      }
    });

    document.addEventListener('click', async (e) => {
      // Fechar modal ao clicar no overlay
      if (e.target.id === 'usuarioModal') {
        this.closeModal();
        return;
      }

      // Toggle mostrar/ocultar senha
      if (e.target.closest('#usuarioSenhaToggle')) {
        const input = document.getElementById('usuarioSenha');
        const icon = document.querySelector('#usuarioSenhaToggle i');
        if (input && icon) {
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
        return;
      }

      // Ordenação por coluna
      const th = e.target.closest('th[data-sort-col]');
      if (th) {
        const col = th.dataset.sortCol;
        if (this.state.ordem === col) {
          this.state.ordemDir = this.state.ordemDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.ordem = col;
          this.state.ordemDir = 'asc';
        }
        this.search(document.getElementById('usuariosSearch')?.value || '');
        return;
      }

      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.id === 'novoUsuarioBtn') {
        this.openModal(false);
      }

      if (btn.id === 'cancelUsuario' || btn.id === 'cancelUsuarioFooter') {
        this.closeModal();
      }

      if (btn.dataset.action === 'edit-usuario') {
        this.edit(btn.dataset.id);
      }

      if (btn.dataset.action === 'delete-usuario') {
        await this.delete(btn.dataset.id);
      }
    });

    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'usuarioForm') {
        e.preventDefault();
        await this.save();
      }
    });
  },

  _injectStyles() {
    if (document.getElementById('usuarios-styles')) return;
    const s = document.createElement('style');
    s.id = 'usuarios-styles';
    s.textContent = `
      .usuario-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: var(--primary-soft, rgba(59,130,246,.15));
        color: var(--primary, #3b82f6);
        font-size: .75rem; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center;
        flex-shrink: 0; user-select: none;
      }
      .usuario-nome-cell { display: flex; align-items: center; gap: 10px; }
      .badge-perfil {
        display: inline-block; padding: 2px 10px; border-radius: 99px;
        font-size: .72rem; font-weight: 700; letter-spacing: .03em;
      }
      .badge-perfil--admin    { background: #dbeafe; color: #1d4ed8; }
      .badge-perfil--gerente  { background: #fef3c7; color: #92400e; }
      .badge-perfil--func     { background: #f1f5f9; color: #475569; }
      @media (prefers-color-scheme: dark) {
        .badge-perfil--admin   { background: #1e3a5f; color: #93c5fd; }
        .badge-perfil--gerente { background: #3b2a00; color: #fcd34d; }
        .badge-perfil--func    { background: #1e293b; color: #94a3b8; }
      }
      [data-theme="dark"] .badge-perfil--admin   { background: #1e3a5f; color: #93c5fd; }
      [data-theme="dark"] .badge-perfil--gerente { background: #3b2a00; color: #fcd34d; }
      [data-theme="dark"] .badge-perfil--func    { background: #1e293b; color: #94a3b8; }
      mark.search-hl { background: #fef08a; color: inherit; border-radius: 2px; padding: 0 1px; }
      [data-theme="dark"] mark.search-hl { background: #854d0e; }
      th[data-sort-col] { cursor: pointer; user-select: none; white-space: nowrap; }
      th[data-sort-col]:hover { color: var(--primary); }
      .sort-icon { margin-left: 4px; font-size: .7rem; opacity: .5; }
      .sort-icon--active { opacity: 1; color: var(--primary); }
      .senha-wrapper { position: relative; }
      .senha-wrapper input { padding-right: 38px; }
      #usuarioSenhaToggle {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        background: none; border: none; cursor: pointer; color: var(--text-muted);
        padding: 4px; display: flex; align-items: center;
      }
      #usuarioSenhaToggle:hover { color: var(--text); }
    `;
    document.head.appendChild(s);
  },

  async load() {
    this.resolveEmpresa();
    this.state.loading = true;
    this.setFeedback('Carregando usuários...', 'info');

    try {
      const data = await api.getUsuarios({ empresa: this.state.empresa, empresa_id: api.getEmpresaId() });
      this.state.items = Array.isArray(data) ? data : [];
      this.state.filteredItems = [...this.state.items];

      this.render();
      this.cache();
      this.renderTable();
      this.setFeedback('', '');
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      this.state.items = [];
      this.state.filteredItems = [];

      this.render();
      this.cache();
      this.renderTable();
      this.setFeedback(error.message || 'Erro ao carregar usuários.', 'error');
    } finally {
      this.state.loading = false;
    }
  },

  render() {
    const c = document.getElementById('usuariosContainer');
    if (!c) return;

    const sortIcon = (col) => {
      if (this.state.ordem !== col) return `<i class="fa-solid fa-sort sort-icon"></i>`;
      const ic = this.state.ordemDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
      return `<i class="fa-solid ${ic} sort-icon sort-icon--active"></i>`;
    };

    c.innerHTML = `
      <section class="module-card">
        <div id="usuariosFeedback" class="module-feedback"></div>

        <div class="module-toolbar">
          <div class="module-toolbar__search">
            <i class="fa-solid fa-search"></i>
            <input
              id="usuariosSearch"
              placeholder="Buscar por nome, login ou perfil..."
              value="${escapeHtml(this.getCurrentSearchValue())}"
            />
          </div>

          <select id="usuariosFiltroTipo" class="filter-input" style="min-width:140px">
            <option value="">Todos os perfis</option>
            <option value="admin" ${this.state.filtroTipo === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="gerente" ${this.state.filtroTipo === 'gerente' ? 'selected' : ''}>Gerente</option>
            <option value="funcionario" ${this.state.filtroTipo === 'funcionario' ? 'selected' : ''}>Funcionário</option>
          </select>

          <div class="module-toolbar__stats">
            <div class="mini-stat">
              <span>Total</span>
              <strong>${this.state.filteredItems.length}</strong>
            </div>
          </div>
          <div class="module-card__actions">
            <button class="btn btn-primary" type="button" id="novoUsuarioBtn">
              <i class="fa-solid fa-plus"></i> Novo Usuário
            </button>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th data-sort-col="nome">Nome ${sortIcon('nome')}</th>
                <th data-sort-col="usuario">Login ${sortIcon('usuario')}</th>
                <th data-sort-col="tipo">Perfil ${sortIcon('tipo')}</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="usuariosTable"></tbody>
          </table>
        </div>
      </section>

      <div class="modal-overlay hidden" id="usuarioModal">
        <div class="modal-card">
          <div class="modal-card__header">
            <div>
              <h3 id="usuarioModalTitle">${this.state.editingId ? 'Editar usuário' : 'Novo usuário'}</h3>
              <p>Cadastre o acesso do colaborador ao sistema</p>
            </div>

            <button type="button" class="icon-button" id="cancelUsuario" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="usuarioForm" class="form-grid">
            <div class="form-field form-field--span-2">
              <label for="usuarioNome">Nome</label>
              <input id="usuarioNome" type="text" autocomplete="name" required />
            </div>

            <div class="form-field">
              <label for="usuarioLogin">Login</label>
              <input id="usuarioLogin" type="text" autocomplete="username" required />
            </div>

            <div class="form-field">
              <label for="usuarioEmail">E-mail <span style="font-weight:400;color:var(--text-muted)">(opcional)</span></label>
              <input id="usuarioEmail" type="email" autocomplete="email" placeholder="usuario@email.com" />
            </div>

            <div class="form-field">
              <label for="usuarioSenha">Senha</label>
              <div class="senha-wrapper">
                <input
                  id="usuarioSenha"
                  type="password"
                  placeholder="${this.state.editingId ? 'Deixe em branco para manter a senha atual' : 'Informe a senha inicial'}"
                />
                <button type="button" id="usuarioSenhaToggle" tabindex="-1" aria-label="Mostrar/ocultar senha">
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
              <div id="senhaMedidor" class="senha-medidor hidden">
                <div class="senha-barra"><div id="senhaBarra" class="senha-barra__fill"></div></div>
                <span id="senhaLabel" class="senha-label"></span>
              </div>
            </div>

            <div class="form-field">
              <label for="usuarioTipo">Perfil</label>
              <select id="usuarioTipo" class="filter-input" required>
                <option value="admin">Admin</option>
                <option value="gerente">Gerente</option>
                <option value="funcionario">Funcionário</option>
              </select>
            </div>

            ${this.state.editingId ? `
            <div class="form-field form-field--span-2">
              <details id="permissoesSection">
                <summary style="cursor:pointer;font-weight:600;font-size:.88rem;color:var(--text-muted);padding:4px 0;user-select:none">
                  <i class="fa-solid fa-shield-halved" style="margin-right:6px"></i>Permissões avançadas
                </summary>
                <div id="permissoesGrid" style="margin-top:12px">
                  <div style="font-size:.8rem;color:var(--text-muted);padding:8px 0">Carregando…</div>
                </div>
              </details>
            </div>` : ''}

            <div class="modal-card__footer">
              <button type="button" class="btn btn-light" id="cancelUsuarioFooter">
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
          <td colspan="4">
            <div class="module-feedback module-feedback--info" style="margin: 12px;">
              Nenhum usuário encontrado.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const term = document.getElementById('usuariosSearch')?.value?.trim() || '';

    this.el.table.innerHTML = this.state.filteredItems
      .map((u) => `
      <tr>
        <td>
          <div class="usuario-nome-cell">
            <div class="usuario-avatar">${this._getInitials(u.nome)}</div>
            <div class="table-primary">
              <strong>${this._highlight(u.nome || '-', term)}</strong>
              <small style="display:block; color: var(--text-muted); margin-top:2px;">ID: ${u.id}</small>
            </div>
          </div>
        </td>

        <td>${this._highlight(u.usuario || '-', term)}</td>

        <td>${formatTipoBadge(u.tipo)}</td>

        <td class="text-right">
          <div class="table-actions">
            <button class="btn-inline" data-action="edit-usuario" data-id="${u.id}">Editar</button>
            <button class="btn-inline btn-inline--danger" data-action="delete-usuario" data-id="${u.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `)
      .join('');
  },

  search(term) {
    const normalized = String(term || '').trim().toLowerCase();

    let result = this.state.items.filter((item) => {
      if (this.state.filtroTipo && item.tipo !== this.state.filtroTipo) return false;
      const nome    = String(item.nome || '').toLowerCase();
      const usuario = String(item.usuario || '').toLowerCase();
      const tipo    = String(item.tipo || '').toLowerCase();
      return !normalized || nome.includes(normalized) || usuario.includes(normalized) || tipo.includes(normalized);
    });

    result = this._sortItems(result);
    this.state.filteredItems = result;
    this.render();
    this.cache();
    this.renderTable();
  },

  _sortItems(arr) {
    const { ordem, ordemDir } = this.state;
    return [...arr].sort((a, b) => {
      const va = String(a[ordem] || '').toLowerCase();
      const vb = String(b[ordem] || '').toLowerCase();
      const cmp = va.localeCompare(vb, 'pt-BR');
      return ordemDir === 'asc' ? cmp : -cmp;
    });
  },

  _highlight(text, term) {
    const safe = escapeHtml(String(text || ''));
    if (!term) return safe;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="search-hl">$1</mark>');
  },

  _getInitials(nome) {
    const parts = String(nome || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return String(nome || '?')[0].toUpperCase();
  },

  getCurrentSearchValue() {
    const existingInput = document.getElementById('usuariosSearch');
    return existingInput?.value || '';
  },

  openModal(isEdit = false) {
    this.cache();

    if (!this.el.modal) return;

    this.el.modal.classList.remove('hidden');

    if (!isEdit) {
      this.state.editingId = null;
      this.el.form?.reset();

      if (this.el.tipo) {
        this.el.tipo.value = 'funcionario';
      }

      if (this.el.modalTitle) {
        this.el.modalTitle.textContent = 'Novo usuário';
      }
    } else if (this.el.modalTitle) {
      this.el.modalTitle.textContent = 'Editar usuário';
    }
  },

  atualizarMedidorSenha(senha) {
    const medidor = document.getElementById('senhaMedidor');
    const barra   = document.getElementById('senhaBarra');
    const label   = document.getElementById('senhaLabel');
    if (!medidor || !barra || !label) return;

    if (!senha) {
      medidor.classList.add('hidden');
      return;
    }

    medidor.classList.remove('hidden');

    const tem8    = senha.length >= 8;
    const temMaiu = /[A-Z]/.test(senha);
    const temNum  = /[0-9]/.test(senha);
    const temEsp  = /[^A-Za-z0-9]/.test(senha);
    const pontos  = [tem8, temMaiu, temNum, temEsp].filter(Boolean).length;

    barra.className = 'senha-barra__fill';
    if (pontos <= 1) {
      barra.classList.add('senha-barra__fill--fraco');
      label.textContent = 'Fraca';
      label.style.color = 'var(--danger, #e53e3e)';
    } else if (pontos === 2) {
      barra.classList.add('senha-barra__fill--medio');
      label.textContent = 'Média';
      label.style.color = '#d69e2e';
    } else {
      barra.classList.add('senha-barra__fill--forte');
      label.textContent = 'Forte';
      label.style.color = 'var(--success, #38a169)';
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
    const usuario = this.state.items.find((item) => String(item.id) === String(id));
    if (!usuario) return;

    this.state.editingId = Number(id);
    this.openModal(true);

    this.cache();

    if (this.el.nome) this.el.nome.value = usuario.nome || '';
    if (this.el.usuario) this.el.usuario.value = usuario.usuario || '';
    if (this.el.senha) this.el.senha.value = '';
    if (this.el.email) this.el.email.value = usuario.email || '';
    if (this.el.tipo) this.el.tipo.value = usuario.tipo || 'funcionario';

    if (!document.getElementById('permissoesGrid') && this.el.form) {
      const footer = this.el.form.querySelector('.modal-card__footer');
      const section = document.createElement('div');
      section.className = 'form-field form-field--span-2';
      section.innerHTML = `
        <details id="permissoesSection">
          <summary style="cursor:pointer;font-weight:600;font-size:.88rem;color:var(--text-muted);padding:4px 0;user-select:none">
            <i class="fa-solid fa-shield-halved" style="margin-right:6px"></i>Permissões avançadas
          </summary>
          <div id="permissoesGrid" style="margin-top:12px">
            <div style="font-size:.8rem;color:var(--text-muted);padding:8px 0">Carregando…</div>
          </div>
        </details>`;
      if (footer) {
        this.el.form.insertBefore(section, footer);
      } else {
        this.el.form.appendChild(section);
      }
    }

    this.carregarPermissoes(Number(id));
  },

  async carregarPermissoes(usuarioId) {
    const grid = document.getElementById('permissoesGrid');
    if (!grid) return;
    try {
      const data = await api.request(`/usuarios/${usuarioId}/permissoes`, { method: 'GET', query: { empresa_id: api.getEmpresaId() } });
      this.renderPermissoesGrid(grid, data.permissoes, data.tipo);
    } catch {
      grid.innerHTML = '<div style="font-size:.8rem;color:var(--text-muted)">Não foi possível carregar permissões.</div>';
    }
  },

  renderPermissoesGrid(container, permissoes, tipo) {
    if (!permissoes || typeof permissoes !== 'object') {
      container.innerHTML = '<div style="font-size:.8rem;color:var(--text-muted)">Nenhuma permissão disponível.</div>';
      return;
    }
    const LABELS = {
      produtos: 'Produtos', clientes: 'Clientes', fornecedores: 'Fornecedores',
      compras: 'Compras', vendas: 'Vendas', estoque: 'Estoque',
      financeiro: 'Financeiro', relatorios: 'Relatórios',
      dre: 'DRE', lucratividade: 'Lucratividade',
      usuarios: 'Usuários', configuracoes: 'Configurações'
    };
    const ACOES = ['ver', 'criar', 'editar', 'deletar'];

    const rows = Object.entries(permissoes).map(([modulo, p]) => {
      const label = LABELS[modulo] || escapeHtml(modulo);
      const checks = ACOES.map((acao) => {
        const val = p[`pode_${acao}`] ? 'checked' : '';
        return `<td style="text-align:center">
          <input type="checkbox" ${val}
            data-perm-modulo="${escapeHtml(modulo)}" data-perm-acao="${acao}"
            style="width:15px;height:15px;cursor:pointer">
        </td>`;
      }).join('');
      return `<tr>
        <td style="font-size:.82rem;padding:4px 8px 4px 0;white-space:nowrap">${label}</td>
        ${checks}
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:6px">
        Perfil base: <strong>${escapeHtml(String(tipo || '-'))}</strong> — marque para sobrescrever individualmente
      </div>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr>
              <th style="text-align:left;font-size:.75rem;padding:2px 8px 6px 0;color:var(--text-muted);font-weight:600">Módulo</th>
              ${ACOES.map((a) => `<th style="font-size:.75rem;text-align:center;padding:2px 4px 6px;color:var(--text-muted);font-weight:600">${a.charAt(0).toUpperCase()+a.slice(1)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  async save() {
    this.cache();

    if (this.state.loading) return;
    this.state.loading = true;

    const saveBtn = this.el.form?.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.disabled = true;

    const emailVal = this.el.email?.value?.trim() || '';
    const payload = {
      empresa: this.state.empresa,
      empresa_id: api.getEmpresaId(),
      nome: this.el.nome?.value?.trim() || '',
      usuario: this.el.usuario?.value?.trim() || '',
      tipo: this.el.tipo?.value || 'funcionario',
      ...(emailVal ? { email: emailVal } : {})
    };

    const senha = this.el.senha?.value?.trim() || '';
    if (senha) {
      payload.senha = senha;
    }

    if (!payload.nome || !payload.usuario || !payload.tipo) {
      this.setFeedback('Preencha os campos obrigatórios.', 'error');
      this.state.loading = false;
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    if (!this.state.editingId && !payload.senha) {
      this.setFeedback('Informe a senha para o novo usuário.', 'error');
      this.state.loading = false;
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    if (payload.senha) {
      const s = payload.senha;
      if (s.length < 8 || s.length > 128 || !/[A-Z]/.test(s) || !/[0-9]/.test(s)) {
        this.setFeedback('Senha fraca: use entre 8 e 128 caracteres, 1 maiúscula e 1 número.', 'error');
        this.state.loading = false;
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
    }

    try {
      this.setFeedback(
        this.state.editingId ? 'Atualizando usuário...' : 'Salvando usuário...',
        'info'
      );

      if (this.state.editingId) {
        await api.updateUsuario(this.state.editingId, payload);
        await this.salvarPermissoes(this.state.editingId);
      } else {
        await api.createUsuario(payload);
      }

      this.closeModal();
      await this.load();
      this.setFeedback('Usuário salvo com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      this.setFeedback(error.message || 'Erro ao salvar usuário.', 'error');
    } finally {
      this.state.loading = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  async salvarPermissoes(usuarioId) {
    const checks = document.querySelectorAll('[data-perm-modulo]');
    if (!checks.length) return;

    const permissoes = {};
    checks.forEach((el) => {
      const m = el.dataset.permModulo;
      const a = el.dataset.permAcao;
      if (!permissoes[m]) permissoes[m] = {};
      permissoes[m][`pode_${a}`] = el.checked;
    });

    try {
      await api.request(`/usuarios/${usuarioId}/permissoes`, {
        method: 'PUT',
        body: { permissoes, empresa_id: api.getEmpresaId() }
      });
    } catch (err) {
      console.warn('[permissoes] Erro ao salvar:', err.message);
    }
  },

  async delete(id) {
    const _usu = this.state.items.find(u => String(u.id) === String(id));
    const _nomeUsu = _usu?.nome ? `o usuário "${_usu.nome}"` : 'este usuário';
    const ok = await confirmarAcao(`Deseja realmente excluir ${_nomeUsu}?`, 'Excluir');
    if (!ok) return;
    if (this.state.loading) return;

    try {
      this.state.loading = true;
      this.setFeedback('Excluindo usuário...', 'info');

      await api.deleteUsuario(id);

      await this.load();
      this.setFeedback('Usuário excluído com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao excluir usuário:', error);
      this.setFeedback(error.message || 'Erro ao excluir usuário.', 'error');
    } finally {
      this.state.loading = false;
    }
  },

  setFeedback(message, type = '') {
    const feedback = document.getElementById('usuariosFeedback');
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
  }
};

function formatTipoBadge(tipo) {
  const mapa = {
    admin:       { label: 'Admin',       cls: 'badge-perfil--admin' },
    gerente:     { label: 'Gerente',     cls: 'badge-perfil--gerente' },
    funcionario: { label: 'Funcionário', cls: 'badge-perfil--func' }
  };
  const entry = mapa[tipo];
  if (entry) return `<span class="badge-perfil ${entry.cls}">${entry.label}</span>`;
  return `<span class="badge-perfil badge-perfil--func">${escapeHtml(tipo || '-')}</span>`;
}



export async function initUsuariosModule() {
  UsuariosModule.init();
  await UsuariosModule.load();
}
