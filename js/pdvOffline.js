import { showToast } from './feedback.js';

const PDV_DB_VERSION = 1;

let _empresaId = null;

export function setEmpresaId(id) {
  _empresaId = id ? String(id) : null;
}

function getDbName() {
  if (!_empresaId) {
    throw new Error('[PDV Offline] _empresaId não definido — chame setEmpresaId() antes de usar o módulo.');
  }
  return `lf_pdv_offline_${_empresaId}`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(getDbName(), PDV_DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('produtos')) {
        db.createObjectStore('produtos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('clientes')) {
        db.createObjectStore('clientes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('vendas_pendentes')) {
        db.createObjectStore('vendas_pendentes', { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function salvarProdutos(produtos) {
  try {
    const db = await openDB();
    const tx = db.transaction('produtos', 'readwrite');
    const store = tx.objectStore('produtos');
    store.clear();
    for (const p of produtos) store.put(p);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.error('[PDV Offline] salvarProdutos:', err);
    throw err;
  }
}

export async function getProdutos() {
  try {
    const db = await openDB();
    const req = db.transaction('produtos', 'readonly').objectStore('produtos').getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.warn('[PDV Offline] getProdutos:', err);
    return [];
  }
}

export async function salvarClientes(clientes) {
  try {
    const db = await openDB();
    const tx = db.transaction('clientes', 'readwrite');
    const store = tx.objectStore('clientes');
    store.clear();
    for (const c of clientes) store.put(c);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.error('[PDV Offline] salvarClientes:', err);
    throw err;
  }
}

export async function getClientes() {
  try {
    const db = await openDB();
    const req = db.transaction('clientes', 'readonly').objectStore('clientes').getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.warn('[PDV Offline] getClientes:', err);
    return [];
  }
}

export async function salvarVendaPendente(venda) {
  if (!_empresaId) {
    console.error('[PDV Offline] setEmpresaId() não foi chamado antes de salvarVendaPendente(). Dados serão salvos no DB padrão compartilhado.');
  }
  const idempotency_key = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${(performance.now() * 1e6 | 0).toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    const db = await openDB();
    const req = db.transaction('vendas_pendentes', 'readwrite')
      .objectStore('vendas_pendentes')
      .add({ ...venda, idempotency_key, _queued_at: new Date().toLocaleString('sv-SE', { timeZone: 'America/Fortaleza' }).replace(' ', 'T') });
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.warn('[PDV Offline] salvarVendaPendente:', err);
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      showToast('Armazenamento do dispositivo cheio. A venda offline não pôde ser salva. Conecte-se à internet e tente novamente.', 'error');
    }
    return null;
  }
}

export async function getVendasPendentes(limit = 100) {
  try {
    const db = await openDB();
    const req = db.transaction('vendas_pendentes', 'readonly').objectStore('vendas_pendentes').getAll(null, limit);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.warn('[PDV Offline] getVendasPendentes:', err);
    return [];
  }
}

export async function contarVendasPendentes() {
  try {
    const db = await openDB();
    const req = db.transaction('vendas_pendentes', 'readonly').objectStore('vendas_pendentes').count();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || 0); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    return 0;
  }
}

export async function removerVendaPendente(id) {
  try {
    const db = await openDB();
    const tx = db.transaction('vendas_pendentes', 'readwrite');
    tx.objectStore('vendas_pendentes').delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.warn('[PDV Offline] removerVendaPendente:', err);
  }
}

let _syncing = false;

export async function sincronizarVendas(postVendaFn) {
  if (_syncing) return { enviadas: 0, erros: 0 };
  _syncing = true;
  let enviadas = 0;
  let erros = 0;
  try {
    const pendentes = await getVendasPendentes(50);
    for (const venda of pendentes) {
      try {
        const { id: localId, _queued_at, ...payload } = venda;
        await postVendaFn(payload);
        await removerVendaPendente(localId);
        enviadas++;
      } catch (err) {
        console.error('[PDV Offline] sincronizarVendas: erro ao sincronizar venda:', err);
        erros++;
      }
    }
  } finally {
    _syncing = false;
  }
  return { enviadas, erros };
}

export { getVendasPendentes as listarVendasPendentes };
