import api from './api.js';
import { showToast } from './feedback.js';
import { buildFriendlyError, escapeHtml } from './utils.js';

let _dashReqId = 0;
let lastDashboardContext = {
  filters: {},
  state: {}
};

function showMessage(message, type = 'info') {
  showToast(message, type);
}


function toCurrency(value) {
  const numericValue = Number(value) || 0;
  return numericValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function getPeriodLabel(filters = {}) {
  const labels = {
    hoje: 'Hoje',
    ontem: 'Ontem',
    '7dias': 'Últimos 7 dias',
    '30dias': 'Últimos 30 dias',
    mesAtual: 'Mês atual',
    mesAnterior: 'Mês anterior',
    personalizado: 'Personalizado'
  };

  return labels[filters.periodo] || 'Período';
}

function safeText(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeDashboardPayload(data = {}) {
  return {
    faturamento: Number(data.faturamento ?? data.total_vendas ?? 0),
    vendas: Number(data.vendas ?? data.total_vendas_qtd ?? 0),
    contasReceber: Number(data.contas_receber ?? data.a_receber ?? 0),
    contasPagar: Number(data.contas_pagar ?? data.a_pagar ?? 0),
    estoque: Number(data.estoque ?? data.total_estoque ?? 0),
    clientes: Number(data.clientes ?? data.total_clientes ?? 0),
    totalProdutos: Number(data.total_produtos ?? 0),
    totalCompras: Number(data.total_compras ?? 0),
    totalComprasValor: Number(data.total_compras_valor ?? 0),
    topProdutos: Array.isArray(data.top_produtos) ? data.top_produtos : [],
    alertas: Array.isArray(data.alertas) ? data.alertas : [],
    recomendacoes: Array.isArray(data.recomendacoes) ? data.recomendacoes : [],

    estoqueInvestido: Number(data.estoque_investido ?? 0),
    lucroPotencial: Number(data.lucro_potencial ?? 0),
    margemMedia: Number(data.margem_media ?? 0),
    produtosPromocao: Number(data.produtos_promocao ?? 0),
    produtosPrejuizo: Number(data.produtos_prejuizo ?? 0),

    classeA: Number(data.classe_a ?? 0),
    classeB: Number(data.classe_b ?? 0),
    classeC: Number(data.classe_c ?? 0),

    comparativo: data.comparativo || null
  };
}

function normalizeResumoFinanceiro(data = {}) {
  return {
    contasReceberPago: Number(data?.contas_receber?.pago || 0),
    contasReceberPendente: Number(data?.contas_receber?.pendente || 0),
    contasReceberAtrasado: Number(data?.contas_receber?.atrasado || 0),

    contasPagarPago: Number(data?.contas_pagar?.pago || 0),
    contasPagarPendente: Number(data?.contas_pagar?.pendente || 0),
    contasPagarAtrasado: Number(data?.contas_pagar?.atrasado || 0),

    receitasLancadas: Number(data?.lancamentos?.receitas || 0),
    despesasLancadas: Number(data?.lancamentos?.despesas || 0),
    receitasPagas: Number(data?.lancamentos?.receitas_pagas || 0),
    despesasPagas: Number(data?.lancamentos?.despesas_pagas || 0),

    fluxoEntradas: Number(data?.fluxo?.entradas || 0),
    fluxoSaidas: Number(data?.fluxo?.saidas || 0),
    fluxoSaldo: Number(data?.fluxo?.saldo || 0)
  };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function renderTrend(atual, anterior) {
  if (anterior === null || anterior === undefined) return '';
  if (anterior === 0) return atual > 0 ? '<span class="kpi-trend kpi-trend--new">Novo</span>' : '';
  const pct = ((atual - anterior) / anterior) * 100;
  const up = pct >= 0;
  const sinal = up ? '+' : '';
  return `<span class="kpi-trend ${up ? 'kpi-trend--up' : 'kpi-trend--down'}">
    <i class="fa-solid fa-arrow-${up ? 'trend-up' : 'trend-down'}"></i>
    ${sinal}${Math.abs(pct).toFixed(1)}% vs período anterior
  </span>`;
}

function setTrend(id, atual, anterior) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = renderTrend(atual, anterior);
}

function renderKpis(payload, financeiro, filters = {}) {
  setText('kpiFaturamento', toCurrency(financeiro.fluxoEntradas ?? payload.faturamento ?? 0));
  setText('kpiVendas', String(payload.vendas));
  setText('kpiReceber', toCurrency(financeiro.contasReceberPendente));
  setText('kpiPagar', toCurrency(financeiro.contasPagarPendente));
  setText('kpiEstoque', String(payload.estoque));
  setText('kpiClientes', String(payload.clientes));

  setText(
    'kpiFaturamentoMeta',
    financeiro.fluxoEntradas > 0
      ? `Entradas realizadas no período: ${getPeriodLabel(filters)}`
      : `Período: ${getPeriodLabel(filters)}`
  );
  setText(
    'kpiVendasInfo',
    payload.vendas > 0 ? 'Vendas reais do período' : 'Sem vendas no período'
  );
  setText(
    'kpiReceberInfo',
    financeiro.contasReceberAtrasado > 0
      ? `Atrasado: ${toCurrency(financeiro.contasReceberAtrasado)}`
      : 'Sem atrasos em contas a receber'
  );
  setText(
    'kpiPagarInfo',
    financeiro.contasPagarAtrasado > 0
      ? `Atrasado: ${toCurrency(financeiro.contasPagarAtrasado)}`
      : 'Sem atrasos em contas a pagar'
  );
  setText('kpiEstoqueInfo', `${payload.totalProdutos} produto(s) cadastrados`);
  setText('kpiClientesInfo', `${payload.clientes} cliente(s) na base`);

  // Trends vs período anterior
  if (payload.comparativo) {
    const c = payload.comparativo;
    setTrend('kpiFaturamentoTrend', financeiro.fluxoEntradas || payload.faturamento, c.faturamento);
    setTrend('kpiVendasTrend',      payload.vendas,   c.vendas);
    setTrend('kpiClientesTrend',    payload.clientes, c.clientes);
  }

  renderKpiProgress(financeiro);
  renderTicketMedio(payload, financeiro);
}

function renderResumoExecutivo(payload, financeiro, state = {}, empresaStatus = null) {
  const empresaNome =
    state?.empresa?.nome ||
    state?.user?.empresa ||
    empresaStatus?.empresa?.nome ||
    'Empresa Logada';

  const planoNome = empresaStatus?.plano?.nome || 'Não identificado';
  const assinaturaStatus = empresaStatus?.assinatura?.status || 'Não identificado';
  const diasTrial = empresaStatus?.assinatura?.dias_restantes_trial;

  const usos = empresaStatus?.uso || {};

  function usoLinha(label, uso) {
    if (!uso) return '';

    const usado = Number(uso.usado || 0);
    const limite = Number(uso.limite || 0);
    const percentual = Number(uso.percentual || 0);

    let statusClass = 'info';
    if (uso.bloqueado) statusClass = 'danger';
    else if (uso.alerta) statusClass = 'warning';

    return `
      <div class="dashboard-list__item">
        <strong>${label}</strong>
        <span class="alert-list__item ${statusClass}" style="padding:6px 10px;">
          ${limite > 0 ? `${usado} / ${limite}` : `${usado} / ilimitado`} ${limite > 0 ? `(${percentual}%)` : ''}
        </span>
      </div>
    `;
  }

  setHtml(
    'dashboardResumo',
    `
      <div class="dashboard-grid-executive">
        <div class="dashboard-list__item">
          <strong>Empresa</strong>
          <span>${safeText(empresaNome)}</span>
        </div>

        <div class="dashboard-list__item">
          <strong>Plano atual</strong>
          <span>${safeText(planoNome)}</span>
        </div>

        <div class="dashboard-list__item">
          <strong>Status da assinatura</strong>
          <span>${safeText(assinaturaStatus)}</span>
        </div>

        <div class="dashboard-list__item">
          <strong>Trial</strong>
          <span>${
            diasTrial === null || diasTrial === undefined
              ? 'Sem trial definido'
              : Number(diasTrial) < 0
                ? 'Expirado'
                : `${Number(diasTrial)} dia(s) restante(s)`
          }</span>
        </div>

        ${usoLinha('Usuários', usos.usuarios)}
        ${usoLinha('Produtos', usos.produtos)}
        ${usoLinha('Clientes', usos.clientes)}
        ${usoLinha('Fornecedores', usos.fornecedores)}
        ${usoLinha('Vendas no mês', usos.vendas_mes)}

        <div class="dashboard-list__item">
          <strong>Fluxo de entradas</strong>
          <span>${toCurrency(financeiro.fluxoEntradas)}</span>
        </div>

        <div class="dashboard-list__item">
          <strong>Fluxo de saídas</strong>
          <span>${toCurrency(financeiro.fluxoSaidas)}</span>
        </div>

        <div class="dashboard-list__item">
          <strong>Saldo do fluxo</strong>
          <span>${toCurrency(financeiro.fluxoSaldo)}</span>
        </div>

        <div class="dashboard-list__item">
  <strong>Estoque investido</strong>
  <span>${toCurrency(payload.estoqueInvestido)}</span>
</div>

<div class="dashboard-list__item">
  <strong>Lucro potencial</strong>
  <span class="${payload.lucroPotencial >= 0 ? 'text-success' : 'text-danger'}">
    ${toCurrency(payload.lucroPotencial)}
  </span>
</div>

<div class="dashboard-list__item">
  <strong>Margem média</strong>
  <span>
    ${Number(payload.margemMedia || 0).toFixed(2)}%
  </span>
</div>

<div class="dashboard-list__item">
  <strong>Produtos em promoção</strong>
  <span>${payload.produtosPromocao}</span>
</div>

<div class="dashboard-list__item">
  <strong>Produtos em prejuízo</strong>
  <span class="${payload.produtosPrejuizo > 0 ? 'text-danger' : ''}">
    ${payload.produtosPrejuizo}
  </span>
</div>

<div class="dashboard-list__item">
  <strong>Produtos Classe A</strong>
  <span class="badge badge--success">
    ${payload.classeA}
  </span>
</div>

<div class="dashboard-list__item">
  <strong>Produtos Classe B</strong>
  <span class="badge badge--warning">
    ${payload.classeB}
  </span>
</div>

<div class="dashboard-list__item">
  <strong>Produtos Classe C</strong>
  <span class="badge badge--danger">
    ${payload.classeC}
  </span>
</div>
      </div>

        <div class="dashboard-abc-card">
  <div class="dashboard-abc-card__header">
    <strong>Curva ABC</strong>
    <span>Distribuição estratégica dos produtos</span>
  </div>

  <div class="dashboard-abc-bars">
    ${(() => {
      const maxCls = Math.max(1, payload.classeA, payload.classeB, payload.classeC);
      const w = v => Math.min(100, Math.max(8, (v / maxCls) * 100)).toFixed(1);
      return `
    <div class="dashboard-abc-bar dashboard-abc-bar--a" style="width:${w(payload.classeA)}%">
      A ${payload.classeA}
    </div>

    <div class="dashboard-abc-bar dashboard-abc-bar--b" style="width:${w(payload.classeB)}%">
      B ${payload.classeB}
    </div>

    <div class="dashboard-abc-bar dashboard-abc-bar--c" style="width:${w(payload.classeC)}%">
      C ${payload.classeC}
    </div>`;
    })()}
  </div>
</div>

        <div class="dashboard-note dashboard-note--premium">
        ${
          empresaStatus?.empresa?.bloqueada
            ? `Empresa bloqueada: ${safeText(empresaStatus?.empresa?.motivo_bloqueio, 'sem motivo informado')}`
            : diasTrial !== null && diasTrial !== undefined && diasTrial <= 3
              ? 'Atenção: período de teste próximo do fim.'
              : 'Plano e limites monitorados automaticamente.'
        }
      </div>
    `
  );
}

function renderTopProdutos(payload) {
  if (!payload.topProdutos.length) {
    setHtml(
      'dashboardTopProdutos',
      `<div class="empty-state">Nenhum produto vendido encontrado no período.</div>`
    );
    return;
  }

  const maiorQuantidade = Math.max(
    ...payload.topProdutos.map((item) => Number(item.quantidade || item.qtd || 0))
  );

  setHtml(
    'dashboardTopProdutos',
    `
      <div class="top-products-premium">
        ${payload.topProdutos
          .slice(0, 5)
          .map((item, index) => {
            const quantidade = Number(item.quantidade || item.qtd || 0);

            const percentual = maiorQuantidade > 0 ? (quantidade / maiorQuantidade) * 100 : 0;

            const classe = index === 0 ? 'A' : index <= 2 ? 'B' : 'C';

            return `
              <div class="top-product-card">
                <div class="top-product-card__header">
                  <div>
                    <div class="top-product-card__title">
                      ${safeText(item.nome || item.produto, 'Produto')}
                    </div>

                    <div class="top-product-card__meta">
                      ${quantidade} venda(s)
                    </div>
                  </div>

                  <div class="badge ${
                    classe === 'A'
                      ? 'badge--success'
                      : classe === 'B'
                        ? 'badge--warning'
                        : 'badge--danger'
                  }">
                    ${classe}
                  </div>
                </div>

                <div class="top-product-progress">
                  <div
                    class="top-product-progress__fill"
                    style="width:${percentual}%"
                  ></div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `
  );
}

function buildAlertas(payload, financeiro) {
  const alertas = [];

  if (Array.isArray(payload.recomendacoes) && payload.recomendacoes.length) {
    alertas.push(...payload.recomendacoes);
  }

  if (financeiro.contasReceberAtrasado > 0) {
    alertas.push({
      tipo: 'danger',
      texto: `Contas a receber atrasadas: ${toCurrency(financeiro.contasReceberAtrasado)}`
    });
  }

  if (financeiro.contasPagarAtrasado > 0) {
    alertas.push({
      tipo: 'warning',
      texto: `Contas a pagar atrasadas: ${toCurrency(financeiro.contasPagarAtrasado)}`
    });
  }

  if (financeiro.fluxoSaldo < 0) {
    alertas.push({
      tipo: 'danger',
      texto: `Fluxo de caixa negativo no período: ${toCurrency(financeiro.fluxoSaldo)}`
    });
  }

  if (payload.estoque <= 0) {
    alertas.push({
      tipo: 'warning',
      texto: 'Estoque zerado ou não informado no período.'
    });
  }

  if (payload.vendas <= 0) {
    alertas.push({
      tipo: 'info',
      texto: 'Nenhuma venda registrada no período aplicado.'
    });
  }

  if (payload.produtosPrejuizo > 0) {
    alertas.push({
      tipo: 'danger',
      texto: `${payload.produtosPrejuizo} produto(s) operando com prejuízo`
    });
  }

  if (payload.produtosPromocao > 0) {
    alertas.push({
      tipo: 'info',
      texto: `${payload.produtosPromocao} produto(s) em promoção ativa`
    });
  }

  if (payload.classeC > payload.classeA && payload.totalProdutos > 0) {
    alertas.push({
      tipo: 'warning',
      texto: 'Quantidade elevada de produtos Classe C'
    });
  }

  if (payload.margemMedia < 15 && payload.totalProdutos > 0) {
    alertas.push({
      tipo: 'warning',
      texto: `Margem média baixa: ${Number(payload.margemMedia).toFixed(2)}%`
    });
  }

  if (!alertas.length && payload.alertas.length) {
    return payload.alertas;
  }

  if (!alertas.length) {
    alertas.push({
      tipo: 'info',
      texto: 'Nenhum alerta crítico encontrado no período.'
    });
  }

  return alertas;
}

function normalizeAlertType(type) {
  if (type === 'warning' || type === 'danger' || type === 'info') return type;
  return 'info';
}

function renderAlertas(payload, financeiro) {
  const alertas = buildAlertas(payload, financeiro);

  setHtml(
    'dashboardAlertas',
    `
      <div class="alert-list">
        ${alertas
          .slice(0, 5)
          .map(
            (alerta) => `
              <div class="alert-list__item ${normalizeAlertType(alerta.tipo)}">
                ${safeText(alerta.texto || alerta.mensagem, 'Alerta')}
              </div>
            `
          )
          .join('')}
      </div>
    `
  );
}

function renderTabelaPrecos(data) {
  const el = document.getElementById('dashboardTabelaPrecos');
  if (!el) return;

  if (!data || !data.total_tabelas) {
    el.innerHTML = `<div class="alert-list__item info">Nenhuma tabela de preço ativa. Configure em Clientes para aplicar preços diferenciados.</div>`;
    return;
  }

  const tabelas = data.tabelas || [];

  el.innerHTML = `
    <div class="dashboard-list">
      <div class="dashboard-list__item">
        <strong>Tabelas ativas</strong>
        <span class="badge badge--info">${data.total_tabelas}</span>
      </div>
      <div class="dashboard-list__item">
        <strong>Clientes com preço especial</strong>
        <span class="badge badge--success">${data.total_clientes}</span>
      </div>
    </div>
    ${tabelas.length ? `
      <div style="margin-top:14px;display:grid;gap:8px">
        ${tabelas.map((t) => {
          let regra = 'Preços fixos por produto';
          if (t.tipo === 'percentual') {
            if (t.desconto_percentual > 0) regra = `Desconto de ${t.desconto_percentual}%`;
            else if (t.markup_percentual > 0) regra = `Markup de +${t.markup_percentual}%`;
            else regra = 'Sem regra percentual geral';
          }
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:12px;background:var(--surface-2)">
              <div>
                <strong style="font-size:13px;display:block">${safeText(t.nome)}</strong>
                <small style="color:var(--text-muted)">${regra}</small>
              </div>
              <span class="badge ${t.total_clientes > 0 ? 'badge--success' : ''}" style="font-size:11px;white-space:nowrap">
                ${t.total_clientes} cliente(s)
              </span>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}
  `;
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function makeSvgSparkline(values, width = 72, height = 32) {
  if (!values || values.length < 2) return '';
  const nums = values.map(v => Number(v) || 0);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const pad = 3;

  const pts = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * width;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const isUp = nums[nums.length - 1] >= nums[0];
  const color = isUp ? 'var(--success)' : 'var(--danger)';
  const lastX = width;
  const lastY = height - pad - ((nums[nums.length - 1] - min) / range) * (height - pad * 2);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
    <polyline points="${pts}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.5" fill="${color}"/>
  </svg>`;
}

function renderSparklineKpi(vendasPorDia = []) {
  const el = document.getElementById('kpiFaturamentoSparkline');
  if (!el || !vendasPorDia.length) return;
  el.innerHTML = makeSvgSparkline(vendasPorDia.map(d => d.total));
}

function renderKpiProgress(financeiro) {
  function setProgress(elId, pago, total) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (total <= 0) { el.innerHTML = ''; return; }
    const pct = Math.min(100, (pago / total) * 100);
    const cls = pct >= 80 ? 'success' : pct >= 40 ? 'warning' : 'danger';
    el.innerHTML = `<div class="kpi-progress__fill kpi-progress__fill--${cls}" style="width:${pct.toFixed(1)}%" title="${pct.toFixed(0)}% liquidado"></div>`;
  }

  const crTotal = financeiro.contasReceberPago + financeiro.contasReceberPendente + financeiro.contasReceberAtrasado;
  const cpTotal = financeiro.contasPagarPago + financeiro.contasPagarPendente + financeiro.contasPagarAtrasado;
  setProgress('kpiReceberProgress', financeiro.contasReceberPago, crTotal);
  setProgress('kpiPagarProgress', financeiro.contasPagarPago, cpTotal);
}

function renderTicketMedio(payload, financeiro) {
  const el = document.getElementById('kpiTicketMedio');
  if (!el) return;
  if (payload.vendas <= 0) { el.innerHTML = ''; return; }
  const faturamento = financeiro.fluxoEntradas || payload.faturamento;
  const ticket = faturamento / payload.vendas;
  el.innerHTML = `Ticket médio: <strong>${toCurrency(ticket)}</strong>`;
}

// ─── GRÁFICOS (Chart.js) ──────────────────────────────────────────────────────

let _chartVendas = null;
let _chartForma = null;

const CHART_COLORS = {
  primary:    '#2563eb',
  primaryFill:'rgba(37,99,235,0.12)',
  success:    '#16a34a',
  warning:    '#d97706',
  danger:     '#dc2626',
  info:       '#0891b2',
  purple:     '#7c3aed',
  pink:       '#db2777',
  palette: ['#2563eb','#16a34a','#d97706','#dc2626','#0891b2','#7c3aed','#db2777','#64748b']
};

function _showChartPlaceholder(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.style.display = 'none';
  const existing = canvas.parentElement?.querySelector('.chart-placeholder');
  if (existing) { existing.textContent = message; return; }
  const ph = document.createElement('div');
  ph.className = 'chart-placeholder empty-state';
  ph.style.cssText = 'height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)';
  ph.textContent = message;
  canvas.parentElement?.appendChild(ph);
}

function _clearChartPlaceholder(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.style.display = '';
  canvas.parentElement?.querySelector('.chart-placeholder')?.remove();
}

function destroyCharts() {
  if (_chartVendas) { _chartVendas.destroy(); _chartVendas = null; }
  if (_chartForma)  { _chartForma.destroy();  _chartForma  = null; }
  _clearChartPlaceholder('chartVendasDia');
  _clearChartPlaceholder('chartFormaPagamento');
}

function formatDia(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza'
  });
}

function renderChartVendas(vendasPorDia = []) {
  const canvas = document.getElementById('chartVendasDia');
  if (!canvas || typeof Chart === 'undefined') return;
  if (!vendasPorDia.length) return;

  const labels = vendasPorDia.map((r) => formatDia(r.data));
  const totais  = vendasPorDia.map((r) => r.total);

  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(203,213,225,0.35)';
  const tickColor  = isDark ? '#64748b' : '#64748b';

  if (_chartVendas) { _chartVendas.destroy(); _chartVendas = null; }

  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, isDark ? 'rgba(59,130,246,0.28)' : 'rgba(37,99,235,0.22)');
  gradient.addColorStop(1, 'rgba(37,99,235,0)');

  _chartVendas = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Faturamento (R$)',
        data: totais,
        borderColor: CHART_COLORS.primary,
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: CHART_COLORS.primary,
        pointRadius: labels.length <= 14 ? 4 : 2,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ' ' + toCurrency(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 }, maxRotation: 0 }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR')
          },
          beginAtZero: true
        }
      }
    }
  });
}

function renderChartFormaPagamento(formasPagamento = []) {
  const canvas = document.getElementById('chartFormaPagamento');
  const legendaEl = document.getElementById('chartFormaPagamentoLegenda');
  if (!canvas || typeof Chart === 'undefined') return;

  if (!formasPagamento.length) {
    _showChartPlaceholder('chartFormaPagamento', 'Sem dados de pagamento no período.');
    return;
  }

  const labels = formasPagamento.map((r) => r.forma);
  const totais  = formasPagamento.map((r) => r.total);
  const cores   = formasPagamento.map((_, i) => CHART_COLORS.palette[i % CHART_COLORS.palette.length]);

  if (_chartForma) { _chartForma.destroy(); _chartForma = null; }
  _chartForma = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: totais,
        backgroundColor: cores,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${toCurrency(ctx.raw)}`
          }
        }
      }
    }
  });

  if (legendaEl) {
    const totalGeral = totais.reduce((a, b) => a + b, 0);
    legendaEl.innerHTML = formasPagamento.map((r, i) => {
      const pct = totalGeral > 0 ? ((r.total / totalGeral) * 100).toFixed(1) : '0.0';
      return `
        <div class="chart-legend__item">
          <span class="chart-legend__dot" style="background:${cores[i]}"></span>
          <span class="chart-legend__label">${escapeHtml(r.forma)}</span>
          <span class="chart-legend__value">${pct}%</span>
        </div>`;
    }).join('');
  }
}

function _setChartSkeletons(visible) {
  ['chartVendasSkeleton', 'chartFormaSkeleton'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  });
}

let _graficosReqId = 0;

async function renderGraficos(params = {}) {
  const reqId = ++_graficosReqId;
  destroyCharts();
  _setChartSkeletons(true);
  try {
    const data = await api.getDashboardGrafico(params);
    if (reqId !== _graficosReqId) return;
    _setChartSkeletons(false);
    renderChartVendas(data?.vendas_por_dia || []);
    renderChartFormaPagamento(data?.forma_pagamento || []);
    renderSparklineKpi(data?.vendas_por_dia || []);
  } catch (_) {
    if (reqId !== _graficosReqId) return;
    _setChartSkeletons(false);
    ['chartVendasDia','chartFormaPagamento'].forEach((id) => {
      _showChartPlaceholder(id, 'Gráfico indisponível');
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function skeletonRows(n, cols = [2, 1, 1]) {
  return `<div style="padding:4px 0">${Array.from({ length: n }, () => `
    <div class="skeleton-row">
      ${cols.map((flex, i) => `
        <span class="skeleton ${i === cols.length - 1 ? 'skeleton-badge' : 'skeleton-text'}"
              style="flex:${flex}${i === cols.length - 1 ? '' : ''}"></span>`
      ).join('')}
    </div>`).join('')}</div>`;
}

function renderDashboardSkeleton() {
  // KPI cards — shimmer nos valores e subtítulos
  [
    ['kpiFaturamento', 'kpiFaturamentoMeta'],
    ['kpiVendas',      'kpiVendasInfo'],
    ['kpiReceber',     'kpiReceberInfo'],
    ['kpiPagar',       'kpiPagarInfo'],
    ['kpiEstoque',     'kpiEstoqueInfo'],
    ['kpiClientes',    'kpiClientesInfo']
  ].forEach(([valId, infoId]) => {
    const valEl  = document.getElementById(valId);
    const infoEl = document.getElementById(infoId);
    if (valEl)  valEl.innerHTML  = '<span class="skeleton skeleton-value" style="display:inline-block;width:80%;margin-top:2px"></span>';
    if (infoEl) infoEl.innerHTML = '<span class="skeleton skeleton-text"  style="display:inline-block;width:65%;margin-top:4px"></span>';
  });

  // Limpar trends
  ['kpiFaturamentoTrend','kpiVendasTrend','kpiClientesTrend'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // Limpar sparkline e ticket médio
  const sparkEl = document.getElementById('kpiFaturamentoSparkline');
  if (sparkEl) sparkEl.innerHTML = '';
  const ticketEl = document.getElementById('kpiTicketMedio');
  if (ticketEl) ticketEl.innerHTML = '<span class="skeleton skeleton-text" style="display:inline-block;width:70%"></span>';

  // Progress bars — estado inicial de carregamento
  ['kpiReceberProgress', 'kpiPagarProgress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="kpi-progress__fill kpi-progress__fill--warning" style="width:35%;transition:none"></div>';
  });

  // Panels — mostrar rows de skeleton
  setHtml('dashboardResumo',       skeletonRows(6, [2, 1]));
  setHtml('dashboardTopProdutos',  skeletonRows(5, [3, 1]));
  setHtml('dashboardAlertas',      skeletonRows(4, [4]));
  setHtml('dashboardTabelaPrecos', skeletonRows(3, [2, 1]));

  // Chart containers — mostrar skeleton overlay
  _setChartSkeletons(true);
}

// ─────────────────────────────────────────────────────────────────────────────

function renderErrorState(message = 'Não foi possível carregar o dashboard.') {
  destroyCharts();
  setText('kpiFaturamento', 'R$ 0,00');
  setText('kpiVendas', '0');
  setText('kpiReceber', 'R$ 0,00');
  setText('kpiPagar', 'R$ 0,00');
  setText('kpiEstoque', '0');
  setText('kpiClientes', '0');

  setText('kpiFaturamentoMeta', 'Sem dados');
  setText('kpiVendasInfo', 'Sem dados');
  setText('kpiReceberInfo', 'Sem dados');
  setText('kpiPagarInfo', 'Sem dados');
  setText('kpiEstoqueInfo', 'Sem dados');
  setText('kpiClientesInfo', 'Sem dados');

  setHtml('dashboardResumo', `<div class="empty-state">${message}</div>`);
  setHtml('dashboardTopProdutos', `<div class="empty-state">Sem ranking disponível.</div>`);
  setHtml('dashboardAlertas', `<div class="empty-state">Sem alertas disponíveis.</div>`);
  setHtml('dashboardTabelaPrecos', `<div class="empty-state">Sem dados disponíveis.</div>`);
}

// ─── Dashboard Customization ─────────────────────────────────────────────────

const DASHBOARD_WIDGETS = [
  { id: 'kpi-faturamento',       label: 'KPI: Faturamento',            group: 'KPIs',     defaultOn: true },
  { id: 'kpi-vendas',            label: 'KPI: Vendas',                 group: 'KPIs',     defaultOn: true },
  { id: 'kpi-receber',           label: 'KPI: A Receber',              group: 'KPIs',     defaultOn: true },
  { id: 'kpi-pagar',             label: 'KPI: A Pagar',                group: 'KPIs',     defaultOn: true },
  { id: 'kpi-estoque',           label: 'KPI: Estoque',                group: 'KPIs',     defaultOn: true },
  { id: 'kpi-clientes',          label: 'KPI: Clientes',               group: 'KPIs',     defaultOn: true },
  { id: 'panel-resumo',          label: 'Resumo de performance',       group: 'Painéis',  defaultOn: true },
  { id: 'panel-top-produtos',    label: 'Top produtos',                group: 'Painéis',  defaultOn: true },
  { id: 'panel-alertas',         label: 'Alertas financeiros',         group: 'Painéis',  defaultOn: true },
  { id: 'panel-tabela-precos',   label: 'Tabelas de Preço',            group: 'Painéis',  defaultOn: true },
  { id: 'chart-vendas',          label: 'Gráfico: Faturamento por dia',group: 'Gráficos', defaultOn: true },
  { id: 'chart-forma-pagamento', label: 'Gráfico: Formas de pagamento',group: 'Gráficos', defaultOn: true },
];

const DASH_CONFIG_KEY = 'lf_dashboard_config';

function getDashboardConfig() {
  try {
    const raw = localStorage.getItem(DASH_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDashboardConfig(config) {
  try {
    localStorage.setItem(DASH_CONFIG_KEY, JSON.stringify(config));
  } catch { /* silencioso */ }
}

function applyDashboardConfig(config) {
  DASHBOARD_WIDGETS.forEach(({ id, defaultOn }) => {
    const isOn = config ? (config[id] ?? defaultOn) : defaultOn;
    const el = document.querySelector(`[data-widget="${id}"]`);
    if (el) el.style.display = isOn ? '' : 'none';
  });
}

export function openDashboardConfig() {
  const overlay = document.getElementById('dashboardConfigOverlay');
  const body = document.getElementById('dashboardConfigBody');
  if (!overlay || !body) return;

  const config = getDashboardConfig() || {};
  const groups = [...new Set(DASHBOARD_WIDGETS.map(w => w.group))];

  body.innerHTML = groups.map(group => {
    const widgets = DASHBOARD_WIDGETS.filter(w => w.group === group);
    return `
      <div class="dash-config-group-label">${group}</div>
      ${widgets.map(w => {
        const isOn = config[w.id] ?? w.defaultOn;
        return `
          <div class="dash-config-item">
            <span style="font-size:0.9rem;color:var(--text)">${w.label}</span>
            <label class="dash-toggle">
              <input type="checkbox" data-widget-id="${w.id}"${isOn ? ' checked' : ''}>
              <span class="dash-toggle__track"></span>
            </label>
          </div>`;
      }).join('')}`;
  }).join('');

  overlay.classList.remove('hidden');
}

let _dashConfigBound = false;

export function bindDashboardConfig() {
  if (_dashConfigBound) return;
  _dashConfigBound = true;

  const overlay = document.getElementById('dashboardConfigOverlay');

  document.getElementById('dashboardConfigBtn')?.addEventListener('click', openDashboardConfig);

  document.getElementById('dashboardConfigClose')?.addEventListener('click', () => {
    overlay?.classList.add('hidden');
  });

  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  document.getElementById('dashboardConfigReset')?.addEventListener('click', () => {
    document.querySelectorAll('#dashboardConfigBody input[data-widget-id]').forEach(cb => {
      const w = DASHBOARD_WIDGETS.find(x => x.id === cb.dataset.widgetId);
      if (w) cb.checked = w.defaultOn;
    });
  });

  document.getElementById('dashboardConfigSave')?.addEventListener('click', () => {
    const newConfig = {};
    document.querySelectorAll('#dashboardConfigBody input[data-widget-id]').forEach(cb => {
      newConfig[cb.dataset.widgetId] = cb.checked;
    });
    saveDashboardConfig(newConfig);
    applyDashboardConfig(newConfig);
    overlay?.classList.add('hidden');
    showMessage('Configuração do dashboard salva.', 'success');
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export async function loadDashboard({ filters = {}, state = {} } = {}) {
  const reqId = ++_dashReqId;
  try {
    lastDashboardContext = {
      filters: { ...filters },
      state: { ...state }
    };

    renderDashboardSkeleton();

    const params = {
      empresa_id: api.getEmpresaId(),
      data_inicial: filters.dataInicial || '',
      data_final: filters.dataFinal || '',
      busca: filters.busca || ''
    };

    const isFuncionario = api.getUserTipo() === 'funcionario';
    const [rawDashboard, rawResumoFinanceiro, rawEmpresaStatus, rawAlertas, rawTabelaPrecos] = await Promise.all([
      api.getDashboard(params).catch(() => ({})),
      isFuncionario ? Promise.resolve({}) : api.getRelatorioFinanceiroResumo(params).catch(() => ({})),
      api.getEmpresaStatus().catch(() => null),
      isFuncionario ? Promise.resolve({ alertas: [] }) : api.getAlertas().catch(() => ({ alertas: [] })),
      isFuncionario ? Promise.resolve(null) : api.getTabelaPrecosDashboard().catch(() => null)
    ]);

    if (reqId !== _dashReqId) return;

    const payload = normalizeDashboardPayload(rawDashboard);
    const financeiro = normalizeResumoFinanceiro(rawResumoFinanceiro);

    if (rawAlertas?.alertas?.length) {
      payload.alertas = rawAlertas.alertas.map(a => ({
        tipo: a.nivel || 'warning',
        texto: a.titulo
      }));
    }

    const badge = document.getElementById('alertasBadge');
    const totalAlertas = rawAlertas?.total || 0;
    if (badge) {
      if (totalAlertas > 0) {
        badge.textContent = totalAlertas;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    bindDashboardConfig();

    renderKpis(payload, financeiro, filters);
    renderResumoExecutivo(payload, financeiro, state, rawEmpresaStatus);
    renderTopProdutos(payload);
    renderAlertas(payload, financeiro);
    renderTabelaPrecos(rawTabelaPrecos);
    renderGraficos(params);

    applyDashboardConfig(getDashboardConfig());

    const tsEl = document.getElementById('dashUltimaAtualizacao');
    if (tsEl) {
      const agora = new Date();
      tsEl.textContent = `Atualizado às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' })}`;
    }

    return {
      dashboard: payload,
      financeiro,
      empresaStatus: rawEmpresaStatus
    };
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);

    const message = buildFriendlyError(error);

    renderErrorState(message);
    showMessage(message, 'error');

    return null;
  }
}

export function resetDashboard(message) {
  renderErrorState(message);
}

const dashboard = {
  loadDashboard,
  resetDashboard,
  openDashboardConfig,
  bindDashboardConfig
};

window.LfErpDashboard = dashboard;

export default dashboard;

window.refreshDashboard = async function () {
  try {
    showMessage('Atualizando dashboard...', 'info');

    if (typeof loadDashboard === 'function') {
      await loadDashboard(lastDashboardContext);
    }
  } catch (error) {
    console.error('Erro ao atualizar dashboard:', error);

    const message = buildFriendlyError(error);
    showMessage(message, 'error');
  }
};
