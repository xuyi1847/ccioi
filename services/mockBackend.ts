
import { User, HistoryRecord } from '../types';

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = IS_DEV ? 'http://127.0.0.1:8000' : 'https://www.ccioi.com/api';

export const mockBackend = {
  async login(email: string): Promise<User> {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }
    
    const data = await response.json();
    // Assuming backend returns { user: User, token: string } or similar
    const userWithToken = data.token ? { ...data.user, token: data.token } : data;
    
    localStorage.setItem('ccioi_auth_token', userWithToken.token);
    localStorage.setItem('ccioi_current_user_data', JSON.stringify(userWithToken));
    return userWithToken;
  },

  async register(email: string, name: string, inviteCode: string): Promise<User> {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email, 
        name, 
        invite_code: inviteCode 
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration failed');
    }

    const data = await response.json();
    const userWithToken = data.token ? { ...data.user, token: data.token } : data;

    localStorage.setItem('ccioi_auth_token', userWithToken.token);
    localStorage.setItem('ccioi_current_user_data', JSON.stringify(userWithToken));
    return userWithToken;
  },

  async logout(): Promise<void> {
    localStorage.removeItem('ccioi_auth_token');
    localStorage.removeItem('ccioi_current_user_data');
  },

  async getCurrentUser(): Promise<User | null> {
    const data = localStorage.getItem('ccioi_current_user_data');
    if (!data) return null;
    try {
      const user = JSON.parse(data);
      const token = localStorage.getItem('ccioi_auth_token');
      if (token) user.token = token;
      return user;
    } catch {
      return null;
    }
  },

  async addBalance(token: string, amount: number): Promise<number> {
    const response = await fetch(`${API_BASE}/recharge?amount=${amount}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) throw new Error('Recharge failed');
    const data = await response.json();
    return data.new_balance;
  },

  async getHistory(token: string): Promise<HistoryRecord[]> {
    const response = await fetch(`${API_BASE}/history`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch history');
    }
    
    return await response.json();
  },

  async deleteHistoryItem(token: string, id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/history/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete history item');
    }
  }
};
