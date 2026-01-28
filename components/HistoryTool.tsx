
import React, { useState, useEffect } from 'react';
import { History, Trash2, Download, Video, Calendar, Play, ExternalLink, RefreshCcw, Loader2, Lock } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { HistoryRecord } from '../types';
import { mockBackend } from '../services/mockBackend';

const HistoryTool: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { notify } = useNotification();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (user) loadHistory(); }, [user]);

  const loadHistory = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await mockBackend.getHistory(user.token);
      const mappedData: HistoryRecord[] = (data as any[]).map(item => ({
        id: item.id, prompt: item.prompt, url: item.video_url || item.url,
        timestamp: item.created_at ? item.created_at * 1000 : (item.timestamp || Date.now()),
        type: item.video_url ? 'video' : (item.type || 'video'),
        params: item.params || {}
      }));
      setHistory(mappedData.sort((a, b) => b.timestamp - a.timestamp));
      notify.success("History log synced.");
    } catch (e: any) {
      setError(e.message || 'Failed to load history');
      notify.error("Failed to sync cloud history.");
    } finally { setIsLoading(false); }
  };

  const deleteItem = async (id: string) => {
    if (!user) return;
    // We can still use confirm for dangerous actions, but notify the result
    if (!confirm(t('tool.history.clear') + '?')) return;
    try {
      await mockBackend.deleteHistoryItem(user.token, id);
      setHistory(prev => prev.filter(item => item.id !== id));
      notify.success("Asset deleted from cloud storage.");
    } catch (e) { notify.error("Failed to delete asset."); }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  };

  if (!user) return <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-app-surface/30 rounded-3xl border border-app-border border-dashed"><div className="w-20 h-20 bg-app-base rounded-full flex items-center justify-center mb-6 text-app-subtext/20"><Lock size={40} /></div><h3 className="text-xl font-bold text-app-text mb-2">Access Restricted</h3><p className="text-app-subtext max-w-xs">Please login to view history.</p></div>;

  return (
    <div className="h-full flex flex-col gap-6 animate-fade-in overflow-hidden flex-1 tracking-tight">
      <div className="flex items-center justify-between shrink-0">
        <div><h2 className="text-2xl font-bold text-app-text flex items-center gap-3"><History className="text-app-accent" size={28} />{t('tool.history.title')}</h2>
          <p className="text-app-subtext text-sm">{isLoading ? 'Syncing...' : t('tool.history.video_count').replace('{{count}}', history.length.toString())}</p>
        </div>
        <button onClick={loadHistory} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-app-surface-hover hover:bg-app-border text-app-text rounded-xl text-xs font-bold border border-app-border disabled:opacity-50"><RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />{isLoading ? 'Loading' : 'Refresh'}</button>
      </div>
      {isLoading && history.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center"><Loader2 className="w-12 h-12 text-app-accent animate-spin opacity-20" /><p className="mt-4 text-app-subtext font-mono text-xs uppercase tracking-widest animate-pulse">Fetching Cloud Assets...</p></div> :
        error ? <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-red-500/5 rounded-3xl border border-red-500/10"><p className="text-red-400 mb-4">{error}</p><button onClick={loadHistory} className="text-app-accent hover:underline text-sm font-bold">Try Again</button></div> :
        history.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-app-surface/30 rounded-3xl border border-app-border border-dashed"><div className="w-20 h-20 bg-app-base rounded-full flex items-center justify-center mb-6 text-app-subtext/20"><Video size={40} /></div><p className="text-app-subtext max-w-xs">{t('tool.history.empty')}</p></div> :
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pr-2 custom-scrollbar pb-12 min-h-0">
          {history.map((item) => (
            <div key={item.id} className="group bg-app-surface/60 rounded-3xl border border-app-border overflow-hidden hover:border-app-accent/50 transition-all flex flex-col shadow-xl">
              <div className="aspect-[9/16] bg-black relative flex items-center justify-center overflow-hidden shrink-0">
                <video src={item.url} className="w-full h-full object-contain opacity-90" controls={false} muted playsInline onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => { const v = (e.target as HTMLVideoElement); v.pause(); v.currentTime = 0; }} />
                <div className="absolute top-4 right-4 flex gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all z-10">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-app-accent transition-colors"><ExternalLink size={16} /></a>
                  <button onClick={() => deleteItem(item.id)} className="p-2.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-red-500 transition-colors"><Trash2 size={16} /></button>
                </div>
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center"><div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white group-hover:opacity-0 transition-opacity"><Play size={24} fill="white" className="ml-1" /></div></div>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black pointer-events-none"><div className="text-[10px] text-app-accent font-bold uppercase tracking-wider mb-1"><Video size={10} className="inline mr-1" /> {item.type?.toUpperCase()}</div><div className="text-[10px] text-white/60 font-mono flex items-center gap-1.5"><Calendar size={10} /> {formatDate(item.timestamp)}</div></div>
              </div>
              <div className="p-5 flex-1 flex flex-col bg-app-surface/40"><p className="text-sm text-app-text font-medium line-clamp-3 mb-4 flex-1">{item.prompt}</p>
                <div className="flex gap-2"><a href={item.url} download className="flex-1 py-2.5 bg-app-base hover:bg-app-surface-hover border border-app-border rounded-xl text-xs font-bold text-app-text flex items-center justify-center gap-2 transition-all"><Download size={14} /> Download</a></div>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
};

export default HistoryTool;
