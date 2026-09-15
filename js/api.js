const _ALLOWED_API_HOSTS = [
  'lf-erp-backend.onrender.com',
  'localhost',
  '127.0.0.1'
];

function _validateApiUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return _ALLOWED_API_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}

const _storedApiUrl = localStorage.getItem('lf_erp_api_url');

const API_CONFIG = {
  BASE_URL:
    window.LF_ERP_API_URL ||
    (_validateApiUrl(_storedApiUrl) ? _storedApiUrl : null) ||
    'https://lf-erp-backend.onrender.com',
  TIMEOUT: 20000,
  STORAGE_KEY: 'lf_erp_auth'
};

function getStoredAuth() {
  try {
    const localAuth = localStorage.getItem(API_CONFIG.STORAGE_KEY);
    const sessionAuth = sessionStorage.getItem(API_CONFIG.STORAGE_KEY);
    const raw = localAuth || sessionAuth;

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (error) {
    console.warn('Não foi possível ler a autenticação salva.', error);
    return null;
  }
}

function getAuthToken() {
  const auth = getStoredAuth();
  return auth?.authToken || auth?.token || null;
}

function getEmpresaNome() {
  const auth = getStoredAuth();

  return (
    auth?.empresa?.nome ||
    auth?.empresa_nome ||
    auth?.user?.empresa ||
    auth?.user?.empresa_nome ||
    null
  );
}

function getEmpresaId() {
  const auth = getStoredAuth();

  return (
    auth?.empresa?.id ||
    auth?.empresaId ||
    auth?.empresa_id ||
    auth?.user?.empresa_id ||
    auth?.user?.empresaId ||
    null
  );
}

function buildHeaders(customHeaders = {}) {
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...customHeaders
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function buildUrl(path, query = {}) {
  const cleanBase = API_CONFIG.BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${cleanBase}${cleanPath}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.append(key, value);
  });

  return url.toString();
}

async function withTimeout(promise, timeout = API_CONFIG.TIMEOUT) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('A requisição demorou demais para responder.'));
    }, timeout);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let payload = null;

  try {
    payload = isJson ? await response.json() : await response.text();
  } catch (error) {
    payload = null;
  }

  // 🔴 TRATAMENTO DE ERRO PADRONIZADO
  if (!response.ok) {
    const statusMessages = {
      400: 'Dados inválidos. Verifique os campos e tente novamente.',
      401: 'Sessão expirada. Faça login novamente.',
      403: 'Sem permissão para esta ação.',
      404: 'Registro não encontrado.',
      429: 'Muitas tentativas. Aguarde um momento.',
      500: 'Erro interno do servidor. Tente novamente.',
      502: 'Servidor temporariamente indisponível.',
      503: 'Serviço em manutenção. Tente novamente em instantes.'
    };
    const message =
      payload?.erro ||
      payload?.message ||
      (typeof payload === 'string' && payload) ||
      statusMessages[response.status] ||
      `Erro HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  // 🟢 NOVO PADRÃO SAAS (AUTOMÁTICO)
  if (payload && typeof payload === 'object') {
    if (payload.sucesso === false) {
      const error = new Error(payload.erro || 'Erro na operação');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    if (payload.sucesso === true) {
      // Respostas paginadas: preservar total/limite/offset para paginação
      if (payload.dados !== undefined && payload.total !== undefined) {
        return payload;
      }
      return payload.dados !== undefined ? payload.dados : payload;
    }
  }

  // fallback (compatibilidade total)
  return payload;
}

// Acorda o servidor (Render spin-down). Chamado quando a tela de login aparece.
// Silencioso — nunca rejeita, nunca exibe erro ao usuário.
async function warmupServer() {
  try {
    await withTimeout(fetch(`${API_CONFIG.BASE_URL}/health`), 90000);
  } catch {
    // intencional — cold start pode levar até 60s, apenas acordamos o processo
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, query = {}, timeout = API_CONFIG.TIMEOUT } = options;

  const url = buildUrl(path, query);

  const fetchOptions = {
    method,
    headers: buildHeaders(headers)
  };

  if (body !== undefined && body !== null) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  fetchOptions.signal = controller.signal;

  try {
    const response = await fetch(url, fetchOptions);
    if (response.status === 401 && !API_CONFIG._isRedirecting401) {
      API_CONFIG._isRedirecting401 = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('lferp:session-expired'));
      }
    }
    return parseResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('A requisição demorou demais para responder.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeLoginResponse(data) {
  const empresaId =
    data?.empresa?.id ||
    data?.empresaId ||
    data?.empresa_id ||
    data?.user?.empresa_id ||
    data?.usuario?.empresa_id ||
    null;

  const empresaNome =
    data?.empresa?.nome ||
    data?.empresa_nome ||
    data?.user?.empresa ||
    data?.user?.empresa_nome ||
    null;

  return {
    authToken: data?.authToken || data?.token || data?.accessToken || data?.access_token || null,
    empresaId,
    empresa:
      empresaNome || empresaId
        ? {
            id: empresaId,
            nome: empresaNome
          }
        : null,
    user: data?.user ||
      data?.usuario || {
        nome: data?.nome || 'Usuário',
        perfil: data?.perfil || 'Usuário',
        empresa: empresaNome,
        empresa_id: empresaId
      }
  };
}

async function login(usuario, senha, timeout) {
  const response = await request('/login', {
    method: 'POST',
    body: { usuario, senha },
    ...(timeout ? { timeout } : {})
  });
  API_CONFIG._isRedirecting401 = false;
  return normalizeLoginResponse(response);
}

async function validateSession(timeout) {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Sessão não encontrada.');
  }

  return request('/me', {
    method: 'GET',
    ...(timeout ? { timeout } : {})
  });
}

async function getSseNonce() {
  return request('/auth/sse-token', { method: 'GET' });
}

async function refreshToken() {
  return request('/auth/refresh', { method: 'POST' });
}

function ensureEmpresa() {
  const empresa = getEmpresaNome();

  if (!empresa) {
    throw new Error('Empresa da sessão não encontrada.');
  }

  return encodeURIComponent(empresa);
}

function ensureEmpresaId() {
  const empresaId = getEmpresaId();

  if (!empresaId) {
    throw new Error('Empresa ID da sessão não encontrada.');
  }

  return empresaId;
}

async function fetchAPI(path, method = 'GET', body = null, query = {}) {
  return request(path, {
    method,
    body,
    query
  });
}

async function getDashboard(params = {}) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/dashboard', {
    method: 'GET',
    query: {
      empresa,
      empresa_id: empresaId,
      ...params
    }
  });
}

async function getDashboardGrafico(params = {}) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/dashboard/grafico', {
    method: 'GET',
    query: {
      empresa,
      empresa_id: empresaId,
      ...params
    }
  });
}

async function getEmpresaStatus() {
  return request('/empresa/status', {
    method: 'GET'
  });
}

async function getAlertas() {
  const empresa = ensureEmpresa();
  return request(`/alertas/${empresa}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function updateMePerfil(payload) {
  return request('/me/perfil', { method: 'PUT', body: payload });
}

async function getProdutos(params = {}) {
  const empresa = ensureEmpresa();
  const r = await request(`/produtos/${empresa}`, { method: 'GET', query: { ...params } });
  return r?.dados ?? r;
}

async function createProduto(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/produtos', {
    method: 'POST',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateProduto(id, payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/produtos/${id}`, {
    method: 'PUT',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function deleteProduto(id) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/produtos/${id}`, {
    method: 'DELETE',
    query: {
      empresa,
      empresa_id: empresaId
    }
  });
}

// ── GRADES ───────────────────────────────────────────────────────────────────

async function getGradesProduto(produtoId) {
  return request(`/grades/produto/${produtoId}`, { query: { empresa_id: getEmpresaId() } });
}

async function createGrade(produtoId, data) {
  return request(`/grades/produto/${produtoId}`, { method: 'POST', body: { ...data, empresa_id: getEmpresaId() } });
}

async function updateGrade(gradeId, data) {
  return request(`/grades/${gradeId}`, { method: 'PUT', body: { ...data, empresa_id: getEmpresaId() } });
}

async function deleteGrade(gradeId) {
  return request(`/grades/${gradeId}`, { method: 'DELETE', query: { empresa_id: getEmpresaId() } });
}

async function toggleGrade(produtoId) {
  return request(`/grades/produto/${produtoId}/toggle`, { method: 'PATCH', body: { empresa_id: getEmpresaId() } });
}

async function getAtributos() {
  return request('/grades/atributos');
}

// ── TABELAS DE PREÇO ─────────────────────────────────────────────────────────

async function getTabelaPrecosDashboard() {
  return request('/tabelas-preco/dashboard', { method: 'GET' });
}

async function resolverPrecoTabela({ produtoId, clienteId = null, gradeId = null, quantidade = 1, empresa_id = null }) {
  const q = { produto_id: produtoId, quantidade };
  if (clienteId) q.cliente_id = clienteId;
  if (gradeId) q.grade_id = gradeId;
  if (empresa_id) q.empresa_id = empresa_id;
  return request('/tabelas-preco/resolver', { method: 'GET', query: q });
}

// ── KITS ─────────────────────────────────────────────────────────────────────

async function getKitComponentes(produtoId) {
  return request(`/kits/produto/${produtoId}/componentes`, { query: { empresa_id: getEmpresaId() } });
}

async function addKitComponente(produtoId, data) {
  return request(`/kits/produto/${produtoId}/componentes`, { method: 'POST', body: { ...data, empresa_id: getEmpresaId() } });
}

async function updateKitComponente(produtoId, compId, data) {
  return request(`/kits/produto/${produtoId}/componentes/${compId}`, { method: 'PUT', body: { ...data, empresa_id: getEmpresaId() } });
}

async function deleteKitComponente(produtoId, compId) {
  return request(`/kits/produto/${produtoId}/componentes/${compId}`, { method: 'DELETE', query: { empresa_id: getEmpresaId() } });
}

async function toggleKit(produtoId) {
  return request(`/kits/produto/${produtoId}/toggle`, { method: 'PATCH', body: { empresa_id: getEmpresaId() } });
}

async function getEstoqueKit(produtoId) {
  return request(`/kits/produto/${produtoId}/estoque`, { query: { empresa_id: getEmpresaId() } });
}

// ── IMAGENS ───────────────────────────────────────────────────────────────────

async function getImagensProduto(produtoId) {
  return request(`/imagens/produto/${produtoId}`, { query: { empresa_id: getEmpresaId() } });
}

async function uploadImagemProduto(produtoId, file) {
  const token = getAuthToken();
  const url   = buildUrl(`/imagens/produto/${produtoId}`);
  const form  = new FormData();
  form.append('imagem', file);

  const res = await withTimeout(
    fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  );
  return parseResponse(res);
}

async function setPrincipalImagem(imagemId) {
  return request(`/imagens/${imagemId}/principal`, { method: 'PATCH', body: { empresa_id: getEmpresaId() } });
}

async function updateOrdemImagem(imagemId, ordem) {
  return request(`/imagens/${imagemId}/ordem`, { method: 'PUT', body: { ordem, empresa_id: getEmpresaId() } });
}

async function deletarImagem(imagemId) {
  return request(`/imagens/${imagemId}`, { method: 'DELETE', query: { empresa_id: getEmpresaId() } });
}

async function getClientes(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/clientes/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getClientesABC() {
  const empresa   = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/clientes/segmentacao-abc', {
    method: 'GET',
    query: { empresa, empresa_id: empresaId }
  });
}

async function createCliente(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/clientes', {
    method: 'POST',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateCliente(id, payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/clientes/${id}`, {
    method: 'PUT',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function deleteCliente(id) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/clientes/${id}`, {
    method: 'DELETE',
    query: {
      empresa,
      empresa_id: empresaId
    }
  });
}

async function getFornecedores(params = {}) {
  const empresa = ensureEmpresa();
  const r = await request(`/fornecedores/${empresa}`, { method: 'GET', query: { ...params } });
  return r?.dados ?? r;
}

async function createFornecedor(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/fornecedores', {
    method: 'POST',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateFornecedor(id, payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/fornecedores/${id}`, {
    method: 'PUT',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function deleteFornecedor(id) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/fornecedores/${id}`, {
    method: 'DELETE',
    query: {
      empresa,
      empresa_id: empresaId
    }
  });
}

async function getUsuarios(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/usuarios/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function createUsuario(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/usuarios', {
    method: 'POST',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateUsuario(id, payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/usuarios/${id}`, {
    method: 'PUT',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function deleteUsuario(id) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/usuarios/${id}`, {
    method: 'DELETE',
    query: {
      empresa,
      empresa_id: empresaId
    }
  });
}

async function getVendas(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/vendas/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getVendaDetalhe(id) {
  return request(`/vendas/detalhe/${id}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function createVenda(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/vendas', {
    method: 'POST',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateVenda(id, payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/vendas/${id}`, {
    method: 'PUT',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateVendaObservacao(id, observacao) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/vendas/${id}/observacao`, {
    method: 'PATCH',
    body: {
      empresa,
      empresa_id: empresaId,
      observacao
    }
  });
}

async function getCompras(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/compras/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getCompraDetalhe(id) {
  return request(`/compras-detalhe/${id}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function createCompra(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/compras', {
    method: 'POST',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateCompra(id, payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/compras/${id}`, {
    method: 'PUT',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function deleteCompra(id) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request(`/compras/${id}`, {
    method: 'DELETE',
    query: {
      empresa,
      empresa_id: empresaId
    }
  });
}

async function getContasReceber(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/contas-receber/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getHistoricoFinanceiroCliente(clienteId) {
  return request(`/contas-receber/cliente-historico/${clienteId}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function getContaReceberDetalhe(id) {
  return request(`/contas-receber/detalhe/${id}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function getContasReceberClientes() {
  const empresa = ensureEmpresa();

  return request(`/contas-receber-clientes/${empresa}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function baixarContaReceber(id, payload = {}) {
  return request(`/contas-receber/pagar/${id}`, {
    method: 'POST',
    body: { empresa: getEmpresaNome(), empresa_id: getEmpresaId(), ...payload }
  });
}

async function estornarContaReceber(id, payload = {}) {
  return request(`/contas-receber/estornar/${id}`, {
    method: 'POST',
    body: { empresa: getEmpresaNome(), empresa_id: getEmpresaId(), ...payload }
  });
}

async function getOrigemVendaContaReceber(id) {
  return request(`/contas-receber/origem-venda/${id}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function getContasPagar(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/contas-pagar/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getContaPagarDetalhe(id) {
  return request(`/contas-pagar/detalhe/${id}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function getContasPagarFornecedores() {
  const empresa = ensureEmpresa();

  return request(`/contas-pagar-fornecedores/${empresa}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function pagarContaPagar(id, payload = {}) {
  return request(`/contas-pagar/pagar/${id}`, {
    method: 'POST',
    body: { empresa: getEmpresaNome(), empresa_id: getEmpresaId(), ...payload }
  });
}

async function getOrigemCompraContaPagar(id) {
  return request(`/contas-pagar/origem-compra/${id}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function getFluxoCaixa(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/financeiro/fluxo-caixa/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

// ── Import XML NF de Fornecedor ───────────────────────────────────────────────

async function importarXmlNF(conteudo) {
  const empresa   = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/compras/importar-xml', {
    method: 'POST',
    body: { conteudo, empresa, empresa_id: empresaId }
  });
}

// ── NFC-e ─────────────────────────────────────────────────────────────────────

async function emitirNfce(vendaId) {
  return request(`/nfce/emitir/${vendaId}`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function consultarNfce(ref) {
  return request(`/nfce/consultar/${ref}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function cancelarNfce(nfceId, justificativa) {
  return request(`/nfce/cancelar/${nfceId}`, { method: 'POST', body: { justificativa, empresa_id: getEmpresaId() } });
}

async function getNfceLista(params = {}) {
  return request('/nfce/lista', { method: 'GET', query: { ...params, empresa_id: getEmpresaId() } });
}

async function getNfcePdf(ref) {
  return request(`/nfce/pdf/${ref}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

// ── PIX ───────────────────────────────────────────────────────────────────────

async function getPixConfig() {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/pagamentos/pix/config', { method: 'GET', query: { empresa, empresa_id: empresaId } });
}

async function savePixConfig(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/pagamentos/pix/config', { method: 'PUT', body: { ...payload, empresa, empresa_id: empresaId } });
}

async function gerarPIX(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/pagamentos/pix/gerar', { method: 'POST', body: { ...payload, empresa, empresa_id: empresaId } });
}

async function verificarStatusPIX(txid) {
  const empresa = getEmpresaNome();
  return request(`/pagamentos/pix/status/${txid}`, { method: 'GET', query: { empresa, empresa_id: getEmpresaId() } });
}

// ── Conciliação Bancária ──────────────────────────────────────────────────────

async function importarConciliacao(payload) {
  const empresa   = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/conciliacao/importar', {
    method: 'POST',
    body: { ...payload, empresa, empresa_id: empresaId }
  });
}

async function getConciliacoes() {
  const empresa   = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/conciliacao', {
    method: 'GET',
    query: { empresa, empresa_id: empresaId }
  });
}

async function getConciliacaoItens(id, params = {}) {
  const empresa   = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request(`/conciliacao/${id}/itens`, {
    method: 'GET',
    query: { empresa, empresa_id: empresaId, ...params }
  });
}

async function ignorarConciliacaoItem(id) {
  return request(`/conciliacao/itens/${id}/ignorar`, { method: 'POST', body: { empresa: getEmpresaNome(), empresa_id: getEmpresaId() } });
}

async function criarLancamentoConciliacao(id, payload = {}) {
  return request(`/conciliacao/itens/${id}/criar-lancamento`, { method: 'POST', body: { empresa: getEmpresaNome(), empresa_id: getEmpresaId(), ...payload } });
}

async function deleteConciliacao(id) {
  return request(`/conciliacao/${id}`, { method: 'DELETE', query: { empresa_id: getEmpresaId() } });
}

// ─────────────────────────────────────────────────────────────────────────────

async function getLancamentosFinanceiros(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/financeiro/lancamentos/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getLancamentoFinanceiroDetalhe(id) {
  return request(`/financeiro/lancamentos-detalhe/${id}`, {
    method: 'GET',
    query: { empresa_id: getEmpresaId() }
  });
}

async function createLancamentoFinanceiro(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();

  return request('/financeiro/lancamentos', {
    method: 'POST',
    body: {
      ...payload,
      empresa,
      empresa_id: empresaId
    }
  });
}

async function updateLancamentoFinanceiro(id, payload) {
  const empresa   = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request(`/financeiro/lancamentos/${id}`, {
    method: 'PUT',
    body: { ...payload, empresa, empresa_id: empresaId }
  });
}

async function pagarLancamentoFinanceiro(id, payload = {}) {
  return request(`/financeiro/lancamentos/pagar/${id}`, {
    method: 'POST',
    body: { empresa: getEmpresaNome(), empresa_id: getEmpresaId(), ...payload }
  });
}

async function deleteLancamentoFinanceiro(id) {
  return request(`/financeiro/lancamentos/${id}`, {
    method: 'DELETE',
    query: { empresa_id: getEmpresaId() }
  });
}

async function getRelatorios(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/relatorios/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getRelatorioFinanceiroResumo(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/relatorios/financeiro/resumo/${empresa}`, {
    method: 'GET',
    query: {
      ...params
    }
  });
}

async function getRelatorioFinanceiroContasReceber(params = {}) {
  const empresa = ensureEmpresa();
  const r = await request(`/relatorios/financeiro/contas-receber/${empresa}`, { method: 'GET', query: { ...params } });
  return r?.dados ?? r;
}

async function getRelatorioFinanceiroContasPagar(params = {}) {
  const empresa = ensureEmpresa();
  const r = await request(`/relatorios/financeiro/contas-pagar/${empresa}`, { method: 'GET', query: { ...params } });
  return r?.dados ?? r;
}

async function getRelatorioFinanceiroFluxoCaixa(params = {}) {
  const empresa = ensureEmpresa();
  const r = await request(`/relatorios/financeiro/fluxo-caixa/${empresa}`, { method: 'GET', query: { ...params } });
  return r?.dados ?? r;
}

async function getRelatorioFinanceiroLucratividade(params = {}) {
  const empresa = ensureEmpresa();
  const r = await request(`/relatorios/financeiro/lucratividade/${empresa}`, { method: 'GET', query: { ...params } });
  return r?.dados ?? r;
}

async function getRelatorioVendasPorGrade(params = {}) {
  const empresa = ensureEmpresa();
  const r = await request(`/relatorios/vendas/por-grade/${empresa}`, { method: 'GET', query: { ...params } });
  return r?.dados ?? r;
}

async function getRelatorioDRE(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/relatorios/dre/${empresa}`, {
    method: 'GET',
    query: { ...params }
  });
}

async function getRelatorioInadimplencia(params = {}) {
  const empresa = ensureEmpresa();

  return request(`/relatorios/inadimplencia/${empresa}`, {
    method: 'GET',
    query: { ...params }
  });
}

// ── NF-e ─────────────────────────────────────────────────────────────────────

async function getNfeConfig() {
  return request('/nfe/config', { method: 'GET' });
}

async function salvarNfeConfig(payload) {
  return request('/nfe/config', { method: 'PUT', body: payload });
}

async function emitirNfe(vendaId) {
  return request(`/nfe/emitir/${vendaId}`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function consultarNfe(ref) {
  return request(`/nfe/consultar/${encodeURIComponent(ref)}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function cancelarNfe(nfeId, justificativa) {
  return request(`/nfe/cancelar/${nfeId}`, { method: 'POST', body: { justificativa, empresa_id: getEmpresaId() } });
}

async function getNfeLista(params = {}) {
  return request('/nfe/lista', { method: 'GET', query: { ...params, empresa_id: getEmpresaId() } });
}

function _makeBlobUrl(blob) {
  const blobUrl = URL.createObjectURL(blob);
  const timerId = setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return { url: blobUrl, revoke: () => { clearTimeout(timerId); URL.revokeObjectURL(blobUrl); } };
}

async function downloadNfePdf(ref) {
  const token = getAuthToken();
  const url = buildUrl(`/nfe/pdf/${encodeURIComponent(ref)}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('DANFE não disponível');
  const blob = await res.blob();
  return _makeBlobUrl(blob).url;
}

async function downloadNfeXml(ref) {
  const token = getAuthToken();
  const url = buildUrl(`/nfe/xml/${encodeURIComponent(ref)}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('XML não disponível');
  const blob = await res.blob();
  return _makeBlobUrl(blob).url;
}

// ── ORÇAMENTOS ───────────────────────────────────────────────────────────────

async function getOrcamentos(params = {}) {
  return request('/orcamentos', { method: 'GET', query: { ...params, empresa_id: getEmpresaId() } });
}

async function getOrcamento(id) {
  return request(`/orcamentos/${id}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function createOrcamento(payload) {
  const empresa = getEmpresaNome();
  const empresaId = getEmpresaId();
  return request('/orcamentos', { method: 'POST', body: { ...payload, empresa, empresa_id: empresaId } });
}

async function enviarOrcamento(id) {
  return request(`/orcamentos/${id}/enviar`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function aprovarOrcamento(id) {
  return request(`/orcamentos/${id}/aprovar`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function recusarOrcamento(id) {
  return request(`/orcamentos/${id}/recusar`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function converterOrcamentoPedido(id, payload = {}) {
  return request(`/orcamentos/${id}/converter`, { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function deleteOrcamento(id) {
  return request(`/orcamentos/${id}`, { method: 'DELETE', query: { empresa_id: getEmpresaId() } });
}

// ── PORTAL DO CLIENTE (admin) ─────────────────────────────────────────────────

async function configurarPortalCliente(clienteId, senha) {
  return request(`/portal/admin/clientes/${clienteId}/senha`, {
    method: 'POST',
    body: { senha, empresa_id: getEmpresaId() }
  });
}

async function togglePortalCliente(clienteId) {
  return request(`/portal/admin/clientes/${clienteId}/toggle`, {
    method: 'PATCH',
    body: { empresa_id: getEmpresaId() }
  });
}

// ── PEDIDOS ──────────────────────────────────────────────────────────────────

async function getPedidos(params = {}) {
  return request('/pedidos', { method: 'GET', query: { ...params, empresa_id: getEmpresaId() } });
}

async function getPedido(id) {
  return request(`/pedidos/${id}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function confirmarPedido(id) {
  return request(`/pedidos/${id}/confirmar`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function separacaoPedido(id) {
  return request(`/pedidos/${id}/separacao`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function cancelarPedido(id) {
  return request(`/pedidos/${id}/cancelar`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

async function converterPedidoVenda(id, payload = {}) {
  return request(`/pedidos/${id}/converter-venda`, { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

// ── COMISSÕES ─────────────────────────────────────────────────────────────────

async function getComissoesConfig() {
  return request('/comissoes/config', { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function salvarComissaoConfig(payload) {
  return request('/comissoes/config', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function deleteComissaoConfig(id) {
  return request(`/comissoes/config/${id}`, { method: 'DELETE', query: { empresa_id: getEmpresaId() } });
}

async function getComissoes(params = {}) {
  return request('/comissoes', { method: 'GET', query: { ...params, empresa_id: getEmpresaId() } });
}

async function getComissoesResumo(params = {}) {
  return request('/comissoes/resumo', { method: 'GET', query: { ...params, empresa_id: getEmpresaId() } });
}

async function pagarComissao(id, payload = {}) {
  return request(`/comissoes/${id}/pagar`, { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function cancelarComissao(id) {
  return request(`/comissoes/${id}/cancelar`, { method: 'POST', body: { empresa_id: getEmpresaId() } });
}

// ── CAIXA ─────────────────────────────────────────────────────────────────────

async function getCaixaSessaoAtiva() {
  return request('/caixa/sessao-ativa', { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function abrirCaixa(payload) {
  return request('/caixa/abrir', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function sangriaCaixa(payload) {
  return request('/caixa/sangria', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function suprimentoCaixa(payload) {
  return request('/caixa/suprimento', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function fecharCaixa(payload) {
  return request('/caixa/fechar', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function getCaixaHistorico() {
  return request('/caixa/historico', { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

// ── DEVOLUÇÕES ────────────────────────────────────────────────────────────────

async function getDevolucoes(params = {}) {
  return request('/devolucoes', { method: 'GET', query: { ...params, empresa_id: getEmpresaId() } });
}

async function registrarDevolucao(payload) {
  return request('/devolucoes', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function getDevolucoesDaVenda(vendaId) {
  return request(`/devolucoes/venda/${vendaId}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function getVendaDetalheParaDevolucao(vendaId) {
  return request(`/vendas/detalhe/${vendaId}`, { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

// ── ALERTAS DE COBRANÇA ───────────────────────────────────────────────────────

async function getAlertasConfig() {
  return request('/alertas/config', { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function salvarAlertasConfig(payload) {
  return request('/alertas/config', { method: 'PUT', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function dispararAlertas(payload = {}) {
  return request('/alertas/disparar', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

async function getAlertasHistorico() {
  return request('/alertas/historico', { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function getPromissorias() {
  return request('/contas-receber/promissorias', { method: 'GET', query: { empresa_id: getEmpresaId() } });
}

async function previewPromissoria({ cliente_id, cliente_nome }) {
  return request('/alertas/preview-promissoria', { method: 'GET', query: { empresa_id: getEmpresaId(), cliente_id, cliente_nome } });
}

async function dispararAlertaPreventivo(payload = {}) {
  return request('/alertas/disparar-preventivo', { method: 'POST', body: { ...payload, empresa_id: getEmpresaId() } });
}

function setApiBaseUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Informe uma URL válida para a API.');
  }
  const trimmed = url.trim();
  if (!_validateApiUrl(trimmed)) {
    throw new Error('URL de API não permitida. Domínio não está na lista de hosts autorizados.');
  }
  localStorage.setItem('lf_erp_api_url', trimmed);
  API_CONFIG.BASE_URL = trimmed;
}

function getApiBaseUrl() {
  return API_CONFIG.BASE_URL;
}

function clearApiBaseUrl() {
  localStorage.removeItem('lf_erp_api_url');
  API_CONFIG.BASE_URL = 'https://lf-erp-backend.onrender.com';
}

// Método genérico GET — usado pelo módulo BI e outros que constroem URLs manualmente
async function get(path, query = {}) {
  return request(path, { method: 'GET', query });
}

const api = {
  config: API_CONFIG,
  request,
  get,
  fetchAPI,
  login,
  validateSession,
  refreshToken,
  getDashboard,
  getDashboardGrafico,
  getEmpresaStatus,
  getAlertas,
  updateMePerfil,

  getProdutos,
  createProduto,
  updateProduto,
  deleteProduto,

  getGradesProduto,
  createGrade,
  updateGrade,
  deleteGrade,
  toggleGrade,
  getAtributos,
  getTabelaPrecosDashboard,
  resolverPrecoTabela,

  getKitComponentes,
  addKitComponente,
  updateKitComponente,
  deleteKitComponente,
  toggleKit,
  getEstoqueKit,

  getImagensProduto,
  uploadImagemProduto,
  setPrincipalImagem,
  updateOrdemImagem,
  deletarImagem,

  getClientes,
  getClientesABC,
  createCliente,
  updateCliente,
  deleteCliente,

  getFornecedores,
  createFornecedor,
  updateFornecedor,
  deleteFornecedor,

  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,

  getVendas,
  getVendaDetalhe,
  createVenda,
  updateVenda,
  updateVendaObservacao,

  getCompras,
  getCompraDetalhe,
  createCompra,
  updateCompra,
  deleteCompra,

  getContasReceber,
  getHistoricoFinanceiroCliente,
  getContaReceberDetalhe,
  getContasReceberClientes,
  baixarContaReceber,
  estornarContaReceber,
  getOrigemVendaContaReceber,

  getContasPagar,
  getContaPagarDetalhe,
  getContasPagarFornecedores,
  pagarContaPagar,
  getOrigemCompraContaPagar,

  getFluxoCaixa,

  importarXmlNF,

  emitirNfce,
  consultarNfce,
  cancelarNfce,
  getNfceLista,
  getNfcePdf,

  getPixConfig,
  savePixConfig,
  gerarPIX,
  verificarStatusPIX,

  importarConciliacao,
  getConciliacoes,
  getConciliacaoItens,
  ignorarConciliacaoItem,
  criarLancamentoConciliacao,
  deleteConciliacao,

  getLancamentosFinanceiros,
  getLancamentoFinanceiroDetalhe,
  createLancamentoFinanceiro,
  updateLancamentoFinanceiro,
  pagarLancamentoFinanceiro,
  deleteLancamentoFinanceiro,

  getRelatorios,
  getRelatorioFinanceiroResumo,
  getRelatorioFinanceiroContasReceber,
  getRelatorioFinanceiroContasPagar,
  getRelatorioFinanceiroFluxoCaixa,
  getRelatorioFinanceiroLucratividade,
  getRelatorioVendasPorGrade,
  getRelatorioDRE,
  getRelatorioInadimplencia,

  getNfeConfig,
  salvarNfeConfig,
  emitirNfe,
  consultarNfe,
  cancelarNfe,
  getNfeLista,
  downloadNfePdf,
  downloadNfeXml,

  getOrcamentos,
  getOrcamento,
  createOrcamento,
  enviarOrcamento,
  aprovarOrcamento,
  recusarOrcamento,
  converterOrcamentoPedido,
  deleteOrcamento,
  configurarPortalCliente,
  togglePortalCliente,

  getPedidos,
  getPedido,
  confirmarPedido,
  separacaoPedido,
  cancelarPedido,
  converterPedidoVenda,

  getComissoesConfig,
  salvarComissaoConfig,
  deleteComissaoConfig,
  getComissoes,
  getComissoesResumo,
  pagarComissao,
  cancelarComissao,

  getCaixaSessaoAtiva,
  abrirCaixa,
  sangriaCaixa,
  suprimentoCaixa,
  fecharCaixa,
  getCaixaHistorico,

  getDevolucoes,
  registrarDevolucao,
  getDevolucoesDaVenda,
  getVendaDetalheParaDevolucao,

  getAlertasConfig,
  salvarAlertasConfig,
  dispararAlertas,
  getAlertasHistorico,
  getPromissorias,
  previewPromissoria,
  dispararAlertaPreventivo,

  getSseNonce,
  getAuthToken,
  getEmpresaId,
  getEmpresaNome,
  ensureEmpresa,
  ensureEmpresaId,
  getApiBaseUrl,
  setApiBaseUrl,
  clearApiBaseUrl,

  formatPlanError,
  warmupServer
};

window.LfErpApi = api;

function formatPlanError(error) {
  const message = error?.message || '';

  const isPlanError =
    error?.status === 403 &&
    (message.toLowerCase().includes('limite') ||
      message.toLowerCase().includes('plano') ||
      message.toLowerCase().includes('assinatura') ||
      message.toLowerCase().includes('trial') ||
      message.toLowerCase().includes('bloqueada'));

  if (!isPlanError) {
    return message || 'Não foi possível concluir a operação.';
  }

  return `${message} Para continuar, avalie alterar o plano da empresa.`;
}

export default api;
