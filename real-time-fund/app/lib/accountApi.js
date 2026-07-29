const isDev = typeof window !== 'undefined'
  && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API_BASE = isDev ? 'http://127.0.0.1:8000' : 'https://www.ccioi.com/api';

const authHeaders = () => {
  const token = window.localStorage.getItem('ccioi_auth_token');
  if (!token) throw new Error('请先登录');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

const parseResponse = async (response) => {
  if (response.ok) return response.json();
  let message = '云端同步失败';
  try {
    const body = await response.json();
    message = body.detail || message;
  } catch { }
  throw new Error(message);
};

export const accountApi = {
  async getConfig() {
    return parseResponse(await fetch(`${API_BASE}/user-config`, {
      headers: authHeaders()
    }));
  },

  async saveConfig(data, partial = false) {
    return parseResponse(await fetch(`${API_BASE}/user-config`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ data, partial })
    }));
  }
};
