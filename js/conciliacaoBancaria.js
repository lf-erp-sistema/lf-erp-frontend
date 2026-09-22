import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError, debounce } from './utils.js';

const state = {
  sessoes:   [],
  sessaoId:  null,   // sessão aberta
  itens:     [],
  filtroStatus: '',  // '' | 'pendente' | 'conciliado' | 'ignorado'
  buscaDetalhe: '',
  loading:   false
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const esc = escapeHtml;

function toCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d) {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}


function showMsg(msg, type = 'info') {
  const el = document.getElementById('cbFeedback');
  if (el) {
    el.className = `module-feedback${type === 'error' ? ' module-feedback--error' : type === 'success' ? ' module-feedback--success' : ' module-feedback--info'}`;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }
  showToast(msg, type);
}

// ─── Highlight / Filter / Styles ─────────────────────────────────────────────

function _highlight(text, term) {
  if (!term || !text) return esc(text || '');
  const safeRe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${safeRe})`, 'gi');
  return String(text).split(re).map((part, i) =>
    i % 2 === 1 ? `<mark class="cb-hl">${esc(part)}</mark>` : esc(part)
  ).join('');
}

function filtrarItensBusca() {
  const term = state.buscaDetalhe.toLowerCase().trim();
  if (!term) return state.itens;
  return state.itens.filter(i =>
    String(i.descricao || '').toLowerCase().includes(term)
  );
}

function injectConciliacaoStyles() {
  if (document.getElementById('cbStyles')) return;
  const s = document.createElement('style');
  s.id = 'cbStyles';
  s.textContent = `
    .cb-sessoes-lista { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
    .cb-sessao-card {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding: 14px 16px;
      border: 1px solid var(--border, #e5e7eb); border-radius: 12px;
      background: var(--bg, #f8f9fa); transition: box-shadow .15s;
    }
    .cb-sessao-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .cb-sessao-card__left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .cb-sessao-card__icon {
      width: 40px; height: 40px; border-radius: 10px;
      background: var(--primary-light, #dbeafe); color: var(--primary, #3b82f6);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
    }
    .cb-sessao-card__nome {
      display: block; font-size: 14px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cb-sessao-card__meta { display: block; font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .cb-sessao-card__right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
    .cb-sessao-card__badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .cb-progresso-wrap { display: flex; align-items: center; gap: 6px; }
    .cb-progresso {
      width: 80px; height: 6px;
      background: var(--border, #e5e7eb); border-radius: 3px; overflow: hidden;
    }
    .cb-progresso__bar {
      height: 100%; border-radius: 3px;
      background: var(--primary, #3b82f6); transition: width .4s;
    }
    .cb-progresso__bar--warning { background: var(--warning, #f59e0b); }
    .cb-progresso__bar--success { background: var(--success, #22c55e); }
    .cb-progresso__pct {
      font-size: 11px; font-weight: 600; color: var(--text-muted);
      min-width: 28px; text-align: right;
    }
    .cb-info-card {
      display: flex; align-items: flex-start; gap: 10px;
      background: var(--info-bg, #eff6ff); border: 1px solid var(--info-border, #bfdbfe);
      border-radius: 10px; padding: 12px 14px; margin-bottom: 16px;
      color: var(--info-text, #1d4ed8); font-size: 14px;
    }
    .cb-info-card i { margin-top: 2px; flex-shrink: 0; }
    .cb-info-card strong { display: block; margin-bottom: 2px; }
    .cb-info-card p { margin: 0; color: var(--text, #374151); font-size: 13px; }
    .cb-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .cb-stat--credito  { border-top: 3px solid var(--success, #22c55e); }
    .cb-stat--debito   { border-top: 3px solid var(--danger, #ef4444); }
    .cb-stat--pendente { border-top: 3px solid var(--warning, #f59e0b); }
    .cb-stat--ok       { border-top: 3px solid var(--primary, #3b82f6); }
    .cb-filtro-status { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .cb-filtro-btn {
      padding: 5px 14px; border: 1px solid var(--border, #e5e7eb);
      border-radius: 20px; background: var(--surface, #fff);
      font-size: 13px; cursor: pointer; color: var(--text); transition: all .15s;
    }
    .cb-filtro-btn--ativo {
      background: var(--primary, #3b82f6); border-color: var(--primary, #3b82f6);
      color: #fff; font-weight: 600;
    }
    .cb-filtro-btn:not(.cb-filtro-btn--ativo):hover { background: var(--bg, #f8f9fa); }
    .cb-drop-area {
      border: 2px dashed var(--border, #e5e7eb); border-radius: 10px; padding: 28px;
      text-align: center; cursor: pointer; transition: all .2s;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
    }
    .cb-drop-area i { font-size: 28px; color: var(--text-muted); }
    .cb-drop-area p, .cb-drop-area small { margin: 0; color: var(--text-muted); }
    .cb-drop-area p { font-size: 14px; }
    .cb-drop-area small { font-size: 12px; }
    .cb-drop-area--over, .cb-drop-area:hover {
      border-color: var(--primary, #3b82f6); background: var(--info-bg, #eff6ff);
    }
    .cb-drop-area--over i, .cb-drop-area:hover i { color: var(--primary, #3b82f6); }
    .cb-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 48px 24px; text-align: center;
    }
    .cb-empty i { font-size: 48px; color: var(--border, #e5e7eb); margin-bottom: 4px; }
    .cb-empty strong { font-size: 16px; }
    .cb-empty p { color: var(--text-muted); font-size: 14px; margin: 0; }
    .cb-busca-detalhe {
      display: flex; align-items: center; gap: 8px;
      background: var(--bg, #f8f9fa); border: 1px solid var(--border, #e5e7eb);
      border-radius: 8px; padding: 0 12px; height: 38px;
      margin-bottom: 12px; max-width: 360px;
    }
    .cb-busca-detalhe input {
      border: none; background: transparent;
      flex: 1; font-size: 13px; outline: none; color: var(--text);
    }
    mark.cb-hl { background: #fef08a; color: #713f12; border-radius: 2px; padding: 0 2px; }
    @media (max-width: 700px) {
      .cb-stats-grid { grid-template-columns: repeat(2, 1fr); }
      .cb-sessao-card { flex-direction: column; align-items: flex-start; }
      .cb-sessao-card__right { width: 100%; justify-content: flex-end; }
      .cb-busca-detalhe { max-width: 100%; }
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) mark.cb-hl { background: #854d0e; color: #fef9c3; }
      :root:not([data-theme="light"]) .cb-info-card {
        background: rgba(59,130,246,.1); border-color: rgba(59,130,246,.25); color: #93c5fd;
      }
      :root:not([data-theme="light"]) .cb-info-card p { color: var(--text); }
      :root:not([data-theme="light"]) .cb-sessao-card { background: var(--bg); }
      :root:not([data-theme="light"]) .cb-busca-detalhe { background: var(--bg); border-color: var(--border); }
    }
    :root[data-theme="dark"] mark.cb-hl { background: #854d0e; color: #fef9c3; }
    :root[data-theme="dark"] .cb-info-card {
      background: rgba(59,130,246,.1); border-color: rgba(59,130,246,.25); color: #93c5fd;
    }
    :root[data-theme="dark"] .cb-info-card p { color: var(--text); }
    :root[data-theme="dark"] .cb-sessao-card { background: var(--bg); }
    :root[data-theme="dark"] .cb-busca-detalhe { background: var(--bg); border-color: var(--border); }
  `;
  document.head.appendChild(s);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initConciliacaoModule() {
  try {
    injectConciliacaoStyles();
    renderSkeleton();
    await carregarSessoes();
    renderLista();
  } catch (error) {
    console.error('Erro ao iniciar conciliação bancária:', error);
    renderErro(buildFriendlyError(error));
  }
}

async function carregarSessoes() {
  const data = await api.getConciliacoes();
  state.sessoes = Array.isArray(data) ? data : [];
}

async function carregarItens() {
  const params = state.filtroStatus ? { status: state.filtroStatus } : {};
  const data = await api.getConciliacaoItens(state.sessaoId, params);
  state.itens = Array.isArray(data) ? data : [];
}

// ─── Tela: lista de sessões ────────────────────────────────────────────────────

function renderSkeleton() {
  const c = container();
  if (c) c.innerHTML = `<div class="module-card"><div class="module-feedback module-feedback--info">Carregando conciliações...</div></div>`;
}

function renderErro(msg) {
  const c = container();
  if (c) {
    c.innerHTML = `
      <div class="module-card" style="text-align:center;padding:40px 20px">
        <div class="module-feedback module-feedback--error" style="margin-bottom:16px">${esc(msg)}</div>
        <button class="btn btn-light" id="cbBtnRetry" type="button">
          <i class="fa-solid fa-rotate"></i> Tentar novamente
        </button>
      </div>`;
    document.getElementById('cbBtnRetry')?.addEventListener('click', initConciliacaoModule);
  }
}

function container() { return document.getElementById('conciliacaoContainer'); }

function renderLista() {
  state.sessaoId = null;
  const c = container();
  if (!c) return;

  c.innerHTML = `
    <div class="module-card">
      <div id="cbFeedback" class="module-feedback hidden"></div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px">
        <button class="btn btn-light" id="cbBtnAtualizar" type="button">
          <i class="fa-solid fa-rotate"></i> Atualizar
        </button>
        <button class="btn btn-primary" id="cbBtnNova" type="button">
          <i class="fa-solid fa-upload"></i> Importar Extrato
        </button>
      </div>

      <div class="cb-info-card">
        <i class="fa-solid fa-circle-info"></i>
        <div>
          <strong>Como funciona</strong>
          <p>Exporte o extrato bancário em formato OFX ou CSV, importe aqui e use as ações para criar lançamentos financeiros ou ignorar movimentos já registrados.</p>
        </div>
      </div>

      ${state.sessoes.length
        ? `<div class="cb-sessoes-lista">${state.sessoes.map(renderCardSessao).join('')}</div>`
        : `<div class="empty-state cb-empty">
            <i class="fa-solid fa-bank"></i>
            <strong>Nenhum extrato importado ainda.</strong>
            <p>Exporte o extrato do seu banco em OFX ou CSV e importe aqui.</p>
            <button class="btn btn-primary" id="cbBtnNovaEmpty" type="button" style="margin-top:8px">
              <i class="fa-solid fa-upload"></i> Importar primeiro extrato
            </button>
          </div>`
      }
    </div>

    ${renderModalImport()}
  `;

  bindLista();
}

function renderCardSessao(s) {
  const pendentes   = Number(s.pendentes   || 0);
  const conciliados = Number(s.itens_conciliados || 0);
  const ignorados   = Number(s.itens_ignorados   || 0);
  const total       = Number(s.total_itens       || 0);
  const pct = total > 0 ? Math.round(((conciliados + ignorados) / total) * 100) : 0;

  return `
    <div class="cb-sessao-card" data-id="${s.id}">
      <div class="cb-sessao-card__left">
        <div class="cb-sessao-card__icon">
          <i class="fa-solid fa-${s.tipo === 'ofx' ? 'building-columns' : 'file-csv'}"></i>
        </div>
        <div>
          <strong class="cb-sessao-card__nome">${esc(s.nome)}</strong>
          <span class="cb-sessao-card__meta">
            ${formatDate(s.data_inicio)} – ${formatDate(s.data_fim)}
            &nbsp;·&nbsp; ${total} transações
          </span>
        </div>
      </div>
      <div class="cb-sessao-card__right">
        <div class="cb-progresso-wrap">
          <div class="cb-progresso">
            <div class="cb-progresso__bar ${pct === 100 ? 'cb-progresso__bar--success' : pct < 50 ? 'cb-progresso__bar--warning' : ''}" style="width:${pct}%"></div>
          </div>
          <span class="cb-progresso__pct">${pct}%</span>
        </div>
        <div class="cb-sessao-card__badges">
          ${pendentes   > 0 ? `<span class="badge badge--warning">${pendentes} pendentes</span>`   : ''}
          ${conciliados > 0 ? `<span class="badge badge--success">${conciliados} conciliados</span>` : ''}
          ${ignorados   > 0 ? `<span class="badge">${ignorados} ignorados</span>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary" style="padding:5px 12px;font-size:12px" data-action="abrir" data-id="${s.id}">
            <i class="fa-solid fa-eye"></i> Abrir
          </button>
          <button class="btn btn-light" style="padding:5px 10px;font-size:12px;color:var(--danger)" data-action="excluir" data-id="${s.id}" title="Excluir sessão">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
}

function renderModalImport() {
  return `
    <div class="modal-overlay hidden" id="cbModalImport">
      <div class="modal-card" style="max-width:480px;width:100%">
        <div class="modal-card__header">
          <h3>Importar Extrato Bancário</h3>
          <button class="modal-close" id="cbBtnFecharImport" type="button">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="cbFormImport" class="form-grid" autocomplete="off">
          <div class="form-field">
            <label>Formato do arquivo <span style="color:var(--danger)">*</span></label>
            <select id="cbTipo" class="input" required>
              <option value="ofx">OFX — Bradesco, Itaú, Santander, Nubank...</option>
              <option value="csv">CSV — genérico (data; descrição; valor)</option>
            </select>
          </div>

          <div class="form-field">
            <label>Conta bancária (opcional)</label>
            <input id="cbConta" class="input" placeholder="Ex: Conta corrente Bradesco"/>
          </div>

          <div class="form-field form-field--span-2">
            <label>Arquivo <span style="color:var(--danger)">*</span></label>
            <div class="cb-drop-area" id="cbDropArea">
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <p>Clique ou arraste o arquivo aqui</p>
              <small id="cbArquivoNome">Nenhum arquivo selecionado</small>
              <input type="file" id="cbArquivoInput" accept=".ofx,.csv,.txt" style="display:none"/>
            </div>
          </div>

          <div id="cbImportFeedback" class="form-field form-field--span-2 hidden">
            <div class="module-feedback module-feedback--info" id="cbImportMsg"></div>
          </div>

          <div class="form-field form-field--span-2" style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
            <button type="button" class="btn btn-light" id="cbBtnCancelarImport">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="cbBtnImportar">
              <i class="fa-solid fa-upload"></i> Importar
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

function bindLista() {
  document.getElementById('cbBtnNova').onclick      = () => document.getElementById('cbModalImport').classList.remove('hidden');
  document.getElementById('cbBtnFecharImport').onclick = fecharModalImport;
  document.getElementById('cbBtnCancelarImport').onclick = fecharModalImport;
  document.getElementById('cbModalImport').onclick  = (e) => { if (e.target.id === 'cbModalImport') fecharModalImport(); };

  document.getElementById('cbBtnNovaEmpty')?.onclick = () => document.getElementById('cbModalImport').classList.remove('hidden');

  document.getElementById('cbBtnAtualizar').onclick = async () => {
    try { await carregarSessoes(); renderLista(); } catch (e) { showMsg(buildFriendlyError(e), 'error'); }
  };

  // Drag & drop + click no drop area
  const dropArea = document.getElementById('cbDropArea');
  const fileInput = document.getElementById('cbArquivoInput');
  dropArea.onclick = () => fileInput.click();
  dropArea.ondragover = (e) => { e.preventDefault(); dropArea.classList.add('cb-drop-area--over'); };
  dropArea.ondragleave = () => dropArea.classList.remove('cb-drop-area--over');
  dropArea.ondrop = (e) => {
    e.preventDefault();
    dropArea.classList.remove('cb-drop-area--over');
    const f = e.dataTransfer.files[0];
    if (f) { fileInput.files = e.dataTransfer.files; mostrarNomeArquivo(f.name); }
  };
  fileInput.onchange = () => {
    if (fileInput.files[0]) mostrarNomeArquivo(fileInput.files[0].name);
  };

  // Submit importar
  document.getElementById('cbFormImport').onsubmit = importar;

  // Ações nas sessões
  document.querySelectorAll('[data-action="abrir"]').forEach(btn => {
    btn.onclick = () => abrirSessao(Number(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="excluir"]').forEach(btn => {
    btn.onclick = () => excluirSessao(Number(btn.dataset.id));
  });
}

function mostrarNomeArquivo(nome) {
  const el = document.getElementById('cbArquivoNome');
  if (el) el.textContent = nome;
}

function fecharModalImport() {
  document.getElementById('cbModalImport').classList.add('hidden');
  document.getElementById('cbFormImport').reset();
  mostrarNomeArquivo('Nenhum arquivo selecionado');
}

// ─── Importar arquivo ─────────────────────────────────────────────────────────

async function importar(e) {
  e.preventDefault();
  const btn  = document.getElementById('cbBtnImportar');
  const tipo = document.getElementById('cbTipo').value;
  const conta = document.getElementById('cbConta').value.trim();
  const file = document.getElementById('cbArquivoInput').files[0];

  if (!file) { showMsg('Selecione um arquivo para importar.', 'error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';

  const setImportMsg = (msg, tipo = 'info') => {
    const fb = document.getElementById('cbImportFeedback');
    const msgEl = document.getElementById('cbImportMsg');
    if (fb && msgEl) {
      fb.classList.remove('hidden');
      msgEl.className = `module-feedback module-feedback--${tipo}`;
      msgEl.textContent = msg;
    }
  };

  try {
    setImportMsg('Lendo arquivo...');
    const conteudo = await lerArquivo(file);
    setImportMsg('Processando transações...');

    const result = await api.importarConciliacao({
      conteudo, tipo, nome: file.name, conta
    });

    fecharModalImport();
    showMsg(`${result.total} transações importadas com sucesso.`, 'success');
    await carregarSessoes();
    renderLista();
    if (result.conciliacao_id) abrirSessao(result.conciliacao_id);
  } catch (error) {
    console.error('Erro ao importar:', error);
    setImportMsg(buildFriendlyError(error), 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-upload"></i> Importar';
  }
}

function lerArquivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
    reader.readAsText(file, 'utf-8');
  });
}

// ─── Tela: detalhe da sessão ──────────────────────────────────────────────────

async function abrirSessao(id) {
  state.sessaoId    = id;
  state.filtroStatus = '';
  state.buscaDetalhe = '';
  try {
    renderDetalheLoading();
    await carregarItens();
    renderDetalhe();
  } catch (error) {
    console.error('Erro ao abrir sessão:', error);
    showMsg(buildFriendlyError(error), 'error');
  }
}

function renderDetalheLoading() {
  const c = container();
  if (c) c.innerHTML = `<div class="module-card"><div class="module-feedback module-feedback--info">Carregando transações...</div></div>`;
}

function renderDetalhe() {
  const c = container();
  if (!c) return;

  const sessao   = state.sessoes.find(s => s.id === state.sessaoId) || {};
  const total    = Number(sessao.total_itens || state.itens.length);
  const conc     = Number(sessao.itens_conciliados || 0);
  const ign      = Number(sessao.itens_ignorados   || 0);
  const pend     = total - conc - ign;
  const creditos = state.itens.filter(i => i.tipo === 'credito').reduce((a, i) => a + Number(i.valor), 0);
  const debitos  = state.itens.filter(i => i.tipo === 'debito').reduce((a, i)  => a + Number(i.valor), 0);

  c.innerHTML = `
    <div class="module-card">
      <div id="cbFeedback" class="module-feedback hidden"></div>

      <div class="module-card__header">
        <div>
          <button class="btn btn-light" id="cbBtnVoltar" style="margin-bottom:6px">
            <i class="fa-solid fa-arrow-left"></i> Voltar
          </button>
          <h3>${esc(sessao.nome || 'Extrato')}</h3>
          <p>${formatDate(sessao.data_inicio)} – ${formatDate(sessao.data_fim)}
            &nbsp;·&nbsp; ${esc(sessao.conta || '')}</p>
        </div>
      </div>

      <!-- Stats -->
      <div class="cb-stats-grid">
        <article class="mini-stat cb-stat--credito">
          <span>Créditos</span>
          <strong>${toCurrency(creditos)}</strong>
          <small>${state.itens.filter(i => i.tipo === 'credito').length} transações</small>
        </article>
        <article class="mini-stat cb-stat--debito">
          <span>Débitos</span>
          <strong>${toCurrency(debitos)}</strong>
          <small>${state.itens.filter(i => i.tipo === 'debito').length} transações</small>
        </article>
        <article class="mini-stat cb-stat--pendente">
          <span>Pendentes</span>
          <strong>${pend}</strong>
          <small>aguardando ação</small>
        </article>
        <article class="mini-stat cb-stat--ok">
          <span>Conciliados</span>
          <strong>${conc + ign}</strong>
          <small>${conc} lançados · ${ign} ignorados</small>
        </article>
      </div>

      <!-- Filtro de status -->
      <div class="cb-filtro-status">
        ${['', 'pendente', 'conciliado', 'ignorado'].map(s => `
          <button class="cb-filtro-btn ${state.filtroStatus === s ? 'cb-filtro-btn--ativo' : ''}" data-status="${s}">
            ${s === '' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>`).join('')}
      </div>

      <!-- Busca -->
      <div class="cb-busca-detalhe">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="cbBuscaDetalhe" placeholder="Buscar por descrição..." value="${esc(state.buscaDetalhe)}"/>
      </div>

      <!-- Tabela -->
      ${renderTabelaItens()}

    </div>

    ${renderModalLancamento()}
  `;

  bindDetalhe();
}

function renderTabelaItens() {
  const itens = filtrarItensBusca();
  const hasFilter = !!(state.filtroStatus || state.buscaDetalhe);
  if (!itens.length) {
    return `<div class="empty-state cb-empty">
      <i class="fa-solid fa-check-double"></i>
      <strong>${hasFilter ? 'Nenhuma transação com os filtros aplicados' : 'Nenhuma transação encontrada'}</strong>
      ${hasFilter ? '<p>Tente remover ou ajustar os filtros.</p>' : ''}
    </div>`;
  }

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Tipo</th>
            <th class="text-right">Valor</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${itens.map(renderLinhaItem).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderLinhaItem(item) {
  const isCredito = item.tipo === 'credito';
  const isPend    = item.status === 'pendente';

  const badgeStatus = item.status === 'conciliado'
    ? '<span class="badge badge--success">Conciliado</span>'
    : item.status === 'ignorado'
      ? '<span class="badge">Ignorado</span>'
      : '<span class="badge badge--warning">Pendente</span>';

  const acoes = isPend ? `
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-light" style="padding:4px 10px;font-size:12px;color:var(--success)"
        data-action="lancar" data-id="${item.id}" title="Criar lançamento financeiro">
        <i class="fa-solid fa-plus"></i> Lançar
      </button>
      <button class="btn btn-light" style="padding:4px 10px;font-size:12px;color:var(--text-muted)"
        data-action="ignorar" data-id="${item.id}" title="Ignorar transação">
        <i class="fa-solid fa-ban"></i>
      </button>
    </div>` : (item.lancamento_id
      ? `<span style="font-size:11px;color:var(--text-muted)">Lançamento #${item.lancamento_id}</span>`
      : '');

  return `
    <tr>
      <td style="white-space:nowrap">${formatDate(item.data)}</td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.descricao)}">${_highlight(item.descricao, state.buscaDetalhe)}</td>
      <td><span class="badge ${isCredito ? 'badge--success' : 'badge--danger'}">${isCredito ? 'Crédito' : 'Débito'}</span></td>
      <td class="text-right" style="color:${isCredito ? 'var(--success)' : 'var(--danger)'}">
        <strong>${toCurrency(item.valor)}</strong>
      </td>
      <td>${badgeStatus}</td>
      <td>${acoes}</td>
    </tr>`;
}

function renderModalLancamento() {
  return `
    <div class="modal-overlay hidden" id="cbModalLanc">
      <div class="modal-card" style="max-width:420px;width:100%">
        <div class="modal-card__header">
          <h3>Criar Lançamento Financeiro</h3>
          <button class="modal-close" id="cbBtnFecharLanc" type="button">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form id="cbFormLanc" class="form-grid" autocomplete="off">
          <div class="form-field form-field--span-2">
            <label>Categoria <span style="color:var(--danger)">*</span></label>
            <input id="cbLancCategoria" class="input" placeholder="Ex: Receita bancária, Despesa operacional..." required/>
          </div>
          <div class="form-field form-field--span-2">
            <label>Observação</label>
            <input id="cbLancObs" class="input" placeholder="Opcional..."/>
          </div>
          <input type="hidden" id="cbLancItemId"/>
          <div class="form-field form-field--span-2" style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" class="btn btn-light" id="cbBtnCancelarLanc">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="cbBtnSalvarLanc">
              <i class="fa-solid fa-floppy-disk"></i> Criar lançamento
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

function bindDetalhe() {
  document.getElementById('cbBtnVoltar').onclick = async () => {
    state.buscaDetalhe = '';
    await carregarSessoes();
    renderLista();
  };

  // Filtro de status
  document.querySelectorAll('.cb-filtro-btn').forEach(btn => {
    btn.onclick = async () => {
      if (state.loading) return;
      state.loading = true;
      state.filtroStatus = btn.dataset.status;
      try {
        await carregarItens();
        renderDetalhe();
      } catch (e) {
        showMsg(buildFriendlyError(e), 'error');
      } finally {
        state.loading = false;
      }
    };
  });

  // Busca na tela de detalhe (client-side)
  const debouncedBuscaDetalhe = debounce(() => {
    const curval = document.getElementById('cbBuscaDetalhe')?.value ?? '';
    state.buscaDetalhe = curval;
    renderDetalhe();
    const restored = document.getElementById('cbBuscaDetalhe');
    if (restored) { restored.focus(); restored.setSelectionRange(curval.length, curval.length); }
  }, 200);
  document.getElementById('cbBuscaDetalhe')?.addEventListener('input', debouncedBuscaDetalhe);

  // Ações da tabela
  document.querySelectorAll('[data-action="ignorar"]').forEach(btn => {
    btn.onclick = () => ignorarItem(Number(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="lancar"]').forEach(btn => {
    btn.onclick = () => abrirModalLanc(Number(btn.dataset.id));
  });

  // Modal de lançamento
  document.getElementById('cbBtnFecharLanc').onclick = fecharModalLanc;
  document.getElementById('cbBtnCancelarLanc').onclick = fecharModalLanc;
  document.getElementById('cbModalLanc').onclick = (e) => { if (e.target.id === 'cbModalLanc') fecharModalLanc(); };
  document.getElementById('cbFormLanc').onsubmit = salvarLancamento;
}

// ─── Operações ────────────────────────────────────────────────────────────────

async function ignorarItem(id) {
  const ok = await confirmarAcao('Ignorar esta transação? Ela não gerará lançamento.', 'Ignorar', 'warning');
  if (!ok) return;
  try {
    await api.ignorarConciliacaoItem(id);
    showMsg('Transação ignorada.', 'success');
    await carregarItens();
    renderDetalhe();
  } catch (error) {
    console.error('Erro ao ignorar:', error);
    showMsg(buildFriendlyError(error), 'error');
  }
}

function abrirModalLanc(itemId) {
  document.getElementById('cbLancItemId').value = itemId;
  document.getElementById('cbLancCategoria').value = '';
  document.getElementById('cbLancObs').value = '';
  document.getElementById('cbModalLanc').classList.remove('hidden');
  document.getElementById('cbLancCategoria').focus();
}

function fecharModalLanc() {
  document.getElementById('cbModalLanc').classList.add('hidden');
}

async function salvarLancamento(e) {
  e.preventDefault();
  if (salvarLancamento._salvando) return;
  salvarLancamento._salvando = true;
  const btn = document.getElementById('cbBtnSalvarLanc');
  const itemId   = Number(document.getElementById('cbLancItemId').value);
  const categoria = document.getElementById('cbLancCategoria').value.trim();
  const observacao = document.getElementById('cbLancObs').value.trim();

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...';

  try {
    await api.criarLancamentoConciliacao(itemId, { categoria, observacao });
    fecharModalLanc();
    showMsg('Lançamento criado com sucesso.', 'success');
    await carregarItens();
    await carregarSessoes();
    renderDetalhe();
  } catch (error) {
    console.error('Erro ao criar lançamento:', error);
    showMsg(buildFriendlyError(error), 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Criar lançamento';
  } finally {
    salvarLancamento._salvando = false;
  }
}

async function excluirSessao(id) {
  const ok = await confirmarAcao('Excluir este extrato e todas as suas transações? Esta ação não pode ser desfeita.', 'Excluir', 'danger');
  if (!ok) return;
  try {
    await api.deleteConciliacao(id);
    showMsg('Extrato excluído.', 'success');
    await carregarSessoes();
    renderLista();
  } catch (error) {
    console.error('Erro ao excluir:', error);
    showMsg(buildFriendlyError(error), 'error');
  }
}
