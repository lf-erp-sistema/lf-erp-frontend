import api from './api.js';
import { getAuth } from './auth.js';
import { showToast } from './feedback.js';

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ConfigModule = {
  state: {
    empresa: null,
    dados: null,
    eventsBound: false
  },

  async init() {
    const auth = getAuth();
    this.state.empresa = auth?.empresa?.nome || auth?.user?.empresa || 'LF ERP';
    this.state.user = auth?.user || {};
    this.state.isAdmin = ['admin', 'administrador'].includes((auth?.user?.perfil || '').toLowerCase());

    this.state.eventsBound = false;
    this.render();
    this.load();

    if (this.state.isAdmin) {
      const { initUsuariosModule } = await import('./usuarios.js');
      await initUsuariosModule(true);
    }
  },

  async salvarPerfil() {
    const nome = document.getElementById('cfgNomeCompleto')?.value?.trim();
    const cpf = document.getElementById('cfgCpf')?.value?.trim();
    const nascimento = document.getElementById('cfgNascimento')?.value?.trim();
    const btn = document.getElementById('cfgSalvarPerfilBtn');

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
      await api.updateMePerfil({ nome_completo: nome || null, cpf: cpf || null, nascimento: nascimento || null });
      showToast('Perfil atualizado com sucesso!', 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao atualizar perfil', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar perfil'; }
    }
  },

  async load() {
    if (this.state.loadingConfig) return;
    this.state.loadingConfig = true;
    try {
      const [data, meData] = await Promise.all([
        api.fetchAPI(`/configuracoes/${encodeURIComponent(this.state.empresa)}`),
        api.validateSession().catch(() => null)
      ]);

      if (meData) {
        this.state.user = { ...this.state.user, ...meData };
        const nomeCampo = document.getElementById('cfgNomeCompleto');
        const cpfCampo = document.getElementById('cfgCpf');
        const nascCampo = document.getElementById('cfgNascimento');
        if (nomeCampo) nomeCampo.value = meData.nome_completo || '';
        if (cpfCampo) cpfCampo.value = meData.cpf || '';
        if (nascCampo) nascCampo.value = meData.nascimento || '';
      }

      this.state.dados = data;

      const campoNome = document.getElementById('cfgNomeEmpresa');
      if (campoNome) campoNome.value = data.nome_empresa || '';

      this._aplicarLogoPreview(data.logo_url || null);
      this._aplicarLogoSidebar(data.logo_url || null);

      if (data.cor_primaria) {
        const chave = `lf_cor_${data.empresa_id || data.empresa || this.state.empresa || ''}`;
        try { localStorage.setItem(chave, data.cor_primaria); } catch(_) {}
        if (typeof window.aplicarCorPrimaria === 'function') window.aplicarCorPrimaria(data.cor_primaria);
      }
      const colorInput = document.getElementById('cfgCorPrimaria');
      if (colorInput) colorInput.value = data.cor_primaria || '#2563eb';

      // Carregar config PIX
      try {
        const pixCfg = await api.getPixConfig();
        if (document.getElementById('cfgPixClientId')) {
          // Não preenchemos campos de credenciais com valores reais — apenas sinalizamos que está configurado
          if (pixCfg.pix_client_id) {
            document.getElementById('cfgPixClientId').placeholder = '*** (configurado — preencha para alterar)';
          }
          document.getElementById('cfgPixChave').value      = pixCfg.pix_chave       || '';
          document.getElementById('cfgPixSandbox').checked  = pixCfg.pix_sandbox !== false;
          if (pixCfg.pix_certificado === 'configurado')
            document.getElementById('cfgPixCertificado').placeholder = '✓ Certificado configurado (deixe vazio para manter)';
        }
      } catch (_) { /* silencioso — PIX é opcional */ }

      await this.carregarAsaas();
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
    } finally {
      this.state.loadingConfig = false;
    }
  },

  async exportarDados() {
    const btn = document.getElementById('exportarDadosBtn');
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...'; }

      const token = api.getAuthToken();
      const baseUrl = api.getApiBaseUrl();
      const url = `${baseUrl}/empresa/exportar-dados`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || `Erro ${res.status}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="(.+?)"/);
      const filename = match ? match[1] : `lferp-dados-${new Date().toISOString().slice(0,10)}.json`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      showToast('Dados exportados com sucesso!', 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao exportar dados', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download"></i> Baixar meus dados'; }
    }
  },

  async carregarAsaas() {
    try {
      const data = await api.request('/pagamentos/boleto/config', { method: 'GET' });
      const keyEl  = document.getElementById('cfgAsaasApiKey');
      const sbEl   = document.getElementById('cfgAsaasSandbox');
      if (keyEl && data.asaas_api_key) keyEl.placeholder = '****  (configurada — deixe vazio para manter)';
      if (sbEl) sbEl.checked = data.asaas_sandbox !== false;
    } catch { /* silencioso — Asaas opcional */ }
  },

  async salvarAsaas() {
    const btn = document.getElementById('cfgSalvarAsaasBtn');
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
      await api.request('/pagamentos/boleto/config', {
        method: 'PUT',
        body: {
          empresa:        this.state.empresa,
          empresa_id:     this.state.dados?.empresa_id || null,
          asaas_api_key:  document.getElementById('cfgAsaasApiKey')?.value?.trim()  || null,
          asaas_sandbox:  document.getElementById('cfgAsaasSandbox')?.checked ?? true
        }
      });
      showToast('Configuração Asaas salva!', 'success');
      if (document.getElementById('cfgAsaasApiKey')) document.getElementById('cfgAsaasApiKey').value = '';
    } catch (err) {
      showToast(err.message || 'Erro ao salvar configuração Asaas', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar configuração Asaas'; }
    }
  },

  async salvarPix() {
    const btn = document.getElementById('cfgSalvarPixBtn');
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
      const clientId     = document.getElementById('cfgPixClientId')?.value?.trim()    || '';
      const clientSecret = document.getElementById('cfgPixClientSecret')?.value?.trim() || '';
      const certificado  = document.getElementById('cfgPixCertificado')?.value?.trim()  || '';
      const chave        = document.getElementById('cfgPixChave')?.value?.trim()         || '';
      const pixConfig = { pix_chave: chave, pix_sandbox: document.getElementById('cfgPixSandbox')?.checked ?? true };
      if (clientId)     pixConfig.pix_client_id     = clientId;
      if (clientSecret) pixConfig.pix_client_secret = clientSecret;
      if (certificado)  pixConfig.pix_certificado   = certificado;
      await api.savePixConfig(pixConfig);
      showToast('Configuração PIX salva com sucesso!', 'success');
      document.getElementById('cfgPixClientSecret').value = '';
      const certEl = document.getElementById('cfgPixCertificado');
      if (certEl) { certEl.value = ''; certEl.placeholder = '✓ Certificado configurado (deixe vazio para manter)'; }
    } catch (err) {
      showToast(err.message || 'Erro ao salvar configuração PIX', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar configuração PIX'; }
    }
  },

  async save() {
    const btn = document.getElementById('salvarConfigBtn');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const nome = document.getElementById('cfgNomeEmpresa')?.value?.trim() || '';
      const cor = document.getElementById('cfgCorPrimaria')?.value || null;

      await api.fetchAPI(`/configuracoes`, 'PUT', {
        empresa: this.state.empresa,
        empresa_id: this.state.dados?.empresa_id || null,
        nome_empresa: nome,
        cor_primaria: cor
      });

      if (this.state.dados) { this.state.dados.nome_empresa = nome; this.state.dados.cor_primaria = cor; }
      const chave = `lf_cor_${this.state.dados?.empresa_id || this.state.dados?.empresa || this.state.empresa || ''}`;
      try { cor ? localStorage.setItem(chave, cor) : localStorage.removeItem(chave); } catch(_) {}
      if (typeof window.aplicarCorPrimaria === 'function') window.aplicarCorPrimaria(cor);

      showToast('Configurações salvas com sucesso', 'success');
    } catch (err) {
      showToast('Erro ao salvar configurações', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar empresa'; }
    }
  },

  _aplicarLogoSidebar(url) {
    const empresaKey = this.state.dados?.empresa_id || this.state.dados?.empresa || this.state.empresa || '';
    try {
      if (url) localStorage.setItem(`lf_logo_${empresaKey}`, url);
      else localStorage.removeItem(`lf_logo_${empresaKey}`);
    } catch (_) {}
    if (typeof window.aplicarLogoSidebar === 'function') window.aplicarLogoSidebar(url);
  },

  _aplicarLogoPreview(url) {
    const preview = document.getElementById('cfgLogoPreview');
    if (!preview) return;
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Logo da empresa';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:12px';
      preview.replaceChildren(img);
    } else {
      preview.innerHTML = '<i class="fa-solid fa-layer-group" style="font-size:28px;color:var(--text-muted)"></i>';
    }
  },

  async salvarCor(cor) {
    try {
      await api.fetchAPI('/configuracoes', 'PUT', { empresa: this.state.empresa, empresa_id: this.state.dados?.empresa_id || null, cor_primaria: cor || null });
      if (this.state.dados) this.state.dados.cor_primaria = cor || null;
      const chave = `lf_cor_${this.state.dados?.empresa_id || this.state.dados?.empresa || this.state.empresa || ''}`;
      try { cor ? localStorage.setItem(chave, cor) : localStorage.removeItem(chave); } catch(_) {}
      if (typeof window.aplicarCorPrimaria === 'function') window.aplicarCorPrimaria(cor || null);
      showToast(cor ? 'Cor salva!' : 'Cor restaurada para o padrão.', 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao salvar cor', 'error');
    }
  },

  async salvarLogo(logoUrl) {
    try {
      await api.fetchAPI('/configuracoes', 'PUT', {
        empresa:    this.state.empresa,
        empresa_id: this.state.dados?.empresa_id || null,
        logo_url:   logoUrl
      });
      if (this.state.dados) this.state.dados.logo_url = logoUrl;
      this._aplicarLogoPreview(logoUrl);
      this._aplicarLogoSidebar(logoUrl);
      showToast(logoUrl ? 'Logo salvo com sucesso!' : 'Logo removido.', 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao salvar logo', 'error');
    }
  },

  _processarImagemLogo(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Nenhum arquivo'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('Imagem muito grande (máx. 5 MB)'));

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 200;
          const scale = Math.min(MAX / img.width, MAX / img.height, 1);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Imagem inválida'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsDataURL(file);
    });
  },

  async trocarSenha() {
    const atual = document.getElementById('cfgSenhaAtual')?.value;
    const nova = document.getElementById('cfgSenhaNova')?.value;
    const confirmar = document.getElementById('cfgSenhaConfirmar')?.value;
    const btn = document.getElementById('cfgTrocarSenhaBtn');

    if (!atual || !nova || !confirmar) {
      return showToast('Preencha todos os campos de senha', 'error');
    }

    if (nova !== confirmar) {
      return showToast('A nova senha e a confirmação não conferem', 'error');
    }

    if (nova.length < 8) {
      return showToast('A nova senha deve ter pelo menos 8 caracteres', 'error');
    }

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
      await api.fetchAPI('/me/senha', 'PUT', { senha_atual: atual, nova_senha: nova, confirmar_senha: confirmar });
      showToast('Senha alterada com sucesso!', 'success');
      document.getElementById('cfgSenhaAtual').value = '';
      document.getElementById('cfgSenhaNova').value = '';
      document.getElementById('cfgSenhaConfirmar').value = '';
    } catch (err) {
      showToast(err.message || 'Erro ao alterar senha', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Alterar senha'; }
    }
  },

  async carregarHistorico() {
    const container = document.getElementById('cfgHistoricoAcesso');
    if (!container) return;
    try {
      const dados = await api.fetchAPI('/me/historico-acesso');
      if (!dados.length) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Nenhum registro encontrado.</p>';
        return;
      }
      const acaoBadge = (a) => {
        const map = {
          login:       '<span class="badge badge--success">login</span>',
          logout:      '<span class="badge badge--neutral">logout</span>',
          login_falha: '<span class="badge badge--danger">falha</span>',
          troca_senha: '<span class="badge badge--warning">senha</span>'
        };
        return map[a] || `<span class="badge">${esc(a)}</span>`;
      };
      container.innerHTML = `
        <table class="historico-table">
          <thead>
            <tr>
              <th>Data/hora</th>
              <th>Ação</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            ${dados.map(l => `
              <tr>
                <td>${new Date(l.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' })}</td>
                <td>${acaoBadge(l.acao)}</td>
                <td class="text-muted">${esc(l.ip || '—')}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      container.innerHTML = '<p style="color:var(--danger);font-size:13px">Erro ao carregar histórico.</p>';
    }
  },

  render() {
    const c = document.getElementById('configuracoesContainer');
    if (!c) return;

    const logoAtual = this.state.dados?.logo_url || '';

    const corAtual = this.state.dados?.cor_primaria || '#2563eb';

    c.innerHTML = `
      <!-- CARD 1: Identidade da Empresa -->
      <section class="module-card" style="margin-bottom:16px">
        <div class="module-card__header" style="margin-bottom:20px">
          <div>
            <h3>Identidade da Empresa</h3>
            <p>Logo, nome e cor principal exibidos em todo o sistema</p>
          </div>
        </div>

        <div style="display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;max-width:600px">
          <!-- Logo -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
            <div id="cfgLogoPreview" style="width:88px;height:88px;border-radius:14px;border:2px dashed var(--border);background:var(--surface-2);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer" title="Clique para trocar o logo">
              ${logoAtual
                ? `<img src="${esc(logoAtual)}" alt="Logo da empresa" style="width:100%;height:100%;object-fit:contain;border-radius:12px">`
                : '<i class="fa-solid fa-layer-group" style="font-size:28px;color:var(--text-muted)"></i>'}
            </div>
            <input type="file" id="cfgLogoInput" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" style="display:none">
            <div style="display:flex;gap:6px">
              <button type="button" class="btn btn-light" id="cfgLogoEscolherBtn" style="font-size:12px;padding:4px 10px;height:28px">
                <i class="fa-solid fa-image"></i> Escolher
              </button>
              ${logoAtual ? `<button type="button" class="btn btn-light" id="cfgLogoRemoverBtn" style="font-size:12px;padding:4px 10px;height:28px;color:var(--danger)">
                <i class="fa-solid fa-trash"></i>
              </button>` : ''}
            </div>
            <span style="font-size:11px;color:var(--text-muted);text-align:center;max-width:90px">PNG · JPG · SVG<br>Recomendado 200×200</span>
          </div>

          <!-- Nome e Cor -->
          <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:16px">
            <div class="form-field">
              <label>Nome da empresa</label>
              <input id="cfgNomeEmpresa" value="${esc(this.state.dados?.nome_empresa || '')}" />
            </div>

            <div class="form-field">
              <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                <i class="fa-solid fa-palette" style="color:var(--primary)"></i> Cor principal
              </label>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <input type="color" id="cfgCorPrimaria" value="${esc(corAtual)}"
                  style="width:40px;height:34px;border-radius:8px;border:1px solid var(--border);cursor:pointer;padding:2px;background:none">
                <div style="display:flex;gap:5px;flex-wrap:wrap">
                  ${['#2563eb','#7c3aed','#059669','#dc2626','#d97706','#0891b2','#db2777','#1e293b'].map(hex => {
                    const ativo = hex === corAtual;
                    return `<button type="button" class="cfg-cor-preset" data-cor="${hex}"
                      style="width:24px;height:24px;border-radius:6px;border:2px solid ${ativo ? '#fff' : 'transparent'};outline:${ativo ? '2px solid var(--text-muted)' : 'none'};outline-offset:1px;background:${hex};cursor:pointer;padding:0"
                      title="${hex}"></button>`;
                  }).join('')}
                </div>
                <button type="button" id="cfgCorPadraoBtn" class="btn btn-light" style="font-size:11px;padding:3px 8px;height:28px">
                  <i class="fa-solid fa-rotate-left"></i> Padrão
                </button>
              </div>
            </div>

            <div>
              <button id="salvarConfigBtn" class="btn btn-primary">
                <i class="fa-solid fa-floppy-disk"></i> Salvar empresa
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- CARD 2: Meu Perfil -->
      <section class="module-card" style="margin-bottom:16px">
        <div class="module-card__header" style="margin-bottom:16px">
          <div>
            <h3>Meu Perfil</h3>
            <p>Atualize suas informações pessoais</p>
          </div>
        </div>
        <div class="form-grid" style="max-width:600px">
          <div class="form-field">
            <label>Nome completo</label>
            <input id="cfgNomeCompleto" value="${esc(this.state.user?.nome_completo || '')}" placeholder="Seu nome" />
          </div>
          <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-field">
              <label>CPF</label>
              <input id="cfgCpf" value="${esc(this.state.user?.cpf || '')}" placeholder="000.000.000-00" />
            </div>
            <div class="form-field">
              <label>Nascimento</label>
              <input id="cfgNascimento" type="date" value="${esc(this.state.user?.nascimento || '')}" />
            </div>
          </div>
          <div>
            <button id="cfgSalvarPerfilBtn" class="btn btn-primary">Salvar perfil</button>
          </div>
        </div>
      </section>

      <!-- CARD 3: Segurança -->
      <section class="module-card" style="margin-bottom:16px">
        <div class="module-card__header" style="margin-bottom:16px">
          <div>
            <h3>Segurança — Alterar senha</h3>
            <p>Informe sua senha atual para definir uma nova</p>
          </div>
        </div>
        <div class="form-grid" style="max-width:600px">
          <div class="form-field">
            <label>Senha atual</label>
            <input id="cfgSenhaAtual" type="password" placeholder="••••••••" />
          </div>
          <div class="form-field">
            <label>Nova senha</label>
            <input id="cfgSenhaNova" type="password" placeholder="Mínimo 8 caracteres" />
          </div>
          <div class="form-field">
            <label>Confirmar nova senha</label>
            <input id="cfgSenhaConfirmar" type="password" placeholder="Repita a nova senha" />
          </div>
          <div>
            <button id="cfgTrocarSenhaBtn" class="btn btn-primary">Alterar senha</button>
          </div>
        </div>
      </section>

      <!-- CARD 4: Histórico de acesso -->
      <section class="module-card" style="margin-bottom:16px">
        <div class="module-card__header" style="margin-bottom:12px">
          <div>
            <h3>Histórico de acesso</h3>
            <p>Últimos 20 acessos da sua conta</p>
          </div>
          <button id="cfgCarregarHistoricoBtn" class="btn btn-secondary btn-sm">
            <i class="fa fa-refresh"></i> Carregar
          </button>
        </div>
        <div id="cfgHistoricoAcesso" style="min-height:48px"></div>
      </section>

      <!-- CARD 5: PIX -->
      <section class="module-card" style="margin-bottom:16px">
        <div class="module-card__header" style="margin-bottom:16px">
          <div>
            <h3><i class="fa-brands fa-pix" style="color:#32bcad;margin-right:6px"></i>PIX — Configuração EFÍ</h3>
            <p>Configure as credenciais da EFÍ (Gerencianet) para gerar cobranças PIX automaticamente</p>
          </div>
        </div>
        <details style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <summary style="padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-muted);display:flex;align-items:center;gap:6px;user-select:none">
            <i class="fa-solid fa-circle-info"></i> Como obter as credenciais
          </summary>
          <div style="padding:12px 16px;border-top:1px solid var(--border)">
            <ol style="margin:0;padding-left:18px;font-size:.85rem;color:var(--text-soft)">
              <li>Acesse <strong>efipay.com.br</strong> e abra uma conta gratuita</li>
              <li>Vá em <strong>API → Criar aplicação</strong> → copie Client ID e Client Secret</li>
              <li>Baixe o certificado <strong>.p12</strong> e carregue abaixo (como Base64)</li>
              <li>Registre sua <strong>chave PIX</strong> (CPF, CNPJ, e-mail ou aleatória)</li>
              <li>Desative o sandbox quando tudo estiver pronto</li>
            </ol>
          </div>
        </details>
        <div class="form-grid" style="max-width:600px" id="cfgPixForm">
          <div class="form-field">
            <label>Client ID</label>
            <input id="cfgPixClientId" class="input" placeholder="Client_Id_..." />
          </div>
          <div class="form-field">
            <label>Client Secret</label>
            <input id="cfgPixClientSecret" class="input" type="password" placeholder="Client_Secret_..." />
          </div>
          <div class="form-field form-field--span-2">
            <label>Chave PIX</label>
            <input id="cfgPixChave" class="input" placeholder="CPF, CNPJ, e-mail ou chave aleatória" />
          </div>
          <div class="form-field form-field--span-2">
            <label>Certificado (.p12 em Base64) <span style="color:var(--text-muted);font-weight:400">— opcional para sandbox</span></label>
            <textarea id="cfgPixCertificado" class="input" rows="3"
              placeholder="Cole aqui o conteúdo Base64 do certificado .p12 baixado da EFÍ..."></textarea>
            <small style="color:var(--text-muted);font-size:.78rem">
              Para converter: <code>base64 -i certificado.p12</code> (Linux/Mac) ou use uma ferramenta online segura.
            </small>
          </div>
          <div class="form-field">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" id="cfgPixSandbox" style="width:16px;height:16px" checked />
              <span>Modo Sandbox (testes) — desative para produção real</span>
            </label>
          </div>
          <div class="form-field">
            <button id="cfgSalvarPixBtn" class="btn btn-primary">
              <i class="fa-solid fa-floppy-disk"></i> Salvar configuração PIX
            </button>
          </div>
        </div>
      </section>

      <!-- CARD 6: Asaas -->
      <section class="module-card" style="margin-bottom:16px">
        <div class="module-card__header" style="margin-bottom:16px">
          <div>
            <h3><i class="fa-solid fa-barcode" style="color:var(--primary);margin-right:6px"></i>Boleto Bancário — Asaas</h3>
            <p>Emita boletos diretamente do sistema via integração com a Asaas</p>
          </div>
        </div>
        <details style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <summary style="padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-muted);display:flex;align-items:center;gap:6px;user-select:none">
            <i class="fa-solid fa-circle-info"></i> Como configurar
          </summary>
          <div style="padding:12px 16px;border-top:1px solid var(--border)">
            <ol style="margin:0;padding-left:18px;font-size:.85rem;color:var(--text-soft)">
              <li>Acesse <strong>asaas.com</strong> e crie uma conta (gratuita)</li>
              <li>Vá em <strong>Configurações → Integrações → API Key</strong> e copie a chave</li>
              <li>Cole a chave abaixo e salve em modo Sandbox para testar</li>
              <li>Desative o Sandbox quando estiver pronto para produção real</li>
            </ol>
          </div>
        </details>
        <div class="form-grid" style="max-width:600px">
          <div class="form-field form-field--span-2">
            <label>API Key Asaas</label>
            <input id="cfgAsaasApiKey" class="input" type="password"
              placeholder="$aact_..." autocomplete="new-password" />
          </div>
          <div class="form-field">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" id="cfgAsaasSandbox" style="width:16px;height:16px" checked />
              <span>Modo Sandbox (testes) — desative para produção real</span>
            </label>
          </div>
          <div class="form-field">
            <button id="cfgSalvarAsaasBtn" class="btn btn-primary">
              <i class="fa-solid fa-floppy-disk"></i> Salvar configuração Asaas
            </button>
          </div>
        </div>
      </section>

      <!-- CARD 7: Usuários do sistema (admin only) -->
      ${this.state.isAdmin ? `
      <section class="module-card" style="margin-bottom:16px">
        <div class="module-card__header" style="margin-bottom:16px">
          <div>
            <h3><i class="fa-solid fa-user-shield" style="color:var(--primary);margin-right:6px"></i>Usuários do sistema</h3>
            <p>Gestão de acessos, perfis e permissões</p>
          </div>
        </div>
        <div id="usuariosContainer"></div>
      </section>` : ''}

      <!-- CARD 8: LGPD -->
      <section class="module-card">
        <div class="module-card__header" style="margin-bottom:12px">
          <div>
            <h3><i class="fa-solid fa-file-arrow-down" style="color:var(--primary);margin-right:6px"></i>Exportar meus dados (LGPD)</h3>
            <p>Conforme a Lei 13.709/2018, você pode baixar todos os dados da sua empresa a qualquer momento.</p>
          </div>
        </div>
        <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:16px">
          O arquivo JSON incluirá: clientes, produtos, vendas, compras, contas a receber/pagar, movimentações de estoque e lançamentos financeiros.
        </p>
        <button id="exportarDadosBtn" class="btn btn-light">
          <i class="fa-solid fa-download"></i> Baixar meus dados
        </button>
      </section>
    `;

    if (!this.state.eventsBound) {
      this.state.eventsBound = true;
      setTimeout(() => {
        document.getElementById('salvarConfigBtn')?.addEventListener('click', () => this.save());
        document.getElementById('cfgSalvarPerfilBtn')?.addEventListener('click', () => this.salvarPerfil());
        document.getElementById('cfgTrocarSenhaBtn')?.addEventListener('click', () => this.trocarSenha());
        document.getElementById('cfgCarregarHistoricoBtn')?.addEventListener('click', () => this.carregarHistorico());
        document.getElementById('cfgSalvarPixBtn')?.addEventListener('click', () => this.salvarPix());
        document.getElementById('cfgSalvarAsaasBtn')?.addEventListener('click', () => this.salvarAsaas());
        document.getElementById('exportarDadosBtn')?.addEventListener('click', () => this.exportarDados());

        // Cor primária
        const colorInput = document.getElementById('cfgCorPrimaria');
        colorInput?.addEventListener('input', () => {
          if (typeof window.aplicarCorPrimaria === 'function') window.aplicarCorPrimaria(colorInput.value);
        });
        document.getElementById('cfgCorPadraoBtn')?.addEventListener('click', () => {
          if (colorInput) colorInput.value = '#2563eb';
          if (typeof window.aplicarCorPrimaria === 'function') window.aplicarCorPrimaria(null);
          this.salvarCor(null);
        });
        document.querySelectorAll('.cfg-cor-preset').forEach(btn => {
          btn.addEventListener('click', () => {
            const cor = btn.dataset.cor;
            if (colorInput) colorInput.value = cor;
            if (typeof window.aplicarCorPrimaria === 'function') window.aplicarCorPrimaria(cor);
            document.querySelectorAll('.cfg-cor-preset').forEach(b => {
              b.style.borderColor = 'transparent';
              b.style.outline = 'none';
            });
            btn.style.borderColor = '#fff';
            btn.style.outline = '2px solid var(--text-muted)';
          });
        });

        // Logo da empresa
        const logoInput = document.getElementById('cfgLogoInput');
        document.getElementById('cfgLogoEscolherBtn')?.addEventListener('click', () => logoInput?.click());
        document.getElementById('cfgLogoPreview')?.addEventListener('click', () => logoInput?.click());
        document.getElementById('cfgLogoRemoverBtn')?.addEventListener('click', async () => {
          await this.salvarLogo(null);
          // re-renderiza o preview sem o botão remover
          document.getElementById('cfgLogoRemoverBtn')?.remove();
        });
        logoInput?.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const dataUrl = await this._processarImagemLogo(file);
            await this.salvarLogo(dataUrl);
            // mostra botão remover se ainda não existe
            if (!document.getElementById('cfgLogoRemoverBtn')) {
              const escolherBtn = document.getElementById('cfgLogoEscolherBtn');
              if (escolherBtn) {
                const remBtn = document.createElement('button');
                remBtn.type = 'button';
                remBtn.id = 'cfgLogoRemoverBtn';
                remBtn.className = 'btn btn-light';
                remBtn.style.cssText = 'font-size:12px;padding:4px 10px;height:28px;color:var(--danger)';
                remBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                remBtn.addEventListener('click', async () => { await this.salvarLogo(null); remBtn.remove(); });
                escolherBtn.parentElement.appendChild(remBtn);
              }
            }
          } catch (err) {
            showToast(err.message || 'Erro ao processar imagem', 'error');
          } finally {
            e.target.value = '';
          }
        });
      }, 0);
    }
  }
};

export async function initConfigModule() {
  await ConfigModule.init();
}

export default ConfigModule;
