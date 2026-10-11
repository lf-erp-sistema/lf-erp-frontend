const API_BASE = window.LF_ERP_API_URL || 'https://lf-erp-backend.onrender.com';

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function moeda(v) {
  return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
function dataBR(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

async function carregar() {
  const token = location.hash.replace('#','').trim();
  if (!token) { mostrarErro('Link inválido. Verifique o endereço.'); return; }

  try {
    const resp = await fetch(`${API_BASE}/checkout/p/${token}`);
    const data = await resp.json();
    if (!data.sucesso) { mostrarErro(data.erro || 'Link inválido'); return; }
    renderizar(data.checkout, token);
  } catch {
    mostrarErro('Não foi possível carregar este link. Tente novamente.');
  }
}

function renderizar(co, token) {
  const root = document.getElementById('root');

  // Header
  root.innerHTML = `
    <div class="card-header">
      <div class="empresa-nome"><i class="fa fa-store"></i> ${esc(co.empresa_nome)}</div>
      <div class="checkout-desc">${esc(co.descricao)}</div>
      <div class="checkout-valor">${moeda(co.valor)}</div>
      ${co.expira_em ? `<div class="expira-aviso"><i class="fa fa-clock"></i> Válido até ${dataBR(co.expira_em)}</div>` : ''}
    </div>
    <div class="card-body" id="cardBody"></div>
    <div class="powered">Pagamento seguro via <strong>LF ERP</strong></div>
  `;

  renderBody(co, token);
}

function renderBody(co, token) {
  const body = document.getElementById('cardBody');

  if (co.status === 'pago') {
    body.innerHTML = `
      <div class="status-pago">
        <i class="fa fa-circle-check"></i>
        <strong>Pagamento confirmado!</strong>
        <span>Obrigado, ${esc(co.cliente_nome || 'cliente')}!</span>
        ${co.pago_em ? `<span style="margin-top:6px;display:block;">Registrado em ${dataBR(co.pago_em)}</span>` : ''}
      </div>`;
    return;
  }

  if (co.status === 'cancelado' || co.status === 'expirado') {
    body.innerHTML = `
      <div class="error-box">
        <i class="fa fa-circle-xmark"></i>
        <strong>Este link ${co.status === 'expirado' ? 'expirou' : 'foi cancelado'}.</strong>
        <p style="margin-top:6px;font-size:13px;">Entre em contato com ${esc(co.empresa_nome)} para um novo link.</p>
      </div>`;
    return;
  }

  const temPix    = Boolean(co.tem_pix || co.pix_copia_cola);
  const temBoleto = Boolean(co.tem_asaas);

  let html = '';

  if (temPix && temBoleto) {
    html += `
      <div class="tabs">
        <button class="tab-btn active" data-action="tab-pix"><i class="fa fa-qrcode"></i> PIX</button>
        <button class="tab-btn" data-action="tab-boleto"><i class="fa fa-barcode"></i> Boleto</button>
      </div>`;
  }

  // PIX
  if (temPix) {
    html += `<div class="pix-section ${temBoleto ? '' : 'active'}" id="abaPixSection">`;
    html += `<div class="qr-wrap"><div id="qrcodeDiv"></div></div>`;
    html += `<p style="font-size:12px;color:#64748b;text-align:center;margin-bottom:8px;">Ou copie a chave PIX:</p>`;
    html += `<div class="pix-key-box" id="pixKeyBox">${esc(co.pix_copia_cola)}</div>`;
    html += `<button class="btn btn-pix" data-action="copiar-pix"><i class="fa fa-copy"></i> Copiar código PIX</button>`;
    html += `<div class="info-row"><i class="fa fa-circle-info"></i><span>Abra o app do seu banco → PIX → Pagar → Copia e Cola. Confirme o valor e a empresa recebedora antes de pagar.</span></div>`;
    html += `</div>`;
  }

  // Boleto
  if (temBoleto) {
    html += `<div class="boleto-section ${temPix ? '' : 'active'}" id="abaBoletoSection">`;
    if (co.boleto_url) {
      html += `<a href="${esc(co.boleto_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-boleto"><i class="fa fa-file-lines"></i> Ver boleto</a>`;
      if (co.boleto_linha) {
        html += `<div class="pix-key-box" id="boletoLinhaBox" style="margin-top:12px;">${esc(co.boleto_linha)}</div>`;
        html += `<button class="btn btn-secondary" data-action="copiar-boleto"><i class="fa fa-copy"></i> Copiar linha digitável</button>`;
      }
    } else {
      html += `<p style="font-size:13px;color:#64748b;margin-bottom:12px;">Preencha seu nome para gerar o boleto:</p>`;
      html += `<input id="boletoNome" placeholder="Seu nome completo" style="width:100%;padding:11px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;margin-bottom:10px;font-family:Inter,sans-serif;">`;
      html += `<button class="btn btn-boleto" id="btnGerarBoleto"><i class="fa fa-barcode"></i> Gerar boleto</button>`;
      html += `<div id="boletoResult"></div>`;
    }
    html += `</div>`;
  }

  if (!temPix && !temBoleto) {
    html += `<div class="error-box" style="background:#fff7ed;border-color:#fed7aa;color:#92400e;">
      <i class="fa fa-triangle-exclamation" style="color:#f59e0b;"></i>
      <p style="font-size:13px;">Nenhuma forma de pagamento configurada para este link. Entre em contato com ${esc(co.empresa_nome)}.</p>
    </div>`;
  }

  body.innerHTML = html;

  // Delegação de eventos — substitui onclicks inline (CSP unsafe-inline não permitido)
  body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const act = btn.dataset.action;
    if (act === 'tab-pix') trocarAba('pix', btn);
    else if (act === 'tab-boleto') trocarAba('boleto', btn);
    else if (act === 'copiar-pix') copiarPix();
    else if (act === 'copiar-boleto') copiarBoleto();
  });

  // Listener para botão gerar boleto (evita onclick inline com token)
  document.getElementById('btnGerarBoleto')?.addEventListener('click', () => gerarBoleto(token));

  // Gera QR Code
  if (temPix && co.pix_copia_cola) {
    setTimeout(() => {
      const div = document.getElementById('qrcodeDiv');
      if (div && typeof QRCode !== 'undefined') {
        new QRCode(div, { text: co.pix_copia_cola, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
      }
    }, 100);
  }

  // Se só tem uma opção, mostra diretamente
  if (temPix && !temBoleto) document.getElementById('abaPixSection')?.classList.add('active');
  if (temBoleto && !temPix) document.getElementById('abaBoletoSection')?.classList.add('active');
}

function trocarAba(aba, btn) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.pix-section,.boleto-section').forEach((s) => s.classList.remove('active'));
  document.getElementById(`aba${aba.charAt(0).toUpperCase()+aba.slice(1)}Section`)?.classList.add('active');
}

function copiarPix() {
  const txt = document.getElementById('pixKeyBox')?.textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.querySelector('.btn-pix');
    if (btn) { btn.classList.add('btn-copied'); btn.innerHTML = '<i class="fa fa-check"></i> Copiado!'; setTimeout(() => { btn.classList.remove('btn-copied'); btn.innerHTML = '<i class="fa fa-copy"></i> Copiar código PIX'; }, 2500); }
  });
}

function copiarTexto(txt, id) {
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.getElementById(id) || document.querySelector('.btn-secondary');
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '<i class="fa fa-check"></i> Copiado!'; setTimeout(() => { btn.innerHTML = orig; }, 2000); }
  });
}

async function gerarBoleto(token) {
  const nome = document.getElementById('boletoNome')?.value.trim();
  const btn  = document.querySelector('.btn-boleto');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Gerando...'; }

  try {
    const resp = await fetch(`${API_BASE}/checkout/p/${token}/boleto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });
    const data = await resp.json();
    const result = document.getElementById('boletoResult');

    if (!data.sucesso) { if (result) result.innerHTML = `<div class="info-row" style="color:#ef4444;margin-top:8px;"><i class="fa fa-circle-xmark"></i>${esc(data.erro)}</div>`; return; }

    if (data.boleto_url) {
      if (btn) {
        btn.disabled = false; btn.innerHTML = '<i class="fa fa-external-link"></i> Abrir boleto';
        btn.addEventListener('click', () => {
          const safeUrl = /^https:\/\//i.test(data.boleto_url) ? data.boleto_url : null;
          if (safeUrl) { window.open(safeUrl, '_blank', 'noopener,noreferrer'); }
          else { console.warn('[Checkout] boleto_url com esquema inválido:', data.boleto_url); }
        }, { once: true });
      }
      if (data.boleto_linha && result) {
        result.innerHTML = `<div class="pix-key-box" id="boletoLinhaBox" style="margin-top:12px;">${esc(data.boleto_linha)}</div>`;
      }
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-barcode"></i> Gerar boleto'; }
    const result = document.getElementById('boletoResult');
    if (result) result.innerHTML = `<div class="info-row" style="color:#ef4444;margin-top:8px;"><i class="fa fa-circle-xmark"></i> Erro ao gerar boleto. Tente novamente.</div>`;
    console.error('[Checkout] gerarBoleto erro:', err?.message || err);
  }
}

function copiarBoleto() {
  const txt = document.getElementById('boletoLinhaBox')?.textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.querySelector('.btn-secondary');
    if (btn) { const o = btn.innerHTML; btn.innerHTML = '<i class="fa fa-check"></i> Copiado!'; setTimeout(() => { btn.innerHTML = o; }, 2000); }
  });
}

function mostrarErro(msg) {
  document.getElementById('root').innerHTML = `
    <div class="card-body">
      <div class="error-box"><i class="fa fa-circle-xmark"></i><strong>${esc(msg)}</strong></div>
    </div>`;
}

carregar();
