import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';
const esc = escapeHtml;

function moeda(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function pct(v, total) { return total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '—'; }

function injectFiliaisStyles() {
  if (document.getElementById('filStyles')) return;
  const s = document.createElement('style');
  s.id = 'filStyles';
  s.textContent = `
    .fil-tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); }
    .fil-tab-btn { padding:10px 16px; border:none; background:none; font-size:13px; font-weight:500; color:var(--text-muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; display:flex; align-items:center; gap:6px; transition:.15s; }
    .fil-tab-btn.active { color:var(--primary); border-color:var(--primary); }
    .fil-tab-btn:hover:not(.active) { color:var(--text); }

    .fil-periodo-bar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 18px; margin-bottom:20px; }
    .fil-kpis { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
    .fil-kpi { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 20px; flex:1; min-width:130px; }
    .fil-kpi--green { border-color:#86efac; }
    .fil-kpi--red   { border-color:#fca5a5; }
    .fil-kpi-label { font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.4px; margin-bottom:4px; }
    .fil-kpi-val { font-size:1.4rem; font-weight:700; }
    .fil-kpi-sub { font-size:11px; color:var(--text-muted); margin-top:2px; }

    .fil-section-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px; }
    .fil-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
    .fil-table-wrap tfoot td { padding:11px 14px; font-size:13px; }

    .fil-bars { display:flex; align-items:flex-end; gap:16px; padding:16px; background:var(--surface); border:1px solid var(--border); border-radius:12px; min-height:200px; }
    .fil-bar-col { display:flex; flex-direction:column; align-items:center; gap:6px; flex:1; }
    .fil-bar-val { font-size:10px; color:var(--text-muted); text-align:center; font-weight:600; }
    .fil-bar { width:100%; border-radius:6px 6px 0 0; min-width:30px; transition:.3s; }
    .fil-bar-label { font-size:11px; color:var(--text-muted); text-align:center; }

    .fil-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .fil-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
    .fil-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; }
    .fil-card--inativo { opacity:.6; }
    .fil-card-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
    .fil-card-row { font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px; margin-bottom:5px; }
    .fil-card-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }
    .fil-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; margin-left:4px; }
    .fil-badge--ok   { background:var(--success-soft); color:var(--success); }
    .fil-badge--off  { background:var(--surface-3); color:var(--text-muted); }
    .fil-badge--sede { background:#dbeafe; color:#1d4ed8; }
    .fil-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:48px 20px; text-align:center; color:var(--text-muted); font-size:13px; }
    .fil-empty i { font-size:2rem; opacity:.25; }

    .fil-form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .fil-form-group { display:flex; flex-direction:column; gap:5px; }
    .fil-form-group--full { grid-column:1/-1; }
    .fil-form-group label { font-size:12px; font-weight:600; color:var(--text-muted); }
    .btn-icon.danger:hover { color:var(--danger); }
    .text-right { text-align:right; }
    @media(max-width:480px) { .fil-form-row { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(s);
}

// Paleta para barras comparativas
const CORES = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

const FiliaisModule = {
  state: {
    tab: 'comparativo',
    filiais: [],
    comparativo: null,
    loading: false,
    initialized: false
  },

  async init() {
    injectFiliaisStyles();
    if (!this.state.initialized) {
      this.render();
      this.bindTabEvents();
      this.state.initialized = true;
    }
    await this.loadFiliais();
    await this.loadTab('comparativo');
  },

  async loadFiliais() {
    try {
      const data = await api.fetchAPI('/filiais');
      this.state.filiais = data.filiais || [];
    } catch (err) {
      this.state.filiais = [];
      showToast(buildFriendlyError(err), 'error');
    }
  },

  async loadTab(tab) {
    if (this.state.loading) return;
    this.state.tab = tab;
    document.querySelectorAll('.fil-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.state.loading = true;
    try {
      if (tab === 'comparativo') await this.loadComparativo();
      if (tab === 'filiais')     this.renderFiliais();
      if (tab === 'nova')        this.renderForm(null);
    } finally {
      this.state.loading = false;
    }
  },

  // ── Comparativo ───────────────────────────────────────────────────────────

  async loadComparativo() {
    const el = document.getElementById('filContent');
    if (!el) return;

    const mesAtual = new Date();
    const ini = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth()+1).padStart(2,'0')}-01`;
    const fim = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date(mesAtual.getFullYear(), mesAtual.getMonth()+1, 0));

    el.innerHTML = `
      <div class="fil-periodo-bar">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="font-size:13px;font-weight:600;color:var(--text-muted);">Período:</label>
          <input id="filIni" type="date" class="filter-input" style="width:150px;" value="${ini}">
          <span style="font-size:12px;color:var(--text-muted);">até</span>
          <input id="filFim" type="date" class="filter-input" style="width:150px;" value="${fim}">
        </div>
        <button class="btn btn-primary btn-sm" id="filAplicarBtn"><i class="fa fa-chart-bar"></i> Atualizar</button>
      </div>
      <div id="filComparativoBody"></div>
    `;

    document.getElementById('filAplicarBtn')?.addEventListener('click', () => this.carregarComparativo());
    await this.carregarComparativo();
  },

  async carregarComparativo() {
    const ini = document.getElementById('filIni')?.value;
    const fim = document.getElementById('filFim')?.value;
    const body = document.getElementById('filComparativoBody');
    if (!body) return;

    body.innerHTML = `<div class="module-skeleton" style="padding:0">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:80px;margin-bottom:10px;border-radius:12px"></div>').join('')
    }</div>`;

    try {
      const data = await api.fetchAPI('/filiais/comparativo', 'GET', null, { inicio: ini, fim });
      this.state.comparativo = data;
      this.renderComparativo(data);
    } catch (err) {
      body.innerHTML = '';
      showToast(buildFriendlyError(err), 'error');
    }
  },

  renderComparativo(data) {
    const body = document.getElementById('filComparativoBody');
    if (!body) return;

    const { comparativo, totais } = data;
    const comMov = comparativo.filter((f) => f.qtd_vendas > 0 || f.qtd_compras > 0);

    if (comparativo.length === 0) {
      body.innerHTML = `<div class="fil-empty">
        <i class="fa-solid fa-store-slash"></i>
        <strong>Nenhuma filial cadastrada</strong>
        <p>Crie filiais na aba "Gerenciar" para ver o comparativo.</p>
      </div>`;
      return;
    }

    body.innerHTML = `
      <!-- KPIs consolidados -->
      <div class="fil-kpis">
        <div class="fil-kpi">
          <div class="fil-kpi-label">Vendas consolidadas</div>
          <div class="fil-kpi-val">${moeda(totais.total_vendas)}</div>
          <div class="fil-kpi-sub">${totais.qtd_vendas} transação(ões)</div>
        </div>
        <div class="fil-kpi">
          <div class="fil-kpi-label">Compras consolidadas</div>
          <div class="fil-kpi-val">${moeda(totais.total_compras)}</div>
          <div class="fil-kpi-sub">${totais.qtd_compras} transação(ões)</div>
        </div>
        <div class="fil-kpi ${totais.total_vendas > totais.total_compras ? 'fil-kpi--green' : 'fil-kpi--red'}">
          <div class="fil-kpi-label">Margem bruta</div>
          <div class="fil-kpi-val">${moeda(totais.total_vendas - totais.total_compras)}</div>
          <div class="fil-kpi-sub">${pct(totais.total_vendas - totais.total_compras, totais.total_vendas)}</div>
        </div>
        <div class="fil-kpi">
          <div class="fil-kpi-label">Filiais ativas</div>
          <div class="fil-kpi-val">${comparativo.length}</div>
          <div class="fil-kpi-sub">${comMov.length} com movimentos</div>
        </div>
      </div>

      <!-- Tabela comparativa -->
      <div class="fil-section-label">Desempenho por filial</div>
      <div class="fil-table-wrap">
        <table>
          <thead><tr>
            <th>Filial</th>
            <th class="text-right">Vendas</th><th class="text-right">Qtd</th>
            <th class="text-right">Compras</th><th class="text-right">Qtd</th>
            <th class="text-right">Participação</th>
          </tr></thead>
          <tbody>
            ${comparativo.map((f, i) => {
              const cor = CORES[i % CORES.length];
              const part = pct(f.total_vendas, totais.total_vendas);
              return `<tr>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:10px;height:10px;border-radius:50%;background:${cor};flex-shrink:0;"></span>
                    <div>
                      <strong>${esc(f.nome)}</strong>
                      ${f.principal ? `<span style="font-size:10px;color:var(--text-muted);"> · sede</span>` : ''}
                    </div>
                  </div>
                </td>
                <td class="text-right" style="font-weight:600;">${moeda(f.total_vendas)}</td>
                <td class="text-right" style="color:var(--text-muted);">${f.qtd_vendas}</td>
                <td class="text-right">${moeda(f.total_compras)}</td>
                <td class="text-right" style="color:var(--text-muted);">${f.qtd_compras}</td>
                <td class="text-right">
                  <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
                    <div style="width:80px;background:var(--surface-2);border-radius:4px;overflow:hidden;height:8px;">
                      <div style="width:${totais.total_vendas > 0 ? ((f.total_vendas/totais.total_vendas)*100).toFixed(1) : 0}%;background:${cor};height:100%;"></div>
                    </div>
                    <span style="font-size:12px;font-weight:600;">${part}</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot style="border-top:2px solid var(--border);">
            <tr>
              <td><strong>Total consolidado</strong></td>
              <td class="text-right"><strong>${moeda(totais.total_vendas)}</strong></td>
              <td class="text-right"><strong>${totais.qtd_vendas}</strong></td>
              <td class="text-right"><strong>${moeda(totais.total_compras)}</strong></td>
              <td class="text-right"><strong>${totais.qtd_compras}</strong></td>
              <td class="text-right">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Gráfico de barras simples -->
      ${comMov.length > 0 ? `
        <div class="fil-section-label" style="margin-top:20px;">Vendas por filial</div>
        <div class="fil-bars">
          ${comparativo.map((f, i) => {
            const maxVal = Math.max(...comparativo.map((x) => x.total_vendas), 1);
            const h = Math.max(4, ((f.total_vendas / maxVal) * 150));
            return `
              <div class="fil-bar-col">
                <div class="fil-bar-val">${moeda(f.total_vendas)}</div>
                <div class="fil-bar" style="height:${h}px;background:${CORES[i % CORES.length]};"></div>
                <div class="fil-bar-label">${esc(f.nome.length > 12 ? f.nome.substring(0,11)+'…' : f.nome)}</div>
              </div>`;
          }).join('')}
        </div>` : ''}
    `;
  },

  // ── Gerenciar filiais ─────────────────────────────────────────────────────

  renderFiliais() {
    const el = document.getElementById('filContent');
    if (!el) return;

    el.innerHTML = `
      <div class="fil-toolbar">
        <span style="font-size:13px;color:var(--text-muted);">${this.state.filiais.length} filial(is)</span>
        <button class="btn btn-primary btn-sm" id="filNovaBtn"><i class="fa fa-plus"></i> Nova filial</button>
      </div>
      ${this.state.filiais.length === 0
        ? `<div class="fil-empty">
             <i class="fa-solid fa-store-slash"></i>
             <strong>Nenhuma filial criada</strong>
             <p>O sistema opera com a sede como único ponto de venda.</p>
           </div>`
        : `<div class="fil-grid">
            ${this.state.filiais.map((f) => `
              <div class="fil-card ${!f.ativo ? 'fil-card--inativo' : ''}">
                <div class="fil-card-head">
                  <div>
                    <strong style="font-size:14px;">${esc(f.nome)}</strong>
                    ${f.principal ? `<span class="fil-badge fil-badge--sede">Sede</span>` : ''}
                    <span class="fil-badge ${f.ativo ? 'fil-badge--ok' : 'fil-badge--off'}">${f.ativo ? 'Ativa' : 'Inativa'}</span>
                  </div>
                </div>
                ${f.responsavel ? `<div class="fil-card-row"><i class="fa fa-user"></i> ${esc(f.responsavel)}</div>` : ''}
                ${f.telefone    ? `<div class="fil-card-row"><i class="fa fa-phone"></i> ${esc(f.telefone)}</div>` : ''}
                ${f.cidade      ? `<div class="fil-card-row"><i class="fa fa-location-dot"></i> ${esc(f.cidade)}${f.uf ? ' - ' + f.uf : ''}</div>` : ''}
                <div class="fil-card-row" style="color:var(--text-muted);font-size:11px;">
                  <i class="fa fa-chart-bar"></i> ${f.total_vendas} venda(s) · ${f.total_compras} compra(s)
                </div>
                <div class="fil-card-actions">
                  <button class="btn btn-secondary btn-sm" data-edit-id="${f.id}"><i class="fa fa-pen"></i> Editar</button>
                  <button class="btn btn-secondary btn-sm" data-toggle-id="${f.id}" data-ativo="${f.ativo}">
                    <i class="fa ${f.ativo ? 'fa-pause' : 'fa-play'}"></i> ${f.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  ${Number(f.total_vendas) === 0 && Number(f.total_compras) === 0
                    ? `<button class="btn-icon danger" data-del-id="${f.id}" title="Excluir"><i class="fa fa-trash"></i></button>`
                    : ''}
                </div>
              </div>`).join('')}
           </div>`
      }
    `;

    document.getElementById('filNovaBtn')?.addEventListener('click', () => this.renderForm(null));
    el.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = this.state.filiais.find((x) => x.id === Number(btn.dataset.editId));
        if (f) this.renderForm(f);
      });
    });
    el.querySelectorAll('[data-toggle-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleAtivo(btn.dataset.toggleId, btn.dataset.ativo === 'true'));
    });
    el.querySelectorAll('[data-del-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.deletar(btn.dataset.delId));
    });
  },

  renderForm(filial) {
    const el = document.getElementById('filContent');
    if (!el) return;

    el.innerHTML = `
      <div style="max-width:560px;">
        <h4 style="font-size:15px;font-weight:700;margin-bottom:20px;">${filial ? 'Editar filial' : 'Nova filial'}</h4>
        <form id="filForm" autocomplete="off" style="display:flex;flex-direction:column;gap:14px;">
          <div class="fil-form-row">
            <div class="fil-form-group fil-form-group--full">
              <label>Nome da filial *</label>
              <input id="filNome" class="filter-input" required value="${esc(filial?.nome||'')}" placeholder="Ex: Loja Centro, Filial Norte...">
            </div>
          </div>
          <div class="fil-form-row">
            <div class="fil-form-group">
              <label>CNPJ (opcional)</label>
              <input id="filCnpj" class="filter-input" value="${esc(filial?.cnpj||'')}" placeholder="00.000.000/0001-00">
            </div>
            <div class="fil-form-group">
              <label>Telefone</label>
              <input id="filTelefone" class="filter-input" value="${esc(filial?.telefone||'')}" placeholder="(85) 99999-9999">
            </div>
          </div>
          <div class="fil-form-row">
            <div class="fil-form-group">
              <label>Responsável</label>
              <input id="filResp" class="filter-input" value="${esc(filial?.responsavel||'')}" placeholder="Nome do gerente">
            </div>
            <div class="fil-form-group">
              <label>Cidade</label>
              <input id="filCidade" class="filter-input" value="${esc(filial?.cidade||'')}" placeholder="Fortaleza">
            </div>
          </div>
          <div class="fil-form-row">
            <div class="fil-form-group">
              <label>UF</label>
              <input id="filUf" class="filter-input" value="${esc(filial?.uf||'')}" placeholder="CE" maxlength="2">
            </div>
            <div class="fil-form-group">
              <label>Endereço</label>
              <input id="filEndereco" class="filter-input" value="${esc(filial?.endereco||'')}" placeholder="Rua, número, bairro">
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <label style="font-size:13px;font-weight:500;">Definir como sede principal</label>
            <input type="checkbox" id="filPrincipal" ${filial?.principal ? 'checked' : ''}>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-secondary btn-sm" id="filCancelarBtn">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm"><i class="fa fa-save"></i> Salvar filial</button>
          </div>
        </form>
      </div>
    `;

    setTimeout(() => document.getElementById('filNome')?.focus(), 50);

    document.getElementById('filCancelarBtn')?.addEventListener('click', () => this.loadTab('filiais'));
    document.getElementById('filForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...'; }
      try {
        await this.salvar(filial?.id || null);
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-save"></i> Salvar filial'; }
      }
    });
  },

  async salvar(id) {
    const payload = {
      nome:        document.getElementById('filNome').value.trim(),
      cnpj:        document.getElementById('filCnpj').value.trim() || null,
      telefone:    document.getElementById('filTelefone').value.trim() || null,
      responsavel: document.getElementById('filResp').value.trim() || null,
      cidade:      document.getElementById('filCidade').value.trim() || null,
      uf:          document.getElementById('filUf').value.trim().toUpperCase() || null,
      endereco:    document.getElementById('filEndereco').value.trim() || null,
      principal:   document.getElementById('filPrincipal').checked
    };
    if (!payload.nome) { showToast('Nome é obrigatório', 'error'); return; }

    try {
      if (id) await api.fetchAPI(`/filiais/${id}`, 'PUT', payload);
      else    await api.fetchAPI('/filiais', 'POST', payload);
      showToast(id ? 'Filial atualizada!' : 'Filial criada!', 'success');
      await this.loadFiliais();
      this.loadTab('filiais');
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  async toggleAtivo(id, ativo) {
    try {
      await api.fetchAPI(`/filiais/${id}/ativo`, 'PATCH', { ativo: !ativo });
      await this.loadFiliais();
      this.renderFiliais();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  async deletar(id) {
    const ok = await confirmarAcao('Excluir esta filial?');
    if (!ok) return;
    try {
      await api.fetchAPI(`/filiais/${id}`, 'DELETE');
      showToast('Filial excluída', 'success');
      await this.loadFiliais();
      this.renderFiliais();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  // ── Estrutura ─────────────────────────────────────────────────────────────

  render() {
    const c = document.getElementById('filiaisContainer');
    if (!c) return;
    c.innerHTML = `
      <div class="fil-tabs">
        <button class="fil-tab-btn active" data-tab="comparativo"><i class="fa fa-chart-bar"></i> Comparativo</button>
        <button class="fil-tab-btn" data-tab="filiais"><i class="fa fa-store"></i> Gerenciar</button>
      </div>
      <div id="filContent" style="margin-top:20px;"></div>
    `;
  },

  bindTabEvents() {
    document.getElementById('filiaisContainer')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.fil-tab-btn');
      if (btn) this.loadTab(btn.dataset.tab);
    });
  },

};

export async function initFiliaisModule() {
  return FiliaisModule.init();
}

export default FiliaisModule;
