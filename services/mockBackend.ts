import { User } from '../types';

const USERS_KEY = 'ccioi_users';
const CURRENT_USER_KEY = 'ccioi_current_user_id';

// Helper to delay execution (simulate network latency)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockBackend = {
  async login(email: string): Promise<User> {
    await delay(800);
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find((u: User) => u.email === email);
    
    if (!user) {
      throw new Error('User not found. Please register.');
    }
    
    localStorage.setItem(CURRENT_USER_KEY, user.id);
    return user;
  },

  async register(email: string, name: string): Promise<User> {
    await delay(1000);
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    
    if (users.find((u: User) => u.email === email)) {
      throw new Error('Email already exists.');
    }

    const newUser: User = {
      id: Date.now().toString(),
      email,
      name,
      balance: 50, // Sign up bonus
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`
    };

    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);
    return newUser;
  },

  async logout(): Promise<void> {
    await delay(300);
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  async getCurrentUser(): Promise<User | null> {
    await delay(200);
    const id = localStorage.getItem(CURRENT_USER_KEY);
    if (!id) return null;

    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    return users.find((u: User) => u.id === id) || null;
  },

  async addBalance(amount: number): Promise<number> {
    await delay(2000); // Simulate payment processing time
    const id = localStorage.getItem(CURRENT_USER_KEY);
    if (!id) throw new Error('Not authenticated');

    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const userIndex = users.findIndex((u: User) => u.id === id);
    
    if (userIndex === -1) throw new Error('User not found');

    users[userIndex].balance += amount;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    
    return users[userIndex].balance;
  }
};