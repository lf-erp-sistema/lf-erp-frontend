import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { gerarPIX } from './pix.js';
import { escapeHtml, buildFriendlyError, todayFortaleza, calcPeriodoLocal, debounce } from './utils.js';

let _dropClickHandler = null;

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
  ordemDir: 'desc',
  selecionadas: new Set()
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
  state.selecionadas.clear();
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

function getStatusIconClass(status, dataVencimento) {
  const st = normalizarStatus(status);
  if (st === 'pago') return 'verde';
  const hoje = todayFortaleza();
  const venc = (dataVencimento || '').split('T')[0];
  if (!venc || venc < hoje || st === 'atrasado' || st === 'parcial_atrasado') return 'vermelho';
  const diffDays = Math.round((new Date(`${venc}T12:00:00`) - new Date(`${hoje}T12:00:00`)) / 86400000);
  if (diffDays <= 3) return 'amarelo';
  return 'cinza';
}

function getStatusIconHtml(conta) {
  const cor = getStatusIconClass(conta.status, conta.data_vencimento);
  const cfg = {
    verde:    { fa: 'fa-solid fa-circle-check',      title: 'Recebido — clique para estornar' },
    vermelho: { fa: 'fa-solid fa-circle-xmark',       title: 'Vencido — clique para registrar recebimento' },
    amarelo:  { fa: 'fa-solid fa-circle-exclamation', title: 'Vence em breve — clique para registrar recebimento' },
    cinza:    { fa: 'fa-regular fa-clock',            title: 'Pendente — clique para registrar recebimento' }
  };
  const { fa, title } = cfg[cor];
  return `<button class="cr-status-icon cr-status-icon--${cor}" data-action="toggle-status-cr" data-id="${conta.id}" title="${title}" type="button"><i class="${fa}"></i></button>`;
}

function exportarCSV() {
  const contas = state.contas;
  if (!contas.length) { showMessage('Nenhuma conta para exportar.', 'error'); return; }
  const sep = ';';
  const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
  const headers = ['ID','Cliente','Descrição','Parcela','Vencimento','Valor (R$)','Status','Data Pagamento'];
  const rows = contas.map(c => [
    c.id,
    q(c.cliente_nome || c.cliente_nome_manual || ''),
    q(c.observacao || c.descricao || ''),
    Number(c.total_parcelas || 1) > 1 ? `${c.parcela}/${c.total_parcelas}` : '',
    (c.data_vencimento || '').slice(0, 10),
    Number(c.valor || 0).toFixed(2).replace('.', ','),
    c.status || '',
    (c.data_pagamento || '').slice(0, 10)
  ].join(sep));
  const csv = '﻿' + [headers.join(sep), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `contas-receber-${todayFortaleza()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showMessage(`${contas.length} conta(s) exportada(s).`, 'success');
}

async function baixarEmLote(ids, dataPagamento, formaPagamento) {
  let ok = 0, erros = 0;
  for (const id of ids) {
    try {
      const conta = state.contas.find(c => String(c.id) === String(id));
      await api.baixarContaReceber(id, {
        valor_pago: Number(conta?.valor || 0),
        data_pagamento: dataPagamento,
        forma_pagamento: formaPagamento
      });
      ok++;
      // patch local
      const idx = state.contas.findIndex(c => String(c.id) === String(id));
      if (idx !== -1) state.contas[idx].status = 'pago';
    } catch { erros++; }
  }
  return { ok, erros };
}

function abrirModalBaixaLote(ids) {
  document.getElementById('crLoteModal')?.remove();
  const hoje = todayFortaleza();
  const modal = document.createElement('div');
  modal.id = 'crLoteModal';
  modal.className = 'modal-overlay cr-detail-overlay';
  modal.innerHTML = `
    <div class="modal-card cr-detail-card cr-bx-card">
      <div class="cr-detail-header">
        <div>
          <span class="cr-detail-eyebrow">Baixa em lote</span>
          <h3>${ids.length} conta${ids.length !== 1 ? 's' : ''} selecionada${ids.length !== 1 ? 's' : ''}</h3>
        </div>
        <button class="icon-button" type="button" id="fecharCrLote"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="cr-detail-body cr-bx-body">
        <div class="cr-bx-section">
          <p class="cr-bx-section-title">Recebimento em Lote</p>
          <div class="cr-bx-card-group">
            <div class="cr-bx-cells-2col">
              <div class="cr-bx-cell">
                <span class="cr-bx-cell-ico cr-bx-cell-ico--blue"><i class="fa-solid fa-calendar-days"></i></span>
                <div class="cr-bx-cell-content">
                  <label class="cr-bx-lbl" for="crLoteData">Data</label>
                  <input type="date" id="crLoteData" class="cr-bx-cell-input" value="${hoje}">
                </div>
              </div>
              <div class="cr-bx-cell">
                <span class="cr-bx-cell-ico"><i class="fa-solid fa-credit-card"></i></span>
                <div class="cr-bx-cell-content">
                  <label class="cr-bx-lbl" for="crLoteForma">Forma</label>
                  <select id="crLoteForma" class="cr-bx-cell-input">
                    <option value="dinheiro">Dinheiro</option>
                    <option value="pix">PIX</option>
                    <option value="cartao_debito">Cartão Débito</option>
                    <option value="cartao_credito">Cartão Crédito</option>
                    <option value="transferencia">Transferência</option>
                    <option value="boleto">Boleto</option>
                    <option value="promissoria">Promissória</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="cr-detail-footer">
        <button class="btn btn-success" type="button" id="confirmarCrLote">
          <i class="fa-solid fa-check-double"></i> Confirmar recebimento
        </button>
        <button class="btn btn-light" type="button" id="cancelarCrLote">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const fechar = () => modal.remove();
  document.getElementById('fecharCrLote')?.addEventListener('click', fechar);
  document.getElementById('cancelarCrLote')?.addEventListener('click', fechar);
  modal.addEventListener('click', e => { if (e.target === modal) fechar(); });
  document.getElementById('confirmarCrLote')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
    const data  = document.getElementById('crLoteData')?.value || hoje;
    const forma = document.getElementById('crLoteForma')?.value || 'dinheiro';
    const { ok, erros } = await baixarEmLote(ids, data, forma);
    fechar();
    state.selecionadas.clear();
    _atualizarBarraLote();
    await recarregar();
    showMessage(`${ok} recebida(s)${erros ? `, ${erros} erro(s)` : ''}.`, ok > 0 ? 'success' : 'error');
  });
}

function _atualizarBarraLote() {
  const bar = document.getElementById('crLoteBar');
  if (!bar) return;
  const n = state.selecionadas.size;
  if (n === 0) {
    bar.style.display = 'none';
    document.getElementById('crCheckAll') && (document.getElementById('crCheckAll').checked = false);
  } else {
    bar.style.display = 'flex';
    const span = document.getElementById('crLoteCount');
    if (span) span.textContent = `${n} conta${n !== 1 ? 's' : ''} selecionada${n !== 1 ? 's' : ''}`;
  }
  // sync individual checkboxes
  document.querySelectorAll('.cr-check-item').forEach(chk => {
    chk.checked = state.selecionadas.has(chk.dataset.id);
  });
  // sync checkAll
  const all = document.getElementById('crCheckAll');
  if (all && state.contas.length) all.checked = state.selecionadas.size === state.contas.length;
}

function getDiasAtrasoText(dataVencimento) {
  if (!dataVencimento) return 'Atrasado';
  const hoje = new Date(`${todayFortaleza()}T12:00:00`);
  const venc = new Date(`${String(dataVencimento).slice(0, 10)}T12:00:00`);
  const dias = Math.round((hoje - venc) / 86400000);
  return dias > 0 ? `${dias} dia${dias !== 1 ? 's' : ''} em atraso` : 'Atrasado';
}

function _gerarMsgCobranca(abertas, total) {
  const linhas = abertas.map((c, i) => {
    const num  = String(i + 1).padStart(2, '0');
    const desc = (c.observacao || 'Produto').trim();
    const parc = c.parcela != null && c.total_parcelas != null ? ` - ${c.parcela}/${c.total_parcelas}` : '';
    const val  = Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${num} - ${desc}${parc} - R$ ${val}`;
  });
  const tot = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return linhas.join('\n') + `\n\n*Total - R$ ${tot}*`;
}

async function abrirVisaoCliente(clienteId, clienteNome) {
  document.getElementById('crVisaoClienteModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'crVisaoClienteModal';
  modal.className = 'modal-overlay cr-detail-overlay';
  modal.innerHTML = `
    <div class="modal-card cr-detail-card">
      <div class="cr-detail-header">
        <div>
          <span class="cr-detail-eyebrow">Visão do cliente</span>
          <h3>${escapeHtml(clienteNome || 'Cliente')}</h3>
          <p id="crVCTel" style="color:var(--text-muted)">Carregando...</p>
        </div>
        <button class="icon-button" type="button" id="fecharCrVC"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="cr-detail-body" id="crVCBody">
        ${Array.from({length: 4}).map(() => '<div class="skeleton-line" style="height:48px;margin-bottom:10px;border-radius:10px"></div>').join('')}
      </div>
      <div class="cr-detail-footer" id="crVCFooter">
        <button class="btn btn-light" type="button" id="fecharCrVCFooter">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const fechar = () => modal.remove();
  document.getElementById('fecharCrVC')?.addEventListener('click', fechar);
  document.getElementById('fecharCrVCFooter')?.addEventListener('click', fechar);
  modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });

  try {
    const [hist, contasResp] = await Promise.all([
      api.getHistoricoFinanceiroCliente(clienteId),
      api.getContasReceber({
        empresa_id: api.getEmpresaId(),
        data_inicial: '2000-01-01',
        data_final: '2099-12-31',
        cliente_id: clienteId,
        busca: '', status: '', page: 1, limit: 500
      })
    ]);

    const cliente   = hist?.cliente  || {};
    const todas     = contasResp?.contas || [];
    const abertas   = todas.filter(c => !['pago','cancelado','estornado'].includes(normalizarStatus(c.status)));
    const pagas     = todas.filter(c => normalizarStatus(c.status) === 'pago');
    const atrasadas = abertas.filter(c => ['atrasado','parcial_atrasado'].includes(normalizarStatus(c.status)));
    const totalAberto = abertas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const totalPago   = pagas.reduce((s, c) => s + Number(c.valor || 0), 0);

    const telEl = document.getElementById('crVCTel');
    if (telEl) telEl.textContent = cliente.telefone || 'Sem telefone cadastrado';

    // Grupos de parcelas por produto (para barra de progresso)
    const grupos = new Map();
    for (const c of todas) {
      const chave = (c.observacao || 'Conta a receber').trim();
      if (!grupos.has(chave)) grupos.set(chave, { pagas: 0, abertas: 0, total_parcelas: 0 });
      const g = grupos.get(chave);
      if (normalizarStatus(c.status) === 'pago') g.pagas++;
      else g.abertas++;
      if (Number(c.total_parcelas || 1) > g.total_parcelas) g.total_parcelas = Number(c.total_parcelas || 1);
    }

    const progressBars = Array.from(grupos.entries())
      .filter(([, g]) => g.total_parcelas > 1)
      .map(([nome, g]) => {
        const pct = Math.round((g.pagas / g.total_parcelas) * 100);
        return `<div class="cr-vc-progress">
          <div class="cr-vc-progress__label"><span>${escapeHtml(nome)}</span><span>${g.pagas}/${g.total_parcelas} pagas</span></div>
          <div class="cr-vc-progress__bar"><div class="cr-vc-progress__fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');

    const linhasAbertas = abertas.map(c => {
      const st  = normalizarStatus(c.status);
      const cor = getStatusIconClass(st, c.data_vencimento);
      const chip = st === 'atrasado' || st === 'parcial_atrasado'
        ? getDiasAtrasoText(c.data_vencimento) : getVencimentoInfo(c.data_vencimento);
      return `<div class="cr-vc-row">
        <div class="cr-vc-row__icon">${getStatusIconHtml(c)}</div>
        <div class="cr-vc-row__info">
          <strong>${escapeHtml(c.observacao || 'Conta a receber')}</strong>
          <small>${Number(c.total_parcelas || 1) > 1 ? `Parcela ${c.parcela}/${c.total_parcelas} · ` : ''}${formatDate(c.data_vencimento)}</small>
        </div>
        <div class="cr-vc-row__valor">
          <strong>${formatCurrency(c.valor)}</strong>
          <span class="cr-venc-chip cr-venc-chip--${cor}">${chip}</span>
        </div>
        <div class="cr-vc-row__acao">
          <button class="btn btn-sm btn-primary" type="button" data-action="baixar-vc" data-id="${c.id}">
            <i class="fa-solid fa-check"></i> Baixar
          </button>
        </div>
      </div>`;
    }).join('');

    const body = document.getElementById('crVCBody');
    if (!body) return;
    body.innerHTML = `
      <section class="cr-detail-summary" style="margin-bottom:14px">
        <article class="cr-detail-summary__main">
          <span>Em aberto</span>
          <strong>${formatCurrency(totalAberto)}</strong>
          <small>${abertas.length} parcela${abertas.length !== 1 ? 's' : ''}</small>
        </article>
        <article>
          <span>Atrasadas</span>
          <strong style="color:var(--danger)">${atrasadas.length}</strong>
          <small>${formatCurrency(atrasadas.reduce((s,c)=>s+Number(c.valor||0),0))}</small>
        </article>
        <article>
          <span>Já recebido</span>
          <strong style="color:var(--success)">${formatCurrency(totalPago)}</strong>
          <small>${pagas.length} parcela${pagas.length !== 1 ? 's' : ''}</small>
        </article>
        <article>
          <span>Total histórico</span>
          <strong>${formatCurrency(totalAberto + totalPago)}</strong>
        </article>
      </section>

      ${progressBars ? `
      <section class="cr-detail-section" style="margin-bottom:14px">
        <div class="cr-detail-section__header"><div><h4>Progresso de parcelas</h4><p>Por produto / serviço</p></div></div>
        <div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px;">${progressBars}</div>
      </section>` : ''}

      ${abertas.length ? `
      <section class="cr-detail-section">
        <div class="cr-detail-section__header">
          <div><h4>Parcelas em aberto</h4><p>${abertas.length} parcela${abertas.length !== 1 ? 's' : ''} · ${formatCurrency(totalAberto)}</p></div>
        </div>
        <div class="cr-vc-list">${linhasAbertas}</div>
      </section>` : `
      <div style="padding:32px;text-align:center;color:var(--text-muted)">
        <i class="fa-solid fa-circle-check" style="font-size:2rem;color:#16a34a;display:block;margin-bottom:8px"></i>
        <strong style="color:var(--text)">Tudo em dia!</strong><br>
        <span>Nenhuma parcela em aberto.</span>
      </div>`}
    `;

    body.querySelectorAll("[data-action='baixar-vc']").forEach(btn => {
      btn.addEventListener('click', () => {
        const conta = todas.find(c => String(c.id) === btn.dataset.id);
        if (!conta) return;
        fechar();
        abrirModalBaixaConta(conta);
      });
    });

    // Footer com WhatsApp
    let tel = (cliente.telefone || '').replace(/\D/g, '');
    if (tel.length === 11 || tel.length === 10) tel = '55' + tel;
    const waUrl = tel.length >= 12 && abertas.length
      ? `https://wa.me/${tel}?text=${encodeURIComponent(_gerarMsgCobranca(abertas, totalAberto))}`
      : null;

    const footer = document.getElementById('crVCFooter');
    if (footer) {
      footer.innerHTML = `
        ${waUrl
          ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-success">
               <i class="fa-brands fa-whatsapp"></i> Enviar cobrança
             </a>`
          : abertas.length
            ? `<button class="btn btn-light" type="button" disabled title="Telefone não cadastrado neste cliente" style="opacity:.55;cursor:not-allowed">
                 <i class="fa-brands fa-whatsapp"></i> Sem telefone
               </button>`
            : ''}
        <button class="btn btn-light" type="button" id="fecharCrVCFooter2">Fechar</button>`;
      document.getElementById('fecharCrVCFooter2')?.addEventListener('click', fechar);
    }

  } catch (err) {
    const body = document.getElementById('crVCBody');
    if (body) body.innerHTML = `<div class="module-feedback module-feedback--error">${escapeHtml(buildFriendlyError(err))}</div>`;
  }
}

function mostrarPopoverBaixa(btn, conta) {
  document.getElementById('crStatusPopover')?.remove();
  const rect = btn.getBoundingClientRect();
  const hojeISO = todayFortaleza();
  const formaAtual = (conta.forma_pagamento || '').toLowerCase();

  const pop = document.createElement('div');
  pop.id = 'crStatusPopover';
  pop.className = 'cr-popover';
  pop.style.cssText = `top:${rect.bottom + window.scrollY + 6}px;left:${Math.max(8, Math.min(rect.left + window.scrollX - 10, window.innerWidth - 272))}px`;

  const selOpt = (val, label) =>
    `<option value="${val}" ${formaAtual === val || (val === 'promissoria' && formaAtual.includes('promiss')) ? 'selected' : ''}>${label}</option>`;

  pop.innerHTML = `
    <div class="cr-popover__header">
      <span class="cr-popover__cliente">${escapeHtml(conta.cliente_nome || 'Cliente')}</span>
      <span class="cr-popover__valor">${formatCurrency(conta.valor)}</span>
    </div>
    ${conta.observacao ? `<div class="cr-popover__desc">${escapeHtml(conta.observacao.slice(0, 40))}${conta.observacao.length > 40 ? '…' : ''}</div>` : ''}
    <div class="cr-popover__fields">
      <input type="date" id="crPopData" class="cr-popover__input" value="${hojeISO}">
      <select id="crPopForma" class="cr-popover__input">
        <option value="">Forma de pagamento</option>
        ${selOpt('dinheiro','Dinheiro')}
        ${selOpt('pix','PIX')}
        ${selOpt('promissoria','Promissória')}
        ${selOpt('cartao_credito','Cartão crédito')}
        ${selOpt('cartao_debito','Cartão débito')}
        ${selOpt('transferencia','Transferência')}
        ${selOpt('boleto','Boleto')}
      </select>
    </div>
    <div class="cr-popover__btns">
      <button class="btn btn-primary btn-sm" id="crPopConfirmar" type="button"><i class="fa-solid fa-check"></i> Confirmar</button>
      <button class="btn btn-light btn-sm" id="crPopCancelar" type="button">Cancelar</button>
    </div>`;

  document.body.appendChild(pop);

  const fechar = () => {
    pop.remove();
    document.removeEventListener('click', outsideClick);
    document.removeEventListener('keydown', escKey);
  };
  const outsideClick = (e) => { if (!pop.contains(e.target) && e.target !== btn) fechar(); };
  const escKey = (e) => { if (e.key === 'Escape') fechar(); };
  setTimeout(() => { document.addEventListener('click', outsideClick); document.addEventListener('keydown', escKey); }, 0);

  document.getElementById('crPopCancelar')?.addEventListener('click', fechar);
  document.getElementById('crPopConfirmar')?.addEventListener('click', async () => {
    const data = document.getElementById('crPopData')?.value;
    const forma = document.getElementById('crPopForma')?.value || '';
    if (!data) { showToast('Informe a data do recebimento.', 'error'); return; }
    const btnConf = document.getElementById('crPopConfirmar');
    if (btnConf) { btnConf.disabled = true; btnConf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try {
      await api.baixarContaReceber(conta.id, {
        valor_pago: Number(conta.valor),
        data_pagamento: data,
        ...(forma ? { forma_pagamento: forma } : {})
      });
      fechar();
      const idx = state.contas.findIndex(c => String(c.id) === String(conta.id));
      if (idx !== -1) {
        const val = Number(conta.valor || 0);
        const stOld = normalizarStatus(conta.status);
        state.contas[idx].status = 'pago';
        state.contas[idx].data_pagamento = data;
        state.resumo.total_pago = (state.resumo.total_pago || 0) + val;
        state.resumo.qtd_pago = (state.resumo.qtd_pago || 0) + 1;
        if (stOld === 'atrasado' || stOld === 'parcial_atrasado') {
          state.resumo.total_atrasado = Math.max(0, (state.resumo.total_atrasado || 0) - val);
          state.resumo.qtd_atrasado = Math.max(0, (state.resumo.qtd_atrasado || 0) - 1);
        } else {
          state.resumo.total_pendente = Math.max(0, (state.resumo.total_pendente || 0) - val);
          state.resumo.qtd_pendente = Math.max(0, (state.resumo.qtd_pendente || 0) - 1);
        }
      }
      render();
      showToast('Recebimento registrado!', 'success');
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
      if (btnConf) { btnConf.disabled = false; btnConf.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar'; }
    }
  });
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
        <i class="fa-solid fa-circle-info cr-explain-ico"></i>
        <span><strong>Importante:</strong> Esta tela mostra títulos. Valores recebidos só entram no Fluxo de Caixa após baixa/pagamento.</span>
      </div>

      ${renderAlertasVencCR()}

      <div class="cr-period-bar">
        <div class="periodo-local">
          <span class="periodo-local__label">Período:</span>
          <div class="periodo-local__presets">
            ${['hoje','7dias','30dias','proximos30','mesAtual','mesAnterior'].map(p => {
              const labels = { hoje:'Hoje', '7dias':'7 dias', '30dias':'Últ. 30 dias', proximos30:'Próx. 30 dias', mesAtual:'Este mês', mesAnterior:'Mês ant.' };
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
        <button class="btn btn-primary" id="btnNovaContaManual" type="button" style="flex-shrink:0">
          <i class="fa-solid fa-plus"></i> Conta manual
        </button>
      </div>

      <div class="cr-toolbar-grid">

        <!-- Linha 1: busca + combobox cliente + botões de ação -->
        <div class="cr-toolbar-row1">
          <div class="module-toolbar__search cr-search-box">
            <i class="fa-solid fa-search"></i>
            <input
              type="text"
              id="crBusca"
              placeholder="Buscar cliente, produto ou nº da venda..."
              value="${escapeHtml(state.filtros.busca || '')}"
            />
          </div>

          <div class="cr-filter-box cr-filter-box--cliente cr-combobox">
            <i class="fa-solid fa-user cr-combobox__icon"></i>
            <input type="text" id="crClienteInput" class="cr-combobox__input"
              placeholder="Filtrar por cliente..." autocomplete="off"
              value="${escapeHtml(state.clientes.find(c => String(c.id) === String(state.filtros.cliente_id))?.nome || '')}">
            <input type="hidden" id="crCliente" value="${escapeHtml(String(state.filtros.cliente_id || ''))}">
            <div class="cr-combobox__dropdown" id="crClienteDrop">
              <div class="cr-combobox__opt" data-val="" data-lbl="Todos os clientes">Todos os clientes</div>
              ${state.clientes.map(c => `<div class="cr-combobox__opt${String(state.filtros.cliente_id) === String(c.id) ? ' cr-combobox__opt--sel' : ''}" data-val="${c.id}" data-lbl="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</div>`).join('')}
            </div>
          </div>

          <div class="cr-primary-actions">
            <button class="btn btn-primary" id="btnFiltrarContasReceber" type="button">
              <i class="fa-solid fa-filter"></i> Filtrar
              ${(state.filtros.status || state.filtros.cliente_id || state.filtros.busca)
                ? `<span class="cr-filter-badge">${[state.filtros.status, state.filtros.cliente_id, state.filtros.busca].filter(Boolean).length}</span>`
                : ''}
            </button>
            <button class="btn${(state.filtros.status || state.filtros.cliente_id || state.filtros.busca) ? ' btn-warning' : ' btn-light'}" id="btnLimparFiltrosContasReceber" type="button">
              <i class="fa-solid fa-eraser"></i> Limpar
            </button>
          </div>
        </div>

        <!-- Linha 2: chips de status + ações utilitárias -->
        <div class="cr-toolbar-row2">
          <div class="cr-chips-row">
            <input type="hidden" id="crStatus" value="${escapeHtml(state.filtros.status || '')}">
            ${[
              { val: '',                label: 'Todos',          icon: '' },
              { val: 'pendente',        label: 'Pendentes',      icon: 'fa-regular fa-clock' },
              { val: 'atrasado',        label: 'Atrasados',      icon: 'fa-solid fa-circle-xmark' },
              { val: 'pago',            label: 'Recebidos',      icon: 'fa-solid fa-circle-check' },
              { val: 'parcial_atrasado',label: 'Parcial atraso', icon: 'fa-solid fa-triangle-exclamation' },
            ].map(({ val, label, icon }) => {
              const active = state.filtros.status === val ? ' cr-chip--active' : '';
              const icHtml = icon ? `<i class="${icon}"></i> ` : '';
              return `<button type="button" class="cr-chip${active}" data-cr-status="${val}">${icHtml}${label}</button>`;
            }).join('')}
          </div>
          <div class="cr-util-actions">
            <button class="btn btn-light cr-util-btn" id="btnOrdemVenc" type="button" title="Ordenar por vencimento">
              <i class="fa-solid fa-arrow-${state.ordem === 'data_vencimento' && state.ordemDir === 'desc' ? 'down' : 'up'}-wide-short"></i>
              <span class="cr-util-label">Vencimento</span>
            </button>
            <button class="btn btn-light cr-util-btn" id="btnExportarCSV" type="button" title="Exportar CSV">
              <i class="fa-solid fa-file-csv"></i>
            </button>
            <button class="btn btn-light cr-util-btn" id="btnAtualizarContasReceber" type="button" title="Atualizar">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
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
              <th class="cr-th-check"><input type="checkbox" id="crCheckAll" title="Selecionar todos"></th>
              <th class="cr-th-situacao">Situação</th>
              <th data-sort-col="id" style="cursor:pointer;user-select:none">Título${si('id')}</th>
              <th data-sort-col="cliente_nome" style="cursor:pointer;user-select:none">Cliente${si('cliente_nome')}</th>
              <th>Origem</th>
              <th data-sort-col="data_vencimento" style="cursor:pointer;user-select:none">Vencimento${si('data_vencimento')}</th>
              <th class="text-right" data-sort-col="valor" style="cursor:pointer;user-select:none">Valor${si('valor')}</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            ${renderLinhas()}
          </tbody>
          ${state.contas.length ? `
          <tfoot>
            <tr class="cr-tfoot-row">
              <td colspan="6" style="text-align:right;padding:10px 12px;font-size:.82rem;font-weight:700;color:var(--text-muted);">
                Total da página (${state.contas.length} registro${state.contas.length !== 1 ? 's' : ''}):
              </td>
              <td class="text-right" style="padding:10px 12px;font-weight:800;color:var(--text);">
                ${formatCurrency(state.contas.reduce((s, c) => s + Number(c.valor || 0), 0))}
              </td>
              <td></td>
            </tr>
          </tfoot>` : ''}
        </table>
      </div>

      ${state.totalPaginas > 1 ? `
      <div class="lf-pagination">
        <button class="lf-pagination__btn" type="button" data-action="cr-pagina" data-page="prev" ${state.pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="lf-pagination__info">
          Pág. ${state.pagina}/${state.totalPaginas}
          <small>· Mostrando ${((state.pagina-1)*50)+1}–${Math.min(state.pagina*50, state.totalRegistros)} de ${state.totalRegistros}</small>
        </span>
        <button class="lf-pagination__btn" type="button" data-action="cr-pagina" data-page="next" ${state.pagina >= state.totalPaginas ? 'disabled' : ''} aria-label="Próxima página">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>` : ''}
    </section>

    <div class="cr-sticky-bar">
      <span><i class="fa-regular fa-clock" style="font-size:.85rem"></i> Pendentes <strong>${formatCurrency(state.resumo.total_pendente)}</strong></span>
      <span class="cr-sticky-bar__sep">|</span>
      <span class="cr-sticky-bar--vermelho"><i class="fa-solid fa-circle-xmark" style="font-size:.85rem"></i> Atrasados <strong>${formatCurrency(state.resumo.total_atrasado)}</strong></span>
      <span class="cr-sticky-bar__sep">|</span>
      <span class="cr-sticky-bar--verde"><i class="fa-solid fa-circle-check" style="font-size:.85rem"></i> Recebidos <strong>${formatCurrency(state.resumo.total_pago)}</strong></span>
      <span class="cr-sticky-bar__sep">|</span>
      <span>Total <strong>${formatCurrency(state.resumo.total)}</strong></span>
    </div>

    <div class="cr-lote-bar" id="crLoteBar" style="display:${state.selecionadas.size > 0 ? 'flex' : 'none'}">
      <i class="fa-solid fa-check-double"></i>
      <span id="crLoteCount">${state.selecionadas.size} conta${state.selecionadas.size !== 1 ? 's' : ''} selecionada${state.selecionadas.size !== 1 ? 's' : ''}</span>
      <button class="btn btn-success btn-sm" type="button" id="btnBaixarLote">
        <i class="fa-solid fa-check"></i> Baixar selecionadas
      </button>
      <button class="btn btn-light btn-sm" type="button" id="btnLimparLote">
        <i class="fa-solid fa-xmark"></i> Limpar seleção
      </button>
    </div>
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
      const statusColor = getStatusIconClass(status, conta.data_vencimento);
      const _obs = conta.observacao ? conta.observacao.slice(0, 40) + (conta.observacao.length > 40 ? '…' : '') : '';
      const _parc = Number(conta.total_parcelas || 1) > 1 ? `${Number(conta.parcela || 1)}/${Number(conta.total_parcelas || 1)}` : '';
      const descParcela = [escapeHtml(_obs), _parc].filter(Boolean).join(' · ');

      return `
      <tr class="cr-row--${statusColor}">
        <td class="cr-td-check">
          <input type="checkbox" class="cr-check-item" data-id="${conta.id}" ${state.selecionadas.has(String(conta.id)) ? 'checked' : ''}>
        </td>
        <td style="text-align:center;width:52px;padding:8px 4px;">
          ${getStatusIconHtml(conta)}
        </td>

        <td>
          <div class="table-primary">
            <strong>#${escapeHtml(conta.id)}</strong>
          </div>
        </td>

        <td>
          <div class="table-primary">
            ${conta.cliente_id
              ? `<button class="cr-cliente-link" type="button" data-action="visao-cliente-cr" data-id="${conta.cliente_id}" data-nome="${escapeHtml(conta.cliente_nome || '')}">${_highlight(conta.cliente_nome || 'Cliente não informado', termo)}</button>`
              : `<strong>${_highlight(conta.cliente_nome || 'Cliente não informado', termo)}</strong>`}
            ${descParcela ? `<span class="cr-desc-parcela">${descParcela}</span>` : ''}
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
            ${status === 'pago'
              ? `<small>Recebido em ${formatDate(conta.data_pagamento)}</small>`
              : `<span class="cr-venc-chip cr-venc-chip--${statusColor}">${getVencimentoInfo(conta.data_vencimento)}</span>`}
          </div>
        </td>

        <td class="text-right">
          <strong>${formatCurrency(conta.valor)}</strong>
        </td>

        <td class="text-right">
          <div class="table-actions">
          ${conta.cliente_id
              ? `<button class="btn-inline" type="button" data-action="visao-cliente-cr" data-id="${conta.cliente_id}" data-nome="${escapeHtml(conta.cliente_nome || '')}"><i class="fa-solid fa-user"></i> Cliente</button>`
              : ''}
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

  // Quick-filter chips de status — aplicação imediata
  document.querySelectorAll('[data-cr-status]').forEach(chip => {
    chip.addEventListener('click', async () => {
      const val = chip.dataset.crStatus;
      document.getElementById('crStatus').value = val;
      state.filtros.status = val;
      state.pagina = 1;
      salvarFiltrosCR();
      await recarregar();
    });
  });

  // Botão de ordenação por vencimento
  document.getElementById('btnOrdemVenc')?.addEventListener('click', async () => {
    if (state.ordem === 'data_vencimento') {
      state.ordemDir = state.ordemDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.ordem = 'data_vencimento';
      state.ordemDir = 'asc';
    }
    _sortItems();
    render();
  });

  // Exportar CSV
  document.getElementById('btnExportarCSV')?.addEventListener('click', () => exportarCSV());

  // Selecionar todos / individual
  document.getElementById('crCheckAll')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.contas.forEach(c => state.selecionadas.add(String(c.id)));
    } else {
      state.selecionadas.clear();
    }
    _atualizarBarraLote();
  });

  document.querySelectorAll('.cr-check-item').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) state.selecionadas.add(chk.dataset.id);
      else state.selecionadas.delete(chk.dataset.id);
      _atualizarBarraLote();
    });
  });

  // Baixar em lote
  document.getElementById('btnBaixarLote')?.addEventListener('click', () => {
    if (!state.selecionadas.size) return;
    const abertasIds = [...state.selecionadas].filter(id => {
      const c = state.contas.find(x => String(x.id) === id);
      return c && normalizarStatus(c.status) !== 'pago';
    });
    if (!abertasIds.length) { showMessage('Todas as contas selecionadas já estão pagas.', 'error'); return; }
    abrirModalBaixaLote(abertasIds);
  });

  document.getElementById('btnLimparLote')?.addEventListener('click', () => {
    state.selecionadas.clear();
    _atualizarBarraLote();
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

  document.querySelectorAll("[data-action='visao-cliente-cr']").forEach((button) => {
    button.addEventListener('click', async () => {
      await abrirVisaoCliente(button.dataset.id, button.dataset.nome);
    });
  });

  // Combobox de clientes pesquisável
  const crInput = document.getElementById('crClienteInput');
  const crDrop  = document.getElementById('crClienteDrop');
  if (crInput && crDrop) {
    crInput.addEventListener('focus', () => { crDrop.style.display = 'block'; });
    crInput.addEventListener('input', () => {
      const q = crInput.value.toLowerCase().trim();
      crDrop.querySelectorAll('.cr-combobox__opt').forEach(opt => {
        opt.style.display = !q || opt.dataset.lbl.toLowerCase().includes(q) ? '' : 'none';
      });
      crDrop.style.display = 'block';
    });
    crDrop.addEventListener('mousedown', (e) => {
      const opt = e.target.closest('.cr-combobox__opt');
      if (!opt) return;
      e.preventDefault();
      document.getElementById('crCliente').value = opt.dataset.val || '';
      crInput.value = opt.dataset.val ? opt.dataset.lbl : '';
      crDrop.style.display = 'none';
      crDrop.querySelectorAll('.cr-combobox__opt').forEach(o => (o.style.display = ''));
    });
    if (_dropClickHandler) document.removeEventListener('click', _dropClickHandler);
    _dropClickHandler = (e) => {
      const inp  = document.getElementById('crClienteInput');
      const drop = document.getElementById('crClienteDrop');
      if (!inp || !drop) return;
      if (!inp.contains(e.target) && !drop.contains(e.target)) drop.style.display = 'none';
    };
    document.addEventListener('click', _dropClickHandler);
  }

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

  document.querySelectorAll("[data-action='toggle-status-cr']").forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const conta = state.contas.find(c => String(c.id) === String(btn.dataset.id));
      if (!conta) return;
      const st = normalizarStatus(conta.status);
      if (st === 'pago') {
        await estornarConta(conta.id);
      } else {
        mostrarPopoverBaixa(btn, conta);
      }
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
    <div class="modal-card cr-detail-card cr-bx-card">
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

      <div class="cr-detail-body cr-bx-body">
        <div class="cr-bx-section">
          <p class="cr-bx-section-title">Recebimento</p>
          <div class="cr-bx-card-group">
            <div class="cr-bx-cells-2col">
              <div class="cr-bx-cell">
                <span class="cr-bx-cell-ico cr-bx-cell-ico--green"><i class="fa-solid fa-brazilian-real-sign"></i></span>
                <div class="cr-bx-cell-content">
                  <label class="cr-bx-lbl" for="crBaixaValor">Valor <span class="cr-bx-req">*</span></label>
                  <input type="number" step="0.01" min="0.01" max="${valorAtual}" id="crBaixaValor" class="cr-bx-cell-input cr-bx-valor" inputmode="decimal" value="${valorAtual}" />
                </div>
              </div>
              <div class="cr-bx-cell">
                <span class="cr-bx-cell-ico cr-bx-cell-ico--blue"><i class="fa-solid fa-calendar-days"></i></span>
                <div class="cr-bx-cell-content">
                  <label class="cr-bx-lbl" for="crBaixaData">Data <span class="cr-bx-req">*</span></label>
                  <input type="date" id="crBaixaData" class="cr-bx-cell-input" value="${hojeISO}" />
                </div>
              </div>
            </div>
            <div class="cr-bx-cell">
              <span class="cr-bx-cell-ico"><i class="fa-solid fa-credit-card"></i></span>
              <div class="cr-bx-cell-content">
                <label class="cr-bx-lbl" for="crBaixaForma">Forma de pagamento</label>
                <select id="crBaixaForma" class="cr-bx-cell-input">
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
            </div>
          </div>
        </div>

        <div class="cr-bx-section">
          <p class="cr-bx-section-title">Observação</p>
          <textarea id="crBaixaObs" class="cr-bx-obs" rows="2" placeholder="Observação do recebimento (opcional)" maxlength="200"></textarea>
        </div>
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
    .cr-period-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }

    .cr-period-bar .periodo-local {
      margin-bottom: 0;
      flex: 1;
      min-width: 0;
    }

    .cr-toolbar-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 18px;
      background: var(--bg-card, #fff);
      border: 1px solid var(--border-color, #e5e7eb);
      border-radius: 10px;
      padding: 14px 16px;
    }

    .cr-toolbar-row1 {
      display: flex;
      gap: 8px;
      align-items: stretch;
      flex-wrap: wrap;
    }

    .cr-toolbar-row2 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--border-color, #e5e7eb);
    }

    .cr-chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      flex: 1;
    }

    .cr-util-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      align-items: center;
    }

    .cr-util-btn {
      height: 34px;
      padding: 0 10px;
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.82rem;
    }

    .cr-util-label {
      font-size: 0.80rem;
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
      flex: 1;
      min-width: 200px;
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

    .cr-filter-box--cliente {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0 14px;
      background: var(--surface);
      min-height: 44px;
      min-width: 220px;
    }

    .cr-combobox__icon {
      color: var(--text-muted);
      font-size: 0.82rem;
      flex-shrink: 0;
    }

    .cr-filter-box--cliente .cr-combobox__input {
      border: none;
      outline: none;
      background: transparent;
      color: var(--text);
      font-size: 0.94rem;
      width: 100%;
      padding: 0;
      height: 100%;
    }

    .cr-primary-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
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
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.07), rgba(8, 145, 178, 0.05));
      border-radius: 10px;
      padding: 8px 14px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cr-explain-card strong {
      display: inline;
      color: var(--primary-hover);
      font-weight: 700;
      margin-right: 4px;
    }

    .cr-explain-card span {
      color: var(--text-soft);
      font-weight: 500;
      font-size: 0.85rem;
      line-height: 1.3;
    }

    .cr-explain-card .cr-explain-ico {
      color: var(--primary, #2563eb);
      font-size: 0.85rem;
      flex-shrink: 0;
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
      .cr-toolbar-row1 {
        flex-direction: column;
      }

      .cr-filter-box--cliente { min-width: unset; width: 100%; }

      .cr-primary-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
      }

      .cr-toolbar-row2 {
        flex-wrap: wrap;
      }

      .cr-util-label { display: none; }

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

      .cr-primary-actions {
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

    /* ── Coluna Situação ── */
    .cr-th-situacao { width: 60px; text-align: center; }
    .cr-status-icon {
      display: flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 50%; border: none;
      cursor: pointer; margin: 0 auto; font-size: 1.22rem; background: transparent;
      transition: transform .12s, opacity .12s;
    }
    .cr-status-icon:hover { transform: scale(1.2); opacity: .8; }
    .cr-status-icon--verde    { color: #16a34a; }
    .cr-status-icon--vermelho { color: #dc2626; }
    .cr-status-icon--amarelo  { color: #d97706; }
    .cr-status-icon--cinza    { color: var(--text-muted); }

    /* ── Destaque de linha ── */
    tr.cr-row--vermelho td:first-child { border-left: 3px solid rgba(220,38,38,.55); }
    tr.cr-row--vermelho { background: rgba(220,38,38,.03); }
    tr.cr-row--amarelo  { background: rgba(217,119,6,.04); }

    /* ── Chip de vencimento ── */
    .cr-venc-chip {
      display: inline-block; padding: 2px 8px; border-radius: 20px;
      font-size: .73rem; font-weight: 700; margin-top: 3px;
    }
    .cr-venc-chip--verde    { background: var(--success-soft); color: #15803d; }
    .cr-venc-chip--vermelho { background: var(--danger-soft);  color: #b91c1c; }
    .cr-venc-chip--amarelo  { background: var(--warning-soft); color: #b45309; }
    .cr-venc-chip--cinza    { background: var(--surface-2);    color: var(--text-muted); }

    /* ── Nome do cliente clicável ── */
    .cr-cliente-link {
      background: none; border: none; cursor: pointer; padding: 0;
      color: var(--text); font-weight: 800; font-size: inherit; text-align: left;
      font-family: inherit; transition: color .15s;
    }
    .cr-cliente-link:hover { color: var(--primary); text-decoration: underline; }

    /* ── Combobox de clientes ── */
    .cr-combobox { position: relative; }
    .cr-combobox__input { width: 100%; }
    .cr-combobox__dropdown {
      display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 200;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.14);
      max-height: 220px; overflow-y: auto; margin-top: 4px;
    }
    .cr-combobox__opt {
      padding: 8px 14px; cursor: pointer; font-size: .88rem; font-weight: 600;
      color: var(--text); transition: background .1s;
    }
    .cr-combobox__opt:hover, .cr-combobox__opt--sel { background: var(--surface-2); }
    .cr-combobox__opt--sel { color: var(--primary); font-weight: 800; }

    /* ── Modal visão do cliente ── */
    .cr-detail-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9999;
      display: flex; align-items: flex-start; justify-content: center;
      padding: 24px 12px; overflow-y: auto;
    }
    .cr-detail-card {
      background: var(--surface); border-radius: 18px; width: 100%; max-width: 680px;
      box-shadow: 0 8px 40px rgba(0,0,0,.18); display: flex; flex-direction: column;
    }
    .cr-detail-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 20px 24px 0; gap: 12px;
    }
    .cr-detail-header h3 { margin: 0; font-size: 1.2rem; font-weight: 900; }
    .cr-detail-eyebrow {
      display: block; font-size: .7rem; font-weight: 800; letter-spacing: .06em;
      text-transform: uppercase; color: var(--primary); margin-bottom: 2px;
    }
    .cr-detail-body { padding: 16px 24px; overflow-y: auto; max-height: 62vh; }
    .cr-detail-footer {
      display: flex; gap: 10px; justify-content: flex-end;
      padding: 14px 24px 20px; border-top: 1px solid var(--border);
    }
    .cr-detail-summary {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    }
    .cr-detail-summary article {
      background: var(--surface-2); border-radius: 12px; padding: 10px 14px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .cr-detail-summary article span { font-size: .72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
    .cr-detail-summary article strong { font-size: 1.05rem; font-weight: 900; }
    .cr-detail-summary article small { font-size: .72rem; color: var(--text-muted); }
    .cr-detail-summary__main { background: var(--primary-pale, color-mix(in srgb,var(--primary) 12%,transparent)) !important; }
    .cr-detail-section { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    .cr-detail-section__header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 12px 16px; border-bottom: 1px solid var(--border);
    }
    .cr-detail-section__header h4 { margin: 0; font-size: .95rem; font-weight: 900; }
    .cr-detail-section__header p { margin: 2px 0 0; font-size: .76rem; color: var(--text-muted); }
    .cr-vc-list { display: flex; flex-direction: column; }
    .cr-vc-row {
      display: grid; grid-template-columns: 40px 1fr auto auto;
      gap: 10px; align-items: center; padding: 10px 16px;
      border-bottom: 1px solid var(--border);
    }
    .cr-vc-row:last-child { border-bottom: none; }
    .cr-vc-row__info strong { font-size: .88rem; font-weight: 800; display: block; }
    .cr-vc-row__info small { color: var(--text-muted); font-size: .75rem; }
    .cr-vc-row__valor { text-align: right; }
    .cr-vc-row__valor strong { display: block; font-size: .94rem; font-weight: 800; }
    .cr-vc-progress__label {
      display: flex; justify-content: space-between;
      font-size: .78rem; font-weight: 700; margin-bottom: 4px; color: var(--text-muted);
    }
    .cr-vc-progress__label span:first-child { color: var(--text); font-weight: 800; }
    .cr-vc-progress__bar { background: var(--surface-2); border-radius: 20px; height: 8px; overflow: hidden; }
    .cr-vc-progress__fill { height: 100%; background: var(--primary); border-radius: 20px; transition: width .3s ease; }

    @media (max-width: 520px) {
      .cr-detail-summary { grid-template-columns: 1fr 1fr; }
      .cr-vc-row { grid-template-columns: 36px 1fr; grid-template-rows: auto auto; }
      .cr-vc-row__acao { grid-column: 2; }
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .cr-combobox__dropdown { box-shadow: 0 4px 24px rgba(0,0,0,.5); }
      :root:not([data-theme="light"]) .cr-detail-card { box-shadow: 0 8px 40px rgba(0,0,0,.5); }
    }
    :root[data-theme="dark"] .cr-combobox__dropdown { box-shadow: 0 4px 24px rgba(0,0,0,.5); }
    :root[data-theme="dark"] .cr-detail-card { box-shadow: 0 8px 40px rgba(0,0,0,.5); }

    /* ── Descrição + parcela abaixo do cliente ── */
    .cr-desc-parcela {
      color: var(--text-muted); font-size: .75rem; font-weight: 600;
      display: block; margin-top: 2px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; max-width: 220px;
    }

    /* ── Checkbox de seleção ── */
    .cr-th-check, .cr-td-check {
      width: 36px; text-align: center; padding: 8px 4px; vertical-align: middle;
    }
    .cr-check-item, #crCheckAll {
      width: 16px; height: 16px; cursor: pointer; accent-color: var(--primary);
    }

    /* ── Barra de ação em lote ── */
    .cr-lote-bar {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      background: var(--primary); color: #fff; border-radius: 40px;
      padding: 10px 20px; display: flex; align-items: center; gap: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,.3); z-index: 9000;
      font-weight: 700; font-size: .88rem; white-space: nowrap;
      max-width: calc(100vw - 32px);
    }
    .cr-lote-bar .btn-success { background: #16a34a; color: #fff; border: none; }
    .cr-lote-bar .btn-light   { background: rgba(255,255,255,.2); color: #fff; border: none; }
    .cr-lote-bar .btn-success:hover { background: #15803d; }
    .cr-lote-bar .btn-light:hover   { background: rgba(255,255,255,.3); }
    .btn-sm { padding: 5px 12px; font-size: .8rem; }

    /* ── Variante warning do btn ── */
    .btn-warning {
      background: linear-gradient(135deg, #d97706, #f59e0b);
      color: #fff; border: none;
    }
    .btn-warning:hover { background: linear-gradient(135deg, #b45309, #d97706); }

    /* ── Quick-filter chips de status ── */
    .cr-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 12px; border-radius: 20px; border: 1.5px solid var(--border);
      background: var(--surface); color: var(--text-muted); font-size: .78rem;
      font-weight: 700; cursor: pointer; transition: all .15s; white-space: nowrap;
      font-family: inherit;
    }
    .cr-chip:hover { border-color: var(--primary); color: var(--primary); background: var(--surface-2); }
    .cr-chip--active {
      border-color: var(--primary); color: var(--primary);
      background: color-mix(in srgb, var(--primary) 12%, transparent);
      font-weight: 800;
    }

    /* ── Badge de filtros ativos ── */
    .cr-filter-badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px;
      background: #fff; color: var(--primary); font-size: .7rem; font-weight: 900;
      margin-left: 4px;
    }
    .btn-warning .cr-filter-badge { color: var(--warning, #d97706); }

    /* ── Tfoot ── */
    .cr-tfoot-row td { background: var(--surface-2); border-top: 1px solid var(--border); }

    /* ── Barra sticky de resumo ── */
    .cr-sticky-bar {
      position: sticky; bottom: 0; z-index: 10;
      background: var(--surface); border-top: 1px solid var(--border);
      padding: 9px 20px; display: flex; align-items: center;
      gap: 10px; flex-wrap: wrap; font-size: .84rem; font-weight: 600;
      color: var(--text-muted); box-shadow: 0 -2px 12px rgba(0,0,0,.07);
    }
    .cr-sticky-bar strong { color: var(--text); font-weight: 800; margin-left: 4px; }
    .cr-sticky-bar__sep { opacity: .28; }
    .cr-sticky-bar--vermelho { color: #dc2626; }
    .cr-sticky-bar--verde    { color: #16a34a; }

    /* ── Popover de baixa rápida ── */
    .cr-popover {
      position: absolute; z-index: 9999;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,.18);
      padding: 14px 16px; width: 260px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .cr-popover__header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .cr-popover__cliente { font-weight: 800; font-size: .9rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cr-popover__valor   { font-weight: 800; font-size: 1rem; color: var(--primary); white-space: nowrap; }
    .cr-popover__desc    { font-size: .76rem; color: var(--text-muted); font-weight: 600; margin-top: -4px; }
    .cr-popover__fields  { display: flex; flex-direction: column; gap: 7px; }
    .cr-popover__input {
      width: 100%; min-height: 36px; border: 1px solid var(--border); border-radius: 10px;
      padding: 0 10px; background: var(--surface); color: var(--text);
      font-size: .88rem; font-weight: 700; outline: none; box-sizing: border-box;
    }
    .cr-popover__input:focus { border-color: var(--primary); }
    .cr-popover__btns { display: flex; gap: 8px; }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .cr-popover { box-shadow: 0 8px 32px rgba(0,0,0,.42); }
      :root:not([data-theme="light"]) tr.cr-row--vermelho { background: rgba(220,38,38,.06); }
      :root:not([data-theme="light"]) tr.cr-row--amarelo  { background: rgba(217,119,6,.07); }
      :root:not([data-theme="light"]) .cr-venc-chip--verde    { background: rgba(22,163,74,.18);  color: #4ade80; }
      :root:not([data-theme="light"]) .cr-venc-chip--vermelho { background: rgba(220,38,38,.18);  color: #f87171; }
      :root:not([data-theme="light"]) .cr-venc-chip--amarelo  { background: rgba(217,119,6,.18);  color: #fbbf24; }
      :root:not([data-theme="light"]) .cr-sticky-bar--vermelho { color: #f87171; }
      :root:not([data-theme="light"]) .cr-sticky-bar--verde    { color: #4ade80; }
      :root:not([data-theme="light"]) .cr-status-icon--verde   { color: #4ade80; }
      :root:not([data-theme="light"]) .cr-status-icon--vermelho{ color: #f87171; }
      :root:not([data-theme="light"]) .cr-status-icon--amarelo { color: #fbbf24; }
    }
    :root[data-theme="dark"] .cr-popover { box-shadow: 0 8px 32px rgba(0,0,0,.42); }
    :root[data-theme="dark"] tr.cr-row--vermelho { background: rgba(220,38,38,.06); }
    :root[data-theme="dark"] tr.cr-row--amarelo  { background: rgba(217,119,6,.07); }
    :root[data-theme="dark"] .cr-venc-chip--verde    { background: rgba(22,163,74,.18);  color: #4ade80; }
    :root[data-theme="dark"] .cr-venc-chip--vermelho { background: rgba(220,38,38,.18);  color: #f87171; }
    :root[data-theme="dark"] .cr-venc-chip--amarelo  { background: rgba(217,119,6,.18);  color: #fbbf24; }
    :root[data-theme="dark"] .cr-sticky-bar--vermelho { color: #f87171; }
    :root[data-theme="dark"] .cr-sticky-bar--verde    { color: #4ade80; }
    :root[data-theme="dark"] .cr-status-icon--verde   { color: #4ade80; }
    :root[data-theme="dark"] .cr-status-icon--vermelho{ color: #f87171; }
    :root[data-theme="dark"] .cr-status-icon--amarelo { color: #fbbf24; }
  `;

  document.head.appendChild(style);
}

function _crNcSpinner(id, label, ini) {
  return `
    <div class="cr-nc-spinner-block">
      <span class="cr-nc-field-lbl">${label}</span>
      <div class="cr-nc-spinner">
        <button type="button" class="cr-nc-spin-up" data-spin="${id}"><i class="fa-solid fa-chevron-up"></i></button>
        <span class="cr-nc-spin-val" id="${id}Val">${ini}</span>
        <button type="button" class="cr-nc-spin-down" data-spin="${id}"><i class="fa-solid fa-chevron-down"></i></button>
      </div>
    </div>`;
}

function _injectCrNcStyles() {
  if (document.getElementById('crNcModalStyles')) return;
  const s = document.createElement('style');
  s.id = 'crNcModalStyles';
  s.textContent = `
    .cr-nc-card { width: min(96vw, 760px) !important; max-height: 92vh; }

    .cr-nc-body { gap: 0; padding: 0; overflow-y: auto; }

    .cr-nc-section {
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
    }
    .cr-nc-section:last-child { border-bottom: none; }
    .cr-nc-section-title {
      font-size: 0.68rem; font-weight: 900; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .08em; margin-bottom: 10px;
    }

    /* Agrupador de cells */
    .cr-nc-card-group {
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      background: var(--surface);
    }

    /* Cell individual */
    .cr-nc-cell {
      display: flex; align-items: center; gap: 14px;
      padding: 13px 16px; border-bottom: 1px solid var(--border);
      background: var(--surface); transition: background .1s;
    }
    .cr-nc-cell:last-child { border-bottom: none; }
    .cr-nc-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }

    /* Duas cells em linha */
    .cr-nc-cells-2col {
      display: grid; grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid var(--border);
    }
    .cr-nc-cells-2col .cr-nc-cell { border-bottom: none; }
    .cr-nc-cells-2col .cr-nc-cell:first-child { border-right: 1px solid var(--border); }
    .cr-nc-cells-2col--last { border-bottom: none; }
    .cr-nc-cells-3col { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid var(--border); }
    .cr-nc-cells-3col:last-child { border-bottom: none; }
    .cr-nc-cells-3col .cr-nc-cell { border-bottom: none; }
    .cr-nc-cells-3col .cr-nc-cell:not(:last-child) { border-right: 1px solid var(--border); }

    /* Ícone da cell */
    .cr-nc-cell-ico {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 0.88rem;
      background: var(--surface-2); color: var(--text-muted);
    }
    .cr-nc-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
    .cr-nc-cell-ico--blue  { background: rgba(37,99,235,.1); color: #2563eb; }
    .cr-nc-cell-ico--orange{ background: rgba(217,119,6,.12); color: #c2410c; }

    /* Conteúdo da cell */
    .cr-nc-cell-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }

    .cr-nc-lbl {
      display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .06em;
    }
    .cr-nc-req { color: var(--danger, #dc2626); }

    /* Input dentro da cell — sem borda, fundo transparente */
    .cr-nc-cell-input {
      border: none !important; outline: none !important;
      background: transparent !important; padding: 0 !important;
      margin: 0 !important; min-height: unset !important;
      border-radius: 0 !important; box-shadow: none !important;
      font-size: 0.93rem; font-weight: 600; color: var(--text);
      width: 100%; font-family: inherit;
      -webkit-appearance: none; appearance: none;
    }
    .cr-nc-cell-input::placeholder { color: var(--text-muted); font-weight: 500; }
    .cr-nc-cell-input:focus { box-shadow: none !important; border: none !important; outline: none !important; }

    /* Seta customizada no select */
    select.cr-nc-cell-input {
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
      background-repeat: no-repeat !important;
      background-position: right 0 center !important;
      padding-right: 16px !important;
    }

    .cr-nc-valor { font-size: 1.2rem !important; font-weight: 800 !important; letter-spacing: -.02em; }

    /* Textarea observação */
    .cr-nc-obs {
      width: 100%; resize: none; font-size: 0.9rem; font-weight: 500;
      color: var(--text); line-height: 1.5;
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 14px; padding: 12px 14px; font-family: inherit;
      box-sizing: border-box;
    }
    .cr-nc-obs::placeholder { color: var(--text-muted); }
    .cr-nc-obs:focus { outline: none; border-color: var(--primary); background: var(--surface); }

    /* Recorrência — row único */
    .cr-nc-rec-single {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px; width: 100%;
      border: 1px solid var(--border); border-radius: 16px;
      background: var(--surface); cursor: pointer; text-align: left;
      transition: background .12s;
    }
    .cr-nc-rec-single:hover { background: var(--surface-2); }
    .cr-nc-rec-texts { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .cr-nc-rec-label { font-size: .92rem; font-weight: 800; color: var(--text); }
    .cr-nc-rec-summary-txt { font-size: .78rem; color: var(--text-muted); font-weight: 600; }
    .cr-nc-rec-chev { color: var(--text-muted); font-size: .78rem; flex-shrink: 0; }

    .cr-nc-rec-icon {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 0.95rem;
    }
    .cr-nc-rec-icon--gray  { background: var(--surface-2); color: var(--text-muted); }
    .cr-nc-rec-icon--blue  { background: rgba(37,99,235,.1); color: #2563eb; }
    .cr-nc-rec-icon--green { background: rgba(22,163,74,.1); color: #16a34a; }

    /* Modal de seleção de recorrência (shared — injected here as fallback) */
    .cp-rec-sel-overlay { z-index: 10000 !important; }
    .cp-rec-sel-card {
      background: var(--surface); border-radius: 24px;
      width: min(94vw, 420px); box-shadow: 0 24px 60px rgba(0,0,0,.28); overflow: hidden;
    }
    .cp-rec-sel-header {
      padding: 16px 20px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .cp-rec-sel-header strong { font-size: 1rem; font-weight: 800; }
    .cp-rec-sel-body { padding: 8px 0 10px; }
    .cp-rec-sel-opt {
      display: flex; align-items: center; gap: 14px; padding: 14px 20px;
      width: 100%; border: none; background: none; cursor: pointer;
      text-align: left; transition: background .1s;
    }
    .cp-rec-sel-opt:hover { background: var(--surface-2); }
    .cp-rec-sel-opt--active { background: var(--primary-soft, rgba(37,99,235,.06)); }
    .cp-rec-sel-info { flex: 1; min-width: 0; }
    .cp-rec-sel-info strong { display: block; font-size: .93rem; font-weight: 700; color: var(--text); }
    .cp-rec-sel-info small  { display: block; font-size: .78rem; color: var(--text-muted); margin-top: 2px; }
    .cp-rec-radio {
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid var(--border); flex-shrink: 0; position: relative;
    }
    .cp-rec-radio--sel { border-color: #16a34a; background: #16a34a; }
    .cp-rec-radio--sel::after {
      content: ''; position: absolute; inset: 4px; background: #fff; border-radius: 50%;
    }

    /* Modal de configuração de parcelamento (shared — injected here as fallback) */
    .cp-rec-cfg-overlay { z-index: 10000 !important; }
    .cp-rec-cfg-card {
      background: var(--surface); border-radius: 24px;
      width: min(94vw, 460px); box-shadow: 0 24px 60px rgba(0,0,0,.28); overflow: hidden;
    }
    .cp-rec-cfg-header {
      padding: 14px 20px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .cp-rec-cfg-header strong { font-size: .98rem; font-weight: 800; flex: 1; text-align: center; }
    .cp-rec-cfg-concluir {
      background: #16a34a; color: #fff; border: none; border-radius: 20px;
      padding: 8px 18px; font-size: .88rem; font-weight: 700;
      cursor: pointer; transition: background .12s; white-space: nowrap;
    }
    .cp-rec-cfg-concluir:hover { background: #15803d; }
    .cp-rec-cfg-body { padding: 6px 0 10px; }
    .cp-rec-cfg-row {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 20px; border-bottom: 1px solid var(--border);
    }
    .cp-rec-cfg-row:last-of-type { border-bottom: none; }
    .cp-rec-cfg-icon { color: var(--text-muted); font-size: .9rem; width: 20px; text-align: center; flex-shrink: 0; }
    .cp-rec-cfg-lbl { flex: 1; font-size: .9rem; font-weight: 600; color: var(--text); }
    .cp-rec-cfg-spin {
      display: flex; align-items: center;
      border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
    }
    .cp-rec-cfg-dn, .cp-rec-cfg-up {
      border: none; background: var(--surface-2); color: var(--text-muted);
      padding: 8px 12px; cursor: pointer; font-size: .75rem;
      transition: background .1s, color .1s;
    }
    .cp-rec-cfg-dn:hover, .cp-rec-cfg-up:hover { background: var(--primary-soft); color: var(--primary); }
    .cp-rec-cfg-val {
      font-size: 1.1rem; font-weight: 900; font-variant-numeric: tabular-nums;
      color: var(--text); padding: 0 16px; min-width: 44px; text-align: center;
    }
    .cp-rec-cfg-sel {
      border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px;
      font-size: .88rem; background: var(--surface); color: var(--text); cursor: pointer;
    }
    .cp-rec-cfg-tipo { padding: 14px 20px; border-bottom: 1px solid var(--border); }
    .cp-rec-cfg-tipo-lbl {
      font-size: .74rem; font-weight: 800; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .04em; margin-bottom: 10px;
    }
    .cp-rec-cfg-tipo-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .cp-rec-cfg-tipo-btn {
      display: flex; align-items: center; gap: 6px; padding: 8px 14px;
      border: 1.5px solid var(--border); border-radius: 10px;
      background: var(--surface); color: var(--text-muted);
      font-size: .83rem; font-weight: 700; cursor: pointer;
      transition: border-color .12s, background .12s, color .12s;
    }
    .cp-rec-cfg-tipo-btn:hover { border-color: var(--primary); color: var(--primary); }
    .cp-rec-cfg-tipo-btn--active { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-hover); }
    .cp-rec-cfg-preview {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 12px 20px;
      background: var(--info-soft, rgba(8,145,178,.07));
      border: 1px solid rgba(8,145,178,.18);
      border-radius: 10px; padding: 10px 12px;
      font-size: .84rem; font-weight: 700; color: #0e7490;
    }
    .cp-rec-cfg-preview i { margin-top: 2px; flex-shrink: 0; }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) .cp-rec-cfg-preview { background: rgba(8,145,178,.12); color: #67e8f9; border-color: rgba(8,145,178,.25); }
    }
    :root[data-theme="dark"] .cp-rec-cfg-preview { background: rgba(8,145,178,.12); color: #67e8f9; border-color: rgba(8,145,178,.25); }

    @media (max-width: 600px) {
      .cr-nc-section { padding: 14px 16px; }
      .cr-nc-cells-2col { grid-template-columns: 1fr; }
      .cr-nc-cells-2col .cr-nc-cell:first-child { border-right: none; border-bottom: 1px solid var(--border); }
      .cr-nc-cells-3col { grid-template-columns: 1fr; }
      .cr-nc-cells-3col .cr-nc-cell:not(:last-child) { border-right: none; border-bottom: 1px solid var(--border); }
    }

    /* ── Baixa modal (cr-bx-*) ── */
    .cr-bx-card { width: min(96vw, 480px) !important; }
    .cr-bx-body { overflow-y: auto; }
    .cr-bx-section { padding: 16px 20px; }
    .cr-bx-section-title { font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8px; }
    .cr-bx-card-group { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
    .cr-bx-cell { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface); transition: background .1s; }
    .cr-bx-cell:last-child { border-bottom: none; }
    .cr-bx-cell:focus-within { background: var(--surface-2, rgba(0,0,0,.025)); }
    .cr-bx-cells-2col { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border); }
    .cr-bx-cells-2col:last-child { border-bottom: none; }
    .cr-bx-cells-2col .cr-bx-cell { border-bottom: none; }
    .cr-bx-cells-2col .cr-bx-cell:first-child { border-right: 1px solid var(--border); }
    .cr-bx-cell-ico { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.88rem; background: var(--surface-2); color: var(--text-muted); }
    .cr-bx-cell-ico--green { background: rgba(22,163,74,.1); color: #16a34a; }
    .cr-bx-cell-ico--blue { background: rgba(37,99,235,.1); color: #2563eb; }
    .cr-bx-cell-content { flex: 1; min-width: 0; }
    .cr-bx-lbl { display: block; font-size: 0.67rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
    .cr-bx-req { color: #dc2626; }
    .cr-bx-cell-input { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-size: 0.93rem; font-weight: 600; color: var(--text); width: 100%; font-family: inherit; -webkit-appearance: none; appearance: none; }
    select.cr-bx-cell-input { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat !important; background-position: right 0 center !important; padding-right: 16px !important; }
    .cr-bx-valor { font-size: 1.2rem !important; font-weight: 800 !important; }
    .cr-bx-obs { width: 100%; resize: none; font-size: 0.9rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; font-family: inherit; color: var(--text); box-sizing: border-box; }
    /* ── Autocomplete cliente (modal conta manual) ── */
    .cr-nc-combo-drop { display: none; position: fixed; z-index: 10001; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12); max-height: 220px; overflow-y: auto; }
    .cr-nc-combo-opt { padding: 10px 16px; cursor: pointer; font-size: .88rem; font-weight: 600; color: var(--text); border-bottom: 1px solid var(--border); transition: background .1s; }
    .cr-nc-combo-opt:last-child { border-bottom: none; }
    .cr-nc-combo-opt:hover, .cr-nc-combo-opt--sel { background: var(--surface-2); }
    .cr-nc-combo-opt--sel { color: var(--primary, #2563eb); }
    .cr-nc-combo-trigger { display: flex; align-items: center; justify-content: space-between; gap: 6px; cursor: pointer; font-size: 15px; font-weight: 500; color: var(--text); background: transparent; user-select: none; width: 100%; padding: 0; border: none; outline: none; }
    .cr-nc-combo-trigger .cr-nc-combo-chev { font-size: 11px; color: var(--text-muted, #6b7280); flex-shrink: 0; transition: transform 0.15s; }
    .cr-nc-combo-trigger.open .cr-nc-combo-chev { transform: rotate(180deg); }
    .cr-nc-cal { display: none; position: fixed; z-index: 10002; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.14); padding: 14px 12px 12px; width: 272px; }
    .cr-nc-cal-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .cr-nc-cal-hdr-lbl { font-size: .86rem; font-weight: 700; color: var(--text); text-transform: capitalize; }
    .cr-nc-cal-nav { background: none; border: none; cursor: pointer; color: var(--text-muted, #6b7280); font-size: 1rem; padding: 3px 8px; border-radius: 6px; line-height: 1; }
    .cr-nc-cal-nav:hover { background: var(--surface-2); }
    .cr-nc-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .cr-nc-cal-wday { font-size: .7rem; font-weight: 700; color: var(--text-muted, #9ca3af); text-align: center; padding: 4px 0 6px; }
    .cr-nc-cal-day { font-size: .83rem; font-weight: 500; color: var(--text); text-align: center; padding: 6px 2px; border-radius: 7px; cursor: pointer; transition: background .1s; }
    .cr-nc-cal-day:hover { background: var(--surface-2); }
    .cr-nc-cal-other { color: var(--text-muted, #9ca3af) !important; }
    .cr-nc-cal-today { font-weight: 700; color: var(--primary, #2563eb); }
    .cr-nc-cal-sel { background: var(--primary, #2563eb) !important; color: #fff !important; font-weight: 700; border-radius: 7px; }
    .cr-nc-cal-foot { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
    .cr-nc-cal-foot-btn { background: none; border: none; cursor: pointer; font-size: .82rem; font-weight: 600; color: var(--primary, #2563eb); padding: 4px 8px; border-radius: 6px; }
    .cr-nc-cal-foot-btn:hover { background: var(--surface-2); }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cr-nc-cal { box-shadow: 0 8px 36px rgba(0,0,0,.5); } }
    :root[data-theme="dark"] .cr-nc-cal { box-shadow: 0 8px 36px rgba(0,0,0,.5); }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cr-nc-combo-drop { box-shadow: 0 8px 32px rgba(0,0,0,.45); } }
    :root[data-theme="dark"] .cr-nc-combo-drop { box-shadow: 0 8px 32px rgba(0,0,0,.45); }
  `;
  document.head.appendChild(s);
}

function abrirModalContaManual() {
  _injectCrNcStyles();

  const modalExistente = document.getElementById('crContaManualModal');
  if (modalExistente) modalExistente.remove();

  const hoje = todayFortaleza ? todayFortaleza() : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
  const [_hy, _hm, _hd] = hoje.split('-');
  const hojeDisplay = `${_hd}/${_hm}/${_hy}`;

  const modal = document.createElement('div');
  modal.id = 'crContaManualModal';
  modal.className = 'modal-overlay cr-detail-overlay';

  modal.innerHTML = `
    <div class="modal-card cr-detail-card cr-nc-card">
      <div class="cr-detail-header">
        <div>
          <span class="cr-detail-eyebrow">Conta manual</span>
          <h3>Nova promissória / conta a receber</h3>
          <p>Sem gerar venda ou movimentar estoque.</p>
        </div>
        <button class="icon-button" type="button" id="fecharContaManual"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div class="cr-detail-body cr-nc-body">

        <!-- Seção: Detalhes -->
        <div class="cr-nc-section">
          <p class="cr-nc-section-title">Detalhes</p>
          <div class="cr-nc-card-group">
            <div class="cr-nc-cell">
              <span class="cr-nc-cell-ico"><i class="fa-solid fa-file-lines"></i></span>
              <div class="cr-nc-cell-content">
                <label class="cr-nc-lbl" for="crManualDescricao">Descrição <span class="cr-nc-req">*</span></label>
                <input type="text" id="crManualDescricao" class="cr-nc-cell-input" placeholder="Ex: Promissória, dívida antiga..." autocomplete="off" />
              </div>
            </div>
            <div class="cr-nc-cells-3col">
              <div class="cr-nc-cell">
                <span class="cr-nc-cell-ico cr-nc-cell-ico--green"><i class="fa-solid fa-brazilian-real-sign"></i></span>
                <div class="cr-nc-cell-content">
                  <label class="cr-nc-lbl" for="crManualValor">Valor <span class="cr-nc-req">*</span></label>
                  <input type="number" step="0.01" id="crManualValor" class="cr-nc-cell-input cr-nc-valor" inputmode="decimal" placeholder="0,00" />
                </div>
              </div>
              <div class="cr-nc-cell">
                <span class="cr-nc-cell-ico cr-nc-cell-ico--blue"><i class="fa-solid fa-calendar-days"></i></span>
                <div class="cr-nc-cell-content">
                  <label class="cr-nc-lbl">1º Vencimento <span class="cr-nc-req">*</span></label>
                  <div id="crManualVencTrigger" class="cr-nc-combo-trigger" tabindex="0" role="button">
                    <span id="crManualVencLabel">${hojeDisplay}</span>
                    <i class="fa-solid fa-calendar-days cr-nc-combo-chev" style="font-size:13px;color:var(--primary,#2563eb)"></i>
                  </div>
                  <input type="hidden" id="crManualVencimento" value="${hoje}">
                </div>
              </div>
              <div class="cr-nc-cell">
                <span class="cr-nc-cell-ico"><i class="fa-solid fa-credit-card"></i></span>
                <div class="cr-nc-cell-content">
                  <label class="cr-nc-lbl">Forma</label>
                  <div id="crManualFormaTrigger" class="cr-nc-combo-trigger" tabindex="0" role="button" aria-haspopup="listbox">
                    <span id="crManualFormaLabel">Promissória</span>
                    <i class="fa-solid fa-chevron-down cr-nc-combo-chev"></i>
                  </div>
                  <input type="hidden" id="crManualForma" value="promissoria">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Seção: Cliente -->
        <div class="cr-nc-section">
          <p class="cr-nc-section-title">Cliente</p>
          <div class="cr-nc-card-group">
            <div class="cr-nc-cells-2col cr-nc-cells-2col--last">
              <div class="cr-nc-cell">
                <span class="cr-nc-cell-ico"><i class="fa-solid fa-user"></i></span>
                <div class="cr-nc-cell-content">
                  <label class="cr-nc-lbl" for="crManualClienteSearch">Cadastrado</label>
                  <input type="text" id="crManualClienteSearch" class="cr-nc-cell-input" placeholder="Buscar cliente..." autocomplete="off" />
                  <input type="hidden" id="crManualCliente" value="" />
                </div>
              </div>
              <div class="cr-nc-cell">
                <span class="cr-nc-cell-ico"><i class="fa-solid fa-pen-to-square"></i></span>
                <div class="cr-nc-cell-content">
                  <label class="cr-nc-lbl" for="crManualNome">Nome manual</label>
                  <input type="text" id="crManualNome" class="cr-nc-cell-input" placeholder="Nome avulso" autocomplete="off" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recorrência -->
        <div class="cr-nc-section cr-nc-section--rec">
          <p class="cr-nc-section-title">Recorrência</p>
          <button type="button" class="cr-nc-rec-single" id="crNcRecRow">
            <span class="cr-nc-rec-icon cr-nc-rec-icon--gray" id="crNcRecIcon"><i class="fa-solid fa-ban"></i></span>
            <span class="cr-nc-rec-texts">
              <span class="cr-nc-rec-label" id="crNcRecLabel">Não recorrente</span>
              <span class="cr-nc-rec-summary-txt" id="crNcRecSummary"></span>
            </span>
            <i class="fa-solid fa-chevron-right cr-nc-rec-chev"></i>
          </button>
        </div>

        <!-- Observação -->
        <div class="cr-nc-section">
          <p class="cr-nc-section-title">Observação</p>
          <textarea id="crManualObservacao" class="cr-nc-obs" rows="2" placeholder="Observações da promissória..."></textarea>
        </div>

      </div>

      <div class="cr-detail-footer">
        <button class="btn btn-primary" type="button" id="salvarContaManual">
          <i class="fa-solid fa-floppy-disk"></i> Salvar conta
        </button>
        <button class="btn btn-light" type="button" id="cancelarContaManual">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // ── Combobox cliente ─────────────────────────────────────────────────────
  {
    const srch = document.getElementById('crManualClienteSearch');
    const hid  = document.getElementById('crManualCliente');
    const drop = document.createElement('div');
    drop.className = 'cr-nc-combo-drop';
    drop.innerHTML =
      `<div class="cr-nc-combo-opt cr-nc-combo-opt--sel" data-val="" data-lbl="">Avulso / sem cliente</div>` +
      state.clientes.map(c => `<div class="cr-nc-combo-opt" data-val="${c.id}" data-lbl="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</div>`).join('');
    document.body.appendChild(drop);
    const _pos = () => {
      const r = srch.getBoundingClientRect();
      drop.style.left  = r.left + 'px';
      drop.style.top   = (r.bottom + 4) + 'px';
      drop.style.width = r.width + 'px';
    };
    srch.addEventListener('focus', () => { _pos(); drop.style.display = 'block'; });
    srch.addEventListener('input', () => {
      const q = srch.value.toLowerCase();
      drop.querySelectorAll('.cr-nc-combo-opt').forEach(o => {
        o.style.display = !q || o.dataset.lbl.toLowerCase().includes(q) ? '' : 'none';
      });
      _pos(); drop.style.display = 'block';
    });
    drop.addEventListener('mousedown', e => {
      const opt = e.target.closest('.cr-nc-combo-opt');
      if (!opt) return;
      e.preventDefault();
      hid.value  = opt.dataset.val;
      srch.value = opt.dataset.val ? opt.dataset.lbl : '';
      drop.querySelectorAll('.cr-nc-combo-opt').forEach(o => { o.style.display = ''; o.classList.remove('cr-nc-combo-opt--sel'); });
      opt.classList.add('cr-nc-combo-opt--sel');
      drop.style.display = 'none';
    });
    srch.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, 150));
    const _crCliObs = new MutationObserver(() => {
      if (!document.getElementById('crContaManualModal')) { drop.remove(); _crCliObs.disconnect(); }
    });
    _crCliObs.observe(document.body, { childList: true });
  }

  // ── Combobox forma de recebimento ─────────────────────────────────────────
  {
    const FORMAS = [
      { val: 'promissoria',   lbl: 'Promissória' },
      { val: 'dinheiro',      lbl: 'Dinheiro' },
      { val: 'pix',           lbl: 'PIX' },
      { val: 'cheque',        lbl: 'Cheque' },
      { val: 'cartao_credito',lbl: 'Cartão de Crédito' },
      { val: 'cartao_debito', lbl: 'Cartão de Débito' },
      { val: 'transferencia', lbl: 'Transferência' },
      { val: 'boleto',        lbl: 'Boleto' },
    ];
    const trigger = document.getElementById('crManualFormaTrigger');
    const lblEl   = document.getElementById('crManualFormaLabel');
    const hid     = document.getElementById('crManualForma');
    const drop    = document.createElement('div');
    drop.className = 'cr-nc-combo-drop';
    drop.innerHTML = FORMAS.map(f =>
      `<div class="cr-nc-combo-opt${f.val === 'promissoria' ? ' cr-nc-combo-opt--sel' : ''}" data-val="${f.val}">${f.lbl}</div>`
    ).join('');
    document.body.appendChild(drop);

    const _posForma = () => {
      const r = trigger.getBoundingClientRect();
      drop.style.left  = r.left + 'px';
      drop.style.top   = (r.bottom + 4) + 'px';
      drop.style.width = r.width + 'px';
    };
    const _openForma  = () => { _posForma(); drop.style.display = 'block'; trigger.classList.add('open'); };
    const _closeForma = () => { drop.style.display = 'none'; trigger.classList.remove('open'); };

    trigger.addEventListener('click', () => drop.style.display === 'block' ? _closeForma() : _openForma());
    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.style.display === 'block' ? _closeForma() : _openForma(); }
    });

    drop.addEventListener('mousedown', e => {
      const opt = e.target.closest('.cr-nc-combo-opt');
      if (!opt) return;
      e.preventDefault();
      hid.value = opt.dataset.val;
      lblEl.textContent = opt.textContent;
      drop.querySelectorAll('.cr-nc-combo-opt').forEach(o => o.classList.remove('cr-nc-combo-opt--sel'));
      opt.classList.add('cr-nc-combo-opt--sel');
      _closeForma();
    });

    const _crFormaOutside = e => {
      if (!trigger.contains(e.target) && !drop.contains(e.target)) _closeForma();
    };
    document.addEventListener('click', _crFormaOutside);

    const _crFormaObs = new MutationObserver(() => {
      if (!document.getElementById('crContaManualModal')) {
        drop.remove();
        document.removeEventListener('click', _crFormaOutside);
        _crFormaObs.disconnect();
      }
    });
    _crFormaObs.observe(document.body, { childList: true });
  }

  // ── Date picker vencimento ────────────────────────────────────────────────
  {
    const hid     = document.getElementById('crManualVencimento');
    const trigger = document.getElementById('crManualVencTrigger');
    const lblEl   = document.getElementById('crManualVencLabel');
    const MESES   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const WDAYS   = ['D','S','T','Q','Q','S','S'];

    const _isoToDisplay = iso => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

    let curYear = 0, curMonth = 0;
    const _initView = () => {
      const v = hid.value;
      if (v) { const [y,m] = v.split('-').map(Number); curYear = y; curMonth = m - 1; }
      else { const n = new Date(); curYear = n.getFullYear(); curMonth = n.getMonth(); }
    };

    const cal = document.createElement('div');
    cal.className = 'cr-nc-cal';
    cal.innerHTML = `
      <div class="cr-nc-cal-hdr">
        <button class="cr-nc-cal-nav" id="crVencPrev">&#8249;</button>
        <span class="cr-nc-cal-hdr-lbl" id="crVencLbl"></span>
        <button class="cr-nc-cal-nav" id="crVencNext">&#8250;</button>
      </div>
      <div class="cr-nc-cal-grid" id="crVencGrid"></div>
      <div class="cr-nc-cal-foot">
        <button class="cr-nc-cal-foot-btn" id="crVencClear">Limpar</button>
        <button class="cr-nc-cal-foot-btn" id="crVencHoje">Hoje</button>
      </div>`;
    document.body.appendChild(cal);

    const _render = () => {
      cal.querySelector('#crVencLbl').textContent = `${MESES[curMonth]} de ${curYear}`;
      const selIso = hid.value;
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const firstWday = new Date(curYear, curMonth, 1).getDay();
      const lastDate  = new Date(curYear, curMonth + 1, 0).getDate();
      const prevLast  = new Date(curYear, curMonth, 0).getDate();
      let html = WDAYS.map(w => `<div class="cr-nc-cal-wday">${w}</div>`).join('');
      for (let i = firstWday - 1; i >= 0; i--) {
        const d = prevLast - i;
        const pm = curMonth === 0 ? 12 : curMonth;
        const py = curMonth === 0 ? curYear - 1 : curYear;
        const iso = `${py}-${String(pm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        html += `<div class="cr-nc-cal-day cr-nc-cal-other${iso===selIso?' cr-nc-cal-sel':''}" data-iso="${iso}">${d}</div>`;
      }
      for (let d = 1; d <= lastDate; d++) {
        const iso = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const cls = ['cr-nc-cal-day'];
        if (iso === selIso) cls.push('cr-nc-cal-sel');
        else if (iso === todayIso) cls.push('cr-nc-cal-today');
        html += `<div class="${cls.join(' ')}" data-iso="${iso}">${d}</div>`;
      }
      const total = Math.ceil((firstWday + lastDate) / 7) * 7;
      for (let d = 1; d <= total - firstWday - lastDate; d++) {
        const nm = curMonth === 11 ? 1 : curMonth + 2;
        const ny = curMonth === 11 ? curYear + 1 : curYear;
        const iso = `${ny}-${String(nm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        html += `<div class="cr-nc-cal-day cr-nc-cal-other${iso===selIso?' cr-nc-cal-sel':''}" data-iso="${iso}">${d}</div>`;
      }
      cal.querySelector('#crVencGrid').innerHTML = html;
    };

    const _posCal = () => {
      const r = trigger.getBoundingClientRect();
      cal.style.left = r.left + 'px';
      const below = window.innerHeight - r.bottom;
      cal.style.top = below >= 300 ? (r.bottom + 4) + 'px' : (r.top - cal.offsetHeight - 4) + 'px';
    };
    const _openCal  = () => { _initView(); _render(); cal.style.display = 'block'; trigger.classList.add('open'); requestAnimationFrame(_posCal); };
    const _closeCal = () => { cal.style.display = 'none'; trigger.classList.remove('open'); };

    trigger.addEventListener('click', () => cal.style.display === 'block' ? _closeCal() : _openCal());
    trigger.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cal.style.display === 'block' ? _closeCal() : _openCal(); } });

    cal.querySelector('#crVencPrev').addEventListener('click', e => { e.stopPropagation(); curMonth--; if (curMonth < 0) { curMonth = 11; curYear--; } _render(); });
    cal.querySelector('#crVencNext').addEventListener('click', e => { e.stopPropagation(); curMonth++; if (curMonth > 11) { curMonth = 0; curYear++; } _render(); });

    cal.querySelector('#crVencClear').addEventListener('click', e => { e.stopPropagation(); hid.value = ''; lblEl.textContent = 'Selecionar data'; _closeCal(); });
    cal.querySelector('#crVencHoje').addEventListener('click', e => {
      e.stopPropagation();
      const n = new Date();
      const iso = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
      hid.value = iso; lblEl.textContent = _isoToDisplay(iso); _initView(); _render(); _closeCal();
    });

    cal.addEventListener('click', e => {
      const day = e.target.closest('.cr-nc-cal-day');
      if (!day) return;
      hid.value = day.dataset.iso;
      lblEl.textContent = _isoToDisplay(day.dataset.iso);
      _closeCal();
    });

    const _crVencOutside = e => { if (!trigger.contains(e.target) && !cal.contains(e.target)) _closeCal(); };
    document.addEventListener('click', _crVencOutside);

    const _crVencObs = new MutationObserver(() => {
      if (!document.getElementById('crContaManualModal')) { cal.remove(); document.removeEventListener('click', _crVencOutside); _crVencObs.disconnect(); }
    });
    _crVencObs.observe(document.body, { childList: true });
  }

  // ── Estado local ──────────────────────────────────────────────────────────
  let recorrencia  = 'nao_recorrente';
  let tipoValor    = 'parcela';
  let parcIni      = 1;
  let qtd          = 2;
  let periodicidade = 30;

  const fmtBRL = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function atualizarRecRow() {
    const icons = { nao_recorrente:'fa-ban', parcelar:'fa-layer-group', fixa_mensal:'fa-calendar-days' };
    const cls   = { nao_recorrente:'gray',   parcelar:'blue',           fixa_mensal:'green' };
    const lbls  = { nao_recorrente:'Não recorrente', parcelar:'Parcelar ou repetir', fixa_mensal:'Fixa mensal' };
    const iconEl    = document.getElementById('crNcRecIcon');
    const labelEl   = document.getElementById('crNcRecLabel');
    const summaryEl = document.getElementById('crNcRecSummary');
    if (iconEl) {
      iconEl.className = `cr-nc-rec-icon cr-nc-rec-icon--${cls[recorrencia]}`;
      iconEl.innerHTML = `<i class="fa-solid ${icons[recorrencia]}"></i>`;
    }
    if (labelEl) labelEl.textContent = lbls[recorrencia];
    if (summaryEl) {
      const valorNum = parseFloat(document.getElementById('crManualValor')?.value || '') || 0;
      const perLabel = { 30:'mensal', 15:'quinzenal', 7:'semanal', 60:'bimestral', 90:'trimestral' }[periodicidade] || 'mensal';
      if (recorrencia === 'nao_recorrente') {
        summaryEl.textContent = '';
      } else if (recorrencia === 'fixa_mensal') {
        summaryEl.textContent = valorNum > 0
          ? `${qtd}× ${fmtBRL(valorNum)} (${perLabel})`
          : `${qtd} títulos ${perLabel}`;
      } else {
        const restantes = Math.max(1, qtd - parcIni + 1);
        summaryEl.textContent = tipoValor === 'total' && valorNum > 0
          ? `${restantes}× ~${fmtBRL(Number((valorNum/qtd).toFixed(2)))} — da ${parcIni} à ${qtd}`
          : valorNum > 0
            ? `${restantes}× ${fmtBRL(valorNum)} — da ${parcIni} à ${qtd}`
            : `${restantes} parcela(s) da ${parcIni} à ${qtd}`;
      }
    }
  }

  function abrirSelecaoRec() {
    document.getElementById('crRecSelModal')?.remove();
    const opcs = [
      { rec:'nao_recorrente', icon:'fa-ban',           cls:'gray',  label:'Não recorrente',      desc:'Título único, sem repetição' },
      { rec:'parcelar',       icon:'fa-layer-group',   cls:'blue',  label:'Parcelar ou repetir', desc:'Defina parcelas e periodicidade' },
      { rec:'fixa_mensal',    icon:'fa-calendar-days', cls:'green', label:'Fixa mensal',         desc:'Receitas recorrentes independentes' }
    ];
    const sel = document.createElement('div');
    sel.id = 'crRecSelModal';
    sel.className = 'modal-overlay cp-rec-sel-overlay';
    sel.innerHTML = `
      <div class="cp-rec-sel-card">
        <div class="cp-rec-sel-header">
          <strong>Recorrência</strong>
          <button type="button" class="icon-button" id="crRecSelFechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="cp-rec-sel-body">
          ${opcs.map(o => `
            <button type="button" class="cp-rec-sel-opt${recorrencia === o.rec ? ' cp-rec-sel-opt--active' : ''}" data-rec="${o.rec}">
              <span class="cr-nc-rec-icon cr-nc-rec-icon--${o.cls}"><i class="fa-solid ${o.icon}"></i></span>
              <span class="cp-rec-sel-info">
                <strong>${o.label}</strong>
                <small>${o.desc}</small>
              </span>
              <span class="cp-rec-radio${recorrencia === o.rec ? ' cp-rec-radio--sel' : ''}"></span>
            </button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(sel);
    document.getElementById('crRecSelFechar')?.addEventListener('click', () => sel.remove());
    sel.addEventListener('click', e => { if (e.target === sel) sel.remove(); });
    sel.querySelectorAll('.cp-rec-sel-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = btn.dataset.rec;
        sel.remove();
        recorrencia = rec;
        if (rec === 'fixa_mensal' && qtd < 2) qtd = 12;
        atualizarRecRow();
        if (rec === 'parcelar' || rec === 'fixa_mensal') abrirConfigRec();
      });
    });
  }

  function abrirConfigRec() {
    document.getElementById('crRecConfigModal')?.remove();
    const perOpts = [
      {v:'30',label:'Mensal'},{v:'15',label:'Quinzenal'},{v:'7',label:'Semanal'},
      {v:'60',label:'Bimestral'},{v:'90',label:'Trimestral'}
    ];
    const cfg = document.createElement('div');
    cfg.id = 'crRecConfigModal';
    cfg.className = 'modal-overlay cp-rec-cfg-overlay';
    cfg.innerHTML = `
      <div class="cp-rec-cfg-card">
        <div class="cp-rec-cfg-header">
          <button type="button" class="icon-button" id="crRecCfgFechar"><i class="fa-solid fa-xmark"></i></button>
          <strong>${recorrencia === 'fixa_mensal' ? 'Configurar Repetição' : 'Configurar Parcelamento'}</strong>
          <button type="button" class="cp-rec-cfg-concluir" id="crRecCfgConcluir">Concluir</button>
        </div>
        <div class="cp-rec-cfg-body">
          ${recorrencia === 'parcelar' ? `
          <div class="cp-rec-cfg-row">
            <span class="cp-rec-cfg-icon"><i class="fa-solid fa-hashtag"></i></span>
            <span class="cp-rec-cfg-lbl">Parcela inicial</span>
            <div class="cp-rec-cfg-spin">
              <button type="button" class="cp-rec-cfg-dn" data-spin="parcIni"><i class="fa-solid fa-chevron-down"></i></button>
              <span class="cp-rec-cfg-val" id="crCfgParcelaIniVal">${parcIni}</span>
              <button type="button" class="cp-rec-cfg-up" data-spin="parcIni"><i class="fa-solid fa-chevron-up"></i></button>
            </div>
          </div>` : ''}
          <div class="cp-rec-cfg-row">
            <span class="cp-rec-cfg-icon"><i class="fa-solid fa-layer-group"></i></span>
            <span class="cp-rec-cfg-lbl">Quantidade</span>
            <div class="cp-rec-cfg-spin">
              <button type="button" class="cp-rec-cfg-dn" data-spin="qtd"><i class="fa-solid fa-chevron-down"></i></button>
              <span class="cp-rec-cfg-val" id="crCfgQtdVal">${qtd}</span>
              <button type="button" class="cp-rec-cfg-up" data-spin="qtd"><i class="fa-solid fa-chevron-up"></i></button>
            </div>
          </div>
          <div class="cp-rec-cfg-row">
            <span class="cp-rec-cfg-icon"><i class="fa-solid fa-calendar-days"></i></span>
            <span class="cp-rec-cfg-lbl">Periodicidade</span>
            <select class="cp-rec-cfg-sel" id="crCfgPeriodicidade">
              ${perOpts.map(o => `<option value="${o.v}"${String(periodicidade)===o.v?' selected':''}>${o.label}</option>`).join('')}
            </select>
          </div>
          ${recorrencia === 'parcelar' ? `
          <div class="cp-rec-cfg-tipo">
            <p class="cp-rec-cfg-tipo-lbl">O valor informado é:</p>
            <div class="cp-rec-cfg-tipo-row">
              <button type="button" class="cp-rec-cfg-tipo-btn${tipoValor==='parcela'?' cp-rec-cfg-tipo-btn--active':''}" data-tipo="parcela">
                <i class="fa-solid fa-equals"></i> Por parcela
              </button>
              <button type="button" class="cp-rec-cfg-tipo-btn${tipoValor==='total'?' cp-rec-cfg-tipo-btn--active':''}" data-tipo="total">
                <i class="fa-solid fa-sigma"></i> Total da dívida
              </button>
            </div>
          </div>` : ''}
          <div class="cp-rec-cfg-preview">
            <i class="fa-solid fa-circle-info"></i>
            <span id="crCfgPreviewTxt">—</span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(cfg);

    function atualizarCfgPreview() {
      const valorNum = parseFloat(document.getElementById('crManualValor')?.value || '') || 0;
      const perSel = cfg.querySelector('#crCfgPeriodicidade');
      const perLabel = perSel?.options?.[perSel?.selectedIndex]?.text || 'Mensal';
      const txt = document.getElementById('crCfgPreviewTxt');
      if (!txt) return;
      if (recorrencia === 'fixa_mensal') {
        const v = valorNum > 0 ? ` de ${fmtBRL(valorNum)} cada` : '';
        txt.textContent = `${qtd} título(s) ${perLabel.toLowerCase()}${v}.`;
      } else {
        const restantes = Math.max(1, qtd - parcIni + 1);
        if (tipoValor === 'total' && valorNum > 0 && qtd > 1) {
          txt.textContent = `${restantes} parcela(s) de ~${fmtBRL(Number((valorNum/qtd).toFixed(2)))} (total ${fmtBRL(valorNum)}).`;
        } else {
          txt.textContent = valorNum > 0
            ? `${restantes} parcela(s) de ${fmtBRL(valorNum)} — da ${parcIni} à ${qtd}.`
            : `${restantes} parcela(s) da ${parcIni} à ${qtd}.`;
        }
      }
    }

    cfg.querySelectorAll('[data-spin]').forEach(btn => {
      const isUp = btn.classList.contains('cp-rec-cfg-up');
      btn.addEventListener('click', () => {
        const id = btn.dataset.spin;
        if (id === 'parcIni') {
          parcIni = isUp ? Math.min(qtd, parcIni + 1) : Math.max(1, parcIni - 1);
          const el = document.getElementById('crCfgParcelaIniVal');
          if (el) el.textContent = parcIni;
        } else if (id === 'qtd') {
          const min = recorrencia === 'parcelar' ? Math.max(parcIni, 2) : 2;
          qtd = isUp ? Math.min(360, qtd + 1) : Math.max(min, qtd - 1);
          const el = document.getElementById('crCfgQtdVal');
          if (el) el.textContent = qtd;
        }
        atualizarCfgPreview();
      });
    });

    cfg.querySelector('#crCfgPeriodicidade')?.addEventListener('change', (e) => {
      periodicidade = parseInt(e.target.value, 10);
      atualizarCfgPreview();
    });

    cfg.querySelectorAll('.cp-rec-cfg-tipo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cfg.querySelectorAll('.cp-rec-cfg-tipo-btn').forEach(b => b.classList.remove('cp-rec-cfg-tipo-btn--active'));
        btn.classList.add('cp-rec-cfg-tipo-btn--active');
        tipoValor = btn.dataset.tipo;
        atualizarCfgPreview();
      });
    });

    const concluir = () => {
      periodicidade = parseInt(cfg.querySelector('#crCfgPeriodicidade')?.value || '30', 10);
      cfg.remove();
      atualizarRecRow();
    };
    document.getElementById('crRecCfgFechar')?.addEventListener('click', concluir);
    document.getElementById('crRecCfgConcluir')?.addEventListener('click', concluir);
    cfg.addEventListener('click', e => { if (e.target === cfg) concluir(); });

    atualizarCfgPreview();
  }

  // ── Recorrência row ───────────────────────────────────────────────────────
  document.getElementById('crNcRecRow')?.addEventListener('click', abrirSelecaoRec);

  // ── Fechar ────────────────────────────────────────────────────────────────
  document.getElementById('fecharContaManual')?.addEventListener('click', () => modal.remove());
  document.getElementById('cancelarContaManual')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  document.getElementById('salvarContaManual')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    try {
      await salvarContaManual(modal, { recorrencia, tipoValor, parcIni, qtd, periodicidade });
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar conta';
    }
  });
}

async function salvarContaManual(modal, { recorrencia = 'nao_recorrente', tipoValor = 'parcela', parcIni = 1, qtd = 1, periodicidade = 30 } = {}) {
  try {
    const clienteId      = document.getElementById('crManualCliente')?.value || '';
    const nomeManual     = document.getElementById('crManualNome')?.value?.trim() || '';
    const valor          = document.getElementById('crManualValor')?.value || '';
    const vencimento     = document.getElementById('crManualVencimento')?.value || '';
    const formaRecebimento = document.getElementById('crManualForma')?.value || 'promissoria';
    const descricao      = document.getElementById('crManualDescricao')?.value?.trim() || '';
    const observacao     = document.getElementById('crManualObservacao')?.value?.trim() || '';

    const valorNum = Number(valor);
    if (!valor || !Number.isFinite(valorNum) || valorNum <= 0) {
      showMessage('Informe um valor válido.', 'error'); return;
    }
    if (!vencimento) {
      showMessage('Informe a data de vencimento.', 'error'); return;
    }
    if (!clienteId && !nomeManual) {
      showMessage('Selecione um cliente ou informe o nome manual.', 'error'); return;
    }

    // Calcular linhas a criar
    let nLinhas, totParcelas;
    if (recorrencia === 'nao_recorrente') {
      nLinhas = 1; totParcelas = 1;
    } else if (recorrencia === 'parcelar') {
      nLinhas = Math.max(1, qtd - parcIni + 1);
      totParcelas = qtd;
    } else { // fixa_mensal
      nLinhas = Math.max(1, qtd);
      totParcelas = 1; // cada título é independente
    }

    // Valor por linha
    let valorLinha;
    if (tipoValor === 'total' && recorrencia === 'parcelar' && qtd > 1) {
      valorLinha = Number((valorNum / qtd).toFixed(2));
    } else {
      valorLinha = valorNum;
    }
    const valorUlt = (tipoValor === 'total' && recorrencia === 'parcelar' && qtd > 1)
      ? Number((valorNum - valorLinha * (nLinhas - 1)).toFixed(2))
      : valorLinha;

    function addDias(iso, dias) {
      const d = new Date(`${iso}T12:00:00`);
      d.setDate(d.getDate() + dias);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }

    for (let i = 0; i < nLinhas; i++) {
      const numParcela = recorrencia === 'parcelar' ? parcIni + i : (recorrencia === 'fixa_mensal' ? null : null);
      const vencStr    = i === 0 ? vencimento : addDias(vencimento, i * periodicidade);
      const valorInsert = i === nLinhas - 1 ? valorUlt : valorLinha;

      await api.request('/contas-receber/manual', {
        method: 'POST',
        body: {
          empresa:       api.getEmpresaNome(),
          empresa_id:    api.getEmpresaId(),
          cliente_id:    clienteId || null,
          cliente_nome:  nomeManual,
          valor:         valorInsert,
          data_vencimento: vencStr,
          descricao,
          observacao,
          forma_pagamento: formaRecebimento,
          parcela:        recorrencia === 'parcelar' ? numParcela : null,
          total_parcelas: recorrencia === 'parcelar' ? totParcelas : null
        }
      });
    }

    const msg = nLinhas > 1
      ? `${nLinhas} título(s) cadastrado(s) com sucesso.`
      : 'Conta manual cadastrada com sucesso.';
    showMessage(msg, 'success');
    modal.remove();
    await recarregar();
  } catch (error) {
    console.error('Erro ao salvar conta manual:', error);
    showMessage(buildFriendlyError(error), 'error');
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
