import api from './api.js';
import { escapeHtml, buildFriendlyError, debounce } from './utils.js';

const state = {
  logs:    [],
  loading: false,
  filtros: { tipo: '', entidade: '', busca: '', periodo: 'mesAtual' },
  truncado: false,
  ordem: 'criado_em',
  ordemDir: 'desc'
};

const esc = escapeHtml;
function toCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}
function formatDateTime(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return dt.toLocaleString('pt-BR', { timeZone:'America/Fortaleza', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const TIPO_LABEL = {
  baixa:             'Baixa total',
  baixa_parcial:     'Baixa parcial',
  criacao:           'Criação',
  edicao:            'Edição',
  cancelamento:      'Cancelamento',
  estorno:           'Estorno',
  pagamento:         'Pagamento',
  lancamento:        'Lançamento',
  lancamento_manual: 'Lançamento manual',
};
const ENTIDADE_LABEL = {
  contas_receber: 'Contas a Receber',
  contas_pagar:   'Contas a Pagar',
  lancamentos:    'Lançamentos',
  venda:          'Venda',
  compra:         'Compra',
};
const TIPO_COR = {
  baixa:         '#38a169',
  baixa_parcial: '#d69e2e',
  estorno:       '#e53e3e',
  cancelamento:  '#e53e3e',
  criacao:       '#3182ce',
  edicao:        '#805ad5',
  pagamento:     '#38a169',
  lancamento:    '#3182ce',
};

// ─── Helpers / Styles ────────────────────────────────────────────────────────

function _highlight(text, term) {
  if (!term || !text) return esc(text || '');
  const safeRe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${safeRe})`, 'gi');
  return String(text).split(re).map((part, i) =>
    i % 2 === 1 ? `<mark class="aud-hl">${esc(part)}</mark>` : esc(part)
  ).join('');
}

function _sortItems() {
  const col = state.ordem;
  const dir = state.ordemDir === 'asc' ? 1 : -1;
  state.logs.sort((a, b) => {
    let va = a[col], vb = b[col];
    if (col === 'valor')     return (Number(va || 0) - Number(vb || 0)) * dir;
    if (col === 'criado_em') return (new Date(va || 0) - new Date(vb || 0)) * dir;
    return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * dir;
  });
}

function renderErro(msg) {
  const c = document.getElementById('auditoriaFinanceiraContainer');
  if (c) {
    c.innerHTML = `
      <div style="text-align:center;padding:40px 20px">
        <div class="module-feedback module-feedback--error" style="margin-bottom:16px">
          <i class="fa-solid fa-triangle-exclamation"></i> ${esc(msg)}
        </div>
        <button class="btn btn-light" id="audBtnRetry" type="button">
          <i class="fa-solid fa-rotate"></i> Tentar novamente
        </button>
      </div>`;
    document.getElementById('audBtnRetry')?.addEventListener('click', carregarLogs);
  }
}

function injectAuditoriaStyles() {
  if (document.getElementById('audStyles')) return;
  const s = document.createElement('style');
  s.id = 'audStyles';
  s.textContent = `
    .aud-toolbar-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;
    }
    @media (min-width: 800px) {
      .aud-toolbar-grid {
        display: grid;
        grid-template-columns: auto auto auto 1fr auto auto;
      }
    }
    .aud-badge-tipo {
      display: inline-block;
      font-size: .75rem;
      font-weight: 700;
      border-radius: 4px;
      padding: 2px 8px;
      white-space: nowrap;
      line-height: 1.5;
    }
    mark.aud-hl {
      background: #fef08a;
      color: #713f12;
      border-radius: 2px;
      padding: 0 2px;
    }
    .aud-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 40px 20px;
      text-align: center;
    }
    .aud-empty i { font-size: 36px; opacity: .3; margin-bottom: 4px; color: var(--text-muted); }
    .aud-empty strong { font-size: 15px; color: var(--text); }
    .aud-empty p { font-size: 13px; margin: 0; color: var(--text-muted); }
    .sort-icon { font-size: .75rem; opacity: .45; margin-left: 3px; }
    .sort-icon--asc, .sort-icon--desc { opacity: 1; color: var(--primary, #3b82f6); }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) mark.aud-hl { background: #854d0e; color: #fef9c3; }
    }
    :root[data-theme="dark"] mark.aud-hl { background: #854d0e; color: #fef9c3; }
  `;
  document.head.appendChild(s);
}

export async function initAuditoriaFinanceiraModule() {
  injectAuditoriaStyles();
  const container = document.getElementById('auditoriaFinanceiraContainer');
  if (!container) return;

  container.innerHTML = renderSkeleton();
  await carregarLogs();
}

function renderSkeleton() {
  return `<div class="module-skeleton" style="padding:24px">
    ${Array.from({length:8}).map(() => '<div class="skeleton-line" style="height:36px;margin-bottom:8px;border-radius:6px"></div>').join('')}
  </div>`;
}

async function carregarLogs() {
  if (state.loading) return;
  const container = document.getElementById('auditoriaFinanceiraContainer');
  if (!container) return;

  state.loading = true;
  try {
    const params = { periodo: state.filtros.periodo };
    if (state.filtros.tipo)     params.tipo     = state.filtros.tipo;
    if (state.filtros.entidade) params.entidade = state.filtros.entidade;
    if (state.filtros.busca)    params.busca    = state.filtros.busca;

    const data = await api.request('/financeiro/auditoria', { method:'GET', query: params });
    state.logs    = data.logs || [];
    state.truncado = !!data.truncado;
    _sortItems();

    container.innerHTML = renderUI();
    bind();
  } catch (err) {
    renderErro(buildFriendlyError(err));
  } finally {
    state.loading = false;
  }
}

function renderUI() {
  const hasFilter = !!(state.filtros.tipo || state.filtros.entidade || state.filtros.busca);

  const si = col => {
    if (state.ordem !== col) return '<span class="sort-icon">⇅</span>';
    return state.ordemDir === 'asc'
      ? '<span class="sort-icon sort-icon--asc">↑</span>'
      : '<span class="sort-icon sort-icon--desc">↓</span>';
  };

  const truncadoAviso = state.truncado
    ? `<div class="module-feedback module-feedback--warning" style="margin-bottom:12px;font-size:.82rem">
        <i class="fa-solid fa-triangle-exclamation"></i> Exibindo os 500 registros mais recentes. Use os filtros para refinar.
      </div>` : '';

  const tabelaOuEmpty = state.logs.length
    ? `<div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th data-sort-col="criado_em" style="cursor:pointer;user-select:none">Data/Hora ${si('criado_em')}</th>
              <th data-sort-col="tipo" style="cursor:pointer;user-select:none">Tipo ${si('tipo')}</th>
              <th data-sort-col="entidade" style="cursor:pointer;user-select:none">Entidade ${si('entidade')}</th>
              <th data-sort-col="descricao" style="cursor:pointer;user-select:none">Descrição ${si('descricao')}</th>
              <th data-sort-col="valor" style="text-align:right;cursor:pointer;user-select:none">Valor ${si('valor')}</th>
              <th>Operador</th>
            </tr>
          </thead>
          <tbody>${state.logs.map(renderLinha).join('')}</tbody>
        </table>
      </div>`
    : `<div class="aud-empty">
        <i class="fa-solid fa-scroll"></i>
        <strong>${hasFilter ? 'Nenhum registro com os filtros aplicados' : 'Nenhum registro encontrado'}</strong>
        <p>${hasFilter ? 'Tente remover ou ajustar os filtros.' : 'Os registros de auditoria financeira aparecerão aqui.'}</p>
      </div>`;

  return `
    <div class="aud-toolbar-grid">
      <select id="audFiltroTipo" class="input">
        <option value="">Todos os tipos</option>
        ${Object.entries(TIPO_LABEL).map(([k,v]) => `<option value="${k}" ${state.filtros.tipo===k?'selected':''}>${v}</option>`).join('')}
      </select>
      <select id="audFiltroEntidade" class="input">
        <option value="">Todas as entidades</option>
        ${Object.entries(ENTIDADE_LABEL).map(([k,v]) => `<option value="${k}" ${state.filtros.entidade===k?'selected':''}>${v}</option>`).join('')}
      </select>
      <select id="audFiltroPeriodo" class="input">
        <option value="hoje"     ${state.filtros.periodo==='hoje'     ?'selected':''}>Hoje</option>
        <option value="7dias"    ${state.filtros.periodo==='7dias'    ?'selected':''}>Últimos 7 dias</option>
        <option value="mesAtual" ${state.filtros.periodo==='mesAtual' ?'selected':''}>Este mês</option>
        <option value="30dias"   ${state.filtros.periodo==='30dias'   ?'selected':''}>30 dias</option>
        <option value="90dias"   ${state.filtros.periodo==='90dias'   ?'selected':''}>90 dias</option>
        <option value="anoAtual" ${state.filtros.periodo==='anoAtual' ?'selected':''}>Este ano</option>
      </select>
      <input id="audFiltroBusca" type="text" class="input" placeholder="Buscar descrição…" value="${esc(state.filtros.busca)}">
      <button id="audBtnLimpar" class="btn btn-light" title="Limpar filtros" type="button">
        <i class="fa-solid fa-eraser"></i>
      </button>
      <button id="audBtnFiltrar" class="btn btn-primary" type="button">
        <i class="fa-solid fa-magnifying-glass"></i> Filtrar
      </button>
    </div>
    ${truncadoAviso}
    <div class="module-count" style="margin-bottom:10px;font-size:.82rem;color:var(--text-muted)">
      ${state.logs.length} registro(s) encontrado(s)
    </div>
    ${tabelaOuEmpty}`;
}

function renderLinha(log) {
  const cor  = TIPO_COR[log.tipo] || 'var(--text-muted)';
  const tipo = TIPO_LABEL[log.tipo] || log.tipo;
  const ent  = ENTIDADE_LABEL[log.entidade] || log.entidade || '-';
  const val  = Number(log.valor || 0);
  return `<tr>
    <td style="white-space:nowrap;font-size:.82rem">${formatDateTime(log.criado_em)}</td>
    <td><span class="aud-badge-tipo" style="background:${cor}22;color:${cor}">${esc(tipo)}</span></td>
    <td style="font-size:.82rem">${esc(ent)}</td>
    <td style="font-size:.82rem;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(log.descricao)}">${_highlight(log.descricao || '-', state.filtros.busca)}</td>
    <td style="text-align:right;font-size:.82rem;font-variant-numeric:tabular-nums">${val !== 0 ? toCurrency(val) : '-'}</td>
    <td style="font-size:.82rem">${esc(log.usuario_nome || 'Sistema')}</td>
  </tr>`;
}

function bind() {
  document.getElementById('audBtnFiltrar')?.addEventListener('click', aplicarFiltros);
  document.getElementById('audBtnLimpar')?.addEventListener('click', limparFiltros);
  document.getElementById('audFiltroBusca')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aplicarFiltros();
  });

  const debouncedBusca = debounce(async () => {
    state.filtros.busca = document.getElementById('audFiltroBusca')?.value.trim() ?? '';
    await carregarLogs();
    const restored = document.getElementById('audFiltroBusca');
    if (restored) { restored.focus(); restored.setSelectionRange(state.filtros.busca.length, state.filtros.busca.length); }
  }, 250);
  document.getElementById('audFiltroBusca')?.addEventListener('input', debouncedBusca);

  document.querySelectorAll('th[data-sort-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sortCol;
      if (state.ordem === col) {
        state.ordemDir = state.ordemDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.ordem = col;
        state.ordemDir = (col === 'criado_em' || col === 'valor') ? 'desc' : 'asc';
      }
      _sortItems();
      const c = document.getElementById('auditoriaFinanceiraContainer');
      if (c) { c.innerHTML = renderUI(); bind(); }
    });
  });
}

function limparFiltros() {
  state.filtros = { tipo: '', entidade: '', busca: '', periodo: 'mesAtual' };
  carregarLogs();
}

function aplicarFiltros() {
  state.filtros.tipo     = document.getElementById('audFiltroTipo')?.value     || '';
  state.filtros.entidade = document.getElementById('audFiltroEntidade')?.value || '';
  state.filtros.periodo  = document.getElementById('audFiltroPeriodo')?.value  || 'mesAtual';
  state.filtros.busca    = document.getElementById('audFiltroBusca')?.value    || '';
  carregarLogs();
}
