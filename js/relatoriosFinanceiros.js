import api from './api.js';
import { exportCSV, numCSV } from './exportUtils.js';
import { showToast } from './feedback.js';
import { escapeHtml, todayFortaleza, buildFriendlyError } from './utils.js';

const state = {
  resumo: null,
  receber: [],
  pagar: [],
  fluxo: [],
  lucratividade: [],
  grade: [],
  dre: null,
  inadimplencia: null,
  aba: 'resumo',
  lucratSubAba: 'financeiro',
  lucratSort: { key: null, dir: 1 },
  loading: false
};

function statusBadge(status) {
  const s = String(status || '').toLowerCase().trim();
  const map = {
    pago:             ['badge--success', 'Pago'],
    pendente:         ['badge--warning', 'Pendente'],
    atrasado:         ['badge--danger',  'Atrasado'],
    parcial:          ['badge--info',    'Parcial'],
    parcial_atrasado: ['badge--danger', 'Parcial em atraso']
  };
  const [cls, label] = map[s] || ['badge--info', escapeHtml(String(status || '-'))];
  return `<span class="badge ${cls}">${label}</span>`;
}

function injectRelatoriosStyles() {
  if (document.getElementById('relStyles')) return;
  const s = document.createElement('style');
  s.id = 'relStyles';
  s.textContent = `
    .rel-preset-btn {
      font-size: 12px;
      padding: 4px 10px;
      height: 30px;
    }
    .rel-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
    }
    .rel-empty i { font-size: 2rem; opacity: .2; margin-bottom: 4px; color: var(--text-muted); }
    .rel-empty strong { font-size: 15px; color: var(--text); }
    .rel-empty p { font-size: 13px; margin: 0; color: var(--text-muted); }
  `;
  document.head.appendChild(s);
}

export async function initRelatoriosFinanceirosModule() {
  injectRelatoriosStyles();
  try {
    renderLoading();
    await carregarDados();
    render();
  } catch (error) {
    console.error('Erro ao iniciar relatórios financeiros:', error);
    renderErro(buildFriendlyError(error));
  }
}

async function carregarDados() {
  const filtros = getFiltrosGlobais();

  const [resumoResult, receberResult, pagarResult, fluxoResult, lucratividadeResult, gradeResult, dreResult, inadResult] =
    await Promise.allSettled([
      api.getRelatorioFinanceiroResumo(filtros),
      api.getRelatorioFinanceiroContasReceber(filtros),
      api.getRelatorioFinanceiroContasPagar(filtros),
      api.getRelatorioFinanceiroFluxoCaixa(filtros),
      api.getRelatorioFinanceiroLucratividade(filtros),
      api.getRelatorioVendasPorGrade(filtros),
      api.getRelatorioDRE(filtros),
      api.getRelatorioInadimplencia(filtros)
    ]);

  state.resumo = resumoResult.status === 'fulfilled' ? resumoResult.value : null;

  state.receber =
    receberResult.status === 'fulfilled' && Array.isArray(receberResult.value)
      ? receberResult.value
      : [];

  state.pagar =
    pagarResult.status === 'fulfilled' && Array.isArray(pagarResult.value) ? pagarResult.value : [];

  const fluxoData = fluxoResult.status === 'fulfilled' ? fluxoResult.value : null;

  state.fluxo = Array.isArray(fluxoData)
    ? fluxoData
    : Array.isArray(fluxoData?.movimentos)
      ? fluxoData.movimentos
      : [];

  state.lucratividade =
    lucratividadeResult.status === 'fulfilled' && Array.isArray(lucratividadeResult.value)
      ? lucratividadeResult.value
      : [];

  state.grade =
    gradeResult.status === 'fulfilled' && Array.isArray(gradeResult.value)
      ? gradeResult.value
      : [];

  state.dre          = dreResult.status  === 'fulfilled' ? dreResult.value  : null;
  state.inadimplencia = inadResult.status === 'fulfilled' ? inadResult.value : null;
}

function getFiltrosGlobais() {
  const tz = 'America/Fortaleza';
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: tz });
  const inicio30 = new Date(Date.now() - 29 * 864e5).toLocaleDateString('sv-SE', { timeZone: tz });
  return {
    empresa_id:   api.getEmpresaId(),
    data_inicial: document.getElementById('filtroDataInicial')?.value || inicio30,
    data_final:   document.getElementById('filtroDataFinal')?.value   || hoje
  };
}

function renderLoading() {
  const c = document.getElementById('relatoriosContainer');
  if (!c) return;

  c.innerHTML = `
    <div class="module-card">
      <div class="module-skeleton" style="padding:20px">
        ${Array.from({length: 6}).map(() => '<div class="skeleton-line" style="height:36px;margin-bottom:12px;border-radius:6px"></div>').join('')}
      </div>
    </div>
  `;
}

function render() {
  const c = document.getElementById('relatoriosContainer');
  if (!c) return;

  c.innerHTML = `
    <div class="module-card">
      <div id="relatoriosFeedback" class="module-feedback"></div>

      <div class="rel-periodo-rapido" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:10px 0 4px">
        <span style="font-size:12px;color:var(--text-muted);font-weight:700;white-space:nowrap">Período rápido:</span>
        <button type="button" class="btn btn-light rel-preset-btn" data-rel-preset="hoje">Hoje</button>
        <button type="button" class="btn btn-light rel-preset-btn" data-rel-preset="semana">Esta semana</button>
        <button type="button" class="btn btn-light rel-preset-btn" data-rel-preset="mes">Este mês</button>
        <button type="button" class="btn btn-light rel-preset-btn" data-rel-preset="trimestre">3 meses</button>
        <button type="button" class="btn btn-light rel-preset-btn" data-rel-preset="ano">Este ano</button>
      </div>

      <div class="module-toolbar">
        <div class="module-toolbar__stats">
          <div class="mini-stat">
            <span>Contas a receber</span>
            <strong>${state.receber.length}</strong>
          </div>
          <div class="mini-stat">
            <span>Contas a pagar</span>
            <strong>${state.pagar.length}</strong>
          </div>
          <div class="mini-stat">
            <span>Movimentos fluxo</span>
            <strong>${state.fluxo.length}</strong>
          </div>
          <div class="mini-stat">
            <span>Lucratividade</span>
            <strong>${state.lucratividade.length}</strong>
          </div>
          <div class="mini-stat">
            <span>Variações vendidas</span>
            <strong>${state.grade.length}</strong>
          </div>
        </div>
      </div>

      <div class="module-toolbar">
        <div class="table-actions">
          <button class="btn-inline ${state.aba === 'resumo' ? 'btn-inline--active' : ''}" data-aba="resumo">
            Resumo
          </button>
          <button class="btn-inline ${state.aba === 'receber' ? 'btn-inline--active' : ''}" data-aba="receber">
            Contas a Receber
          </button>
          <button class="btn-inline ${state.aba === 'pagar' ? 'btn-inline--active' : ''}" data-aba="pagar">
            Contas a Pagar
          </button>
          <button class="btn-inline ${state.aba === 'fluxo' ? 'btn-inline--active' : ''}" data-aba="fluxo">
            Fluxo de Caixa
          </button>
          <button class="btn-inline ${state.aba === 'lucratividade' ? 'btn-inline--active' : ''}" data-aba="lucratividade">
            Lucratividade
          </button>
          <button class="btn-inline ${state.aba === 'grade' ? 'btn-inline--active' : ''}" data-aba="grade">
            Por Variação
          </button>
          <button class="btn-inline ${state.aba === 'dre' ? 'btn-inline--active' : ''}" data-aba="dre">
            DRE
          </button>
          <button class="btn-inline ${state.aba === 'inadimplencia' ? 'btn-inline--active' : ''}" data-aba="inadimplencia">
            Inadimplência
          </button>
        </div>
        <div class="module-card__actions">
          <button class="btn btn-light" id="btnImprimirRelatorios">
            <i class="fa-solid fa-print"></i> Imprimir PDF
          </button>
          <button class="btn btn-light" id="btnExportarRelatorios">
            <i class="fa-solid fa-file-csv"></i> Exportar CSV
          </button>
          <button class="btn btn-light" id="btnAtualizarRelatoriosFinanceiros">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>
      </div>

      ${renderConteudoAba()}
    </div>
  `;

  bindEventos();
}

function renderConteudoAba() {
  if (state.aba === 'resumo') return renderResumo();
  if (state.aba === 'receber') return renderTabelaReceber();
  if (state.aba === 'pagar') return renderTabelaPagar();
  if (state.aba === 'fluxo') return renderTabelaFluxo();
  if (state.aba === 'grade') return renderTabelaGrade();
  if (state.aba === 'dre') return renderDRE();
  if (state.aba === 'inadimplencia') return renderInadimplencia();
  return renderTabelaLucratividade();
}

function renderInadimplencia() {
  const d = state.inadimplencia;

  if (!d || !d.total_clientes) {
    return `<div class="module-feedback module-feedback--success">
      <i class="fa-solid fa-circle-check"></i> Nenhum título em atraso encontrado. Carteira em dia!
    </div>`;
  }

  const ag = d.aging || {};
  const totAging = (ag.faixa_1_30 || 0) + (ag.faixa_31_60 || 0) + (ag.faixa_61_90 || 0) + (ag.faixa_90plus || 0);

  function agingBar(valor, cor) {
    const pct = totAging > 0 ? Math.max(4, (valor / totAging) * 100) : 0;
    return `<div style="background:${cor};height:10px;border-radius:6px;width:${pct.toFixed(1)}%;min-width:4px"></div>`;
  }

  const linhas = d.clientes.map((c) => {
    const gravidade = c.max_dias_atraso > 60 ? 'badge--danger'
                    : c.max_dias_atraso > 30 ? 'badge--warning'
                    : 'badge--info';
    return `
      <tr>
        <td><strong>${escapeHtml(c.cliente_nome)}</strong></td>
        <td>${c.total_titulos}</td>
        <td class="text-right"><strong>${formatCurrency(c.valor_total)}</strong></td>
        <td>
          <span class="badge ${gravidade}">${c.max_dias_atraso}d</span>
        </td>
        <td class="text-right">${c.faixa_1_30  > 0 ? formatCurrency(c.faixa_1_30)  : '—'}</td>
        <td class="text-right">${c.faixa_31_60 > 0 ? formatCurrency(c.faixa_31_60) : '—'}</td>
        <td class="text-right">${c.faixa_61_90 > 0 ? formatCurrency(c.faixa_61_90) : '—'}</td>
        <td class="text-right ${c.faixa_90plus > 0 ? 'text-danger' : ''}">${c.faixa_90plus > 0 ? formatCurrency(c.faixa_90plus) : '—'}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="kpi-grid" style="margin-top:8px;margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-card__icon" style="color:var(--danger)"><i class="fa-solid fa-user-xmark"></i></div>
        <div class="kpi-card__content">
          <span>Inadimplentes</span>
          <strong style="color:var(--danger)">${d.total_clientes}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon" style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="kpi-card__content">
          <span>Valor em atraso</span>
          <strong style="color:var(--danger)">${formatCurrency(d.total_valor)}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-file-invoice-dollar"></i></div>
        <div class="kpi-card__content">
          <span>Títulos em atraso</span>
          <strong>${d.total_titulos}</strong>
        </div>
      </div>
    </div>

    <div class="panel-card" style="margin-bottom:20px">
      <div class="panel-card__header">
        <div><h3>Aging — Concentração do atraso</h3><p>Distribuição do valor por faixa de dias em atraso</p></div>
      </div>
      <div class="panel-card__body">
        <div style="display:grid;gap:10px">
          ${[
            { label: '1 a 30 dias',   valor: ag.faixa_1_30,  cor: 'var(--warning)' },
            { label: '31 a 60 dias',  valor: ag.faixa_31_60, cor: 'var(--warning-dark, #c05e00)' },
            { label: '61 a 90 dias',  valor: ag.faixa_61_90, cor: 'var(--danger)' },
            { label: 'Acima de 90',   valor: ag.faixa_90plus, cor: 'var(--danger-dark, #991b1b)' }
          ].map(({ label, valor, cor }) => `
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:120px;font-size:12px;font-weight:600;color:var(--text-muted);white-space:nowrap">${label}</div>
              <div style="flex:1;display:flex;align-items:center;gap:8px">
                ${agingBar(valor, cor)}
              </div>
              <div style="min-width:100px;text-align:right;font-size:13px;font-weight:700">${formatCurrency(valor)}</div>
              <div style="min-width:48px;text-align:right;font-size:11px;color:var(--text-muted)">${totAging > 0 ? ((valor / totAging) * 100).toFixed(1) + '%' : '—'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Títulos</th>
            <th class="text-right">Total em atraso</th>
            <th>Maior atraso</th>
            <th class="text-right">1-30d</th>
            <th class="text-right">31-60d</th>
            <th class="text-right">61-90d</th>
            <th class="text-right">90d+</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}

function renderDRE() {
  const d = state.dre;

  if (!d) {
    return `<div class="rel-empty">
      <i class="fa-solid fa-table"></i>
      <strong>Nenhum dado de DRE encontrado</strong>
      <p>Não há dados para montar a Demonstração de Resultado no período selecionado.</p>
    </div>`;
  }

  function pct(v) { return `${Number(v || 0).toFixed(1)}%`; }
  function val(v)  { return formatCurrency(v); }

  function dreRow(label, value, bold = false, cls = '', indent = false) {
    const style = indent ? 'padding-left:28px' : '';
    return `
      <tr class="${cls}">
        <td style="${style}">${bold ? `<strong>${escapeHtml(label)}</strong>` : escapeHtml(label)}</td>
        <td class="text-right" style="${style}">${bold ? `<strong>${val(value)}</strong>` : val(value)}</td>
      </tr>
    `;
  }

  function dreRowPct(label, value, pctVal, cls = '') {
    return `
      <tr class="${cls}">
        <td><strong>${escapeHtml(label)}</strong></td>
        <td class="text-right">
          <strong>${val(value)}</strong>
          <span class="badge ${Number(pctVal) >= 0 ? 'badge--success' : 'badge--danger'}" style="margin-left:8px;font-size:11px">
            ${pct(pctVal)}
          </span>
        </td>
      </tr>
    `;
  }

  const mensal = Array.isArray(d.mensal) ? d.mensal : [];

  const mensalRows = mensal.map((m) => `
    <tr>
      <td><strong>${escapeHtml(m.label)}</strong></td>
      <td class="text-right">${val(m.receita)}</td>
      <td class="text-right">${val(m.cmv)}</td>
      <td class="text-right ${Number(m.lucro_bruto) < 0 ? 'text-danger' : 'text-success'}">
        <strong>${val(m.lucro_bruto)}</strong>
        <small style="display:block;color:var(--text-muted)">${pct(m.margem_bruta)}</small>
      </td>
      <td class="text-right">${val(m.despesas)}</td>
      <td class="text-right ${Number(m.resultado) < 0 ? 'text-danger' : 'text-success'}">
        <strong>${val(m.resultado)}</strong>
        <small style="display:block;color:var(--text-muted)">${pct(m.margem_oper)}</small>
      </td>
    </tr>
  `).join('');

  return `
    <div class="kpi-grid" style="margin-top:8px;margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-arrow-trend-up"></i></div>
        <div class="kpi-card__content">
          <span>Receita Bruta</span>
          <strong>${val(d.receita_bruta)}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-box-open"></i></div>
        <div class="kpi-card__content">
          <span>CMV</span>
          <strong>${val(d.cmv)}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-scale-balanced"></i></div>
        <div class="kpi-card__content">
          <span>Lucro Bruto</span>
          <strong class="${Number(d.lucro_bruto) >= 0 ? 'text-success' : 'text-danger'}">${val(d.lucro_bruto)}</strong>
          <small>Margem: ${pct(d.margem_bruta)}</small>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="kpi-card__content">
          <span>Resultado Operacional</span>
          <strong class="${Number(d.resultado_operacional) >= 0 ? 'text-success' : 'text-danger'}">${val(d.resultado_operacional)}</strong>
          <small>Margem: ${pct(d.margem_operacional)}</small>
        </div>
      </div>
    </div>

    <div class="dashboard-grid" style="margin-bottom:24px">
      <div class="panel-card panel-card--large">
        <div class="panel-card__header"><div><h3>DRE — Demonstrativo de Resultado</h3><p>Apuração do período selecionado</p></div></div>
        <div class="panel-card__body" style="padding:0">
          <table class="data-table" style="margin:0">
            <tbody>
              ${dreRow('(+) Receita Bruta de Vendas', d.receita_bruta, true)}
              ${dreRow('(-) Custo das Mercadorias Vendidas (CMV)', d.cmv, false, '', true)}
              ${dreRowPct('(=) Lucro Bruto', d.lucro_bruto, d.margem_bruta, Number(d.lucro_bruto) < 0 ? 'text-danger' : '')}
              ${dreRow('(-) Despesas Operacionais', d.despesas_operacionais, false, '', true)}
              ${dreRowPct('(=) Resultado Operacional', d.resultado_operacional, d.margem_operacional, Number(d.resultado_operacional) < 0 ? 'text-danger' : '')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-card__header"><div><h3>Leitura rápida</h3><p>Interpretação gerencial</p></div></div>
        <div class="panel-card__body">
          <div class="alert-list">
            <div class="alert-list__item ${Number(d.margem_bruta) >= 30 ? 'info' : Number(d.margem_bruta) >= 10 ? 'warning' : 'danger'}">
              Margem bruta de <strong>${pct(d.margem_bruta)}</strong>${Number(d.margem_bruta) >= 30 ? ' — saudável.' : Number(d.margem_bruta) >= 10 ? ' — atenção ao CMV.' : ' — CMV elevado, revisar preços.'}
            </div>
            <div class="alert-list__item ${Number(d.resultado_operacional) >= 0 ? 'info' : 'danger'}">
              Resultado operacional ${Number(d.resultado_operacional) >= 0 ? 'positivo' : 'negativo'} de <strong>${val(d.resultado_operacional)}</strong>.
            </div>
            ${Number(d.despesas_operacionais) > Number(d.lucro_bruto) * 0.8 ? `
              <div class="alert-list__item warning">
                Despesas operacionais consomem mais de 80% do lucro bruto.
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    ${mensal.length > 1 ? `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mês</th>
              <th class="text-right">Receita</th>
              <th class="text-right">CMV</th>
              <th class="text-right">Lucro Bruto</th>
              <th class="text-right">Despesas</th>
              <th class="text-right">Resultado</th>
            </tr>
          </thead>
          <tbody>${mensalRows}</tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border);font-weight:800">
              <td><strong>Total</strong></td>
              <td class="text-right"><strong>${val(d.receita_bruta)}</strong></td>
              <td class="text-right"><strong>${val(d.cmv)}</strong></td>
              <td class="text-right"><strong>${val(d.lucro_bruto)}</strong></td>
              <td class="text-right"><strong>${val(d.despesas_operacionais)}</strong></td>
              <td class="text-right"><strong class="${Number(d.resultado_operacional) >= 0 ? 'text-success' : 'text-danger'}">${val(d.resultado_operacional)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    ` : ''}
  `;
}

function renderTabelaGrade() {
  if (!state.grade.length) {
    return `<div class="rel-empty">
      <i class="fa-solid fa-layer-group"></i>
      <strong>Nenhuma venda por variação encontrada</strong>
      <p>Apenas produtos com grade (tamanho/cor) aparecem aqui.</p>
    </div>`;
  }

  const totalFat  = state.grade.reduce((s, r) => s + r.faturamento_total, 0);
  const totalLucro = state.grade.reduce((s, r) => s + r.lucro_total, 0);
  const totalQtd  = state.grade.reduce((s, r) => s + r.quantidade_vendida, 0);

  return `
    <div class="kpi-grid" style="margin-top:8px;margin-bottom:16px">
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-layer-group"></i></div>
        <div class="kpi-card__content">
          <span>Variações vendidas</span>
          <strong>${state.grade.length}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-boxes-stacked"></i></div>
        <div class="kpi-card__content">
          <span>Unidades vendidas</span>
          <strong>${totalQtd}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="kpi-card__content">
          <span>Faturamento</span>
          <strong>${formatCurrency(totalFat)}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-coins"></i></div>
        <div class="kpi-card__content">
          <span>Lucro total</span>
          <strong>${formatCurrency(totalLucro)}</strong>
        </div>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Variação</th>
            <th>Qtd. vendida</th>
            <th>Faturamento</th>
            <th>Custo total</th>
            <th>Lucro total</th>
            <th>Estoque atual</th>
            <th>Última venda</th>
          </tr>
        </thead>
        <tbody>
          ${state.grade.map((item) => {
            const margem = item.faturamento_total > 0
              ? ((item.lucro_total / item.faturamento_total) * 100).toFixed(1)
              : '0.0';
            return `
              <tr>
                <td><strong>${escapeHtml(item.produto_nome || '-')}</strong></td>
                <td>
                  <span class="badge badge--info" style="font-size:12px">${escapeHtml(item.variacao)}</span>
                </td>
                <td>${item.quantidade_vendida}</td>
                <td>${formatCurrency(item.faturamento_total)}</td>
                <td>${formatCurrency(item.custo_total)}</td>
                <td class="${item.lucro_total >= 0 ? 'text-success' : 'text-danger'}">
                  <strong>${formatCurrency(item.lucro_total)}</strong>
                  <div class="table-muted">${margem}% margem</div>
                </td>
                <td>
                  <span class="${item.estoque_atual <= 0 ? 'badge badge--danger' : item.estoque_atual <= 3 ? 'badge badge--warning' : ''}">
                    ${item.estoque_atual}
                  </span>
                </td>
                <td>${formatDate(item.ultima_venda)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderResumo() {
  const raw = state.resumo || {};
  const r = {
    contas_receber: raw.contas_receber || { pago: 0, pendente: 0, atrasado: 0 },
    contas_pagar:   raw.contas_pagar   || { pago: 0, pendente: 0, atrasado: 0 },
    lancamentos:    raw.lancamentos    || { receitas: 0, despesas: 0, receitas_pagas: 0, despesas_pagas: 0 },
    fluxo:          raw.fluxo          || { entradas: 0, saidas: 0, saldo: 0 }
  };

  return `
    <div class="kpi-grid" style="margin-top: 8px;">
      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-hand-holding-dollar"></i></div>
        <div class="kpi-card__content">
          <span>A Receber Pendente</span>
          <strong>${formatCurrency(r.contas_receber.pendente)}</strong>
          <small>Atrasado: ${formatCurrency(r.contas_receber.atrasado)}</small>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-file-invoice-dollar"></i></div>
        <div class="kpi-card__content">
          <span>A Pagar Pendente</span>
          <strong>${formatCurrency(r.contas_pagar.pendente)}</strong>
          <small>Atrasado: ${formatCurrency(r.contas_pagar.atrasado)}</small>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-card__icon"><i class="fa-solid fa-scale-balanced"></i></div>
        <div class="kpi-card__content">
          <span>Saldo do Fluxo</span>
          <strong>${formatCurrency(r.fluxo.saldo)}</strong>
          <small>Entradas: ${formatCurrency(r.fluxo.entradas)} | Saídas: ${formatCurrency(r.fluxo.saidas)}</small>
        </div>
      </div>
    </div>

    <div class="dashboard-grid" style="margin-top: 20px;">
      <div class="panel-card panel-card--large">
        <div class="panel-card__header">
          <div>
            <h3>Resumo financeiro</h3>
            <p>Visão consolidada do período aplicado</p>
          </div>
        </div>
        <div class="panel-card__body">
          <div class="dashboard-list">
            <div class="dashboard-list__item">
              <strong>Contas a receber pagas</strong>
              <span>${formatCurrency(r.contas_receber.pago)}</span>
            </div>
            <div class="dashboard-list__item">
              <strong>Contas a pagar pagas</strong>
              <span>${formatCurrency(r.contas_pagar.pago)}</span>
            </div>
            <div class="dashboard-list__item">
              <strong>Receitas lançadas</strong>
              <span>${formatCurrency(r.lancamentos.receitas)}</span>
            </div>
            <div class="dashboard-list__item">
              <strong>Despesas lançadas</strong>
              <span>${formatCurrency(r.lancamentos.despesas)}</span>
            </div>
            <div class="dashboard-list__item">
              <strong>Receitas pagas</strong>
              <span>${formatCurrency(r.lancamentos.receitas_pagas)}</span>
            </div>
            <div class="dashboard-list__item">
              <strong>Despesas pagas</strong>
              <span>${formatCurrency(r.lancamentos.despesas_pagas)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-card__header">
          <div>
            <h3>Leitura rápida</h3>
            <p>Interpretação gerencial</p>
          </div>
        </div>
        <div class="panel-card__body">
          <div class="alert-list">
            <div class="alert-list__item info">
              O relatório respeita o período global aplicado no topo.
            </div>
            <div class="alert-list__item ${r.fluxo.saldo >= 0 ? 'success' : 'danger'}">
              ${
                r.fluxo.saldo >= 0
                  ? 'Resultado financeiro equilibrado ou positivo.'
                  : 'Resultado financeiro negativo no período.'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTabelaReceber() {
  if (!state.receber.length) {
    return `<div class="rel-empty">
      <i class="fa-solid fa-hand-holding-dollar"></i>
      <strong>Nenhum registro de contas a receber</strong>
      <p>Não há contas a receber no período selecionado.</p>
    </div>`;
  }

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th class="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${state.receber
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(item.cliente_nome || '-')}</td>
              <td>${Number(item.parcela || 1)}/${Number(item.total_parcelas || 1)}</td>
              <td>${formatDate(item.data_vencimento)}</td>
              <td>${statusBadge(item.status)}</td>
              <td class="text-right"><strong>${formatCurrency(item.valor)}</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTabelaPagar() {
  if (!state.pagar.length) {
    return `<div class="rel-empty">
      <i class="fa-solid fa-file-invoice-dollar"></i>
      <strong>Nenhum registro de contas a pagar</strong>
      <p>Não há contas a pagar no período selecionado.</p>
    </div>`;
  }

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th class="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${state.pagar
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(item.fornecedor_nome || '-')}</td>
              <td>${Number(item.parcela || 1)}/${Number(item.total_parcelas || 1)}</td>
              <td>${formatDate(item.data_vencimento)}</td>
              <td>${statusBadge(item.status)}</td>
              <td class="text-right"><strong>${formatCurrency(item.valor)}</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function _lucratSorted() {
  const { key, dir } = state.lucratSort;
  if (!key) return state.lucratividade;
  return [...state.lucratividade].sort((a, b) => {
    const va = Number(a[key] ?? 0);
    const vb = Number(b[key] ?? 0);
    return (va - vb) * dir;
  });
}

function _thSort(label, key) {
  const { key: sk, dir } = state.lucratSort;
  const arrow = sk === key ? (dir === 1 ? ' <i class="fa-solid fa-sort-up" style="opacity:.9"></i>' : ' <i class="fa-solid fa-sort-down" style="opacity:.9"></i>') : ' <i class="fa-solid fa-sort" style="opacity:.25"></i>';
  return `<th data-sort-key="${key}" style="cursor:pointer;user-select:none;white-space:nowrap">${label}${arrow}</th>`;
}

function renderTabelaLucratividade() {
  if (!state.lucratividade.length) {
    return `<div class="rel-empty">
      <i class="fa-solid fa-chart-line"></i>
      <strong>Nenhum dado de lucratividade encontrado</strong>
      <p>Não há vendas com dados de lucratividade no período selecionado.</p>
    </div>`;
  }

  const sub = state.lucratSubAba;
  const rows = _lucratSorted();

  const subTabBar = `
    <div style="display:flex;gap:6px;margin-bottom:12px">
      <button class="btn-inline ${sub === 'financeiro' ? 'btn-inline--active' : ''}" data-lucrat-sub="financeiro">
        <i class="fa-solid fa-chart-line"></i> Financeiro
      </button>
      <button class="btn-inline ${sub === 'estoque' ? 'btn-inline--active' : ''}" data-lucrat-sub="estoque">
        <i class="fa-solid fa-boxes-stacked"></i> Estoque
      </button>
    </div>`;

  const abcBadge = (c) => `<span class="badge ${c === 'A' ? 'badge--success' : c === 'B' ? 'badge--warning' : 'badge--danger'}">${escapeHtml(c || 'C')}</span>`;

  if (sub === 'financeiro') {
    return `${subTabBar}
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            ${_thSort('ABC', 'classe_abc')}
            <th>Produto</th>
            ${_thSort('Qtd.', 'quantidade_vendida')}
            ${_thSort('Faturamento', 'faturamento_total')}
            ${_thSort('Custo Médio', 'custo_medio')}
            ${_thSort('Lucro Unit.', 'lucro_unitario')}
            ${_thSort('Margem %', 'margem_lucro')}
            ${_thSort('Lucro Total', 'lucro_total')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>${abcBadge(item.classe_abc)}</td>
              <td>
                <strong>${escapeHtml(item.produto_nome || '-')}</strong>
                <div class="table-muted">${Number(item.participacao_lucro || 0).toFixed(2)}% do lucro</div>
              </td>
              <td>${Number(item.quantidade_vendida || 0)}</td>
              <td>${formatCurrency(item.faturamento_total)}</td>
              <td>${formatCurrency(item.custo_medio)}</td>
              <td class="${Number(item.lucro_unitario || 0) >= 0 ? 'text-success' : 'text-danger'}">
                <strong>${formatCurrency(item.lucro_unitario)}</strong>
              </td>
              <td>
                <span class="badge ${Number(item.margem_lucro || 0) >= 30 ? 'badge--success' : Number(item.margem_lucro || 0) >= 10 ? 'badge--warning' : 'badge--danger'}">
                  ${Number(item.margem_lucro || 0).toFixed(2)}%
                </span>
              </td>
              <td class="${Number(item.lucro_total || 0) >= 0 ? 'text-success' : 'text-danger'}">
                <strong>${formatCurrency(item.lucro_total)}</strong>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  return `${subTabBar}
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            ${_thSort('ABC', 'classe_abc')}
            <th>Produto</th>
            ${_thSort('Estoque Investido', 'estoque_investido')}
            ${_thSort('Lucro Potencial', 'lucro_potencial')}
            ${_thSort('Capital Parado', 'capital_parado')}
            ${_thSort('Última Venda', 'ultima_venda')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>${abcBadge(item.classe_abc)}</td>
              <td>
                <strong>${escapeHtml(item.produto_nome || '-')}</strong>
                <div class="table-muted">${Number(item.participacao_lucro || 0).toFixed(2)}% do lucro</div>
              </td>
              <td>${formatCurrency(item.estoque_investido)}</td>
              <td class="${Number(item.lucro_potencial || 0) >= 0 ? 'text-success' : 'text-danger'}">
                <strong>${formatCurrency(item.lucro_potencial)}</strong>
              </td>
              <td>
                <strong>${formatCurrency(item.capital_parado || 0)}</strong>
                ${Number(item.capital_parado || 0) >= 500 ? '<div><span class="badge badge--warning">Capital alto parado</span></div>' : ''}
              </td>
              <td>
                <span>${formatDate(item.ultima_venda)}</span>
                ${Number(item.estoque_parado || 0) >= 20 ? '<div><span class="badge badge--danger">Estoque elevado</span></div>' : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderTabelaFluxo() {
  if (!state.fluxo.length) {
    return `<div class="rel-empty">
      <i class="fa-solid fa-money-bill-transfer"></i>
      <strong>Nenhum movimento de fluxo de caixa</strong>
      <p>Não há movimentos no período selecionado.</p>
    </div>`;
  }

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Origem</th>
            <th>Descrição</th>
            <th>Referência</th>
            <th class="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${state.fluxo
            .map(
              (item) => `
            <tr>
              <td>${formatDate(item.data_movimento || item.data)}</td>
              <td>${escapeHtml(item.tipo || '-')}</td>
              <td>${formatOrigem(item.origem)}</td>
              <td>${escapeHtml(item.descricao || '-')}</td>
              <td>${formatReferencia(item)}</td>
              <td class="text-right"><strong>${formatCurrency(item.valor)}</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function exportarAbaAtual() {
  const { aba } = state;

  const f = getFiltrosGlobais();
  const periodo = f.data_inicial && f.data_final
    ? `${f.data_inicial.split('-').reverse().join('/')} a ${f.data_final.split('-').reverse().join('/')}`
    : 'Período completo';

  if (aba === 'receber') {
    exportCSV(state.receber.map((r) => ({
      'Vencimento':      formatDate(r.data_vencimento),
      'Cliente':         r.cliente_nome || '-',
      'Parcela':         `${r.parcela || 1}/${r.total_parcelas || 1}`,
      'Status':          r.status || '-',
      'Valor (R$)':      numCSV(r.valor)
    })), 'contas_receber', { titulo: 'Contas a Receber', periodo });
    return;
  }
  if (aba === 'pagar') {
    exportCSV(state.pagar.map((r) => ({
      'Vencimento':      formatDate(r.data_vencimento),
      'Fornecedor':      r.fornecedor_nome || '-',
      'Parcela':         `${r.parcela || 1}/${r.total_parcelas || 1}`,
      'Status':          r.status || '-',
      'Valor (R$)':      numCSV(r.valor)
    })), 'contas_pagar', { titulo: 'Contas a Pagar', periodo });
    return;
  }
  if (aba === 'fluxo') {
    exportCSV(state.fluxo.map((r) => ({
      'Data':        formatDate(r.data_movimento || r.data),
      'Tipo':        r.tipo || '-',
      'Origem':      r.origem || '-',
      'Descricao':   r.descricao || '-',
      'Valor (R$)':  numCSV(r.valor)
    })), 'fluxo_caixa', { titulo: 'Fluxo de Caixa', periodo });
    return;
  }
  if (aba === 'lucratividade') {
    exportCSV(state.lucratividade.map((r) => ({
      'ABC':              r.classe_abc || '-',
      'Produto':          r.produto_nome || '-',
      'Qtd Vendida':      r.quantidade_vendida || 0,
      'Faturamento (R$)': numCSV(r.faturamento_total),
      'CMV (R$)':         numCSV(r.custo_total),
      'Lucro Total (R$)': numCSV(r.lucro_total),
      'Margem (%)':       numCSV(r.margem_lucro),
      'Capital Parado (R$)': numCSV(r.capital_parado),
      'Ultima Venda':     formatDate(r.ultima_venda)
    })), 'lucratividade', { titulo: 'Lucratividade por Produto', periodo });
    return;
  }
  if (aba === 'grade') {
    exportCSV(state.grade.map((r) => ({
      'Produto':          r.produto_nome || '-',
      'Variacao':         r.variacao || '-',
      'Qtd Vendida':      r.quantidade_vendida || 0,
      'Faturamento (R$)': numCSV(r.faturamento_total),
      'Custo Total (R$)': numCSV(r.custo_total),
      'Lucro Total (R$)': numCSV(r.lucro_total),
      'Estoque Atual':    r.estoque_atual || 0,
      'Ultima Venda':     formatDate(r.ultima_venda)
    })), 'vendas_por_variacao', { titulo: 'Vendas por Variação', periodo });
    return;
  }
  if (aba === 'resumo' || aba === 'inadimplencia') {
    showToast('Exportação não disponível para esta aba. Use as abas de Receber, Pagar ou Fluxo.', 'info');
    return;
  }
  if (aba === 'dre' && state.dre?.mensal?.length) {
    exportCSV(state.dre.mensal.map((m) => ({
      'Mes':                  m.label,
      'Receita (R$)':         numCSV(m.receita),
      'CMV (R$)':             numCSV(m.cmv),
      'Lucro Bruto (R$)':     numCSV(m.lucro_bruto),
      'Margem Bruta (%)':     numCSV(m.margem_bruta),
      'Despesas (R$)':        numCSV(m.despesas),
      'Resultado Oper (R$)':  numCSV(m.resultado),
      'Margem Oper (%)':      numCSV(m.margem_oper)
    })), 'dre', { titulo: 'DRE — Demonstrativo de Resultado', periodo });
    return;
  }
}

function bindEventos() {
  document
    .getElementById('btnExportarRelatorios')
    ?.addEventListener('click', () => {
      try { exportarAbaAtual(); } catch (e) { showToast('Erro ao exportar relatório.', 'error'); }
    });

  document
    .getElementById('btnAtualizarRelatoriosFinanceiros')
    ?.addEventListener('click', async () => {
      await recarregarModulo('Relatórios atualizados.');
    });

  document
    .getElementById('btnImprimirRelatorios')
    ?.addEventListener('click', () => { window.print(); });

  document.querySelectorAll('[data-rel-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const today = todayFortaleza();
      const [y, m] = today.split('-').map(Number);
      let ini = today;
      const preset = btn.dataset.relPreset;
      if (preset === 'hoje') {
        ini = today;
      } else if (preset === 'semana') {
        const d = new Date(`${today}T12:00:00`);
        const dow = d.getDay(); // 0=dom, 1=seg ... 6=sab
        const diasAteSeg = dow === 0 ? 6 : dow - 1; // recua até segunda-feira
        d.setDate(d.getDate() - diasAteSeg);
        ini = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else if (preset === 'mes') {
        ini = `${y}-${String(m).padStart(2,'0')}-01`;
      } else if (preset === 'trimestre') {
        let tm = m - 3, ty = y;
        if (tm <= 0) { tm += 12; ty -= 1; }
        ini = `${ty}-${String(tm).padStart(2,'0')}-01`;
      } else if (preset === 'ano') {
        ini = `${y}-01-01`;
      }
      const iniEl = document.getElementById('filtroDataInicial');
      const fimEl = document.getElementById('filtroDataFinal');
      if (iniEl) iniEl.value = ini;
      if (fimEl) fimEl.value = today;
      await recarregarModulo('Período atualizado.');
    });
  });

  document.querySelectorAll('[data-aba]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.aba = btn.dataset.aba;
      render();
    });
  });

  document.querySelectorAll('[data-lucrat-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lucratSubAba = btn.dataset.lucratSub;
      state.lucratSort = { key: null, dir: 1 };
      render();
    });
  });

  document.querySelectorAll('[data-sort-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      if (state.lucratSort.key === key) {
        state.lucratSort.dir *= -1;
      } else {
        state.lucratSort = { key, dir: 1 };
      }
      render();
    });
  });
}

async function recarregarModulo(mensagem = '') {
  if (state.loading) return;
  state.loading = true;
  try {
    renderLoading();
    await carregarDados();
    render();
    if (mensagem) renderFeedback(mensagem, 'success');
  } catch (error) {
    console.error(error);
    renderErro(buildFriendlyError(error));
  } finally {
    state.loading = false;
  }
}

let _feedbackTimer = null;

function renderFeedback(message, type = 'success') {
  const feedback = document.getElementById('relatoriosFeedback');
  if (!feedback) return;

  feedback.className = `module-feedback module-feedback--${type}`;
  feedback.textContent = message;

  if (_feedbackTimer) clearTimeout(_feedbackTimer);
  _feedbackTimer = setTimeout(() => {
    const current = document.getElementById('relatoriosFeedback');
    if (current) {
      current.className = 'module-feedback';
      current.textContent = '';
    }
    _feedbackTimer = null;
  }, 3500);
}

function renderErro(message) {
  const c = document.getElementById('relatoriosContainer');
  if (!c) return;

  c.innerHTML = `
    <div class="module-card" style="text-align:center;padding:40px 20px">
      <div class="module-feedback module-feedback--error" style="margin-bottom:16px">
        <i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(message)}
      </div>
      <button class="btn btn-light" id="relBtnRetry" type="button">
        <i class="fa-solid fa-rotate"></i> Tentar novamente
      </button>
    </div>
  `;
  document.getElementById('relBtnRetry')?.addEventListener('click', () => recarregarModulo());
}

function formatOrigem(origem) {
  const mapa = {
    conta_receber: 'Conta a Receber',
    conta_pagar: 'Conta a Pagar',
    lancamento_financeiro: 'Lançamento Financeiro',
    investimento: 'Investimento'
  };
  return mapa[origem] || 'Outros';
}

function formatReferencia(item) {
  if (!item?.referencia_id) return '-';
  const id = escapeHtml(String(item.referencia_id));
  if (item.origem === 'conta_receber') return `Venda #${id}`;
  if (item.origem === 'conta_pagar') return `Compra #${id}`;
  return `#${id}`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [ano, mes, dia] = String(value).split('-');
    return `${dia}/${mes}/${ano}`;
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
}

