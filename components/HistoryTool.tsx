
import React, { useState, useEffect } from 'react';
import { History, Trash2, Download, Video, Calendar, Play, ExternalLink, RefreshCcw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { HistoryRecord } from '../types';

const HistoryTool: React.FC = () => {
  const { t } = useLanguage();
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    const saved = localStorage.getItem('ccioi_video_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setHistory(parsed.sort((a: any, b: any) => b.timestamp - a.timestamp));
      } catch (e) {
        console.error('Error loading history', e);
      }
    }
  };

  const deleteItem = (id: string) => {
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    localStorage.setItem('ccioi_video_history', JSON.stringify(updated));
  };

  const clearHistory = () => {
    if (confirm(t('tool.history.clear') + '?')) {
      setHistory([]);
      localStorage.removeItem('ccioi_video_history');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-app-text flex items-center gap-3">
            <History className="text-app-accent" size={28} />
            {t('tool.history.title')}
          </h2>
          <p className="text-app-subtext text-sm">
            {t('tool.history.video_count').replace('{{count}}', history.length.toString())}
          </p>
        </div>
        
        {history.length > 0 && (
          <button 
            onClick={clearHistory}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-all border border-red-500/20"
          >
            <RefreshCcw size={14} />
            {t('tool.history.clear')}
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-app-surface/30 rounded-3xl border border-app-border border-dashed">
          <div className="w-20 h-20 bg-app-base rounded-full flex items-center justify-center mb-6 text-app-subtext/20">
            <History size={40} />
          </div>
          <p className="text-app-subtext max-w-xs">{t('tool.history.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pr-2 custom-scrollbar pb-12">
          {history.map((item) => (
            <div key={item.id} className="group bg-app-surface/60 rounded-3xl border border-app-border overflow-hidden hover:border-app-accent/50 transition-all flex flex-col shadow-xl">
              {/* Video Preview */}
              <div className="aspect-[9/16] bg-black relative flex items-center justify-center overflow-hidden">
                <video 
                  src={item.url} 
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                  muted 
                  playsInline 
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={(e) => {
                    (e.target as HTMLVideoElement).pause();
                    (e.target as HTMLVideoElement).currentTime = 0;
                  }}
                />
                
                <div className="absolute top-4 right-4 flex gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                  <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-app-accent transition-colors"
                  >
                    <ExternalLink size={16} />
                  </a>
                  <button 
                    onClick={() => deleteItem(item.id)}
                    className="p-2.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                   <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white opacity-100 group-hover:opacity-0 transition-opacity">
                      <Play size={24} fill="white" className="ml-1" />
                   </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                  <div className="flex items-center gap-2 text-[10px] text-app-accent font-bold uppercase tracking-wider mb-1">
                    <Video size={10} /> {item.type.toUpperCase()}
                  </div>
                  <div className="text-[10px] text-white/60 font-mono flex items-center gap-1.5">
                    <Calendar size={10} /> {formatDate(item.timestamp)}
                  </div>
                </div>
              </div>

              {/* Info Area */}
              <div className="p-5 flex-1 flex flex-col">
                <p className="text-sm text-app-text font-medium line-clamp-3 mb-4 flex-1">
                  {item.prompt}
                </p>
                
                <div className="flex gap-2">
                  <a 
                    href={item.url} 
                    download 
                    className="flex-1 py-2.5 bg-app-base hover:bg-app-surface-hover border border-app-border rounded-xl text-xs font-bold text-app-text flex items-center justify-center gap-2 transition-all"
                  >
                    <Download size={14} /> {t('tool.image.download')}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryTool;
