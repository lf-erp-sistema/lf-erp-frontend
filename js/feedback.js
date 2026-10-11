import { escapeHtml } from './utils.js';

export function showToast(message, type = 'info', duration = 4000) {
  if (!message) return;

  let container = document.getElementById('toastContainer');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <div class="toast__content">
      <strong>${escapeHtml(getTituloToast(type))}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    <button type="button" class="toast__close" aria-label="Fechar">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  const close = () => {
    toast.classList.add('toast--hide');
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector('.toast__close')?.addEventListener('click', close);

  container.appendChild(toast);

  setTimeout(close, duration);
}

function getTituloToast(type) {
  switch (type) {
    case 'success': return 'Sucesso';
    case 'error':   return 'Erro';
    case 'warning': return 'Atenção';
    default:        return 'Informação';
  }
}

const _TIPOS_VALIDOS = ['danger', 'warning', 'primary', 'success'];

const _TIPO_ICONE = {
  danger:  'fa-solid fa-trash-can',
  warning: 'fa-solid fa-triangle-exclamation',
  primary: 'fa-solid fa-circle-question',
  success: 'fa-solid fa-circle-check',
};

const _TIPO_TITULO = {
  danger:  'Confirmar exclusão',
  warning: 'Atenção',
  primary: 'Confirmar ação',
  success: 'Confirmar',
};

function _tipoValido(tipo) {
  return _TIPOS_VALIDOS.includes(tipo) ? tipo : 'primary';
}

// Prende o foco (Tab/Shift+Tab) dentro de `card`. Retorna o handler de
// keydown já registrado, pra poder ser removido depois com a mesma
// referência.
function _prenderFoco(card) {
  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const focaveis = Array.from(
      card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }
  document.addEventListener('keydown', onKeydown);
  return onKeydown;
}

function _travarScroll() {
  document.body.classList.add('scroll-locked');
}

function _destravarScroll() {
  document.body.classList.remove('scroll-locked');
}

/**
 * Pede confirmação ao usuário antes de uma ação (ex: exclusão). Substitui
 * window.confirm()/confirm() nativos em todo o app.
 *
 * @param {string} mensagem - texto da confirmação (quebras de linha \n são preservadas)
 * @param {string} labelConfirmar - texto do botão de ação (padrão "Confirmar")
 * @param {'danger'|'warning'|'primary'|'success'} tipo - variante visual (padrão "danger")
 * @returns {Promise<boolean>} true se confirmado, false se cancelado/Escape/backdrop
 */
export function confirmarAcao(mensagem, labelConfirmar = 'Confirmar', tipo = 'danger') {
  const tipoValido = _tipoValido(tipo);

  return new Promise((resolve) => {
    const acionador = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'cf-overlay';
    overlay.innerHTML = `
      <div class="cf-card cf-card--${tipoValido}" role="alertdialog" aria-modal="true" aria-labelledby="_cfTitulo" aria-describedby="_cfMsg">
        <div class="cf-card__header">
          <span class="cf-card__icon"><i class="${_TIPO_ICONE[tipoValido]}" aria-hidden="true"></i></span>
          <strong class="cf-card__title" id="_cfTitulo">${escapeHtml(_TIPO_TITULO[tipoValido])}</strong>
        </div>
        <div class="cf-card__body">
          <p class="cf-card__message" id="_cfMsg">${escapeHtml(mensagem)}</p>
        </div>
        <div class="cf-card__footer">
          <button type="button" class="cf-card__btn cf-card__btn--cancel" data-cf="cancelar">Cancelar</button>
          <button type="button" class="cf-card__btn cf-card__btn--confirm" data-cf="confirmar">${escapeHtml(labelConfirmar)}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _travarScroll();

    const card = overlay.querySelector('.cf-card');
    const btnCancelar = overlay.querySelector('[data-cf="cancelar"]');
    const btnConfirmar = overlay.querySelector('[data-cf="confirmar"]');
    const onKeydownFoco = _prenderFoco(card);
    let resolvido = false;

    function fechar(resultado) {
      if (resolvido) return;
      resolvido = true;
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('keydown', onKeydownFoco);
      overlay.remove();
      _destravarScroll();
      resolve(resultado);
      if (acionador && document.contains(acionador) && typeof acionador.focus === 'function') {
        acionador.focus();
      }
    }

    function onEscape(e) {
      if (e.key === 'Escape') fechar(false);
    }

    document.addEventListener('keydown', onEscape);
    btnCancelar.addEventListener('click', () => fechar(false));
    btnConfirmar.addEventListener('click', () => fechar(true));

    // Clicar no backdrop fecha como cancelar
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(false); });

    // Em exclusões (danger) o botão destrutivo NÃO fica focado por padrão —
    // Enter não deve confirmar acidentalmente.
    btnCancelar.focus();
  });
}

const _INPUT_TIPOS_PERMITIDOS = ['text', 'number', 'email', 'password', 'date', 'tel', 'url'];

/**
 * Pede um valor de texto/número ao usuário. Substitui prompt() nativo.
 *
 * @param {string} label - texto/pergunta principal
 * @param {string} placeholder - placeholder do campo (padrão vazio)
 * @param {string} tipo - tipo do <input> (padrão "text")
 * @param {object} [opcoes]
 * @param {string} [opcoes.valorInicial] - preenche o campo com um valor inicial
 * @param {string} [opcoes.titulo] - título do diálogo (padrão "Confirmar ação")
 * @param {string} [opcoes.descricao] - texto secundário opcional, abaixo do label
 * @param {(valor: string) => true|string} [opcoes.validar] - retorna true se válido,
 *   ou uma string com a mensagem de erro a exibir sem fechar o diálogo
 * @param {'danger'|'warning'|'primary'|'success'} [opcoes.tipoVisual] - variante visual (padrão "primary")
 * @returns {Promise<string|null>} o valor (trim) confirmado, ou null se cancelado/Escape/backdrop
 */
export function pedirInput(label, placeholder = '', tipo = 'text', opcoes = {}) {
  if (!_INPUT_TIPOS_PERMITIDOS.includes(tipo)) tipo = 'text';
  const { valorInicial = '', titulo, descricao, validar, tipoVisual = 'primary' } = opcoes;
  const tipoValido = _tipoValido(tipoVisual);

  return new Promise((resolve) => {
    const acionador = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'cf-overlay';
    overlay.innerHTML = `
      <div class="cf-card cf-card--${tipoValido}" role="dialog" aria-modal="true" aria-labelledby="_piTitulo">
        <div class="cf-card__header">
          <span class="cf-card__icon"><i class="${_TIPO_ICONE[tipoValido]}" aria-hidden="true"></i></span>
          <strong class="cf-card__title" id="_piTitulo">${escapeHtml(titulo || _TIPO_TITULO[tipoValido])}</strong>
        </div>
        <div class="cf-card__body">
          <p class="cf-card__message">${escapeHtml(label)}</p>
          ${descricao ? `<p class="cf-card__description">${escapeHtml(descricao)}</p>` : ''}
          <input class="cf-card__input" type="${escapeHtml(tipo)}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(valorInicial)}" />
          <p class="cf-card__error"></p>
        </div>
        <div class="cf-card__footer">
          <button type="button" class="cf-card__btn cf-card__btn--cancel" data-pi="cancelar">Cancelar</button>
          <button type="button" class="cf-card__btn cf-card__btn--confirm" data-pi="confirmar">OK</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _travarScroll();

    const card = overlay.querySelector('.cf-card');
    const input = overlay.querySelector('.cf-card__input');
    const erroEl = overlay.querySelector('.cf-card__error');
    const btnCancelar = overlay.querySelector('[data-pi="cancelar"]');
    const btnConfirmar = overlay.querySelector('[data-pi="confirmar"]');
    const onKeydownFoco = _prenderFoco(card);
    let resolvido = false;

    function fechar(valor) {
      if (resolvido) return;
      resolvido = true;
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('keydown', onKeydownFoco);
      overlay.remove();
      _destravarScroll();
      resolve(valor);
      if (acionador && document.contains(acionador) && typeof acionador.focus === 'function') {
        acionador.focus();
      }
    }

    function tentarConfirmar() {
      const valor = input.value?.trim() || null;
      if (typeof validar === 'function') {
        const resultado = validar(valor);
        if (resultado !== true) {
          erroEl.textContent = typeof resultado === 'string' ? resultado : 'Valor inválido.';
          erroEl.classList.add('cf-card__error--show');
          input.focus();
          return;
        }
      }
      fechar(valor);
    }

    function onEscape(e) {
      if (e.key === 'Escape') fechar(null);
    }

    document.addEventListener('keydown', onEscape);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tentarConfirmar(); }
    });
    input.addEventListener('input', () => erroEl.classList.remove('cf-card__error--show'));

    btnCancelar.addEventListener('click', () => fechar(null));
    btnConfirmar.addEventListener('click', tentarConfirmar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(null); });

    setTimeout(() => input.focus(), 50);
  });
}
