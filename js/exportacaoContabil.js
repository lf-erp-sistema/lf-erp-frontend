import { showToast } from './feedback.js';
import api from './api.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

const _EXPORT_ALLOWED_HOSTS = ['lf-erp-backend.onrender.com', 'localhost', '127.0.0.1'];
function _validateExportBase(url) {
  if (!url) return false;
  try { const u = new URL(url); return _EXPORT_ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); }
  catch { return false; }
}
const _rawExportUrl = localStorage.getItem('lf_erp_api_url');
const API_BASE = window.LF_ERP_API_URL || (_validateExportBase(_rawExportUrl) ? _rawExportUrl : null) || 'https://lf-erp-backend.onrender.com';

function getToken() {
  try {
    const raw = localStorage.getItem('lf_erp_auth') || sessionStorage.getItem('lf_erp_auth');
    const auth = raw ? JSON.parse(raw) : null;
    return auth?.authToken || auth?.token || null;
  } catch { return null; }
}

async function downloadArquivo(endpoint, params, nomeArquivo) {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v); });

  const token = getToken();
  const resp = await fetch(url.toString(), {
    headers: { Authorization: token ? `Bearer ${token}` : '' }
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.erro || `Erro ${resp.status}`);
  }

  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function mesAnoParaRange(mesAno) {
  if (!mesAno) return { inicio: '', fim: '' };
  const [ano, mes] = mesAno.split('-');
  const ultimo = new Date(Number(ano), Number(mes), 0).getDate();
  return { inicio: `${ano}-${mes}-01`, fim: `${ano}-${mes}-${String(ultimo).padStart(2,'0')}` };
}

function sufixo(mesAno) {
  if (!mesAno) return '';
  return mesAno.replace('-', '');
}

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const EXPORTS = [
  { id: 'vendas',          icon: 'fa-cart-shopping',  titulo: 'Vendas',                ext: 'csv', endpoint: '/exportacao/vendas' },
  { id: 'compras',         icon: 'fa-truck',           titulo: 'Compras',               ext: 'csv', endpoint: '/exportacao/compras' },
  { id: 'contas-receber',  icon: 'fa-arrow-trend-up',  titulo: 'Contas a Receber',      ext: 'csv', endpoint: '/exportacao/contas-receber' },
  { id: 'contas-pagar',    icon: 'fa-arrow-trend-down',titulo: 'Contas a Pagar',        ext: 'csv', endpoint: '/exportacao/contas-pagar' },
  { id: 'lancamentos',     icon: 'fa-list-check',      titulo: 'Lançamentos',           ext: 'csv', endpoint: '/exportacao/lancamentos' },
  { id: 'dre',             icon: 'fa-chart-bar',       titulo: 'DRE Simplificada',      ext: 'csv', endpoint: '/exportacao/dre' },
  { id: 'efd',             icon: 'fa-file-code',       titulo: 'EFD / SPED (rascunho)', ext: 'txt', endpoint: '/exportacao/efd', destaque: true }
];

let _painelCarregando = false;

function injectExportStyles() {
  if (document.getElementById('expStyles')) return;
  const s = document.createElement('style');
  s.id = 'expStyles';
  s.textContent = `
    .exp-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 32px 20px;
      text-align: center;
      color: var(--text-muted, #94a3b8);
      font-size: 13px;
    }
    .exp-empty i { font-size: 1.8rem; opacity: .2; margin-bottom: 4px; }
  `;
  document.head.appendChild(s);
}

const ExportacaoModule = {
  state: { initialized: false, tabAtiva: 'downloads', painelTimer: null },

  init() {
    injectExportStyles();
    if (!this.state.initialized) {
      this.render();
      this.bindEvents();
      this.state.initialized = true;
    }
    // Preenche mês atual se vazio
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2,'0')}`;
    const el = document.getElementById('expMesAno');
    if (el && !el.value) el.value = mesAtual;
  },

  render() {
    const c = document.getElementById('exportacaoContabilContainer');
    if (!c) return;

    c.innerHTML = `
      <!-- Tabs -->
      <div class="exp-tab-bar">
        <button class="exp-tab exp-tab--ativo" data-tab="downloads">
          <i class="fa fa-download"></i> Downloads
        </button>
        <button class="exp-tab" data-tab="painel">
          <i class="fa fa-chart-line"></i> Painel ao Vivo
        </button>
        <button class="exp-tab" data-tab="integracao">
          <i class="fa fa-plug"></i> Integração Automática
        </button>
      </div>

      <!-- Tab: Downloads (existente) -->
      <div id="expTabDownloads">
        <div class="exp-periodo-bar">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label style="font-size:13px;font-weight:600;color:var(--text-muted);">Período:</label>
            <input id="expMesAno" type="month" class="filter-input" style="width:160px;">
            <span style="font-size:12px;color:var(--text-muted);">ou intervalo personalizado:</span>
            <input id="expInicio" type="date" class="filter-input" style="width:150px;" placeholder="Início">
            <input id="expFim"    type="date" class="filter-input" style="width:150px;" placeholder="Fim">
          </div>
          <button class="btn btn-primary btn-sm" id="expBaixarTudoBtn">
            <i class="fa fa-download"></i> Baixar todos (exceto EFD)
          </button>
        </div>

        <div class="exp-grid">
          ${EXPORTS.map((e) => `
            <div class="exp-card ${e.destaque ? 'exp-card--destaque' : ''}">
              <div class="exp-card-icon"><i class="fa ${e.icon}"></i></div>
              <div class="exp-card-body">
                <div class="exp-card-title">${e.titulo} <span class="exp-ext">.${e.ext}</span></div>
              </div>
              <button class="btn btn-secondary btn-sm exp-dl-btn" data-endpoint="${e.endpoint}" data-ext="${e.ext}" data-id="${e.id}">
                <i class="fa fa-download"></i> Baixar
              </button>
            </div>
          `).join('')}
        </div>

        <div class="exp-nota">
          <i class="fa fa-circle-info"></i>
          CSV compatível com Excel/Sheets/sistemas contábeis — separador ponto e vírgula (;), UTF-8.
          EFD é rascunho SPED — deve ser revisado pelo contador antes de envio à SEFAZ.
        </div>
      </div>

      <!-- Tab: Painel ao Vivo -->
      <div id="expTabPainel" class="hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <label style="font-size:13px;font-weight:600;color:var(--text-muted);">Período:</label>
            <input id="expPainelInicio" type="date" class="filter-input" style="width:150px;">
            <input id="expPainelFim"    type="date" class="filter-input" style="width:150px;">
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="expPainelTs" style="font-size:11px;color:var(--text-muted)"></span>
            <button class="btn btn-secondary btn-sm" id="expPainelRefreshBtn">
              <i class="fa fa-rotate-right"></i> Atualizar
            </button>
          </div>
        </div>
        <div id="expPainelKpis" class="exp-kpi-grid">
          <div class="exp-kpi-skeleton"></div><div class="exp-kpi-skeleton"></div>
          <div class="exp-kpi-skeleton"></div><div class="exp-kpi-skeleton"></div>
          <div class="exp-kpi-skeleton"></div>
        </div>
      </div>

      <!-- Tab: Integração Automática -->
      <div id="expTabIntegracao" class="hidden">
        <div class="exp-integracao-form" id="expIntegracaoForm">
          <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
            <i class="fa fa-spinner fa-spin"></i> Carregando configuração...
          </div>
        </div>
      </div>
    `;
  },

  bindEvents() {
    const c = document.getElementById('exportacaoContabilContainer');
    if (!c) return;

    // Troca de tabs
    c.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this.trocarTab(tab.dataset.tab);
        return;
      }

      // Botão download individual
      const btn = e.target.closest('[data-endpoint]');
      if (btn) {
        this.baixar(btn.dataset.endpoint, btn.dataset.ext, btn.dataset.id, btn);
        return;
      }

      // Botão baixar todos
      if (e.target.closest('#expBaixarTudoBtn')) {
        this.baixarTodos();
        return;
      }

      // Botão atualizar painel
      if (e.target.closest('#expPainelRefreshBtn')) {
        this.carregarPainel();
        return;
      }

      // Botão salvar integração
      if (e.target.closest('#expIntegracaoSalvarBtn')) {
        this.salvarIntegracao();
        return;
      }

      // Botão testar webhook
      if (e.target.closest('#expIntegracaoTestarBtn')) {
        this.testarWebhook();
        return;
      }
    });

    // Refresh painel ao mudar datas
    c.addEventListener('change', (e) => {
      if (e.target.id === 'expPainelInicio' || e.target.id === 'expPainelFim') {
        this.carregarPainel();
      }
    });
  },

  trocarTab(novaTab) {
    const c = document.getElementById('exportacaoContabilContainer');
    if (!c) return;

    // Atualiza botões
    c.querySelectorAll('.exp-tab').forEach((btn) => {
      btn.classList.toggle('exp-tab--ativo', btn.dataset.tab === novaTab);
    });

    // Mostra/oculta painéis
    ['downloads', 'painel', 'integracao'].forEach((t) => {
      const el = document.getElementById(`expTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
      if (el) el.classList.toggle('hidden', t !== novaTab);
    });

    this.state.tabAtiva = novaTab;

    if (novaTab === 'painel') {
      const hojeStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
      const ini = document.getElementById('expPainelInicio');
      const fim = document.getElementById('expPainelFim');
      if (ini && !ini.value) ini.value = `${hojeStr.slice(0, 7)}-01`;
      if (fim && !fim.value) fim.value = hojeStr;
      this.carregarPainel();
    }
    if (novaTab === 'integracao') this.carregarIntegracao();
  },

  getPeriodo() {
    const mesAno = document.getElementById('expMesAno')?.value;
    const inicio = document.getElementById('expInicio')?.value;
    const fim    = document.getElementById('expFim')?.value;
    if (inicio && fim) return { inicio, fim };
    if (mesAno) return mesAnoParaRange(mesAno);
    return { inicio: '', fim: '' };
  },

  async baixar(endpoint, ext, id, btn) {
    const { inicio, fim } = this.getPeriodo();
    if (!inicio) { showToast('Selecione um período antes de baixar', 'error'); return; }
    const mesAno = document.getElementById('expMesAno')?.value;
    const suf    = mesAno ? sufixo(mesAno) : inicio.replace(/-/g, '').substring(0, 6);
    const nome   = `${id.replace('-', '_')}_${suf}.${ext}`;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Baixando...'; }
    try {
      await downloadArquivo(endpoint, { inicio, fim }, nome);
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-download"></i> Baixar'; }
    }
  },

  async baixarTodos() {
    const { inicio } = this.getPeriodo();
    if (!inicio) { showToast('Selecione um período antes de baixar', 'error'); return; }
    const endpoints = EXPORTS.filter((e) => e.ext === 'csv');
    const btn = document.getElementById('expBaixarTudoBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Gerando...'; }
    let erros = 0;
    for (const item of endpoints) {
      try { await this.baixar(item.endpoint, item.ext, item.id, null); }
      catch { erros++; }
      await new Promise((r) => setTimeout(r, 400));
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-download"></i> Baixar todos (exceto EFD)'; }
    if (erros === 0) showToast('Todos os arquivos gerados!', 'success');
    else showToast(`${erros} arquivo(s) com erro. Verifique o período.`, 'error');
  },

  // ── Painel ao Vivo ──────────────────────────────────────────────────────

  async carregarPainel() {
    if (_painelCarregando) return;
    _painelCarregando = true;
    const kpisEl = document.getElementById('expPainelKpis');
    const tsEl   = document.getElementById('expPainelTs');
    if (!kpisEl) { _painelCarregando = false; return; }

    const inicio = document.getElementById('expPainelInicio')?.value;
    const fim    = document.getElementById('expPainelFim')?.value;
    const params = {};
    if (inicio) params.inicio = inicio;
    if (fim)    params.fim    = fim;

    kpisEl.innerHTML = Array.from({ length: 5 }).map(() =>
      '<div class="exp-kpi-skeleton"></div>'
    ).join('');

    try {
      const data = await api.request('/exportacao/painel?' + new URLSearchParams(params));
      const p = data?.painel;

      if (!p) {
        kpisEl.innerHTML = `<div class="exp-empty" style="grid-column:1/-1"><i class="fa-solid fa-chart-bar"></i>Nenhum dado disponível para o período</div>`;
        return;
      }

      const res = p.resultado;
      const resCor  = res >= 0 ? 'var(--success)' : 'var(--danger)';
      const resIcon = res >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';

      kpisEl.innerHTML = `
        <div class="exp-kpi-card">
          <div class="exp-kpi-icon" style="background:#dbeafe;color:#2563eb"><i class="fa fa-cart-shopping"></i></div>
          <div class="exp-kpi-body">
            <div class="exp-kpi-label">Vendas (${p.vendas.qtd})</div>
            <div class="exp-kpi-value">${brl(p.vendas.total)}</div>
          </div>
        </div>
        <div class="exp-kpi-card">
          <div class="exp-kpi-icon" style="background:var(--danger-soft);color:var(--danger)"><i class="fa fa-truck"></i></div>
          <div class="exp-kpi-body">
            <div class="exp-kpi-label">Compras (${p.compras.qtd})</div>
            <div class="exp-kpi-value">${brl(p.compras.total)}</div>
          </div>
        </div>
        <div class="exp-kpi-card">
          <div class="exp-kpi-icon" style="background:var(--success-soft);color:var(--success)"><i class="fa fa-arrow-down-to-line"></i></div>
          <div class="exp-kpi-body">
            <div class="exp-kpi-label">A Receber (em aberto)</div>
            <div class="exp-kpi-value">${brl(p.cr_pendente)}</div>
          </div>
        </div>
        <div class="exp-kpi-card">
          <div class="exp-kpi-icon" style="background:var(--danger-soft);color:var(--danger)"><i class="fa fa-arrow-up-from-line"></i></div>
          <div class="exp-kpi-body">
            <div class="exp-kpi-label">A Pagar (em aberto)</div>
            <div class="exp-kpi-value">${brl(p.cp_pendente)}</div>
          </div>
        </div>
        <div class="exp-kpi-card exp-kpi-card--resultado">
          <div class="exp-kpi-icon" style="background:${res >= 0 ? 'var(--success-soft)' : 'var(--danger-soft)'};color:${resCor}"><i class="fa ${resIcon}"></i></div>
          <div class="exp-kpi-body">
            <div class="exp-kpi-label">Resultado Operacional</div>
            <div class="exp-kpi-value" style="color:${resCor}">${brl(res)}</div>
          </div>
        </div>
      `;

      if (tsEl) tsEl.textContent = `Atualizado às ${p.atualizado_em?.substring(11, 16)}`;
    } catch (err) {
      kpisEl.innerHTML = `<div class="module-feedback module-feedback--error" style="grid-column:1/-1">
        <i class="fa fa-triangle-exclamation"></i> ${escapeHtml(buildFriendlyError(err))}
      </div>`;
    } finally {
      _painelCarregando = false;
    }
  },

  // ── Integração Automática ───────────────────────────────────────────────

  async carregarIntegracao() {
    const form = document.getElementById('expIntegracaoForm');
    if (!form) return;

    try {
      const data = await api.request('/exportacao/integracao');
      const cfg  = data.config || {};
      const ea   = cfg.eventos_ativos || ['venda.criada', 'recebimento.registrado', 'pagamento.registrado'];

      const checked = (evt) => ea.includes(evt) ? 'checked' : '';

      form.innerHTML = `
        <div class="exp-integracao-section">
          <h4 style="font-size:.85rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px">
            <i class="fa fa-plug" style="margin-right:6px"></i>Webhook — URL de integração
          </h4>
          <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px;line-height:1.6">
            Configure uma URL para receber notificações em tempo real sempre que uma venda, recebimento ou pagamento for registrado.
            Compatível com Google Apps Script, Make.com, Zapier, n8n, ou qualquer endpoint HTTP.
          </p>

          <div class="form-group">
            <label class="form-label">URL do Webhook</label>
            <input id="expWHUrl" type="url" class="form-input" placeholder="https://seu-sistema.com/webhook"
              value="${escapeHtml(cfg.webhook_url || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Secret (opcional) <span style="font-size:.78rem;color:var(--text-muted)">— enviado no header X-LF-Secret</span></label>
            <input id="expWHSecret" type="password" class="form-input" placeholder="${cfg.webhook_secret === '***' ? '(já configurado)' : 'Deixe em branco para sem autenticação'}"
              value="">
          </div>

          <div class="form-group">
            <label class="form-label" style="margin-bottom:8px">Eventos que disparam o webhook</label>
            <div style="display:flex;flex-direction:column;gap:6px">
              <label style="display:flex;align-items:center;gap:8px;font-size:.85rem">
                <input type="checkbox" id="expEvtVenda" ${checked('venda.criada')}> Venda criada
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:.85rem">
                <input type="checkbox" id="expEvtRecebimento" ${checked('recebimento.registrado')}> Recebimento registrado (conta a receber baixada)
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:.85rem">
                <input type="checkbox" id="expEvtPagamento" ${checked('pagamento.registrado')}> Pagamento registrado (conta a pagar baixada)
              </label>
            </div>
          </div>

          <div class="form-group" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="expWHAtivo" ${cfg.ativo !== false ? 'checked' : ''} style="width:16px;height:16px;">
            <label for="expWHAtivo" style="font-size:.85rem;font-weight:600">Integração ativa</label>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="expIntegracaoSalvarBtn">
            <i class="fa fa-floppy-disk"></i> Salvar Configuração
          </button>
          <button class="btn btn-secondary" id="expIntegracaoTestarBtn" ${!cfg.webhook_url ? 'disabled' : ''}>
            <i class="fa fa-paper-plane"></i> Testar Webhook
          </button>
        </div>

        <div class="exp-nota" style="margin-top:20px">
          <i class="fa fa-circle-info"></i>
          O payload enviado ao webhook contém: <code>evento</code>, <code>timestamp</code> (America/Fortaleza),
          <code>empresa_id</code> e <code>dados</code> com os detalhes do evento.
          Timeout: 8 segundos — certifique-se de que o endpoint responde rapidamente.
        </div>
      `;
    } catch (err) {
      form.innerHTML = `<div style="text-align:center;padding:32px 20px">
        <div class="module-feedback module-feedback--error" style="margin-bottom:16px">
          <i class="fa fa-triangle-exclamation"></i> ${escapeHtml(buildFriendlyError(err))}
        </div>
        <button class="btn btn-light" id="expIntegracaoRetryBtn" type="button">
          <i class="fa fa-rotate"></i> Tentar novamente
        </button>
      </div>`;
      document.getElementById('expIntegracaoRetryBtn')?.addEventListener('click', () => this.carregarIntegracao());
    }
  },

  async salvarIntegracao() {
    const btn = document.getElementById('expIntegracaoSalvarBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...'; }

    const eventosAtivos = [];
    if (document.getElementById('expEvtVenda')?.checked)       eventosAtivos.push('venda.criada');
    if (document.getElementById('expEvtRecebimento')?.checked) eventosAtivos.push('recebimento.registrado');
    if (document.getElementById('expEvtPagamento')?.checked)   eventosAtivos.push('pagamento.registrado');

    try {
      await api.request('/exportacao/integracao', {
        method: 'PUT',
        body: {
          webhook_url:    document.getElementById('expWHUrl')?.value || '',
          webhook_secret: document.getElementById('expWHSecret')?.value || '',
          eventos_ativos: eventosAtivos,
          ativo:          document.getElementById('expWHAtivo')?.checked !== false
        }
      });
      showToast('Configuração salva com sucesso!', 'success');
      // Recarrega para atualizar estado do botão Testar
      await this.carregarIntegracao();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-floppy-disk"></i> Salvar Configuração'; }
    }
  },

  async testarWebhook() {
    const btn = document.getElementById('expIntegracaoTestarBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Testando...'; }
    try {
      const data = await api.request('/exportacao/integracao/testar', { method: 'POST' });
      showToast(data.mensagem || 'Webhook disparado!', data.status_http < 400 ? 'success' : 'error');
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane"></i> Testar Webhook'; }
    }
  }
};

export async function initExportacaoContabilModule() {
  return ExportacaoModule.init();
}

export default ExportacaoModule;
