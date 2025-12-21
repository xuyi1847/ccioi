
import React from 'react';

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  CHAT = 'CHAT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  TEXT_ANALYSIS = 'TEXT_ANALYSIS',
}

export interface User {
  id: string;
  email: string;
  name: string;
  balance: number; // Stored in credits/tokens
  avatar?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
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
  // Fix: Added React import to resolve the 'React' namespace error
  icon: React.ComponentType<any>;
  color: string;
}