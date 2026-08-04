
import React from 'react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  CHAT = 'CHAT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  TEXT_ANALYSIS = 'TEXT_ANALYSIS',
  HISTORY = 'HISTORY',
  ADMIN = 'ADMIN',
  SHORT_DRAMA = 'SHORT_DRAMA',
  AMAZON_POLLUTION = 'AMAZON_POLLUTION',
  QUANTITATIVE_ANALYSIS = 'QUANTITATIVE_ANALYSIS',
}

export interface User {
  id: string;
  email: string;
  name: string;
  balance: number; // Stored in credits/tokens
  token: string;   // JWT token containing user info
  avatar?: string;
  role: 'user' | 'super_admin';
  enabled: boolean;
  module_permissions: Record<'chat' | 'image' | 'video' | 'audio' | 'text' | 'geo' | 'fund' | 'history' | 'drama', boolean>;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface HistoryRecord {
  id: string;
  type: 'video' | 'image';
  prompt: string;
  url: string;
  timestamp: number;
  params?: any;
  user_id?: string;
  user_email?: string;
  user_name?: string;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}

export interface GeneratedVideo {
  uri: string;
  prompt: string;
}

export interface TextAnalysisResult {
  summary?: string;
  sentiment?: string;
  keywords?: string[];
  actionItems?: string[];
}

export interface ToolConfig {
  id: AppView;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
}
