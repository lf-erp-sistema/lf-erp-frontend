import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';

const STATUS_LABEL = {
  aberta:           'Aberta',
  diagnostico:      'Em Diagnóstico',
  aguardando_peca:  'Aguardando Peça',
  em_execucao:      'Em Execução',
  pronto:           'Pronto p/ Retirada',
  entregue:         'Entregue',
  cancelada:        'Cancelada'
};

const STATUS_BADGE = {
  aberta:           'badge--info',
  diagnostico:      'badge--warning',
  aguardando_peca:  'badge--warning',
  em_execucao:      'badge--primary',
  pronto:           'badge--success',
  entregue:         '',
  cancelada:        'badge--danger'
};

// Fluxo linear de avanço de status
const PROXIMO_STATUS = {
  aberta:          'diagnostico',
  diagnostico:     'em_execucao',
  aguardando_peca: 'em_execucao',
  em_execucao:     'pronto',
  pronto:          'entregue'
};

const EQUIPAMENTOS = ['Celular', 'Notebook', 'Computador', 'Tablet', 'Smartwatch', 'Impressora', 'Outro'];

const OrdensServicoModule = {
  state: {
    ordens: [],
    total: 0,
    filtroStatus: '',
    busca: '',
    carregando: false,
    paginaAtual: 0,
    porPagina: 25
  },

  init() {
    this.render();
    this.bindShellEvents();
    this.load();
  },

  async load() {
    this.state.carregando = true;
    this.setFeedback('Carregando ordens de serviço...', 'info');
    try {
      const q = { limit: this.state.porPagina, offset: this.state.paginaAtual * this.state.porPagina };
      if (this.state.filtroStatus) q.status = this.state.filtroStatus;
      if (this.state.busca)        q.busca   = this.state.busca;

      const result = await api.getOrdensServico(q);
      this.state.ordens = result?.ordens || [];
      this.state.total  = result?.total  || 0;
      this.renderLista();
      this.setFeedback('', '');
    } catch (err) {
      console.error('[os] load:', err);
      this.setFeedback('Erro ao carregar ordens de serviço.', 'error');
    } finally {
      this.state.carregando = false;
    }
  },

  render() {
    const c = document.getElementById('ordensServicoContainer');
    if (!c) return;

    const filtros = ['', 'aberta', 'diagnostico', 'aguardando_peca', 'em_execucao', 'pronto', 'entregue', 'cancelada'];

    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="osFeedback"></div>

        <div class="module-toolbar">
          <div class="table-actions" style="flex-wrap:wrap;gap:4px">
            ${filtros.map(s => `
              <button class="btn-inline ${this.state.filtroStatus === s ? 'btn-inline--active' : ''}" data-os-filtro="${s}">
                ${s === '' ? 'Todos' : STATUS_LABEL[s]}
              </button>`).join('')}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="search" id="osBusca" class="input-sm" placeholder="Buscar cliente ou equipamento..." value="${this.state.busca}" style="min-width:220px">
            <button class="btn btn-light" id="osAtualizarBtn"><i class="fa-solid fa-rotate"></i> Atualizar</button>
            <button class="btn btn-primary" id="osNovaBtn"><i class="fa-solid fa-plus"></i> Nova OS</button>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table" id="osTabela">
            <thead>
              <tr>
                <th>Nº OS</th>
                <th>Cliente</th>
                <th>Equipamento</th>
                <th>Problema</th>
                <th>Técnico</th>
                <th>Total</th>
                <th>Entrada</th>
                <th>Previsão</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="osTbody"><tr><td colspan="10" class="text-center text-muted">Carregando...</td></tr></tbody>
          </table>
        </div>

        <div id="osPaginacao" class="pagination-bar"></div>
      </section>

      <!-- Modal OS -->
      <div class="modal-overlay hidden" id="osModal" role="dialog" aria-modal="true">
        <div class="modal-card modal-card--large">
          <div class="modal-card__header">
            <div>
              <h3 id="osModalTitulo">Nova Ordem de Serviço</h3>
              <p style="margin:0;font-size:13px;color:var(--text-muted)">Preencha os dados do equipamento e do serviço</p>
            </div>
            <button type="button" class="icon-button" id="osModalFechar" aria-label="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div id="osModalBody" style="padding:24px;overflow-y:auto;max-height:calc(90vh - 90px)"></div>
        </div>
      </div>
    `;
  },

  renderLista() {
    const tbody = document.getElementById('osTbody');
    if (!tbody) return;

    if (!this.state.ordens.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">Nenhuma ordem encontrada.</td></tr>`;
      this.renderPaginacao();
      return;
    }

    const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
    const trunc = (t, n = 40) => t && t.length > n ? t.slice(0, n) + '...' : (t || '—');

    tbody.innerHTML = this.state.ordens.map(os => {
      const prox = PROXIMO_STATUS[os.status];
      const equip = [os.equipamento_tipo, os.equipamento_marca, os.equipamento_modelo].filter(Boolean).join(' · ') || '—';
      return `
        <tr>
          <td><strong>${os.numero}</strong></td>
          <td>${os.cliente_nome || '—'}<br><small class="text-muted">${os.cliente_telefone || ''}</small></td>
          <td title="${equip}">${trunc(equip, 35)}</td>
          <td title="${os.problema_relatado || ''}">${trunc(os.problema_relatado, 35)}</td>
          <td>${os.tecnico || '—'}</td>
          <td style="font-variant-numeric:tabular-nums">${fmt(os.valor_total)}</td>
          <td>${fmtData(os.data_entrada)}</td>
          <td>${fmtData(os.data_prevista)}</td>
          <td><span class="badge ${STATUS_BADGE[os.status] || ''}">${STATUS_LABEL[os.status] || os.status}</span></td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:nowrap">
              <button class="btn-icon btn-icon--sm" data-os-editar="${os.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button class="btn-icon btn-icon--sm" data-os-imprimir="${os.id}" title="Imprimir OS"><i class="fa-solid fa-print"></i></button>
              ${prox ? `<button class="btn-icon btn-icon--sm btn-icon--success" data-os-avancar="${os.id}" data-os-prox="${prox}" title="Avançar para: ${STATUS_LABEL[prox]}"><i class="fa-solid fa-arrow-right"></i></button>` : ''}
              ${os.status !== 'entregue' && os.status !== 'cancelada'
                ? `<button class="btn-icon btn-icon--sm btn-icon--danger" data-os-cancelar="${os.id}" title="Cancelar OS"><i class="fa-solid fa-ban"></i></button>`
                : ''}
              <button class="btn-icon btn-icon--sm btn-icon--danger" data-os-excluir="${os.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
    }).join('');

    this.renderPaginacao();
  },

  renderPaginacao() {
    const bar = document.getElementById('osPaginacao');
    if (!bar) return;
    const total  = this.state.total;
    const pp     = this.state.porPagina;
    const paginas = Math.ceil(total / pp);
    const atual  = this.state.paginaAtual;
    if (paginas <= 1) { bar.innerHTML = ''; return; }

    bar.innerHTML = `
      <button class="btn-icon btn-icon--sm" data-os-pag="${atual - 1}" ${atual === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
      <span>Página ${atual + 1} de ${paginas} (${total} registros)</span>
      <button class="btn-icon btn-icon--sm" data-os-pag="${atual + 1}" ${atual >= paginas - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`;
  },

  // ── Modal de criação/edição ──────────────────────────────────────────────
  async abrirModal(id = null) {
    const modal    = document.getElementById('osModal');
    const titulo   = document.getElementById('osModalTitulo');
    const body     = document.getElementById('osModalBody');
    if (!modal) return;

    let os = null;
    let itens = [];
    if (id) {
      try {
        const res = await api.getOrdemServico(id);
        os    = res.ordem;
        itens = res.itens || [];
      } catch {
        showToast('Erro ao carregar OS.', 'error');
        return;
      }
    }

    titulo.textContent = os ? `Editar OS — ${os.numero}` : 'Nova Ordem de Serviço';

    const fmtVal = (v) => v != null ? Number(v).toFixed(2).replace('.', ',') : '';
    const fmtDate = (d) => d ? d.slice(0, 10) : '';

    body.innerHTML = `
      <form id="osForm" autocomplete="off">
        <div class="form-grid form-grid--2">
          <div class="form-group">
            <label>Cliente</label>
            <input type="text" id="osClienteNome" class="input" placeholder="Nome do cliente" value="${os?.cliente_nome || ''}">
            <input type="hidden" id="osClienteId" value="${os?.cliente_id || ''}">
          </div>
          <div class="form-group">
            <label>Técnico Responsável</label>
            <input type="text" id="osTecnico" class="input" placeholder="Nome do técnico" value="${os?.tecnico || ''}">
          </div>
        </div>

        <fieldset class="form-fieldset">
          <legend>Equipamento</legend>
          <div class="form-grid form-grid--4">
            <div class="form-group">
              <label>Tipo *</label>
              <select id="osEquipTipo" class="input">
                <option value="">Selecione</option>
                ${EQUIPAMENTOS.map(e => `<option value="${e}" ${os?.equipamento_tipo === e ? 'selected' : ''}>${e}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Marca</label>
              <input type="text" id="osEquipMarca" class="input" placeholder="Ex: Samsung" value="${os?.equipamento_marca || ''}">
            </div>
            <div class="form-group">
              <label>Modelo</label>
              <input type="text" id="osEquipModelo" class="input" placeholder="Ex: Galaxy A54" value="${os?.equipamento_modelo || ''}">
            </div>
            <div class="form-group">
              <label>Nº Série / IMEI</label>
              <input type="text" id="osEquipSerie" class="input" placeholder="Nº série ou IMEI" value="${os?.equipamento_serie || ''}">
            </div>
          </div>
        </fieldset>

        <div class="form-grid form-grid--2">
          <div class="form-group">
            <label>Problema Relatado *</label>
            <textarea id="osProblema" class="input" rows="3" placeholder="Descreva o defeito informado pelo cliente">${os?.problema_relatado || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Diagnóstico Técnico</label>
            <textarea id="osDiagnostico" class="input" rows="3" placeholder="Diagnóstico após análise">${os?.diagnostico || ''}</textarea>
          </div>
        </div>

        <div class="form-group">
          <label>Serviços Realizados</label>
          <textarea id="osServicos" class="input" rows="2" placeholder="Descreva os serviços executados">${os?.servicos_realizados || ''}</textarea>
        </div>

        <fieldset class="form-fieldset">
          <legend>Peças / Insumos Utilizados</legend>
          <div id="osItensLista"></div>
          <button type="button" class="btn btn-light btn-sm" id="osAddItemBtn"><i class="fa-solid fa-plus"></i> Adicionar item</button>
        </fieldset>

        <div class="form-grid form-grid--3">
          <div class="form-group">
            <label>Mão de Obra (R$)</label>
            <input type="text" id="osMaoObra" class="input" placeholder="0,00" value="${os ? fmtVal(os.valor_mao_obra) : ''}">
          </div>
          <div class="form-group">
            <label>Data Prevista de Entrega</label>
            <input type="date" id="osDataPrevista" class="input" value="${fmtDate(os?.data_prevista)}">
          </div>
          <div class="form-group">
            <label>Observações</label>
            <input type="text" id="osObs" class="input" placeholder="Informações adicionais" value="${os?.observacoes || ''}">
          </div>
        </div>
      </form>

      <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:16px;border-top:1px solid var(--border);margin-top:4px">
        <button type="button" class="btn btn-light" id="osModalCancelarBtn">Cancelar</button>
        <button type="button" class="btn btn-primary" id="osSalvarBtn">
          <i class="fa-solid fa-floppy-disk"></i> ${os ? 'Salvar alterações' : 'Abrir OS'}
        </button>
      </div>`;

    // Renderiza itens existentes
    const listaItens = document.getElementById('osItensLista');
    itens.forEach(item => this.adicionarLinhaItem(listaItens, item));

    // Busca de cliente (simples — digita e abre OS com nome livre)
    const clienteNomeInput = document.getElementById('osClienteNome');
    clienteNomeInput.addEventListener('input', async () => {
      const v = clienteNomeInput.value.trim();
      if (v.length < 2) return;
      try {
        const r = await api.getClientes({ busca: v, limit: 5 });
        const lista = r?.clientes || r || [];
        const old = document.getElementById('osClienteSugestoes');
        if (old) old.remove();
        if (!lista.length) return;
        const dl = document.createElement('datalist');
        dl.id = 'osClienteSugestoes';
        lista.forEach(c => { const opt = document.createElement('option'); opt.value = c.nome; opt.dataset.id = c.id; dl.appendChild(opt); });
        clienteNomeInput.setAttribute('list', 'osClienteSugestoes');
        clienteNomeInput.parentNode.appendChild(dl);
      } catch { /* silencia */ }
    });

    document.getElementById('osAddItemBtn').addEventListener('click', () => {
      this.adicionarLinhaItem(document.getElementById('osItensLista'));
    });

    document.getElementById('osModalCancelarBtn').addEventListener('click', () => this.fecharModal());

    document.getElementById('osSalvarBtn').addEventListener('click', async () => {
      await this.salvarOS(id);
    });

    modal.classList.remove('hidden');
  },

  adicionarLinhaItem(container, item = null) {
    const row = document.createElement('div');
    row.className = 'os-item-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 100px 100px 28px;gap:6px;margin-bottom:6px;align-items:center';
    row.innerHTML = `
      <input type="text"   class="input input-sm os-item-desc"  placeholder="Descrição da peça/serviço" value="${item?.descricao || ''}">
      <input type="number" class="input input-sm os-item-qty"   placeholder="Qtd"   step="0.001" min="0" value="${item?.quantidade || 1}">
      <input type="text"   class="input input-sm os-item-vunit" placeholder="R$ unit." value="${item ? Number(item.valor_unitario).toFixed(2).replace('.', ',') : ''}">
      <input type="text"   class="input input-sm os-item-vtotal" placeholder="Total" readonly style="background:var(--bg-subtle,#f8f9fa)">
      <button type="button" class="btn-icon btn-icon--sm btn-icon--danger os-item-rm" title="Remover"><i class="fa-solid fa-trash"></i></button>`;

    const qty   = row.querySelector('.os-item-qty');
    const vunit = row.querySelector('.os-item-vunit');
    const vtot  = row.querySelector('.os-item-vtotal');

    const calc = () => {
      const q = parseFloat(String(qty.value).replace(',', '.')) || 0;
      const v = parseFloat(String(vunit.value).replace(',', '.')) || 0;
      vtot.value = (q * v).toFixed(2).replace('.', ',');
    };
    if (item) calc();
    qty.addEventListener('input', calc);
    vunit.addEventListener('input', calc);
    row.querySelector('.os-item-rm').addEventListener('click', () => row.remove());

    container.appendChild(row);
  },

  coletarItens() {
    return [...document.querySelectorAll('.os-item-row')].map(row => ({
      descricao:      row.querySelector('.os-item-desc').value.trim(),
      quantidade:     parseFloat(String(row.querySelector('.os-item-qty').value).replace(',', '.')) || 1,
      valor_unitario: parseFloat(String(row.querySelector('.os-item-vunit').value).replace(',', '.')) || 0
    })).filter(i => i.descricao);
  },

  async salvarOS(id) {
    const btn = document.getElementById('osSalvarBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }

    try {
      const payload = {
        cliente_id:          document.getElementById('osClienteId').value || null,
        equipamento_tipo:    document.getElementById('osEquipTipo').value,
        equipamento_marca:   document.getElementById('osEquipMarca').value,
        equipamento_modelo:  document.getElementById('osEquipModelo').value,
        equipamento_serie:   document.getElementById('osEquipSerie').value,
        problema_relatado:   document.getElementById('osProblema').value,
        diagnostico:         document.getElementById('osDiagnostico').value,
        servicos_realizados: document.getElementById('osServicos').value,
        tecnico:             document.getElementById('osTecnico').value,
        valor_mao_obra:      document.getElementById('osMaoObra').value,
        data_prevista:       document.getElementById('osDataPrevista').value || null,
        observacoes:         document.getElementById('osObs').value,
        itens:               this.coletarItens()
      };

      if (!payload.equipamento_tipo && !payload.problema_relatado) {
        showToast('Informe pelo menos o tipo de equipamento e o problema relatado.', 'warning');
        return;
      }

      if (id) {
        await api.atualizarOrdemServico(id, payload);
        showToast('OS atualizada com sucesso.', 'success');
      } else {
        await api.criarOrdemServico(payload);
        showToast('OS aberta com sucesso.', 'success');
      }

      this.fecharModal();
      await this.load();
    } catch (err) {
      console.error('[os] salvarOS:', err);
      showToast(err?.message || 'Erro ao salvar OS.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${id ? 'Salvar alterações' : 'Abrir OS'}`; btn.type = 'button'; }
    }
  },

  fecharModal() {
    const modal = document.getElementById('osModal');
    if (modal) modal.classList.add('hidden');
  },

  // ── Impressão da OS ──────────────────────────────────────────────────────
  async imprimirOS(id) {
    try {
      const { ordem: os, itens } = await api.getOrdemServico(id);
      const fmt    = (v)  => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const fmtD   = (d)  => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
      const equip  = [os.equipamento_tipo, os.equipamento_marca, os.equipamento_modelo].filter(Boolean).join(' — ') || '—';

      const itensHtml = itens.length
        ? itens.map((it, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${it.descricao}</td>
              <td style="text-align:center">${Number(it.quantidade)}</td>
              <td style="text-align:right">${fmt(it.valor_unitario)}</td>
              <td style="text-align:right">${fmt(it.valor_total)}</td>
            </tr>`).join('')
        : `<tr><td colspan="5" style="text-align:center;color:#888">Nenhuma peça registrada</td></tr>`;

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>OS ${os.numero}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
  h1  { font-size: 16px; }
  h2  { font-size: 13px; margin-bottom: 6px; color: #1d4ed8; border-bottom: 1px solid #1d4ed8; padding-bottom: 2px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  .header-left h1 { font-size: 18px; color: #1d4ed8; }
  .header-right { text-align: right; }
  .os-num { font-size: 22px; font-weight: bold; color: #1d4ed8; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; background: #dbeafe; color: #1d4ed8; font-weight: bold; font-size: 11px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .field { margin-bottom: 6px; }
  .field label { display: block; font-size: 9px; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 2px; }
  .field span  { display: block; border-bottom: 1px solid #ccc; padding-bottom: 2px; min-height: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #ddd; padding: 4px 6px; }
  th { background: #eff6ff; font-size: 10px; }
  .totals { width: 260px; margin-left: auto; }
  .totals tr td:first-child { font-weight: bold; }
  .totals .total-final td { font-size: 13px; font-weight: bold; background: #eff6ff; }
  .terms { margin-top: 16px; font-size: 9px; color: #444; border-top: 1px solid #ccc; padding-top: 10px; }
  .terms h3 { font-size: 10px; margin-bottom: 4px; }
  .terms ol { padding-left: 14px; }
  .terms li { margin-bottom: 4px; line-height: 1.4; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px; }
  .sig-line { border-top: 1px solid #555; padding-top: 4px; margin-top: 36px; font-size: 10px; text-align: center; }
  @media print {
    body { padding: 10px; }
    button { display: none; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>LF TechSolutions</h1>
    <p>Manutenção de Celulares e Computadores</p>
  </div>
  <div class="header-right">
    <div class="os-num">${os.numero}</div>
    <div class="status-badge">${STATUS_LABEL[os.status] || os.status}</div><br>
    <small>Abertura: ${fmtD(os.data_entrada)}</small>
  </div>
</div>

<h2>Dados do Cliente</h2>
<div class="grid3">
  <div class="field"><label>Nome</label><span>${os.cliente_nome || os.cliente_id || '—'}</span></div>
  <div class="field"><label>Telefone</label><span>${os.cliente_telefone || '—'}</span></div>
  <div class="field"><label>CPF</label><span>${os.cliente_cpf || '—'}</span></div>
</div>
<div class="field" style="margin-bottom:10px"><label>Endereço</label><span>${os.cliente_endereco || '—'}</span></div>

<h2>Equipamento</h2>
<div class="grid2">
  <div class="field"><label>Tipo / Marca / Modelo</label><span>${equip}</span></div>
  <div class="field"><label>Nº Série / IMEI</label><span>${os.equipamento_serie || '—'}</span></div>
</div>

<h2>Diagnóstico</h2>
<div class="grid2">
  <div class="field"><label>Problema Relatado pelo Cliente</label><span style="min-height:40px">${os.problema_relatado || '—'}</span></div>
  <div class="field"><label>Diagnóstico Técnico</label><span style="min-height:40px">${os.diagnostico || '—'}</span></div>
</div>
<div class="field" style="margin-bottom:10px"><label>Serviços Realizados</label><span style="min-height:32px">${os.servicos_realizados || '—'}</span></div>

<div class="grid3">
  <div class="field"><label>Técnico Responsável</label><span>${os.tecnico || '—'}</span></div>
  <div class="field"><label>Previsão de Entrega</label><span>${fmtD(os.data_prevista)}</span></div>
  <div class="field"><label>Data de Conclusão</label><span>${fmtD(os.data_conclusao)}</span></div>
</div>

<h2>Peças e Insumos</h2>
<table>
  <thead>
    <tr><th>#</th><th>Descrição</th><th>Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr>
  </thead>
  <tbody>${itensHtml}</tbody>
</table>

<table class="totals">
  <tr><td>Mão de Obra</td><td style="text-align:right">${fmt(os.valor_mao_obra)}</td></tr>
  <tr><td>Peças</td><td style="text-align:right">${fmt(os.valor_pecas)}</td></tr>
  <tr class="total-final"><td>TOTAL</td><td style="text-align:right">${fmt(os.valor_total)}</td></tr>
</table>

${os.observacoes ? `<div class="field" style="margin-bottom:12px"><label>Observações</label><span>${os.observacoes}</span></div>` : ''}

<div class="terms">
  <h3>TERMOS E CONDIÇÕES DE SERVIÇO</h3>
  <ol>
    <li><strong>Backup de dados:</strong> A empresa não se responsabiliza por perda de dados, arquivos, fotos ou aplicativos contidos no dispositivo. Recomenda-se realizar backup antes da entrega.</li>
    <li><strong>Garantia:</strong> Os serviços realizados possuem garantia de <strong>90 (noventa) dias</strong> a contar da data de retirada, exceto em casos de mau uso, queda, umidade, danos físicos ou intervenção de terceiros após a entrega.</li>
    <li><strong>Conferência na retirada:</strong> O cliente compromete-se a conferir o equipamento na presença do técnico no ato da retirada. Reclamações posteriores somente serão aceitas dentro do prazo de garantia.</li>
    <li><strong>Abandono de equipamento:</strong> Decorridos <strong>120 (cento e vinte) dias</strong> após a comunicação do diagnóstico ou conclusão do serviço, sem que o cliente efetue o pagamento e retire o equipamento, o dispositivo será considerado <strong>abandonado</strong>, nos termos do art. 1.263 do Código Civil Brasileiro. Nesta hipótese, a empresa reserva-se o direito de dar ao equipamento a destinação que julgar conveniente, inclusive para compensação das despesas com o serviço prestado, sem qualquer ônus ou responsabilidade perante o cliente.</li>
    <li><strong>Orçamento não aprovado:</strong> Caso o cliente não aprove o orçamento apresentado, será cobrada uma taxa de diagnóstico conforme tabela vigente.</li>
    <li><strong>Aceite:</strong> Ao assinar esta Ordem de Serviço, o cliente declara que leu, entendeu e concorda com todos os termos acima.</li>
  </ol>
</div>

<div class="signatures">
  <div>
    <div class="sig-line">Assinatura do Cliente</div>
    <div style="text-align:center;font-size:9px;margin-top:4px">Data: ____/____/________</div>
  </div>
  <div>
    <div class="sig-line">Assinatura do Técnico — ${os.tecnico || '__________________'}</div>
  </div>
</div>

<script>window.print(); window.addEventListener('afterprint', () => window.close());<\/script>
</body></html>`;

      const win = window.open('', '_blank', 'width=800,height=900');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      console.error('[os] imprimir:', err);
      showToast('Erro ao gerar impressão da OS.', 'error');
    }
  },

  // ── Eventos ──────────────────────────────────────────────────────────────
  bindShellEvents() {
    const c = document.getElementById('ordensServicoContainer');
    if (!c) return;

    c.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-os-filtro],[data-os-editar],[data-os-imprimir],[data-os-avancar],[data-os-cancelar],[data-os-excluir],[data-os-pag]');
      if (!btn) return;

      if (btn.dataset.osFiltro !== undefined) {
        this.state.filtroStatus = btn.dataset.osFiltro;
        this.state.paginaAtual  = 0;
        c.querySelectorAll('[data-os-filtro]').forEach(b => b.classList.remove('btn-inline--active'));
        btn.classList.add('btn-inline--active');
        await this.load();
        return;
      }

      if (btn.dataset.osEditar) {
        await this.abrirModal(Number(btn.dataset.osEditar));
        return;
      }

      if (btn.dataset.osImprimir) {
        await this.imprimirOS(Number(btn.dataset.osImprimir));
        return;
      }

      if (btn.dataset.osAvancar) {
        const ok = await confirmarAcao(`Avançar status para "${STATUS_LABEL[btn.dataset.osProx]}"?`);
        if (!ok) return;
        try {
          await api.atualizarStatusOS(Number(btn.dataset.osAvancar), btn.dataset.osProx);
          showToast('Status atualizado.', 'success');
          await this.load();
        } catch (err) {
          showToast(err?.message || 'Erro ao atualizar status.', 'error');
        }
        return;
      }

      if (btn.dataset.osCancelar) {
        const ok = await confirmarAcao('Cancelar esta OS?');
        if (!ok) return;
        try {
          await api.atualizarStatusOS(Number(btn.dataset.osCancelar), 'cancelada');
          showToast('OS cancelada.', 'success');
          await this.load();
        } catch (err) {
          showToast(err?.message || 'Erro ao cancelar.', 'error');
        }
        return;
      }

      if (btn.dataset.osExcluir) {
        const ok = await confirmarAcao('Excluir esta OS permanentemente?');
        if (!ok) return;
        try {
          await api.excluirOrdemServico(Number(btn.dataset.osExcluir));
          showToast('OS excluída.', 'success');
          await this.load();
        } catch (err) {
          showToast(err?.message || 'Erro ao excluir.', 'error');
        }
        return;
      }

      if (btn.dataset.osPag !== undefined) {
        const nova = Number(btn.dataset.osPag);
        if (nova < 0) return;
        this.state.paginaAtual = nova;
        await this.load();
        return;
      }
    });

    const novaBtn = document.getElementById('osNovaBtn');
    if (novaBtn) novaBtn.addEventListener('click', () => this.abrirModal());

    const atualizarBtn = document.getElementById('osAtualizarBtn');
    if (atualizarBtn) atualizarBtn.addEventListener('click', () => this.load());

    const busca = document.getElementById('osBusca');
    if (busca) {
      let timer;
      busca.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          this.state.busca = busca.value.trim();
          this.state.paginaAtual = 0;
          await this.load();
        }, 350);
      });
    }

    const overlay = document.getElementById('osModal');
    const fechar  = document.getElementById('osModalFechar');
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) this.fecharModal(); });
    if (fechar)  fechar.addEventListener('click', () => this.fecharModal());
  },

  setFeedback(msg, type) {
    const el = document.getElementById('osFeedback');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    const cls = { info: 'feedback--info', error: 'feedback--error', warning: 'feedback--warning', success: 'feedback--success' }[type] || '';
    el.innerHTML = `<div class="feedback ${cls}">${msg}</div>`;
  }
};

export function initOrdensServicoModule() {
  OrdensServicoModule.init();
}
