import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

const STATUS_BADGE = {
  rascunho:   'badge--info',
  enviado:    'badge--warning',
  aprovado:   'badge--success',
  recusado:   'badge--danger',
  expirado:   '',
  convertido: ''
};

const STATUS_LABEL = {
  rascunho:   'Rascunho',
  enviado:    'Enviado',
  aprovado:   'Aprovado',
  recusado:   'Recusado',
  expirado:   'Expirado',
  convertido: 'Convertido'
};

const esc = escapeHtml;

function injectOrcamentosStyles() {
  if (document.getElementById('orcStyles')) return;
  const s = document.createElement('style');
  s.id = 'orcStyles';
  s.textContent = `
    .orc-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
    }
    .orc-empty i { font-size: 2.2rem; opacity: .25; margin-bottom: 4px; color: var(--text-muted); }
    .orc-empty strong { font-size: 15px; color: var(--text); }
    .orc-empty p { font-size: 13px; margin: 0; color: var(--text-muted); }
  `;
  document.head.appendChild(s);
}

const OrcamentosModule = {
  state: {
    orcamentos: [],
    filtroStatus: '',
    carregando: false
  },

  init() {
    injectOrcamentosStyles();
    this.render();
    this.bindShellEvents();
    this.load();
  },

  async load() {
    if (this.state.carregando) return;
    this.state.carregando = true;
    this.setFeedback('', '');
    const listEl = document.getElementById('orcLista');
    if (listEl) listEl.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 4}).map(() => '<div class="skeleton-line" style="height:40px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const q = {};
      if (this.state.filtroStatus) q.status = this.state.filtroStatus;
      const result = await api.getOrcamentos(q);
      this.state.orcamentos = result?.orcamentos || (Array.isArray(result) ? result : []);
      this.renderLista();
    } catch (err) {
      console.error('[orcamentos] load:', err);
      this.setFeedback(buildFriendlyError(err), 'error');
    } finally {
      this.state.carregando = false;
    }
  },

  render() {
    const c = document.getElementById('orcamentosContainer');
    if (!c) return;

    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="orcFeedback"></div>

        <div class="module-toolbar">
          <div class="table-actions">
            ${['', 'rascunho', 'enviado', 'aprovado', 'recusado', 'convertido'].map((s) => `
              <button class="btn-inline ${this.state.filtroStatus === s ? 'btn-inline--active' : ''}" data-orc-filtro="${s}">
                ${s === '' ? 'Todos' : STATUS_LABEL[s]}
              </button>
            `).join('')}
          </div>
          <button class="btn btn-light" id="orcAtualizarBtn">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>

        <div id="orcLista"></div>
      </section>
    `;
  },

  bindShellEvents() {
    const c = document.getElementById('orcamentosContainer');
    if (!c) return;

    document.getElementById('orcAtualizarBtn')?.addEventListener('click', () => {
      if (this.state.carregando) return;
      this.load();
    });

    c.addEventListener('click', async (e) => {
      const filtroBtn = e.target.closest('[data-orc-filtro]');
      if (filtroBtn) {
        this.state.filtroStatus = filtroBtn.dataset.orcFiltro;
        document.querySelectorAll('[data-orc-filtro]').forEach((b) => b.classList.remove('btn-inline--active'));
        filtroBtn.classList.add('btn-inline--active');
        await this.load();
        return;
      }

      const acao = e.target.closest('[data-orc-acao]');
      if (!acao) return;
      const { orcAcao, orcId } = acao.dataset;
      await this.executarAcao(Number(orcId), orcAcao, acao);
    });
  },

  renderLista() {
    const c = document.getElementById('orcLista');
    if (!c) return;

    const lista = this.state.orcamentos;

    if (!lista.length) {
      const filtro = this.state.filtroStatus;
      c.innerHTML = `<div class="orc-empty">
        <i class="fa-solid fa-file-contract"></i>
        <strong>${filtro ? `Nenhum orçamento com status "${STATUS_LABEL[filtro] || filtro}"` : 'Nenhum orçamento encontrado'}</strong>
        <p>${filtro ? 'Tente selecionar outro filtro de status.' : 'Crie o primeiro orçamento para começar.'}</p>
      </div>`;
      return;
    }

    c.innerHTML = `
      <div class="module-count" style="margin-bottom:10px;font-size:.82rem;color:var(--text-muted)">${lista.length} orçamento(s) encontrado(s)</div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Validade</th>
              <th>Itens</th>
              <th class="text-right">Total</th>
              <th>Criado em</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map((o) => this.renderLinha(o)).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderLinha(o) {
    const badge = STATUS_BADGE[o.status] || '';
    const data  = o.criado_em ? new Date(o.criado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' }) : '-';
    const valid = o.validade ? this.fmtDate(o.validade) : '-';
    const acoes = this.renderAcoes(o);

    return `
      <tr>
        <td><strong>#${o.numero}</strong></td>
        <td>${esc(o.cliente_nome || 'Sem cliente')}</td>
        <td><span class="badge ${badge}">${STATUS_LABEL[o.status] || esc(o.status)}</span></td>
        <td>${valid}</td>
        <td>${Number(o.total_itens || 0)}</td>
        <td class="text-right"><strong>${this.fmtCur(o.total)}</strong></td>
        <td>${data}</td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
            ${acoes}
          </div>
        </td>
      </tr>
    `;
  },

  renderAcoes(o) {
    const btn = (label, acao, cls = '') =>
      `<button class="btn-inline ${cls}" data-orc-acao="${acao}" data-orc-id="${o.id}">${label}</button>`;

    const acoes = [];
    // PDF disponível para qualquer status exceto excluído
    if (!['expirado'].includes(o.status)) {
      acoes.push(btn('<i class="fa-solid fa-file-pdf"></i> PDF', 'pdf'));
    }
    if (o.status === 'rascunho') {
      acoes.push(btn('Enviar', 'enviar'));
      acoes.push(btn('Excluir', 'excluir', 'btn-inline--danger'));
    }
    if (o.status === 'enviado') {
      acoes.push(btn('Aprovar', 'aprovar'));
      acoes.push(btn('Recusar', 'recusar', 'btn-inline--danger'));
    }
    if (o.status === 'aprovado') {
      acoes.push(btn('Converter em Pedido', 'converter'));
    }
    return acoes.join('');
  },

  async gerarPdf(id) {
    try {
      showToast('Carregando orçamento...', 'info');
      const result = await api.getOrcamento(id);
      const orc = result?.orcamento || result;
      localStorage.setItem('lf_erp_orcamento_pdf', JSON.stringify(orc));
      window.open('./orcamento-pdf.html', '_blank');
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  async executarAcao(id, acao, btnEl) {
    if (btnEl) btnEl.disabled = true;
    try {
      if (acao === 'pdf') { await this.gerarPdf(id); if (btnEl) btnEl.disabled = false; return; }
      if (acao === 'enviar') {
        await api.enviarOrcamento(id);
        showToast('Orçamento marcado como enviado.', 'success');
      } else if (acao === 'aprovar') {
        await api.aprovarOrcamento(id);
        showToast('Orçamento aprovado.', 'success');
      } else if (acao === 'recusar') {
        await api.recusarOrcamento(id);
        showToast('Orçamento recusado.', 'info');
      } else if (acao === 'excluir') {
        if (!await confirmarAcao('Excluir este orçamento em rascunho?', 'Excluir', 'danger')) { if (btnEl) btnEl.disabled = false; return; }
        await api.deleteOrcamento(id);
        showToast('Orçamento excluído.', 'success');
      } else if (acao === 'converter') {
        await this.converterEmPedido(id);
        return;
      }
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
      if (btnEl) btnEl.disabled = false;
    }
  },

  async converterEmPedido(orcId) {
    const forma = await this.promptFormaPagamento('Converter Orçamento em Pedido', 'Informe a forma de pagamento (opcional):');
    if (forma === undefined) return;
    try {
      const result = await api.converterOrcamentoPedido(orcId, { forma_pagamento: forma || null });
      const num = result?.pedido?.numero ?? result?.numero ?? '?';
      showToast(`Pedido #${num} criado com sucesso.`, 'success');
      await this.load();
    } catch (err) {
      showToast(buildFriendlyError(err), 'error');
    }
  },

  promptFormaPagamento(titulo, descricao) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 8px;font-size:16px;font-weight:700">${titulo}</h3>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">${descricao}</p>
          <select id="_orcFormaSelect" class="filter-input" style="width:100%;margin-bottom:14px">
            <option value="">Não informado</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Pix">Pix</option>
            <option value="Cartão de Débito">Cartão de Débito</option>
            <option value="Cartão de Crédito">Cartão de Crédito</option>
            <option value="Promissória">Promissória</option>
          </select>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="_orcCancelarConv" class="btn-cancel">Cancelar</button>
            <button id="_orcConfirmarConv" class="btn-confirm">Converter</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.querySelector('#_orcFormaSelect')?.focus(), 50);
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(undefined); }
      });
      overlay.querySelector('#_orcCancelarConv').onclick = () => { document.body.removeChild(overlay); resolve(undefined); };
      overlay.querySelector('#_orcConfirmarConv').onclick = () => {
        const val = overlay.querySelector('#_orcFormaSelect').value;
        document.body.removeChild(overlay);
        resolve(val || null);
      };
    });
  },

  setFeedback(msg, type = 'info') {
    const el = document.getElementById('orcFeedback');
    if (!el) return;
    if (!msg) { el.className = 'module-feedback'; el.textContent = ''; return; }
    el.className = `module-feedback module-feedback--${type}`;
    el.textContent = msg;
  },

  fmtCur(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  fmtDate(v) {
    if (!v) return '-';
    if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) {
      const [ano, mes, dia] = String(v).slice(0, 10).split('-');
      return `${dia}/${mes}/${ano}`;
    }
    return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
  }
};

export async function initOrcamentosModule() {
  OrcamentosModule.init();
}

export default OrcamentosModule;
