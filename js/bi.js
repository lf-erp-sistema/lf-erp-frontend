/**
 * BI Simplificado — C4.5
 * Relatórios executivos com gráficos avançados usando Chart.js
 */

import api from './api.js';
import { showToast } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

const CHARTS = {};

const esc = escapeHtml;

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtN(v, dec = 0) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function sinal(v) {
  if (v > 0) return `<span style="color:#22c55e">▲ ${fmtN(v,1)}%</span>`;
  if (v < 0) return `<span style="color:#ef4444">▼ ${fmtN(Math.abs(v),1)}%</span>`;
  return `<span style="color:#94a3b8">— 0%</span>`;
}

function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

function injectBiStyles() {
  if (document.getElementById('biStyles')) return;
  const s = document.createElement('style');
  s.id = 'biStyles';
  s.textContent = `
    .bi-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 32px 20px;
      text-align: center;
      color: var(--text-muted, #94a3b8);
      font-size: 13px;
    }
    .bi-empty i { font-size: 1.8rem; opacity: .2; margin-bottom: 4px; }
  `;
  document.head.appendChild(s);
}

// ── Paleta de cores ──────────────────────────────────────────────────────────

const CORES = ['#6366f1','#22c55e','#f59e0b','#ef4444','#14b8a6','#8b5cf6','#f97316','#ec4899','#06b6d4','#84cc16'];

let _carregando = false;

// ── Render principal ─────────────────────────────────────────────────────────

export async function initBiModule() {
  injectBiStyles();
  const container = document.getElementById('biContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="bi-wrap">
      <div id="biFeedback" class="module-feedback" style="margin-bottom:12px"></div>
      <div class="bi-toolbar">
        <label class="bi-toolbar__label">Período:</label>
        <select id="biPeriodo" class="filter-input">
          <option value="mes_atual">Mês atual</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="custom">Personalizado</option>
        </select>
        <span id="biCustomDates" style="display:none;gap:8px;align-items:center">
          <input type="date" id="biInicio" class="filter-input">
          <span class="bi-toolbar__label">até</span>
          <input type="date" id="biFim" class="filter-input">
        </span>
        <select id="biMeses" class="filter-input" title="Meses de tendência">
          <option value="6">6 meses</option>
          <option value="12" selected>12 meses</option>
          <option value="24">24 meses</option>
        </select>
        <button id="biAtualizar" class="btn btn-primary btn-sm"><i class="fa-solid fa-rotate-right"></i> Atualizar</button>
      </div>
      <div class="bi-card bi-ai-card">
        <div class="bi-ai-header">
          <span class="bi-ai-icon">✨</span>
          <span class="bi-ai-title">Análise Executiva IA</span>
          <button id="biGerarIA" class="bi-btn-ia">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Gerar análise
          </button>
        </div>
        <div id="biInsightsBody" class="bi-ai-body">
          <div class="bi-ai-empty">Clique em "Gerar análise" para obter um diagnóstico inteligente do seu negócio.</div>
        </div>
      </div>
      <div id="biKpis" class="bi-kpis">
        <div class="bi-kpi"><div class="bi-kpi__label">Receita do mês</div><div class="bi-kpi__value">—</div></div>
        <div class="bi-kpi"><div class="bi-kpi__label">Nº de vendas</div><div class="bi-kpi__value">—</div></div>
        <div class="bi-kpi"><div class="bi-kpi__label">Ticket médio</div><div class="bi-kpi__value">—</div></div>
        <div class="bi-kpi"><div class="bi-kpi__label">Clientes únicos</div><div class="bi-kpi__value">—</div></div>
      </div>
      <div class="bi-grid bi-grid--3">
        <div class="bi-card bi-card--full">
          <div class="bi-card__title">Tendência de vendas</div>
          <div class="bi-chart-box bi-chart-box--tall"><canvas id="biChartTendencia"></canvas></div>
        </div>
        <div class="bi-card">
          <div class="bi-card__title">Mix de pagamentos</div>
          <div class="bi-chart-box"><canvas id="biChartPagamentos"></canvas></div>
        </div>
        <div class="bi-card">
          <div class="bi-card__title">Margem por categoria</div>
          <div class="bi-chart-box"><canvas id="biChartCategorias"></canvas></div>
        </div>
        <div class="bi-card">
          <div class="bi-card__title">Funil de conversão</div>
          <div id="biFunil" style="padding:8px 0"></div>
        </div>
        <div class="bi-card">
          <div class="bi-card__title">Top 10 produtos</div>
          <div style="overflow-y:auto;max-height:260px"><table class="bi-table" id="biTabelaProdutos">
            <thead><tr><th>#</th><th>Produto</th><th>Receita</th><th>Margem</th></tr></thead>
            <tbody></tbody>
          </table></div>
        </div>
        <div class="bi-card">
          <div class="bi-card__title">Top 10 clientes</div>
          <div style="overflow-y:auto;max-height:260px"><table class="bi-table" id="biTabelaClientes">
            <thead><tr><th>#</th><th>Cliente</th><th>Total gasto</th><th>Ticket médio</th></tr></thead>
            <tbody></tbody>
          </table></div>
        </div>
      </div>
    </div>
  `;

  bindBiEvents();
  await carregarBI();
}

function bindBiEvents() {
  document.getElementById('biPeriodo')?.addEventListener('change', e => {
    const custom = document.getElementById('biCustomDates');
    if (custom) custom.style.display = e.target.value === 'custom' ? 'flex' : 'none';
  });
  document.getElementById('biAtualizar')?.addEventListener('click', () => carregarBI());
  document.getElementById('biGerarIA')?.addEventListener('click', () => carregarInsightsIA());
}

function getFiltros() {
  const periodo = document.getElementById('biPeriodo')?.value || 'mes_atual';
  const meses   = Number(document.getElementById('biMeses')?.value || 12);
  const hoje    = new Date();
  let inicio, fim;

  if (periodo === 'custom') {
    inicio = document.getElementById('biInicio')?.value;
    fim    = document.getElementById('biFim')?.value;
  } else if (periodo === '30d') {
    const fmtFtz = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(d);
    fim    = fmtFtz(hoje);
    const d = new Date(hoje); d.setDate(d.getDate()-30);
    inicio = fmtFtz(d);
  } else if (periodo === '90d') {
    const fmtFtz = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(d);
    fim    = fmtFtz(hoje);
    const d = new Date(hoje); d.setDate(d.getDate()-90);
    inicio = fmtFtz(d);
  } else {
    // mes_atual
    const fmtFtz = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(d);
    const hojeStr = fmtFtz(hoje);
    inicio = `${hojeStr.slice(0,7)}-01`;
    fim    = hojeStr;
  }

  return { inicio, fim, meses };
}

async function carregarBI() {
  if (_carregando) return;
  _carregando = true;
  const { inicio, fim, meses } = getFiltros();
  const q = (inicio && fim) ? `?inicio=${inicio}&fim=${fim}` : '';
  const btn = document.getElementById('biAtualizar');
  const fb  = document.getElementById('biFeedback');
  if (fb) { fb.className = 'module-feedback'; fb.textContent = ''; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Carregando...'; }
  document.querySelectorAll('#biKpis .bi-kpi').forEach(el => {
    el.innerHTML = '<div class="skeleton-line" style="height:14px;width:55%;border-radius:4px;margin-bottom:8px"></div><div class="skeleton-line" style="height:26px;width:75%;border-radius:4px"></div>';
  });

  try {
    const [comp, tendencia, topProd, topCli, mixPag, margemCat, funil] = await Promise.allSettled([
      api.get(`/bi/comparativo${q}`),
      api.get(`/bi/tendencia-vendas?meses=${meses}`),
      api.get(`/bi/top-produtos${q}&limit=10`),
      api.get(`/bi/top-clientes${q}&limit=10`),
      api.get(`/bi/mix-pagamentos${q}`),
      api.get(`/bi/margem-categorias${q}`),
      api.get(`/bi/funil${q}`)
    ]);

    if (comp.status === 'fulfilled' && comp.value?.sucesso) renderKpis(comp.value);
    if (tendencia.status === 'fulfilled' && tendencia.value?.sucesso) renderTendencia(tendencia.value.dados);
    if (mixPag.status === 'fulfilled' && mixPag.value?.sucesso) renderMixPagamentos(mixPag.value.metodos);
    if (margemCat.status === 'fulfilled' && margemCat.value?.sucesso) renderMargemCategorias(margemCat.value.categorias);
    if (funil.status === 'fulfilled' && funil.value?.sucesso) renderFunil(funil.value.etapas);
    if (topProd.status === 'fulfilled' && topProd.value?.sucesso) renderTopProdutos(topProd.value.produtos);
    if (topCli.status === 'fulfilled' && topCli.value?.sucesso) renderTopClientes(topCli.value.clientes);
  } catch (err) {
    const msg = buildFriendlyError(err);
    if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = msg; }
    showToast(msg, 'error');
  } finally {
    _carregando = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Atualizar'; }
  }
}

// ── Renders ──────────────────────────────────────────────────────────────────

function renderKpis(data) {
  const atual = data.atual || {};
  const varVsAnt = data.variacoes?.vs_anterior || {};
  const ticket = atual.qtd_vendas > 0 ? atual.receita / atual.qtd_vendas : 0;

  const kpis = document.querySelectorAll('#biKpis .bi-kpi');
  if (!kpis.length) return;

  const dados = [
    { label:'Receita do mês',   value: fmt(atual.receita),        delta: sinal(varVsAnt.receita) },
    { label:'Nº de vendas',     value: fmtN(atual.qtd_vendas),    delta: sinal(varVsAnt.vendas) },
    { label:'Ticket médio',     value: fmt(ticket),               delta: '' },
    { label:'Clientes únicos',  value: fmtN(atual.clientes_unicos), delta: '' }
  ];

  kpis.forEach((el, i) => {
    if (!dados[i]) return;
    el.innerHTML = `
      <div class="bi-kpi__label">${esc(dados[i].label)}</div>
      <div class="bi-kpi__value">${dados[i].value}</div>
      ${dados[i].delta ? `<div class="bi-kpi__delta">${dados[i].delta} vs mês anterior</div>` : ''}
    `;
  });
}

function renderTendencia(dados) {
  destroyChart('tendencia');
  const ctx = document.getElementById('biChartTendencia');
  if (!ctx) return;
  if (!dados?.length) {
    const box = ctx.parentElement;
    if (box) box.innerHTML = `<div class="bi-empty"><i class="fa-solid fa-chart-line"></i>Sem dados de tendência no período</div>`;
    return;
  }

  const labels = dados.map(d => {
    const [y, m] = d.mes.split('-');
    return `${m}/${y}`;
  });

  CHARTS.tendencia = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Receita',
          data: dados.map(d => d.receita),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,.1)',
          fill: true,
          tension: .35,
          pointRadius: 3
        },
        {
          label: 'Margem',
          data: dados.map(d => d.margem),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,.08)',
          fill: true,
          tension: .35,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position:'top' }, tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } },
      scales: { y: { ticks: { callback: v => fmt(v) } } }
    }
  });
}

function renderMixPagamentos(metodos) {
  destroyChart('pagamentos');
  const ctx = document.getElementById('biChartPagamentos');
  if (!ctx) return;
  if (!metodos?.length) {
    const box = ctx.parentElement;
    if (box) box.innerHTML = `<div class="bi-empty"><i class="fa-solid fa-credit-card"></i>Sem dados de pagamentos</div>`;
    return;
  }

  CHARTS.pagamentos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: metodos.map(m => m.metodo),
      datasets: [{ data: metodos.map(m => m.total), backgroundColor: CORES, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position:'right', labels: { boxWidth:12, font:{ size:11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.raw)} (${metodos[ctx.dataIndex].pct}%)` } }
      }
    }
  });
}

function renderMargemCategorias(cats) {
  destroyChart('categorias');
  const ctx = document.getElementById('biChartCategorias');
  if (!ctx) return;
  if (!cats?.length) {
    const box = ctx.parentElement;
    if (box) box.innerHTML = `<div class="bi-empty"><i class="fa-solid fa-tags"></i>Sem dados por categoria</div>`;
    return;
  }

  const top = cats.slice(0, 8);

  CHARTS.categorias = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(c => c.categoria),
      datasets: [
        { label:'Receita',  data: top.map(c => c.receita), backgroundColor:'rgba(99,102,241,.75)' },
        { label:'Margem',   data: top.map(c => c.margem),  backgroundColor:'rgba(34,197,94,.75)' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position:'top' }, tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } },
      scales: { y: { ticks: { callback: v => fmt(v) } } }
    }
  });
}

function renderFunil(etapas) {
  const el = document.getElementById('biFunil');
  if (!el) return;
  if (!etapas?.length) {
    el.innerHTML = `<div class="bi-empty"><i class="fa-solid fa-filter"></i>Sem dados de funil no período</div>`;
    return;
  }

  const maxQtd = Math.max(...etapas.map(e => e.qtd), 1);

  el.innerHTML = `<div class="bi-funnel">` + etapas.map((e, i) => {
    const pct = Math.round((e.qtd / maxQtd) * 100);
    const conv = i === 0 ? '—' : (etapas[i-1].qtd > 0 ? fmtN((e.qtd / etapas[i-1].qtd)*100, 1)+'%' : '0%');
    return `
      <div class="bi-funnel__step">
        <div class="bi-funnel__label">${esc(e.etapa)}</div>
        <div class="bi-funnel__bar-wrap">
          <div class="bi-funnel__bar" style="width:${pct}%">
            <span>${fmtN(e.qtd)}</span>
          </div>
        </div>
        <div class="bi-funnel__conv">${conv}</div>
      </div>
    `;
  }).join('') + `</div>`;
}

function renderTopProdutos(produtos) {
  const tbody = document.querySelector('#biTabelaProdutos tbody');
  if (!tbody) return;
  if (!produtos?.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted,#94a3b8)"><i class="fa-solid fa-box-open" style="margin-right:6px;opacity:.4"></i>Nenhum produto no período</td></tr>`;
    return;
  }

  tbody.innerHTML = produtos.map((p, i) => {
    const mPct = p.receita > 0 ? ((p.margem / p.receita) * 100).toFixed(1) : 0;
    const badge = mPct >= 30 ? 'green' : mPct >= 10 ? 'gray' : 'red';
    return `<tr>
      <td style="color:#94a3b8;font-size:12px">${i+1}</td>
      <td>${esc(p.nome)}</td>
      <td>${fmt(p.receita)}</td>
      <td><span class="bi-badge bi-badge--${badge}">${fmtN(mPct,1)}%</span></td>
    </tr>`;
  }).join('');
}

function renderTopClientes(clientes) {
  const tbody = document.querySelector('#biTabelaClientes tbody');
  if (!tbody) return;
  if (!clientes?.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted,#94a3b8)"><i class="fa-solid fa-users" style="margin-right:6px;opacity:.4"></i>Nenhum cliente no período</td></tr>`;
    return;
  }

  tbody.innerHTML = clientes.map((c, i) => `<tr>
    <td style="color:#94a3b8;font-size:12px">${i+1}</td>
    <td>${esc(c.nome)}</td>
    <td>${fmt(c.total_gasto)}</td>
    <td>${fmt(c.ticket_medio)}</td>
  </tr>`).join('');
}

// ── Análise IA ───────────────────────────────────────────────────────────────

async function carregarInsightsIA() {
  const btn  = document.getElementById('biGerarIA');
  const body = document.getElementById('biInsightsBody');
  if (!body) return;

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analisando...'; }
  body.innerHTML = '<div class="bi-ai-empty"><i class="fa-solid fa-spinner fa-spin"></i> Gerando análise com IA...</div>';

  try {
    const data = await api.get('/bi/insights-ia');
    if (!data?.sucesso) throw new Error(data?.erro || 'Erro desconhecido');
    renderInsights(data);
  } catch (err) {
    const msg = buildFriendlyError(err);
    body.innerHTML = `<div class="bi-ai-empty" style="color:#ef4444"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(msg)}</div>`;
    showToast(msg, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Gerar análise'; }
  }
}

function renderInsights({ insights, gerado_em, cache }) {
  const body = document.getElementById('biInsightsBody');
  if (!body) return;

  const badge = cache
    ? '<span class="bi-ai-badge bi-ai-badge--cache">cache</span>'
    : '<span class="bi-ai-badge bi-ai-badge--new">novo</span>';

  body.innerHTML = `
    <div>${formatInsights(insights || '')}</div>
    <div class="bi-ai-footer">${badge} Gerado em ${esc(gerado_em)}</div>
  `;
}

function formatInsights(text) {
  return text.split('\n').map(line => {
    const t = line.trim();
    if (!t) return '';
    // Linha toda em maiúsculas com pelo menos uma letra = título de seção
    if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÀÂÊÎÔÇÃ]/.test(t) && t.length < 70) {
      return `<div class="bi-ai-section-title">${esc(t)}</div>`;
    }
    // Bullet (• ou -)
    if (/^[•\-]\s/.test(t)) {
      return `<div class="bi-ai-bullet">• ${esc(t.replace(/^[•\-]\s*/, ''))}</div>`;
    }
    return `<div class="bi-ai-section-text">${esc(t)}</div>`;
  }).join('');
}

export default { initBiModule };
