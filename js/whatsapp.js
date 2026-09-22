import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

const esc = escapeHtml;

function injectWppStyles() {
  if (document.getElementById('wppStyles')) return;
  const s = document.createElement('style');
  s.id = 'wppStyles';
  s.textContent = `
    .wpp-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
    }
    .wpp-empty i { font-size: 2.2rem; opacity: .25; margin-bottom: 4px; color: var(--text-muted); }
    .wpp-empty strong { font-size: 15px; color: var(--text); }
    .wpp-empty p { font-size: 13px; margin: 0; color: var(--text-muted); }
    .wpp-cob-preview { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .wpp-cob-preview-head { display: flex; justify-content: space-between; align-items: center; }
  `;
  document.head.appendChild(s);
}

const STATUS_COR = {
  enviado: { label: 'Enviado',  bg: 'var(--success-soft)', cor: 'var(--success)' },
  link:    { label: 'Link',     bg: '#ede9fe',             cor: '#7c3aed' },
  erro:    { label: 'Erro',     bg: 'var(--danger-soft)',  cor: 'var(--danger)' }
};

const WhatsappModule = {
  state: {
    tab: 'config',
    cfg: null,
    templates: [],
    historico: [],
    clientes: [],
    initialized: false,
    loading: false
  },

  async init() {
    if (!this.state.initialized) {
      injectWppStyles();
      this.render();
      this.bindTabEvents();
      this.state.initialized = true;
    }
    await this.loadTab('config');
  },

  async loadTab(tab) {
    if (this.state.loading) return;
    this.state.loading = true;
    this.state.tab = tab;
    document.querySelectorAll('.wpp-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    try {
      if (tab === 'config')    await this.loadConfig();
      if (tab === 'templates') await this.loadTemplates();
      if (tab === 'cobranca')  await this.loadCobranca();
      if (tab === 'enviar')    this.renderEnviar();
      if (tab === 'historico') await this.loadHistorico();
      if (tab === 'automacao') this.renderAutomacao();
    } finally {
      this.state.loading = false;
    }
  },

  // ── Config ────────────────────────────────────────────────────────────────

  async loadConfig() {
    const el = document.getElementById('wppContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:40px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/whatsapp/config');
      this.state.cfg = data.config;
      this.renderConfig(data.config);
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  renderConfig(cfg) {
    const el = document.getElementById('wppContent');
    if (!el) return;
    const isLink = (cfg?.wpp_provider || 'link') === 'link';

    el.innerHTML = `
      <div style="max-width:560px;">
        <div class="wpp-info-box" style="margin-bottom:20px;">
          <i class="fa fa-circle-info"></i>
          Configure a integração com sua API WhatsApp. Use <strong>Evolution API</strong> (open-source, auto-hospedado) ou <strong>Z-API</strong> (SaaS). Sem API, o sistema gera links wa.me para disparo manual.
        </div>
        <form id="wppCfgForm" style="display:flex;flex-direction:column;gap:14px;">
          <div class="wpp-form-row">
            <div class="wpp-form-group">
              <label>Provedor</label>
              <select id="wppProvider" class="filter-input">
                <option value="link"      ${isLink ? 'selected':''}>Link wa.me (sem API)</option>
                <option value="evolution" ${(cfg?.wpp_provider||'link') === 'evolution' ? 'selected':''}>Evolution API</option>
                <option value="zapi"      ${(cfg?.wpp_provider||'link') === 'zapi'      ? 'selected':''}>Z-API</option>
              </select>
            </div>
            <div class="wpp-form-group">
              <label>Ativar envio automático</label>
              <label class="wpp-toggle">
                <input type="checkbox" id="wppAtivo" ${cfg?.wpp_ativo ? 'checked' : ''}>
                <span class="wpp-toggle-slider"></span>
              </label>
            </div>
          </div>
          <div id="wppApiUrlGroup" style="${isLink ? 'display:none' : ''}">
            <div class="wpp-form-row">
              <div class="wpp-form-group">
                <label>URL da API</label>
                <input id="wppApiUrl" class="filter-input" value="${esc(cfg?.wpp_api_url||'')}" placeholder="https://api.evolution.exemplo.com">
              </div>
              <div class="wpp-form-group">
                <label>Instância / Instance ID</label>
                <input id="wppInstance" class="filter-input" value="${esc(cfg?.wpp_instance||'')}" placeholder="minha-instancia">
              </div>
            </div>
            <div class="wpp-form-row">
              <div class="wpp-form-group">
                <label>Token / API Key ${cfg?.wpp_token ? '<span style="font-size:10px;color:var(--success);font-weight:600;">✓ Configurado</span>' : ''}</label>
                <input id="wppToken" class="filter-input" type="password" placeholder="${cfg?.wpp_token ? 'Deixe em branco para manter o atual' : 'Cole o token aqui'}">
              </div>
              <div class="wpp-form-group">
                <label>Número WhatsApp Business</label>
                <input id="wppNumero" class="filter-input" value="${esc(cfg?.wpp_numero||'')}" placeholder="5585999999999">
              </div>
            </div>
          </div>
          <div class="wpp-form-row">
            <div class="wpp-form-group">
              <label>Cooldown entre mensagens (horas)</label>
              <input id="wppCooldown" class="filter-input" type="number" min="1" max="168" value="${cfg?.wpp_cooldown_h || 24}">
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="submit" class="btn btn-primary btn-sm"><i class="fa fa-save"></i> Salvar configuração</button>
            <button type="button" class="btn btn-secondary btn-sm" id="wppTestarBtn"><i class="fa fa-flask"></i> Testar conexão</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('wppProvider')?.addEventListener('change', (e) => {
      const group = document.getElementById('wppApiUrlGroup');
      if (group) group.style.display = e.target.value !== 'link' ? '' : 'none';
    });
    document.getElementById('wppCfgForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.salvarConfig();
    });
    document.getElementById('wppTestarBtn')?.addEventListener('click', () => this.testar());
  },

  async salvarConfig() {
    const payload = {
      wpp_provider:   document.getElementById('wppProvider').value,
      wpp_api_url:    document.getElementById('wppApiUrl')?.value.trim() || null,
      wpp_instance:   document.getElementById('wppInstance')?.value.trim() || null,
      wpp_token:      document.getElementById('wppToken')?.value.trim() || null,
      wpp_numero:     document.getElementById('wppNumero')?.value.trim() || null,
      wpp_ativo:      document.getElementById('wppAtivo').checked,
      wpp_cooldown_h: parseInt(document.getElementById('wppCooldown').value) || 24
    };
    const btn = document.querySelector('#wppCfgForm button[type="submit"]');
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...'; }
      await api.fetchAPI('/whatsapp/config', 'PUT', payload);
      showToast('Configuração salva!', 'success');
      await this.loadConfig();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-save"></i> Salvar configuração'; } }
  },

  async testar() {
    const btn = document.getElementById('wppTestarBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Testando...';
    try {
      const data = await api.fetchAPI('/whatsapp/testar', 'POST');
      if (data.link) {
        showToast('Sem API configurada. Abrindo link manualmente...', 'info');
        window.open(data.link, '_blank', 'noopener,noreferrer');
      } else {
        showToast(data.mensagem || 'Teste enviado!', 'success');
      }
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fa fa-flask"></i> Testar conexão'; }
  },

  // ── Templates ─────────────────────────────────────────────────────────────

  async loadTemplates() {
    const el = document.getElementById('wppContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:80px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/whatsapp/templates');
      this.state.templates = data.templates || [];
      this.renderTemplates();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  renderTemplates() {
    const el = document.getElementById('wppContent');
    if (!el) return;

    el.innerHTML = `
      <div class="wpp-info-box" style="margin-bottom:16px;">
        <i class="fa fa-circle-info"></i>
        Use <strong>{{nome}}</strong>, <strong>{{valor}}</strong>, <strong>{{vencimento}}</strong>, <strong>{{dias}}</strong>, <strong>{{empresa}}</strong> e <strong>{{link}}</strong> nas mensagens.
      </div>
      <div id="wppTemplatesList"></div>
    `;

    const lista = document.getElementById('wppTemplatesList');
    lista.innerHTML = this.state.templates.map((t) => `
      <div class="wpp-template-card">
        <div class="wpp-template-head">
          <div>
            <span class="wpp-template-label">${esc(t.label)}</span>
            ${t.customizado ? '<span class="wpp-badge wpp-badge--custom">Personalizado</span>' : '<span class="wpp-badge">Padrão</span>'}
          </div>
          <label class="wpp-toggle wpp-toggle--sm">
            <input type="checkbox" class="wpp-tpl-ativo" data-evento="${t.evento}" ${t.ativo ? 'checked' : ''}>
            <span class="wpp-toggle-slider"></span>
          </label>
        </div>
        <textarea class="filter-input wpp-tpl-msg" data-evento="${t.evento}"
          rows="4" style="font-size:12px;font-family:monospace;resize:vertical;margin-top:8px;">${esc(t.mensagem)}</textarea>
        <div style="text-align:right;margin-top:6px;">
          <button class="btn btn-secondary btn-sm wpp-tpl-save" data-evento="${t.evento}">
            <i class="fa fa-save"></i> Salvar template
          </button>
        </div>
      </div>
    `).join('');

    lista.querySelectorAll('.wpp-tpl-save').forEach((btn) => {
      btn.addEventListener('click', () => this.salvarTemplate(btn.dataset.evento));
    });
    lista.querySelectorAll('.wpp-tpl-ativo').forEach((chk) => {
      chk.addEventListener('change', () => this.salvarTemplate(chk.dataset.evento));
    });
  },

  async salvarTemplate(evento) {
    const msg  = document.querySelector(`.wpp-tpl-msg[data-evento="${evento}"]`)?.value.trim();
    const ativo = document.querySelector(`.wpp-tpl-ativo[data-evento="${evento}"]`)?.checked;
    if (!msg) return;
    try {
      await api.fetchAPI(`/whatsapp/templates/${evento}`, 'PUT', { mensagem: msg, ativo });
      showToast('Template salvo!', 'success');
      await this.loadTemplates();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  // ── Envio manual ──────────────────────────────────────────────────────────

  renderEnviar() {
    const el = document.getElementById('wppContent');
    if (!el) return;
    el.innerHTML = `
      <div style="max-width:500px;">
        <form id="wppEnviarForm" style="display:flex;flex-direction:column;gap:14px;">
          <div class="wpp-form-group">
            <label>Telefone (com DDD e DDI, ex: 5585999999999)</label>
            <input id="wppEnvTel" class="filter-input" placeholder="5585999999999" required>
          </div>
          <div class="wpp-form-group">
            <label>Nome do cliente (opcional)</label>
            <input id="wppEnvNome" class="filter-input" placeholder="Nome para usar no template">
          </div>
          <div class="wpp-form-group">
            <label>Mensagem</label>
            <textarea id="wppEnvMsg" class="filter-input" rows="5" style="resize:vertical;" required placeholder="Digite a mensagem..."></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-sm"><i class="fa fa-paper-plane"></i> Enviar mensagem</button>
        </form>
      </div>
    `;

    setTimeout(() => document.getElementById('wppEnvTel')?.focus(), 50);

    document.getElementById('wppEnviarForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tel  = document.getElementById('wppEnvTel').value.trim();
      const nome = document.getElementById('wppEnvNome').value.trim();
      const msg  = document.getElementById('wppEnvMsg').value.trim();
      if (!tel || !msg) return;

      const btn = e.submitter;
      btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Enviando...';
      try {
        const data = await api.fetchAPI('/whatsapp/enviar', 'POST', { telefone: tel, mensagem: msg, cliente_nome: nome || null });
        if (data.status === 'link') {
          showToast('Sem API configurada. Abrindo link...', 'info');
          window.open(data.link, '_blank', 'noopener,noreferrer');
        } else if (data.sucesso) {
          showToast('Mensagem enviada!', 'success');
          document.getElementById('wppEnviarForm').reset();
        } else {
          showToast(data.erro || 'Falha no envio', 'error');
        }
      } catch (err) { showToast(buildFriendlyError(err), 'error'); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane"></i> Enviar mensagem'; }
    });
  },

  // ── Automação ─────────────────────────────────────────────────────────────

  renderAutomacao() {
    const el = document.getElementById('wppContent');
    if (!el) return;

    el.innerHTML = `
      <div style="max-width:560px;">
        <div class="wpp-info-box" style="margin-bottom:20px;">
          <i class="fa fa-robot"></i>
          O processamento de cobranças busca clientes com parcelas atrasadas ou próximas do vencimento e envia mensagens automáticas (respeitando o cooldown configurado).
        </div>
        <div class="wpp-auto-card">
          <h4 style="margin:0 0 16px;font-size:14px;font-weight:700;"><i class="fa fa-triangle-exclamation"></i> Cobranças atrasadas + Vencimento próximo</h4>
          <div class="wpp-form-row" style="margin-bottom:16px;">
            <div class="wpp-form-group">
              <label>Avisar X dias antes do vencimento</label>
              <input id="wppDiasAviso" class="filter-input" type="number" min="1" max="30" value="3">
            </div>
            <div class="wpp-form-group">
              <label>Cobrar a partir de X dias de atraso</label>
              <input id="wppDiasAtraso" class="filter-input" type="number" min="1" max="30" value="1">
            </div>
          </div>
          <button class="btn btn-primary" id="wppProcessarBtn">
            <i class="fa fa-play"></i> Processar agora
          </button>
          <div id="wppProcessarResult" style="margin-top:16px;"></div>
        </div>
        <div class="wpp-info-box" style="margin-top:16px;">
          <i class="fa fa-clock"></i>
          Para automação periódica (ex: todo dia às 9h), configure um cron no Render ou use o endpoint
          <code>POST /whatsapp/processar/cobrancas</code> via webhook agendado externo.
        </div>
      </div>
    `;

    document.getElementById('wppProcessarBtn')?.addEventListener('click', async () => {
      const ok = await confirmarAcao(
        'Processar cobranças agora enviará mensagens WhatsApp para TODOS os clientes elegíveis. Deseja continuar?'
      );
      if (!ok) return;

      const btn = document.getElementById('wppProcessarBtn');
      const result = document.getElementById('wppProcessarResult');
      const diasAviso  = parseInt(document.getElementById('wppDiasAviso').value) || 3;
      const diasAtraso = parseInt(document.getElementById('wppDiasAtraso').value) || 1;

      btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Processando...';
      result.innerHTML = '';
      try {
        const data = await api.fetchAPI('/whatsapp/processar/cobrancas', 'POST', { dias_aviso: diasAviso, dias_atraso: diasAtraso });
        const r = data.resumo;
        result.innerHTML = `
          <div class="wpp-resumo">
            <div class="wpp-resumo-item wpp-resumo-item--ok"><strong>${r.atrasadas + r.vencendo}</strong><span>Enviadas via API</span></div>
            <div class="wpp-resumo-item wpp-resumo-item--link"><strong>${r.links}</strong><span>Links gerados</span></div>
            <div class="wpp-resumo-item ${r.erros > 0 ? 'wpp-resumo-item--err' : 'wpp-resumo-item--ok'}"><strong>${r.erros}</strong><span>Erros</span></div>
          </div>`;
        showToast(data.mensagem, r.erros > 0 ? 'error' : 'success');
      } catch (err) {
        result.innerHTML = `<div style="color:var(--danger);font-size:13px;">${esc(buildFriendlyError(err))}</div>`;
        showToast(buildFriendlyError(err), 'error');
      } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fa fa-play"></i> Processar agora';
      }
    });
  },

  // ── Histórico ─────────────────────────────────────────────────────────────

  async loadHistorico() {
    const el = document.getElementById('wppContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 4}).map(() => '<div class="skeleton-line" style="height:36px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/whatsapp/historico');
      this.state.historico = data.historico || [];
      this.renderHistorico();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  renderHistorico() {
    const el = document.getElementById('wppContent');
    if (!el) return;

    if (!this.state.historico.length) {
      el.innerHTML = `<div class="wpp-empty">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <strong>Nenhuma mensagem enviada ainda</strong>
        <p>O histórico de mensagens WhatsApp aparecerá aqui após os envios.</p>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <table>
          <thead><tr><th>Evento</th><th>Cliente</th><th>Telefone</th><th>Status</th><th>Data</th><th>Erro</th></tr></thead>
          <tbody>
            ${this.state.historico.map((h) => {
              const st = STATUS_COR[h.status] || { label: h.status, bg: '#eee', cor: '#666' };
              return `<tr>
                <td><code style="font-size:11px;">${esc(h.evento)}</code></td>
                <td style="font-size:12px;">${esc(h.cliente_nome || '—')}</td>
                <td style="font-size:12px;">${esc(h.telefone)}</td>
                <td><span style="background:${st.bg};color:${st.cor};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">${esc(st.label)}</span></td>
                <td style="font-size:11px;color:var(--text-muted);">${new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                <td style="font-size:11px;color:var(--danger);">${esc(h.erro_msg || '')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ── Cobranças ─────────────────────────────────────────────────────────────

  async loadCobranca() {
    const el = document.getElementById('wppContent');
    if (el) el.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:40px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const data = await api.fetchAPI('/contas-receber/promissorias');
      this.state.clientes = data.clientes || [];
      this.renderCobranca();
    } catch (err) { showToast(buildFriendlyError(err), 'error'); }
  },

  renderCobranca() {
    const el = document.getElementById('wppContent');
    if (!el) return;
    const { clientes } = this.state;

    if (!clientes.length) {
      el.innerHTML = `<div class="wpp-empty">
        <i class="fa-solid fa-comment-dollar"></i>
        <strong>Nenhuma promissória em aberto</strong>
        <p>Não há clientes com parcelas pendentes para gerar cobrança.</p>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div style="max-width:560px;">
        <div class="wpp-info-box" style="margin-bottom:16px;">
          <i class="fa fa-comment-dollar"></i>
          Selecione o cliente para gerar a mensagem de cobrança mensal com todas as parcelas em aberto.
        </div>
        <div class="wpp-form-group" style="margin-bottom:16px;">
          <label>Cliente</label>
          <select id="wppCobCliente" class="filter-input">
            <option value="">Selecione um cliente...</option>
            ${clientes.map((c) => {
              const key = c.cliente_id != null ? c.cliente_id : `n_${c.cliente_nome}`;
              const np  = c.itens.length;
              return `<option value="${esc(String(key))}">${esc(c.cliente_nome)} (${np} parcela${np !== 1 ? 's' : ''})</option>`;
            }).join('')}
          </select>
        </div>
        <div id="wppCobPreview"></div>
      </div>
    `;

    document.getElementById('wppCobCliente')?.addEventListener('change', (e) => {
      const val = e.target.value;
      const prev = document.getElementById('wppCobPreview');
      if (!val || !prev) { if (prev) prev.innerHTML = ''; return; }
      const cli = clientes.find((c) => String(c.cliente_id != null ? c.cliente_id : `n_${c.cliente_nome}`) === val);
      if (cli) this.renderMsgPreview(cli);
    });
  },

  renderMsgPreview(cliente) {
    const prev = document.getElementById('wppCobPreview');
    if (!prev) return;
    const msg = this._gerarMensagem(cliente);
    let tel = (cliente.telefone || '').replace(/\D/g, '');
    if (tel.length === 11 || tel.length === 10) tel = '55' + tel;
    const telLink = tel.length >= 12
      ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
      : null;

    prev.innerHTML = `
      <div class="wpp-cob-preview">
        <div class="wpp-cob-preview-head">
          <span style="font-size:13px;font-weight:600;color:var(--text-muted);">
            <i class="fa-solid fa-eye"></i> Prévia
          </span>
          <span style="font-size:12px;color:var(--text-muted);">
            ${cliente.itens.length} item${cliente.itens.length !== 1 ? 's' : ''} ·
            ${Number(cliente.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
        <textarea id="wppCobMsg" class="filter-input" rows="14" readonly
          style="font-size:13px;font-family:monospace;resize:vertical;margin:10px 0;">${esc(msg)}</textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" id="wppCobCopiar">
            <i class="fa fa-copy"></i> Copiar mensagem
          </button>
          ${telLink
            ? `<a href="${telLink}" target="_blank" rel="noopener noreferrer" class="btn btn-success btn-sm">
                <i class="fa-brands fa-whatsapp"></i> Abrir no WhatsApp
               </a>`
            : `<span style="font-size:12px;color:var(--text-muted);padding:4px 0;align-self:center;">
                <i class="fa fa-triangle-exclamation"></i> Telefone não cadastrado
               </span>`
          }
        </div>
      </div>
    `;

    document.getElementById('wppCobCopiar')?.addEventListener('click', async () => {
      const text = document.getElementById('wppCobMsg')?.value;
      if (!text) return;
      const btn = document.getElementById('wppCobCopiar');
      try {
        await navigator.clipboard.writeText(text);
        btn.innerHTML = '<i class="fa fa-check"></i> Copiado!';
        setTimeout(() => { btn.innerHTML = '<i class="fa fa-copy"></i> Copiar mensagem'; }, 2000);
      } catch {
        showToast('Não foi possível copiar. Selecione e copie manualmente.', 'error');
      }
    });
  },

  _gerarMensagem(cliente) {
    const linhas = cliente.itens.map((item, i) => {
      const num  = String(i + 1).padStart(2, '0');
      const desc = (item.descricao || 'Produto').trim();
      const parc = item.parcela != null && item.total_parcelas != null
        ? ` - ${item.parcela}/${item.total_parcelas}` : '';
      const val  = Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${num} - ${desc}${parc} - R$ ${val}`;
    });
    const total = Number(cliente.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return linhas.join('\n') + `\n\n*Total - R$ ${total}*`;
  },

  // ── Estrutura ─────────────────────────────────────────────────────────────

  render() {
    const c = document.getElementById('whatsappContainer');
    if (!c) return;
    c.innerHTML = `
      <div class="wpp-tabs">
        <button class="wpp-tab-btn active" data-tab="config"><i class="fa fa-gear"></i> Configuração</button>
        <button class="wpp-tab-btn" data-tab="templates"><i class="fa fa-message"></i> Templates</button>
        <button class="wpp-tab-btn" data-tab="automacao"><i class="fa fa-robot"></i> Automação</button>
        <button class="wpp-tab-btn" data-tab="cobranca"><i class="fa-solid fa-comment-dollar"></i> Cobranças</button>
        <button class="wpp-tab-btn" data-tab="enviar"><i class="fa fa-paper-plane"></i> Enviar</button>
        <button class="wpp-tab-btn" data-tab="historico"><i class="fa fa-clock-rotate-left"></i> Histórico</button>
      </div>
      <div id="wppContent" style="margin-top:20px;"></div>
    `;
  },

  bindTabEvents() {
    document.getElementById('whatsappContainer')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.wpp-tab-btn');
      if (btn) this.loadTab(btn.dataset.tab);
    });
  },

};

export async function initWhatsappModule() {
  return WhatsappModule.init();
}

export default WhatsappModule;
