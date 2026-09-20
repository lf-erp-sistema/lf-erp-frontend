import api from './api.js';
import dashboard from './dashboard.js';
import { showToast } from './feedback.js';
import { login as authLogin, logout as authLogout, getAuth, validateSession, scheduleTokenRefresh, saveAuth } from './auth.js';
import { escapeHtml, makeSortable } from './utils.js';

const AppState = {
  isAuthenticated: false,
  currentView: 'dashboard',
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  globalFiltersExpanded: false,
  authToken: null,
  user: null,
  empresa: null,
  empresaId: null,
  rememberSession: false,
  loadingCount: 0,
  permissoes: null,
  filters: {
    periodo: '7dias',
    dataInicial: '',
    dataFinal: '',
    busca: ''
  }
};

const STORAGE_KEYS = {
  filters: 'lf_erp_global_filters',
  currentView: 'lf_erp_current_view'
};

const VIEW_CONFIG = {
  cadastros:            { icon: 'database',               title: 'Cadastros',             subtitle: 'Produtos, clientes, fornecedores e usuários' },
  movimentacoes:        { icon: 'arrow-right-arrow-left', title: 'Movimentações',         subtitle: 'Vendas, compras e estoque' },
  financeiro:           { icon: 'wallet',                 title: 'Financeiro',            subtitle: 'Contas, fluxo de caixa e lançamentos' },
  dashboard:            { icon: 'chart-pie',              title: 'Dashboard',             subtitle: 'Visão geral do sistema' },
  pdv:                  { icon: 'cash-register',          title: 'PDV',                   subtitle: 'Ponto de venda rápido e profissional' },
  produtos:             { icon: 'box-open',               title: 'Produtos',              subtitle: 'Cadastro, edição, estoque e consulta' },
  clientes:             { icon: 'users',                  title: 'Clientes',              subtitle: 'Cadastro e relacionamento comercial' },
  fornecedores:         { icon: 'truck-field',            title: 'Fornecedores',          subtitle: 'Base completa de fornecedores e compras' },
  usuarios:             { icon: 'user-shield',            title: 'Usuários',              subtitle: 'Gestão de acessos, perfis e permissões' },
  vendas:               { icon: 'cart-shopping',          title: 'Vendas',                subtitle: 'Consulta e gestão comercial' },
  compras:              { icon: 'basket-shopping',        title: 'Compras',               subtitle: 'Lançamentos e histórico de aquisições' },
  estoque:              { icon: 'warehouse',              title: 'Estoque',               subtitle: 'Posição, conferência e movimentações' },
  'contas-receber':     { icon: 'money-bill-trend-up',   title: 'Contas a Receber',      subtitle: 'Títulos pendentes, vencidos e recebidos' },
  'contas-pagar':       { icon: 'money-bill-transfer',   title: 'Contas a Pagar',        subtitle: 'Despesas, vencimentos e quitações' },
  'fluxo-caixa':        { icon: 'arrow-trend-up',        title: 'Fluxo de Caixa',        subtitle: 'Entradas, saídas e saldo consolidado' },
  lancamentos:          { icon: 'pen-to-square',         title: 'Lançamentos',           subtitle: 'Receitas e despesas manuais' },
  conciliacao:          { icon: 'building-columns',      title: 'Conciliação Bancária',  subtitle: 'Reconciliação de extratos OFX e CSV' },
  relatorios:           { icon: 'file-lines',            title: 'Relatórios',            subtitle: 'Relatórios gerenciais e operacionais' },
  orcamentos:           { icon: 'file-lines',            title: 'Orçamentos',            subtitle: 'Cotações emitidas — gerencie aprovações e converta em pedidos' },
  pedidos:              { icon: 'clipboard-list',        title: 'Pedidos',               subtitle: 'Pedidos em andamento — confirme, separe e converta em venda' },
  comissoes:            { icon: 'percent',               title: 'Comissões',             subtitle: 'Comissões de vendedores por venda realizada' },
  caixa:                { icon: 'vault',                 title: 'Caixa',                 subtitle: 'Abertura, movimentações e fechamento do caixa físico' },
  devolucoes:           { icon: 'rotate-left',           title: 'Devoluções',            subtitle: 'Devoluções de vendas — estoque restaurado automaticamente' },
  alertas:              { icon: 'bell',                  title: 'Alertas de Cobrança',   subtitle: 'Lembretes de pagamento por email e WhatsApp' },
  nfe:                  { icon: 'file-invoice',          title: 'NF-e',                  subtitle: 'Emissão, consulta e cancelamento de Notas Fiscais Eletrônicas' },
  bi:                   { icon: 'chart-line',            title: 'BI Executivo',          subtitle: 'Relatórios executivos com gráficos avançados e análises temporais' },
  filiais:              { icon: 'store',                 title: 'Multi-filial',          subtitle: 'Pontos de venda independentes com comparativo consolidado' },
  'checkout-links':     { icon: 'link',                  title: 'Link de Pagamento',     subtitle: 'Gere links de cobrança com PIX e Boleto' },
  fidelidade:           { icon: 'star',                  title: 'Programa de Fidelidade',subtitle: 'Pontos por compra, ranking e resgate' },
  whatsapp:             { icon: 'comment-dots',          title: 'WhatsApp Business',     subtitle: 'Cobranças automáticas e mensagens via API' },
  rastreabilidade:      { icon: 'barcode',               title: 'Rastreabilidade',       subtitle: 'Controle de lotes e números de série' },
  'api-publica':        { icon: 'code',                  title: 'API & Webhooks',        subtitle: 'Integração com sistemas externos via API Key e webhooks' },
  'exportacao-contabil':{ icon: 'file-export',           title: 'Exportação Contábil',   subtitle: 'Arquivos CSV e EFD/SPED para o contador' },
  crm:                  { icon: 'chart-gantt',           title: 'CRM',                   subtitle: 'Pipeline de oportunidades de venda' },
  marketplace:          { icon: 'shop',                  title: 'Marketplace',           subtitle: 'Integração com Mercado Livre e Shopee' },
  configuracoes:        { icon: 'gear',                  title: 'Configurações',         subtitle: 'Parâmetros e preferências do sistema' }
};

// Mapeamento view → módulo de permissão (backend)
const VIEW_MODULO = {
  dashboard:             'dashboard',
  pdv:                   'vendas',
  produtos:              'produtos',
  clientes:              'clientes',
  fornecedores:          'fornecedores',
  usuarios:              'usuarios',
  vendas:                'vendas',
  compras:               'compras',
  estoque:               'estoque',
  devolucoes:            'devolucoes',
  caixa:                 'caixa',
  'contas-receber':      'financeiro',
  'contas-pagar':        'financeiro',
  'fluxo-caixa':         'financeiro',
  lancamentos:           'financeiro',
  conciliacao:           'financeiro',
  'auditoria-financeira':'financeiro',
  nfe:                   'nfe',
  orcamentos:            'orcamentos',
  pedidos:               'pedidos',
  relatorios:            'relatorios',
  bi:                    'bi',
  'exportacao-contabil': 'exportacao',
  crm:                   'crm',
  comissoes:             'comissoes',
  fidelidade:            'fidelidade',
  alertas:               'alertas',
  whatsapp:              'whatsapp',
  marketplace:           'marketplace',
  'api-publica':         'configuracoes',
  'checkout-links':      'checkout',
  filiais:               'filiais',
  rastreabilidade:       'rastreabilidade',
  configuracoes:         'configuracoes',
};

async function carregarPermissoes() {
  try {
    const data = await api.getMinhasPermissoes();
    AppState.permissoes = data;
  } catch {
    const tipo = AppState.user?.tipo;
    const isAdminFallback = tipo === 'admin' || !!AppState.user?.is_saas_owner;
    AppState.permissoes = { isAdmin: isAdminFallback };
  }
  aplicarPermissoesMenu();
}

function aplicarPermissoesMenu() {
  const perm = AppState.permissoes;
  const isAdmin = !perm || perm.isAdmin
    || AppState.user?.tipo === 'admin'
    || AppState.user?.is_saas_owner;

  // Admin: restaura visibilidade de tudo (exceto itens com lógica própria)
  if (isAdmin) {
    document.querySelectorAll('[data-view]').forEach(el => {
      if (el.id === 'lixeiraNavBtn' || el.id === 'adminNavLink') return;
      el.style.removeProperty('display');
    });
    document.querySelectorAll('.nav-group').forEach(g => g.style.removeProperty('display'));
    document.getElementById('navAdvancedToggle')?.style.removeProperty('display');
    return;
  }

  // Outros perfis: aplica visibilidade por módulo
  document.querySelectorAll('[data-view]').forEach(el => {
    const view = el.getAttribute('data-view');
    if (!view || view === 'lixeira') return;
    const modulo = VIEW_MODULO[view];
    if (!modulo) return;
    const podeVer = perm.permissoes?.[modulo]?.pode_ver === true;
    el.style.display = podeVer ? '' : 'none';
  });

  // Esconde grupos sem nenhum subitem visível
  document.querySelectorAll('.nav-group').forEach(group => {
    const algumVisivel = [...group.querySelectorAll('.nav-subitem[data-view]')]
      .some(s => s.style.display !== 'none');
    group.style.display = algumVisivel ? '' : 'none';
  });

  // Esconde seção "Mais recursos" se todos os grupos dentro dela estiverem ocultos
  const advSection = document.getElementById('navAdvancedSection');
  const advToggle  = document.getElementById('navAdvancedToggle');
  if (advSection && advToggle) {
    const algumVisivel = [...advSection.querySelectorAll('.nav-group')]
      .some(g => g.style.display !== 'none');
    advToggle.style.display  = algumVisivel ? '' : 'none';
    advSection.style.display = algumVisivel ? '' : 'none';
  }
}

// ── Tema (dark / light) ────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('lf_erp_theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    const isDark = theme === 'dark';
    btn.innerHTML = `<i class="fa-solid fa-${isDark ? 'sun' : 'moon'}"></i>`;
    btn.title = isDark ? 'Modo claro' : 'Modo escuro';
  }
}

function initTheme() {
  const saved = localStorage.getItem('lf_erp_theme') || 'light';
  applyTheme(saved);
}

// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initializeApp();
});

async function initializeApp() {
  cacheInitialState();
  document.querySelectorAll('.view-section[data-view]').forEach((sec) => {
    const view = sec.getAttribute('data-view');
    const label = VIEW_CONFIG[view]?.title || view;
    if (!sec.getAttribute('aria-label')) sec.setAttribute('aria-label', label);
  });
  document.querySelectorAll('i.fa-solid, i.fa-regular, i.fa-brands').forEach((icon) => {
    if (!icon.hasAttribute('aria-hidden')) icon.setAttribute('aria-hidden', 'true');
  });
  bindEvents();
  readFiltersFromURL();
  restoreSavedFilters();
  restoreCurrentViewFromStorage();
  applyDefaultPeriodDates();
  updateFiltersUI();
  renderInitialDashboardState();
  showGlobalLoader('Inicializando sistema...');

  // Acorda o servidor imediatamente no page load — paralelo à restauração de sessão.
  // Se o dyno do Render estiver dormindo (>15 min de inatividade), o servidor começa
  // a acordar agora, antes de qualquer tentativa de login.
  api.warmupServer();

  try {
    await restoreAuthSession();
  } catch (error) {
    console.warn('Sessão não restaurada:', error);
    showLoginScreen();
  } finally {
    hideGlobalLoader();
  }
}

function cacheInitialState() {
  const rememberCheckbox = document.getElementById('rememberSession');
  if (rememberCheckbox) {
    AppState.rememberSession = rememberCheckbox.checked;
  }
}

function bindEvents() {
  bindLoginEvents();
  bindSidebarEvents();
  bindNavigationEvents();
  bindFilterEvents();
  bindTopbarEvents();
  bindModalEvents();
  initCommandPalette();
  bindCommandPaletteShortcut();
}

function bindLoginEvents() {
  const loginForm = document.getElementById('loginForm');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const loginHelpBtn = document.getElementById('loginHelpBtn');
  const rememberSession = document.getElementById('rememberSession');
  const loginSenha = document.getElementById('loginSenha');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  // ── Registro self-service ────────────────────────────────────────────────────
  document.getElementById('abrirRegistroBtn')?.addEventListener('click', () => {
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('registroScreen')?.classList.remove('hidden');
  });

  document.getElementById('voltarLoginBtn')?.addEventListener('click', () => {
    document.getElementById('registroScreen')?.classList.add('hidden');
    document.getElementById('loginScreen')?.classList.remove('hidden');
  });

  document.getElementById('registroForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registroSubmitBtn');
    const msg = document.getElementById('registroMessage');

    const nome_empresa    = document.getElementById('regNomeEmpresa')?.value?.trim() || '';
    const nome_responsavel = document.getElementById('regNome')?.value?.trim() || '';
    const email           = document.getElementById('regEmail')?.value?.trim() || '';
    const usuario         = document.getElementById('regUsuario')?.value?.trim() || '';
    const senha           = document.getElementById('regSenha')?.value || '';

    if (!nome_empresa || !usuario || !senha) {
      if (msg) { msg.textContent = 'Preencha os campos obrigatórios.'; msg.className = 'form-message form-message--error'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando conta...'; }
    if (msg) { msg.textContent = ''; msg.className = 'form-message'; }

    try {
      const data = await api.request('/registro', {
        method: 'POST',
        body: { nome_empresa, nome_responsavel, email, usuario, senha }
      });

      // Auto-login com o token retornado
      const authPayload = {
        authToken: data.token,
        empresa: data.empresa,
        empresaId: data.empresa?.id,
        user: { ...data.user, empresa_id: data.empresa?.id, empresa: data.empresa?.nome }
      };
      saveAuth(authPayload, true);
      scheduleTokenRefresh();

      document.getElementById('registroScreen')?.classList.add('hidden');
      applyAuthData(authPayload);
      renderAuthenticatedUser();
      renderTrialBanner();
      await carregarPermissoes();
      showMainScreen();
      await setActiveView('dashboard');
      showToast(`Bem-vindo! Seu trial de 14 dias começou.`, 'success');
      mostrarWizardBoasVindas(data.empresa?.nome);
    } catch (err) {
      if (msg) {
        msg.textContent = err?.message || 'Erro ao criar conta. Tente novamente.';
        msg.className = 'form-message form-message--error';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Criar minha conta'; }
    }
  });

  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
  }

  if (loginHelpBtn) {
    loginHelpBtn.addEventListener('click', () => {
      openGlobalModal({
        title: 'Ajuda de acesso',
        body: `
          <div class="modal-help-content">
            <p>O login usa o backend real.</p>
            <p>Confira os pontos abaixo se houver falha:</p>
            <ul>
              <li>Backend online</li>
              <li>Endpoint <strong>/login</strong> respondendo</li>
              <li>Usuário e senha corretos</li>
              <li>API URL correta no arquivo <strong>api.js</strong></li>
            </ul>
          </div>
        `,
        footer: `
          <button type="button" class="btn btn-primary" id="closeHelpModalBtn">Entendi</button>
        `
      });

      const closeHelpModalBtn = document.getElementById('closeHelpModalBtn');
      if (closeHelpModalBtn) {
        closeHelpModalBtn.addEventListener('click', closeGlobalModal);
      }
    });
  }

  if (rememberSession) {
    rememberSession.addEventListener('change', (event) => {
      AppState.rememberSession = event.target.checked;
    });
  }

  if (loginSenha) {
    loginSenha.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const loginFormElement = document.getElementById('loginForm');
        if (loginFormElement) {
          loginFormElement.requestSubmit();
        }
      }
    });
  }
}

function bindSidebarEvents() {
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const mobileSidebarBtn = document.getElementById('mobileSidebarBtn');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const logoutBtn = document.getElementById('logoutBtn');
  const navGroupToggles = document.querySelectorAll('.nav-group__toggle');

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', toggleSidebarCollapse);
  }

  if (mobileSidebarBtn) {
    mobileSidebarBtn.addEventListener('click', () => {
      if (window.innerWidth <= 1200) {
        openMobileSidebar();
      }
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  const topbarUserBtn = document.getElementById('topbarUserBtn');
  const topbarUserDropdown = document.getElementById('topbarUserDropdown');
  if (topbarUserBtn && topbarUserDropdown) {
    topbarUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !topbarUserDropdown.hidden;
      topbarUserDropdown.hidden = open;
      topbarUserBtn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', (e) => {
      if (!topbarUserBtn.contains(e.target) && !topbarUserDropdown.contains(e.target)) {
        topbarUserDropdown.hidden = true;
        topbarUserBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !topbarUserDropdown.hidden) {
        topbarUserDropdown.hidden = true;
        topbarUserBtn.setAttribute('aria-expanded', 'false');
        topbarUserBtn.focus();
      }
    });
  }

  navGroupToggles.forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = button.closest('.nav-group');
      if (!group) return;
      const isOpen = group.classList.contains('open');
      document.querySelectorAll('.nav-group.open').forEach((g) => g.classList.remove('open'));
      if (!isOpen) group.classList.add('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-group.open').forEach((g) => g.classList.remove('open'));
  });

  const advancedToggle = document.getElementById('navAdvancedToggle');
  if (advancedToggle) {
    advancedToggle.addEventListener('click', () => {
      const section = document.getElementById('navAdvancedSection');
      const isOpen = advancedToggle.classList.toggle('open');
      section?.classList.toggle('open', isOpen);
      try { localStorage.setItem('lf_nav_advanced', isOpen ? '1' : '0'); } catch {}
    });
  }
}

function _saveNavGroupState() {
  try {
    const open = [...document.querySelectorAll('.nav-group.open')].map((g) => g.dataset.group).filter(Boolean);
    localStorage.setItem('lf_nav_groups', JSON.stringify(open));
  } catch {}
}

function restoreNavGroupState() {
  try {
    const advOpen = localStorage.getItem('lf_nav_advanced') === '1';
    if (advOpen) {
      document.getElementById('navAdvancedToggle')?.classList.add('open');
      document.getElementById('navAdvancedSection')?.classList.add('open');
    }
  } catch {}
}

function bindNavigationEvents() {
  const navItems = document.querySelectorAll(
    '.nav-item[data-view], .nav-subitem[data-view], .nav-shortcut[data-view]'
  );

  navItems.forEach((item) => {
    item.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const view = item.getAttribute('data-view');
      if (!view) return;

      document.querySelectorAll('.nav-group.open').forEach((g) => g.classList.remove('open'));
      await setActiveView(view);
    });
  });
}

function bindFilterEvents() {
  const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
  const closeGlobalFiltersBtn = document.getElementById('closeGlobalFiltersBtn');
  const globalFiltersContent = document.getElementById('globalFiltersContent');
  const filtroPeriodo = document.getElementById('filtroPeriodo');
  const filtroDataInicial = document.getElementById('filtroDataInicial');
  const filtroDataFinal = document.getElementById('filtroDataFinal');
  const filtroBuscaGlobal = document.getElementById('filtroBuscaGlobal');
  const applyGlobalFiltersBtn = document.getElementById('applyGlobalFiltersBtn');
  const clearGlobalFiltersBtn = document.getElementById('clearGlobalFiltersBtn');

  if (toggleFiltersBtn && globalFiltersContent) {
    toggleFiltersBtn.addEventListener('click', () => {
      globalFiltersContent.classList.toggle('hidden');
      if (!globalFiltersContent.classList.contains('hidden')) {
        updateGlobalFilterContextNote();
      }
    });
  }

  if (closeGlobalFiltersBtn && globalFiltersContent) {
    closeGlobalFiltersBtn.addEventListener('click', () => {
      globalFiltersContent.classList.add('hidden');
    });
  }

  if (filtroPeriodo) {
    filtroPeriodo.addEventListener('change', (event) => {
      AppState.filters.periodo = event.target.value;
      if (event.target.value !== 'personalizado') {
        applyDefaultPeriodDates();
      }
      updateFiltersUI();
    });
  }

  if (filtroDataInicial) {
    filtroDataInicial.addEventListener('change', (event) => {
      AppState.filters.dataInicial = event.target.value;
      saveFiltersToStorage();
    });
  }

  if (filtroDataFinal) {
    filtroDataFinal.addEventListener('change', (event) => {
      AppState.filters.dataFinal = event.target.value;
      saveFiltersToStorage();
    });
  }

  if (filtroBuscaGlobal) {
    filtroBuscaGlobal.addEventListener('input', (event) => {
      AppState.filters.busca = event.target.value;
    });
  }

  if (applyGlobalFiltersBtn) {
    applyGlobalFiltersBtn.addEventListener('click', applyGlobalFilters);
  }

  if (clearGlobalFiltersBtn) {
    clearGlobalFiltersBtn.addEventListener('click', clearGlobalFilters);
  }

  // Botões de período rápido do dashboard
  document.querySelectorAll('[data-quick-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const periodo = btn.dataset.quickPeriod;
      AppState.filters.periodo = periodo;
      applyDefaultPeriodDates();
      if (filtroPeriodo) filtroPeriodo.value = periodo;
      updateFiltersUI();
      applyGlobalFilters();
    });
  });
}

// ── Notificações in-app ─────────────────────────────────────────────────────

let _notifCarregadas = false;
let _sseEventSource = null;
let _sseReconnectTimer = null;
let _sseReconnectDelay = 3000;

function _escNotif(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function carregarNotificacoes() {
  try {
    const data = await api.request('/notificacoes', { method: 'GET' });
    const lista = data.notificacoes || [];

    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (lista.length > 0) {
        badge.textContent = String(lista.length);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    const listaEl = document.getElementById('notifLista');
    if (!listaEl) return;

    if (!lista.length) {
      listaEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.88rem">
        <i class="fa-solid fa-check-circle" style="font-size:1.5rem;color:var(--success,#38a169);margin-bottom:8px;display:block"></i>
        Tudo em ordem!
      </div>`;
      return;
    }

    listaEl.innerHTML = lista.map((n) => {
      const cor = /^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\))$/.test(n.cor) ? n.cor : 'var(--primary)';
      const icone = /^fa-[a-z0-9-]+$/.test(n.icone) ? n.icone : 'fa-bell';
      return `
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:12px;align-items:flex-start"
        class="notif-item" data-view="${_escNotif(n.link || '')}">
        <div style="width:34px;height:34px;border-radius:10px;background:${cor}22;color:${cor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fa-solid ${icone}" style="font-size:.85rem"></i>
        </div>
        <div style="min-width:0">
          <div style="font-weight:700;font-size:.88rem;color:var(--text);margin-bottom:2px">${_escNotif(n.titulo)}</div>
          <div style="font-size:.8rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escNotif(n.texto)}</div>
        </div>
      </div>`;
    }).join('');

    // Clique em item → navega para a view
    listaEl.querySelectorAll('.notif-item[data-view]').forEach((el) => {
      el.addEventListener('click', () => {
        document.getElementById('notifDropdown')?.classList.add('hidden');
        const view = el.dataset.view;
        if (view) setActiveView(view);
      });
    });
  } catch {
    /* silencioso — notificações não podem impedir o carregamento */
  }
}

function _aplicarDadosNotificacoes(dados) {
  const lista = dados.notificacoes || [];

  const badge = document.getElementById('notifBadge');
  if (badge) {
    if (lista.length > 0) {
      badge.textContent = String(lista.length);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Se o dropdown estiver aberto, atualiza a lista em tempo real
  const dropdown = document.getElementById('notifDropdown');
  const listaEl = document.getElementById('notifLista');
  if (!dropdown?.classList.contains('hidden') && listaEl) {
    if (!lista.length) {
      listaEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.88rem">
        <i class="fa-solid fa-check-circle" style="font-size:1.5rem;color:var(--success,#38a169);margin-bottom:8px;display:block"></i>
        Tudo em ordem!
      </div>`;
      return;
    }
    listaEl.innerHTML = lista.map((n) => {
      const cor = /^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\))$/.test(n.cor) ? n.cor : 'var(--primary)';
      const icone = /^fa-[a-z0-9-]+$/.test(n.icone) ? n.icone : 'fa-bell';
      return `
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:12px;align-items:flex-start"
        class="notif-item" data-view="${_escNotif(n.link || '')}">
        <div style="width:34px;height:34px;border-radius:10px;background:${cor}22;color:${cor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fa-solid ${icone}" style="font-size:.85rem"></i>
        </div>
        <div style="min-width:0">
          <div style="font-weight:700;font-size:.88rem;color:var(--text);margin-bottom:2px">${_escNotif(n.titulo)}</div>
          <div style="font-size:.8rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escNotif(n.texto)}</div>
        </div>
      </div>`;
    }).join('');
    listaEl.querySelectorAll('.notif-item[data-view]').forEach((el) => {
      el.addEventListener('click', () => {
        dropdown?.classList.add('hidden');
        const view = el.dataset.view;
        if (view) setActiveView(view);
      });
    });
  }
}

async function conectarSSE() {
  desconectarSSE();

  const token   = api.getAuthToken();
  const baseUrl = api.getApiBaseUrl().replace(/\/+$/, '');
  if (!token || !baseUrl) return;

  let url;
  try {
    const { nonce } = await api.getSseNonce();
    url = `${baseUrl}/sse-notificacoes?nonce=${encodeURIComponent(nonce)}`;
  } catch {
    return; // nonce falhou — abortar SSE; nunca expor JWT em query string
  }
  const es = new EventSource(url);
  _sseEventSource = es;
  _sseReconnectDelay = 3000;

  es.addEventListener('notificacoes', (e) => {
    try {
      const dados = JSON.parse(e.data);
      _notifCarregadas = true;
      _aplicarDadosNotificacoes(dados);
    } catch { /* silencioso */ }
  });

  es.onerror = () => {
    es.close();
    _sseEventSource = null;
    // Reconexão com backoff exponencial (máx 60s)
    _sseReconnectTimer = setTimeout(() => {
      _sseReconnectDelay = Math.min(_sseReconnectDelay * 2, 60000);
      conectarSSE();
    }, _sseReconnectDelay);
  };
}

function desconectarSSE() {
  if (_sseReconnectTimer) {
    clearTimeout(_sseReconnectTimer);
    _sseReconnectTimer = null;
  }
  if (_sseEventSource) {
    _sseEventSource.close();
    _sseEventSource = null;
  }
}

function bindTopbarEvents() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // Sino de notificações
  const sinoBtn    = document.getElementById('notifSinoBtn');
  const dropdown   = document.getElementById('notifDropdown');
  const marcarBtn  = document.getElementById('notifMarcarLidoBtn');

  sinoBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!dropdown) return;
    const aberto = !dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden');
    sinoBtn.setAttribute('aria-expanded', String(!aberto));
    if (!aberto && !_notifCarregadas) {
      _notifCarregadas = true;
      carregarNotificacoes();
    }
  });

  marcarBtn?.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    const badge = document.getElementById('notifBadge');
    if (badge) badge.classList.add('hidden');
  });

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    if (!document.getElementById('notifWrapper')?.contains(e.target)) {
      dropdown?.classList.add('hidden');
    }
  });

  const refreshDataBtn = document.getElementById('refreshDataBtn');
  const dashboardExportBtn = document.getElementById('dashboardExportBtn');

  if (refreshDataBtn) {
    refreshDataBtn.addEventListener('click', async () => {
      showToast('Atualizando dados...', 'info');
      await simulateRefresh();
    });
  }

  if (dashboardExportBtn) {
    dashboardExportBtn.addEventListener('click', () => {
      showToast('Exportação será ligada ao módulo de relatórios.', 'info');
    });
  }
}

function bindModalEvents() {
  const closeGlobalModalBtn = document.getElementById('closeGlobalModalBtn');
  const globalModal = document.getElementById('globalModal');

  if (closeGlobalModalBtn) {
    closeGlobalModalBtn.addEventListener('click', closeGlobalModal);
  }

  if (globalModal) {
    globalModal.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.closeModal === 'true') {
        closeGlobalModal();
      }
    });
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const usuarioInput = document.getElementById('loginUsuario');
  const senhaInput = document.getElementById('loginSenha');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');

  if (!usuarioInput || !senhaInput || !loginSubmitBtn) return;

  const usuario = usuarioInput.value.trim();
  const senha = senhaInput.value;

  if (!usuario || !senha) {
    setLoginMessage('Informe usuário e senha.', 'error');
    return;
  }

  loginSubmitBtn.disabled = true;
  setLoginMessage('Validando acesso...', 'info');
  showGlobalLoader('Validando acesso...');

  try {
    let loginResult;
    try {
      loginResult = await authLogin(usuario, senha, AppState.rememberSession);
    } catch (firstError) {
      // Se foi timeout, o servidor pode estar em cold start — tentamos mais uma vez
      // com uma mensagem clara e timeout mais generoso (60s).
      if (firstError?.message?.includes('demorou demais')) {
        setLoginMessage('Servidor iniciando (normal na 1ª vez do dia). Aguardando...', 'info');
        // Pausa de 4s antes de tentar novamente — dá tempo ao cold start do Render.
        // Segunda tentativa usa timeout de 55s (cold start típico: 30–50s).
        await wait(4000);
        loginResult = await authLogin(usuario, senha, AppState.rememberSession, 55000);
      } else {
        throw firstError;
      }
    }

    applyAuthData(loginResult);

    // SaaS Owner vai direto para o painel administrativo
    if (AppState.user?.is_saas_owner) {
      saveAuth(loginResult, AppState.rememberSession);
      window.location.assign('./admin.html');
      return;
    }

    renderAuthenticatedUser();
    await carregarPermissoes();
    showMainScreen();
    scheduleTokenRefresh();
    await setActiveView('dashboard');
    setLoginMessage('', 'info');
    showToast(`Bem-vindo, ${AppState.user?.nome || 'usuário'}!`, 'success');
  } catch (error) {
    console.error('Erro no login:', error?.status, error?.message);
    const friendlyMessage = buildFriendlyAuthError(error);
    setLoginMessage(friendlyMessage, 'error');
    showToast(friendlyMessage, 'error');
  } finally {
    loginSubmitBtn.disabled = false;
    hideGlobalLoader();
  }
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('loginSenha');
  const toggleButton = document.getElementById('togglePasswordBtn');
  const icon = toggleButton?.querySelector('i');

  if (!passwordInput || !icon) return;

  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

async function toggleSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const mainScreen = document.getElementById('mainScreen');
  if (!sidebar) return;

  if (AppState.sidebarCollapsed) {
    const parentView = getParentViewFromChild(AppState.currentView);

    if (parentView) {
      AppState.sidebarCollapsed = false;
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('expanded');
      mainScreen?.classList.remove('sidebar-collapsed');
      await setActiveView(parentView);
      return;
    }

    AppState.sidebarCollapsed = false;
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('expanded');
    mainScreen?.classList.remove('sidebar-collapsed');
    return;
  }

  AppState.sidebarCollapsed = true;
  sidebar.classList.add('collapsed');
  sidebar.classList.remove('expanded');
  mainScreen?.classList.add('sidebar-collapsed');

  document.querySelectorAll('.nav-group').forEach((group) => {
    group.classList.remove('open');
  });
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (!sidebar || !overlay) return;

  AppState.sidebarMobileOpen = true;
  sidebar.classList.add('mobile-open');
  overlay.classList.remove('hidden');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (!sidebar || !overlay) return;

  AppState.sidebarMobileOpen = false;
  sidebar.classList.remove('mobile-open');
  overlay.classList.add('hidden');
}

async function setActiveView(view) {
  if (view !== AppState.currentView) {
    const openModal = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden), [role="dialog"]:not([aria-hidden="true"]):not(.hidden)')).find(el => !el.closest('.hidden'));
    if (openModal) {
      const ok = confirm('Você tem uma janela aberta. Deseja sair e descartar as alterações não salvas?');
      if (!ok) return;
    }
  }
  window._lf_pixCleanup?.();
  AppState.currentView = view;
  saveCurrentViewToStorage();

  const sections = document.querySelectorAll('.view-section');
  sections.forEach((section) => {
    section.classList.toggle('active', section.getAttribute('data-view') === view);
  });

  updateNavigationState(view);

  const globalFiltersBar = document.getElementById('globalFiltersBar');
  if (globalFiltersBar) globalFiltersBar.classList.add('hidden');

  document.body.classList.toggle('pdv-active', view === 'pdv');

  const config = VIEW_CONFIG[view] || {
    title: 'LF ERP',
    subtitle: 'Sistema de gestão empresarial'
  };

  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  if (pageTitle) pageTitle.textContent = config.title;
  if (pageSubtitle) pageSubtitle.textContent = config.subtitle;

  const mobileBtn = document.getElementById('mobileSidebarBtn');
  if (mobileBtn) {
    const iconName = config.icon || 'bars';
    mobileBtn.innerHTML = `<i class="fa-solid fa-${iconName}" aria-hidden="true"></i>`;
  }

  if (window.innerWidth <= 900) {
    closeMobileSidebar();
  }

  await loadCurrentView(view);
}

const VIEW_LOADERS = {
  'dashboard':           loadDashboardReal,
  'produtos':            loadProdutosReal,
  'clientes':            loadClientesReal,
  'pdv':                 loadPDVReal,
  'vendas':              loadVendasReal,
  'compras':             loadComprasReal,
  'estoque':             loadEstoqueReal,
  'contas-receber':      loadContasReceberReal,
  'contas-pagar':        loadContasPagarReal,
  'fluxo-caixa':         loadFluxoCaixaReal,
  'lancamentos':         loadLancamentosReal,
  'conciliacao':         loadConciliacaoReal,
  'auditoria-financeira':loadAuditoriaFinanceiraReal,
  'lixeira':             loadLixeiraReal,
  'relatorios':          loadRelatoriosFinanceirosReal,
  'fornecedores':        loadFornecedoresReal,
  'usuarios':            loadUsuariosReal,
  'alertas':             loadAlertasReal,
  'devolucoes':          loadDevolucoesReal,
  'caixa':               loadCaixaReal,
  'comissoes':           loadComissoesReal,
  'orcamentos':          loadOrcamentosReal,
  'pedidos':             loadPedidosReal,
  'nfe':                 loadNfeReal,
  'filiais':             loadFiliaisReal,
  'bi':                  loadBiReal,
  'checkout-links':      loadCheckoutLinksReal,
  'fidelidade':          loadFidelidadeReal,
  'whatsapp':            loadWhatsappReal,
  'rastreabilidade':     loadRastreabilidadeReal,
  'api-publica':         loadApiPublicaReal,
  'exportacao-contabil': loadExportacaoContabilReal,
  'crm':                 loadCrmReal,
  'marketplace':         loadMarketplaceReal,
  'configuracoes':       loadConfigReal,
};

async function loadCurrentView(view) {
  const loader = VIEW_LOADERS[view];
  if (loader) {
    await loader();
  } else {
    renderViewFeedback(view);
  }
}

function updateNavigationState(view) {
  const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
  const navGroups = document.querySelectorAll('.nav-group');
  const navGroupToggles = document.querySelectorAll('.nav-group__toggle');

  navItems.forEach((item) => { item.classList.remove('active'); item.removeAttribute('aria-current'); });
  navGroups.forEach((group) => group.classList.remove('active'));
  navGroupToggles.forEach((toggle) => toggle.classList.remove('active'));

  const activeItem = document.querySelector(
    `.nav-item[data-view="${view}"], .nav-subitem[data-view="${view}"]`
  );
  if (!activeItem) return;

  activeItem.classList.add('active');
  activeItem.setAttribute('aria-current', 'page');

  const parentGroup = activeItem.closest('.nav-group');
  if (parentGroup) {
    parentGroup.classList.add('active');

    if (!parentGroup.classList.contains('open')) {
      parentGroup.classList.add('open');
      _saveNavGroupState();
    }

    const toggle = parentGroup.querySelector('.nav-group__toggle');
    if (toggle) toggle.classList.add('active');

    const advSection = activeItem.closest('#navAdvancedSection');
    if (advSection && !advSection.classList.contains('open')) {
      advSection.classList.add('open');
      document.getElementById('navAdvancedToggle')?.classList.add('open');
      try { localStorage.setItem('lf_nav_advanced', '1'); } catch {}
    }
  }
}

function getParentViewFromChild(view) {
  const groups = {
    cadastros:     ['produtos', 'clientes', 'fornecedores', 'usuarios'],
    movimentacoes: ['vendas', 'compras', 'estoque', 'devolucoes', 'caixa'],
    financeiro:    ['contas-receber', 'contas-pagar', 'fluxo-caixa', 'lancamentos', 'conciliacao', 'auditoria-financeira'],
    fiscal:        ['nfe', 'orcamentos', 'pedidos'],
    relatorios:    ['relatorios', 'bi', 'exportacao-contabil'],
    comercial:     ['crm', 'comissoes', 'fidelidade', 'alertas'],
    integracoes:   ['whatsapp', 'marketplace', 'api-publica', 'checkout-links'],
    operacoes:     ['filiais', 'rastreabilidade'],
  };

  for (const [parent, children] of Object.entries(groups)) {
    if (children.includes(view)) {
      return parent;
    }
  }

  return null;
}

function toggleGlobalFilters() {
  const filtersContent = document.getElementById('globalFiltersContent');
  if (!filtersContent) return;
  filtersContent.classList.toggle('hidden');
}

function updateFiltersUI() {
  const filtroPeriodo = document.getElementById('filtroPeriodo');
  const filtroDataInicial = document.getElementById('filtroDataInicial');
  const filtroDataFinal = document.getElementById('filtroDataFinal');
  const filtroBuscaGlobal = document.getElementById('filtroBuscaGlobal');

  if (filtroPeriodo) filtroPeriodo.value = AppState.filters.periodo;
  if (filtroDataInicial) filtroDataInicial.value = AppState.filters.dataInicial;
  if (filtroDataFinal) filtroDataFinal.value = AppState.filters.dataFinal;
  if (filtroBuscaGlobal) filtroBuscaGlobal.value = AppState.filters.busca;

  const isCustom = AppState.filters.periodo === 'personalizado';
  if (filtroDataInicial) filtroDataInicial.disabled = !isCustom;
  if (filtroDataFinal) filtroDataFinal.disabled = !isCustom;

  const globalFilterSummary = document.getElementById('globalFilterSummary');
  if (globalFilterSummary) {
    globalFilterSummary.textContent = `Período: ${getPeriodLabel()}`;
  }
}

const VIEWS_WITH_GLOBAL_FILTER = new Set(['dashboard']);

function updateGlobalFilterContextNote() {
  const note = document.getElementById('globalFilterContextNote');
  if (!note) return;

  const view = AppState.currentView;
  const uses = VIEWS_WITH_GLOBAL_FILTER.has(view);

  note.className = `global-filter-context-note ${uses ? 'global-filter-context-note--uses' : 'global-filter-context-note--local'}`;
  note.classList.remove('hidden');

  if (uses) {
    note.innerHTML = `<i class="fa-solid fa-circle-check" style="margin-top:1px;flex-shrink:0"></i><span>Este módulo usa os filtros globais. Clique em <strong>Aplicar</strong> para recarregar.</span>`;
  } else {
    note.innerHTML = `<i class="fa-solid fa-circle-info" style="margin-top:1px;flex-shrink:0"></i><span>Este módulo tem seus próprios filtros internos — o filtro global <strong>não afeta</strong> esta tela.</span>`;
  }
}


function applyDefaultPeriodDates() {
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });

  function shiftDays(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
  }

  let start = todayStr;
  let end   = todayStr;

  switch (AppState.filters.periodo) {
    case 'hoje':
      break;
    case 'ontem':
      start = shiftDays(todayStr, -1);
      end   = shiftDays(todayStr, -1);
      break;
    case '7dias':
      start = shiftDays(todayStr, -6);
      break;
    case '30dias':
      start = shiftDays(todayStr, -29);
      break;
    case 'mesAtual': {
      const [y, m] = todayStr.split('-').map(Number);
      start = `${y}-${String(m).padStart(2, '0')}-01`;
      break;
    }
    case 'mesAnterior': {
      const [y, m] = todayStr.split('-').map(Number);
      const lastOfPrev = shiftDays(`${y}-${String(m).padStart(2, '0')}-01`, -1);
      const [py, pm]   = lastOfPrev.split('-').map(Number);
      start = `${py}-${String(pm).padStart(2, '0')}-01`;
      end   = lastOfPrev;
      break;
    }
    case 'personalizado':
      saveFiltersToStorage();
      return;
    default:
      start = shiftDays(todayStr, -6);
      break;
  }

  AppState.filters.dataInicial = start;
  AppState.filters.dataFinal   = end;
  saveFiltersToStorage();
}

async function applyGlobalFilters() {
  saveFiltersToStorage();
  syncFiltersToURL();
  showToast('Filtros aplicados com sucesso.', 'success');

  if (!AppState.isAuthenticated) {
    renderInitialDashboardState();
    return;
  }

  if (VIEWS_WITH_GLOBAL_FILTER.has(AppState.currentView)) {
    await loadCurrentView(AppState.currentView);
  }
}

function clearGlobalFilters() {
  AppState.filters = {
    periodo: '7dias',
    dataInicial: '',
    dataFinal: '',
    busca: ''
  };

  applyDefaultPeriodDates();
  updateFiltersUI();
  showToast('Filtros limpos.', 'info');
}

function saveFiltersToStorage() {
  localStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(AppState.filters));
}

function syncFiltersToURL() {
  try {
    const f = AppState.filters;
    const params = new URLSearchParams();
    if (f.periodo && f.periodo !== '7dias') params.set('periodo', f.periodo);
    if (f.periodo === 'personalizado') {
      if (f.dataInicial) params.set('ini', f.dataInicial);
      if (f.dataFinal)   params.set('fim', f.dataFinal);
    }
    const qs = params.toString();
    history.replaceState({}, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  } catch {}
}

function readFiltersFromURL() {
  try {
    const params = new URLSearchParams(location.search);
    const periodo = params.get('periodo');
    if (!periodo) return;
    AppState.filters.periodo = periodo;
    if (periodo === 'personalizado') {
      const ini = params.get('ini');
      const fim = params.get('fim');
      if (ini) AppState.filters.dataInicial = ini;
      if (fim) AppState.filters.dataFinal   = fim;
    }
  } catch {}
}

function restoreSavedFilters() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.filters);
    if (!saved) return;

    const parsed = JSON.parse(saved);

    AppState.filters = {
      ...AppState.filters,
      ...parsed
    };
  } catch (error) {
    console.warn('Não foi possível restaurar filtros salvos.', error);
  }
}

function saveCurrentViewToStorage() {
  localStorage.setItem(STORAGE_KEYS.currentView, AppState.currentView);
}

function restoreCurrentViewFromStorage() {
  const savedView = localStorage.getItem(STORAGE_KEYS.currentView);
  if (savedView) {
    AppState.currentView = savedView;
  }
}

async function restoreAuthSession() {
  const auth = getAuth();

  if (!auth?.authToken) {
    showLoginScreen();
    return;
  }

  applyAuthData(auth);

  try {
    // Timeout curto: se o servidor estiver dormindo, falha rápido e exibe o login
    // enquanto o warmupServer() (já iniciado) continua acordando o servidor em background.
    const meData = await validateSession(6000);
    if (meData) {
      AppState.user = { ...AppState.user, ...meData };
      AppState.assinatura = {
        status: meData.assinatura_status || null,
        trial_fim: meData.trial_fim || null,
        dias_restantes_trial: meData.dias_restantes_trial ?? null,
        bloqueada: Boolean(meData.bloqueada),
        plano_nome: meData.plano_nome || null
      };
    }
    // SaaS Owner restaurado → redireciona para painel administrativo
    if (AppState.user?.is_saas_owner) {
      window.location.assign('./admin.html');
      return;
    }

    renderAuthenticatedUser();
    renderTrialBanner();
    await carregarPermissoes();
    showMainScreen();
    scheduleTokenRefresh();
    await setActiveView(AppState.currentView || 'dashboard');
    showToast('Sessão restaurada com sucesso.', 'success');
  } catch (error) {
    handleLogout(false);
    throw error;
  }
}

function applyAuthData(data) {
  AppState.isAuthenticated = true;
  AppState.authToken = data.authToken || data.token || null;

  AppState.user = data.user || {
    nome: 'Usuário',
    perfil: 'Operador',
    usuario: 'usuario'
  };

  AppState.empresa = data.empresa || {
    nome: data?.user?.empresa || 'Empresa Logada'
  };

  AppState.empresaId = data.empresaId || data.empresa_id || data.user?.empresa_id || null;
}

function renderAuthenticatedUser() {
  const sidebarCompanyName = document.getElementById('sidebarCompanyName');
  const topbarCompanyName = document.getElementById('topbarCompanyName');
  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserRole = document.getElementById('topbarUserRole');
  const topbarUserAvatar = document.getElementById('topbarUserAvatar');

  const companyName = AppState.empresa?.nome || AppState.user?.empresa || 'Empresa Logada';

  const userName =
    AppState.user?.nome || AppState.user?.name || AppState.user?.usuario || 'Usuário';

  const userRole =
    AppState.user?.perfil || AppState.user?.role || AppState.user?.tipo || 'Perfil não informado';

  if (sidebarCompanyName) sidebarCompanyName.textContent = companyName;
  if (topbarCompanyName) topbarCompanyName.textContent = companyName;
  if (topbarUserName) topbarUserName.textContent = userName;
  if (topbarUserRole) topbarUserRole.textContent = userRole;
  if (topbarUserAvatar) topbarUserAvatar.textContent = getInitials(userName);

  try {
    const cachedLogo = localStorage.getItem(`lf_logo_${AppState.empresaId || AppState.empresa?.nome || ''}`);
    aplicarLogoSidebar(cachedLogo || null);
  } catch (_) {}

  try {
    const cachedCor = localStorage.getItem(`lf_cor_${AppState.empresaId || AppState.empresa?.nome || ''}`);
    if (cachedCor) aplicarCorPrimaria(cachedCor);
  } catch (_) {}

  const adminLink = document.getElementById('adminNavLink');
  if (adminLink && AppState.user?.is_saas_owner) {
    adminLink.style.display = 'block';
    adminLink.addEventListener('click', () => location.assign('./admin.html'));
  }

  const lixeiraBtn = document.getElementById('lixeiraNavBtn');
  if (lixeiraBtn) {
    const tipo = AppState.user?.tipo;
    if (tipo === 'admin' || tipo === 'gerente' || AppState.user?.is_saas_owner) {
      lixeiraBtn.classList.remove('hidden');
    }
  }
}

function aplicarLogoSidebar(url) {
  const el = document.getElementById('sidebarBrandIcon');
  if (!el) return;
  const urlSafe = typeof url === 'string' && (url.startsWith('https://') || url.startsWith('data:image/'));
  if (urlSafe) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Logo';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:8px';
    el.innerHTML = '';
    el.appendChild(img);
  } else {
    el.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
  }
}

window.aplicarLogoSidebar = aplicarLogoSidebar;

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0, s=0, l=(max+min)/2;
  if (max !== min) {
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    if (max===r) h=((g-b)/d+(g<b?6:0))/6;
    else if (max===g) h=((b-r)/d+2)/6;
    else h=((r-g)/d+4)/6;
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

function hslToHex(h, s, l) {
  s/=100; l/=100;
  const a=s*Math.min(l,1-l);
  const f=n=>{const k=(n+h/30)%12;const c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,'0');};
  return `#${f(0)}${f(8)}${f(4)}`;
}

function aplicarCorPrimaria(hex) {
  const root = document.documentElement;
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-hover');
    root.style.removeProperty('--primary-soft');
    return;
  }
  const [h, s, l] = hexToHsl(hex);
  const ri = parseInt(hex.slice(1,3),16), gi = parseInt(hex.slice(3,5),16), bi = parseInt(hex.slice(5,7),16);
  root.style.setProperty('--primary', hex);
  root.style.setProperty('--primary-hover', hslToHex(h, s, Math.max(l-10, 5)));
  root.style.setProperty('--primary-soft', `rgba(${ri},${gi},${bi},0.15)`);
}
window.aplicarCorPrimaria = aplicarCorPrimaria;

function renderTrialBanner() {
  const banner = document.getElementById('trialBanner');
  if (!banner) return;

  if (AppState.user?.is_saas_owner) { banner.style.display = 'none'; return; }

  const a = AppState.assinatura;
  if (!a) { banner.style.display = 'none'; return; }

  if (a.bloqueada) {
    banner.style.cssText = 'display:block;padding:10px 20px;font-size:13px;font-weight:600;text-align:center;background:var(--danger);color:#fff';
    banner.innerHTML = 'Sua conta está bloqueada. Entre em contato com o suporte.';
    return;
  }

  if (a.status === 'trial' && a.dias_restantes_trial !== null) {
    const dias = a.dias_restantes_trial;
    if (dias < 0) {
      banner.style.cssText = 'display:block;padding:10px 20px;font-size:13px;font-weight:600;text-align:center;background:var(--danger);color:#fff';
      banner.innerHTML = 'Seu período de teste expirou. Entre em contato para ativar sua assinatura.';
    } else if (dias <= 7) {
      const cor = dias <= 2 ? 'var(--danger)' : 'var(--warning)';
      banner.style.cssText = `display:block;padding:10px 20px;font-size:13px;font-weight:600;text-align:center;background:${cor};color:#fff`;
      const diasNum = Number(dias) || 0;
      banner.innerHTML = diasNum === 0
        ? 'Seu trial expira hoje. Contate o suporte para ativar.'
        : `Seu trial expira em <strong>${diasNum} dia(s)</strong>. Fale com o suporte para continuar usando.`;
    } else {
      banner.style.display = 'none';
    }
    return;
  }

  banner.style.display = 'none';
}

let _sortObserver = null;
function _initSortObserver() {
  if (_sortObserver) return;
  _sortObserver = new MutationObserver((muts) => {
    for (const mut of muts) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('data-table')) makeSortable(node);
        node.querySelectorAll?.('.data-table').forEach(makeSortable);
      }
    }
  });
  _sortObserver.observe(document.body, { childList: true, subtree: true });
}

function showMainScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const mainScreen = document.getElementById('mainScreen');

  if (loginScreen) loginScreen.classList.add('hidden');
  if (mainScreen) mainScreen.classList.remove('hidden');

  _initSortObserver();
  restoreNavGroupState();

  // Conecta SSE para notificações em tempo real (sem polling)
  _notifCarregadas = false;
  conectarSSE();
}

function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const mainScreen = document.getElementById('mainScreen');

  if (loginScreen) loginScreen.classList.remove('hidden');
  if (mainScreen) mainScreen.classList.add('hidden');

  // Acorda o servidor Render em background assim que a tela de login aparece.
  // Quando o usuário terminar de digitar as credenciais (~10-20s), o servidor
  // estará quente e o login responderá sem timeout.
  api.warmupServer();
}

function handleLogout(showMessage = true) {
  AppState.isAuthenticated = false;
  AppState.authToken = null;
  AppState.user = null;
  AppState.empresa = null;
  AppState.empresaId = null;
  AppState.permissoes = null;
  AppState.currentView = 'dashboard';

  localStorage.removeItem(STORAGE_KEYS.currentView);

  desconectarSSE();
  authLogout();
  api.config._isRedirecting401 = false;
  showLoginScreen();
  clearLoginInputs();
  closeMobileSidebar();
  setLoginMessage('', 'info');
  renderInitialDashboardState();

  if (showMessage) {
    showToast('Sessão encerrada com sucesso.', 'success');
  }
}

// Intercepta 401 global disparado por api.js — evita múltiplos redirecionamentos
let _lastSessionExpiredAt = 0;
window.addEventListener('lferp:session-expired', () => {
  const now = Date.now();
  if (now - _lastSessionExpiredAt < 1000) return;
  _lastSessionExpiredAt = now;
  if (AppState.isAuthenticated) {
    handleLogout(false);
    showToast('Sua sessão expirou. Faça login novamente.', 'warning');
  }
}, { once: false });

function clearLoginInputs() {
  const loginUsuario = document.getElementById('loginUsuario');
  const loginSenha = document.getElementById('loginSenha');

  if (loginUsuario) loginUsuario.value = '';
  if (loginSenha) loginSenha.value = '';
}

function setLoginMessage(message, type = 'info') {
  const loginMessage = document.getElementById('loginMessage');
  if (!loginMessage) return;

  loginMessage.textContent = message;
  loginMessage.className = `form-message ${type}`;
}

function showGlobalLoader(message = 'Carregando sistema...') {
  AppState.loadingCount += 1;

  const globalLoading = document.getElementById('globalLoading');
  const loadingText = globalLoading?.querySelector('p');

  if (globalLoading) globalLoading.classList.remove('hidden');
  if (loadingText) loadingText.textContent = message;
}

function hideGlobalLoader() {
  AppState.loadingCount = Math.max(0, AppState.loadingCount - 1);

  if (AppState.loadingCount > 0) return;

  const globalLoading = document.getElementById('globalLoading');
  if (globalLoading) globalLoading.classList.add('hidden');
}

function _sanitizeModalHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('script,iframe,object,embed,base,link,style').forEach(el => el.remove());
  tmp.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (attr.name === 'href' && /^javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      if (attr.name === 'src' && /^javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
    });
  });
  return tmp.innerHTML;
}

function openGlobalModal({ title = 'Aviso', body = '', footer = '' } = {}) {
  const modal = document.getElementById('globalModal');
  const modalTitle = document.getElementById('globalModalTitle');
  const modalBody = document.getElementById('globalModalBody');
  const modalFooter = document.getElementById('globalModalFooter');

  if (!modal || !modalTitle || !modalBody || !modalFooter) return;

  modalTitle.textContent = title;
  modalBody.innerHTML = _sanitizeModalHtml(body);
  modalFooter.innerHTML = _sanitizeModalHtml(footer);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeGlobalModal() {
  const modal = document.getElementById('globalModal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}


async function loadDashboardReal() {
  showGlobalLoader('Carregando dashboard...');

  try {
    await dashboard.loadDashboard({
      filters: AppState.filters,
      state: {
        user: AppState.user,
        empresa: AppState.empresa,
        filters: AppState.filters
      }
    });
  } catch (error) {
    console.error('Erro ao carregar dashboard real:', error);
    dashboard.resetDashboard('Não foi possível carregar o dashboard real.');
    showToast('Falha ao carregar dashboard real.', 'warning');
  } finally {
    hideGlobalLoader();
  }
}

async function loadProdutosReal() {
  showGlobalLoader('Carregando produtos...');

  try {
    const { initProdutosModule } = await import('./produtos.js');
    await initProdutosModule();
    showToast('Produtos carregados com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    showToast('Falha ao carregar módulo de produtos.', 'error');
    renderModuleError(
      'produtosContainer',
      'Produtos',
      'Não foi possível carregar o módulo de produtos.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadClientesReal() {
  showGlobalLoader('Carregando clientes...');

  try {
    const { initClientesModule } = await import('./clientes.js');
    await initClientesModule();
    showToast('Clientes carregados com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar clientes:', error);
    showToast('Falha ao carregar módulo de clientes.', 'error');
    renderModuleError(
      'clientesContainer',
      'Clientes',
      'Não foi possível carregar o módulo de clientes.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadPDVReal() {
  showGlobalLoader('Carregando PDV...');

  try {
    const { initPDVModule } = await import('./pdv.js');
    await initPDVModule();
    showToast('PDV carregado com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar PDV:', error);
    showToast('Falha ao carregar módulo de PDV.', 'error');
    renderModuleError('pdvContainer', 'PDV', 'Não foi possível carregar o módulo de PDV.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadVendasReal() {
  showGlobalLoader('Carregando vendas...');

  try {
    const { initVendasModule } = await import('./vendas.js');
    await initVendasModule();
    showToast('Vendas carregadas com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar vendas:', error);
    showToast('Falha ao carregar módulo de vendas.', 'error');
    renderModuleError('vendasContainer', 'Vendas', 'Não foi possível carregar o módulo de vendas.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadComprasReal() {
  showGlobalLoader('Carregando compras...');

  try {
    const { initComprasModule } = await import('./compras.js');
    await initComprasModule();
    showToast('Compras carregadas com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar compras:', error);
    showToast('Falha ao carregar módulo de compras.', 'error');
    renderModuleError(
      'comprasContainer',
      'Compras',
      'Não foi possível carregar o módulo de compras.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadContasReceberReal() {
  showGlobalLoader('Carregando contas a receber...');

  try {
    const { initContasReceberModule } = await import('./contasReceber.js');
    await initContasReceberModule();
    showToast('Contas a receber carregadas.', 'success');
  } catch (error) {
    console.error('Erro ao carregar contas a receber:', error);
    showToast('Erro ao carregar contas a receber.', 'error');
    renderModuleError(
      'contasReceberContainer',
      'Contas a Receber',
      'Não foi possível carregar contas a receber.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadContasPagarReal() {
  showGlobalLoader('Carregando contas a pagar...');

  try {
    const { initContasPagarModule } = await import('./contasPagar.js');
    await initContasPagarModule();
    showToast('Contas a pagar carregadas com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar contas a pagar:', error);
    showToast('Falha ao carregar módulo de contas a pagar.', 'error');
    renderModuleError(
      'contasPagarContainer',
      'Contas a Pagar',
      'Não foi possível carregar contas a pagar.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadFluxoCaixaReal() {
  showGlobalLoader('Carregando fluxo de caixa...');

  try {
    const { initFluxoCaixaModule } = await import('./fluxoCaixa.js');
    await initFluxoCaixaModule();
    showToast('Fluxo de caixa carregado com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar fluxo de caixa:', error);
    showToast('Falha ao carregar módulo de fluxo de caixa.', 'error');
    renderModuleError(
      'fluxoCaixaContainer',
      'Fluxo de Caixa',
      'Não foi possível carregar o fluxo de caixa.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadLancamentosReal() {
  showGlobalLoader('Carregando lançamentos...');

  try {
    const { initLancamentosModule } = await import('./lancamentosFinanceiros.js');
    await initLancamentosModule();
    showToast('Lançamentos carregados', 'success');
  } catch (error) {
    console.error('Erro ao carregar lançamentos:', error);
    showToast('Erro ao carregar lançamentos', 'error');
    renderModuleError(
      'lancamentosContainer',
      'Lançamentos',
      'Não foi possível carregar lançamentos financeiros.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadConciliacaoReal() {
  showGlobalLoader('Carregando conciliação bancária...');
  try {
    const { initConciliacaoModule } = await import('./conciliacaoBancaria.js');
    await initConciliacaoModule();
  } catch (error) {
    console.error('Erro ao carregar conciliação:', error);
    showToast('Erro ao carregar conciliação bancária', 'error');
    renderModuleError(
      'conciliacaoContainer',
      'Conciliação Bancária',
      'Não foi possível carregar o módulo de conciliação.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadLixeiraReal() {
  showGlobalLoader('Carregando lixeira...');
  try {
    const { initLixeiraModule } = await import('./lixeira.js');
    await initLixeiraModule();
  } catch (error) {
    console.error('Erro ao carregar lixeira:', error);
    showToast('Erro ao carregar lixeira', 'error');
    renderModuleError('lixeiraContainer', 'Lixeira', 'Não foi possível carregar a lixeira.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadAuditoriaFinanceiraReal() {
  showGlobalLoader('Carregando auditoria financeira...');
  try {
    const { initAuditoriaFinanceiraModule } = await import('./auditoriaFinanceira.js');
    await initAuditoriaFinanceiraModule();
  } catch (error) {
    console.error('Erro ao carregar auditoria financeira:', error);
    showToast('Erro ao carregar auditoria financeira', 'error');
    renderModuleError(
      'auditoriaFinanceiraContainer',
      'Auditoria Financeira',
      'Não foi possível carregar o histórico de auditoria.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadRelatoriosFinanceirosReal() {
  showGlobalLoader('Carregando relatórios financeiros...');

  try {
    const { initRelatoriosFinanceirosModule } = await import('./relatoriosFinanceiros.js');
    await initRelatoriosFinanceirosModule();
    showToast('Relatórios financeiros carregados com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar relatórios financeiros:', error);
    showToast('Falha ao carregar relatórios financeiros.', 'error');
    renderModuleError(
      'relatoriosContainer',
      'Relatórios Financeiros',
      'Não foi possível carregar relatórios financeiros.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadFornecedoresReal() {
  showGlobalLoader('Carregando fornecedores...');

  try {
    const { initFornecedoresModule } = await import('./fornecedores.js');
    await initFornecedoresModule();
    showToast('Fornecedores carregados com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar fornecedores:', error);
    showToast('Falha ao carregar módulo de fornecedores.', 'error');
    renderModuleError(
      'fornecedoresContainer',
      'Fornecedores',
      'Não foi possível carregar fornecedores.'
    );
  } finally {
    hideGlobalLoader();
  }
}

async function loadEstoqueReal() {
  showGlobalLoader('Carregando estoque...');

  try {
    const { initEstoqueModule } = await import('./estoque.js');
    await initEstoqueModule();
    showToast('Estoque carregado com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar estoque:', error);
    showToast('Falha ao carregar módulo de estoque.', 'error');
    renderModuleError('estoqueContainer', 'Estoque', 'Não foi possível carregar estoque.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadUsuariosReal() {
  const userPerfil = (AppState.user?.perfil || '').toLowerCase();
  if (!['admin', 'administrador', 'gerente', 'manager'].includes(userPerfil)) {
    renderModuleError('usuariosContainer', 'Usuários', 'Acesso restrito a administradores.');
    return;
  }

  showGlobalLoader('Carregando usuários...');

  try {
    const { initUsuariosModule } = await import('./usuarios.js');
    await initUsuariosModule();
    showToast('Usuários carregados com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    showToast('Falha ao carregar módulo de usuários.', 'error');
    renderModuleError('usuariosContainer', 'Usuários', 'Não foi possível carregar usuários.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadAlertasReal() {
  showGlobalLoader('Carregando alertas...');
  try {
    const { initAlertasModule } = await import('./alertas.js');
    await initAlertasModule();
    showToast('Alertas carregados.', 'success');
  } catch (error) {
    console.error('Erro ao carregar alertas:', error);
    showToast('Falha ao carregar alertas.', 'error');
    renderModuleError('alertasContainer', 'Alertas', 'Não foi possível carregar alertas.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadDevolucoesReal() {
  showGlobalLoader('Carregando devoluções...');
  try {
    const { initDevolucoesModule } = await import('./devolucoes.js');
    await initDevolucoesModule();
    showToast('Devoluções carregadas.', 'success');
  } catch (error) {
    console.error('Erro ao carregar devoluções:', error);
    showToast('Falha ao carregar devoluções.', 'error');
    renderModuleError('devolucoesContainer', 'Devoluções', 'Não foi possível carregar devoluções.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadCaixaReal() {
  showGlobalLoader('Carregando caixa...');
  try {
    const { initCaixaModule } = await import('./caixa.js');
    await initCaixaModule();
    showToast('Caixa carregado.', 'success');
  } catch (error) {
    console.error('Erro ao carregar caixa:', error);
    showToast('Falha ao carregar caixa.', 'error');
    renderModuleError('caixaContainer', 'Caixa', 'Não foi possível carregar o caixa.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadComissoesReal() {
  showGlobalLoader('Carregando comissões...');
  try {
    const { initComissoesModule } = await import('./comissoes.js');
    await initComissoesModule();
    showToast('Comissões carregadas.', 'success');
  } catch (error) {
    console.error('Erro ao carregar comissões:', error);
    showToast('Falha ao carregar comissões.', 'error');
    renderModuleError('comissoesContainer', 'Comissões', 'Não foi possível carregar comissões.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadOrcamentosReal() {
  showGlobalLoader('Carregando orçamentos...');
  try {
    const { initOrcamentosModule } = await import('./orcamentos.js');
    await initOrcamentosModule();
    showToast('Orçamentos carregados.', 'success');
  } catch (error) {
    console.error('Erro ao carregar orçamentos:', error);
    showToast('Falha ao carregar orçamentos.', 'error');
    renderModuleError('orcamentosContainer', 'Orçamentos', 'Não foi possível carregar orçamentos.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadPedidosReal() {
  showGlobalLoader('Carregando pedidos...');
  try {
    const { initPedidosModule } = await import('./pedidos.js');
    await initPedidosModule();
    showToast('Pedidos carregados.', 'success');
  } catch (error) {
    console.error('Erro ao carregar pedidos:', error);
    showToast('Falha ao carregar pedidos.', 'error');
    renderModuleError('pedidosContainer', 'Pedidos', 'Não foi possível carregar pedidos.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadNfeReal() {
  showGlobalLoader('Carregando NF-e...');

  try {
    const { initNfeModule } = await import('./nfe.js');
    await initNfeModule();
    showToast('Módulo NF-e carregado.', 'success');
  } catch (error) {
    console.error('Erro ao carregar NF-e:', error);
    showToast('Falha ao carregar módulo NF-e.', 'error');
    renderModuleError('nfeContainer', 'NF-e', 'Não foi possível carregar o módulo NF-e.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadFiliaisReal() {
  showGlobalLoader('Carregando filiais...');
  try {
    const { initFiliaisModule } = await import('./filiais.js');
    await initFiliaisModule();
  } catch (error) {
    console.error('Erro ao carregar filiais:', error);
    renderModuleError('filiaisContainer', 'Multi-filial', 'Nao foi possivel carregar o modulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadCheckoutLinksReal() {
  showGlobalLoader('Carregando links de pagamento...');
  try {
    const { initCheckoutLinksModule } = await import('./checkoutLinks.js');
    await initCheckoutLinksModule();
  } catch (error) {
    console.error('Erro ao carregar checkout links:', error);
    renderModuleError('checkoutLinksContainer', 'Link de Pagamento', 'Nao foi possivel carregar o modulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadFidelidadeReal() {
  showGlobalLoader('Carregando fidelidade...');
  try {
    const { initFidelidadeModule } = await import('./fidelidade.js');
    await initFidelidadeModule();
  } catch (error) {
    console.error('Erro ao carregar fidelidade:', error);
    renderModuleError('fidelidadeContainer', 'Fidelidade', 'Nao foi possivel carregar o modulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadWhatsappReal() {
  showGlobalLoader('Carregando WhatsApp...');
  try {
    const { initWhatsappModule } = await import('./whatsapp.js');
    await initWhatsappModule();
  } catch (error) {
    console.error('Erro ao carregar WhatsApp:', error);
    renderModuleError('whatsappContainer', 'WhatsApp Business', 'Nao foi possivel carregar o modulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadRastreabilidadeReal() {
  showGlobalLoader('Carregando rastreabilidade...');
  try {
    const { initRastreabilidadeModule } = await import('./rastreabilidade.js');
    await initRastreabilidadeModule();
  } catch (error) {
    console.error('Erro ao carregar rastreabilidade:', error);
    renderModuleError('rastreabilidadeContainer', 'Rastreabilidade', 'Nao foi possivel carregar o modulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadApiPublicaReal() {
  showGlobalLoader('Carregando API & Webhooks...');
  try {
    const { initApiPublicaModule } = await import('./apiPublica.js');
    await initApiPublicaModule();
  } catch (error) {
    console.error('Erro ao carregar API Publica:', error);
    renderModuleError('apiPublicaContainer', 'API & Webhooks', 'Nao foi possivel carregar o modulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadExportacaoContabilReal() {
  showGlobalLoader('Carregando exportação contábil...');
  try {
    const { initExportacaoContabilModule } = await import('./exportacaoContabil.js');
    await initExportacaoContabilModule();
  } catch (error) {
    console.error('Erro ao carregar exportação contábil:', error);
    renderModuleError('exportacaoContabilContainer', 'Exportação Contábil', 'Não foi possível carregar o módulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadCrmReal() {
  showGlobalLoader('Carregando CRM...');
  try {
    const { initCrmModule } = await import('./crm.js');
    await initCrmModule();
  } catch (error) {
    console.error('Erro ao carregar CRM:', error);
    renderModuleError('crmContainer', 'CRM', 'Não foi possível carregar o módulo CRM.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadBiReal() {
  showGlobalLoader('Carregando BI...');
  try {
    const { initBiModule } = await import('./bi.js');
    await initBiModule();
  } catch (error) {
    console.error('Erro ao carregar BI:', error);
    renderModuleError('biContainer', 'BI — Relatórios Executivos', 'Não foi possível carregar o módulo.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadMarketplaceReal() {
  showGlobalLoader('Carregando marketplace...');
  try {
    const { initMarketplaceModule } = await import('./marketplace.js');
    await initMarketplaceModule();
  } catch (error) {
    console.error('Erro ao carregar marketplace:', error);
    renderModuleError('marketplaceContainer', 'Marketplace', 'Não foi possível carregar o módulo Marketplace.');
  } finally {
    hideGlobalLoader();
  }
}

async function loadConfigReal() {
  showGlobalLoader('Carregando configurações...');

  try {
    const { initConfigModule } = await import('./configuracoes.js');
    await initConfigModule();
    showToast('Configurações carregadas', 'success');
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    showToast('Erro ao carregar configurações', 'error');
    renderModuleError(
      'configuracoesContainer',
      'Configurações',
      'Não foi possível carregar configurações.'
    );
  } finally {
    hideGlobalLoader();
  }
}

function renderInitialDashboardState() {
  dashboard.resetDashboard('Faça login para carregar o dashboard.');
}

function renderViewFeedback(view) {
  const placeholders = {
    produtos: 'produtosContainer',
    clientes: 'clientesContainer',
    fornecedores: 'fornecedoresContainer',
    vendas: 'vendasContainer',
    compras: 'comprasContainer',
    'contas-receber': 'contasReceberContainer',
    'contas-pagar': 'contasPagarContainer',
    'fluxo-caixa': 'fluxoCaixaContainer',
    lancamentos: 'lancamentosContainer',
    conciliacao: 'conciliacaoContainer',
    'auditoria-financeira': 'auditoriaFinanceiraContainer',
    lixeira: 'lixeiraContainer',
    pdv: 'pdvContainer',
    usuarios: 'usuariosContainer',
    estoque: 'estoqueContainer',
    relatorios: 'relatoriosContainer',
    configuracoes: 'configuracoesContainer'
  };

  const containerId = placeholders[view];
  if (!containerId) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  const config = VIEW_CONFIG[view];

  container.innerHTML = `
    <div class="module-placeholder__content">
      <h3>${config?.title || 'Módulo'}</h3>
      <p>${config?.subtitle || 'Área do sistema'}</p>

      <div class="module-placeholder__meta">
        <span><strong>Empresa:</strong> ${escapeHtml(AppState.empresa?.nome || AppState.user?.empresa || '-')}</span>
        <span><strong>Período:</strong> ${getPeriodLabel()}</span>
      </div>

      <div class="module-placeholder__note">
        Módulo ainda não possui carregamento definido no roteador.
      </div>
    </div>
  `;
}

function renderModuleError(containerId, title, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="module-placeholder__content">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="module-placeholder__note">
        Verifique a integração com o backend e tente novamente.
      </div>
    </div>
  `;
}

async function simulateRefresh() {
  if (!AppState.isAuthenticated) {
    renderInitialDashboardState();
    showToast('Dados atualizados.', 'success');
    return;
  }

  await loadCurrentView(AppState.currentView);
  showToast('Dados atualizados.', 'success');
}

function getPeriodLabel() {
  const labels = {
    hoje: 'Hoje',
    ontem: 'Ontem',
    '7dias': 'Últimos 7 dias',
    '30dias': 'Últimos 30 dias',
    mesAtual: 'Mês atual',
    mesAnterior: 'Mês anterior',
    personalizado: 'Personalizado'
  };

  return labels[AppState.filters.periodo] || 'Período';
}

function getInitials(name) {
  return (
    String(name)
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'LF'
  );
}

function buildFriendlyAuthError(error) {
  const status = error?.status;
  const codigo = error?.payload?.codigo || '';
  const message = error?.message || 'Falha ao autenticar.';

  if (codigo === 'CREDENCIAIS_INVALIDAS') return 'Usuário ou senha inválidos.';
  if (codigo === 'EMPRESA_BLOQUEADA')     return 'Empresa bloqueada. Entre em contato com o suporte.';
  if (codigo === 'ASSINATURA_INATIVA')    return 'Assinatura inativa. Regularize o acesso para continuar.';
  if (codigo === 'TRIAL_EXPIRADO')        return 'Período de teste expirado. Escolha um plano para continuar.';
  if (codigo === 'TOKEN_EXPIRADO')        return 'Sua sessão expirou. Faça login novamente.';

  if (status === 429) return message || 'Muitas tentativas. Aguarde alguns minutos.';
  if (status === 401) return 'Usuário ou senha inválidos.';
  if (status === 403) return 'Acesso negado. Verifique suas credenciais.';

  if (message.includes('Failed to fetch') || message.includes('NetworkError'))
    return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
  if (message.includes('demorou demais'))
    return 'O servidor está demorando para iniciar. Aguarde alguns instantes e tente novamente.';

  return message;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Wizard de boas-vindas (exibido após registro) ─────────────────────────────

function mostrarWizardBoasVindas(nomeEmpresa) {
  if (document.getElementById('wizardBoasVindas')) return;

  const overlay = document.createElement('div');
  overlay.id = 'wizardBoasVindas';
  overlay.className = 'wizard-overlay';

  const steps = [
    {
      icon: 'fa-rocket',
      titulo: 'Bem-vindo ao LF ERP!',
      texto: `Sua conta <strong>${escapeHtml(nomeEmpresa || 'sua empresa')}</strong> foi criada com sucesso. Você tem <strong>14 dias grátis</strong> para explorar tudo sem cartão de crédito.`,
      btn: 'Vamos começar'
    },
    {
      icon: 'fa-gear',
      titulo: 'Configure sua empresa',
      texto: 'Acesse <strong>Configurações</strong> para adicionar logo, CNPJ, endereço e personalizar os dados da empresa nos documentos.',
      btn: 'Ir para Configurações'
    },
    {
      icon: 'fa-box-open',
      titulo: 'Adicione seus produtos',
      texto: 'Cadastre produtos em <strong>Cadastros → Produtos</strong>. Defina preço, custo, estoque mínimo e categorias para controle completo.',
      btn: 'Ir para Produtos'
    },
    {
      icon: 'fa-users',
      titulo: 'Cadastre seus clientes',
      texto: 'Em <strong>Cadastros → Clientes</strong> você registra clientes, histórico de compras e acesso ao portal de segunda via.',
      btn: 'Ir para Clientes'
    },
    {
      icon: 'fa-cash-register',
      titulo: 'PDV pronto para vender',
      texto: 'Use o <strong>PDV</strong> para registrar vendas rapidamente com atalhos de teclado. Funciona no celular, tablet e computador.',
      btn: 'Ir para o PDV'
    },
    {
      icon: 'fa-circle-check',
      titulo: 'Tudo pronto!',
      texto: 'Explore os módulos no menu lateral. Pressione <strong>Ctrl+K</strong> para busca rápida ou <strong>?</strong> para ver todos os atalhos.',
      btn: 'Ir para o Dashboard'
    }
  ];

  let currentStep = 0;

  function renderStep() {
    const s = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    overlay.innerHTML = `
      <div class="wizard-card">
        <div class="wizard-icon"><i class="fa-solid ${s.icon}"></i></div>
        <h3 class="wizard-title">${s.titulo}</h3>
        <p class="wizard-text">${s.texto}</p>
        <div class="wizard-dots">
          ${steps.map((_, i) => `<div class="wizard-dot${i === currentStep ? ' active' : ''}"></div>`).join('')}
        </div>
        <div class="wizard-actions">
          ${currentStep > 0 ? `<button id="_wzVoltar" class="btn btn-light">Voltar</button>` : ''}
          <button id="_wzProximo" class="btn btn-primary">
            ${isLast ? '<i class="fa-solid fa-check"></i> ' : ''}${s.btn}
          </button>
        </div>
        <button class="wizard-skip" id="_wzPular">Pular tutorial</button>
      </div>`;

    document.getElementById('_wzProximo')?.addEventListener('click', async () => {
      if (currentStep === steps.length - 1) { overlay.remove(); return; }
      currentStep++;
      renderStep();
      if (currentStep === 1) await setActiveView('configuracoes');
      if (currentStep === 2) await setActiveView('produtos');
      if (currentStep === 3) await setActiveView('clientes');
      if (currentStep === 4) await setActiveView('pdv');
      if (currentStep === 5) await setActiveView('dashboard');
    });

    document.getElementById('_wzVoltar')?.addEventListener('click', () => { currentStep--; renderStep(); });
    document.getElementById('_wzPular')?.addEventListener('click', () => overlay.remove());
  }

  renderStep();
  document.body.appendChild(overlay);
}

function reiniciarWizard() {
  const nome = AppState.empresa?.nome || AppState.user?.empresa || '';
  mostrarWizardBoasVindas(nome);
}

// Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Command Palette (Ctrl+K) ──────────────────────────────────────────────────

const _CP_NAV = [
  { label: 'Dashboard',           view: 'dashboard',          icon: 'fa-chart-pie',            group: '' },
  { label: 'PDV — Ponto de Venda', view: 'pdv',               icon: 'fa-cash-register',         group: '' },
  { label: 'Produtos',            view: 'produtos',            icon: 'fa-box-open',              group: 'Cadastros' },
  { label: 'Clientes',            view: 'clientes',            icon: 'fa-users',                 group: 'Cadastros' },
  { label: 'Fornecedores',        view: 'fornecedores',        icon: 'fa-truck-field',           group: 'Cadastros' },
  { label: 'Usuários',            view: 'usuarios',            icon: 'fa-user-shield',           group: 'Cadastros' },
  { label: 'Vendas',              view: 'vendas',              icon: 'fa-cart-shopping',         group: 'Movimentações' },
  { label: 'Compras',             view: 'compras',             icon: 'fa-basket-shopping',       group: 'Movimentações' },
  { label: 'Estoque',             view: 'estoque',             icon: 'fa-warehouse',             group: 'Movimentações' },
  { label: 'Caixa',               view: 'caixa',               icon: 'fa-vault',                 group: 'Movimentações' },
  { label: 'Contas a Receber',    view: 'contas-receber',      icon: 'fa-money-bill-trend-up',   group: 'Financeiro' },
  { label: 'Contas a Pagar',      view: 'contas-pagar',        icon: 'fa-money-bill-transfer',   group: 'Financeiro' },
  { label: 'Fluxo de Caixa',      view: 'fluxo-caixa',         icon: 'fa-arrow-trend-up',        group: 'Financeiro' },
  { label: 'Lançamentos',         view: 'lancamentos',         icon: 'fa-pen-to-square',         group: 'Financeiro' },
  { label: 'Relatórios',          view: 'relatorios',          icon: 'fa-file-lines',            group: 'Relatórios & BI' },
  { label: 'Orçamentos',          view: 'orcamentos',          icon: 'fa-file-lines',            group: 'Fiscal & Docs' },
  { label: 'Pedidos',             view: 'pedidos',             icon: 'fa-clipboard-list',        group: 'Fiscal & Docs' },
  { label: 'Configurações',       view: 'configuracoes',       icon: 'fa-gear',                  group: '' },
];

let _cpSelectedIdx = -1;

function initCommandPalette() {
  const overlay = document.getElementById('cmdPaletteOverlay');
  if (!overlay) return;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCmdPalette(); });
  document.getElementById('cmdPaletteInput')?.addEventListener('input', _cpRender);
  document.getElementById('cmdPaletteInput')?.addEventListener('keydown', _cpKeydown);
  _cpRender();
}

let _cpShortcutBound = false;
function bindCommandPaletteShortcut() {
  if (_cpShortcutBound) return;
  _cpShortcutBound = true;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const overlay = document.getElementById('cmdPaletteOverlay');
      if (!overlay) return;
      if (overlay.classList.contains('hidden')) {
        openCmdPalette();
      } else {
        closeCmdPalette();
      }
    }

    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    if (e.key === '?' && !inInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      openShortcutsModal();
    }
    if (e.key === 'Escape' && !document.getElementById('shortcutsModal')?.classList.contains('hidden')) {
      closeShortcutsModal();
    }
  });

  document.getElementById('shortcutsHelpBtn')?.addEventListener('click', openShortcutsModal);
  document.getElementById('shortcutsModalCloseBtn')?.addEventListener('click', closeShortcutsModal);
  document.getElementById('shortcutsModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('shortcutsModal')) closeShortcutsModal();
  });
  document.getElementById('verTutorialBtn')?.addEventListener('click', () => {
    closeShortcutsModal();
    reiniciarWizard();
  });
}

function openShortcutsModal() {
  document.getElementById('shortcutsModal')?.classList.remove('hidden');
}

function closeShortcutsModal() {
  document.getElementById('shortcutsModal')?.classList.add('hidden');
}

function openCmdPalette() {
  const overlay = document.getElementById('cmdPaletteOverlay');
  const input   = document.getElementById('cmdPaletteInput');
  if (!overlay || !input) return;
  overlay.classList.remove('hidden');
  input.value = '';
  _cpSelectedIdx = -1;
  _cpRender();
  setTimeout(() => input.focus(), 30);
}

function closeCmdPalette() {
  document.getElementById('cmdPaletteOverlay')?.classList.add('hidden');
  _cpSelectedIdx = -1;
}

function _cpRender() {
  const q = (document.getElementById('cmdPaletteInput')?.value || '').toLowerCase().trim();
  const list = document.getElementById('cmdPaletteList');
  if (!list) return;

  const filtered = q ? _CP_NAV.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)) : _CP_NAV;

  if (!filtered.length) {
    const qSafe = q.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    list.innerHTML = `<div class="cmd-palette__empty"><i class="fa-solid fa-magnifying-glass" style="display:block;font-size:1.5rem;opacity:.25;margin-bottom:8px"></i>Nenhum resultado para "${qSafe}"</div>`;
    return;
  }

  let html = '';
  let lastGroup = null;
  filtered.forEach((item, idx) => {
    if (item.group !== lastGroup) {
      if (item.group) html += `<div class="cmd-palette__group-label">${item.group}</div>`;
      lastGroup = item.group;
    }
    html += `<button class="cmd-palette__item${idx === _cpSelectedIdx ? ' selected' : ''}" data-view="${item.view}">
      <span class="cmd-palette__item-icon"><i class="fa-solid ${item.icon}"></i></span>
      <span class="cmd-palette__item-label">${item.label}</span>
    </button>`;
  });

  list.innerHTML = html;
  list.querySelectorAll('.cmd-palette__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeCmdPalette();
      setActiveView(btn.dataset.view);
    });
  });
}

function _cpKeydown(e) {
  const list = document.getElementById('cmdPaletteList');
  const items = list?.querySelectorAll('.cmd-palette__item') || [];
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _cpSelectedIdx = Math.min(_cpSelectedIdx + 1, items.length - 1);
    _cpUpdateSelection(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _cpSelectedIdx = Math.max(_cpSelectedIdx - 1, 0);
    _cpUpdateSelection(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const sel = _cpSelectedIdx >= 0 ? items[_cpSelectedIdx] : items[0];
    if (sel) { closeCmdPalette(); setActiveView(sel.dataset.view); }
  } else if (e.key === 'Escape') {
    closeCmdPalette();
  }
}

function _cpUpdateSelection(items) {
  items.forEach((btn, i) => btn.classList.toggle('selected', i === _cpSelectedIdx));
  if (_cpSelectedIdx >= 0) items[_cpSelectedIdx]?.scrollIntoView({ block: 'nearest' });
}

// Exposição global para handlers inline no HTML
window.openShortcutsModal  = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
window.reiniciarWizard     = reiniciarWizard;
