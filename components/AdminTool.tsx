import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Ban, CheckCircle2, Loader2, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { mockBackend } from '../services/mockBackend';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'super_admin';
  enabled: boolean;
  balance: number;
  invite_code?: string;
  created_at: string;
  last_active_at?: string;
  operation_count: number;
  generation_count: number;
  module_permissions: Record<string, boolean>;
}

interface Operation {
  id: number;
  method: string;
  path: string;
  status_code: number;
  created_at: string;
  detail?: Record<string, unknown>;
}

const formatTime = (value?: string) => value ? new Date(value).toLocaleString() : '暂无';
const MODULES = [
  ['chat', '对话'], ['image', '图片'], ['video', '视频'], ['audio', '音频'],
  ['text', '文本'], ['geo', 'GEO'], ['fund', '基金'], ['history', '历史'],
] as const;

const AdminTool: React.FC = () => {
  const { user } = useAuth();
  const { notify } = useNotification();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [permissionUser, setPermissionUser] = useState<AdminUser | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({});
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  const loadUsers = async () => {
    if (!user || user.role !== 'super_admin') return;
    setLoading(true);
    try {
      setUsers(await mockBackend.getAdminUsers(user.token));
    } catch (error: any) {
      notify.error(error.message || '用户列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [user?.id]);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(keyword));
  }, [users, query]);

  const showOperations = async (item: AdminUser) => {
    if (!user) return;
    setSelected(item);
    setOperations([]);
    setOperationsLoading(true);
    try {
      setOperations(await mockBackend.getAdminUserOperations(user.token, item.id));
    } catch (error: any) {
      notify.error(error.message || '使用记录加载失败');
    } finally {
      setOperationsLoading(false);
    }
  };

  const toggleUser = async (item: AdminUser) => {
    if (!user || item.role === 'super_admin') return;
    const nextEnabled = !item.enabled;
    if (!confirm(`确定${nextEnabled ? '启用' : '停用'}账号 ${item.email} 吗？`)) return;
    setUpdatingId(item.id);
    try {
      await mockBackend.setAdminUserEnabled(user.token, item.id, nextEnabled);
      setUsers((current) => current.map((entry) => entry.id === item.id ? { ...entry, enabled: nextEnabled } : entry));
      notify.success(`账号已${nextEnabled ? '启用' : '停用'}`);
    } catch (error: any) {
      notify.error(error.message || '账号状态更新失败');
    } finally {
      setUpdatingId('');
    }
  };

  const openPermissions = (item: AdminUser) => {
    setPermissionUser(item);
    setPermissionDraft({ ...item.module_permissions });
  };

  const savePermissions = async () => {
    if (!user || !permissionUser) return;
    setPermissionsSaving(true);
    try {
      await mockBackend.setAdminUserPermissions(user.token, permissionUser.id, permissionDraft);
      setUsers((current) => current.map((item) => item.id === permissionUser.id ? { ...item, module_permissions: { ...permissionDraft } } : item));
      notify.success('板块权限已更新');
      setPermissionUser(null);
    } catch (error: any) {
      notify.error(error.message || '权限更新失败');
    } finally {
      setPermissionsSaving(false);
    }
  };

  if (!user || user.role !== 'super_admin') {
    return <div className="h-full flex items-center justify-center text-app-subtext">无管理员访问权限</div>;
  }

  const enabledCount = users.filter((item) => item.enabled).length;

  return (
    <div className="h-full min-h-0 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div><h2 className="text-2xl font-bold text-app-text flex items-center gap-2"><ShieldCheck className="text-cyan-400" />管理员控制台</h2><p className="text-xs text-app-subtext mt-1">管理注册用户、账号状态和使用记录</p></div>
        <button onClick={loadUsers} disabled={loading} className="p-2.5 rounded-xl border border-app-border bg-app-surface hover:bg-app-surface-hover text-app-text"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {[['注册用户', users.length, Users], ['启用账号', enabledCount, CheckCircle2], ['停用账号', users.length - enabledCount, Ban], ['生成总数', users.reduce((sum, item) => sum + Number(item.generation_count || 0), 0), Activity]].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-app-border bg-app-surface/60 p-4"><Icon size={17} className="text-cyan-400 mb-2" /><div className="text-2xl font-bold text-app-text">{value}</div><div className="text-[10px] text-app-subtext">{label}</div></div>)}
      </div>

      <div className="relative shrink-0"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名或邮箱" className="w-full bg-app-surface border border-app-border rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-app-accent" /></div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar rounded-2xl border border-app-border bg-app-surface/50">
        {loading ? <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-cyan-400" /></div> : <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-app-base text-app-subtext"><tr><th className="p-3">用户</th><th className="p-3">状态</th><th className="p-3">注册时间</th><th className="p-3">最近使用</th><th className="p-3">生成</th><th className="p-3">操作次数</th><th className="p-3 text-right">管理</th></tr></thead>
          <tbody>{filteredUsers.map((item) => <tr key={item.id} className="border-t border-app-border hover:bg-app-surface-hover/40"><td className="p-3"><div className="font-bold text-app-text">{item.name} {item.role === 'super_admin' && <span className="ml-1 text-[9px] text-cyan-400">超级管理员</span>}</div><div className="text-[10px] text-app-subtext">{item.email}</div></td><td className="p-3"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${item.enabled ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{item.enabled ? '使用中' : '已停用'}</span></td><td className="p-3 text-app-subtext whitespace-nowrap">{formatTime(item.created_at)}</td><td className="p-3 text-app-subtext whitespace-nowrap">{formatTime(item.last_active_at)}</td><td className="p-3 font-bold text-app-text">{item.generation_count || 0}</td><td className="p-3 font-bold text-app-text">{item.operation_count || 0}</td><td className="p-3"><div className="flex justify-end gap-2"><button onClick={() => openPermissions(item)} disabled={item.role === 'super_admin'} className="px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-30">板块权限</button><button onClick={() => showOperations(item)} className="px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-surface-hover text-app-text">使用记录</button><button onClick={() => toggleUser(item)} disabled={item.role === 'super_admin' || updatingId === item.id} className={`px-3 py-1.5 rounded-lg font-bold disabled:opacity-30 ${item.enabled ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}>{updatingId === item.id ? '处理中' : item.enabled ? '停用' : '启用'}</button></div></td></tr>)}</tbody>
        </table>}
      </div>

      {selected && <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}><div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-app-border bg-app-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="p-4 border-b border-app-border flex items-center justify-between"><div><div className="font-bold text-app-text">{selected.name} 的使用记录</div><div className="text-[10px] text-app-subtext">{selected.email}</div></div><button onClick={() => setSelected(null)} className="p-2 text-app-subtext hover:text-app-text"><X size={18} /></button></div><div className="flex-1 overflow-auto custom-scrollbar">{operationsLoading ? <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-cyan-400" /></div> : operations.length ? <table className="w-full min-w-[650px] text-xs"><thead className="bg-app-base text-app-subtext"><tr><th className="p-3 text-left">时间</th><th className="p-3 text-left">方式</th><th className="p-3 text-left">操作路径</th><th className="p-3 text-left">状态</th></tr></thead><tbody>{operations.map((entry) => <tr key={entry.id} className="border-t border-app-border"><td className="p-3 whitespace-nowrap">{formatTime(entry.created_at)}</td><td className="p-3 font-mono">{entry.method}</td><td className="p-3 font-mono text-[11px]">{entry.path}</td><td className={`p-3 font-bold ${entry.status_code < 400 ? 'text-green-400' : 'text-red-400'}`}>{entry.status_code}</td></tr>)}</tbody></table> : <div className="p-12 text-center text-app-subtext">暂无使用记录</div>}</div></div></div>}
      {permissionUser && <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPermissionUser(null)}><div className="w-full max-w-lg rounded-2xl border border-app-border bg-app-surface shadow-2xl p-5" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between mb-5"><div><div className="font-bold text-app-text">板块使用权限</div><div className="text-[10px] text-app-subtext mt-1">{permissionUser.name} · {permissionUser.email}</div></div><button onClick={() => setPermissionUser(null)} className="p-2 text-app-subtext hover:text-app-text"><X size={18} /></button></div><div className="grid grid-cols-2 gap-3">{MODULES.map(([key, label]) => <button key={key} onClick={() => setPermissionDraft((current) => ({ ...current, [key]: !current[key] }))} className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold ${permissionDraft[key] !== false ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}><span>{label}</span><span className="text-[10px]">{permissionDraft[key] !== false ? '允许' : '禁止'}</span></button>)}</div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setPermissionUser(null)} className="px-4 py-2 rounded-xl border border-app-border text-app-subtext">取消</button><button onClick={savePermissions} disabled={permissionsSaving} className="px-4 py-2 rounded-xl bg-app-accent text-white font-bold disabled:opacity-50">{permissionsSaving ? '保存中…' : '保存权限'}</button></div></div></div>}
    </div>
  );
};

export default AdminTool;
