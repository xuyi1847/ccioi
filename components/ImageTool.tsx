
import React, { useState } from 'react';
import { Image as ImageIcon, Loader2, Download, RefreshCw, Lock, Sparkles } from 'lucide-react';
import { generateImage, optimizePrompt as clientSideOptimize } from '../services/geminiService';
import { mockBackend } from '../services/mockBackend';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

const ImageTool: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { notify } = useNotification();
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimize = async () => {
    if (!prompt.trim() || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const optimized = await mockBackend.optimizePrompt('IMAGE', prompt, user?.token);
      setPrompt(optimized);
      notify.success("Prompt engineering complete.");
    } catch (error) {
      try {
        const optimized = await clientSideOptimize(prompt, 'IMAGE');
        setPrompt(optimized);
        notify.info("Optimized via local intelligence.");
      } catch (fallbackError) {
        notify.error("AI expansion failed. Check network.");
      }
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!user) {
      notify.error("Authentication required to access image cluster.");
      return;
    }
    if (!prompt) return;
    setIsGenerating(true);
    setResultImage(null);
    try {
      const dataUrl = await generateImage(prompt, aspectRatio);
      setResultImage(dataUrl);
      notify.success("Neural rendering successful.");
    } catch (error) {
      notify.error("Image synthesis failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
      <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        <div className="bg-app-surface/50 p-6 rounded-2xl border border-app-border shadow-xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center justify-between text-purple-400">
            <span className="flex items-center gap-2"><ImageIcon className="w-5 h-5" />{t('tool.image.title')}</span>
            <button onClick={handleOptimize} disabled={!prompt.trim() || isOptimizing} className="p-2 rounded-lg bg-app-surface-hover text-app-accent hover:text-white transition-all disabled:opacity-30 group" title="AI Optimize Prompt">
              {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />}
            </button>
          </h2>
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-app-subtext mb-2">{t('tool.image.prompt')}</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('tool.image.placeholder')} className="w-full bg-app-surface-hover border border-app-border rounded-xl p-3 text-app-text h-32 outline-none resize-none transition-all" />
              {isOptimizing && <div className="absolute inset-0 bg-app-surface/40 backdrop-blur-[1px] flex items-center justify-center rounded-xl pointer-events-none"><div className="flex items-center gap-2 text-app-accent font-bold text-xs"><Loader2 className="w-3 h-3 animate-spin" />Optimizing...</div></div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-app-subtext mb-2">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {['1:1', '16:9', '9:16'].map((ratio) => (
                  <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`p-2 rounded-lg text-sm font-medium transition-all ${aspectRatio === ratio ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'bg-app-surface-hover text-app-subtext hover:bg-app-surface-hover/80'}`}>{ratio}</button>
                ))}
              </div>
            </div>
            <button onClick={handleGenerate} disabled={isGenerating || !prompt} className={`w-full py-3 rounded-xl font-semibold shadow-lg flex items-center justify-center gap-2 transition-all ${!user ? 'bg-app-surface text-app-subtext border border-app-border cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white shadow-purple-900/30'}`}>
              {isGenerating ? <><Loader2 className="animate-spin w-5 h-5" /> {t('pay.processing')}</> : !user ? <><Lock className="w-5 h-5" /> Login Required</> : <><RefreshCw className="w-5 h-5" /> {t('tool.image.generate')}</>}
            </button>
          </div>
        </div>
      </div>
      <div className="lg:col-span-2 bg-app-base rounded-2xl border border-app-border flex items-center justify-center p-4 relative overflow-hidden min-h-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-app-base to-app-base pointer-events-none" />
        {isGenerating ? <div className="flex flex-col items-center gap-3 text-app-subtext animate-pulse"><Loader2 className="w-10 h-10 animate-spin text-purple-500" /><p>{t('pay.processing')}</p></div> :
          resultImage ? <div className="relative group max-w-full max-h-full flex items-center justify-center">
            <img src={resultImage} alt="Generated" className="rounded-lg shadow-2xl max-w-full max-h-full object-contain border border-app-border" />
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"><a href={resultImage} download={`nexus-image-${Date.now()}.png`} className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg backdrop-blur-md flex items-center gap-2"><Download className="w-5 h-5" /> {t('tool.image.download')}</a></div>
          </div> : <div className="text-center text-app-subtext"><ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-20" /><p>{t('tool.image.empty')}</p></div>
        }
      </div>
    </div>
  );
};

export default ImageTool;
