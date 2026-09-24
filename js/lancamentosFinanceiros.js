import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError, calcPeriodoLocal, todayFortaleza, debounce } from './utils.js';

const state = {
  itens:   [],
  editId:  null,
  loading: false,
  saving:  false,
  paying:  false,
  deleting: false,
  filtros: { tipo: '', status: '', busca: '' },
  periodo: { preset: '30dias', dataInicial: '', dataFinal: '' },
  pagina: 1,
  totalPaginas: 1,
  totalRegistros: 0,
  resumoGlobal: null,
  ordem: 'vencimento',
  ordemDir: 'desc'
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const esc = escapeHtml;

function toCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d) {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

function toInputDate(d) {
  if (!d) return '';
  return String(d).slice(0, 10);
}


function getFiltrosGlobais() {
  return {
    empresa_id:   api.getEmpresaId(),
    data_inicial: state.periodo.dataInicial,
    data_final:   state.periodo.dataFinal
  };
}

function setLoading(v) {
  state.loading = v;
  const btn = document.getElementById('lfBtnAtualizar');
  if (btn) {
    btn.disabled = v;
    btn.innerHTML = v
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...'
      : '<i class="fa-solid fa-rotate"></i> Atualizar';
  }
}

function showMsg(msg, type = 'info') {
  const el = document.getElementById('lfFeedback');
  if (el) {
    el.className = `module-feedback${type === 'error' ? ' module-feedback--error' : type === 'success' ? ' module-feedback--success' : ' module-feedback--info'}`;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }
  showToast(msg, type);
}

// ─── Resumo ───────────────────────────────────────────────────────────────────

function calcResumo() {
  if (state.resumoGlobal) return { ...state.resumoGlobal, parcial: false };
  // Fallback: a API não retornou o resumo agregado (data.resumo ausente/falhou).
  // state.itens contém apenas a página atual (limit: 50) — somar aqui NÃO é o total
  // do período, é só uma estimativa da página carregada. Sinalizamos isso como "parcial"
  // para a UI deixar claro ao usuário que o valor pode não refletir o total real.
  let receitas = 0, despesas = 0;
  for (const i of state.itens) {
    if (i.tipo === 'receita') receitas += Number(i.valor || 0);
    else                      despesas += Number(i.valor || 0);
  }
  return { receitas, despesas, saldo: receitas - despesas, parcial: true };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function badgeTipo(tipo) {
  const isReceita = String(tipo).toLowerCase() === 'receita';
  return `<span class="badge ${isReceita ? 'badge--success' : 'badge--danger'}">${isReceita ? 'Receita' : 'Despesa'}</span>`;
}

function badgeStatus(status) {
  const s = String(status || 'pendente').toLowerCase();
  const map = {
    pago:             ['badge--success', 'Pago'],
    parcial:          ['badge--warning', 'Parcial'],
    parcial_atrasado: ['badge--danger',  'Parcial em atraso'],
    atrasado:         ['badge--danger',  'Atrasado'],
    estornado:        ['badge--neutral', 'Estornado'],
  };
  const [cls, label] = map[s] ?? ['badge--warning', 'Pendente'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Sort / Highlight / Styles ───────────────────────────────────────────────

function _highlight(text, term) {
  if (!term || !text) return esc(text || '');
  const safeRe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${safeRe})`, 'gi');
  return String(text).split(re).map((part, i) =>
    i % 2 === 1 ? `<mark class="lf-hl">${esc(part)}</mark>` : esc(part)
  ).join('');
}

function _sortItems() {
  const col = state.ordem;
  const dir = state.ordemDir === 'asc' ? 1 : -1;
  state.itens.sort((a, b) => {
    let va = a[col], vb = b[col];
    if (col === 'valor') {
      return (Number(va || 0) - Number(vb || 0)) * dir;
    }
    if (col === 'vencimento') {
      va = va ? String(va).slice(0, 10) : '';
      vb = vb ? String(vb).slice(0, 10) : '';
      return va.localeCompare(vb) * dir;
    }
    return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * dir;
  });
}

function injectLancamentosStyles() {
  if (document.getElementById('lfStyles')) return;
  const s = document.createElement('style');
  s.id = 'lfStyles';
  s.textContent = `
    .lf-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 20px;
    }
    .lf-stat--receita { border-top: 3px solid var(--success, #22c55e); }
    .lf-stat--despesa { border-top: 3px solid var(--danger, #ef4444); }
    .lf-stat--saldo.lf-stat--positivo { border-top: 3px solid var(--success, #22c55e); }
    .lf-stat--saldo.lf-stat--negativo { border-top: 3px solid var(--danger, #ef4444); }
    .lf-toolbar-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-bottom: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .lf-search-box {
      flex: 1;
      min-width: 200px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-card, var(--surface));
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 14px;
      padding: 0 14px;
      min-height: 44px;
      transition: border-color .15s;
    }
    .lf-search-box:focus-within { border-color: var(--primary); }
    .lf-search-box i { color: var(--text-muted); font-size: .85rem; flex-shrink: 0; }
    .lf-search-box input {
      border: none;
      background: transparent;
      flex: 1;
      font-size: 14px;
      outline: none;
      color: var(--text);
    }
    .lf-filter-box {
      display: flex;
      align-items: center;
    }
    .lf-filter-box select {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--bg-card, var(--surface));
      color: var(--text);
      font-size: 13px;
      padding: 0 12px;
      min-height: 44px;
      min-width: 160px;
      outline: none;
      cursor: pointer;
      transition: border-color .15s;
    }
    .lf-filter-box select:focus { border-color: var(--primary); }
    .lf-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .lf-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px 0 4px;
    }
    .lf-pagination__btn {
      border: 1px solid var(--border, #e5e7eb);
      background: var(--surface, #fff);
      border-radius: 8px;
      padding: 6px 14px;
      cursor: pointer;
      color: var(--text);
      transition: background .15s;
    }
    .lf-pagination__btn:disabled { opacity: .4; cursor: not-allowed; }
    .lf-pagination__btn:not(:disabled):hover { background: var(--bg, #f8f9fa); }
    .lf-pagination__info { font-size: .85rem; color: var(--text-muted); }
    mark.lf-hl {
      background: #fef08a;
      color: #713f12;
      border-radius: 2px;
      padding: 0 2px;
    }
    .sort-icon { font-size: .75rem; opacity: .45; margin-left: 3px; }
    .sort-icon--asc, .sort-icon--desc { opacity: 1; color: var(--primary, #3b82f6); }
    @media (min-width: 700px) {
      .lf-toolbar-grid {
        flex-wrap: nowrap;
      }
    }
    @media (max-width: 699px) {
      .lf-stats-grid { grid-template-columns: 1fr; }
      .lf-search-box { min-width: 100%; }
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) mark.lf-hl { background: #854d0e; color: #fef9c3; }
      :root:not([data-theme="light"]) .lf-search-box {
        background: var(--bg, #1e293b);
        border-color: var(--border, #334155);
      }
    }
    :root[data-theme="dark"] mark.lf-hl { background: #854d0e; color: #fef9c3; }
    :root[data-theme="dark"] .lf-search-box {
      background: var(--bg, #1e293b);
      border-color: var(--border, #334155);
    }
  `;
  document.head.appendChild(s);
}

function _injectLfStyles() {
  if (document.getElementById('lf-nc-styles')) return;
  const s = document.createElement('style');
  s.id = 'lf-nc-styles';
  s.textContent = `
    .lf-nc-card { width: min(96vw, 560px) !important; max-height: 92vh; }
    .lf-nc-body { overflow-y: auto; }
    .lf-nc-section { padding: 16px 20px 0; }
    .lf-nc-section:last-child { padding-bottom: 20px; }
    .lf-nc-section-title { font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8px; }
    .lf-nc-card-group { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
    .lf-nc-cell { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface); transition: background .1s; }
    .lf-nc-cell:last-child { border-bottom: none; }
    .lf-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
    .lf-nc-cells-2col { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border); }
    .lf-nc-cells-2col:last-child { border-bottom: none; }
    .lf-nc-cells-2col .lf-nc-cell { border-bottom: none; }
    .lf-nc-cells-2col .lf-nc-cell:first-child { border-right: 1px solid var(--border); }
    .lf-nc-cell-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; background: var(--surface-2); color: var(--text-muted); }
    .lf-nc-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
    .lf-nc-cell-ico--blue { background: rgba(37,99,235,.1); color: #2563eb; }
    .lf-nc-cell-ico--red { background: rgba(220,38,38,.1); color: #dc2626; }
    .lf-nc-cell-ico--purple { background: rgba(124,58,237,.1); color: #7c3aed; }
    .lf-nc-cell-ico--orange { background: rgba(234,88,12,.1); color: #ea580c; }
    .lf-nc-cell-content { flex: 1; min-width: 0; }
    .lf-nc-lbl { display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
    .lf-nc-req { color: #dc2626; }
    .lf-nc-cell-input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-size: 0.93rem; font-weight: 600; color: var(--text); width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none; }
    select.lf-nc-cell-input { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat !important; background-position: right 0 center !important; padding-right: 16px !important; }
    .lf-nc-obs { width: 100%; resize: none; font-size: 0.9rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; font-family: inherit; color: var(--text); box-sizing: border-box; }
    @media (max-width: 600px) {
      .lf-nc-section { padding: 14px 16px 0; }
      .lf-nc-cells-2col { grid-template-columns: 1fr; }
      .lf-nc-cells-2col .lf-nc-cell:first-child { border-right: none; border-bottom: 1px solid var(--border); }
    }
  `;
  document.head.appendChild(s);
}

// ─── Render ───────────────────────────────────────────────────────────────────

export async function initLancamentosModule() {
  try {
    injectLancamentosStyles();
    if (!state.periodo.dataInicial) {
      const datas = calcPeriodoLocal(state.periodo.preset);
      state.periodo.dataInicial = datas.dataInicial;
      state.periodo.dataFinal = datas.dataFinal;
    }
    renderSkeleton();
    await carregarLancamentos();
    render();
  } catch (error) {
    console.error('Erro ao iniciar lançamentos:', error);
    renderErro(buildFriendlyError(error));
  }
}

async function carregarLancamentos() {
  const data = await api.getLancamentosFinanceiros({
    ...getFiltrosGlobais(),
    ...state.filtros,
    page: state.pagina,
    limit: 50
  });
  if (data?.itens) {
    state.itens = Array.isArray(data.itens) ? data.itens : [];
    state.resumoGlobal = data.resumo || null;
    if (data.paginacao) {
      state.totalPaginas = data.paginacao.total_paginas || 1;
      state.totalRegistros = data.paginacao.total || 0;
    }
  } else {
    state.itens = Array.isArray(data) ? data : [];
  }
  _sortItems();
}

function renderSkeleton() {
  const c = document.getElementById('lancamentosContainer');
  if (!c) return;

  const skRow = () => `
    <div class="skeleton-row">
      <span class="skeleton skeleton-badge" style="width:70px"></span>
      <span class="skeleton skeleton-text" style="flex:3"></span>
      <span class="skeleton skeleton-text" style="flex:2"></span>
      <span class="skeleton skeleton-text" style="flex:1"></span>
      <span class="skeleton skeleton-badge"></span>
      <span class="skeleton skeleton-text" style="flex:1"></span>
    </div>`;

  c.innerHTML = `
    <div class="module-card">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
        ${Array.from({length:3},()=>`
          <div class="mini-stat" style="display:flex;flex-direction:column;gap:8px">
            <span class="skeleton skeleton-text" style="width:50%"></span>
            <span class="skeleton skeleton-value"></span>
          </div>`).join('')}
      </div>
      <div style="padding:4px 0">
        ${Array.from({length:6}, skRow).join('')}
      </div>
    </div>`;
}

function renderErro(msg) {
  const c = document.getElementById('lancamentosContainer');
  if (c) {
    c.innerHTML = `
      <div class="module-card" style="text-align:center;padding:40px 20px">
        <div class="module-feedback module-feedback--error" style="margin-bottom:16px">${esc(msg)}</div>
        <button class="btn btn-light" id="lfBtnRetry" type="button">
          <i class="fa-solid fa-rotate"></i> Tentar novamente
        </button>
      </div>`;
    document.getElementById('lfBtnRetry')?.addEventListener('click', initLancamentosModule);
  }
}

function render() {
  const c = document.getElementById('lancamentosContainer');
  if (!c) return;

  const r = calcResumo();
  const itensFiltrados = filtrarItens();

  c.innerHTML = `
    <div class="module-card">

      <div id="lfFeedback" class="module-feedback hidden"></div>

      <!-- Resumo -->
      ${r.parcial ? `
        <div class="module-feedback module-feedback--error" style="margin-bottom:10px">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Resumo indisponível: não foi possível obter os totais do servidor. Os valores abaixo são uma
          estimativa baseada apenas nos ${state.itens.length} lançamento(s) desta página, não no total do período.
        </div>
      ` : ''}
      <div class="lf-stats-grid">
        <article class="mini-stat lf-stat--receita">
          <span>Receitas${r.parcial ? ' (parcial)' : ''}</span>
          <strong>${toCurrency(r.receitas)}</strong>
          <small>${state.itens.filter(i => i.tipo === 'receita').length} lançamento(s)</small>
        </article>
        <article class="mini-stat lf-stat--despesa">
          <span>Despesas${r.parcial ? ' (parcial)' : ''}</span>
          <strong>${toCurrency(r.despesas)}</strong>
          <small>${state.itens.filter(i => i.tipo === 'despesa').length} lançamento(s)</small>
        </article>
        <article class="mini-stat lf-stat--saldo ${r.saldo >= 0 ? 'lf-stat--positivo' : 'lf-stat--negativo'}">
          <span>Saldo${r.parcial ? ' (parcial)' : ''}</span>
          <strong>${toCurrency(r.saldo)}</strong>
          <small>${r.saldo >= 0 ? 'Superávit' : 'Déficit'}</small>
        </article>
      </div>

      <div class="periodo-local">
        <span class="periodo-local__label">Período:</span>
        <div class="periodo-local__presets">
          ${['hoje','7dias','30dias','mesAtual','mesAnterior'].map(p => {
            const labels = { hoje:'Hoje', '7dias':'7 dias', '30dias':'30 dias', mesAtual:'Este mês', mesAnterior:'Mês ant.' };
            return `<button type="button" class="periodo-local__btn${state.periodo.preset===p?' periodo-local__btn--active':''}" data-lf-period="${p}">${labels[p]}</button>`;
          }).join('')}
          <button type="button" class="periodo-local__btn${state.periodo.preset==='personalizado'?' periodo-local__btn--active':''}" data-lf-period="personalizado">Personalizado</button>
        </div>
        <div id="lfPeriodoCustom" class="periodo-local__custom${state.periodo.preset==='personalizado'?'':' hidden'}">
          <input type="date" id="lfDataIni" class="input" value="${state.periodo.dataInicial}">
          <span>até</span>
          <input type="date" id="lfDataFim" class="input" value="${state.periodo.dataFinal}">
          <button type="button" class="btn btn-primary" id="lfAplicarPeriodo">Aplicar</button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="lf-toolbar-grid">
        <div class="lf-search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="lfBusca" placeholder="Buscar descrição, categoria..." value="${esc(state.filtros.busca)}"/>
        </div>
        <div class="lf-filter-box">
          <select id="lfTipo">
            <option value="">Todos os tipos</option>
            <option value="receita"  ${state.filtros.tipo === 'receita'  ? 'selected' : ''}>Receitas</option>
            <option value="despesa"  ${state.filtros.tipo === 'despesa'  ? 'selected' : ''}>Despesas</option>
          </select>
        </div>
        <div class="lf-filter-box">
          <select id="lfStatus">
            <option value="">Todos os status</option>
            <option value="pendente"         ${state.filtros.status === 'pendente'         ? 'selected' : ''}>Pendentes</option>
            <option value="pago"             ${state.filtros.status === 'pago'             ? 'selected' : ''}>Pagos</option>
            <option value="atrasado"         ${state.filtros.status === 'atrasado'         ? 'selected' : ''}>Atrasados</option>
            <option value="parcial"          ${state.filtros.status === 'parcial'          ? 'selected' : ''}>Parciais</option>
            <option value="parcial_atrasado" ${state.filtros.status === 'parcial_atrasado' ? 'selected' : ''}>Parcial em atraso</option>
          </select>
        </div>
        <div class="lf-actions">
          <button class="btn btn-primary" id="lfBtnFiltrar" type="button">
            <i class="fa-solid fa-filter"></i> Filtrar
          </button>
          <button class="btn btn-light" id="lfBtnLimpar" type="button">
            <i class="fa-solid fa-eraser"></i>
          </button>
          <button class="btn btn-light" id="lfBtnAtualizar" type="button">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
          <button class="btn btn-primary" id="lfBtnNovo" type="button">
            <i class="fa-solid fa-plus"></i> Novo Lançamento
          </button>
        </div>
      </div>

      <!-- Tabela -->
      ${renderTabela(itensFiltrados)}

      ${state.totalPaginas > 1 ? `
      <div class="lf-pagination">
        <button class="lf-pagination__btn" type="button" data-action="lf-pagina" data-page="prev" ${state.pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="lf-pagination__info">Página ${state.pagina} de ${state.totalPaginas} <small>(${state.totalRegistros} registro(s))</small></span>
        <button class="lf-pagination__btn" type="button" data-action="lf-pagina" data-page="next" ${state.pagina >= state.totalPaginas ? 'disabled' : ''} aria-label="Próxima página">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>` : ''}

    </div>

    <!-- Modal -->
    ${renderModal()}
  `;

  bindEventos();
}

function filtrarItens() {
  const { tipo, status, busca } = state.filtros;
  return state.itens.filter(i => {
    if (tipo   && i.tipo   !== tipo)   return false;
    if (status && i.status !== status) return false;
    if (busca) {
      const b = busca.toLowerCase();
      if (
        !String(i.descricao || '').toLowerCase().includes(b) &&
        !String(i.categoria || '').toLowerCase().includes(b)
      ) return false;
    }
    return true;
  });
}

function renderTabela(itens) {
  const hasFilter = !!(state.filtros.tipo || state.filtros.status || state.filtros.busca);
  if (!itens.length) {
    return `<div class="empty-state" style="padding:40px">
      <i class="fa-solid fa-file-invoice-dollar"></i>
      <strong>${hasFilter ? 'Nenhum resultado para os filtros aplicados' : 'Nenhum lançamento encontrado'}</strong>
      <p>${hasFilter ? 'Tente remover ou ajustar os filtros.' : 'Tente ajustar os filtros de período ou tipo.'}</p>
    </div>`;
  }

  const si = col => {
    if (state.ordem !== col) return '<span class="sort-icon">⇅</span>';
    return state.ordemDir === 'asc'
      ? '<span class="sort-icon sort-icon--asc">↑</span>'
      : '<span class="sort-icon sort-icon--desc">↓</span>';
  };

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th data-sort-col="tipo" style="cursor:pointer;user-select:none">Tipo ${si('tipo')}</th>
            <th data-sort-col="descricao" style="cursor:pointer;user-select:none">Descrição ${si('descricao')}</th>
            <th>Categoria</th>
            <th data-sort-col="vencimento" style="cursor:pointer;user-select:none">Vencimento ${si('vencimento')}</th>
            <th>Status</th>
            <th class="text-right" data-sort-col="valor" style="cursor:pointer;user-select:none">Valor ${si('valor')}</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${itens.map(renderLinha).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderLinha(item) {
  const pendente = !['pago', 'estornado'].includes(String(item.status || '').toLowerCase());
  const termo = state.filtros.busca;
  return `
    <tr>
      <td>${badgeTipo(item.tipo)}</td>
      <td>${_highlight(item.descricao, termo)}</td>
      <td><span style="color:var(--text-muted);font-size:.85rem">${_highlight(item.categoria || '-', termo)}</span></td>
      <td>${formatDate(item.vencimento)}</td>
      <td>${badgeStatus(item.status)}</td>
      <td class="text-right"><strong>${toCurrency(item.valor)}</strong></td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${pendente ? `<button class="btn btn-light" style="padding:4px 10px;font-size:12px" data-action="pagar" data-id="${item.id}" title="Marcar como pago">
            <i class="fa-solid fa-check"></i>
          </button>` : ''}
          <button class="btn btn-light" style="padding:4px 10px;font-size:12px" data-action="editar" data-id="${item.id}" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-light" style="padding:4px 10px;font-size:12px;color:var(--danger)" data-action="excluir" data-id="${item.id}" title="Excluir">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

function renderModal() {
  return `
    <div class="modal-overlay hidden" id="lfModal">
      <div class="modal-card lf-nc-card" style="max-width:520px;width:100%">
        <div class="modal-card__header">
          <h3 id="lfModalTitulo">Novo Lançamento</h3>
          <button class="modal-close" id="lfBtnFecharModal" type="button">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="lfForm" autocomplete="off">
          <div class="lf-nc-body">
            <div class="lf-nc-section">
              <p class="lf-nc-section-title">Lançamento</p>
              <div class="lf-nc-card-group">
                <div class="lf-nc-cell">
                  <span class="lf-nc-cell-ico"><i class="fa-solid fa-tag"></i></span>
                  <div class="lf-nc-cell-content">
                    <label class="lf-nc-lbl" for="lfTipoInput">Tipo <span class="lf-nc-req">*</span></label>
                    <select id="lfTipoInput" class="lf-nc-cell-input" required>
                      <option value="receita">Receita</option>
                      <option value="despesa">Despesa</option>
                    </select>
                  </div>
                </div>
                <div class="lf-nc-cell">
                  <span class="lf-nc-cell-ico"><i class="fa-solid fa-file-lines"></i></span>
                  <div class="lf-nc-cell-content">
                    <label class="lf-nc-lbl" for="lfDescricao">Descrição <span class="lf-nc-req">*</span></label>
                    <input id="lfDescricao" class="lf-nc-cell-input" placeholder="Ex: Aluguel, Venda avulsa..." required maxlength="200" />
                  </div>
                </div>
                <div class="lf-nc-cell">
                  <span class="lf-nc-cell-ico"><i class="fa-solid fa-folder"></i></span>
                  <div class="lf-nc-cell-content">
                    <label class="lf-nc-lbl" for="lfCategoria">Categoria <span class="lf-nc-req">*</span></label>
                    <input id="lfCategoria" class="lf-nc-cell-input" placeholder="Ex: Despesa fixa, Receita operacional..." required maxlength="100" />
                  </div>
                </div>
              </div>
            </div>
            <div class="lf-nc-section">
              <p class="lf-nc-section-title">Valor</p>
              <div class="lf-nc-card-group">
                <div class="lf-nc-cells-2col">
                  <div class="lf-nc-cell">
                    <span class="lf-nc-cell-ico lf-nc-cell-ico--green"><i class="fa-solid fa-brazilian-real-sign"></i></span>
                    <div class="lf-nc-cell-content">
                      <label class="lf-nc-lbl" for="lfValor">Valor (R$) <span class="lf-nc-req">*</span></label>
                      <input id="lfValor" class="lf-nc-cell-input lf-nc-valor" type="number" min="0.01" step="0.01" placeholder="0,00" required />
                    </div>
                  </div>
                  <div class="lf-nc-cell">
                    <span class="lf-nc-cell-ico lf-nc-cell-ico--blue"><i class="fa-solid fa-calendar-days"></i></span>
                    <div class="lf-nc-cell-content">
                      <label class="lf-nc-lbl" for="lfVencimento">Vencimento</label>
                      <input id="lfVencimento" class="lf-nc-cell-input" type="date" />
                    </div>
                  </div>
                </div>
                <div class="lf-nc-cell">
                  <span class="lf-nc-cell-ico"><i class="fa-solid fa-credit-card"></i></span>
                  <div class="lf-nc-cell-content">
                    <label class="lf-nc-lbl" for="lfFormaPagamento">Forma de pagamento</label>
                    <select id="lfFormaPagamento" class="lf-nc-cell-input">
                      <option value="">Selecionar...</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="pix">PIX</option>
                      <option value="cartao_debito">Cartão Débito</option>
                      <option value="cartao_credito">Cartão Crédito</option>
                      <option value="transferencia">Transferência</option>
                      <option value="boleto">Boleto</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div class="lf-nc-section">
              <p class="lf-nc-section-title">Observação</p>
              <textarea id="lfObservacao" class="lf-nc-obs" rows="2" placeholder="Observações opcionais..." maxlength="500"></textarea>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid var(--border)">
            <button type="button" class="btn btn-light" id="lfBtnCancelarForm">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="lfBtnSalvar">
              <i class="fa-solid fa-floppy-disk"></i> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function bindEventos() {
  // Abrir modal para novo lançamento
  document.getElementById('lfBtnNovo').onclick = () => abrirModal(null);

  // Fechar modal
  document.getElementById('lfBtnFecharModal').onclick = fecharModal;
  document.getElementById('lfBtnCancelarForm').onclick = fecharModal;
  document.getElementById('lfModal').onclick = (e) => { if (e.target.id === 'lfModal') fecharModal(); };

  // Atualizar
  document.getElementById('lfBtnAtualizar').onclick = async () => {
    if (state.loading) return;
    setLoading(true);
    try {
      await carregarLancamentos();
      render();
    } catch (error) {
      showMsg(buildFriendlyError(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar
  document.getElementById('lfBtnFiltrar').onclick = async () => {
    if (state.loading) return;
    state.filtros.tipo   = document.getElementById('lfTipo').value;
    state.filtros.status = document.getElementById('lfStatus').value;
    state.filtros.busca  = document.getElementById('lfBusca').value.trim();
    state.pagina = 1;
    setLoading(true);
    try { await carregarLancamentos(); render(); } finally { setLoading(false); }
  };

  // Limpar filtros
  document.getElementById('lfBtnLimpar').onclick = async () => {
    if (state.loading) return;
    state.filtros = { tipo: '', status: '', busca: '' };
    state.pagina = 1;
    setLoading(true);
    try { await carregarLancamentos(); render(); } finally { setLoading(false); }
  };

  // Busca com debounce
  const debouncedBusca = debounce(async () => {
    const curval = document.getElementById('lfBusca')?.value ?? '';
    state.filtros.busca = curval.trim();
    state.pagina = 1;
    setLoading(true);
    try { await carregarLancamentos(); render(); } finally { setLoading(false); }
    const restored = document.getElementById('lfBusca');
    if (restored) { restored.focus(); restored.setSelectionRange(curval.length, curval.length); }
  }, 250);
  document.getElementById('lfBusca')?.addEventListener('input', debouncedBusca);

  // Submit do form (criar / editar)
  document.getElementById('lfForm').onsubmit = async (e) => {
    e.preventDefault();
    await salvar();
  };

  // Período local
  document.querySelectorAll('[data-lf-period]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const preset = btn.dataset.lfPeriod;
      state.periodo.preset = preset;
      if (preset !== 'personalizado') {
        const { dataInicial, dataFinal } = calcPeriodoLocal(preset);
        state.periodo.dataInicial = dataInicial;
        state.periodo.dataFinal = dataFinal;
      }
      state.pagina = 1;
      if (state.loading) return;
      setLoading(true);
      try { await carregarLancamentos(); render(); } finally { setLoading(false); }
    });
  });
  document.getElementById('lfAplicarPeriodo')?.addEventListener('click', async () => {
    state.periodo.dataInicial = document.getElementById('lfDataIni')?.value || '';
    state.periodo.dataFinal = document.getElementById('lfDataFim')?.value || '';
    state.pagina = 1;
    if (state.loading) return;
    setLoading(true);
    try { await carregarLancamentos(); render(); } finally { setLoading(false); }
  });

  // Ações da tabela (pagar, editar, excluir)
  const lfContainer = document.getElementById('lancamentosContainer');
  if (!lfContainer) return;
  lfContainer.querySelectorAll('[data-action]').forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'pagar')   pagar(id);
      if (btn.dataset.action === 'editar')  editar(id);
      if (btn.dataset.action === 'excluir') excluir(id);
      if (btn.dataset.action === 'lf-pagina') {
        if (state.loading) return;
        const page = btn.dataset.page;
        if (page === 'prev' && state.pagina > 1) state.pagina--;
        else if (page === 'next' && state.pagina < state.totalPaginas) state.pagina++;
        setLoading(true);
        carregarLancamentos().then(() => render()).catch(err => showMsg(buildFriendlyError(err), 'error')).finally(() => setLoading(false));
      }
    };
  });

  // Ordenação por coluna
  document.querySelectorAll('th[data-sort-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sortCol;
      if (state.ordem === col) {
        state.ordemDir = state.ordemDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.ordem = col;
        state.ordemDir = col === 'valor' ? 'desc' : 'asc';
      }
      _sortItems();
      render();
    });
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function abrirModal(item) {
  _injectLfStyles();
  state.editId = item ? item.id : null;

  document.getElementById('lfModalTitulo').textContent = item ? 'Editar Lançamento' : 'Novo Lançamento';
  document.getElementById('lfTipoInput').value      = item?.tipo           || 'receita';
  document.getElementById('lfDescricao').value      = item?.descricao      || '';
  document.getElementById('lfCategoria').value      = item?.categoria      || '';
  document.getElementById('lfValor').value          = item?.valor          || '';
  document.getElementById('lfVencimento').value     = toInputDate(item?.vencimento);
  document.getElementById('lfFormaPagamento').value = item?.forma_pagamento || '';
  document.getElementById('lfObservacao').value     = item?.observacao      || '';

  document.getElementById('lfModal').classList.remove('hidden');
  document.getElementById('lfDescricao').focus();
}

function fecharModal() {
  document.getElementById('lfModal').classList.add('hidden');
  state.editId = null;
}

// ─── Operações ────────────────────────────────────────────────────────────────

async function salvar() {
  if (state.saving) return;
  state.saving = true;
  const btn = document.getElementById('lfBtnSalvar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

  const valorRaw = Number(document.getElementById('lfValor').value);
  if (!valorRaw || valorRaw <= 0) {
    showMsg('O valor do lançamento deve ser maior que zero.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
    state.saving = false;
    return;
  }

  const payload = {
    empresa_id:      api.getEmpresaId(),
    tipo:            document.getElementById('lfTipoInput').value,
    descricao:       document.getElementById('lfDescricao').value.trim(),
    categoria:       document.getElementById('lfCategoria').value.trim(),
    valor:           valorRaw,
    vencimento:      document.getElementById('lfVencimento').value || null,
    forma_pagamento: document.getElementById('lfFormaPagamento').value,
    observacao:      document.getElementById('lfObservacao').value.trim()
  };

  try {
    if (state.editId) {
      await api.updateLancamentoFinanceiro(state.editId, payload);
      showMsg('Lançamento atualizado com sucesso.', 'success');
    } else {
      await api.createLancamentoFinanceiro(payload);
      showMsg('Lançamento criado com sucesso.', 'success');
    }

    fecharModal();
    await carregarLancamentos();
    render();
  } catch (error) {
    console.error('Erro ao salvar lançamento:', error);
    showMsg(buildFriendlyError(error), 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
  } finally {
    state.saving = false;
  }
}

function editar(id) {
  const item = state.itens.find(i => i.id === id);
  if (item) abrirModal(item);
}

async function pagar(id) {
  if (state.paying) return;
  state.paying = true;
  try {
    const dataPagamento = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 16px;font-size:16px;font-weight:700">Confirmar pagamento</h3>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Data do pagamento</label>
            <input id="_lfPagarDataInput" type="date" value="${hoje}" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box" />
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Forma de pagamento</label>
            <select id="_lfPagarFormaInput" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;background:var(--surface);color:var(--text)">
              <option value="">Selecionar...</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="cartao_debito">Cartão Débito</option>
              <option value="cartao_credito">Cartão Crédito</option>
              <option value="transferencia">Transferência</option>
              <option value="boleto">Boleto</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div style="margin-bottom:20px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Observação</label>
            <textarea id="_lfPagarObsInput" rows="2" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;resize:vertical;background:var(--surface);color:var(--text)" placeholder="Opcional..."></textarea>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="_lfPagarCancelarBtn" class="btn-cancel">Cancelar</button>
            <button id="_lfPagarConfirmarBtn" class="btn-confirm btn-confirm--success">Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#_lfPagarCancelarBtn').onclick = () => { document.body.removeChild(overlay); resolve(null); };
      overlay.querySelector('#_lfPagarConfirmarBtn').onclick = (e) => {
        e.currentTarget.disabled = true;
        const data  = overlay.querySelector('#_lfPagarDataInput').value;
        const forma = overlay.querySelector('#_lfPagarFormaInput').value;
        const obs   = overlay.querySelector('#_lfPagarObsInput').value.trim();
        document.body.removeChild(overlay);
        resolve({ data: data || null, forma, obs });
      };
    });
    if (!dataPagamento) return;
    setLoading(true);
    const pagarPayload = { pagamento_data: dataPagamento.data };
    if (dataPagamento.forma) pagarPayload.forma_pagamento = dataPagamento.forma;
    if (dataPagamento.obs)   pagarPayload.observacao = dataPagamento.obs;
    await api.pagarLancamentoFinanceiro(id, pagarPayload);
    showMsg('Lançamento marcado como pago.', 'success');
    await carregarLancamentos();
    render();
  } catch (error) {
    console.error('Erro ao pagar lançamento:', error);
    showMsg(buildFriendlyError(error), 'error');
  } finally {
    state.paying = false;
    setLoading(false);
  }
}

async function excluir(id) {
  if (state.deleting) return;
  state.deleting = true;
  try {
    const _lan = state.itens.find(i => String(i.id) === String(id));
    const _descLan = _lan?.descricao ? `"${_lan.descricao}"` : 'este lançamento';
    const _valLan = _lan ? ` (${toCurrency(_lan.valor)})` : '';
    const ok = await confirmarAcao(`Excluir ${_descLan}${_valLan}? Esta ação não pode ser desfeita.`, 'Excluir', 'danger');
    if (!ok) return;
    await api.deleteLancamentoFinanceiro(id);
    showMsg('Lançamento excluído.', 'success');
    await carregarLancamentos();
    render();
  } catch (error) {
    console.error('Erro ao excluir lançamento:', error);
    showMsg(buildFriendlyError(error), 'error');
  } finally {
    state.deleting = false;
  }
}
