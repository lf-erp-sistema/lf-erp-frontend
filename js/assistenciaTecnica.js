'use strict';
import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

// ── Status ─────────────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  aberta:                 'Aberta',
  diagnostico:            'Em Diagnóstico',
  orcamento_enviado:      'Orçamento Enviado',
  aguardando_aprovacao:   'Aguardando Aprovação',
  aprovada:               'Aprovada',
  em_execucao:            'Em Manutenção',
  aguardando_peca:        'Aguardando Peça',
  pronto:                 'Pronto p/ Retirada',
  entregue:               'Entregue',
  cancelada:              'Cancelada',
  reprovada:              'Reprovada',
};

const STATUS_CSS = {
  aberta:               'badge--info',
  diagnostico:          'badge--warning',
  orcamento_enviado:    'badge--warning',
  aguardando_aprovacao: 'badge--warning',
  aprovada:             'badge--primary',
  em_execucao:          'badge--primary',
  aguardando_peca:      'badge--warning',
  pronto:               'badge--success',
  entregue:             '',
  cancelada:            'badge--danger',
  reprovada:            'badge--danger',
};

const PROXIMO_STATUS = {
  aberta:              'diagnostico',
  diagnostico:         'orcamento_enviado',
  orcamento_enviado:   'aguardando_aprovacao',
  aguardando_aprovacao:'aprovada',
  aprovada:            'em_execucao',
  em_execucao:         'pronto',
  aguardando_peca:     'em_execucao',
  pronto:              'entregue',
};

const TIPOS_APARELHO = ['Smartphone', 'Notebook', 'Computador', 'Tablet', 'Smartwatch', 'Console', 'Impressora', 'Smart TV', 'Outro'];

const CHECKLIST_PADRAO = [
  { key:'tela_trinca',      tipo:'fisico',    label:'Tela trincada/quebrada' },
  { key:'tela_manchas',     tipo:'fisico',    label:'Manchas na tela' },
  { key:'carcaca_danos',    tipo:'fisico',    label:'Danos na carcaça' },
  { key:'botoes_fisicos',   tipo:'funcional', label:'Botões físicos funcionando' },
  { key:'touch',            tipo:'funcional', label:'Touch screen funcionando' },
  { key:'audio',            tipo:'funcional', label:'Áudio / caixa de som' },
  { key:'microfone',        tipo:'funcional', label:'Microfone' },
  { key:'camera_traseira',  tipo:'funcional', label:'Câmera traseira' },
  { key:'camera_frontal',   tipo:'funcional', label:'Câmera frontal' },
  { key:'carregamento',     tipo:'funcional', label:'Porta de carregamento' },
  { key:'bateria',          tipo:'funcional', label:'Bateria (duração/carga)' },
  { key:'wifi',             tipo:'funcional', label:'Wi-Fi' },
  { key:'bluetooth',        tipo:'funcional', label:'Bluetooth' },
  { key:'biometria',        tipo:'funcional', label:'Biometria / Face ID' },
];

// ── Estilos inline ─────────────────────────────────────────────────────────────
function injectAtStyles() {
  if (document.getElementById('atStyles')) return;
  const s = document.createElement('style');
  s.id = 'atStyles';
  s.textContent = `
    .at-layout { display:flex; flex-direction:column; gap:0; height:100%; }
    .at-view    { display:none; }
    .at-view.active { display:block; }

    /* Lista OS */
    .at-table-wrap { overflow-x:auto; }
    .at-table { width:100%; border-collapse:collapse; font-size:13px; }
    .at-table th { background:var(--bg-secondary); padding:9px 12px; text-align:left;
                   font-weight:600; white-space:nowrap; border-bottom:1px solid var(--border); color:var(--text-muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
    .at-table td { padding:10px 12px; border-bottom:1px solid var(--border); vertical-align:middle; }
    .at-table tr:hover td { background:var(--bg-hover); }
    .at-table .at-cliente { font-weight:600; color:var(--text); }
    .at-table .at-device  { color:var(--text-muted); font-size:12px; margin-top:2px; }
    .at-table .at-numero  { font-weight:700; font-size:12px; letter-spacing:.04em; color:var(--primary); }
    .at-table .at-actions { display:flex; gap:6px; }
    .at-table .at-actions button { padding:4px 10px; border-radius:5px; font-size:12px; border:1px solid var(--border); background:var(--bg); cursor:pointer; color:var(--text); }
    .at-table .at-actions button:hover { background:var(--bg-secondary); }

    /* OS detail */
    .at-detail { padding:24px; max-width:900px; }
    .at-detail-header { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
    .at-detail-header h2 { font-size:18px; font-weight:700; margin:0; }
    .at-section { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:16px; }
    .at-section h3 { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); margin:0 0 12px; }
    .at-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    @media(max-width:600px){ .at-grid-2{ grid-template-columns:1fr; } }
    .at-field label { display:block; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-bottom:4px; }
    .at-field span  { font-size:14px; color:var(--text); }
    .at-field span.empty { color:var(--text-muted); font-style:italic; font-size:13px; }

    /* Timeline */
    .at-timeline { list-style:none; padding:0; margin:0; }
    .at-timeline li { display:flex; gap:12px; padding:8px 0; border-bottom:1px solid var(--border); }
    .at-timeline li:last-child { border-bottom:none; }
    .at-timeline .at-ev-icon { width:28px; height:28px; border-radius:50%; background:var(--bg-secondary); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px; }
    .at-timeline .at-ev-body { flex:1; }
    .at-timeline .at-ev-desc { font-size:13px; color:var(--text); }
    .at-timeline .at-ev-meta { font-size:11px; color:var(--text-muted); margin-top:2px; }

    /* Checklist */
    .at-checklist-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:8px; }
    .at-cl-item { display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--border); border-radius:6px; font-size:13px; }
    .at-cl-item.ok     { border-color:#22c55e; background:rgba(34,197,94,.07); }
    .at-cl-item.problema { border-color:#ef4444; background:rgba(239,68,68,.07); }
    .at-cl-item.nao_aplica { opacity:.5; }

    /* Badge */
    .badge { display:inline-flex; align-items:center; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:.03em; background:var(--bg-secondary); color:var(--text-muted); white-space:nowrap; }
    .badge--info    { background:rgba(59,130,246,.12); color:#3b82f6; }
    .badge--warning { background:rgba(234,179,8,.12);  color:#b45309; }
    .badge--primary { background:rgba(139,92,246,.12); color:#7c3aed; }
    .badge--success { background:rgba(34,197,94,.12);  color:#16a34a; }
    .badge--danger  { background:rgba(239,68,68,.12);  color:#dc2626; }
    .badge--ativo   { background:rgba(34,197,94,.12);  color:#16a34a; }
    .badge--vencido { background:rgba(239,68,68,.12);  color:#dc2626; }

    /* Form modal */
    .at-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
    .at-modal { background:var(--bg); border-radius:12px; box-shadow:0 16px 48px rgba(0,0,0,.22); width:100%; max-width:640px; max-height:90vh; overflow:auto; }
    .at-modal-header { padding:20px 24px 0; display:flex; align-items:center; justify-content:space-between; }
    .at-modal-header h2 { font-size:17px; font-weight:700; margin:0; }
    .at-modal-header button { background:none; border:none; cursor:pointer; font-size:18px; color:var(--text-muted); padding:4px 8px; }
    .at-modal-body { padding:20px 24px 24px; }
    .at-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    @media(max-width:600px){ .at-form-grid{ grid-template-columns:1fr; } }
    .at-form-full { grid-column:1/-1; }
    .at-form-label { display:block; font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px; }
    .at-form-input,.at-form-select,.at-form-textarea { width:100%; box-sizing:border-box; padding:8px 11px; border:1px solid var(--border); border-radius:7px; background:var(--bg); color:var(--text); font-size:14px; transition:border .15s; }
    .at-form-input:focus,.at-form-select:focus,.at-form-textarea:focus { outline:none; border-color:var(--primary); }
    .at-form-textarea { resize:vertical; min-height:72px; }
    .at-modal-footer { padding:16px 24px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px; }
    .at-btn { padding:9px 18px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; border:none; transition:opacity .15s; }
    .at-btn--primary { background:var(--primary); color:#fff; }
    .at-btn--secondary { background:var(--bg-secondary); color:var(--text); border:1px solid var(--border); }
    .at-btn:hover { opacity:.88; }

    /* Status actions bar */
    .at-status-bar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
    .at-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:48px 20px; text-align:center; }
    .at-empty i { font-size:2.4rem; opacity:.18; }
    .at-empty strong { font-size:15px; color:var(--text); }
    .at-empty p { font-size:13px; margin:0; color:var(--text-muted); }

    /* Garantia */
    .at-garantia-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; }
  `;
  document.head.appendChild(s);
}

// ── Estado ─────────────────────────────────────────────────────────────────────
const AT = {
  state: {
    view: 'lista',    // 'lista' | 'detalhe' | 'aparelhos' | 'garantias' | 'relatorios'
    os: [],
    total: 0,
    filtroStatus: '',
    busca: '',
    carregando: false,
    paginaAtual: 0,
    porPagina: 30,
    osDetalhe: null,
    dashboard: null,
  },

  // ── Init ────────────────────────────────────────────────────────────────────
  async init() {
    injectAtStyles();
    this.render();
    this.bindEvents();
    await Promise.all([this.loadDashboard(), this.loadOS()]);
  },

  // ── Render shell ────────────────────────────────────────────────────────────
  render() {
    const container = document.getElementById('assistenciaContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="at-layout">

        <!-- KPI strip -->
        <div class="cl-tb-kpi-strip" id="atKpiStrip">
          <div class="cl-tb-kpi-item"><span class="cl-tb-kpi-lbl">Abertas</span><span class="cl-tb-kpi-val" id="atKpiAbertas">—</span></div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item"><span class="cl-tb-kpi-lbl">Diagnóstico</span><span class="cl-tb-kpi-val" id="atKpiDiag">—</span></div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item cl-tb-kpi-warn"><span class="cl-tb-kpi-lbl">Aguardando</span><span class="cl-tb-kpi-val" id="atKpiAguard">—</span></div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item"><span class="cl-tb-kpi-lbl">Em Manutenção</span><span class="cl-tb-kpi-val" id="atKpiMan">—</span></div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item cl-tb-kpi-ok"><span class="cl-tb-kpi-lbl">Prontos</span><span class="cl-tb-kpi-val" id="atKpiPronto">—</span></div>
          <div class="cl-tb-kpi-sep"></div>
          <div class="cl-tb-kpi-item"><span class="cl-tb-kpi-lbl">Fat. 30d</span><span class="cl-tb-kpi-val" id="atKpiFat">—</span></div>
        </div>

        <!-- Toolbar -->
        <div class="cl-tb-row">
          <div class="cl-tb-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="atBusca" placeholder="Buscar por número, IMEI, cliente, modelo…" autocomplete="off">
          </div>
          <select id="atFiltroStatus" class="cl-tb-select">
            <option value="">Todos os status</option>
            ${Object.entries(STATUS_LABEL).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <div class="cl-tb-actions">
            <button class="cl-tb-btn" id="atBtnAparelhos" title="Aparelhos">
              <i class="fa-solid fa-mobile-screen-button"></i><span class="cl-tb-btn-lbl">Aparelhos</span>
            </button>
            <button class="cl-tb-btn" id="atBtnGarantias" title="Garantias">
              <i class="fa-solid fa-shield-halved"></i><span class="cl-tb-btn-lbl">Garantias</span>
            </button>
            <button class="cl-tb-btn cl-tb-btn--primary" id="atBtnNova">
              <i class="fa-solid fa-plus"></i><span class="cl-tb-btn-lbl">Nova OS</span>
            </button>
          </div>
        </div>

        <!-- Views -->
        <div id="atViewLista" class="at-view active at-table-wrap">
          <table class="at-table">
            <thead>
              <tr>
                <th>Nº OS</th>
                <th>Status</th>
                <th>Cliente</th>
                <th>Equipamento</th>
                <th>IMEI</th>
                <th>Técnico</th>
                <th>Valor</th>
                <th>Data Entrada</th>
                <th style="width:120px">Ações</th>
              </tr>
            </thead>
            <tbody id="atTbody">
              <tr><td colspan="9" style="padding:0">
                <div class="at-empty"><i class="fa-solid fa-mobile-screen-button"></i><strong>Carregando…</strong></div>
              </td></tr>
            </tbody>
          </table>
          <div id="atPagination" style="padding:12px 16px; color:var(--text-muted); font-size:13px;"></div>
        </div>

        <div id="atViewDetalhe" class="at-view at-detail"></div>
        <div id="atViewAparelhos" class="at-view"></div>
        <div id="atViewGarantias" class="at-view"></div>

      </div>`;
  },

  // ── Events ──────────────────────────────────────────────────────────────────
  bindEvents() {
    const c = document.getElementById('assistenciaContainer');
    if (!c) return;

    c.addEventListener('input', e => {
      if (e.target.id === 'atBusca') {
        clearTimeout(this._buscaTimer);
        this._buscaTimer = setTimeout(() => {
          this.state.busca = e.target.value;
          this.state.paginaAtual = 0;
          this.loadOS();
        }, 380);
      }
    });

    c.addEventListener('change', e => {
      if (e.target.id === 'atFiltroStatus') {
        this.state.filtroStatus = e.target.value;
        this.state.paginaAtual = 0;
        this.loadOS();
      }
    });

    c.addEventListener('click', async e => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) {
        // Nav buttons
        if (e.target.closest('#atBtnNova'))     { this.abrirFormularioOS(); return; }
        if (e.target.closest('#atBtnAparelhos')){ this.mostrarAparelhos(); return; }
        if (e.target.closest('#atBtnGarantias')){ this.mostrarGarantias(); return; }
        return;
      }
      const action = btn.dataset.action;
      const id     = Number(btn.dataset.id);

      if (action === 'ver')        { await this.mostrarDetalhe(id); }
      else if (action === 'editar'){ await this.abrirFormularioOS(id); }
      else if (action === 'excluir'){
        const ok = await confirmarAcao('Excluir esta OS?', 'Essa ação é irreversível.', 'Excluir');
        if (ok) { await this.excluirOS(id); }
      }
      else if (action === 'avancar-status') { await this.avancarStatus(id, btn.dataset.status); }
      else if (action === 'entregar')  { await this.abrirEntrega(id); }
      else if (action === 'orcamento') { await this.abrirOrcamento(id); }
      else if (action === 'garantia')  { await this.abrirGarantia(id); }
      else if (action === 'evento')    { await this.abrirEvento(id); }
      else if (action === 'back-lista'){ this.voltarLista(); }
    });
  },

  // ── Load ────────────────────────────────────────────────────────────────────
  async loadDashboard() {
    try {
      const data = await api.getAtDashboard();
      this.state.dashboard = data.kpis;
      this.renderKpis(data.kpis);
    } catch { /* não fatal */ }
  },

  renderKpis(k) {
    const fmt = v => v == null ? '—' : String(v);
    const fmtR = v => v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('atKpiAbertas') && (document.getElementById('atKpiAbertas').textContent  = fmt(k.os_abertas));
    document.getElementById('atKpiDiag')    && (document.getElementById('atKpiDiag').textContent     = fmt(k.em_diagnostico));
    document.getElementById('atKpiAguard')  && (document.getElementById('atKpiAguard').textContent   = fmt((k.aguardando_orcamento||0)+(k.aguardando_aprovacao||0)+(k.aguardando_peca||0)));
    document.getElementById('atKpiMan')     && (document.getElementById('atKpiMan').textContent      = fmt(k.em_manutencao));
    document.getElementById('atKpiPronto')  && (document.getElementById('atKpiPronto').textContent   = fmt(k.prontas));
    document.getElementById('atKpiFat')     && (document.getElementById('atKpiFat').textContent      = fmtR(k.faturamento_30d));
  },

  async loadOS() {
    if (this.state.carregando) return;
    this.state.carregando = true;
    const tbody = document.getElementById('atTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="padding:0">
      <div class="at-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><strong>Carregando…</strong></div>
    </td></tr>`;

    try {
      const params = {
        limit:  this.state.porPagina,
        offset: this.state.paginaAtual * this.state.porPagina,
      };
      if (this.state.filtroStatus) params.status = this.state.filtroStatus;
      if (this.state.busca)        params.busca   = this.state.busca;

      const data = await api.getAtOS(params);
      this.state.os    = data.ordens || [];
      this.state.total = data.total  || 0;
      this.renderTabela();
    } catch (err) {
      const msg = buildFriendlyError?.(err) || err?.message || 'Erro ao carregar OS';
      if (tbody) tbody.innerHTML = `<tr><td colspan="9">
        <div class="at-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>${escapeHtml(msg)}</strong></div>
      </td></tr>`;
    } finally {
      this.state.carregando = false;
    }
  },

  renderTabela() {
    const tbody = document.getElementById('atTbody');
    const pag   = document.getElementById('atPagination');
    if (!tbody) return;

    if (!this.state.os.length) {
      tbody.innerHTML = `<tr><td colspan="9">
        <div class="at-empty">
          <i class="fa-solid fa-mobile-screen-button"></i>
          <strong>Nenhuma OS encontrada</strong>
          <p>Abra a primeira OS pelo botão "Nova OS"</p>
        </div>
      </td></tr>`;
      if (pag) pag.textContent = '';
      return;
    }

    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
    const fmtVal  = v => v ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';

    tbody.innerHTML = this.state.os.map(o => {
      const statusBadge = `<span class="badge ${STATUS_CSS[o.status]||''}">${STATUS_LABEL[o.status]||o.status}</span>`;
      const device = [o.equipamento_tipo, o.equipamento_marca, o.equipamento_modelo].filter(Boolean).join(' ');
      const proximo = PROXIMO_STATUS[o.status];
      return `
        <tr>
          <td><span class="at-numero">${escapeHtml(o.numero||'')}</span></td>
          <td>${statusBadge}</td>
          <td>
            <div class="at-cliente">${escapeHtml(o.cliente_nome||'—')}</div>
            <div class="at-device">${escapeHtml(o.cliente_telefone||'')}</div>
          </td>
          <td>
            <div>${escapeHtml(device||'—')}</div>
            <div class="at-device">${escapeHtml(o.equipamento_cor||'')}</div>
          </td>
          <td style="font-size:12px;font-family:monospace">${escapeHtml(o.equipamento_imei1||'—')}</td>
          <td>${escapeHtml(o.tecnico||'—')}</td>
          <td>${fmtVal(o.valor_total)}</td>
          <td>${fmtDate(o.data_entrada)}</td>
          <td>
            <div class="at-actions">
              <button data-action="ver" data-id="${o.id}" title="Ver detalhes"><i class="fa-solid fa-eye"></i></button>
              ${proximo ? `<button data-action="avancar-status" data-id="${o.id}" data-status="${proximo}" title="Avançar: ${STATUS_LABEL[proximo]||proximo}"><i class="fa-solid fa-forward-step"></i></button>` : ''}
              <button data-action="excluir" data-id="${o.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
    }).join('');

    if (pag) {
      const total = this.state.total;
      const inicio = this.state.paginaAtual * this.state.porPagina + 1;
      const fim    = Math.min(inicio + this.state.os.length - 1, total);
      pag.innerHTML = total > this.state.porPagina
        ? `<span>Exibindo ${inicio}–${fim} de ${total}</span>
           ${this.state.paginaAtual > 0 ? `<button style="margin-left:8px;cursor:pointer;padding:3px 10px;border-radius:5px;border:1px solid var(--border)" onclick="AT._pagina(-1)">‹ Anterior</button>` : ''}
           ${fim < total ? `<button style="margin-left:6px;cursor:pointer;padding:3px 10px;border-radius:5px;border:1px solid var(--border)" onclick="AT._pagina(1)">Próxima ›</button>` : ''}`
        : `${total} ordem${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`;
    }
  },

  _pagina(delta) {
    this.state.paginaAtual = Math.max(0, this.state.paginaAtual + delta);
    this.loadOS();
  },

  // ── Detalhe de OS ──────────────────────────────────────────────────────────
  async mostrarDetalhe(id) {
    this.switchView('detalhe');
    const container = document.getElementById('atViewDetalhe');
    if (container) container.innerHTML = `<div class="at-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Carregando…</p></div>`;

    try {
      const data = await api.getAtOrdem(id);
      this.state.osDetalhe = data;
      this.renderDetalhe(data);
    } catch (err) {
      const msg = buildFriendlyError?.(err) || err?.message || 'Erro ao carregar OS';
      if (container) container.innerHTML = `<div class="at-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>${escapeHtml(msg)}</strong></div>`;
    }
  },

  renderDetalhe({ ordem: os, itens = [], checklist = [], eventos = [], garantia = null }) {
    const container = document.getElementById('atViewDetalhe');
    if (!container) return;

    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
    const fmtVal  = v => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';
    const field   = (label, value) =>
      `<div class="at-field"><label>${label}</label><span${!value ? ' class="empty"' : ''}>${value ? escapeHtml(String(value)) : 'Não informado'}</span></div>`;

    const proximo = PROXIMO_STATUS[os.status];

    // Timeline icons
    const evIcon = {
      criacao:     'fa-circle-plus',
      status:      'fa-arrow-right-arrow-left',
      edicao:      'fa-pen',
      aprovacao:   'fa-check-circle',
      reprovacao:  'fa-times-circle',
      entrega:     'fa-box-open',
      observacao:  'fa-comment',
    };

    const checkResult = { ok: 'OK', problema: 'Problema', nao_testado: 'N/T', nao_aplica: 'N/A' };

    container.innerHTML = `
      <div class="at-detail-header">
        <button class="at-btn at-btn--secondary" data-action="back-lista"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
        <h2>${escapeHtml(os.numero)}</h2>
        <span class="badge ${STATUS_CSS[os.status]||''}">${STATUS_LABEL[os.status]||os.status}</span>
        ${garantia ? `<span class="at-garantia-badge badge badge--${new Date(garantia.data_fim) >= new Date() ? 'ativo' : 'vencido'}"><i class="fa-solid fa-shield-halved"></i> Garantia ${new Date(garantia.data_fim) >= new Date() ? 'ativa' : 'vencida'} até ${fmtDate(garantia.data_fim)}</span>` : ''}
      </div>

      <div class="at-status-bar">
        ${proximo ? `<button class="at-btn at-btn--primary" data-action="avancar-status" data-id="${os.id}" data-status="${proximo}"><i class="fa-solid fa-forward-step"></i> Avançar: ${STATUS_LABEL[proximo]}</button>` : ''}
        ${os.status === 'orcamento_enviado' ? `<button class="at-btn at-btn--primary" data-action="orcamento" data-id="${os.id}"><i class="fa-solid fa-check"></i> Aprovar/Reprovar Orçamento</button>` : ''}
        ${os.status === 'pronto' ? `<button class="at-btn at-btn--primary" data-action="entregar" data-id="${os.id}"><i class="fa-solid fa-box-open"></i> Registrar Entrega</button>` : ''}
        <button class="at-btn at-btn--secondary" data-action="evento" data-id="${os.id}"><i class="fa-solid fa-comment"></i> Adicionar Observação</button>
        <button class="at-btn at-btn--secondary" data-action="garantia" data-id="${os.id}"><i class="fa-solid fa-shield-halved"></i> Garantia</button>
        <button class="at-btn at-btn--secondary" data-action="editar" data-id="${os.id}"><i class="fa-solid fa-pen"></i> Editar</button>
      </div>

      <!-- Cliente + Equipamento -->
      <div class="at-section">
        <h3><i class="fa-solid fa-user" style="margin-right:6px;opacity:.6"></i>Cliente & Equipamento</h3>
        <div class="at-grid-2">
          ${field('Cliente', os.cliente_nome)}
          ${field('Telefone', os.cliente_telefone)}
          ${field('CPF', os.cliente_cpf)}
          ${field('Email', os.cliente_email)}
          ${field('Tipo de equipamento', os.equipamento_tipo)}
          ${field('Marca', os.equipamento_marca)}
          ${field('Modelo', os.equipamento_modelo)}
          ${field('Cor', os.equipamento_cor)}
          ${field('IMEI 1', os.equipamento_imei1)}
          ${field('IMEI 2', os.equipamento_imei2)}
          ${field('Número de série', os.equipamento_serie)}
          ${field('S.O. / Versão', os.equipamento_so)}
          ${field('Capacidade', os.equipamento_capacidade)}
          ${field('Acessórios entregues', os.acessorios_entregues)}
        </div>
      </div>

      <!-- Diagnóstico -->
      <div class="at-section">
        <h3><i class="fa-solid fa-magnifying-glass" style="margin-right:6px;opacity:.6"></i>Diagnóstico</h3>
        <div class="at-grid-2">
          ${field('Defeito relatado pelo cliente', os.defeito_cliente)}
          ${field('Problema técnico relatado', os.problema_relatado)}
          ${field('Diagnóstico', os.diagnostico)}
          ${field('Causa provável', os.causa_provavel)}
          ${field('Procedimento recomendado', os.procedimento_recomendado)}
          ${field('Técnico responsável', os.tecnico)}
          ${field('Data de entrada', fmtDate(os.data_entrada))}
          ${field('Previsão', fmtDate(os.data_prevista))}
          ${field('Conclusão', fmtDate(os.data_conclusao))}
        </div>
      </div>

      <!-- Peças -->
      <div class="at-section">
        <h3><i class="fa-solid fa-screwdriver-wrench" style="margin-right:6px;opacity:.6"></i>Peças & Serviço</h3>
        <table class="at-table" style="margin-bottom:12px">
          <thead><tr><th>Descrição</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
          <tbody>
            ${itens.length ? itens.map(i => `
              <tr>
                <td>${escapeHtml(i.descricao||i.produto_nome||'—')}</td>
                <td>${i.quantidade}</td>
                <td>${fmtVal(i.valor_unitario)}</td>
                <td>${fmtVal(i.valor_total)}</td>
              </tr>`).join('') : `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted)">Sem peças lançadas</td></tr>`}
          </tbody>
        </table>
        <div style="display:flex;gap:24px;justify-content:flex-end;font-size:14px">
          <span>Mão de obra: <strong>${fmtVal(os.valor_mao_obra)}</strong></span>
          <span>Peças: <strong>${fmtVal(os.valor_pecas)}</strong></span>
          <span>Total: <strong style="color:var(--primary)">${fmtVal(os.valor_total)}</strong></span>
        </div>
      </div>

      <!-- Checklist -->
      ${checklist.length ? `
      <div class="at-section">
        <h3><i class="fa-solid fa-clipboard-check" style="margin-right:6px;opacity:.6"></i>Checklist de Entrada</h3>
        <div class="at-checklist-grid">
          ${checklist.map(item => `
            <div class="at-cl-item ${item.resultado}">
              <i class="fa-solid fa-${item.resultado === 'ok' ? 'check' : item.resultado === 'problema' ? 'xmark' : 'minus'}" style="font-size:13px;opacity:.7"></i>
              <span>${escapeHtml(item.item_label)}</span>
              <span style="margin-left:auto;font-size:11px;font-weight:700;opacity:.7">${checkResult[item.resultado]||item.resultado}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Timeline -->
      <div class="at-section">
        <h3><i class="fa-solid fa-timeline" style="margin-right:6px;opacity:.6"></i>Histórico</h3>
        ${eventos.length ? `<ul class="at-timeline">
          ${eventos.map(ev => `
            <li>
              <div class="at-ev-icon"><i class="fa-solid fa-${evIcon[ev.tipo]||'circle'}"></i></div>
              <div class="at-ev-body">
                <div class="at-ev-desc">${escapeHtml(ev.descricao)}</div>
                <div class="at-ev-meta">${ev.usuario_nome ? escapeHtml(ev.usuario_nome) + ' · ' : ''}${new Date(ev.criado_em).toLocaleString('pt-BR')}</div>
              </div>
            </li>`).join('')}
        </ul>` : `<p style="color:var(--text-muted);font-size:13px">Sem eventos registrados.</p>`}
      </div>
    `;
  },

  // ── Formulário Nova / Editar OS ────────────────────────────────────────────
  async abrirFormularioOS(id = null) {
    let dados = null;
    if (id) {
      try {
        const d = await api.getAtOrdem(id);
        dados = d.ordem;
      } catch { showToast('Erro ao carregar OS.', 'error'); return; }
    }

    const val = (campo, def = '') => dados?.[campo] ?? def;

    const html = `
      <div class="at-modal-overlay" id="atFormModal">
        <div class="at-modal">
          <div class="at-modal-header">
            <h2>${id ? 'Editar OS' : 'Nova Ordem de Serviço'}</h2>
            <button id="atFormClose">×</button>
          </div>
          <div class="at-modal-body">
            <div class="at-form-grid">
              <div class="at-form-full">
                <label class="at-form-label">Cliente (ID ou nome)</label>
                <input class="at-form-input" id="atFCliente" placeholder="ID do cliente" value="${val('cliente_id')}">
              </div>
              <div>
                <label class="at-form-label">Tipo de aparelho</label>
                <select class="at-form-select" id="atFTipo">
                  ${TIPOS_APARELHO.map(t => `<option value="${t}"${val('equipamento_tipo') === t ? ' selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="at-form-label">Marca</label>
                <input class="at-form-input" id="atFMarca" placeholder="Samsung, Apple…" value="${escapeHtml(val('equipamento_marca'))}">
              </div>
              <div>
                <label class="at-form-label">Modelo</label>
                <input class="at-form-input" id="atFModelo" placeholder="Galaxy A54, iPhone 14…" value="${escapeHtml(val('equipamento_modelo'))}">
              </div>
              <div>
                <label class="at-form-label">IMEI 1</label>
                <input class="at-form-input" id="atFImei1" placeholder="000000000000000" value="${escapeHtml(val('equipamento_imei1'))}">
              </div>
              <div>
                <label class="at-form-label">IMEI 2</label>
                <input class="at-form-input" id="atFImei2" value="${escapeHtml(val('equipamento_imei2'))}">
              </div>
              <div>
                <label class="at-form-label">Cor</label>
                <input class="at-form-input" id="atFCor" value="${escapeHtml(val('equipamento_cor'))}">
              </div>
              <div>
                <label class="at-form-label">Número de série</label>
                <input class="at-form-input" id="atFSerie" value="${escapeHtml(val('equipamento_serie'))}">
              </div>
              <div class="at-form-full">
                <label class="at-form-label">Acessórios entregues</label>
                <input class="at-form-input" id="atFAcessorios" placeholder="Carregador, capa, caixa…" value="${escapeHtml(val('acessorios_entregues'))}">
              </div>
              <div class="at-form-full">
                <label class="at-form-label">Defeito relatado pelo cliente</label>
                <textarea class="at-form-textarea" id="atFDefeito">${escapeHtml(val('defeito_cliente'))}</textarea>
              </div>
              <div class="at-form-full">
                <label class="at-form-label">Diagnóstico técnico</label>
                <textarea class="at-form-textarea" id="atFDiag">${escapeHtml(val('diagnostico'))}</textarea>
              </div>
              <div>
                <label class="at-form-label">Técnico responsável</label>
                <input class="at-form-input" id="atFTecnico" value="${escapeHtml(val('tecnico'))}">
              </div>
              <div>
                <label class="at-form-label">Valor mão de obra (R$)</label>
                <input class="at-form-input" id="atFMaoObra" type="number" min="0" step="0.01" value="${val('valor_mao_obra', 0)}">
              </div>
              <div>
                <label class="at-form-label">Previsão de entrega</label>
                <input class="at-form-input" id="atFPrevista" type="date" value="${val('data_prevista','').slice(0,10)}">
              </div>
              <div class="at-form-full">
                <label class="at-form-label">Observações</label>
                <textarea class="at-form-textarea" id="atFObs">${escapeHtml(val('observacoes'))}</textarea>
              </div>

              ${!id ? `
              <div class="at-form-full">
                <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:12px">Checklist de entrada</h3>
                <div class="at-checklist-grid" id="atFChecklist">
                  ${CHECKLIST_PADRAO.map(item => `
                    <div class="at-cl-item" id="atCl_${item.key}">
                      <i class="fa-solid fa-minus" style="font-size:12px;opacity:.5"></i>
                      <span style="flex:1;font-size:12px">${escapeHtml(item.label)}</span>
                      <select class="at-form-select" style="width:80px;padding:2px 4px;font-size:11px" data-cl-key="${item.key}">
                        <option value="nao_testado">N/T</option>
                        <option value="ok">OK</option>
                        <option value="problema">Prob.</option>
                        <option value="nao_aplica">N/A</option>
                      </select>
                    </div>`).join('')}
                </div>
              </div>` : ''}
            </div>
          </div>
          <div class="at-modal-footer">
            <button class="at-btn at-btn--secondary" id="atFormCancelar">Cancelar</button>
            <button class="at-btn at-btn--primary" id="atFormSalvar"><i class="fa-solid fa-floppy-disk"></i> ${id ? 'Salvar alterações' : 'Criar OS'}</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('atFormModal')?.remove();
    document.getElementById('atFormClose').addEventListener('click', close);
    document.getElementById('atFormCancelar').addEventListener('click', close);

    document.getElementById('atFormSalvar').addEventListener('click', async () => {
      const btn = document.getElementById('atFormSalvar');
      btn.disabled = true;
      try {
        const checklist = CHECKLIST_PADRAO.map(item => {
          const sel = document.querySelector(`[data-cl-key="${item.key}"]`);
          return { key: item.key, tipo: item.tipo, label: item.label, resultado: sel?.value || 'nao_testado' };
        });

        const payload = {
          cliente_id:               document.getElementById('atFCliente')?.value || null,
          equipamento_tipo:         document.getElementById('atFTipo')?.value,
          equipamento_marca:        document.getElementById('atFMarca')?.value,
          equipamento_modelo:       document.getElementById('atFModelo')?.value,
          equipamento_imei1:        document.getElementById('atFImei1')?.value,
          equipamento_imei2:        document.getElementById('atFImei2')?.value,
          equipamento_cor:          document.getElementById('atFCor')?.value,
          equipamento_serie:        document.getElementById('atFSerie')?.value,
          acessorios_entregues:     document.getElementById('atFAcessorios')?.value,
          defeito_cliente:          document.getElementById('atFDefeito')?.value,
          diagnostico:              document.getElementById('atFDiag')?.value,
          tecnico:                  document.getElementById('atFTecnico')?.value,
          valor_mao_obra:           document.getElementById('atFMaoObra')?.value,
          data_prevista:            document.getElementById('atFPrevista')?.value,
          observacoes:              document.getElementById('atFObs')?.value,
          checklist,
        };

        if (id) {
          await api.atualizarAtOS(id, payload);
          showToast('OS atualizada com sucesso!', 'success');
          close();
          await this.mostrarDetalhe(id);
        } else {
          const r = await api.criarAtOS(payload);
          showToast(`OS ${r.ordem?.numero || ''} criada com sucesso!`, 'success');
          close();
          await Promise.all([this.loadDashboard(), this.loadOS()]);
        }
      } catch (err) {
        const msg = buildFriendlyError?.(err) || err?.message || 'Erro ao salvar OS';
        showToast(msg, 'error');
        btn.disabled = false;
      }
    });
  },

  // ── Avançar status ─────────────────────────────────────────────────────────
  async avancarStatus(id, novoStatus) {
    try {
      await api.atualizarStatusAtOS(id, novoStatus);
      showToast(`Status atualizado: ${STATUS_LABEL[novoStatus] || novoStatus}`, 'success');
      if (this.state.view === 'detalhe') await this.mostrarDetalhe(id);
      else { await Promise.all([this.loadDashboard(), this.loadOS()]); }
    } catch (err) {
      showToast(buildFriendlyError?.(err) || 'Erro ao atualizar status', 'error');
    }
  },

  // ── Aprovar/reprovar orçamento ─────────────────────────────────────────────
  async abrirOrcamento(id) {
    const html = `
      <div class="at-modal-overlay" id="atOrcModal">
        <div class="at-modal" style="max-width:440px">
          <div class="at-modal-header"><h2>Resposta do Orçamento</h2><button id="atOrcClose">×</button></div>
          <div class="at-modal-body">
            <p style="font-size:14px;color:var(--text-muted);margin-bottom:16px">O cliente aprovou ou reprovou o orçamento?</p>
            <label class="at-form-label">Observação (opcional)</label>
            <textarea class="at-form-textarea" id="atOrcObs" placeholder="Motivo da reprovação, condições especiais…"></textarea>
          </div>
          <div class="at-modal-footer">
            <button class="at-btn at-btn--secondary" id="atOrcClose2">Cancelar</button>
            <button class="at-btn at-btn--secondary" id="atOrcReprovar" style="color:#dc2626;border-color:#dc2626"><i class="fa-solid fa-xmark"></i> Reprovado</button>
            <button class="at-btn at-btn--primary" id="atOrcAprovar"><i class="fa-solid fa-check"></i> Aprovado</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('atOrcModal')?.remove();
    document.getElementById('atOrcClose').addEventListener('click', close);
    document.getElementById('atOrcClose2').addEventListener('click', close);

    const acao = async aprovado => {
      const obs = document.getElementById('atOrcObs')?.value || '';
      try {
        await api.aprovarOrcamentoAt(id, aprovado, obs);
        showToast(aprovado ? 'Orçamento aprovado!' : 'Orçamento reprovado.', aprovado ? 'success' : 'info');
        close();
        await this.mostrarDetalhe(id);
      } catch (err) { showToast(buildFriendlyError?.(err) || 'Erro', 'error'); }
    };
    document.getElementById('atOrcAprovar').addEventListener('click', () => acao(true));
    document.getElementById('atOrcReprovar').addEventListener('click', () => acao(false));
  },

  // ── Registrar entrega ──────────────────────────────────────────────────────
  async abrirEntrega(id) {
    const html = `
      <div class="at-modal-overlay" id="atEntregaModal">
        <div class="at-modal" style="max-width:480px">
          <div class="at-modal-header"><h2>Registrar Entrega</h2><button id="atEntClose">×</button></div>
          <div class="at-modal-body">
            <div class="at-form-grid">
              <div>
                <label class="at-form-label">Forma de pagamento</label>
                <select class="at-form-select" id="atEntPag">
                  <option value="">Selecione…</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="cartao_debito">Cartão de débito</option>
                  <option value="cartao_credito">Cartão de crédito</option>
                  <option value="a_prazo">A prazo</option>
                </select>
              </div>
              <div>
                <label class="at-form-label">Valor recebido (R$)</label>
                <input class="at-form-input" id="atEntValor" type="number" min="0" step="0.01" placeholder="0,00">
              </div>
              <div class="at-form-full">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                  <input type="checkbox" id="atEntCR" style="width:16px;height:16px"> Gerar conta a receber
                </label>
              </div>
              <div id="atEntCRVenc" style="display:none">
                <label class="at-form-label">Vencimento</label>
                <input class="at-form-input" id="atEntVenc" type="date">
              </div>
              <div class="at-form-full">
                <label class="at-form-label">Observações</label>
                <textarea class="at-form-textarea" id="atEntObs" placeholder="Condições, senhas, observações de entrega…"></textarea>
              </div>
            </div>
          </div>
          <div class="at-modal-footer">
            <button class="at-btn at-btn--secondary" id="atEntCancelar">Cancelar</button>
            <button class="at-btn at-btn--primary" id="atEntSalvar"><i class="fa-solid fa-box-open"></i> Confirmar Entrega</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('atEntregaModal')?.remove();
    document.getElementById('atEntClose').addEventListener('click', close);
    document.getElementById('atEntCancelar').addEventListener('click', close);
    document.getElementById('atEntCR').addEventListener('change', e => {
      document.getElementById('atEntCRVenc').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('atEntSalvar').addEventListener('click', async () => {
      const btn = document.getElementById('atEntSalvar');
      btn.disabled = true;
      try {
        await api.entregarAtOS(id, {
          pagamento:           document.getElementById('atEntPag')?.value,
          valor_pago:          document.getElementById('atEntValor')?.value,
          gerar_conta_receber: document.getElementById('atEntCR')?.checked,
          vencimento:          document.getElementById('atEntVenc')?.value,
          observacoes:         document.getElementById('atEntObs')?.value,
        });
        showToast('Entrega registrada com sucesso!', 'success');
        close();
        await Promise.all([this.loadDashboard(), this.mostrarDetalhe(id)]);
      } catch (err) {
        showToast(buildFriendlyError?.(err) || 'Erro ao registrar entrega', 'error');
        btn.disabled = false;
      }
    });
  },

  // ── Garantia ───────────────────────────────────────────────────────────────
  async abrirGarantia(id) {
    const html = `
      <div class="at-modal-overlay" id="atGarModal">
        <div class="at-modal" style="max-width:440px">
          <div class="at-modal-header"><h2>Registrar Garantia</h2><button id="atGarClose">×</button></div>
          <div class="at-modal-body">
            <div class="at-form-grid">
              <div>
                <label class="at-form-label">Dias de garantia</label>
                <input class="at-form-input" id="atGarDias" type="number" min="1" value="90">
              </div>
              <div>
                <label class="at-form-label">Data início</label>
                <input class="at-form-input" id="atGarInicio" type="date" value="${new Date().toISOString().slice(0,10)}">
              </div>
              <div class="at-form-full">
                <label class="at-form-label">Condições / exclusões</label>
                <textarea class="at-form-textarea" id="atGarCondicoes" placeholder="A garantia não cobre danos físicos, líquidos…"></textarea>
              </div>
            </div>
          </div>
          <div class="at-modal-footer">
            <button class="at-btn at-btn--secondary" id="atGarCancelar">Cancelar</button>
            <button class="at-btn at-btn--primary" id="atGarSalvar"><i class="fa-solid fa-shield-halved"></i> Registrar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('atGarModal')?.remove();
    document.getElementById('atGarClose').addEventListener('click', close);
    document.getElementById('atGarCancelar').addEventListener('click', close);

    document.getElementById('atGarSalvar').addEventListener('click', async () => {
      const btn = document.getElementById('atGarSalvar');
      btn.disabled = true;
      try {
        await api.registrarGarantiaAt(id, {
          dias_garantia: document.getElementById('atGarDias')?.value,
          data_inicio:   document.getElementById('atGarInicio')?.value,
          condicoes:     document.getElementById('atGarCondicoes')?.value,
        });
        showToast('Garantia registrada!', 'success');
        close();
        if (this.state.view === 'detalhe') await this.mostrarDetalhe(id);
      } catch (err) {
        showToast(buildFriendlyError?.(err) || 'Erro ao registrar garantia', 'error');
        btn.disabled = false;
      }
    });
  },

  // ── Evento / observação ────────────────────────────────────────────────────
  async abrirEvento(id) {
    const html = `
      <div class="at-modal-overlay" id="atEvModal">
        <div class="at-modal" style="max-width:440px">
          <div class="at-modal-header"><h2>Adicionar Observação</h2><button id="atEvClose">×</button></div>
          <div class="at-modal-body">
            <label class="at-form-label">Observação</label>
            <textarea class="at-form-textarea" id="atEvDesc" style="min-height:100px" placeholder="Registre uma observação, contato com cliente, etc."></textarea>
          </div>
          <div class="at-modal-footer">
            <button class="at-btn at-btn--secondary" id="atEvCancelar">Cancelar</button>
            <button class="at-btn at-btn--primary" id="atEvSalvar"><i class="fa-solid fa-comment"></i> Salvar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('atEvModal')?.remove();
    document.getElementById('atEvClose').addEventListener('click', close);
    document.getElementById('atEvCancelar').addEventListener('click', close);

    document.getElementById('atEvSalvar').addEventListener('click', async () => {
      const btn  = document.getElementById('atEvSalvar');
      const desc = document.getElementById('atEvDesc')?.value?.trim();
      if (!desc) { showToast('Informe a observação.', 'warning'); return; }
      btn.disabled = true;
      try {
        await api.registrarEventoAt(id, desc);
        showToast('Observação registrada!', 'success');
        close();
        if (this.state.view === 'detalhe') await this.mostrarDetalhe(id);
      } catch (err) {
        showToast(buildFriendlyError?.(err) || 'Erro ao registrar evento', 'error');
        btn.disabled = false;
      }
    });
  },

  // ── Excluir OS ─────────────────────────────────────────────────────────────
  async excluirOS(id) {
    try {
      await api.excluirAtOS(id);
      showToast('OS excluída.', 'success');
      this.voltarLista();
      await Promise.all([this.loadDashboard(), this.loadOS()]);
    } catch (err) {
      showToast(buildFriendlyError?.(err) || 'Erro ao excluir OS', 'error');
    }
  },

  // ── Aparelhos ─────────────────────────────────────────────────────────────
  async mostrarAparelhos() {
    this.switchView('aparelhos');
    const container = document.getElementById('atViewAparelhos');
    if (!container) return;

    container.innerHTML = `<div style="padding:16px"><div class="at-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Carregando aparelhos…</p></div></div>`;

    try {
      const data = await api.getAtAparelhos();
      const aparelhos = data.aparelhos || [];

      container.innerHTML = `
        <div style="padding:16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <button class="at-btn at-btn--secondary" data-action="back-lista"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
            <h2 style="font-size:17px;font-weight:700;margin:0">Aparelhos Cadastrados</h2>
            <span style="color:var(--text-muted);font-size:13px">${aparelhos.length} aparelho${aparelhos.length !== 1 ? 's' : ''}</span>
          </div>
          ${aparelhos.length === 0
            ? `<div class="at-empty"><i class="fa-solid fa-mobile-screen-button"></i><strong>Nenhum aparelho cadastrado</strong><p>Os aparelhos são criados automaticamente ao abrir uma OS com IMEI.</p></div>`
            : `<div class="at-table-wrap"><table class="at-table">
                <thead><tr><th>Tipo</th><th>Marca / Modelo</th><th>IMEI 1</th><th>Cliente</th><th>Total OS</th></tr></thead>
                <tbody>
                  ${aparelhos.map(a => `
                    <tr>
                      <td>${escapeHtml(a.tipo||'—')}</td>
                      <td><strong>${escapeHtml(a.marca||'—')}</strong> ${escapeHtml(a.modelo||'')}</td>
                      <td style="font-family:monospace;font-size:12px">${escapeHtml(a.imei1||'—')}</td>
                      <td>${escapeHtml(a.cliente_nome||'—')}</td>
                      <td>${a.total_os||0}</td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>`;
    } catch (err) {
      container.innerHTML = `<div class="at-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>${escapeHtml(buildFriendlyError?.(err) || 'Erro ao carregar aparelhos')}</strong></div>`;
    }
  },

  // ── Garantias ─────────────────────────────────────────────────────────────
  async mostrarGarantias() {
    this.switchView('garantias');
    const container = document.getElementById('atViewGarantias');
    if (!container) return;

    container.innerHTML = `<div style="padding:16px"><div class="at-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Carregando garantias…</p></div></div>`;

    try {
      const data = await api.getAtGarantias();
      const garantias = data.garantias || [];

      const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

      container.innerHTML = `
        <div style="padding:16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <button class="at-btn at-btn--secondary" data-action="back-lista"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
            <h2 style="font-size:17px;font-weight:700;margin:0">Garantias</h2>
          </div>
          ${garantias.length === 0
            ? `<div class="at-empty"><i class="fa-solid fa-shield-halved"></i><strong>Nenhuma garantia registrada</strong></div>`
            : `<div class="at-table-wrap"><table class="at-table">
                <thead><tr><th>OS</th><th>Equipamento</th><th>Cliente</th><th>Dias</th><th>Início</th><th>Fim</th><th>Status</th></tr></thead>
                <tbody>
                  ${garantias.map(g => {
                    const ativa = new Date(g.data_fim) >= new Date();
                    return `<tr>
                      <td class="at-numero">${escapeHtml(g.os_numero||'—')}</td>
                      <td>${escapeHtml([g.equipamento_marca, g.equipamento_modelo].filter(Boolean).join(' ') || '—')}</td>
                      <td>${escapeHtml(g.cliente_nome||'—')}</td>
                      <td>${g.dias_garantia} dias</td>
                      <td>${fmtDate(g.data_inicio)}</td>
                      <td>${fmtDate(g.data_fim)}</td>
                      <td><span class="badge badge--${ativa ? 'ativo' : 'vencido'}">${ativa ? 'Ativa' : 'Vencida'}</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table></div>`}
        </div>`;
    } catch (err) {
      container.innerHTML = `<div class="at-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>${escapeHtml(buildFriendlyError?.(err) || 'Erro ao carregar garantias')}</strong></div>`;
    }
  },

  // ── Navegar entre views ────────────────────────────────────────────────────
  switchView(view) {
    this.state.view = view;
    ['lista','detalhe','aparelhos','garantias'].forEach(v => {
      const el = document.getElementById(`atView${v.charAt(0).toUpperCase() + v.slice(1)}`);
      if (el) el.classList.toggle('active', v === view);
    });
  },

  voltarLista() {
    this.switchView('lista');
  },
};

// Expõe paginação para os botões inline no template
window.AT = AT;

export async function initAssistenciaModule() {
  await AT.init();
}
