import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';

const state = { dados: null, loading: false, bound: false };

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export async function initLixeiraModule() {
  const container = document.getElementById('lixeiraContainer');
  if (!container) return;
  container.innerHTML = renderSkeleton();
  await carregar();
}

function renderSkeleton() {
  return `<div style="padding:24px">${Array.from({length:6}).map(() =>
    '<div class="skeleton-line" style="height:38px;margin-bottom:8px;border-radius:6px"></div>').join('')}</div>`;
}

async function carregar() {
  const container = document.getElementById('lixeiraContainer');
  if (!container) return;
  state.loading = true;
  try {
    const data = await api.request('/lixeira', { method: 'GET' });
    state.dados = data;
    container.innerHTML = renderUI(data);
    bind();
  } catch (err) {
    container.innerHTML = `<div class="module-feedback module-feedback--error" style="margin:16px">
      <i class="fa-solid fa-triangle-exclamation"></i> ${err.message || 'Erro ao carregar lixeira'}
    </div>`;
  } finally {
    state.loading = false;
  }
}

function renderUI(data) {
  const total = data.total || 0;
  if (total === 0) {
    return `<div style="text-align:center;padding:48px;color:var(--text-muted)">
      <i class="fa-solid fa-trash-can" style="font-size:2.5rem;margin-bottom:16px;display:block;opacity:.3"></i>
      <div style="font-size:.95rem;font-weight:600">Lixeira vazia</div>
      <div style="font-size:.82rem;margin-top:4px">Nenhum registro excluído encontrado.</div>
    </div>`;
  }

  return `
    <div class="module-feedback module-feedback--warning" style="margin-bottom:16px;font-size:.82rem">
      <i class="fa-solid fa-info-circle"></i>
      Registros na lixeira não aparecem no sistema. Recupere para restaurar ou exclua permanentemente (admin).
    </div>
    ${renderSecao('Produtos',     'produto',     data.produtos     || [], ['nome','categoria'])}
    ${renderSecao('Clientes',     'cliente',     data.clientes     || [], ['nome','telefone','email'])}
    ${renderSecao('Fornecedores', 'fornecedor',  data.fornecedores || [], ['nome','telefone','email'])}
  `;
}

function renderSecao(titulo, _tipo, itens, campos) {
  const tabela = titulo === 'Produtos' ? 'produtos' : titulo === 'Clientes' ? 'clientes' : 'fornecedores';
  if (!itens.length) return '';

  const linhas = itens.map((item) => {
    const info = campos.map((c) => item[c] ? `<span style="margin-right:12px">${esc(item[c])}</span>` : '').join('');
    return `<tr>
      <td style="font-size:.82rem">${info || esc(item.nome)}</td>
      <td style="white-space:nowrap;font-size:.78rem;color:var(--text-muted)">${formatDateTime(item.deletado_em)}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-sm btn-success" data-action="recuperar" data-tabela="${tabela}" data-id="${item.id}" data-nome="${esc(item.nome)}" style="margin-right:6px">
          <i class="fa-solid fa-rotate-left"></i> Recuperar
        </button>
        <button class="btn btn-sm btn-danger" data-action="excluir-permanente" data-tabela="${tabela}" data-id="${item.id}" data-nome="${esc(item.nome)}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div style="margin-bottom:24px">
      <h3 style="font-size:.9rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">
        <i class="fa-solid fa-${tabela === 'produtos' ? 'box' : tabela === 'clientes' ? 'user' : 'truck'}" style="margin-right:6px"></i>
        ${titulo} <span style="font-weight:400">(${itens.length})</span>
      </h3>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Registro</th>
              <th>Excluído em</th>
              <th style="text-align:right">Ações</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;
}

function bind() {
  if (state.bound) return;
  state.bound = true;
  document.getElementById('lixeiraContainer')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const { action, tabela, id, nome } = btn.dataset;

    if (action === 'recuperar') {
      const ok = await confirmarAcao(
        `Recuperar "${nome}"? O registro voltará a aparecer no sistema.`,
        'Recuperar', 'primary'
      );
      if (!ok) return;
      try {
        await api.request(`/lixeira/recuperar/${tabela}/${id}`, { method: 'PUT', query: { empresa_id: api.getEmpresaId() } });
        showToast(`"${nome}" recuperado com sucesso!`, 'success');
        await carregar();
      } catch (err) {
        showToast(err.message || 'Erro ao recuperar', 'error');
      }
    }

    if (action === 'excluir-permanente') {
      const ok = await confirmarAcao(
        `Excluir permanentemente "${nome}"? Esta ação é irreversível.`,
        'Excluir definitivamente', 'danger'
      );
      if (!ok) return;
      try {
        await api.request(`/lixeira/excluir/${tabela}/${id}`, { method: 'DELETE', query: { empresa_id: api.getEmpresaId() } });
        showToast(`"${nome}" excluído permanentemente.`, 'success');
        await carregar();
      } catch (err) {
        showToast(err.message || 'Erro ao excluir', 'error');
      }
    }
  });
}
