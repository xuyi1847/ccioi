import React, { useEffect, useState } from 'react';
import { Calendar, Download, ExternalLink, History, Loader2, Lock, Play, RefreshCcw, Trash2, Video, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { HistoryRecord } from '../types';
import { mockBackend } from '../services/mockBackend';

const normalizeTimestamp = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Date.now();
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
};

const HistoryTool: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { notify } = useNotification();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<HistoryRecord | null>(null);
  const [brokenVideos, setBrokenVideos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user) loadHistory();
  }, [user?.id]);

  useEffect(() => {
    if (!playingItem) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlayingItem(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [playingItem]);

  const loadHistory = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await mockBackend.getHistory(user.token);
      const mappedData: HistoryRecord[] = (data as any[])
        .map((item) => ({
          id: String(item.id || ''),
          prompt: item.prompt || '未保存提示词',
          url: item.video_url || item.url || '',
          timestamp: normalizeTimestamp(item.created_at ?? item.timestamp),
          type: item.video_url ? 'video' : (item.type || 'video'),
          params: item.params || {},
        }))
        .filter((item) => item.id && item.url);
      setHistory(mappedData.sort((a, b) => b.timestamp - a.timestamp));
      setBrokenVideos({});
    } catch (caught: any) {
      setError(caught.message || '加载历史记录失败');
      notify.error('加载历史记录失败');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!user || !confirm('确定删除该历史记录和视频文件吗？')) return;
    try {
      await mockBackend.deleteHistoryItem(user.token, id);
      setHistory((current) => current.filter((item) => item.id !== id));
      if (playingItem?.id === id) setPlayingItem(null);
      notify.success('历史记录已删除');
    } catch {
      notify.error('删除失败');
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  };

  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-app-surface/30 rounded-3xl border border-app-border border-dashed">
        <div className="w-20 h-20 bg-app-base rounded-full flex items-center justify-center mb-6 text-app-subtext/20"><Lock size={40} /></div>
        <h3 className="text-xl font-bold text-app-text mb-2">{t('tool.chat.login_required')}</h3>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-5 animate-fade-in tracking-tight">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-app-text flex items-center gap-3"><History className="text-app-accent" size={26} />{t('tool.history.title')}</h2>
          <p className="text-app-subtext text-xs sm:text-sm mt-1">{isLoading ? '正在同步…' : t('tool.history.video_count').replace('{{count}}', history.length.toString())}</p>
        </div>
        <button onClick={loadHistory} disabled={isLoading} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-app-surface-hover hover:bg-app-border text-app-text rounded-xl text-xs font-bold border border-app-border disabled:opacity-50">
          <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} /><span className="hidden sm:inline">刷新</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 sm:pr-2 pb-10">
        {isLoading && history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center"><Loader2 className="w-12 h-12 text-app-accent animate-spin opacity-30" /><p className="mt-4 text-app-subtext text-xs">正在读取历史记录…</p></div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-red-500/5 rounded-3xl border border-red-500/10"><p className="text-red-400 mb-4">{error}</p><button onClick={loadHistory} className="text-app-accent hover:underline text-sm font-bold">重试</button></div>
        ) : history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-app-surface/30 rounded-3xl border border-app-border border-dashed"><div className="w-20 h-20 bg-app-base rounded-full flex items-center justify-center mb-6 text-app-subtext/20"><Video size={40} /></div><p className="text-app-subtext max-w-xs">{t('tool.history.empty')}</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5 items-start">
            {history.map((item) => (
              <article key={item.id} className="group min-w-0 bg-app-surface/60 rounded-2xl border border-app-border overflow-hidden hover:border-app-accent/50 transition-all shadow-lg">
                <div className="aspect-video bg-black relative overflow-hidden">
                  <video
                    src={item.url}
                    className="w-full h-full object-contain"
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedData={(event) => { (event.currentTarget as HTMLVideoElement).currentTime = 0.01; }}
                    onError={() => setBrokenVideos((current) => ({ ...current, [item.id]: true }))}
                  />
                  <button type="button" onClick={() => setPlayingItem(item)} className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/30 transition-colors" aria-label="播放视频">
                    <span className="w-12 h-12 rounded-full bg-black/60 backdrop-blur border border-white/30 flex items-center justify-center text-white group-hover:scale-110 transition-transform"><Play size={21} fill="white" className="ml-0.5" /></span>
                  </button>
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="p-2 bg-black/70 rounded-full text-white hover:bg-app-accent"><ExternalLink size={13} /></a>
                    <button onClick={() => deleteItem(item.id)} className="p-2 bg-black/70 rounded-full text-white hover:bg-red-500"><Trash2 size={13} /></button>
                  </div>
                  {brokenVideos[item.id] && <div className="absolute inset-x-0 bottom-0 bg-red-950/90 text-red-300 text-[10px] px-3 py-2 text-center">预览加载失败，点击播放重试</div>}
                </div>
                <div className="p-4">
                  <p className="text-sm text-app-text font-medium line-clamp-2 min-h-10">{item.prompt}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-app-subtext">
                    <span className="flex items-center gap-1 truncate"><Calendar size={11} />{formatDate(item.timestamp)}</span>
                    <span className="text-app-accent font-bold uppercase shrink-0">{item.type}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setPlayingItem(item)} className="py-2 bg-app-accent hover:bg-app-accent-hover rounded-lg text-[11px] font-bold text-white flex items-center justify-center gap-1.5"><Play size={12} />播放</button>
                    <a href={item.url} download className="py-2 bg-app-base hover:bg-app-surface-hover border border-app-border rounded-lg text-[11px] font-bold text-app-text flex items-center justify-center gap-1.5"><Download size={12} />下载</a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {playingItem && (
        <div className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-8" onClick={() => setPlayingItem(null)}>
          <div className="w-full max-w-6xl max-h-full flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 mb-3 text-white">
              <div className="min-w-0"><div className="text-sm font-bold truncate">{playingItem.prompt}</div><div className="text-[10px] text-white/50 mt-1">{formatDate(playingItem.timestamp)}</div></div>
              <button onClick={() => setPlayingItem(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 shrink-0" aria-label="关闭"><X size={20} /></button>
            </div>
            <div className="min-h-0 bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <video key={playingItem.id} src={playingItem.url} className="w-full max-h-[78vh] object-contain" controls autoPlay playsInline preload="auto" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryTool;
