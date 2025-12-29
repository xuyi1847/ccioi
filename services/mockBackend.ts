import { User } from '../types';

const API_BASE = 'https://ccioi.com/api';

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
    return user;
  },

  async register(email: string, name: string): Promise<User> {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration failed');
    }

    const user = await response.json();
    localStorage.setItem('ccioi_current_user_id', user.id);
    return user;
  },

  async logout(): Promise<void> {
    localStorage.removeItem('ccioi_current_user_id');
  },

  async getCurrentUser(): Promise<User | null> {
    const id = localStorage.getItem('ccioi_current_user_id');
    if (!id) return null;
    return null; // Force login for demo purposes to sync with Python state
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
  }
};
