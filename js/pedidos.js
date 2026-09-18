import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';

const STATUS_BADGE = {
  pendente:      'badge--warning',
  confirmado:    'badge--info',
  em_separacao:  'badge--warning',
  enviado:       'badge--info',
  entregue:      'badge--success',
  cancelado:     'badge--danger',
  convertido:    ''
};

const STATUS_LABEL = {
  pendente:      'Pendente',
  confirmado:    'Confirmado',
  em_separacao:  'Em separação',
  enviado:       'Enviado',
  entregue:      'Entregue',
  cancelado:     'Cancelado',
  convertido:    'Convertido'
};

const PedidosModule = {
  state: {
    pedidos: [],
    filtroStatus: '',
    carregando: false
  },

  init() {
    this.render();
    this.bindShellEvents();
    this.load();
  },

  async load() {
    this.state.carregando = true;
    this.setFeedback('Carregando pedidos...', 'info');
    try {
      const q = {};
      if (this.state.filtroStatus) q.status = this.state.filtroStatus;
      const result = await api.getPedidos(q);
      this.state.pedidos = result?.pedidos || (Array.isArray(result) ? result : []);
      this.renderLista();
      this.setFeedback('', '');
    } catch (err) {
      console.error('[pedidos] load:', err);
      this.setFeedback('Erro ao carregar pedidos.', 'error');
    } finally {
      this.state.carregando = false;
    }
  },

  render() {
    const c = document.getElementById('pedidosContainer');
    if (!c) return;

    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="pedFeedback"></div>

        <div class="module-toolbar">
          <div class="table-actions">
            ${['', 'pendente', 'confirmado', 'em_separacao', 'cancelado', 'convertido'].map((s) => `
              <button class="btn-inline ${this.state.filtroStatus === s ? 'btn-inline--active' : ''}" data-ped-filtro="${s}">
                ${s === '' ? 'Todos' : STATUS_LABEL[s]}
              </button>
            `).join('')}
          </div>
          <button class="btn btn-light" id="pedAtualizarBtn">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>

        <div id="pedLista"></div>
      </section>
    `;
  },

  bindShellEvents() {
    const c = document.getElementById('pedidosContainer');
    if (!c) return;

    document.getElementById('pedAtualizarBtn')?.addEventListener('click', () => this.load());

    c.addEventListener('click', async (e) => {
      const filtroBtn = e.target.closest('[data-ped-filtro]');
      if (filtroBtn) {
        this.state.filtroStatus = filtroBtn.dataset.pedFiltro;
        document.querySelectorAll('[data-ped-filtro]').forEach((b) => b.classList.remove('btn-inline--active'));
        filtroBtn.classList.add('btn-inline--active');
        await this.load();
        return;
      }

      const acao = e.target.closest('[data-ped-acao]');
      if (!acao) return;
      const { pedAcao, pedId } = acao.dataset;
      await this.executarAcao(Number(pedId), pedAcao, acao);
    });
  },

  renderLista() {
    const c = document.getElementById('pedLista');
    if (!c) return;

    const lista = this.state.pedidos;

    if (!lista.length) {
      c.innerHTML = `<div class="module-feedback module-feedback--info">Nenhum pedido encontrado${this.state.filtroStatus ? ` com status "${STATUS_LABEL[this.state.filtroStatus]}"` : ''}.</div>`;
      return;
    }

    c.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Pagamento</th>
              <th>Previsão</th>
              <th>Itens</th>
              <th class="text-right">Total</th>
              <th>Criado em</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map((p) => this.renderLinha(p)).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderLinha(p) {
    const badge = STATUS_BADGE[p.status] || '';
    const data  = p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '-';
    const prev  = p.previsao_entrega ? this.fmtDate(p.previsao_entrega) : '-';
    const acoes = this.renderAcoes(p);

    return `
      <tr>
        <td><strong>#${p.numero}</strong>${p.orcamento_id ? `<div class="table-muted">Orc. #${p.orcamento_id}</div>` : ''}</td>
        <td>${this.esc(p.cliente_nome || 'Sem cliente')}</td>
        <td><span class="badge ${badge}">${STATUS_LABEL[p.status] || this.esc(p.status)}</span></td>
        <td>${this.esc(p.forma_pagamento || '-')}</td>
        <td>${prev}</td>
        <td>${Number(p.total_itens || 0)}</td>
        <td class="text-right"><strong>${this.fmtCur(p.total)}</strong></td>
        <td>${data}</td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
            ${acoes}
          </div>
        </td>
      </tr>
    `;
  },

  renderAcoes(p) {
    const btn = (label, acao, cls = '') =>
      `<button class="btn-inline ${cls}" data-ped-acao="${acao}" data-ped-id="${p.id}">${label}</button>`;

    const acoes = [];
    if (p.status === 'pendente') {
      acoes.push(btn('Confirmar', 'confirmar'));
      acoes.push(btn('Cancelar', 'cancelar', 'btn-inline--danger'));
    }
    if (p.status === 'confirmado') {
      acoes.push(btn('Em separação', 'separacao'));
      acoes.push(btn('Converter em Venda', 'converter'));
      acoes.push(btn('Cancelar', 'cancelar', 'btn-inline--danger'));
    }
    if (p.status === 'em_separacao') {
      acoes.push(btn('Converter em Venda', 'converter'));
      acoes.push(btn('Cancelar', 'cancelar', 'btn-inline--danger'));
    }
    return acoes.join('');
  },

  async executarAcao(id, acao, btnEl) {
    if (btnEl) btnEl.disabled = true;
    try {
      if (acao === 'confirmar') {
        await api.confirmarPedido(id);
        showToast('Pedido confirmado.', 'success');
      } else if (acao === 'separacao') {
        await api.separacaoPedido(id);
        showToast('Pedido em separação.', 'success');
      } else if (acao === 'cancelar') {
        if (!await confirmarAcao('Cancelar este pedido?', 'Cancelar', 'danger')) { if (btnEl) btnEl.disabled = false; return; }
        await api.cancelarPedido(id);
        showToast('Pedido cancelado.', 'info');
      } else if (acao === 'converter') {
        await this.converterEmVenda(id);
        return;
      }
      await this.load();
    } catch (err) {
      showToast(err.message || 'Erro ao executar ação.', 'error');
      if (btnEl) btnEl.disabled = false;
    }
  },

  async converterEmVenda(pedidoId) {
    const dados = await this.promptConversao();
    if (!dados) return;

    try {
      const result = await api.converterPedidoVenda(pedidoId, dados);
      const vendaId = result?.venda?.id ?? result?.id ?? '?';
      showToast(`Venda #${vendaId} criada com sucesso! Estoque baixado e financeiro gerado.`, 'success');
      await this.load();
    } catch (err) {
      showToast(err.message || 'Erro ao converter pedido em venda.', 'error');
    }
  },

  promptConversao() {
    return new Promise((resolve) => {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:460px;width:100%;box-shadow:0 24px 50px rgba(0,0,0,.2)">
          <h3 style="margin:0 0 6px;font-size:16px;font-weight:700">Converter Pedido em Venda</h3>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">Esta ação baixa o estoque e gera o financeiro. Confirme os dados da venda.</p>

          <div style="display:grid;gap:12px;margin-bottom:16px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Forma de pagamento</label>
              <select id="_pedFormaSelect" class="filter-input" style="width:100%">
                <option value="Dinheiro">Dinheiro</option>
                <option value="Pix">Pix</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Promissória">Promissória</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Data da venda</label>
              <input type="date" id="_pedDataVenda" class="filter-input" style="width:100%" value="${hoje}" />
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Observação (opcional)</label>
              <input type="text" id="_pedObsVenda" placeholder="Observação adicional" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box" />
            </div>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="_pedCancelarConv" class="btn-cancel">Cancelar</button>
            <button id="_pedConfirmarConv" class="btn-confirm">Converter em Venda</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#_pedCancelarConv').onclick = () => { document.body.removeChild(overlay); resolve(null); };
      overlay.querySelector('#_pedConfirmarConv').onclick = () => {
        const forma      = overlay.querySelector('#_pedFormaSelect').value;
        const data       = overlay.querySelector('#_pedDataVenda').value || hoje;
        const observacao = overlay.querySelector('#_pedObsVenda').value.trim() || null;
        document.body.removeChild(overlay);
        resolve({ forma_pagamento: forma, data, observacao });
      };
    });
  },

  setFeedback(msg, type = 'info') {
    const el = document.getElementById('pedFeedback');
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
    return new Date(v).toLocaleDateString('pt-BR');
  },

  esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
};

export async function initPedidosModule() {
  PedidosModule.init();
  await PedidosModule.load();
}

export default PedidosModule;
