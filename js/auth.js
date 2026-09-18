import api from './api.js';

const AUTH_STORAGE_KEY = 'lf_erp_auth';

let _refreshTimerId = null;
let _refreshInProgress = false;

export function saveAuth(data, remember = false) {
  const empresaId =
    data?.empresa?.id || data?.empresaId || data?.empresa_id || data?.user?.empresa_id || null;

  const empresaNome =
    data?.empresa?.nome ||
    data?.empresa_nome ||
    data?.user?.empresa ||
    data?.user?.empresa_nome ||
    null;

  const payload = {
    authToken: data?.authToken || data?.token || null,
    empresaId,
    empresa: {
      id: empresaId,
      nome: empresaNome
    },
    user: {
      ...(data?.user || {}),
      empresa_id: empresaId,
      empresa: empresaNome
    }
  };

  if (remember) {
    // TTL de 30 dias — limita a janela de exposição em localStorage
    payload._expires_at = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } else {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function getAuth() {
  try {
    const localRaw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed._expires_at && Date.now() > parsed._expires_at) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } else {
        return parsed;
      }
    }
    const sessionRaw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return sessionRaw ? JSON.parse(sessionRaw) : null;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function isAuthenticated() {
  const auth = getAuth();
  return !!auth?.authToken;
}

export async function login(usuario, senha, remember = false, timeout) {
  const response = await api.login(usuario, senha, timeout);

  if (!response?.authToken && !response?.token) {
    throw new Error('Token não recebido do backend.');
  }

  saveAuth(response, remember);
  return response;
}

export async function validateSession(timeout) {
  try {
    return await api.validateSession(timeout);
  } catch (error) {
    // Não encerrar sessão em falha de rede — apenas em resposta 401/403 do servidor
    const status = error?.status;
    if (status === 401 || status === 403) {
      clearAuth();
    }
    throw error;
  }
}

export function logout() {
  _refreshInProgress = false;
  clearRefreshTimer();
  api.request('/auth/logout', { method: 'POST' }).catch(() => {});
  clearAuth();
}

export function clearRefreshTimer() {
  if (_refreshTimerId) {
    clearTimeout(_refreshTimerId);
    _refreshTimerId = null;
  }
}

export function scheduleTokenRefresh() {
  clearRefreshTimer();

  const auth = getAuth();
  if (!auth?.authToken) return;

  try {
    const parts = auth.authToken.split('.');
    if (parts.length !== 3) return;

    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    if (!payload.exp) return;

    const msUntilExpiry = payload.exp * 1000 - Date.now();
    const msUntilRefresh = msUntilExpiry - 2 * 60 * 1000; // 2 min antes

    if (msUntilRefresh <= 0) {
      _doRefresh();
      return;
    }

    _refreshTimerId = setTimeout(_doRefresh, msUntilRefresh);
  } catch {
    // Token malformado — não agenda
  }
}

async function _doRefresh() {
  if (_refreshInProgress) return;
  if (!getAuth()?.authToken) return; // sessão encerrada — não re-agendar
  _refreshInProgress = true;
  _refreshTimerId = null;
  try {
    const data = await api.refreshToken();
    const newToken = data?.token || data?.authToken;
    if (!newToken) { scheduleTokenRefresh(); return; }

    const auth = getAuth();
    const isLocal = !!localStorage.getItem(AUTH_STORAGE_KEY);
    const updated = {
      ...auth,
      authToken: newToken,
      token: newToken,
      ...(isLocal ? { _expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000 } : {})
    };
    if (isLocal) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
    }

    scheduleTokenRefresh();
  } catch {
    scheduleTokenRefresh();
  } finally {
    _refreshInProgress = false;
  }
}
