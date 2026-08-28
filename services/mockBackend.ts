
import { User, HistoryRecord } from '../types';

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = IS_DEV ? 'http://127.0.0.1:8000' : 'https://www.ccioi.com/api';

export const mockBackend = {
  async login(email: string, password: string): Promise<User> {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }
    
    const data = await response.json();
    const userWithToken = data.token ? { ...data.user, token: data.token } : data;
    
    localStorage.setItem('ccioi_auth_token', userWithToken.token);
    localStorage.setItem('ccioi_current_user_data', JSON.stringify(userWithToken));
    return userWithToken;
  },

  async register(email: string, password: string, name: string, inviteCode: string): Promise<User> {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email, 
        password,
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
    const token = localStorage.getItem('ccioi_auth_token');
    if (!token) return null;
    try {
      const response = await fetch(`${API_BASE}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        await this.logout();
        return null;
      }
      const data = await response.json();
      const user = { ...data.user, token };
      localStorage.setItem('ccioi_current_user_data', JSON.stringify(user));
      return user;
    } catch {
      const cached = localStorage.getItem('ccioi_current_user_data');
      if (!cached) return null;
      return { ...JSON.parse(cached), token };
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

  async getAdminHistory(token: string): Promise<HistoryRecord[]> {
    const response = await fetch(`${API_BASE}/admin/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch all generation records');
    return await response.json();
  },

  async getShowcase(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/showcase`);
    if (!response.ok) throw new Error('Failed to fetch homepage showcase');
    return await response.json();
  },

  async setShowcaseItem(token: string, taskId: string, featured: boolean): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/showcase/${taskId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update homepage showcase');
    }
  },

  async getDramaProjects(token: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/drama/projects`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok) throw new Error('短剧项目加载失败');
    return await response.json();
  },

  async saveDramaProject(token: string, project: any): Promise<any> {
    const response = await fetch(`${API_BASE}/drama/projects`, {
      method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
    if (!response.ok) throw new Error('短剧项目保存失败');
    return await response.json();
  },

  async deleteDramaProject(token: string, projectId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/drama/projects/${projectId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok) throw new Error('短剧项目删除失败');
  },

  async generateDramaStoryboard(token: string, payload: any): Promise<any[]> {
    const response = await fetch(`${API_BASE}/drama/storyboard`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'AI分镜生成失败'); }
    const data = await response.json();
    return data.shots || [];
  },

  async exportDrama(token: string, projectId: string, shotUrls: string[]): Promise<string> {
    const response = await fetch(`${API_BASE}/drama/export`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, shot_urls: shotUrls })
    });
    if (!response.ok) { const error = await response.json(); throw new Error(error.detail || '成片导出失败'); }
    return (await response.json()).public_url;
  },

  async extractDramaEndingFrame(token: string, videoUrl: string): Promise<string> {
    const response = await fetch(`${API_BASE}/drama/ending-frame`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: videoUrl })
    });
    if (!response.ok) { const error = await response.json(); throw new Error(error.detail || '尾帧提取失败'); }
    return (await response.json()).public_url;
  },

  async getAdminOperations(token: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/operations?limit=500`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch operation records');
    return await response.json();
  },

  async getAdminUsers(token: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    return await response.json();
  },

  async setAdminUserEnabled(token: string, userId: string, enabled: boolean): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update user');
    }
  },

  async getAdminUserOperations(token: string, userId: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/operations?limit=500`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch user operations');
    return await response.json();
  },

  async setAdminUserPermissions(token: string, userId: string, permissions: Record<string, boolean>): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/permissions`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update permissions');
    }
  },

  async getVideoApiKeys(token: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/video-api/keys`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('API Key 列表加载失败');
    return response.json();
  },

  async createVideoApiKey(token: string, name: string): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/video-api/keys`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || 'API Key 创建失败');
    return response.json();
  },

  async setVideoApiKeyEnabled(token: string, keyId: string, enabled: boolean): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/video-api/keys/${keyId}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) throw new Error('API Key 状态更新失败');
  },

  async getVideoApiTasks(token: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/video-api/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('外部 API 任务加载失败');
    return response.json();
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
  },

  /**
   * 调用后端优化提示词接口
   */
  async optimizePrompt(type: 'IMAGE' | 'VIDEO', prompt: string, token?: string): Promise<string> {
    const response = await fetch(`${API_BASE}/optimizePrompt`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ type, prompt })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Optimization failed');
    }

    const data = await response.json();
    // 假设返回格式为 { optimized_prompt: "..." } 或直接返回字符串
    return data.optimized_prompt || data.prompt || data;
  }
};
