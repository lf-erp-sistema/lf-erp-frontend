import api from './api.js';
import { showToast } from './feedback.js';
import { todayFortaleza, escapeHtml, buildFriendlyError, calcPeriodoLocal, debounce } from './utils.js';

const state = {
  contas: [],
  resumo: {
    total: 0,
    total_pago: 0,
    total_pendente: 0,
    total_atrasado: 0,
    qtd_pago: 0,
    qtd_pendente: 0,
    qtd_atrasado: 0
  },
  fornecedores: [],
  filtros: {
    status: '',
    fornecedor_id: '',
    busca: ''
  },
  periodo: { preset: '30dias', dataInicial: '', dataFinal: '' },
  pagina: 1,
  totalPaginas: 1,
  totalRegistros: 0,
  loading: false,
  ordem: 'data_vencimento',
  ordemDir: 'desc'
};

function salvarFiltrosCP() {
  try { sessionStorage.setItem('lf_filtros_cp', JSON.stringify(state.filtros)); } catch {}
}
function carregarFiltrosCP() {
  try {
    const s = JSON.parse(sessionStorage.getItem('lf_filtros_cp') || 'null');
    if (s) Object.assign(state.filtros, s);
  } catch {}
}

function showMessage(message, type = 'info') {
  const feedback = document.getElementById('contasPagarFeedback');

  if (feedback) {
    feedback.className = 'module-feedback';

    if (type === 'success') {
      feedback.classList.add('module-feedback--success');
    } else if (type === 'error') {
      feedback.classList.add('module-feedback--error');
    } else {
      feedback.classList.add('module-feedback--info');
    }

    feedback.textContent = message || '';
  }

  showToast(message, type);
}

function setLoading(value) {
  state.loading = value;

  const btnAtualizar = document.getElementById('btnAtualizarContasPagar');
  const btnFiltrar = document.getElementById('btnFiltrarContasPagar');
  const btnLimpar = document.getElementById('btnLimparFiltrosContasPagar');

  if (btnAtualizar) btnAtualizar.disabled = value;
  if (btnFiltrar) btnFiltrar.disabled = value;
  if (btnLimpar) btnLimpar.disabled = value;

  if (btnAtualizar) {
    btnAtualizar.innerHTML = value
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...'
      : '<i class="fa-solid fa-rotate"></i> Atualizar';
  }
}


export async function initContasPagarModule() {
  try {
    state.loading = true;
    carregarFiltrosCP();
    if (!state.periodo.dataInicial) {
      const datas = calcPeriodoLocal(state.periodo.preset);
      state.periodo.dataInicial = datas.dataInicial;
      state.periodo.dataFinal = datas.dataFinal;
    }
    renderSkeleton();

    await Promise.all([carregarFornecedores(), carregarContas()]);

    _sortItems();
    render();
  } catch (error) {
    console.error('Erro ao iniciar contas a pagar:', error);
    const message = buildFriendlyError(error);
    renderErro(message);
    showMessage(message, 'error');
  } finally {
    state.loading = false;
  }
}

async function carregarFornecedores() {
  const response = await api.getContasPagarFornecedores();
  state.fornecedores = Array.isArray(response) ? response : [];
}

async function carregarContas() {
  const filtrosGlobais = getFiltrosGlobais();

  const response = await api.getContasPagar({
    ...filtrosGlobais,
    ...state.filtros,
    page: state.pagina,
    limit: 50
  });

  state.contas = Array.isArray(response?.contas) ? response.contas : [];

  state.resumo = response?.resumo || {
    total: 0,
    total_pago: 0,
    total_pendente: 0,
    total_atrasado: 0,
    qtd_pago: 0,
    qtd_pendente: 0,
    qtd_atrasado: 0
  };

  if (response?.paginacao) {
    state.totalPaginas = response.paginacao.total_paginas || 1;
    state.totalRegistros = response.paginacao.total || 0;
  }
}

function getFiltrosGlobais() {
  return {
    empresa_id:   api.getEmpresaId(),
    data_inicial: state.periodo.dataInicial,
    data_final:   state.periodo.dataFinal,
    busca:        state.filtros.busca || ''
  };
}

function renderSkeleton() {
  const container = document.getElementById('contasPagarContainer');
  if (!container) return;

  const skRow = (cols) => `
    <div class="skeleton-row">
      ${cols.map((w, i) => `<span class="skeleton ${i === cols.length - 1 ? 'skeleton-badge' : 'skeleton-text'}" style="flex:${w}"></span>`).join('')}
    </div>`;

  container.innerHTML = `
    <section class="module-card">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
        ${Array.from({length:3},()=>`
          <div class="mini-stat" style="display:flex;flex-direction:column;gap:8px">
            <span class="skeleton skeleton-text" style="width:50%"></span>
            <span class="skeleton skeleton-value"></span>
          </div>`).join('')}
      </div>
      <div style="padding:4px 0">
        ${[
          [3,1,1,1],
          [3,1,1,1],
          [3,1,1,1],
          [3,1,1,1],
          [3,1,1,1],
          [3,1,1,1]
        ].map(skRow).join('')}
      </div>
    </section>`;
}

function calcAlertasVencCP() {
  const today = todayFortaleza();
  const d7 = new Date(`${today}T00:00:00`); d7.setDate(d7.getDate() + 7);
  const in7 = d7.toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
  let atrasadas = 0, valAtrasadas = 0, hoje = 0, valHoje = 0, prox7 = 0, valProx7 = 0;
  state.contas.forEach(c => {
    const st = normalizarStatus(c.status);
    if (st === 'pago') return;
    const venc = (c.data_vencimento || '').split('T')[0];
    if (!venc) return;
    const val = parseFloat(c.valor || 0);
    if (st === 'atrasado' || st === 'parcial_atrasado' || venc < today) {
      atrasadas++; valAtrasadas += val;
    } else if (venc === today) {
      hoje++; valHoje += val;
    } else if (venc > today && venc <= in7) {
      prox7++; valProx7 += val;
    }
  });
  return { atrasadas, valAtrasadas, hoje, valHoje, prox7, valProx7 };
}

function renderAlertasVencCP() {
  const { atrasadas, valAtrasadas, hoje, valHoje, prox7, valProx7 } = calcAlertasVencCP();
  if (!atrasadas && !hoje && !prox7) return '';
  const fmtC = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const chip = (label, qtd, val, cls) =>
    qtd ? `<div class="cp-alerta-chip cp-alerta-chip--${cls}"><span class="cp-alerta-chip__num">${qtd}</span><span class="cp-alerta-chip__label">${label}</span><span class="cp-alerta-chip__val">${fmtC(val)}</span></div>` : '';
  return `
    <div class="cp-alertas-venc">
      ${chip('Em atraso', atrasadas, valAtrasadas, 'danger')}
      ${chip('Vencem hoje', hoje, valHoje, 'warning')}
      ${chip('Próx. 7 dias', prox7, valProx7, 'info')}
    </div>`;
}

function _sortItems() {
  const { ordem, ordemDir } = state;
  state.contas.sort((a, b) => {
    let va = a[ordem] ?? '';
    let vb = b[ordem] ?? '';
    if (ordem === 'valor') {
      va = parseFloat(va) || 0;
      vb = parseFloat(vb) || 0;
      return ordemDir === 'asc' ? va - vb : vb - va;
    }
    if (ordem === 'data_vencimento' || ordem === 'data_pagamento') {
      va = String(va).slice(0, 10);
      vb = String(vb).slice(0, 10);
    }
    const cmp = String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
    return ordemDir === 'asc' ? cmp : -cmp;
  });
}

function _highlight(text, term) {
  if (!term) return escapeHtml(text || '');
  const escaped = escapeHtml(text || '');
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${safe})`, 'gi'), '<mark class="cp-hl">$1</mark>');
}

function getDiasAtrasoCP(status, dataVencimento) {
  if (status !== 'atrasado' && status !== 'parcial_atrasado') return '';
  if (!dataVencimento) return '';
  const hoje = new Date(`${todayFortaleza()}T12:00:00`);
  const venc = new Date(`${String(dataVencimento).slice(0, 10)}T12:00:00`);
  if (isNaN(venc.getTime())) return '';
  const dias = Math.round((hoje.getTime() - venc.getTime()) / 86400000);
  if (dias <= 0) return '';
  return `<small class="cp-dias-atraso">${dias} dia(s)</small>`;
}

function render() {
  const container = document.getElementById('contasPagarContainer');
  if (!container) return;

  const si = col => state.ordem === col
    ? (state.ordemDir === 'asc' ? ' <span class="sort-icon sort-icon--asc">↑</span>' : ' <span class="sort-icon sort-icon--desc">↓</span>')
    : ' <span class="sort-icon sort-icon--idle">⇅</span>';

  container.innerHTML = `
    <section class="module-card cp-module-card">
      <div id="contasPagarFeedback" class="module-feedback"></div>

      <div class="cp-explain-card">
        <div>
          <strong>Importante</strong>
          <span>Esta tela mostra títulos a pagar. Valores pagos só saem do Fluxo de Caixa após baixa/pagamento.</span>
        </div>
      </div>

      ${renderAlertasVencCP()}

      <div class="periodo-local">
        <span class="periodo-local__label">Período:</span>
        <div class="periodo-local__presets">
          ${['hoje','7dias','30dias','mesAtual','mesAnterior'].map(p => {
            const labels = { hoje:'Hoje', '7dias':'7 dias', '30dias':'30 dias', mesAtual:'Este mês', mesAnterior:'Mês ant.' };
            return `<button type="button" class="periodo-local__btn${state.periodo.preset===p?' periodo-local__btn--active':''}" data-cp-period="${p}">${labels[p]}</button>`;
          }).join('')}
          <button type="button" class="periodo-local__btn${state.periodo.preset==='personalizado'?' periodo-local__btn--active':''}" data-cp-period="personalizado">Personalizado</button>
        </div>
        <div id="cpPeriodoCustom" class="periodo-local__custom${state.periodo.preset==='personalizado'?'':' hidden'}">
          <input type="date" id="cpDataIni" class="input" value="${state.periodo.dataInicial}">
          <span>até</span>
          <input type="date" id="cpDataFim" class="input" value="${state.periodo.dataFinal}">
          <button type="button" class="btn btn-primary" id="cpAplicarPeriodo">Aplicar</button>
        </div>
      </div>

      <div class="cp-toolbar-grid">
        <div class="module-toolbar__search cp-search-box">
          <i class="fa-solid fa-search"></i>
          <input
            type="text"
            id="cpBusca"
            placeholder="Buscar fornecedor, descrição, observação ou nº da compra..."
            value="${escapeHtml(state.filtros.busca || '')}"
          />
        </div>

        <div class="cp-filter-box">
          <select id="cpStatus" class="input">
            <option value="">Todos os status</option>
            <option value="pendente" ${state.filtros.status === 'pendente' ? 'selected' : ''}>Pendentes</option>
            <option value="atrasado" ${state.filtros.status === 'atrasado' ? 'selected' : ''}>Atrasadas</option>
            <option value="pago" ${state.filtros.status === 'pago' ? 'selected' : ''}>Pagas</option>
            <option value="parcial" ${state.filtros.status === 'parcial' ? 'selected' : ''}>Parciais</option>
            <option value="parcial_atrasado" ${state.filtros.status === 'parcial_atrasado' ? 'selected' : ''}>Parcial em atraso</option>
          </select>
        </div>

        <div class="cp-filter-box cp-filter-box--fornecedor">
          <select id="cpFornecedor" class="input">
            <option value="">Todos os fornecedores</option>
            ${state.fornecedores
              .map(
                (fornecedor) => `
              <option value="${fornecedor.id}" ${String(state.filtros.fornecedor_id) === String(fornecedor.id) ? 'selected' : ''}>
                ${escapeHtml(fornecedor.nome)}
              </option>
            `
              )
              .join('')}
          </select>
        </div>

        <div class="cp-action-box">
          <button class="btn btn-primary" id="btnNovaContaPagar" type="button">
            <i class="fa-solid fa-plus"></i>
            Nova Conta
          </button>

          <button class="btn btn-secondary" id="btnFiltrarContasPagar" type="button">
            <i class="fa-solid fa-filter"></i>
            Filtrar
          </button>

          <button class="btn btn-light" id="btnLimparFiltrosContasPagar" type="button">
            <i class="fa-solid fa-eraser"></i>
            Limpar
          </button>

          <button class="btn btn-light" id="btnAtualizarContasPagar" type="button">
            <i class="fa-solid fa-rotate"></i>
            Atualizar
          </button>
        </div>
      </div>

      <div class="cp-stats-grid">
        <article class="mini-stat cp-stat-card cp-stat-card--total">
          <span>Total de títulos</span>
          <strong>${formatCurrency(state.resumo.total)}</strong>
          <small>${state.totalRegistros || state.contas.length} registro(s)</small>
        </article>

        <article class="mini-stat cp-stat-card cp-stat-card--pendente">
          <span>Pendentes</span>
          <strong>${formatCurrency(state.resumo.total_pendente)}</strong>
          <small>${Number(state.resumo.qtd_pendente || 0)} título(s)</small>
        </article>

        <article class="mini-stat cp-stat-card cp-stat-card--atrasado">
          <span>Atrasadas</span>
          <strong>${formatCurrency(state.resumo.total_atrasado)}</strong>
          <small>${Number(state.resumo.qtd_atrasado || 0)} título(s)</small>
        </article>

        <article class="mini-stat cp-stat-card cp-stat-card--pago">
          <span>Pagas</span>
          <strong>${formatCurrency(state.resumo.total_pago)}</strong>
          <small>${Number(state.resumo.qtd_pago || 0)} título(s)</small>
        </article>

        <article class="mini-stat cp-stat-card cp-stat-card--parcial">
          <span>Parcial</span>
          <strong>${formatCurrency(state.contas.filter(c => ['parcial','parcial_atrasado'].includes(normalizarStatus(c.status))).reduce((s, c) => s + parseFloat(c.valor || 0), 0))}</strong>
          <small>${state.contas.filter(c => ['parcial','parcial_atrasado'].includes(normalizarStatus(c.status))).length || 0} título(s)</small>
        </article>
      </div>

      <div class="table-wrapper">
        <table class="data-table cp-table">
          <thead>
            <tr>
              <th data-sort-col="id" style="cursor:pointer;user-select:none">Título${si('id')}</th>
              <th data-sort-col="fornecedor_nome" style="cursor:pointer;user-select:none">Fornecedor${si('fornecedor_nome')}</th>
              <th>Origem</th>
              <th data-sort-col="data_vencimento" style="cursor:pointer;user-select:none">Vencimento${si('data_vencimento')}</th>
              <th data-sort-col="status" style="cursor:pointer;user-select:none">Status${si('status')}</th>
              <th class="text-right" data-sort-col="valor" style="cursor:pointer;user-select:none">Valor${si('valor')}</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            ${renderLinhas()}
          </tbody>
        </table>
      </div>

      ${state.totalPaginas > 1 ? `
      <div class="lf-pagination">
        <button class="lf-pagination__btn" type="button" data-action="cp-pagina" data-page="prev" ${state.pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="lf-pagination__info">Página ${state.pagina} de ${state.totalPaginas} <small>(${state.totalRegistros} registro(s))</small></span>
        <button class="lf-pagination__btn" type="button" data-action="cp-pagina" data-page="next" ${state.pagina >= state.totalPaginas ? 'disabled' : ''} aria-label="Próxima página">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>` : ''}
    </section>
  `;

  bindEventos();
  injectContasPagarStyles();
}

function renderLinhas() {
  if (!state.contas.length) {
    const hasFilter = state.filtros.status || state.filtros.fornecedor_id || state.filtros.busca;
    const emptyMsg = hasFilter
      ? 'Nenhuma conta encontrada para o filtro aplicado.'
      : 'Use os filtros acima ou gere contas a pagar por compras parceladas.';
    return `
      <tr>
        <td colspan="7">
          <div class="empty-table-state">
            <i class="fa-solid fa-file-invoice" style="font-size:2rem;opacity:.22;margin-bottom:4px"></i>
            <strong>Nenhuma conta encontrada</strong>
            <span>${emptyMsg}</span>
          </div>
        </td>
      </tr>
    `;
  }

  const termo = state.filtros.busca || '';
  return state.contas
    .map((conta) => {
      const status = normalizarStatus(conta.status);
      const statusLabel = getStatusLabel(status);
      const diasAtrasoHtml = getDiasAtrasoCP(status, conta.data_vencimento);

      return `
      <tr>
        <td>
          <div class="table-primary">
            <strong>#${escapeHtml(conta.id)}</strong>
            <small>Parcela ${Number(conta.parcela || 1)}/${Number(conta.total_parcelas || 1)}</small>
          </div>
        </td>

        <td>
          <div class="table-primary">
            <strong>${_highlight(conta.fornecedor_nome || 'Fornecedor não informado', termo)}</strong>
            <small>Fornecedor</small>
          </div>
        </td>

        <td>
          <div class="table-primary">
            <strong>${conta.compra_id ? `Compra #${escapeHtml(conta.compra_id)}` : 'Manual'}</strong>
            <small>${escapeHtml(conta.descricao || conta.forma_pagamento || 'Conta a pagar')}</small>
          </div>
        </td>

        <td>
          <div class="table-primary">
            <strong>${formatDate(conta.data_vencimento)}</strong>
            <small>${status === 'pago' ? `Pago em ${formatDate(conta.data_pagamento)}` : getVencimentoInfo(conta.data_vencimento)}</small>
          </div>
        </td>

        <td>
          <span class="${getStatusBadgeClass(status)}">
            ${statusLabel}
          </span>
          ${diasAtrasoHtml}
        </td>

        <td class="text-right">
          <strong>${formatCurrency(conta.valor)}</strong>
        </td>

        <td class="text-right">
          <div class="table-actions">
            <button class="btn-inline" type="button" data-action="detalhe-cp" data-id="${conta.id}">
              <i class="fa-solid fa-eye"></i>
              Detalhes
            </button>

            ${
              conta.compra_id
                ? `
                  <button class="btn-inline" type="button" data-action="origem-compra-cp" data-id="${conta.id}">
                    <i class="fa-solid fa-receipt"></i>
                    Compra
                  </button>
                `
                : ''
            }

            ${
              status !== 'pago'
                ? `
                  <button class="btn-inline btn-inline--success" type="button" data-action="pagar-cp" data-id="${conta.id}">
                    <i class="fa-solid fa-check"></i>
                    Pagar
                  </button>
                `
                : ''
            }
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
}

function bindEventos() {
  const btnAtualizar = document.getElementById('btnAtualizarContasPagar');
  const btnFiltrar = document.getElementById('btnFiltrarContasPagar');
  const btnLimpar = document.getElementById('btnLimparFiltrosContasPagar');
  const busca = document.getElementById('cpBusca');
  const status = document.getElementById('cpStatus');
  const fornecedor = document.getElementById('cpFornecedor');

  document.getElementById('btnNovaContaPagar')?.addEventListener('click', () => {
    abrirModalNovaContaPagar();
  });

  btnAtualizar?.addEventListener('click', async () => {
    await recarregar();
  });

  btnFiltrar?.addEventListener('click', async () => {
    state.filtros.busca = busca?.value?.trim() || '';
    state.filtros.status = status?.value || '';
    state.filtros.fornecedor_id = fornecedor?.value || '';
    state.pagina = 1;
    salvarFiltrosCP();
    await recarregar();
  });

  btnLimpar?.addEventListener('click', async () => {
    state.filtros = { status: '', fornecedor_id: '', busca: '' };
    state.pagina = 1;
    salvarFiltrosCP();
    await recarregar();
  });

  busca?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      state.filtros.busca = busca.value.trim();
      state.filtros.status = status?.value || '';
      state.filtros.fornecedor_id = fornecedor?.value || '';
      state.pagina = 1;
      salvarFiltrosCP();
      await recarregar();
    }
  });

  const debouncedBusca = debounce(async () => {
    const inp = document.getElementById('cpBusca');
    const curval = inp?.value || '';
    state.filtros.busca = curval.trim();
    state.filtros.status = document.getElementById('cpStatus')?.value || '';
    state.filtros.fornecedor_id = document.getElementById('cpFornecedor')?.value || '';
    state.pagina = 1;
    salvarFiltrosCP();
    await recarregar();
    const restored = document.getElementById('cpBusca');
    if (restored) { restored.focus(); restored.setSelectionRange(curval.length, curval.length); }
  }, 250);
  busca?.addEventListener('input', debouncedBusca);

  document.querySelectorAll('th[data-sort-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sortCol;
      if (state.ordem === col) {
        state.ordemDir = state.ordemDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.ordem = col;
        state.ordemDir = 'asc';
      }
      _sortItems();
      render();
    });
  });

  document.querySelectorAll('[data-cp-period]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const preset = btn.dataset.cpPeriod;
      state.periodo.preset = preset;
      if (preset !== 'personalizado') {
        const { dataInicial, dataFinal } = calcPeriodoLocal(preset);
        state.periodo.dataInicial = dataInicial;
        state.periodo.dataFinal = dataFinal;
      }
      state.pagina = 1;
      await recarregar();
    });
  });

  document.getElementById('cpAplicarPeriodo')?.addEventListener('click', async () => {
    state.periodo.dataInicial = document.getElementById('cpDataIni')?.value || '';
    state.periodo.dataFinal = document.getElementById('cpDataFim')?.value || '';
    state.pagina = 1;
    await recarregar();
  });

  document.querySelectorAll("[data-action='cp-pagina']").forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (state.loading) return;
      const page = btn.dataset.page;
      if (page === 'prev' && state.pagina > 1) state.pagina--;
      else if (page === 'next' && state.pagina < state.totalPaginas) state.pagina++;
      await recarregar();
    });
  });

  document.querySelectorAll("[data-action='pagar-cp']").forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled || state.loading) return;
      button.disabled = true;
      try { await pagarConta(button.dataset.id); }
      finally { button.disabled = false; }
    });
  });

  document.querySelectorAll("[data-action='detalhe-cp']").forEach((button) => {
    button.addEventListener('click', async () => {
      await abrirDetalheConta(button.dataset.id);
    });
  });

  document.querySelectorAll("[data-action='origem-compra-cp']").forEach((button) => {
    button.addEventListener('click', async () => {
      await abrirOrigemCompra(button.dataset.id);
    });
  });
}

async function recarregar() {
  if (state.loading) return;
  setLoading(true);
  showMessage('Atualizando contas a pagar...', 'info');

  try {
    renderSkeleton();

    await Promise.all([carregarFornecedores(), carregarContas()]);

    _sortItems();
    render();
  } catch (error) {
    console.error('Erro ao recarregar contas a pagar:', error);
    const message = buildFriendlyError(error);
    renderErro(message);
    showMessage(message, 'error');
  } finally {
    setLoading(false);
  }
}

async function pagarConta(id) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';

    const hoje = todayFortaleza();
    const contaRef = state.contas.find(c => String(c.id) === String(id));
    const valorMax = contaRef ? Number(contaRef.valor_atualizado || contaRef.valor || 0) : 0;
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 16px;font-size:16px;font-weight:700">Confirmar pagamento</h3>
        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Valor pago (R$)</label>
          <input id="_pagarValorInput" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Deixe em branco para pagar total" ${valorMax > 0 ? `max="${valorMax}"` : ''} style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box" />
        </div>
        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Data do pagamento</label>
          <input id="_pagarDataInput" type="date" value="${hoje}" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box" />
        </div>
        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;display:block;margin-bottom:5px">Forma de pagamento</label>
          <select id="_pagarFormaInput" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;background:var(--surface);color:var(--text)">
            <option value="">Não informado</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="cartao_credito">Cartão de Crédito</option>
            <option value="cartao_debito">Cartão de Débito</option>
            <option value="boleto">Boleto</option>
            <option value="transferencia">Transferência</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_pagarCancelarBtn" class="btn-cancel">Cancelar</button>
          <button id="_pagarConfirmarBtn" class="btn-confirm btn-confirm--success">Confirmar pagamento</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#_pagarCancelarBtn').onclick = () => { document.body.removeChild(overlay); resolve(null); };
    overlay.querySelector('#_pagarConfirmarBtn').onclick = async () => {
      const btn = overlay.querySelector('#_pagarConfirmarBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...';
      const data = overlay.querySelector('#_pagarDataInput').value;
      if (!data) {
        btn.disabled = false;
        btn.innerHTML = 'Confirmar pagamento';
        showMessage('Informe a data do pagamento.', 'error');
        return;
      }
      const valorStr = overlay.querySelector('#_pagarValorInput').value;
      const valor_pago = valorStr ? Number(valorStr) : undefined;
      const forma_pagamento = overlay.querySelector('#_pagarFormaInput')?.value || undefined;
      if (valor_pago !== undefined && (!Number.isFinite(valor_pago) || valor_pago <= 0)) {
        btn.disabled = false;
        btn.innerHTML = 'Confirmar pagamento';
        showMessage('Valor pago deve ser maior que zero.', 'error');
        return;
      }
      if (valor_pago !== undefined && valorMax > 0 && valor_pago > valorMax) {
        btn.disabled = false;
        btn.innerHTML = 'Confirmar pagamento';
        showMessage(`Valor pago não pode ser maior que o saldo da conta (R$ ${valorMax.toFixed(2).replace('.', ',')}).`, 'error');
        return;
      }
      try {
        await api.pagarContaPagar(id, { data_pagamento: data, valor_pago, ...(forma_pagamento ? { forma_pagamento } : {}) });
        document.body.removeChild(overlay);
        showMessage('Pagamento registrado com sucesso.', 'success');
        await recarregar();
        resolve();
      } catch (error) {
        console.error('Erro ao pagar conta:', error);
        btn.disabled = false;
        btn.innerHTML = 'Confirmar pagamento';
        showMessage(buildFriendlyError(error), 'error');
      }
    };
  });
}

async function abrirDetalheConta(id) {
  try {
    const conta = await api.getContaPagarDetalhe(id);
    renderDetalheConta(conta);
  } catch (error) {
    console.error('Erro ao abrir detalhe da conta:', error);
    const message = buildFriendlyError(error);
    showMessage(message, 'error');
  }
}

function renderDetalheConta(conta) {
  const modalExistente = document.getElementById('cpDetalheModal');
  if (modalExistente) modalExistente.remove();

  const status = normalizarStatus(conta.status);

  const modal = document.createElement('div');
  modal.id = 'cpDetalheModal';
  modal.className = 'modal-overlay cp-detail-overlay';

  modal.innerHTML = `
    <div class="modal-card cp-detail-card">
      <div class="cp-detail-header">
        <div>
          <span class="cp-detail-eyebrow">Conta #${escapeHtml(conta.id || '-')}</span>
          <h3>Detalhe da conta a pagar</h3>
          <p>${escapeHtml(conta.fornecedor_nome || 'Fornecedor não informado')}</p>
        </div>

        <button class="icon-button" type="button" id="fecharCpDetalhe" aria-label="Fechar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="cp-detail-body">
        <section class="cp-detail-summary">
          <article class="cp-detail-summary__main">
            <span>Valor do título</span>
            <strong>${formatCurrency(conta.valor)}</strong>
            <small>${getStatusLabel(status)}</small>
          </article>

          <article>
            <span>Vencimento</span>
            <strong>${formatDate(conta.data_vencimento)}</strong>
          </article>

          <article>
            <span>Pagamento</span>
            <strong>${formatDate(conta.data_pagamento)}</strong>
          </article>

          <article>
            <span>Parcela</span>
            <strong>${Number(conta.parcela || 1)}/${Number(conta.total_parcelas || 1)}</strong>
          </article>
        </section>

        <section class="cp-detail-section">
          <div class="cp-detail-section__header">
            <div>
              <h4>Informações financeiras</h4>
              <p>Regra: só sai no Fluxo de Caixa após baixa como pago.</p>
            </div>
            <span class="${getStatusBadgeClass(status)}">${getStatusLabel(status)}</span>
          </div>

          <div class="cp-detail-grid">
            <div>
              <span>Origem</span>
              <strong>${conta.compra_id ? `Compra #${escapeHtml(conta.compra_id)}` : 'Manual'}</strong>
            </div>

            <div>
              <span>Descrição</span>
              <strong>${escapeHtml(conta.descricao || '-')}</strong>
            </div>

            <div>
              <span>Status financeiro</span>
              <strong>${getStatusLabel(status)}</strong>
            </div>

            <div>
              <span>Valor</span>
              <strong>${formatCurrency(conta.valor)}</strong>
            </div>
          </div>
        </section>

        <section class="cp-detail-note">
          <span>Observação</span>
          <p>${escapeHtml(conta.observacao || 'Nenhuma observação registrada.')}</p>
        </section>
      </div>

      <div class="cp-detail-footer">
        ${
          status !== 'pago'
            ? `
              <button class="btn btn-primary" type="button" id="pagarCpDetalhe" data-id="${conta.id}">
                <i class="fa-solid fa-check"></i>
                Marcar como pago
              </button>
            `
            : ''
        }

        <button class="btn btn-light" type="button" id="fecharCpDetalheFooter">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('fecharCpDetalhe')?.addEventListener('click', () => modal.remove());
  document.getElementById('fecharCpDetalheFooter')?.addEventListener('click', () => modal.remove());

  document.getElementById('pagarCpDetalhe')?.addEventListener('click', async (event) => {
    const contaId = event.currentTarget.dataset.id;
    modal.remove();
    await pagarConta(contaId);
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

async function abrirOrigemCompra(id) {
  try {
    const origem = await api.getOrigemCompraContaPagar(id);
    renderOrigemCompra(origem);
  } catch (error) {
    console.error('Erro ao abrir origem da compra:', error);
    const message = buildFriendlyError(error);
    showMessage(message, 'error');
  }
}

function renderOrigemCompra(data) {
  const modalExistente = document.getElementById('cpOrigemCompraModal');
  if (modalExistente) modalExistente.remove();

  const compra = data?.compra || {};
  const conta = data?.conta || {};
  const itens = Array.isArray(data?.itens) ? data.itens : [];
  const parcelas = Array.isArray(data?.parcelas) ? data.parcelas : [];

  const modal = document.createElement('div');
  modal.id = 'cpOrigemCompraModal';
  modal.className = 'modal-overlay cp-origin-overlay';

  modal.innerHTML = `
    <div class="modal-card cp-origin-card">
      <div class="cp-detail-header">
        <div>
          <span class="cp-detail-eyebrow">Compra #${escapeHtml(compra.id || '-')}</span>
          <h3>Origem da conta a pagar</h3>
          <p>${escapeHtml(compra.fornecedor_nome_origem || conta.fornecedor_nome || 'Fornecedor não informado')}</p>
        </div>

        <button class="icon-button" type="button" id="fecharCpOrigem" aria-label="Fechar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="cp-detail-body">
        <section class="cp-detail-summary">
          <article class="cp-detail-summary__main">
            <span>Total da compra</span>
            <strong>${formatCurrency(compra.total)}</strong>
            <small>${formatDate(compra.data)}</small>
          </article>

          <article>
            <span>Pagamento</span>
            <strong>${escapeHtml(compra.pagamento || compra.forma_pagamento || '-')}</strong>
          </article>

          <article>
            <span>Parcelas</span>
            <strong>${Number(compra.parcelas || 1)}x</strong>
          </article>

          <article>
            <span>Status</span>
            <strong>${escapeHtml(capitalize(compra.status || 'finalizada'))}</strong>
          </article>
        </section>

        <section class="cp-detail-section">
          <div class="cp-detail-section__header">
            <div>
              <h4>Itens comprados</h4>
              <p>Produtos que deram origem à conta</p>
            </div>
            <span>${itens.length} item(ns)</span>
          </div>

          <div class="cp-detail-list">
            ${
              itens.length
                ? itens
                    .map(
                      (item) => `
                  <div class="cp-detail-row">
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

        <section class="cp-detail-section">
          <div class="cp-detail-section__header">
            <div>
              <h4>Parcelas geradas</h4>
              <p>Títulos financeiros vinculados à compra</p>
            </div>
            <span>${parcelas.length} parcela(s)</span>
          </div>

          <div class="cp-detail-list">
            ${
              parcelas.length
                ? parcelas
                    .map(
                      (parcela) => `
                  <div class="cp-detail-row">
                    <div>
                      <strong>Parcela ${Number(parcela.parcela || 1)}/${Number(parcela.total_parcelas || 1)}</strong>
                      <small>Vencimento: ${formatDate(parcela.data_vencimento)}</small>
                    </div>

                    <div>
                      <span>Status</span>
                      <strong>${getStatusLabel(normalizarStatus(parcela.status))}</strong>
                    </div>

                    <div>
                      <span>Valor</span>
                      <strong>${formatCurrency(parcela.valor || 0)}</strong>
                    </div>
                  </div>
                `
                    )
                    .join('')
                : `<div class="empty-detail-state">Nenhuma parcela vinculada.</div>`
            }
          </div>
        </section>
      </div>

      <div class="cp-detail-footer">
        <button class="btn btn-light" type="button" id="fecharCpOrigemFooter">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('fecharCpOrigem')?.addEventListener('click', () => modal.remove());
  document.getElementById('fecharCpOrigemFooter')?.addEventListener('click', () => modal.remove());

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

// ─── Modal Nova Conta a Pagar ────────────────────────────────────────────────

function abrirModalNovaContaPagar() {
  const modalExistente = document.getElementById('cpNovaContaModal');
  if (modalExistente) modalExistente.remove();

  const hoje = todayFortaleza();

  const fornecedoresOptions = state.fornecedores
    .map(f => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`)
    .join('');

  const modal = document.createElement('div');
  modal.id = 'cpNovaContaModal';
  modal.className = 'modal-overlay cp-detail-overlay';
  modal.innerHTML = `
    <div class="modal-card cp-detail-card cp-nova-conta-card">
      <div class="cp-detail-header">
        <div>
          <span class="cp-detail-eyebrow">Conta a pagar</span>
          <h3>Nova conta manual</h3>
          <p>Registre uma conta sem gerar compra ou movimentar estoque.</p>
        </div>
        <button class="icon-button" type="button" id="cpNovaContaFechar"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div class="cp-detail-body">
        <div class="form-grid">

          <div class="form-group">
            <label>Fornecedor</label>
            <select id="cpNcFornecedor" class="input">
              <option value="">Avulso / sem fornecedor</option>
              ${fornecedoresOptions}
            </select>
          </div>

          <div class="form-group">
            <label>Nome manual</label>
            <input type="text" id="cpNcNome" class="input" placeholder="Nome do fornecedor avulso" />
          </div>

          <div class="form-group form-group--full">
            <label>Descrição</label>
            <input type="text" id="cpNcDescricao" class="input" placeholder="Ex: Aluguel, Material de limpeza..." />
          </div>

          <div class="form-group">
            <label>Valor (R$)</label>
            <input type="number" id="cpNcValor" class="input" step="0.01" min="0.01" inputmode="decimal" placeholder="0,00" />
          </div>

          <div class="form-group">
            <label>1º vencimento</label>
            <input type="date" id="cpNcVencimento" class="input" value="${hoje}" />
          </div>

          <div class="form-group">
            <label>Forma de pagamento</label>
            <select id="cpNcForma" class="input">
              <option value="">Não informado</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="transferencia">Transferência</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div class="form-group form-group--full">
            <label>Observação</label>
            <textarea id="cpNcObservacao" class="input" rows="2" placeholder="Observações..."></textarea>
          </div>

          <!-- Recorrência -->
          <div class="form-group form-group--full cp-recorrencia-group">
            <label class="cp-recorrencia-label">Recorrência</label>
            <div class="cp-recorrencia-tabs" id="cpNcRecorrenciaTabs">
              <button type="button" class="cp-recorrencia-tab cp-recorrencia-tab--active" data-rec="nao_recorrente">
                <i class="fa-solid fa-circle-minus"></i>
                Não recorrente
              </button>
              <button type="button" class="cp-recorrencia-tab" data-rec="parcelar">
                <i class="fa-solid fa-layer-group"></i>
                Parcelar ou repetir
              </button>
              <button type="button" class="cp-recorrencia-tab" data-rec="fixa_mensal">
                <i class="fa-solid fa-calendar-days"></i>
                Fixa mensal
              </button>
            </div>
          </div>

          <!-- Sub-painel parcelamento -->
          <div class="form-group form-group--full cp-parcela-panel" id="cpNcParcelaPanel" style="display:none">
            <div class="cp-parcela-inner">

              <div id="cpNcParcelaIniBox">
                <label>Parcela inicial</label>
                <div class="cp-parcela-spinner">
                  <button type="button" class="cp-spin-btn" id="cpNcParcelaIniDec"><i class="fa-solid fa-minus"></i></button>
                  <span id="cpNcParcelaIniVal">1</span>
                  <button type="button" class="cp-spin-btn" id="cpNcParcelaIniInc"><i class="fa-solid fa-plus"></i></button>
                </div>
                <small>Informe a partir de qual parcela está cadastrando (cliente já pode ter pago as anteriores).</small>
              </div>

              <div>
                <label>Quantidade total</label>
                <div class="cp-parcela-spinner">
                  <button type="button" class="cp-spin-btn" id="cpNcQtdDec"><i class="fa-solid fa-minus"></i></button>
                  <span id="cpNcQtdVal">2</span>
                  <button type="button" class="cp-spin-btn" id="cpNcQtdInc"><i class="fa-solid fa-plus"></i></button>
                </div>
                <small id="cpNcQtdHint">Total de parcelas da dívida.</small>
              </div>

              <div>
                <label>Periodicidade</label>
                <select id="cpNcPeriodicidade" class="input">
                  <option value="30">Mensal (30 dias)</option>
                  <option value="15">Quinzenal (15 dias)</option>
                  <option value="7">Semanal (7 dias)</option>
                  <option value="60">Bimestral (60 dias)</option>
                  <option value="90">Trimestral (90 dias)</option>
                </select>
              </div>

              <!-- Tipo do valor — só para parcelar -->
              <div id="cpNcTipoValorBox">
                <label>O valor informado é:</label>
                <div class="cp-tipo-valor-tabs" id="cpNcTipoValorTabs">
                  <button type="button" class="cp-tipo-btn cp-tipo-btn--active" data-tipo="parcela">
                    Valor por parcela
                  </button>
                  <button type="button" class="cp-tipo-btn" data-tipo="total">
                    Total da dívida
                  </button>
                </div>
                <small id="cpNcTipoValorHint">O sistema manterá o valor informado por parcela.</small>
              </div>

            </div>
          </div>

        </div>
      </div>

      <div class="cp-detail-footer">
        <button class="btn btn-primary" type="button" id="cpNcSalvar">
          <i class="fa-solid fa-floppy-disk"></i> Salvar
        </button>
        <button class="btn btn-light" type="button" id="cpNcCancelar">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Estado local do modal
  let recorrencia = 'nao_recorrente';
  let tipoValor   = 'parcela';
  let parcIni     = 1;
  let qtd         = 2;

  function atualizarHints() {
    const valorStr  = document.getElementById('cpNcValor')?.value || '';
    const valorNum  = parseFloat(valorStr) || 0;
    const qtdEl     = document.getElementById('cpNcQtdVal');
    const hintEl    = document.getElementById('cpNcQtdHint');
    const tipoHint  = document.getElementById('cpNcTipoValorHint');
    const fmtBRL    = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    if (qtdEl) qtdEl.textContent = qtd;

    if (recorrencia === 'fixa_mensal') {
      if (hintEl) hintEl.textContent = `Serão criados ${qtd} títulos mensais independentes.`;
    } else {
      const restantes = qtd - parcIni + 1;
      if (hintEl) hintEl.textContent = `Serão cadastradas ${restantes} parcela(s) (da ${parcIni} até ${qtd}).`;
    }

    if (tipoHint) {
      if (tipoValor === 'total' && valorNum > 0 && qtd > 1) {
        const valParcela = Number((valorNum / qtd).toFixed(2));
        tipoHint.textContent = `O sistema dividirá ${fmtBRL(valorNum)} em ${qtd} parcelas de ~${fmtBRL(valParcela)}.`;
      } else {
        tipoHint.textContent = 'O sistema manterá o valor informado por parcela.';
      }
    }
  }

  // Tabs de recorrência
  modal.querySelectorAll('.cp-recorrencia-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.cp-recorrencia-tab').forEach(b => b.classList.remove('cp-recorrencia-tab--active'));
      btn.classList.add('cp-recorrencia-tab--active');
      recorrencia = btn.dataset.rec;

      const panel  = document.getElementById('cpNcParcelaPanel');
      const iniBox = document.getElementById('cpNcParcelaIniBox');
      const tipoBox= document.getElementById('cpNcTipoValorBox');

      if (recorrencia === 'nao_recorrente') {
        panel.style.display  = 'none';
      } else {
        panel.style.display  = 'block';
        // Parcela inicial: só faz sentido em "parcelar"
        if (iniBox) iniBox.style.display = recorrencia === 'parcelar' ? 'block' : 'none';
        // Tipo de valor: só faz sentido em "parcelar"
        if (tipoBox) tipoBox.style.display = recorrencia === 'parcelar' ? 'block' : 'none';
        if (recorrencia === 'fixa_mensal') {
          qtd = qtd < 2 ? 12 : qtd;
          atualizarHints();
        }
      }
      atualizarHints();
    });
  });

  // Tabs de tipo de valor
  modal.querySelectorAll('.cp-tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.cp-tipo-btn').forEach(b => b.classList.remove('cp-tipo-btn--active'));
      btn.classList.add('cp-tipo-btn--active');
      tipoValor = btn.dataset.tipo;
      atualizarHints();
    });
  });

  // Spinners
  function spinHandler(idDec, idInc, get, set, min, max) {
    document.getElementById(idDec)?.addEventListener('click', () => { set(Math.max(min, get() - 1)); atualizarHints(); });
    document.getElementById(idInc)?.addEventListener('click', () => { set(Math.min(max, get() + 1)); atualizarHints(); });
  }
  spinHandler('cpNcParcelaIniDec', 'cpNcParcelaIniInc',
    () => parcIni, v => { parcIni = v; document.getElementById('cpNcParcelaIniVal').textContent = v; },
    1, 360);
  spinHandler('cpNcQtdDec', 'cpNcQtdInc',
    () => qtd, v => { qtd = Math.max(parcIni, v); document.getElementById('cpNcQtdVal').textContent = Math.max(parcIni, v); qtd = Math.max(parcIni, v); },
    2, 360);

  document.getElementById('cpNcValor')?.addEventListener('input', atualizarHints);

  // Fechar
  document.getElementById('cpNovaContaFechar')?.addEventListener('click', () => modal.remove());
  document.getElementById('cpNcCancelar')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // Salvar
  document.getElementById('cpNcSalvar')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    try {
      await salvarNovaContaPagar(modal, { recorrencia, tipoValor, parcIni, qtd });
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
    }
  });
}

async function salvarNovaContaPagar(modal, { recorrencia, tipoValor, parcIni, qtd }) {
  const fornecedorId  = document.getElementById('cpNcFornecedor')?.value || '';
  const nomeManual    = document.getElementById('cpNcNome')?.value?.trim() || '';
  const descricao     = document.getElementById('cpNcDescricao')?.value?.trim() || '';
  const valorStr      = document.getElementById('cpNcValor')?.value || '';
  const vencimento    = document.getElementById('cpNcVencimento')?.value || '';
  const forma         = document.getElementById('cpNcForma')?.value || '';
  const observacao    = document.getElementById('cpNcObservacao')?.value?.trim() || '';
  const periodicidade = parseInt(document.getElementById('cpNcPeriodicidade')?.value || '30', 10);

  const valorNum = parseFloat(valorStr);
  if (!valorStr || !Number.isFinite(valorNum) || valorNum <= 0) {
    showMessage('Informe um valor válido.', 'error'); return;
  }
  if (!vencimento) {
    showMessage('Informe a data do 1º vencimento.', 'error'); return;
  }
  if (!descricao) {
    showMessage('Informe uma descrição.', 'error'); return;
  }

  try {
    const resp = await api.criarContaPagarManual({
      fornecedor_id:  fornecedorId || null,
      fornecedor_nome: nomeManual || undefined,
      descricao,
      observacao,
      forma_pagamento: forma || undefined,
      valor:          valorNum,
      data_vencimento: vencimento,
      recorrencia,
      tipo_valor:     tipoValor,
      parcela_inicial: parcIni,
      quantidade:     recorrencia === 'nao_recorrente' ? 1 : qtd,
      periodicidade
    });

    const n = resp?.ids?.length || 1;
    showMessage(`${n} título(s) criado(s) com sucesso.`, 'success');
    modal.remove();
    await recarregar();
  } catch (err) {
    console.error('[cp-nova-conta] Erro:', err);
    showMessage(buildFriendlyError(err), 'error');
  }
}

// ────────────────────────────────────────────────────────────────────────────

function renderErro(message) {
  const container = document.getElementById('contasPagarContainer');
  if (!container) return;

  container.innerHTML = `
    <section class="module-card">
      <div class="module-feedback module-feedback--error">
        ${escapeHtml(message)}
      </div>
    </section>
  `;
}

function normalizarStatus(status) {
  return String(status || 'pendente')
    .trim()
    .toLowerCase();
}

function getStatusLabel(status) {
  const normalized = normalizarStatus(status);

  if (normalized === 'pago') return 'Pago';
  if (normalized === 'atrasado') return 'Atrasado';
  if (normalized === 'pendente') return 'Pendente';
  if (normalized === 'parcial') return 'Parcial';
  if (normalized === 'parcial_atrasado') return 'Parcial em atraso';

  return capitalize(normalized);
}

function getStatusBadgeClass(status) {
  const normalized = normalizarStatus(status);

  if (normalized === 'pago') return 'badge badge--success';
  if (normalized === 'atrasado') return 'badge badge--danger';
  if (normalized === 'pendente') return 'badge badge--warning';
  if (normalized === 'parcial') return 'badge badge--info';
  if (normalized === 'parcial_atrasado') return 'badge badge--danger';

  return 'badge badge--info';
}

function getVencimentoInfo(dataVencimento) {
  if (!dataVencimento) return 'Sem vencimento';

  const hoje = new Date(`${todayFortaleza()}T12:00:00`);

  const vencimento = new Date(`${String(dataVencimento).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(vencimento.getTime())) {
    return 'Vencimento informado';
  }

  const diffMs = vencimento.getTime() - hoje.getTime();
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return `${Math.abs(diffDias)} dia(s) em atraso`;
  if (diffDias === 0) return 'Vence hoje';
  if (diffDias === 1) return 'Vence amanhã';

  return `Vence em ${diffDias} dia(s)`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const dateStr = String(value).slice(0, 10);
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
}


function capitalize(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function injectContasPagarStyles() {
  if (document.getElementById('contasPagarProfessionalStyles')) return;

  const style = document.createElement('style');
  style.id = 'contasPagarProfessionalStyles';
  style.textContent = `
    .cp-toolbar-grid {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 10px;
      align-items: start;
      margin-bottom: 18px;
    }

    .cp-search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0 14px;
      background: var(--surface);
      min-height: 44px;
    }

    .cp-search-box input {
      border: none;
      outline: none;
      background: transparent;
      color: var(--text);
      font-size: 0.94rem;
      width: 100%;
    }

    .cp-search-box i {
      color: var(--text-muted);
      font-size: 0.82rem;
    }

    .cp-filter-box select {
      min-height: 44px;
      min-width: 160px;
    }

    .cp-action-box {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .cp-stats-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .sort-icon {
      font-size: 0.72rem;
      margin-left: 2px;
      opacity: 0.55;
      font-style: normal;
    }

    .sort-icon--asc,
    .sort-icon--desc {
      opacity: 1;
      color: var(--primary);
    }

    mark.cp-hl {
      background: rgba(234, 179, 8, 0.28);
      color: inherit;
      border-radius: 3px;
      padding: 0 1px;
    }

    .cp-dias-atraso {
      display: block;
      color: #dc2626;
      font-weight: 800;
      font-size: 11px;
      margin-top: 3px;
    }

    .cp-stat-card--parcial {
      border-color: rgba(8, 145, 178, 0.24);
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .cp-explain-card {
        border-color: rgba(96, 165, 250, 0.18);
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.13), rgba(8, 145, 178, 0.1));
      }
      :root:not([data-theme="light"]) .cp-dias-atraso {
        color: #f87171;
      }
      :root:not([data-theme="light"]) mark.cp-hl {
        background: rgba(234, 179, 8, 0.38);
      }
    }

    :root[data-theme="dark"] .cp-explain-card {
      border-color: rgba(96, 165, 250, 0.18);
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.13), rgba(8, 145, 178, 0.1));
    }
    :root[data-theme="dark"] .cp-dias-atraso { color: #f87171; }
    :root[data-theme="dark"] mark.cp-hl { background: rgba(234, 179, 8, 0.38); }

    .cp-module-card {
      position: relative;
    }

    .cp-explain-card {
      border: 1px solid rgba(37, 99, 235, 0.14);
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(8, 145, 178, 0.06));
      border-radius: 18px;
      padding: 14px 16px;
      margin-bottom: 18px;
    }

    .cp-explain-card strong {
      display: block;
      color: var(--primary-hover);
      font-weight: 800;
      margin-bottom: 4px;
    }

    .cp-explain-card span {
      color: var(--text-soft);
      font-weight: 600;
      line-height: 1.45;
    }

    .cp-stat-card {
      min-width: 170px;
      position: relative;
      overflow: hidden;
    }

    .cp-stat-card small {
      color: var(--text-muted);
      font-weight: 700;
      font-size: 0.78rem;
    }

    .cp-stat-card--pendente {
      border-color: rgba(217, 119, 6, 0.2);
    }

    .cp-stat-card--atrasado {
      border-color: rgba(220, 38, 38, 0.2);
    }

    .cp-stat-card--pago {
      border-color: rgba(22, 163, 74, 0.2);
    }

    .badge--warning {
      background: var(--warning-soft);
      color: #a16207;
      border-color: rgba(217, 119, 6, 0.16);
    }

    .badge--info {
      background: var(--info-soft);
      color: #0e7490;
      border-color: rgba(8, 145, 178, 0.16);
    }

    .btn-inline--success {
      color: var(--success);
      border-color: rgba(22, 163, 74, 0.2);
    }

    .btn-inline--success:hover {
      background: var(--success-soft);
      color: #15803d;
    }

    .empty-table-state {
      min-height: 120px;
      display: grid;
      place-items: center;
      text-align: center;
      color: var(--text-muted);
      gap: 4px;
    }

    .empty-table-state strong {
      display: block;
      color: var(--text);
      font-weight: 800;
    }

    .empty-table-state span {
      display: block;
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .table-primary {
      display: grid;
      gap: 3px;
    }

    .table-primary small {
      color: var(--text-muted);
      font-size: 0.78rem;
      font-weight: 600;
    }

    .cp-detail-overlay,
    .cp-origin-overlay {
      padding: 18px;
      align-items: center;
    }

    .cp-detail-card,
    .cp-origin-card {
      width: min(100%, 820px);
      max-height: calc(100vh - 36px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border-radius: 26px;
      padding: 0;
    }

    .cp-detail-header {
      padding: 20px 22px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 32%),
        var(--surface);
    }

    .cp-detail-eyebrow {
      display: inline-flex;
      width: fit-content;
      padding: 5px 10px;
      margin-bottom: 8px;
      border-radius: 999px;
      background: var(--primary-soft);
      color: var(--primary-hover);
      font-size: 0.74rem;
      font-weight: 800;
    }

    .cp-detail-header h3 {
      font-size: 1.28rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: var(--text);
      margin-bottom: 4px;
    }

    .cp-detail-header p {
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 600;
    }

    .cp-detail-body {
      padding: 18px 22px;
      display: grid;
      gap: 14px;
      overflow-y: auto;
    }

    .cp-detail-summary {
      display: grid;
      grid-template-columns: 1.25fr repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .cp-detail-summary article,
    .cp-detail-note {
      border: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: 18px;
      padding: 14px 16px;
      min-width: 0;
    }

    .cp-detail-summary article span,
    .cp-detail-note span,
    .cp-detail-grid span {
      display: block;
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .cp-detail-summary article strong,
    .cp-detail-grid strong {
      display: block;
      color: var(--text);
      font-size: 0.98rem;
      font-weight: 800;
      line-height: 1.25;
      word-break: break-word;
    }

    .cp-detail-summary__main strong {
      font-size: 1.35rem !important;
      letter-spacing: -0.04em;
    }

    .cp-detail-summary article small {
      display: block;
      margin-top: 6px;
      color: var(--text-muted);
      font-weight: 700;
    }

    .cp-detail-note {
      padding: 12px 16px;
    }

    .cp-detail-note p {
      color: var(--text);
      font-weight: 700;
      line-height: 1.45;
    }

    .cp-detail-section {
      border: 1px solid var(--border);
      border-radius: 20px;
      background: var(--surface);
      overflow: hidden;
    }

    .cp-detail-section__header {
      padding: 13px 16px;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .cp-detail-section__header h4 {
      color: var(--text);
      font-size: 0.98rem;
      font-weight: 800;
      margin-bottom: 3px;
    }

    .cp-detail-section__header p {
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 600;
    }

    .cp-detail-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 14px 16px;
    }

    .cp-detail-grid > div {
      border: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: 16px;
      padding: 12px;
    }

    .cp-detail-list {
      display: grid;
    }

    .cp-detail-row {
      display: grid;
      grid-template-columns: 1.4fr 0.8fr 0.8fr;
      gap: 14px;
      align-items: center;
      padding: 13px 16px;
      border-bottom: 1px solid var(--border);
    }

    .cp-detail-row:last-child {
      border-bottom: none;
    }

    .cp-detail-row strong {
      color: var(--text);
      font-size: 0.92rem;
      font-weight: 800;
    }

    .cp-detail-row small,
    .cp-detail-row span {
      display: block;
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 700;
      margin-bottom: 3px;
    }

    .empty-detail-state {
      padding: 18px 16px;
      color: var(--text-muted);
      font-weight: 700;
    }

    .cp-detail-footer {
      padding: 14px 22px 18px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      background: var(--surface);
    }

    @media (max-width: 980px) {
      .cp-toolbar-grid {
        grid-template-columns: 1fr;
      }

      .cp-action-box {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }

      .cp-detail-summary,
      .cp-detail-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .cp-detail-row {
        grid-template-columns: 1fr;
        gap: 8px;
      }
    }

    @media (max-width: 560px) {
      .cp-detail-overlay,
      .cp-origin-overlay {
        padding: 10px;
        align-items: flex-start;
      }

      .cp-detail-card,
      .cp-origin-card {
        max-height: calc(100vh - 20px);
        border-radius: 20px;
      }

      .cp-detail-summary,
      .cp-detail-grid {
        grid-template-columns: 1fr;
      }

      .cp-detail-body {
        padding: 14px;
      }

      .cp-action-box {
        grid-template-columns: 1fr;
      }
    }

    /* ── Nova Conta a Pagar ── */
    .cp-nova-conta-card { width: min(100%, 660px); }

    .cp-recorrencia-group { margin-top: 4px; }
    .cp-recorrencia-label {
      display: block;
      font-size: 0.76rem;
      font-weight: 800;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 8px;
    }
    .cp-recorrencia-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .cp-recorrencia-tab {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 9px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: border-color .15s, background .15s, color .15s;
    }
    .cp-recorrencia-tab:hover { border-color: var(--primary); color: var(--primary); }
    .cp-recorrencia-tab--active {
      border-color: var(--primary);
      background: var(--primary-soft);
      color: var(--primary-hover);
    }

    .cp-parcela-panel {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
    }
    .cp-parcela-inner {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .cp-parcela-inner label {
      display: block;
      font-size: 0.76rem;
      font-weight: 800;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .cp-parcela-inner small {
      display: block;
      color: var(--text-muted);
      font-size: 0.74rem;
      margin-top: 6px;
      font-weight: 600;
      line-height: 1.4;
    }

    .cp-parcela-spinner {
      display: flex;
      align-items: center;
      gap: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      padding: 6px 12px;
      width: fit-content;
    }
    .cp-parcela-spinner span {
      font-size: 1.15rem;
      font-weight: 900;
      min-width: 24px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .cp-spin-btn {
      width: 28px;
      height: 28px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface-2);
      color: var(--text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.72rem;
      transition: background .12s;
    }
    .cp-spin-btn:hover { background: var(--primary-soft); color: var(--primary); }

    .cp-tipo-valor-tabs { display: flex; gap: 8px; margin-top: 4px; }
    .cp-tipo-btn {
      padding: 7px 14px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 0.83rem;
      font-weight: 700;
      cursor: pointer;
      transition: border-color .12s, background .12s, color .12s;
    }
    .cp-tipo-btn:hover { border-color: var(--primary); color: var(--primary); }
    .cp-tipo-btn--active {
      border-color: var(--primary);
      background: var(--primary-soft);
      color: var(--primary-hover);
    }

    @media (max-width: 600px) {
      .cp-parcela-inner { grid-template-columns: 1fr; }
      .cp-recorrencia-tabs { flex-direction: column; }
    }

    .lf-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 16px 0 4px;
    }
    .lf-pagination__btn {
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text);
    }
    .lf-pagination__btn:hover:not(:disabled) { background: var(--surface-2); }
    .lf-pagination__btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .lf-pagination__info { font-size: 0.88rem; font-weight: 700; color: var(--text-muted); }
    .lf-pagination__info small { font-weight: 600; font-size: 0.8rem; }

    .cp-alertas-venc {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .cp-alerta-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 10px;
      border: 1px solid transparent;
      font-size: 0.84rem;
      font-weight: 700;
    }
    .cp-alerta-chip--danger {
      background: var(--danger-soft, rgba(220,38,38,.08));
      border-color: rgba(220,38,38,.18);
      color: #b91c1c;
    }
    .cp-alerta-chip--warning {
      background: var(--warning-soft, rgba(217,119,6,.08));
      border-color: rgba(217,119,6,.18);
      color: #92400e;
    }
    .cp-alerta-chip--info {
      background: var(--info-soft, rgba(8,145,178,.08));
      border-color: rgba(8,145,178,.18);
      color: #0e7490;
    }
    .cp-alerta-chip__num {
      font-size: 1.1em;
      font-weight: 900;
    }
    .cp-alerta-chip__label { opacity: .85; }
    .cp-alerta-chip__val {
      font-variant-numeric: tabular-nums;
      font-weight: 800;
    }
  `;

  document.head.appendChild(style);
}
