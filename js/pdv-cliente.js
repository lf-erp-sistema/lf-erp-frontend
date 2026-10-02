/**
 * pdv-cliente.js — LF ERP
 * Tela voltada para o cliente: espelha o carrinho do PDV em tempo real.
 * Sincronizado via BroadcastChannel (mesma origem, sem backend envolvido) —
 * a janela do PDV publica, esta janela só escuta e renderiza.
 */
(function () {
  const CANAL = 'lf_pdv_cliente';
  const OBRIGADO_DURACAO_MS = 8000;

  let obrigadoTimer = null;

  function fmtCur(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function mostrarConteudoNormal() {
    document.getElementById('obrigado').classList.remove('ativo');
    document.getElementById('conteudo').classList.remove('escondido');
    if (obrigadoTimer) { clearTimeout(obrigadoTimer); obrigadoTimer = null; }
  }

  function renderCarrinho(msg) {
    const itens = Array.isArray(msg.itens) ? msg.itens : [];

    // O PDV reseta o carrinho (e publica isso) logo após finalizar a venda —
    // sem essa guarda, a tela de "Obrigado" seria interrompida no mesmo
    // instante em que aparece. Só um carrinho com itens de verdade (a
    // próxima venda já começou) deve tirar a tela de "Obrigado" antes do
    // tempo normal.
    const obrigadoAtivo = document.getElementById('obrigado').classList.contains('ativo');
    if (obrigadoAtivo && !itens.length) return;

    mostrarConteudoNormal();

    if (msg.empresa) document.getElementById('nomeEmpresa').textContent = msg.empresa;
    const vazio = document.getElementById('vazio');
    const listaEl = document.getElementById('itens');
    const totaisEl = document.getElementById('totais');

    if (!itens.length) {
      vazio.classList.remove('hidden');
      listaEl.classList.add('hidden');
      totaisEl.classList.add('hidden');
      return;
    }

    vazio.classList.add('hidden');
    listaEl.classList.remove('hidden');
    totaisEl.classList.remove('hidden');

    listaEl.innerHTML = itens.map((item) => `
      <div class="item">
        <span class="item__qtd">${Number(item.quantidade || 0)}×</span>
        <span class="item__nome">${esc(item.nome)}</span>
        <span class="item__total">${fmtCur(item.total)}</span>
      </div>
    `).join('');

    const desconto = Number(msg.desconto || 0);
    const acrescimo = Number(msg.acrescimo || 0);

    const linhaDesconto = document.getElementById('linhaDesconto');
    if (desconto > 0) {
      linhaDesconto.style.display = 'flex';
      document.getElementById('valorDesconto').textContent = `- ${fmtCur(desconto)}`;
    } else {
      linhaDesconto.style.display = 'none';
    }

    const linhaAcrescimo = document.getElementById('linhaAcrescimo');
    if (acrescimo > 0) {
      linhaAcrescimo.style.display = 'flex';
      document.getElementById('valorAcrescimo').textContent = `+ ${fmtCur(acrescimo)}`;
    } else {
      linhaAcrescimo.style.display = 'none';
    }

    document.getElementById('valorTotal').textContent = fmtCur(msg.total);
  }

  function renderVendaFinalizada(msg) {
    document.getElementById('conteudo').classList.add('escondido');
    document.getElementById('obrigado').classList.add('ativo');
    document.getElementById('obrigadoValor').textContent = fmtCur(msg.total);
    document.getElementById('obrigadoTroco').textContent = Number(msg.troco || 0) > 0
      ? `Troco: ${fmtCur(msg.troco)}`
      : '';

    if (obrigadoTimer) clearTimeout(obrigadoTimer);
    obrigadoTimer = setTimeout(() => {
      mostrarConteudoNormal();
      renderCarrinho({ itens: [] });
    }, OBRIGADO_DURACAO_MS);
  }

  function iniciar() {
    if (!('BroadcastChannel' in window)) {
      document.querySelector('header p').textContent =
        'Este navegador não suporta sincronização em tempo real.';
      return;
    }

    const canal = new BroadcastChannel(CANAL);
    canal.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.tipo === 'carrinho') renderCarrinho(msg);
      else if (msg.tipo === 'venda_finalizada') renderVendaFinalizada(msg);
      else if (msg.tipo === 'reset') renderCarrinho({ itens: [] });
    };

    // Avisa a janela do PDV que esta tela está pronta, para ele reenviar o
    // estado atual do carrinho (esta janela pode ter sido aberta depois).
    canal.postMessage({ tipo: 'pronto' });

    window.addEventListener('beforeunload', () => canal.close());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
