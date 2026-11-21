const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001').replace(/\/+$/, '');
const TOKEN_KEY = 'notevault_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. If it was idle it may be waking up, try again in a moment.');
  }
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.errors ? ` (${Object.values(data.errors).join(', ')})` : '';
    const error = new Error(`${data.message || `Request failed (${res.status})`}${details}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const splitInterests = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);
