import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { gerarPIX } from './pix.js';
import { escapeHtml, buildFriendlyError, todayFortaleza, calcPeriodoLocal, debounce } from './utils.js';

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
  clientes: [],
  filtros: {
    status: '',
    cliente_id: '',
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

function salvarFiltrosCR() {
  try { sessionStorage.setItem('lf_filtros_cr', JSON.stringify(state.filtros)); } catch {}
}
function carregarFiltrosCR() {
  try {
    const s = JSON.parse(sessionStorage.getItem('lf_filtros_cr') || 'null');
    if (s) Object.assign(state.filtros, s);
  } catch {}
}

function showMessage(message, type = 'info') {
  const feedback = document.getElementById('contasReceberFeedback');

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

  const btnAtualizar = document.getElementById('btnAtualizarContasReceber');
  const btnFiltrar = document.getElementById('btnFiltrarContasReceber');
  const btnLimpar = document.getElementById('btnLimparFiltrosContasReceber');

  if (btnAtualizar) btnAtualizar.disabled = value;
  if (btnFiltrar) btnFiltrar.disabled = value;
  if (btnLimpar) btnLimpar.disabled = value;

  if (btnAtualizar) {
    btnAtualizar.innerHTML = value
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...'
      : '<i class="fa-solid fa-rotate"></i> Atualizar';
  }
}


export async function initContasReceberModule() {
  try {
    state.loading = true;
    carregarFiltrosCR();
    if (!state.periodo.dataInicial) {
      const datas = calcPeriodoLocal(state.periodo.preset);
      state.periodo.dataInicial = datas.dataInicial;
      state.periodo.dataFinal = datas.dataFinal;
    }
    renderSkeleton();

    await Promise.all([carregarClientes(), carregarContas()]);

    _sortItems();
    render();
  } catch (error) {
    console.error('Erro ao iniciar contas a receber:', error);
    const message = buildFriendlyError(error);
    renderErro(message);
    showMessage(message, 'error');
  } finally {
    state.loading = false;
  }
}

async function carregarClientes() {
  const response = await api.getContasReceberClientes();
  state.clientes = Array.isArray(response) ? response : [];
}

async function carregarContas() {
  const filtrosGlobais = getFiltrosGlobais();

  const response = await api.getContasReceber({
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
  const container = document.getElementById('contasReceberContainer');
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
        ${[[3,1,1,1],[3,1,1,1],[3,1,1,1],[3,1,1,1],[3,1,1,1],[3,1,1,1]].map(skRow).join('')}
      </div>
    </section>`;
}

function calcAlertasVencCR() {
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

function renderAlertasVencCR() {
  const { atrasadas, valAtrasadas, hoje, valHoje, prox7, valProx7 } = calcAlertasVencCR();
  if (!atrasadas && !hoje && !prox7) return '';
  const fmtC = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const chip = (label, qtd, val, cls) =>
    qtd ? `<div class="cp-alerta-chip cp-alerta-chip--${cls}"><span class="cp-alerta-chip__num">${qtd}</span><span class="cp-alerta-chip__label">${label}</span><span class="cp-alerta-chip__val">${fmtC(val)}</span></div>` : '';
  return `
    <div class="cr-alertas-venc cp-alertas-venc">
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
  return escaped.replace(new RegExp(`(${safe})`, 'gi'), '<mark class="cr-hl">$1</mark>');
}

function render() {
  const container = document.getElementById('contasReceberContainer');
  if (!container) return;

  const si = col => state.ordem === col
    ? (state.ordemDir === 'asc' ? ' <span class="sort-icon sort-icon--asc">↑</span>' : ' <span class="sort-icon sort-icon--desc">↓</span>')
    : ' <span class="sort-icon sort-icon--idle">⇅</span>';

  container.innerHTML = `
    <section class="module-card cr-module-card">
      <div id="contasReceberFeedback" class="module-feedback"></div>

      <div class="cr-explain-card">
        <div>
          <strong>Importante</strong>
          <span>Esta tela mostra títulos. Valores recebidos só entram no Fluxo de Caixa após baixa/pagamento.</span>
        </div>
      </div>

      ${renderAlertasVencCR()}

      <div class="periodo-local">
        <span class="periodo-local__label">Período:</span>
        <div class="periodo-local__presets">
          ${['hoje','7dias','30dias','mesAtual','mesAnterior'].map(p => {
            const labels = { hoje:'Hoje', '7dias':'7 dias', '30dias':'30 dias', mesAtual:'Este mês', mesAnterior:'Mês ant.' };
            return `<button type="button" class="periodo-local__btn${state.periodo.preset===p?' periodo-local__btn--active':''}" data-cr-period="${p}">${labels[p]}</button>`;
          }).join('')}
          <button type="button" class="periodo-local__btn${state.periodo.preset==='personalizado'?' periodo-local__btn--active':''}" data-cr-period="personalizado">Personalizado</button>
        </div>
        <div id="crPeriodoCustom" class="periodo-local__custom${state.periodo.preset==='personalizado'?'':' hidden'}">
          <input type="date" id="crDataIni" class="input" value="${state.periodo.dataInicial}">
          <span>até</span>
          <input type="date" id="crDataFim" class="input" value="${state.periodo.dataFinal}">
          <button type="button" class="btn btn-primary" id="crAplicarPeriodo">Aplicar</button>
        </div>
      </div>

      <div class="cr-toolbar-grid">
        <div class="module-toolbar__search cr-search-box">
          <i class="fa-solid fa-search"></i>
          <input
            type="text"
            id="crBusca"
            placeholder="Buscar cliente, observação ou nº da venda..."
            value="${escapeHtml(state.filtros.busca || '')}"
          />
        </div>

        <div class="cr-filter-box">
          <select id="crStatus" class="input">
            <option value="">Todos os status</option>
            <option value="pendente" ${state.filtros.status === 'pendente' ? 'selected' : ''}>Pendentes</option>
            <option value="atrasado" ${state.filtros.status === 'atrasado' ? 'selected' : ''}>Atrasados</option>
            <option value="pago" ${state.filtros.status === 'pago' ? 'selected' : ''}>Recebidos</option>
            <option value="parcial" ${state.filtros.status === 'parcial' ? 'selected' : ''}>Parciais</option>
            <option value="parcial_atrasado" ${state.filtros.status === 'parcial_atrasado' ? 'selected' : ''}>Parcial em atraso</option>
          </select>
        </div>

        <div class="cr-filter-box cr-filter-box--cliente">
          <select id="crCliente" class="input">
            <option value="">Todos os clientes</option>
            ${state.clientes
              .map(
                (cliente) => `
              <option value="${cliente.id}" ${String(state.filtros.cliente_id) === String(cliente.id) ? 'selected' : ''}>
                ${escapeHtml(cliente.nome)}
              </option>
            `
              )
              .join('')}
          </select>
        </div>

        <div class="cr-action-box">
          <button class="btn btn-primary" id="btnNovaContaManual" type="button">
            <i class="fa-solid fa-plus"></i>
            Conta manual
          </button>

          <button class="btn btn-primary" id="btnFiltrarContasReceber" type="button">
            <i class="fa-solid fa-filter"></i>
            Filtrar
          </button>

          <button class="btn btn-light" id="btnLimparFiltrosContasReceber" type="button">
            <i class="fa-solid fa-eraser"></i>
            Limpar
          </button>

          <button class="btn btn-light" id="btnAtualizarContasReceber" type="button">
            <i class="fa-solid fa-rotate"></i>
            Atualizar
          </button>
        </div>
      </div>

      <div class="cr-stats-grid">
        <article class="mini-stat cr-stat-card cr-stat-card--total">
          <span>Total de títulos</span>
          <strong>${formatCurrency(state.resumo.total)}</strong>
          <small>${state.totalRegistros || state.contas.length} registro(s)</small>
        </article>

        <article class="mini-stat cr-stat-card cr-stat-card--pendente">
          <span>Pendentes</span>
          <strong>${formatCurrency(state.resumo.total_pendente)}</strong>
          <small>${Number(state.resumo.qtd_pendente || 0)} título(s)</small>
        </article>

        <article class="mini-stat cr-stat-card cr-stat-card--atrasado">
          <span>Atrasados</span>
          <strong>${formatCurrency(state.resumo.total_atrasado)}</strong>
          <small>${Number(state.resumo.qtd_atrasado || 0)} título(s)</small>
        </article>

        <article class="mini-stat cr-stat-card cr-stat-card--pago">
  <span>Recebidos</span>
  <strong>${formatCurrency(state.resumo.total_pago)}</strong>
  <small>${Number(state.resumo.qtd_pago || 0)} título(s)</small>
</article>

<article class="mini-stat cr-stat-card cr-stat-card--parcial">
  <span>Recebido parcial</span>
  <strong>${formatCurrency(state.resumo.total_recebido_parcial || 0)}</strong>
  <small>${(() => { const n = state.contas.filter(c => ['parcial', 'parcial_atrasado'].includes(normalizarStatus(c.status))).length; return n ? `${n} título(s) parcial` : 'Baixas parciais realizadas'; })()}</small>
</article>
      </div>

      <div class="table-wrapper">
        <table class="data-table cr-table">
          <thead>
            <tr>
              <th data-sort-col="id" style="cursor:pointer;user-select:none">Título${si('id')}</th>
              <th data-sort-col="cliente_nome" style="cursor:pointer;user-select:none">Cliente${si('cliente_nome')}</th>
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
        <button class="lf-pagination__btn" type="button" data-action="cr-pagina" data-page="prev" ${state.pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="lf-pagination__info">Página ${state.pagina} de ${state.totalPaginas} <small>(${state.totalRegistros} registro(s))</small></span>
        <button class="lf-pagination__btn" type="button" data-action="cr-pagina" data-page="next" ${state.pagina >= state.totalPaginas ? 'disabled' : ''} aria-label="Próxima página">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>` : ''}
    </section>
  `;

  bindEventos();
  injectContasReceberStyles();
}

function renderLinhas() {
  if (!state.contas.length) {
    const hasFilter = state.filtros.status || state.filtros.cliente_id || state.filtros.busca;
    const emptyMsg = hasFilter
      ? 'Nenhuma conta encontrada para o filtro aplicado.'
      : 'Use os filtros acima ou gere contas a receber por vendas promissórias.';
    return `
      <tr>
        <td colspan="7">
          <div class="empty-table-state">
            <i class="fa-solid fa-file-invoice-dollar" style="font-size:2rem;opacity:.22;margin-bottom:4px"></i>
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
      const diasAtrasoHtml = getDiasAtrasoHtml(status, conta.data_vencimento);

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
            <strong>${_highlight(conta.cliente_nome || 'Cliente não informado', termo)}</strong>
            <small>Cliente</small>
          </div>
        </td>

        <td>
          <div class="table-primary">
            <strong>${conta.venda_id ? `Venda #${escapeHtml(conta.venda_id)}` : 'Manual'}</strong>
            <small>${escapeHtml(conta.forma_pagamento || conta.venda_pagamento || 'Conta a receber')}</small>
          </div>
        </td>

        <td>
          <div class="table-primary">
            <strong>${formatDate(conta.data_vencimento)}</strong>
            <small>${status === 'pago' ? `Recebido em ${formatDate(conta.data_pagamento)}` : getVencimentoInfo(conta.data_vencimento)}</small>
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
          ${
            conta.cliente_id
              ? `
      <button class="btn-inline" type="button" data-action="historico-cliente-cr" data-id="${conta.cliente_id}">
        <i class="fa-solid fa-user-clock"></i>
        Cliente
      </button>
    `
              : ''
          }
            <button class="btn-inline" type="button" data-action="detalhe-cr" data-id="${conta.id}">
              <i class="fa-solid fa-eye"></i>
              Detalhes
            </button>

            ${
              conta.venda_id
                ? `
                  <button class="btn-inline" type="button" data-action="origem-venda-cr" data-id="${conta.id}">
                    <i class="fa-solid fa-receipt"></i>
                    Venda
                  </button>
                `
                : ''
            }

           ${
             status === 'pago'
               ? `
      <button class="btn-inline btn-inline--warning" type="button" data-action="estornar-cr" data-id="${conta.id}">
        <i class="fa-solid fa-rotate-left"></i>
        Estornar
      </button>
    `
               : `
      <button class="btn-inline btn-inline--success" type="button" data-action="baixar-cr" data-id="${conta.id}">
        <i class="fa-solid fa-check"></i>
        Baixar
      </button>

      <button class="btn-inline btn-inline--pix" type="button"
        data-action="cobrar-pix-cr"
        data-id="${conta.id}"
        data-valor="${conta.valor}"
        data-cliente="${escapeHtml(conta.cliente_nome || '')}">
        <i class="fa-brands fa-pix"></i>
        PIX
      </button>

      <button class="btn-inline" type="button"
        data-action="gerar-boleto-cr"
        data-id="${conta.id}"
        title="Gerar boleto bancário (Asaas)">
        <i class="fa-solid fa-barcode"></i>
        Boleto
      </button>

      ${
        !conta.venda_id && status !== 'pago'
          ? `
            <button
              class="btn-inline btn-inline--danger"
              type="button"
              data-action="excluir-cr"
              data-id="${conta.id}"
            >
              <i class="fa-solid fa-trash"></i>
              Excluir
            </button>
          `
          : ''
      }
    `
           }
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
}

function bindEventos() {
  const btnAtualizar = document.getElementById('btnAtualizarContasReceber');
  const btnNovaContaManual = document.getElementById('btnNovaContaManual');
  const btnFiltrar = document.getElementById('btnFiltrarContasReceber');
  const btnLimpar = document.getElementById('btnLimparFiltrosContasReceber');
  const busca = document.getElementById('crBusca');
  const status = document.getElementById('crStatus');
  const cliente = document.getElementById('crCliente');

  btnAtualizar?.addEventListener('click', async () => {
    await recarregar();
  });

  btnNovaContaManual?.addEventListener('click', () => {
    abrirModalContaManual();
  });

  btnFiltrar?.addEventListener('click', async () => {
    state.filtros.busca = busca?.value?.trim() || '';
    state.filtros.status = status?.value || '';
    state.filtros.cliente_id = cliente?.value || '';
    state.pagina = 1;
    salvarFiltrosCR();
    await recarregar();
  });

  btnLimpar?.addEventListener('click', async () => {
    state.filtros = { status: '', cliente_id: '', busca: '' };
    state.pagina = 1;
    salvarFiltrosCR();
    await recarregar();
  });

  busca?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      state.filtros.busca = busca.value.trim();
      state.filtros.status = status?.value || '';
      state.filtros.cliente_id = cliente?.value || '';
      state.pagina = 1;
      salvarFiltrosCR();

      await recarregar();
    }
  });

  const debouncedBusca = debounce(async () => {
    const inp = document.getElementById('crBusca');
    const curval = inp?.value || '';
    state.filtros.busca = curval.trim();
    state.filtros.status = document.getElementById('crStatus')?.value || '';
    state.filtros.cliente_id = document.getElementById('crCliente')?.value || '';
    state.pagina = 1;
    salvarFiltrosCR();
    await recarregar();
    const restored = document.getElementById('crBusca');
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

  document.querySelectorAll('[data-cr-period]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const preset = btn.dataset.crPeriod;
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

  document.getElementById('crAplicarPeriodo')?.addEventListener('click', async () => {
    state.periodo.dataInicial = document.getElementById('crDataIni')?.value || '';
    state.periodo.dataFinal = document.getElementById('crDataFim')?.value || '';
    state.pagina = 1;
    await recarregar();
  });

  document.querySelectorAll("[data-action='cr-pagina']").forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (state.loading) return;
      const page = btn.dataset.page;
      if (page === 'prev' && state.pagina > 1) state.pagina--;
      else if (page === 'next' && state.pagina < state.totalPaginas) state.pagina++;
      await recarregar();
    });
  });

  document.querySelectorAll("[data-action='estornar-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await estornarConta(button.dataset.id);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-action='baixar-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await baixarConta(button.dataset.id);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-action='excluir-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await excluirConta(button.dataset.id);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-action='historico-cliente-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      await abrirHistoricoCliente(button.dataset.id);
    });
  });

  document.querySelectorAll("[data-action='detalhe-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      await abrirDetalheConta(button.dataset.id);
    });
  });

  document.querySelectorAll("[data-action='cobrar-pix-cr']").forEach((button) => {
    button.addEventListener('click', () => {
      gerarPIX({
        contaReceberID: Number(button.dataset.id),
        valor:          Number(button.dataset.valor),
        clienteNome:    button.dataset.cliente || '',
        onPago:         () => recarregar()
      });
    });
  });

  document.querySelectorAll("[data-action='gerar-boleto-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      await gerarBoleto(Number(button.dataset.id));
    });
  });

  document.querySelectorAll("[data-action='origem-venda-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      await abrirOrigemVenda(button.dataset.id);
    });
  });
}

async function recarregar() {
  if (state.loading) return;
  setLoading(true);
  showMessage('Atualizando contas a receber...', 'info');

  try {
    renderSkeleton();

    await Promise.all([carregarClientes(), carregarContas()]);

    _sortItems();
    render();
  } catch (error) {
    console.error('Erro ao recarregar contas a receber:', error);
    const message = buildFriendlyError(error);
    renderErro(message);
    showMessage(message, 'error');
  } finally {
    setLoading(false);
  }
}

async function estornarConta(id) {
  if (state._estornando) return;
  state._estornando = true;
  const confirmar = await confirmarAcao('Estornar a baixa desta conta? Ela voltará para pendente ou atrasada conforme o vencimento.', 'Estornar', 'warning');
  if (!confirmar) {
    state._estornando = false;
    return;
  }
  try {
    await api.estornarContaReceber(id);
    showMessage('Baixa estornada com sucesso.', 'success');
    await recarregar();
  } catch (error) {
    console.error('Erro ao estornar conta a receber:', error);
    const message = buildFriendlyError(error);
    showMessage(message, 'error');
  } finally {
    state._estornando = false;
  }
}

async function baixarConta(id) {
  const conta = state.contas.find((item) => String(item.id) === String(id));

  if (!conta) {
    showMessage('Conta não encontrada para baixa.', 'error');
    return;
  }

  abrirModalBaixaConta(conta);
}

async function excluirConta(id) {
  const _cr = state.contas.find(c => String(c.id) === String(id));
  const _devedor = _cr?.nome_devedor || _cr?.cliente_nome || null;
  const _val = _cr ? ` (${Number(_cr.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : '';
  const _msgCr = _devedor ? `Excluir conta de "${_devedor}"${_val}? Esta ação não pode ser desfeita.` : 'Excluir esta conta manual? Esta ação não pode ser desfeita.';
  const confirmar = await confirmarAcao(_msgCr, 'Excluir', 'danger');

  if (!confirmar) return;

  try {
    await api.request(`/contas-receber/${id}`, {
      method: 'DELETE',
      query: { empresa_id: api.getEmpresaId() }
    });

    showMessage('Conta manual excluída com sucesso.', 'success');

    await recarregar();
  } catch (error) {
    console.error('Erro ao excluir conta manual:', error);

    const message = buildFriendlyError(error);

    showMessage(message, 'error');
  }
}

async function abrirRecebimentosParciais(id) {
  try {
    const data = await api.request(`/contas-receber/${id}/recebimentos-parciais`, { query: { empresa_id: api.getEmpresaId() } });
    const recebimentos = Array.isArray(data?.recebimentos) ? data.recebimentos : [];

    const modalExistente = document.getElementById('crRecebimentosParciaisModal');
    if (modalExistente) modalExistente.remove();

    const modal = document.createElement('div');
    modal.id = 'crRecebimentosParciaisModal';
    modal.className = 'modal-overlay cr-detail-overlay';

    modal.innerHTML = `
      <div class="modal-card cr-detail-card">
        <div class="cr-detail-header">
          <div>
            <span class="cr-detail-eyebrow">Conta #${escapeHtml(id)}</span>
            <h3>Recebimentos parciais</h3>
            <p>Estorne apenas o recebimento lançado incorretamente.</p>
          </div>

          <button class="icon-button" type="button" id="fecharRecebimentosParciais">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="cr-detail-body">
          <section class="cr-detail-section">
            <div class="cr-detail-section__header">
              <div>
                <h4>Baixas parciais realizadas</h4>
                <p>${recebimentos.length} recebimento(s)</p>
              </div>
            </div>

            <div class="cr-detail-list">
              ${
                recebimentos.length
                  ? recebimentos
                      .map(
                        (item) => `
                          <div class="cr-detail-row">
                            <div>
                              <strong>${formatCurrency(item.valor)}</strong>
                              <small>${escapeHtml(item.descricao || 'Recebimento parcial')}</small>
                            </div>

                            <div>
                              <span>Data</span>
                              <strong>${formatDate(item.pagamento_data)}</strong>
                            </div>

                            <div>
                              <button
                                class="btn-inline btn-inline--warning"
                                type="button"
                                data-action="estornar-parcial-cr"
                                data-id="${item.id}"
                              >
                                <i class="fa-solid fa-rotate-left"></i>
                                Estornar
                              </button>
                            </div>
                          </div>
                        `
                      )
                      .join('')
                  : `<div class="empty-detail-state">Nenhum recebimento parcial encontrado.</div>`
              }
            </div>
          </section>
        </div>

        <div class="cr-detail-footer">
          <button class="btn btn-light" type="button" id="fecharRecebimentosParciaisFooter">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document
      .getElementById('fecharRecebimentosParciais')
      ?.addEventListener('click', () => modal.remove());

    document
      .getElementById('fecharRecebimentosParciaisFooter')
      ?.addEventListener('click', () => modal.remove());

    modal.querySelectorAll("[data-action='estornar-parcial-cr']").forEach((button) => {
      button.addEventListener('click', async () => {
        await estornarRecebimentoParcial(button.dataset.id, modal);
      });
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
  } catch (error) {
    console.error('Erro ao abrir recebimentos parciais:', error);
    showMessage(buildFriendlyError(error), 'error');
  }
}

async function estornarRecebimentoParcial(lancamentoId, modal) {
  const confirmar = await confirmarAcao('Estornar este recebimento parcial? O valor voltará para o saldo da conta.', 'Estornar', 'warning');

  if (!confirmar) return;

  try {
    await api.request(`/contas-receber/estornar-parcial/${lancamentoId}`, {
      method: 'POST',
      body: { empresa_id: api.getEmpresaId() }
    });

    showMessage('Recebimento parcial estornado com sucesso.', 'success');

    modal.remove();

    await recarregar();
  } catch (error) {
    console.error('Erro ao estornar recebimento parcial:', error);
    showMessage(buildFriendlyError(error), 'error');
  }
}

function abrirModalBaixaConta(conta) {
  const modalExistente = document.getElementById('crBaixaModal');
  if (modalExistente) modalExistente.remove();

  const valorAtual = Number(conta?.valor_atualizado || conta?.valor || 0);
  const hojeISO = todayFortaleza();

  const modal = document.createElement('div');
  modal.id = 'crBaixaModal';
  modal.className = 'modal-overlay cr-detail-overlay';

  modal.innerHTML = `
    <div class="modal-card cr-detail-card">
      <div class="cr-detail-header">
        <div>
          <span class="cr-detail-eyebrow">Recebimento</span>
          <h3>Baixar conta #${escapeHtml(conta.id)}</h3>
          <p>${escapeHtml(conta.cliente_nome || 'Cliente não informado')}</p>
        </div>

        <button class="icon-button" type="button" id="fecharCrBaixa">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="cr-detail-body">
        <section class="cr-detail-summary">
          <article class="cr-detail-summary__main">
            <span>Saldo atual</span>
            <strong>${formatCurrency(valorAtual)}</strong>
            <small>Informe o valor recebido agora</small>
          </article>

          <article>
            <span>Vencimento</span>
            <strong>${formatDate(conta.data_vencimento)}</strong>
          </article>

          <article>
            <span>Status</span>
            <strong>${getStatusLabel(normalizarStatus(conta.status))}</strong>
          </article>

          <article>
            <span>Origem</span>
            <strong>${conta.venda_id ? `Venda #${escapeHtml(conta.venda_id)}` : 'Manual'}</strong>
          </article>
        </section>

        <div class="form-grid">
          <div class="form-group">
            <label>Valor recebido</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="${valorAtual}"
              id="crBaixaValor"
              class="input"
              inputmode="decimal"
              value="${valorAtual}"
            />
            <small>Para baixa parcial, informe somente o valor recebido.</small>
          </div>

          <div class="form-group">
            <label>Data do recebimento</label>
            <input
              type="date"
              id="crBaixaData"
              class="input"
              value="${hojeISO}"
            />
            <small>Formato correto: dia/mês/ano no calendário.</small>
          </div>

          <div class="form-group">
            <label>Forma de pagamento</label>
            <select id="crBaixaForma" class="input">
              <option value="">Não informado</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
              <option value="cheque">Cheque</option>
              <option value="crediario">Crediário</option>
            </select>
          </div>

          <div class="form-group form-group--full">
            <label>Observação</label>
            <textarea id="crBaixaObs" class="input" rows="2" placeholder="Observação do recebimento (opcional)" maxlength="200"></textarea>
          </div>
        </div>

        <section class="cr-detail-note">
          <span>Importante</span>
          <p>
            Se o valor recebido for menor que o saldo atual, a conta ficará como Parcial.
            Se for igual ao saldo, será marcada como Recebida.
          </p>
        </section>
      </div>

      <div class="cr-detail-footer">
        <button class="btn btn-primary" type="button" id="confirmarCrBaixa">
          <i class="fa-solid fa-check"></i>
          Confirmar recebimento
        </button>

        <button class="btn btn-light" type="button" id="cancelarCrBaixa">
          Cancelar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('fecharCrBaixa')?.addEventListener('click', () => modal.remove());
  document.getElementById('cancelarCrBaixa')?.addEventListener('click', () => modal.remove());

  document.getElementById('confirmarCrBaixa')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;

    const valorPago = document.getElementById('crBaixaValor')?.value || '';
    const dataPagamento = document.getElementById('crBaixaData')?.value || '';
    const formaPagamento = document.getElementById('crBaixaForma')?.value || '';
    const observacaoBaixa = document.getElementById('crBaixaObs')?.value?.trim() || '';

    const _numVP = Number(valorPago);
    if (!valorPago || !Number.isFinite(_numVP) || _numVP <= 0) {
      showMessage('Informe um valor recebido válido.', 'error');
      return;
    }

    if (Number(valorPago) > valorAtual) {
      showMessage('O valor recebido não pode ser maior que o saldo atual.', 'error');
      return;
    }

    if (!dataPagamento) {
      showMessage('Informe a data do recebimento.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...';
    try {
      await api.baixarContaReceber(conta.id, {
        valor_pago: Number(valorPago),
        data_pagamento: dataPagamento,
        ...(formaPagamento ? { forma_pagamento: formaPagamento } : {}),
        ...(observacaoBaixa ? { observacao: observacaoBaixa } : {})
      });

      showMessage('Recebimento registrado com sucesso.', 'success');

      modal.remove();

      await recarregar();
    } catch (error) {
      console.error('Erro ao baixar conta a receber:', error);
      showMessage(buildFriendlyError(error), 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar recebimento';
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

async function abrirDetalheConta(id) {
  try {
    const conta = await api.getContaReceberDetalhe(id);
    await renderDetalheConta(conta);
  } catch (error) {
    console.error('Erro ao abrir detalhe da conta:', error);
    const message = buildFriendlyError(error);
    showMessage(message, 'error');
  }
}

async function renderDetalheConta(conta) {
  const modalExistente = document.getElementById('crDetalheModal');
  if (modalExistente) modalExistente.remove();

  const status = normalizarStatus(conta.status);

  let recebimentosParciais = [];

  if (['parcial', 'parcial_atrasado'].includes(status)) {
    try {
      const recebimentosResponse = await api.request(
        `/contas-receber/${conta.id}/recebimentos-parciais`,
        { query: { empresa_id: api.getEmpresaId() } }
      );

      recebimentosParciais = Array.isArray(recebimentosResponse?.recebimentos)
        ? recebimentosResponse.recebimentos
        : [];
    } catch (error) {
      console.error('Erro ao carregar recebimentos parciais:', error);
    }
  }

  const modal = document.createElement('div');
  modal.id = 'crDetalheModal';
  modal.className = 'modal-overlay cr-detail-overlay';

  modal.innerHTML = `
    <div class="modal-card cr-detail-card">
      <div class="cr-detail-header">
        <div>
          <span class="cr-detail-eyebrow">Conta #${escapeHtml(conta.id || '-')}</span>
          <h3>Detalhe da conta a receber</h3>
          <p>${escapeHtml(conta.cliente_nome || 'Cliente não informado')}</p>
        </div>

        <button class="icon-button" type="button" id="fecharCrDetalhe" aria-label="Fechar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="cr-detail-body">
        <section class="cr-detail-summary">
          <article class="cr-detail-summary__main">
            <span>Valor do título</span>
            <strong>${formatCurrency(conta.valor)}</strong>
            <small>${getStatusLabel(status)}</small>
          </article>

          <article>
            <span>Vencimento</span>
            <strong>${formatDate(conta.data_vencimento)}</strong>
          </article>

          <article>
            <span>Recebimento</span>
            <strong>${formatDate(conta.data_pagamento)}</strong>
          </article>

          <article>
            <span>Parcela</span>
            <strong>${Number(conta.parcela || 1)}/${Number(conta.total_parcelas || 1)}</strong>
          </article>
        </section>

        <section class="cr-detail-section">
          <div class="cr-detail-section__header">
            <div>
              <h4>Informações financeiras</h4>
              <p>Regra: só entra no Fluxo de Caixa após baixa como recebido.</p>
            </div>
            <span class="${getStatusBadgeClass(status)}">${getStatusLabel(status)}</span>
          </div>

          <div class="cr-detail-grid">
            <div>
              <span>Origem</span>
              <strong>${conta.venda_id ? `Venda #${escapeHtml(conta.venda_id)}` : 'Manual'}</strong>
            </div>

            <div>
              <span>Forma de pagamento</span>
              <strong>${escapeHtml(conta.forma_pagamento || '-')}</strong>
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

        <section class="cr-detail-note">
          <span>Observação</span>
          <p>${escapeHtml(conta.observacao || 'Nenhuma observação registrada.')}</p>
        </section>
        ${
          recebimentosParciais.length
            ? `
      <section class="cr-detail-section">
        <div class="cr-detail-section__header">
          <div>
            <h4>Recebimentos parciais</h4>
            <p>${recebimentosParciais.length} recebimento(s) registrado(s)</p>
          </div>
        </div>

        <div class="cr-detail-list">
          ${recebimentosParciais
            .map(
              (item) => `
                <div class="cr-detail-row">
                  <div>
                    <strong>${formatCurrency(item.valor)}</strong>
                    <small>${escapeHtml(item.descricao || 'Recebimento parcial')}</small>
                  </div>

                  <div>
                    <span>Data</span>
                    <strong>${formatDate(item.pagamento_data)}</strong>
                  </div>

                  <div>
                    <button
                      class="btn-inline btn-inline--warning"
                      type="button"
                      data-action="estornar-parcial-cr"
                      data-id="${item.id}"
                    >
                      <i class="fa-solid fa-rotate-left"></i>
                      Estornar
                    </button>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      </section>
    `
            : ''
        }
      </div>

      <div class="cr-detail-footer">
        ${
          status === 'pago'
            ? `
              <button class="btn btn-warning" type="button" id="estornarCrDetalhe" data-id="${conta.id}">
                <i class="fa-solid fa-rotate-left"></i>
                Estornar baixa
              </button>
            `
            : `
              <button class="btn btn-primary" type="button" id="baixarCrDetalhe" data-id="${conta.id}">
                <i class="fa-solid fa-check"></i>
                Baixar como recebido
              </button>
            `
        }

        <button class="btn btn-light" type="button" id="fecharCrDetalheFooter">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('fecharCrDetalhe')?.addEventListener('click', () => modal.remove());
  document.getElementById('fecharCrDetalheFooter')?.addEventListener('click', () => modal.remove());

  document.getElementById('baixarCrDetalhe')?.addEventListener('click', async (event) => {
    const contaId = event.currentTarget.dataset.id;
    modal.remove();
    await baixarConta(contaId);
  });

  document.getElementById('estornarCrDetalhe')?.addEventListener('click', async (event) => {
    const contaId = event.currentTarget.dataset.id;
    modal.remove();
    await estornarConta(contaId);
  });

  modal.querySelectorAll("[data-action='estornar-parcial-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      await estornarRecebimentoParcial(button.dataset.id, modal);
    });
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

async function gerarBoleto(contaReceberID) {
  // Cria ou reutiliza o modal de boleto
  let modal = document.getElementById('boletoModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'boletoModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:500px;width:95vw">
        <div class="modal-card__header">
          <div>
            <h3><i class="fa-solid fa-barcode" style="margin-right:8px"></i>Boleto Bancário</h3>
            <p id="boletoSubtitulo" style="color:var(--text-muted);font-size:.9rem"></p>
          </div>
          <button type="button" class="icon-button" id="boletoFecharBtn">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="boletoCorpo" style="padding:20px 24px 24px"></div>
        <div class="modal-card__footer" style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">
          <button type="button" class="btn btn-light" id="boletoFecharFooter">Fechar</button>
          <button type="button" class="btn btn-primary" id="boletoAbrirLinkBtn" style="display:none">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir link
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('boletoFecharBtn')?.addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('boletoFecharFooter')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  }

  modal.classList.remove('hidden');
  const corpo   = document.getElementById('boletoCorpo');
  const sub     = document.getElementById('boletoSubtitulo');
  const linkBtn = document.getElementById('boletoAbrirLinkBtn');

  if (sub) sub.textContent = 'Gerando boleto…';
  if (corpo) corpo.innerHTML = `<div class="module-feedback module-feedback--info">Aguarde…</div>`;
  if (linkBtn) linkBtn.style.display = 'none';

  try {
    const empresa = window.LfErpApi?.getEmpresaNome?.() || '';
    const resp = await api.request('/pagamentos/boleto/gerar', {
      method: 'POST',
      body:   { conta_receber_id: contaReceberID, empresa, empresa_id: api.getEmpresaId() }
    });

    const boleto  = resp.boleto || resp;
    const sandbox = resp.sandbox || boleto.demo;

    const linha = boleto.linhaDigitavel || boleto.linha_digitavel || null;
    const url   = boleto.invoiceUrl     || boleto.boleto_url      || null;

    if (sub) sub.textContent = sandbox ? 'Modo sandbox — dados de demonstração' : 'Boleto gerado com sucesso';

    corpo.innerHTML = `
      ${sandbox ? `<div class="module-feedback module-feedback--info" style="margin-bottom:14px">
        <i class="fa-solid fa-flask"></i>
        Modo <strong>Sandbox</strong> — configure a API Key Asaas em Configurações para emitir boletos reais.
      </div>` : ''}

      ${linha ? `
        <div style="margin-bottom:14px">
          <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:4px;font-weight:600">LINHA DIGITÁVEL</div>
          <div style="
            background:var(--surface-2);
            border:1px solid var(--border);
            border-radius:10px;
            padding:12px 14px;
            font-family:monospace;
            font-size:.9rem;
            letter-spacing:.04em;
            word-break:break-all;
            cursor:pointer
          " id="boletoLinhaDigitavel" title="Clique para copiar">${escapeHtml(linha)}</div>
          <small style="color:var(--text-muted)">Clique na linha para copiar</small>
        </div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px">
          <div style="font-size:.78rem;color:var(--text-muted)">ID Boleto</div>
          <div style="font-size:.85rem;font-weight:700;word-break:break-all">${escapeHtml(String(boleto.id || '-'))}</div>
        </div>
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px">
          <div style="font-size:.78rem;color:var(--text-muted)">Status</div>
          <div style="font-size:.85rem;font-weight:700">${escapeHtml(boleto.status || 'PENDING')}</div>
        </div>
      </div>`;

    if (url && String(url).startsWith('https://')) {
      linkBtn.style.display = 'inline-flex';
      linkBtn.onclick = () => window.open(url, '_blank', 'noopener,noreferrer');
    }

    // Copia linha ao clicar
    document.getElementById('boletoLinhaDigitavel')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(linha);
        showToast('Linha digitável copiada!', 'success');
      } catch { /* fallback silencioso */ }
    });

  } catch (err) {
    if (sub) sub.textContent = 'Erro ao gerar boleto';
    if (corpo) corpo.innerHTML = `<div class="module-feedback module-feedback--error">${escapeHtml(buildFriendlyError(err))}</div>`;
  }
}

async function abrirOrigemVenda(id) {
  try {
    const origem = await api.getOrigemVendaContaReceber(id);
    renderOrigemVenda(origem);
  } catch (error) {
    console.error('Erro ao abrir origem da venda:', error);
    const message = buildFriendlyError(error);
    showMessage(message, 'error');
  }
}

function renderOrigemVenda(data) {
  const modalExistente = document.getElementById('crOrigemVendaModal');
  if (modalExistente) modalExistente.remove();

  const venda = data?.venda || {};
  const conta = data?.conta || {};
  const itens = Array.isArray(data?.itens) ? data.itens : [];
  const parcelas = Array.isArray(data?.parcelas) ? data.parcelas : [];

  const modal = document.createElement('div');
  modal.id = 'crOrigemVendaModal';
  modal.className = 'modal-overlay cr-origin-overlay';

  modal.innerHTML = `
    <div class="modal-card cr-origin-card">
      <div class="cr-detail-header">
        <div>
          <span class="cr-detail-eyebrow">Venda #${escapeHtml(venda.id || '-')}</span>
          <h3>Origem da conta a receber</h3>
          <p>${escapeHtml(venda.cliente_nome || conta.cliente_nome || 'Cliente não informado')}</p>
        </div>

        <button class="icon-button" type="button" id="fecharCrOrigem" aria-label="Fechar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="cr-detail-body">
        <section class="cr-detail-summary">
          <article class="cr-detail-summary__main">
            <span>Total da venda</span>
            <strong>${formatCurrency(venda.total)}</strong>
            <small>${formatDate(venda.data)}</small>
          </article>

          <article>
            <span>Pagamento</span>
            <strong>${escapeHtml(venda.pagamento || '-')}</strong>
          </article>

          <article>
            <span>Parcelas</span>
            <strong>${Number(venda.parcelas || 1)}x</strong>
          </article>

          <article>
            <span>Status</span>
            <strong>${escapeHtml(capitalize(venda.status_pagamento || 'pago'))}</strong>
          </article>
        </section>

        <section class="cr-detail-section">
          <div class="cr-detail-section__header">
            <div>
              <h4>Itens vendidos</h4>
              <p>Produtos que deram origem à conta</p>
            </div>
            <span>${itens.length} item(ns)</span>
          </div>

          <div class="cr-detail-list">
            ${
              itens.length
                ? itens
                    .map(
                      (item) => `
                  <div class="cr-detail-row">
                    <div>
                      <strong>${escapeHtml(item.produto_nome || 'Produto')}</strong>
                      <small>Qtd. ${Number(item.quantidade || 0)}</small>
                    </div>

                    <div>
                      <span>Preço unit.</span>
                      <strong>${formatCurrency(item.preco_unitario || 0)}</strong>
                    </div>

                    <div>
                      <span>Total</span>
                      <strong>${formatCurrency(item.total || 0)}</strong>
                    </div>
                  </div>
                `
                    )
                    .join('')
                : `<div class="empty-detail-state">Nenhum item vinculado.</div>`
            }
          </div>
        </section>

        <section class="cr-detail-section">
          <div class="cr-detail-section__header">
            <div>
              <h4>Parcelas geradas</h4>
              <p>Títulos financeiros vinculados à venda</p>
            </div>
            <span>${parcelas.length} parcela(s)</span>
          </div>

          <div class="cr-detail-list">
            ${
              parcelas.length
                ? parcelas
                    .map(
                      (parcela) => `
                  <div class="cr-detail-row">
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

      <div class="cr-detail-footer">
        <button class="btn btn-light" type="button" id="fecharCrOrigemFooter">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('fecharCrOrigem')?.addEventListener('click', () => modal.remove());
  document.getElementById('fecharCrOrigemFooter')?.addEventListener('click', () => modal.remove());

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

function renderErro(message) {
  const container = document.getElementById('contasReceberContainer');
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

  if (normalized === 'pago') return 'Recebido';
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
  if (normalized === 'parcial_atrasado') return 'badge badge--danger';

  return 'badge badge--info';
}

function getDiasAtrasoHtml(status, dataVencimento) {
  if (status !== 'atrasado' && status !== 'parcial_atrasado') return '';
  if (!dataVencimento) return '';
  const hoje = new Date(`${todayFortaleza()}T12:00:00`);
  const venc = new Date(`${String(dataVencimento).slice(0, 10)}T12:00:00`);
  if (isNaN(venc.getTime())) return '';
  const dias = Math.round((hoje.getTime() - venc.getTime()) / 86400000);
  if (dias <= 0) return '';
  return `<small class="cr-dias-atraso">${dias} dia(s)</small>`;
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

  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
}


function capitalize(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function injectContasReceberStyles() {
  if (document.getElementById('contasReceberProfessionalStyles')) return;

  const style = document.createElement('style');
  style.id = 'contasReceberProfessionalStyles';
  style.textContent = `
    .cr-toolbar-grid {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 10px;
      align-items: start;
      margin-bottom: 18px;
    }

    .cr-search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0 14px;
      background: var(--surface);
      min-height: 44px;
    }

    .cr-search-box input {
      border: none;
      outline: none;
      background: transparent;
      color: var(--text);
      font-size: 0.94rem;
      width: 100%;
    }

    .cr-search-box i {
      color: var(--text-muted);
      font-size: 0.82rem;
    }

    .cr-filter-box select {
      min-height: 44px;
      min-width: 160px;
    }

    .cr-action-box {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
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

    mark.cr-hl {
      background: rgba(234, 179, 8, 0.28);
      color: inherit;
      border-radius: 3px;
      padding: 0 1px;
    }

    .cr-dias-atraso {
      display: block;
      color: #dc2626;
      font-weight: 800;
      font-size: 11px;
      margin-top: 3px;
    }

    #crHistoricoClienteModal .cr-detail-row {
      grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr;
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .cr-explain-card {
        border-color: rgba(96, 165, 250, 0.18);
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.13), rgba(8, 145, 178, 0.1));
      }
      :root:not([data-theme="light"]) .cr-dias-atraso {
        color: #f87171;
      }
      :root:not([data-theme="light"]) mark.cr-hl {
        background: rgba(234, 179, 8, 0.38);
      }
    }

    :root[data-theme="dark"] .cr-explain-card {
      border-color: rgba(96, 165, 250, 0.18);
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.13), rgba(8, 145, 178, 0.1));
    }
    :root[data-theme="dark"] .cr-dias-atraso {
      color: #f87171;
    }
    :root[data-theme="dark"] mark.cr-hl {
      background: rgba(234, 179, 8, 0.38);
    }

    .cr-stats-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .cr-module-card {
      position: relative;
    }

    .cr-explain-card {
      border: 1px solid rgba(37, 99, 235, 0.14);
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(8, 145, 178, 0.06));
      border-radius: 18px;
      padding: 14px 16px;
      margin-bottom: 18px;
    }

    .cr-explain-card strong {
      display: block;
      color: var(--primary-hover);
      font-weight: 800;
      margin-bottom: 4px;
    }

    .cr-explain-card span {
      color: var(--text-soft);
      font-weight: 600;
      line-height: 1.45;
    }

    .cr-stat-card {
      min-width: 170px;
      position: relative;
      overflow: hidden;
    }

    .cr-stat-card small {
      color: var(--text-muted);
      font-weight: 700;
      font-size: 0.78rem;
    }

    .cr-stat-card--pendente {
      border-color: rgba(217, 119, 6, 0.2);
    }

    .cr-stat-card--atrasado {
      border-color: rgba(220, 38, 38, 0.2);
    }

    .cr-stat-card--pago {
      border-color: rgba(22, 163, 74, 0.2);
    }

    .cr-stat-card--parcial {
  border-color: rgba(8, 145, 178, 0.24);
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

    .btn-inline--warning {
      color: #d97706;
      border-color: rgba(217, 119, 6, 0.24);
    }

    .btn-inline--warning:hover {
      background: var(--warning-soft);
      color: #b45309;
    }

    .btn-inline--danger {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.22);
}

.btn-inline--danger:hover {
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}

    .btn-warning {
      background: #d97706;
      color: #ffffff;
      border-color: #d97706;
    }

    .btn-warning:hover {
      background: #b45309;
      border-color: #b45309;
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

    .cr-detail-overlay,
    .cr-origin-overlay {
      padding: 18px;
      align-items: center;
    }

    .cr-detail-card,
.cr-origin-card {
  width: min(100%, 820px);
  height: auto;
  max-height: calc(100vh - 36px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 26px;
  padding: 0;
}

    .cr-detail-header {
      padding: 20px 22px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-shrink: 0;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 32%),
        var(--surface);
    }

    .cr-detail-eyebrow {
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

    .cr-detail-header h3 {
      font-size: 1.28rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: var(--text);
      margin-bottom: 4px;
    }

    .cr-detail-header p {
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 600;
    }

    .cr-detail-body {
  padding: 18px 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}

    .cr-detail-summary {
      display: grid;
      grid-template-columns: 1.25fr repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .cr-detail-summary article,
    .cr-detail-note {
      border: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: 18px;
      padding: 14px 16px;
      min-width: 0;
    }

    .cr-detail-summary article span,
    .cr-detail-note span,
    .cr-detail-grid span {
      display: block;
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .cr-detail-summary article strong,
    .cr-detail-grid strong {
      display: block;
      color: var(--text);
      font-size: 0.98rem;
      font-weight: 800;
      line-height: 1.25;
      word-break: break-word;
    }

    .cr-detail-summary__main strong {
      font-size: 1.35rem !important;
      letter-spacing: -0.04em;
    }

    .cr-detail-summary article small {
      display: block;
      margin-top: 6px;
      color: var(--text-muted);
      font-weight: 700;
    }

    .cr-detail-note {
      padding: 12px 16px;
    }

    .cr-detail-note p {
      color: var(--text);
      font-weight: 700;
      line-height: 1.45;
    }

    .cr-detail-section {
      border: 1px solid var(--border);
      border-radius: 20px;
      background: var(--surface);
      overflow: hidden;
    }

    .cr-detail-section__header {
      padding: 13px 16px;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .cr-detail-section__header h4 {
      color: var(--text);
      font-size: 0.98rem;
      font-weight: 800;
      margin-bottom: 3px;
    }

    .cr-detail-section__header p {
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 600;
    }

    .cr-detail-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 14px 16px;
    }

    .cr-detail-grid > div {
      border: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: 16px;
      padding: 12px;
    }

    .cr-detail-list {
      display: grid;
    }

    .cr-detail-row {
      display: grid;
      grid-template-columns: 1.4fr 0.8fr 0.8fr;
      gap: 14px;
      align-items: center;
      padding: 13px 16px;
      border-bottom: 1px solid var(--border);
    }

    .cr-detail-row:last-child {
      border-bottom: none;
    }

    .cr-detail-row strong {
      color: var(--text);
      font-size: 0.92rem;
      font-weight: 800;
    }

    .cr-detail-row small,
    .cr-detail-row span {
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

    .cr-detail-footer {
  padding: 14px 22px 18px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: var(--surface);
  flex-shrink: 0;
}

    .cr-detail-card .form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;
}

.cr-detail-card .form-group {
  display: grid;
  gap: 8px;
}

.cr-detail-card .form-group--full {
  grid-column: 1 / -1;
}

.cr-detail-card .form-group label {
  color: var(--text-soft);
  font-size: 0.88rem;
  font-weight: 800;
}

.cr-detail-card .form-group small {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.35;
}

.cr-detail-card .input,
.cr-detail-card input,
.cr-detail-card select,
.cr-detail-card textarea {
  width: 100%;
  min-height: 48px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  padding: 0 14px;
  font-size: 0.95rem;
  font-weight: 700;
  outline: none;
  box-shadow: var(--shadow-xs);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.cr-detail-card textarea.input,
.cr-detail-card textarea {
  min-height: 96px;
  padding-top: 12px;
  resize: vertical;
}

.cr-detail-card .input::placeholder,
.cr-detail-card input::placeholder,
.cr-detail-card textarea::placeholder {
  color: var(--text-light);
  font-weight: 600;
}

.cr-detail-card .input:focus,
.cr-detail-card input:focus,
.cr-detail-card select:focus,
.cr-detail-card textarea:focus {
  border-color: var(--primary);
  background: var(--surface);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.cr-detail-card input[type='date'] {
  color-scheme: light;
}

.cr-detail-card input[type='date']::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.7;
}

.cr-detail-card input[type='date']::-webkit-calendar-picker-indicator:hover {
  opacity: 1;
}

    @media (max-width: 980px) {
      .cr-toolbar-grid {
        grid-template-columns: 1fr;
      }

      .cr-action-box {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }

      .cr-detail-summary,
      .cr-detail-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .cr-detail-row {
        grid-template-columns: 1fr;
        gap: 8px;
      }
    }

    @media (max-width: 560px) {
      .cr-detail-overlay,
      .cr-origin-overlay {
        padding: 10px;
        align-items: flex-start;
      }

      .cr-detail-card .form-grid {
  grid-template-columns: 1fr;
}

      .cr-detail-card,
      .cr-origin-card {
        max-height: calc(100vh - 20px);
        border-radius: 20px;
      }

      .cr-detail-summary,
      .cr-detail-grid {
        grid-template-columns: 1fr;
      }

      .cr-detail-body {
        padding: 14px;
      }

      .cr-action-box {
        grid-template-columns: 1fr;
      }
    }

    .cr-detail-card {
  height: min(92vh, 820px);
}

.cr-detail-body {
  overflow-y: auto !important;
  overflow-x: hidden;
  min-height: 0;
  flex: 1;
}

.cr-detail-section {
  overflow: visible;
}

.cr-detail-grid {
  overflow: visible;
}

.cr-detail-list {
  overflow: visible;
}

.cr-detail-row {
  min-height: auto;
}

.cr-detail-footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
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
.lf-pagination__btn:hover:not(:disabled) {
  background: var(--surface-2);
}
.lf-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.lf-pagination__info {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-muted);
}
.lf-pagination__info small {
  font-weight: 600;
  font-size: 0.8rem;
}
    .cr-alertas-venc.cp-alertas-venc {
      margin-bottom: 16px;
    }
  `;

  document.head.appendChild(style);
}

function abrirModalContaManual() {
  const modalExistente = document.getElementById('crContaManualModal');

  if (modalExistente) {
    modalExistente.remove();
  }

  const modal = document.createElement('div');

  modal.id = 'crContaManualModal';
  modal.className = 'modal-overlay cr-detail-overlay';

  modal.innerHTML = `
    <div class="modal-card cr-detail-card">
      <div class="cr-detail-header">
        <div>
          <span class="cr-detail-eyebrow">
            Conta manual
          </span>

          <h3>Nova promissória antiga</h3>

          <p>
            Cadastre contas antigas sem gerar venda ou movimentar estoque.
          </p>
        </div>

        <button
          class="icon-button"
          type="button"
          id="fecharContaManual"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="cr-detail-body">

        <div class="form-grid">

          <div class="form-group">
            <label>Cliente</label>

            <select id="crManualCliente" class="input">
              <option value="">Cliente avulso</option>

              ${state.clientes
                .map(
                  (cliente) => `
                    <option value="${cliente.id}">
                      ${escapeHtml(cliente.nome)}
                    </option>
                  `
                )
                .join('')}
            </select>
          </div>

          <div class="form-group">
            <label>Nome manual</label>

            <input
              type="text"
              id="crManualNome"
              class="input"
              placeholder="Nome do cliente"
            />
          </div>

          <div class="form-group">
            <label>Valor</label>

            <input
              type="number"
              step="0.01"
              id="crManualValor"
              class="input"
              inputmode="decimal"
              placeholder="0,00"
            />
          </div>

          <div class="form-group">
            <label>Vencimento</label>

            <input
              type="date"
              id="crManualVencimento"
              class="input"
            />
          </div>

          <div class="form-group form-group--full">
            <label>Descrição</label>

            <input
              type="text"
              id="crManualDescricao"
              class="input"
              placeholder="Ex: Promissória antiga"
            />
          </div>

          <div class="form-group form-group--full">
            <label>Observação</label>

            <textarea
              id="crManualObservacao"
              class="input"
              rows="4"
              placeholder="Observações da promissória..."
            ></textarea>
          </div>

        </div>
      </div>

      <div class="cr-detail-footer">

        <button
          class="btn btn-primary"
          type="button"
          id="salvarContaManual"
        >
          <i class="fa-solid fa-floppy-disk"></i>
          Salvar conta
        </button>

        <button
          class="btn btn-light"
          type="button"
          id="cancelarContaManual"
        >
          Cancelar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('fecharContaManual')?.addEventListener('click', () => modal.remove());

  document.getElementById('cancelarContaManual')?.addEventListener('click', () => modal.remove());

  document.getElementById('salvarContaManual')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    try {
      await salvarContaManual(modal);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });
}

async function salvarContaManual(modal) {
  try {
    const clienteId = document.getElementById('crManualCliente')?.value || '';

    const nomeManual = document.getElementById('crManualNome')?.value?.trim() || '';

    const valor = document.getElementById('crManualValor')?.value || '';

    const vencimento = document.getElementById('crManualVencimento')?.value || '';

    const descricao = document.getElementById('crManualDescricao')?.value?.trim() || '';

    const observacao = document.getElementById('crManualObservacao')?.value?.trim() || '';

    const _numValor = Number(valor);
    if (!valor || !Number.isFinite(_numValor) || _numValor <= 0) {
      showMessage('Informe um valor válido.', 'error');
      return;
    }

    if (!vencimento) {
      showMessage('Informe a data de vencimento.', 'error');
      return;
    }

    if (!clienteId && !nomeManual) {
      showMessage('Selecione um cliente ou informe o nome manual.', 'error');
      return;
    }

    await api.request('/contas-receber/manual', {
      method: 'POST',
      body: {
        empresa: api.getEmpresaNome(),
        empresa_id: api.getEmpresaId(),
        cliente_id: clienteId || null,
        cliente_nome: nomeManual,
        valor: Number(valor),
        data_vencimento: vencimento,
        descricao,
        observacao,
        forma_pagamento: 'promissoria'
      }
    });

    showMessage('Conta manual cadastrada com sucesso.', 'success');

    modal.remove();

    await recarregar();
  } catch (error) {
    console.error('Erro ao salvar conta manual:', error);

    const message = buildFriendlyError(error);

    showMessage(message, 'error');
  }
}

async function abrirHistoricoCliente(clienteId) {
  try {
    const data = await api.getHistoricoFinanceiroCliente(clienteId);

    const modalExistente = document.getElementById('crHistoricoClienteModal');
    if (modalExistente) modalExistente.remove();

    const cliente = data?.cliente || {};
    const resumo = data?.resumo || {};
    const contas = Array.isArray(data?.contas) ? data.contas : [];

    const modal = document.createElement('div');
    modal.id = 'crHistoricoClienteModal';
    modal.className = 'modal-overlay cr-detail-overlay';

    modal.innerHTML = `
      <div class="modal-card cr-detail-card">
        <div class="cr-detail-header">
          <div>
            <span class="cr-detail-eyebrow">Histórico do cliente</span>
            <h3>${escapeHtml(cliente.nome || 'Cliente')}</h3>
            <p>${escapeHtml(cliente.telefone || 'Sem telefone informado')}</p>
          </div>

          <button class="icon-button" type="button" id="fecharHistoricoCliente">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="cr-detail-body">
          <section class="cr-detail-summary">
            <article class="cr-detail-summary__main">
              <span>Saldo em aberto</span>
              <strong>${formatCurrency(Number(resumo.total_pendente || 0) + Number(resumo.total_atrasado || 0))}</strong>
              <small>${contas.length} título(s)</small>
            </article>

            <article>
              <span>Recebido parcial</span>
              <strong>${formatCurrency(resumo.total_recebido_parcial || 0)}</strong>
            </article>

            <article>
              <span>Em parcial</span>
              <strong>${formatCurrency(resumo.total_parcial || 0)}</strong>
            </article>

            <article>
              <span>Total histórico</span>
              <strong>${formatCurrency(resumo.total || 0)}</strong>
            </article>
          </section>

          <section class="cr-detail-section">
            <div class="cr-detail-section__header">
              <div>
                <h4>Últimos títulos</h4>
                <p>Contas vinculadas ao cliente</p>
              </div>
            </div>

            <div class="cr-detail-list">
              ${
                contas.length
                  ? contas
                      .slice(0, 10)
                      .map(
                        (conta) => `
                          <div class="cr-detail-row">
                            <div>
                              <strong>#${escapeHtml(conta.id)}</strong>
                              <small>${escapeHtml(conta.observacao || 'Conta a receber')}</small>
                            </div>

                            <div>
                              <span>Vencimento</span>
                              <strong>${formatDate(conta.data_vencimento)}</strong>
                            </div>

                            <div>
                              <span>Status</span>
                              <strong>${getStatusLabel(normalizarStatus(conta.status))}</strong>
                            </div>

                            <div>
                              <span>Saldo</span>
                              <strong>${formatCurrency(conta.valor || 0)}</strong>
                            </div>
                          </div>
                        `
                      )
                      .join('')
                  : `<div class="empty-detail-state">Nenhum título encontrado.</div>`
              }
            </div>
          </section>
        </div>

        <div class="cr-detail-footer">
          <button class="btn btn-light" type="button" id="fecharHistoricoClienteFooter">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document
      .getElementById('fecharHistoricoCliente')
      ?.addEventListener('click', () => modal.remove());
    document
      .getElementById('fecharHistoricoClienteFooter')
      ?.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
  } catch (error) {
    console.error('Erro ao abrir histórico do cliente:', error);
    showMessage(buildFriendlyError(error), 'error');
  }
}
