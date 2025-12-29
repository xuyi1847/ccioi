import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { mockBackend } from '../services/mockBackend';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  // Fix: Added inviteCode parameter to register signature
  register: (email: string, name: string, inviteCode: string) => Promise<void>;
  logout: () => Promise<void>;
  recharge: (amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const u = await mockBackend.getCurrentUser();
      setUser(u);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string) => {
    const u = await mockBackend.login(email);
    setUser(u);
  };

  // Fix: Added inviteCode parameter and passed it to mockBackend.register
  const register = async (email: string, name: string, inviteCode: string) => {
    const u = await mockBackend.register(email, name, inviteCode);
    setUser(u);
  };

  const logout = async () => {
    await mockBackend.logout();
    setUser(null);
  };

  const recharge = async (amount: number) => {
    const newBalance = await mockBackend.addBalance(amount);
    if (user) {
      setUser({ ...user, balance: newBalance });
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, recharge }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within a AuthProvider');
  }
  return context;
};