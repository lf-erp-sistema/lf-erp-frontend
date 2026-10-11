import api from './api.js';
import { showToast } from './feedback.js';
import { toCurrency } from './utils.js';

let _pollInterval = null;
let _timerTick = null;

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stopPoll() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
  if (_timerTick)    { clearInterval(_timerTick);    _timerTick = null;    }
}

function removeModal() {
  stopPoll();
  window._lf_pixCleanup = null;
  const m = document.getElementById('_pixModal');
  if (m) m.remove();
}

function sandboxQRSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" fill="#f4f7fb" rx="12"/>
    <rect x="20" y="20" width="60" height="60" fill="none" stroke="#2563eb" stroke-width="6"/>
    <rect x="32" y="32" width="36" height="36" fill="#2563eb"/>
    <rect x="120" y="20" width="60" height="60" fill="none" stroke="#2563eb" stroke-width="6"/>
    <rect x="132" y="32" width="36" height="36" fill="#2563eb"/>
    <rect x="20" y="120" width="60" height="60" fill="none" stroke="#2563eb" stroke-width="6"/>
    <rect x="32" y="132" width="36" height="36" fill="#2563eb"/>
    <rect x="90" y="90" width="20" height="20" fill="#2563eb"/>
    <rect x="120" y="90" width="10" height="10" fill="#2563eb"/>
    <rect x="140" y="90" width="20" height="10" fill="#2563eb"/>
    <rect x="90" y="120" width="10" height="20" fill="#2563eb"/>
    <rect x="110" y="110" width="10" height="10" fill="#2563eb"/>
    <rect x="130" y="120" width="30" height="10" fill="#2563eb"/>
    <rect x="150" y="140" width="30" height="10" fill="#2563eb"/>
    <rect x="120" y="150" width="20" height="20" fill="#2563eb"/>
    <text x="100" y="192" text-anchor="middle" fill="#64748b" font-size="9" font-family="sans-serif">MODO SANDBOX</text>
  </svg>`;
}

export async function gerarPIX({ contaReceberID, valor, clienteNome, onPago } = {}) {
  removeModal();
  window._lf_pixCleanup = removeModal;

  // Render do modal de carregamento
  const overlay = document.createElement('div');
  overlay.id = '_pixModal';
  overlay.className = 'pix-modal-overlay';
  overlay.innerHTML = `
    <div class="pix-modal">
      <div class="pix-modal__header">
        <div class="pix-modal__title">
          <i class="fa-brands fa-pix pix-icon"></i>
          <span>Cobrar via PIX</span>
        </div>
        <button class="modal-close" id="_pixFechar" title="Fechar" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="pix-modal__body" id="_pixBody">
        <div style="text-align:center;padding:40px 0">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:var(--primary)"></i>
          <p style="margin-top:12px;color:var(--text-muted)">Gerando cobrança PIX...</p>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('_pixFechar').onclick = removeModal;
  overlay.onclick = (e) => { if (e.target === overlay) removeModal(); };

  try {
    const data = await api.gerarPIX({ conta_receber_id: contaReceberID, valor, cliente_nome: clienteNome });
    renderPIXModal(data, valor, clienteNome, onPago);
  } catch (error) {
    document.getElementById('_pixBody').innerHTML = `
      <div class="module-feedback module-feedback--error" style="margin:0">
        ${esc(error?.message || 'Erro ao gerar cobrança PIX.')}
      </div>
      <p style="margin-top:16px;font-size:.85rem;color:var(--text-muted);text-align:center">
        Verifique as credenciais EFÍ em <strong>Configurações → PIX</strong>.
      </p>`;
  }
}

function renderPIXModal(data, valor, clienteNome, onPago) {
  const body = document.getElementById('_pixBody');
  if (!body) return;

  const isSandbox = data.sandbox;
  const _expTs = data.expiracao ? new Date(data.expiracao).getTime() : NaN;
  const expMs = !isNaN(_expTs) ? _expTs : Date.now() + 30 * 60 * 1000;

  const qrHtml = data.qr_image
    ? `<img src="${esc(data.qr_image)}" alt="QR Code PIX" class="pix-qr"/>`
    : `<div class="pix-qr pix-qr--svg">${sandboxQRSVG()}</div>`;

  body.innerHTML = `
    ${isSandbox ? `<div class="pix-sandbox-badge"><i class="fa-solid fa-flask"></i> Modo Sandbox — QR Code de demonstração</div>` : ''}

    <div class="pix-valor">${toCurrency(valor)}</div>
    ${clienteNome ? `<p class="pix-cliente">${esc(clienteNome)}</p>` : ''}

    <div class="pix-qr-wrap">
      ${qrHtml}
    </div>

    <div class="pix-chave-wrap">
      <label>PIX Copia e Cola</label>
      <div class="pix-chave-box">
        <input class="pix-chave-input" id="_pixChave" type="text" readonly
          value="${esc(data.pix_copia_e_cola || '')}"/>
        <button class="btn btn-light pix-copy-btn" id="_pixCopiar" title="Copiar" aria-label="Copiar">
          <i class="fa-solid fa-copy"></i>
        </button>
      </div>
    </div>

    <div class="pix-timer-row">
      <i class="fa-solid fa-clock"></i>
      <span>Expira em <strong id="_pixTimer">30:00</strong></span>
      <span id="_pixStatusBadge" class="pix-status-badge pix-status--aguardando">Aguardando pagamento...</span>
    </div>

    ${isSandbox ? `
    <div class="pix-sandbox-info">
      <strong>Para ativar em produção:</strong>
      <ol>
        <li>Abra conta em <strong>efipay.com.br</strong> (grátis)</li>
        <li>Acesse API → Criar aplicação</li>
        <li>Baixe o certificado .p12</li>
        <li>Salve as credenciais em <strong>Configurações → PIX</strong></li>
      </ol>
    </div>` : ''}
  `;

  // Copiar
  document.getElementById('_pixCopiar').onclick = () => {
    const input = document.getElementById('_pixChave');
    if (input) {
      input.select();
      navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
      showToast('Código PIX copiado!', 'success');
    }
  };

  // Timer regressivo
  function atualizarTimer() {
    const restante = Math.max(0, expMs - Date.now());
    const min = Math.floor(restante / 60000);
    const seg = Math.floor((restante % 60000) / 1000);
    const el = document.getElementById('_pixTimer');
    if (el) el.textContent = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    if (restante === 0) stopPoll();
  }

  atualizarTimer();
  _timerTick = setInterval(atualizarTimer, 1000);

  // Polling de status (apenas produção)
  if (!isSandbox) {
    _pollInterval = setInterval(async () => {
      try {
        const status = await api.verificarStatusPIX(data.txid);
        if (status.status === 'CONCLUIDA') {
          stopPoll();
          clearInterval(_timerTick); _timerTick = null;
          const badge = document.getElementById('_pixStatusBadge');
          if (badge) {
            badge.className = 'pix-status-badge pix-status--pago';
            badge.textContent = 'Pago!';
          }
          showToast('PIX recebido com sucesso!', 'success');
          if (typeof onPago === 'function') onPago();
          setTimeout(removeModal, 2500);
        }
      } catch (_) { /* silencioso */ }
    }, 5000);
  }
}
