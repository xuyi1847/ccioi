
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
    
    const user = await response.json();
    localStorage.setItem('ccioi_current_user_id', user.id);
    localStorage.setItem('ccioi_current_user_data', JSON.stringify(user));
    return user;
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

    const user = await response.json();
    localStorage.setItem('ccioi_current_user_id', user.id);
    localStorage.setItem('ccioi_current_user_data', JSON.stringify(user));
    return user;
  },

  async logout(): Promise<void> {
    localStorage.removeItem('ccioi_current_user_id');
    localStorage.removeItem('ccioi_current_user_data');
  },

  async getCurrentUser(): Promise<User | null> {
    const id = localStorage.getItem('ccioi_current_user_id');
    const data = localStorage.getItem('ccioi_current_user_data');
    if (!id || !data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async addBalance(amount: number): Promise<number> {
    const id = localStorage.getItem('ccioi_current_user_id');
    if (!id) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/recharge/${id}?amount=${amount}`, {
      method: 'POST'
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
