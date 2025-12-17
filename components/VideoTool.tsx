import React, { useState } from 'react';
import { Video, Loader2, Play, AlertCircle, Key } from 'lucide-react';
import { generateVideo } from '../services/geminiService';
import { useLanguage } from '../context/LanguageContext';

const VideoTool: React.FC = () => {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setVideoUri(null);
    setError(null);
    setStatusMsg(t('pay.processing'));

    try {
      const uri = await generateVideo(prompt, (msg) => setStatusMsg(msg));
      setVideoUri(uri);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate video");
    } finally {
      setIsGenerating(false);
      setStatusMsg("");
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
      } catch (e) {
        console.error("Error selecting key:", e);
      }
    }
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Controls */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        <div className="bg-app-surface/50 p-6 rounded-2xl border border-app-border shadow-xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-cyan-400">
            <Video className="w-5 h-5" />
            {t('tool.video.title')}
          </h2>

          <div className="bg-cyan-950/30 border border-cyan-900/50 rounded-lg p-3 mb-4 text-xs text-cyan-200">
             <p className="flex items-start gap-2">
               <Key className="w-4 h-4 shrink-0 mt-0.5" />
               <span>
                 {t('tool.video.billing')}
               </span>
             </p>
             <button 
               onClick={handleSelectKey}
               className="mt-2 text-xs bg-cyan-900/50 hover:bg-cyan-800 px-2 py-1 rounded border border-cyan-700"
             >
               {t('tool.video.manage_key')}
             </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-app-subtext mb-2">{t('tool.video.prompt')}</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('tool.video.placeholder')}
                className="w-full bg-app-surface-hover border border-app-border rounded-xl p-3 text-app-text h-32 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none resize-none"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-white shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 transition-all"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" /> {t('pay.processing')}
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" /> {t('tool.video.generate')}
                </>
              )}
            </button>
            {isGenerating && (
              <p className="text-xs text-center text-cyan-400 animate-pulse">{statusMsg}</p>
            )}
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:col-span-2 bg-app-base rounded-2xl border border-app-border flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/10 via-app-base to-app-base pointer-events-none" />
        
        {isGenerating ? (
          <div className="flex flex-col items-center gap-3 text-app-subtext animate-pulse">
            <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
            <p>{statusMsg}</p>
          </div>
        ) : videoUri ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <video 
              src={videoUri} 
              controls 
              autoPlay 
              loop
              className="rounded-lg shadow-2xl max-w-full max-h-[70vh] border border-app-border"
            />
          </div>
        ) : (
          <div className="text-center text-app-subtext">
            <Video className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>{t('tool.video.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoTool;