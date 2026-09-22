import api from './api.js';
import { showToast, confirmarAcao } from './feedback.js';

const CaixaModule = {
  state: {
    aba: 'caixa',
    sessao: null,
    movimentos: [],
    saldo_calculado: 0,
    vendas_dinheiro_pix: { total: 0, quantidade: 0 },
    historico: [],
    carregando: false
  },

  init() {
    this._injectStyles();
    this.render();
    this.bindShellEvents();
    return this.load();
  },

  async load() {
    this.state.carregando = true;
    this.setFeedback('Carregando...', 'info');
    try {
      const [ativaRes, histRes] = await Promise.allSettled([
        api.getCaixaSessaoAtiva(),
        api.getCaixaHistorico()
      ]);

      if (ativaRes.status === 'fulfilled') {
        const d = ativaRes.value;
        this.state.sessao              = d?.sessao || null;
        this.state.movimentos          = d?.movimentos || [];
        this.state.saldo_calculado     = d?.saldo_calculado ?? 0;
        this.state.vendas_dinheiro_pix = d?.vendas_dinheiro_pix || { total: 0, quantidade: 0 };
      }
      if (histRes.status === 'fulfilled') {
        this.state.historico = histRes.value?.sessoes || [];
      }

      this.renderConteudo();
      this.setFeedback('', '');
    } catch (err) {
      console.error('[caixa] load:', err);
      this.setFeedback('Erro ao carregar caixa.', 'error');
    } finally {
      this.state.carregando = false;
    }
  },

  render() {
    const c = document.getElementById('caixaContainer');
    if (!c) return;
    c.innerHTML = `
      <section class="module-card">
        <div class="module-feedback" id="caixaFeedback"></div>
        <div class="module-toolbar">
          <div class="table-actions">
            <button class="btn-inline btn-inline--active" data-caixa-aba="caixa">Caixa</button>
            <button class="btn-inline" data-caixa-aba="historico">Histórico</button>
          </div>
          <button class="btn btn-light" id="caixaAtualizarBtn">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>
        <div id="caixaConteudo"></div>
      </section>
    `;
  },

  bindShellEvents() {
    const c = document.getElementById('caixaContainer');
    if (!c) return;

    document.getElementById('caixaAtualizarBtn')?.addEventListener('click', () => this.load());

    c.addEventListener('click', (e) => {
      const abaBtn = e.target.closest('[data-caixa-aba]');
      if (abaBtn) {
        this.state.aba = abaBtn.dataset.caixaAba;
        document.querySelectorAll('[data-caixa-aba]').forEach((b) => b.classList.remove('btn-inline--active'));
        abaBtn.classList.add('btn-inline--active');
        this.renderConteudo();
      }
    });
  },

  renderConteudo() {
    const c = document.getElementById('caixaConteudo');
    if (!c) return;
    if (this.state.aba === 'historico') { c.innerHTML = this.renderHistorico(); return; }
    c.innerHTML = this.renderCaixa();
    this.bindCaixaEvents();
  },

  // ── CAIXA ATUAL ─────────────────────────────────────────────────────────

  renderCaixa() {
    if (!this.state.sessao) return this.renderAbertura();
    return this.renderSessaoAberta();
  },

  renderAbertura() {
    return `
      <div class="panel-card" style="max-width:480px;margin-top:20px">
        <div class="panel-card__header">
          <div>
            <h3><i class="fa-solid fa-cash-register" style="color:var(--success)"></i> Abrir Caixa</h3>
            <p>Informe o saldo inicial (fundo de caixa)</p>
          </div>
        </div>
        <div class="panel-card__body">
          <div class="module-feedback module-feedback--info" style="margin-bottom:14px">
            Nenhum caixa aberto. Informe o saldo inicial para começar a operar.
          </div>
          <div class="form-field" style="margin-bottom:12px">
            <label>Saldo inicial (R$)</label>
            <input type="number" id="caixaSaldoInicial" min="0" step="0.01" value="0" placeholder="0,00" />
          </div>
          <div class="form-field" style="margin-bottom:14px">
            <label>Observação (opcional)</label>
            <input type="text" id="caixaObsAbertura" placeholder="Ex: Caixa de segunda-feira" />
          </div>
          <button class="btn btn-primary" id="caixaAbrirBtn">
            <i class="fa-solid fa-lock-open"></i> Abrir Caixa
          </button>
          <div class="module-feedback" id="caixaAbrirFeedback" style="margin-top:12px"></div>
        </div>
      </div>
    `;
  },

  renderSessaoAberta() {
    const s = this.state.sessao;
    const mov = this.state.movimentos;
    const saldo = this.state.saldo_calculado;
    const vendas = this.state.vendas_dinheiro_pix;
    const abertaEm = new Date(s.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });

    const sangrias    = mov.filter((m) => m.tipo === 'sangria').reduce((a, m) => a + m.valor, 0);
    const suprimentos = mov.filter((m) => m.tipo === 'suprimento').reduce((a, m) => a + m.valor, 0);

    const movLinhas = mov.filter((m) => m.tipo !== 'abertura' && m.tipo !== 'fechamento').map((m) => `
      <div class="caixa-mov-row">
        <div class="caixa-mov-info">
          <span class="badge ${m.tipo === 'sangria' ? 'badge--danger' : 'badge--success'}">${this._tipoLabel(m.tipo)}</span>
          <span class="caixa-mov-desc">${this.esc(m.descricao || '')}</span>
          ${m.criado_em ? `<span class="caixa-mov-time">${this.fmtHora(m.criado_em)}</span>` : ''}
        </div>
        <strong style="color:${m.valor < 0 ? 'var(--danger)' : 'var(--success)'}">${this.fmtCur(m.valor)}</strong>
      </div>
    `).join('');

    return `
      <div class="kpi-grid" style="margin-top:16px;margin-bottom:20px">
        <div class="kpi-card">
          <div class="kpi-card__icon" style="color:var(--success)"><i class="fa-solid fa-wallet"></i></div>
          <div class="kpi-card__content">
            <span>Saldo em caixa</span>
            <strong style="color:var(--success)">${this.fmtCur(saldo)}</strong>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon"><i class="fa-solid fa-cash-register"></i></div>
          <div class="kpi-card__content">
            <span>Saldo de abertura</span>
            <strong>${this.fmtCur(s.saldo_abertura)}</strong>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon" style="color:var(--danger)"><i class="fa-solid fa-arrow-down"></i></div>
          <div class="kpi-card__content">
            <span>Sangrias</span>
            <strong style="color:var(--danger)">${this.fmtCur(Math.abs(sangrias))}</strong>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon" style="color:var(--primary)"><i class="fa-solid fa-arrow-up"></i></div>
          <div class="kpi-card__content">
            <span>Suprimentos</span>
            <strong style="color:var(--primary)">${this.fmtCur(suprimentos)}</strong>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon" style="color:var(--success)"><i class="fa-solid fa-cart-shopping"></i></div>
          <div class="kpi-card__content">
            <span>Vendas dinheiro/Pix</span>
            <strong>${this.fmtCur(vendas.total)}</strong>
            <small>${vendas.quantidade} venda(s)</small>
          </div>
        </div>
      </div>

      <div class="dashboard-grid" style="margin-bottom:20px">
        <div class="panel-card panel-card--large">
          <div class="panel-card__header">
            <div><h3>Movimentações</h3><p>Aberto em ${abertaEm} por ${this.esc(s.usuario_nome || 'operador')}</p></div>
          </div>
          <div class="panel-card__body">
            ${movLinhas || '<p style="color:var(--text-muted);font-size:13px">Nenhuma movimentação além da abertura.</p>'}
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card__header"><div><h3>Ações</h3><p>Movimentações e fechamento</p></div></div>
          <div class="panel-card__body" style="display:grid;gap:12px">
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Sangria</label>
              <div style="display:flex;gap:8px">
                <input type="number" id="caixaSangriaValor" min="0.01" step="0.01" placeholder="R$ 0,00" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px" />
                <button class="btn btn-light" id="caixaSangriaBtn" style="white-space:nowrap">
                  <i class="fa-solid fa-arrow-down" style="color:var(--danger)"></i> Registrar
                </button>
              </div>
              <input type="text" id="caixaSangriaDesc" placeholder="Descrição (opcional)" maxlength="100"
                style="width:100%;margin-top:6px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;box-sizing:border-box" />
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Suprimento</label>
              <div style="display:flex;gap:8px">
                <input type="number" id="caixaSuprimentoValor" min="0.01" step="0.01" placeholder="R$ 0,00" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px" />
                <button class="btn btn-light" id="caixaSuprimentoBtn" style="white-space:nowrap">
                  <i class="fa-solid fa-arrow-up" style="color:var(--success)"></i> Registrar
                </button>
              </div>
              <input type="text" id="caixaSuprimentoDesc" placeholder="Descrição (opcional)" maxlength="100"
                style="width:100%;margin-top:6px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;box-sizing:border-box" />
            </div>
            <hr style="border:none;border-top:1px solid var(--border)" />
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase">Saldo contado (fechamento)</label>
              <input type="number" id="caixaSaldoFechamento" min="0" step="0.01" placeholder="Conte o dinheiro em caixa..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:8px" />
              <button class="btn btn-danger" id="caixaFecharBtn" style="width:100%">
                <i class="fa-solid fa-lock"></i> Fechar Caixa
              </button>
            </div>
            <div class="module-feedback" id="caixaAcoesFeedback"></div>
          </div>
        </div>
      </div>
    `;
  },

  bindCaixaEvents() {
    document.getElementById('caixaSaldoInicial')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('caixaAbrirBtn')?.click();
    });

    // Abrir caixa
    document.getElementById('caixaAbrirBtn')?.addEventListener('click', async () => {
      const saldo = Number(document.getElementById('caixaSaldoInicial')?.value || 0);
      const obs   = document.getElementById('caixaObsAbertura')?.value?.trim() || '';
      const btn   = document.getElementById('caixaAbrirBtn');
      const fb    = document.getElementById('caixaAbrirFeedback');

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Abrindo...'; }
      try {
        await api.abrirCaixa({ saldo_inicial: saldo, observacao: obs });
        showToast('Caixa aberto!', 'success');
        await this.load();
      } catch (err) {
        if (fb) { fb.className = 'module-feedback module-feedback--error'; fb.textContent = err.message || 'Erro ao abrir caixa.'; }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Abrir Caixa'; }
      }
    });

    // Sangria
    document.getElementById('caixaSangriaBtn')?.addEventListener('click', async () => {
      const valor = Number(document.getElementById('caixaSangriaValor')?.value || 0);
      if (!valor || valor <= 0) { showToast('Informe um valor para a sangria.', 'error'); return; }
      const descricao = document.getElementById('caixaSangriaDesc')?.value?.trim() || 'Sangria de caixa';
      const btn = document.getElementById('caixaSangriaBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
      try {
        await api.sangriaCaixa({ valor, descricao });
        showToast('Sangria registrada.', 'success');
        document.getElementById('caixaSangriaValor').value = '';
        const descEl = document.getElementById('caixaSangriaDesc');
        if (descEl) descEl.value = '';
        await this.load();
      } catch (err) {
        showToast(err.message || 'Erro ao registrar sangria.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrow-down" style="color:var(--danger)"></i> Registrar'; }
      }
    });

    // Suprimento
    document.getElementById('caixaSuprimentoBtn')?.addEventListener('click', async () => {
      const valor = Number(document.getElementById('caixaSuprimentoValor')?.value || 0);
      if (!valor || valor <= 0) { showToast('Informe um valor para o suprimento.', 'error'); return; }
      const descricao = document.getElementById('caixaSuprimentoDesc')?.value?.trim() || 'Suprimento de caixa';
      const btn = document.getElementById('caixaSuprimentoBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
      try {
        await api.suprimentoCaixa({ valor, descricao });
        showToast('Suprimento registrado.', 'success');
        document.getElementById('caixaSuprimentoValor').value = '';
        const descEl = document.getElementById('caixaSuprimentoDesc');
        if (descEl) descEl.value = '';
        await this.load();
      } catch (err) {
        showToast(err.message || 'Erro ao registrar suprimento.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrow-up" style="color:var(--success)"></i> Registrar'; }
      }
    });

    // Fechar caixa
    document.getElementById('caixaFecharBtn')?.addEventListener('click', async () => {
      const saldoFechInput = document.getElementById('caixaSaldoFechamento');
      if (!saldoFechInput?.value?.trim()) { showToast('Informe o saldo contado para fechar.', 'error'); return; }
      const saldoContado = Number(saldoFechInput.value);
      if (isNaN(saldoContado)) { showToast('Informe o saldo contado para fechar.', 'error'); return; }
      if (!await confirmarAcao(`Fechar o caixa com saldo contado de ${this.fmtCur(saldoContado)}?`, 'Fechar caixa', 'warning')) return;

      const btn = document.getElementById('caixaFecharBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fechando...'; }

      try {
        const result = await api.fecharCaixa({ saldo_contado: saldoContado });
        const dif = result?.diferenca ?? 0;
        const msg = dif === 0
          ? 'Caixa fechado. Sem diferença!'
          : `Caixa fechado. Diferença: ${this.fmtCur(dif)}`;
        showToast(msg, dif === 0 ? 'success' : 'warning');
        await this.load();
      } catch (err) {
        showToast(err.message || 'Erro ao fechar caixa.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-lock"></i> Fechar Caixa'; }
      }
    });
  },

  // ── HISTÓRICO ──────────────────────────────────────────────────────────

  renderHistorico() {
    const sessoes = this.state.historico.filter((s) => s.status === 'fechado');

    const totalDif     = sessoes.reduce((a, s) => a + Number(s.diferenca || 0), 0);
    const totalAbert   = sessoes.reduce((a, s) => a + Number(s.saldo_abertura || 0), 0);
    const mediaAbert   = sessoes.length ? this.fmtCur(totalAbert / sessoes.length) : '—';
    const difColor     = totalDif < 0 ? 'var(--danger)' : totalDif > 0 ? 'var(--success)' : '';

    const statsHtml = `
      <div class="module-toolbar" style="margin-top:8px;margin-bottom:12px">
        <div class="module-toolbar__stats">
          <div class="mini-stat"><span>Sessões</span><strong>${sessoes.length}</strong></div>
          <div class="mini-stat"><span>Diferença acumulada</span><strong style="color:${difColor}">${this.fmtCur(totalDif)}</strong></div>
          <div class="mini-stat"><span>Média de abertura</span><strong>${mediaAbert}</strong></div>
        </div>
      </div>`;

    if (!sessoes.length) {
      return statsHtml + `
        <div class="empty-table-state">
          <i class="fa-solid fa-cash-register" style="font-size:2rem;opacity:.22;margin-bottom:4px"></i>
          <strong>Nenhum caixa fechado encontrado</strong>
          <span>O histórico aparecerá aqui após o primeiro fechamento.</span>
        </div>`;
    }

    const linhas = sessoes.map((s) => {
      const dif     = Number(s.diferenca || 0);
      const difStyle = dif > 0 ? 'color:var(--success)' : dif < 0 ? 'color:var(--danger)' : '';
      return `
        <tr>
          <td>${new Date(s.aberto_em).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}</td>
          <td>${this.esc(s.usuario_nome || '-')}</td>
          <td>${this.fmtCur(s.saldo_abertura)}</td>
          <td>${this.fmtCur(s.saldo_calculado)}</td>
          <td>${this.fmtCur(s.saldo_fechamento)}</td>
          <td><strong style="${difStyle}">${this.fmtCur(dif)}</strong></td>
          <td>${s.fechado_em ? new Date(s.fechado_em).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : '—'}</td>
        </tr>
      `;
    }).join('');

    return statsHtml + `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Operador</th>
              <th>Abertura</th>
              <th>Calculado</th>
              <th>Contado</th>
              <th>Diferença</th>
              <th>Fechado em</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    `;
  },

  // ── HELPERS ─────────────────────────────────────────────────────────────

  setFeedback(msg, type = 'info') {
    const el = document.getElementById('caixaFeedback');
    if (!el) return;
    if (!msg) { el.className = 'module-feedback'; el.textContent = ''; return; }
    el.className = `module-feedback module-feedback--${type}`;
    el.textContent = msg;
  },

  fmtCur(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  fmtHora(val) {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Fortaleza',
      hour: '2-digit', minute: '2-digit'
    }).format(d);
  },

  _tipoLabel(tipo) {
    const mapa = { sangria: 'Sangria', suprimento: 'Suprimento', venda: 'Venda', pagamento: 'Pagamento' };
    const t = String(tipo || '').toLowerCase();
    return mapa[t] || (t.charAt(0).toUpperCase() + t.slice(1));
  },

  _injectStyles() {
    if (document.getElementById('_caixaStyles')) return;
    const style = document.createElement('style');
    style.id = '_caixaStyles';
    style.textContent = `
      .caixa-mov-row { display:flex; justify-content:space-between; align-items:center;
        padding:8px 0; border-bottom:1px solid var(--border); gap:8px; }
      .caixa-mov-info { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
      .caixa-mov-desc { font-size:13px; color:var(--text-primary); }
      .caixa-mov-time { font-size:11px; color:var(--text-muted); white-space:nowrap; }
    `;
    document.head.appendChild(style);
  },

  esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
};

export async function initCaixaModule() {
  await CaixaModule.init();
}

export default CaixaModule;
