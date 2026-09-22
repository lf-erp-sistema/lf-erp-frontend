import api from './api.js';
import { showToast } from './feedback.js';
import { escapeHtml, buildFriendlyError } from './utils.js';

const esc = escapeHtml;

function injectAlertasStyles() {
  if (document.getElementById('alStyles')) return;
  const s = document.createElement('style');
  s.id = 'alStyles';
  s.textContent = `
    .al-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
    }
    .al-empty i { font-size: 2.2rem; opacity: .25; margin-bottom: 4px; color: var(--text-muted); }
    .al-empty strong { font-size: 15px; color: var(--text); }
    .al-empty p { font-size: 13px; margin: 0; color: var(--text-muted); }
  `;
  document.head.appendChild(s);
}

const AlertasModule = {
  state: {
    aba: 'disparar',
    config: null,
    historico: [],
    resultadoDisparo: null,
    carregando: false,
    promissorias: [],
    promissoriasCarregando: false,
    previewModal: null
  },

  init() {
    injectAlertasStyles();
    this.render();
    this.bindShellEvents();
    this.load();
  },

  async load() {
    if (this.state.carregando) return;
    this.state.carregando = true;
    this.setFeedback('', '');
    const conteudo = document.getElementById('alertasConteudo');
    if (conteudo) conteudo.innerHTML = `<div class="module-skeleton" style="padding:16px">${
      Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:40px;margin-bottom:10px;border-radius:6px"></div>').join('')
    }</div>`;
    try {
      const [cfgRes, histRes] = await Promise.allSettled([
        api.getAlertasConfig(),
        api.getAlertasHistorico()
      ]);
      this.state.config    = cfgRes.status  === 'fulfilled' ? (cfgRes.value?.config   || null) : null;
      this.state.historico = histRes.status === 'fulfilled' ? (histRes.value?.historico || []) : [];
      this.renderConteudo();
    } catch (err) {
      console.error('[alertas] load:', err);
      this.setFeedback(buildFriendlyError(err), 'error');
    } finally {
      this.state.carregando = false;
    }
  },

  async loadPromissorias() {
    if (this.state.promissoriasCarregando) return;
    this.state.promissoriasCarregando = true;
    try {
      const res = await api.getPromissorias();
      this.state.promissorias = res?.clientes || [];
      this.renderConteudo();
    } catch (err) {
      console.error('[alertas] loadPromissorias:', err);
      showToast(buildFriendlyError(err), 'error');
    } finally {
      this.state.promissoriasCarregando = false;
    }
  },

  render() {
    const c = document.getElementById('alertasContainer');
    if (!c) return;
    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="alertasFeedback"></div>
        <div class="module-toolbar">
          <div class="table-actions">
            <button class="btn-inline btn-inline--active" data-al-aba="disparar">Disparar Alertas</button>
            <button class="btn-inline" data-al-aba="promissorias"><i class="fa-solid fa-file-invoice-dollar"></i> Promissórias</button>
            <button class="btn-inline" data-al-aba="config">Configuração</button>
            <button class="btn-inline" data-al-aba="historico">Histórico</button>
          </div>
          <button class="btn btn-light" id="alertasAtualizarBtn">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>
        <div id="alertasConteudo"></div>
      </section>
      <div id="alertasPreviewModal" class="modal-overlay" style="display:none">
        <div class="modal-box" style="max-width:520px">
          <div class="modal-header">
            <h3><i class="fa-brands fa-whatsapp" style="color:#25d366"></i> Mensagem WhatsApp</h3>
            <button class="modal-close" id="alertasPreviewFechar">&times;</button>
          </div>
          <div class="modal-body">
            <pre id="alertasPreviewTexto" style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:var(--surface-2);padding:16px;border-radius:10px;border:1px solid var(--border);max-height:340px;overflow-y:auto"></pre>
            <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
              <button class="btn btn-light" id="alertasPreviewCopiar" style="flex:1">
                <i class="fa-solid fa-copy"></i> Copiar mensagem
              </button>
              <a id="alertasPreviewLink" href="#" target="_blank" rel="noopener"
                 class="btn btn-primary" style="flex:1;text-align:center;text-decoration:none">
                <i class="fa-brands fa-whatsapp"></i> Abrir WhatsApp
              </a>
            </div>
            <div class="module-feedback" id="alertasPreviewFeedback" style="margin-top:10px"></div>
          </div>
        </div>
      </div>
    `;
  },

  bindShellEvents() {
    const c = document.getElementById('alertasContainer');
    if (!c) return;

    const atuBtn = document.getElementById('alertasAtualizarBtn');
    if (atuBtn) atuBtn.onclick = () => { if (this.state.carregando) return; this.load(); };

    c.onclick = (e) => {
      const abaBtn = e.target.closest('[data-al-aba]');
      if (abaBtn) {
        this.state.aba = abaBtn.dataset.alAba;
        document.querySelectorAll('[data-al-aba]').forEach((b) => b.classList.remove('btn-inline--active'));
        abaBtn.classList.add('btn-inline--active');
        if (this.state.aba === 'promissorias' && !this.state.promissorias.length) {
          this.loadPromissorias();
        } else {
          this.renderConteudo();
        }
      }
    };
  },

  renderConteudo() {
    const c = document.getElementById('alertasConteudo');
    if (!c) return;
    if (this.state.aba === 'config')       { c.innerHTML = this.renderConfig();       this.bindConfigEvents();       return; }
    if (this.state.aba === 'historico')    { c.innerHTML = this.renderHistorico();     return; }
    if (this.state.aba === 'promissorias') { c.innerHTML = this.renderPromissorias();  this.bindPromissoriasEvents(); return; }
    c.innerHTML = this.renderDisparar();
    this.bindDispararEvents();
  },

  // ── DISPARAR ──────────────────────────────────────────────────────────────

  renderDisparar() {
    const cfg = this.state.config;
    const resultado = this.state.resultadoDisparo;

    const emailOk = cfg?.email_ativo && cfg?.smtp_host;
    const wppOk   = cfg?.whatsapp_ativo;

    const avisos = [];
    if (!cfg) avisos.push('Configure o módulo na aba <strong>Configuração</strong> antes de disparar.');
    else {
      if (!emailOk && !wppOk) avisos.push('Ative pelo menos um canal (Email ou WhatsApp) na configuração.');
      if (cfg.email_ativo && !cfg.smtp_host) avisos.push('Email ativado mas SMTP não configurado.');
    }

    return `
      <div style="max-width:640px;margin-top:20px">
        ${avisos.length ? `<div class="module-feedback module-feedback--error" style="margin-bottom:16px">${avisos.join('<br>')}</div>` : ''}

        <div class="panel-card" style="margin-bottom:16px">
          <div class="panel-card__header">
            <div><h3>Status dos canais</h3><p>Configure na aba Configuração</p></div>
          </div>
          <div class="panel-card__body">
            <div style="display:flex;gap:20px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:8px;font-size:14px">
                <i class="fa-solid fa-envelope" style="color:${emailOk ? 'var(--success)' : 'var(--text-muted)'}"></i>
                Email: <strong style="color:${emailOk ? 'var(--success)' : 'var(--danger)'}">${emailOk ? 'Configurado' : 'Não configurado'}</strong>
              </div>
              <div style="display:flex;align-items:center;gap:8px;font-size:14px">
                <i class="fa-brands fa-whatsapp" style="color:${wppOk ? '#25d366' : 'var(--text-muted)'}"></i>
                WhatsApp: <strong style="color:${wppOk ? '#25d366' : 'var(--danger)'}">${wppOk ? 'Links ativos' : 'Desativado'}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-card" style="margin-bottom:16px">
          <div class="panel-card__header">
            <div><h3>Critério de disparo</h3><p>Mínimo de ${cfg?.dias_atraso_minimo || 1} dia(s) em atraso</p></div>
          </div>
          <div class="panel-card__body">
            <div class="module-feedback module-feedback--info" style="margin-bottom:14px">
              Serão alertados todos os clientes com títulos em atraso há mais de
              <strong>${cfg?.dias_atraso_minimo || 1} dia(s)</strong>.
              Clientes sem email/telefone cadastrado serão ignorados no canal correspondente.
            </div>
            <button class="btn btn-primary" id="alertasDispararBtn" ${!cfg || (!emailOk && !wppOk) ? 'disabled' : ''}>
              <i class="fa-solid fa-paper-plane"></i> Disparar Alertas Agora
            </button>
            <div class="module-feedback" id="alertasDispararFeedback" style="margin-top:12px"></div>
          </div>
        </div>

        ${resultado ? this.renderResultado(resultado) : ''}
      </div>
    `;
  },

  renderResultado(r) {
    const linksWpp = r.links_whatsapp || [];
    return `
      <div class="panel-card">
        <div class="panel-card__header">
          <div><h3>Resultado do disparo</h3><p>${esc(r.mensagem || '')}</p></div>
        </div>
        <div class="panel-card__body">
          <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
            <div style="background:var(--success-soft);padding:10px 16px;border-radius:10px;font-size:13px">
              <i class="fa-solid fa-envelope" style="color:var(--success)"></i>
              <strong>${r.enviados_email || 0}</strong> email(s) enviado(s)
            </div>
            ${r.erros_email ? `
              <div style="background:var(--danger-soft);padding:10px 16px;border-radius:10px;font-size:13px">
                <i class="fa-solid fa-circle-exclamation" style="color:var(--danger)"></i>
                <strong>${r.erros_email}</strong> erro(s) de email
              </div>
            ` : ''}
            <div style="background:#f0fdf4;padding:10px 16px;border-radius:10px;font-size:13px">
              <i class="fa-brands fa-whatsapp" style="color:#25d366"></i>
              <strong>${linksWpp.length}</strong> link(s) WhatsApp
            </div>
          </div>

          ${linksWpp.length ? `
            <h4 style="font-size:13px;font-weight:700;margin-bottom:10px">
              Links WhatsApp — clique para abrir e enviar:
            </h4>
            <div style="display:grid;gap:8px;max-height:320px;overflow-y:auto">
              ${linksWpp.map((l) => `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border)">
                  <div>
                    <strong style="font-size:13px">${esc(l.cliente_nome || '-')}</strong>
                    <div style="font-size:11px;color:var(--text-muted)">${esc(l.telefone || '')} · ${this.fmtCur(l.valor_total)}</div>
                  </div>
                  <a href="${esc(this.safeUrl(l.link))}" target="_blank" rel="noopener"
                     style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#25d366;color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap">
                    <i class="fa-brands fa-whatsapp"></i> Enviar
                  </a>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  bindDispararEvents() {
    document.getElementById('alertasDispararBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('alertasDispararBtn');
      const fb  = document.getElementById('alertasDispararFeedback');

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disparando...'; }
      if (fb)  { fb.className = 'module-feedback module-feedback--info'; fb.textContent = 'Enviando alertas...'; }

      try {
        const result = await api.dispararAlertas({});
        this.state.resultadoDisparo = result;
        showToast(result.mensagem || 'Alertas processados.', 'success');
        if (fb) { fb.className = 'module-feedback module-feedback--success'; fb.textContent = result.mensagem || 'Concluído.'; }
        this.renderConteudo();
        await this.load();
      } catch (err) {
        const msg = buildFriendlyError(err);
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = msg; }
        showToast(msg, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Disparar Alertas Agora'; }
      }
    });
  },

  // ── CONFIGURAÇÃO ───────────────────────────────────────────────────────────

  renderConfig() {
    const cfg = this.state.config || {};
    const v   = (val) => esc(val || '');
    const temSmtpPass = Boolean(cfg.smtp_pass);

    return `
      <div style="max-width:620px;margin-top:20px;display:grid;gap:20px">

        <div class="panel-card">
          <div class="panel-card__header">
            <div><h3>Email (SMTP)</h3><p>Envio automático de emails de cobrança</p></div>
          </div>
          <div class="panel-card__body">
            <div class="form-grid">
              <div class="form-field form-field--span-2">
                <label>
                  <input type="checkbox" id="alEmailAtivo" ${cfg.email_ativo ? 'checked' : ''} />
                  Ativar envio de email
                </label>
              </div>
              <div class="form-field">
                <label>Servidor SMTP</label>
                <input id="alSmtpHost" value="${v(cfg.smtp_host)}" placeholder="smtp.gmail.com" />
              </div>
              <div class="form-field">
                <label>Porta</label>
                <input id="alSmtpPort" type="number" value="${v(cfg.smtp_port || 587)}" />
              </div>
              <div class="form-field">
                <label>Usuário / Email</label>
                <input id="alSmtpUser" value="${v(cfg.smtp_user)}" placeholder="seuemail@gmail.com" />
              </div>
              <div class="form-field">
                <label>Senha / App Password</label>
                <input type="password" id="alSmtpPass"
                  placeholder="${temSmtpPass ? '***configurado*** — preencha para alterar' : 'Senha ou App Password'}" />
              </div>
              <div class="form-field form-field--span-2">
                <label>Nome do remetente</label>
                <input id="alSmtpFrom" value="${v(cfg.smtp_from)}" placeholder="Lucileide Variedades <email@gmail.com>" />
              </div>
              <div class="form-field form-field--span-2">
                <label>Assunto do email</label>
                <input id="alEmailAssunto" value="${v(cfg.email_assunto || 'Aviso de pagamento pendente')}" />
              </div>
              <div class="form-field form-field--span-2">
                <label>Corpo do email</label>
                <textarea id="alEmailCorpo" rows="5" placeholder="Use {{cliente_nome}}, {{valor_total}}, {{empresa_nome}}">${v(cfg.email_corpo)}</textarea>
                <small style="color:var(--text-muted)">Variáveis: {{cliente_nome}} {{valor_total}} {{empresa_nome}} {{dias_atraso}}</small>
              </div>
            </div>
            <div class="module-feedback module-feedback--info" style="margin-top:10px">
              Para Gmail: ative a Verificação em 2 etapas → crie uma <strong>Senha de App</strong> em myaccount.google.com/apppasswords.
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header">
            <div><h3>WhatsApp</h3><p>Gera links wa.me para envio manual por cada cliente</p></div>
          </div>
          <div class="panel-card__body">
            <div class="form-grid">
              <div class="form-field form-field--span-2">
                <label>
                  <input type="checkbox" id="alWppAtivo" ${cfg.whatsapp_ativo ? 'checked' : ''} />
                  Ativar links WhatsApp
                </label>
              </div>
              <div class="form-field form-field--span-2">
                <label>Mensagem WhatsApp</label>
                <textarea id="alWppMsg" rows="4" placeholder="Use {{cliente_nome}}, {{valor_total}}, {{empresa_nome}}">${v(cfg.whatsapp_msg)}</textarea>
                <small style="color:var(--text-muted)">Variáveis: {{cliente_nome}} {{valor_total}} {{empresa_nome}} {{dias_atraso}}</small>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header">
            <div><h3>Critério</h3></div>
          </div>
          <div class="panel-card__body">
            <div class="form-field">
              <label>Disparar quando atraso for maior que (dias)</label>
              <input type="number" id="alDiasMin" min="0" value="${v(cfg.dias_atraso_minimo || 1)}" style="max-width:100px" />
            </div>
          </div>
        </div>

        <div>
          <button class="btn btn-primary" id="alSalvarConfigBtn">
            <i class="fa-solid fa-floppy-disk"></i> Salvar configuração
          </button>
          <div class="module-feedback" id="alConfigFeedback" style="margin-top:10px"></div>
        </div>
      </div>
    `;
  },

  bindConfigEvents() {
    document.getElementById('alSalvarConfigBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('alSalvarConfigBtn');
      const fb  = document.getElementById('alConfigFeedback');

      const smtpPass = document.getElementById('alSmtpPass')?.value?.trim();

      const payload = {
        email_ativo:         document.getElementById('alEmailAtivo')?.checked  ?? false,
        smtp_host:           document.getElementById('alSmtpHost')?.value?.trim() || null,
        smtp_port:           Number(document.getElementById('alSmtpPort')?.value || 587),
        smtp_user:           document.getElementById('alSmtpUser')?.value?.trim() || null,
        smtp_from:           document.getElementById('alSmtpFrom')?.value?.trim() || null,
        email_assunto:       document.getElementById('alEmailAssunto')?.value?.trim() || null,
        email_corpo:         document.getElementById('alEmailCorpo')?.value?.trim() || null,
        whatsapp_ativo:      document.getElementById('alWppAtivo')?.checked ?? false,
        whatsapp_msg:        document.getElementById('alWppMsg')?.value?.trim() || null,
        dias_atraso_minimo:  Number(document.getElementById('alDiasMin')?.value || 1)
      };

      // Só envia smtp_pass se o campo foi preenchido
      if (smtpPass) payload.smtp_pass = smtpPass;

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }

      try {
        await api.salvarAlertasConfig(payload);
        showToast('Configuração de alertas salva.', 'success');
        await this.load();
        const fbAfter = document.getElementById('alConfigFeedback');
        if (fbAfter) { fbAfter.className = 'module-feedback module-feedback--success'; fbAfter.textContent = 'Configuração salva com sucesso.'; }
      } catch (err) {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = buildFriendlyError(err); }
        showToast(buildFriendlyError(err), 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar configuração'; }
      }
    });
  },

  // ── HISTÓRICO ─────────────────────────────────────────────────────────────

  renderHistorico() {
    const hist = this.state.historico;

    const totEmail = hist.filter((h) => h.tipo === 'email'     && h.status === 'enviado').length;
    const totWpp   = hist.filter((h) => h.tipo === 'whatsapp'  && h.status === 'enviado').length;
    const totErros = hist.filter((h) => h.status === 'erro').length;

    if (!hist.length) {
      return `<div class="al-empty">
        <i class="fa-solid fa-bell-slash"></i>
        <strong>Nenhum alerta disparado ainda</strong>
        <p>Use a aba "Disparar Alertas" para enviar lembretes de pagamento aos clientes.</p>
      </div>`;
    }

    const linhas = hist.map((h) => {
      const data = h.criado_em ? new Date(h.criado_em).toLocaleString('pt-BR') : '-';
      return `
        <tr>
          <td>
            ${h.tipo === 'email'
              ? '<i class="fa-solid fa-envelope" style="color:var(--primary)"></i> Email'
              : '<i class="fa-brands fa-whatsapp" style="color:#25d366"></i> WhatsApp'}
          </td>
          <td>${esc(h.cliente_nome || '-')}</td>
          <td>${esc(h.contato || '-')}</td>
          <td class="text-right">${this.fmtCur(h.valor_total)}</td>
          <td>
            <span class="badge ${h.status === 'enviado' ? 'badge--success' : 'badge--danger'}">
              ${h.status}
            </span>
          </td>
          <td>${data}</td>
          ${h.erro_msg ? `<td><small style="color:var(--danger)">${esc(h.erro_msg)}</small></td>` : '<td>—</td>'}
        </tr>
      `;
    }).join('');

    return `
      <div class="module-toolbar" style="margin-top:8px;margin-bottom:12px">
        <div class="module-toolbar__stats">
          <div class="mini-stat"><span>Emails enviados</span><strong>${totEmail}</strong></div>
          <div class="mini-stat"><span>Links WhatsApp</span><strong>${totWpp}</strong></div>
          <div class="mini-stat"><span>Erros</span><strong style="color:${totErros > 0 ? 'var(--danger)' : ''}">${totErros}</strong></div>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Canal</th>
              <th>Cliente</th>
              <th>Contato</th>
              <th class="text-right">Valor</th>
              <th>Status</th>
              <th>Enviado em</th>
              <th>Erro</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    `;
  },

  // ── PROMISSÓRIAS ──────────────────────────────────────────────────────────

  renderPromissorias() {
    const lista = this.state.promissorias;
    const cfg   = this.state.config || {};
    const preventiva = cfg.cobranca_preventiva_ativa;

    if (this.state.promissoriasCarregando) {
      return `<div class="module-skeleton" style="padding:16px;margin-top:16px">${
        Array.from({length: 3}).map(() => '<div class="skeleton-line" style="height:40px;margin-bottom:10px;border-radius:6px"></div>').join('')
      }</div>`;
    }

    const cartoes = lista.length === 0
      ? `<div class="empty-table-state" style="margin-top:24px">
           <i class="fa-solid fa-file-invoice-dollar" style="font-size:2rem;opacity:.22;margin-bottom:8px"></i>
           <strong>Nenhuma promissória em aberto</strong>
           <span>Todos os clientes estão com saldo zerado.</span>
         </div>`
      : lista.map(cli => {
          const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
          const itensHtml = cli.itens.map(item => {
            const temParcial = Number(item.valor_original || 0) > Number(item.valor || 0) + 0.01;
            const dataVenc   = item.data_vencimento
              ? new Date(String(item.data_vencimento).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR')
              : '—';
            const venceHoje = item.data_vencimento &&
              new Date(String(item.data_vencimento).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') === hojeStr;

            const badgeStatus = venceHoje
              ? `<span class="badge badge--warning" style="font-size:10px">Vence hoje</span>`
              : item.status === 'atrasado' || item.status === 'parcial_atrasado'
                ? `<span class="badge badge--danger" style="font-size:10px">Atrasado</span>`
                : `<span class="badge badge--info" style="font-size:10px">${dataVenc}</span>`;

            return `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.descricao)}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${badgeStatus}</div>
                </div>
                <div style="text-align:right;white-space:nowrap">
                  ${temParcial
                    ? `<div style="font-size:13px;font-weight:700;color:var(--warning)">${this.fmtCur(item.valor)}</div>
                       <div style="font-size:11px;color:var(--text-muted);text-decoration:line-through">${this.fmtCur(item.valor_original)}</div>`
                    : `<div style="font-size:13px;font-weight:700">${this.fmtCur(item.valor)}</div>`
                  }
                </div>
              </div>`;
          }).join('');

          const temTel = Boolean(cli.telefone);
          const cliAttr = `data-cli-id="${esc(String(cli.cliente_id || ''))}" data-cli-nome="${esc(cli.cliente_nome)}"`;

          return `
            <div class="panel-card" style="margin-bottom:14px">
              <div class="panel-card__header">
                <div style="flex:1">
                  <h3 style="margin:0">${esc(cli.cliente_nome)}</h3>
                  <p style="margin:0;font-size:12px;color:var(--text-muted)">
                    ${temTel ? `<i class="fa-solid fa-phone" style="font-size:11px"></i> ${esc(cli.telefone)}` : 'Sem telefone cadastrado'}
                    · ${cli.itens.length} produto(s)
                  </p>
                </div>
                <div style="text-align:right">
                  <div style="font-size:16px;font-weight:700">${this.fmtCur(cli.total)}</div>
                  ${Number(cli.total_original || 0) > Number(cli.total || 0) + 0.01
                    ? `<div style="font-size:11px;color:var(--text-muted);text-decoration:line-through">${this.fmtCur(cli.total_original)}</div>`
                    : ''}
                </div>
              </div>
              <div class="panel-card__body">
                ${itensHtml}
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                  <button class="btn btn-light btn-sm al-preview-btn" ${cliAttr} style="font-size:12px">
                    <i class="fa-solid fa-eye"></i> Ver mensagem
                  </button>
                  <button class="btn btn-light btn-sm al-copiar-btn" ${cliAttr} style="font-size:12px">
                    <i class="fa-solid fa-copy"></i> Copiar
                  </button>
                  ${temTel
                    ? `<button class="btn btn-primary btn-sm al-enviar-btn" ${cliAttr} style="font-size:12px;background:#25d366;border-color:#25d366">
                         <i class="fa-brands fa-whatsapp"></i> Enviar WhatsApp
                       </button>`
                    : `<span style="font-size:11px;color:var(--text-muted);align-self:center">Cadastre o telefone para enviar</span>`
                  }
                </div>
              </div>
            </div>`;
        }).join('');

    return `
      <div style="max-width:680px;margin-top:20px">

        <div class="panel-card" style="margin-bottom:18px">
          <div class="panel-card__body" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <strong style="font-size:14px"><i class="fa-solid fa-clock" style="color:var(--primary)"></i> Aviso automático às 8h</strong>
              <p style="margin:4px 0 0;font-size:12px;color:var(--text-muted)">
                Envia mensagem WhatsApp no dia do vencimento via cron-job.org
              </p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="alertasPreventivaToogle" ${preventiva ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="alertasPreventivaCronInfo" style="display:${preventiva ? 'block' : 'none'};padding:0 16px 14px">
            <div class="module-feedback module-feedback--info" style="font-size:12px">
              Configure o <strong>cron-job.org</strong> (gratuito) para chamar:<br>
              <code style="font-size:11px;background:var(--surface-2);padding:2px 6px;border-radius:4px;word-break:break-all">
                POST ${window.location.origin.replace('vercel.app', 'onrender.com') || 'https://seu-backend.onrender.com'}/alertas/disparar-preventivo
              </code><br>
              Header: <code style="font-size:11px">x-cron-secret: &lt;CRON_SECRET&gt;</code> · Body: <code style="font-size:11px">{"empresa_id": ID}</code> · Horário: <strong>11:00 UTC</strong> (= 8h Fortaleza)
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <h3 style="margin:0;font-size:15px">Clientes com promissórias em aberto (${lista.length})</h3>
          <button class="btn btn-light btn-sm" id="alertasPromissoriasRecarregar">
            <i class="fa-solid fa-rotate"></i> Recarregar
          </button>
        </div>

        ${cartoes}
        <div class="module-feedback" id="alertasPromissoriasFeedback" style="margin-top:10px"></div>
      </div>`;
  },

  bindPromissoriasEvents() {
    // Toggle auto-alert
    document.getElementById('alertasPreventivaToogle')?.addEventListener('change', async (e) => {
      const ativo = e.target.checked;
      const info  = document.getElementById('alertasPreventivaCronInfo');
      if (info) info.style.display = ativo ? 'block' : 'none';
      try {
        await api.salvarAlertasConfig({ cobranca_preventiva_ativa: ativo });
        if (this.state.config) this.state.config.cobranca_preventiva_ativa = ativo;
        showToast(ativo ? 'Aviso automático ativado.' : 'Aviso automático desativado.', 'success');
      } catch {
        showToast('Erro ao salvar configuração.', 'error');
        e.target.checked = !ativo;
      }
    });

    // Recarregar lista
    document.getElementById('alertasPromissoriasRecarregar')?.addEventListener('click', () => this.loadPromissorias());

    // Preview / Copiar / Enviar — delegação no container
    const c = document.getElementById('alertasConteudo');
    if (!c) return;

    const getCliData = (btn) => ({
      cliente_id:   btn.dataset.cliId   || null,
      cliente_nome: btn.dataset.cliNome || null
    });

    const abrirPreview = async (btn) => {
      const { cliente_id, cliente_nome } = getCliData(btn);
      const fb = document.getElementById('alertasPromissoriasFeedback');
      try {
        const res = await api.previewPromissoria({ cliente_id, cliente_nome });
        this.abrirModalPreview(res.mensagem, res.link);
      } catch (err) {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = buildFriendlyError(err); }
      }
    };

    const copiarMsg = async (btn) => {
      const { cliente_id, cliente_nome } = getCliData(btn);
      const fb = document.getElementById('alertasPromissoriasFeedback');
      try {
        const res = await api.previewPromissoria({ cliente_id, cliente_nome });
        await navigator.clipboard.writeText(res.mensagem);
        showToast('Mensagem copiada!', 'success');
      } catch {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = 'Erro ao copiar.'; }
      }
    };

    const enviarWpp = async (btn) => {
      const { cliente_id, cliente_nome } = getCliData(btn);
      const fb = document.getElementById('alertasPromissoriasFeedback');
      try {
        const res = await api.previewPromissoria({ cliente_id, cliente_nome });
        if (res.link) {
          window.open(res.link, '_blank', 'noopener');
        } else {
          if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = 'Cliente sem telefone cadastrado.'; }
        }
      } catch (err) {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = buildFriendlyError(err); }
      }
    };

    c.addEventListener('click', (e) => {
      const preview = e.target.closest('.al-preview-btn');
      const copiar  = e.target.closest('.al-copiar-btn');
      const enviar  = e.target.closest('.al-enviar-btn');
      if (preview) abrirPreview(preview);
      if (copiar)  copiarMsg(copiar);
      if (enviar)  enviarWpp(enviar);
    });
  },

  abrirModalPreview(mensagem, link) {
    const modal = document.getElementById('alertasPreviewModal');
    const texto = document.getElementById('alertasPreviewTexto');
    const linkEl = document.getElementById('alertasPreviewLink');
    const copiarBtn = document.getElementById('alertasPreviewCopiar');
    const fecharBtn = document.getElementById('alertasPreviewFechar');
    const fb = document.getElementById('alertasPreviewFeedback');

    if (!modal) return;
    if (texto)  texto.textContent = mensagem || '';
    if (linkEl) { linkEl.href = link || '#'; linkEl.style.opacity = link ? '1' : '0.5'; linkEl.style.pointerEvents = link ? '' : 'none'; }
    if (fb)     { fb.className = 'module-feedback'; fb.textContent = ''; }
    modal.style.display = 'flex';
    setTimeout(() => copiarBtn?.focus(), 50);

    if (this._escPreview) document.removeEventListener('keydown', this._escPreview);
    this._escPreview = (e) => { if (e.key === 'Escape') { modal.style.display = 'none'; document.removeEventListener('keydown', this._escPreview); this._escPreview = null; } };
    document.addEventListener('keydown', this._escPreview);

    copiarBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(mensagem || '');
        showToast('Mensagem copiada!', 'success');
        if (fb) { fb.className = 'module-feedback module-feedback--success'; fb.textContent = 'Copiado!'; }
      } catch {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = 'Erro ao copiar.'; }
      }
    }, { once: true });

    const fecharPreview = () => {
      modal.style.display = 'none';
      if (this._escPreview) { document.removeEventListener('keydown', this._escPreview); this._escPreview = null; }
    };
    fecharBtn?.addEventListener('click', fecharPreview, { once: true });
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharPreview(); }, { once: true });
  },

  // ── HELPERS ───────────────────────────────────────────────────────────────

  setFeedback(msg, type = 'info') {
    const el = document.getElementById('alertasFeedback');
    if (!el) return;
    if (!msg) { el.className = 'module-feedback'; el.textContent = ''; return; }
    el.className = `module-feedback module-feedback--${type}`;
    el.textContent = msg;
  },

  fmtCur(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  safeUrl(url) {
    return /^https?:\/\//i.test(url) ? url : '#';
  },

};

export async function initAlertasModule() {
  AlertasModule.init();
  // init() já chama load() internamente; não chamar novamente para evitar double-fetch
}

export default AlertasModule;
