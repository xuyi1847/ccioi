import React, { useState } from 'react';
import { Image as ImageIcon, Loader2, Download, RefreshCw } from 'lucide-react';
import { generateImage } from '../services/geminiService';
import { useLanguage } from '../context/LanguageContext';

const ImageTool: React.FC = () => {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setResultImage(null);
    try {
      const dataUrl = await generateImage(prompt, aspectRatio);
      setResultImage(dataUrl);
    } catch (error) {
      console.error(error);
      alert("Failed to generate image.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Controls */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        <div className="bg-app-surface/50 p-6 rounded-2xl border border-app-border shadow-xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-purple-400">
            <ImageIcon className="w-5 h-5" />
            {t('tool.image.title')}
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-app-subtext mb-2">{t('tool.image.prompt')}</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('tool.image.placeholder')}
                className="w-full bg-app-surface-hover border border-app-border rounded-xl p-3 text-app-text h-32 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-app-subtext mb-2">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {['1:1', '16:9', '9:16'].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`p-2 rounded-lg text-sm font-medium transition-all ${
                      aspectRatio === ratio
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50'
                        : 'bg-app-surface-hover text-app-subtext hover:bg-app-surface-hover/80'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-white shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 transition-all"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" /> {t('pay.processing')}
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" /> {t('tool.image.generate')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:col-span-2 bg-app-base rounded-2xl border border-app-border flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-app-base to-app-base pointer-events-none" />
        
        {isGenerating ? (
          <div className="flex flex-col items-center gap-3 text-app-subtext animate-pulse">
            <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
            <p>{t('pay.processing')}</p>
          </div>
        ) : resultImage ? (
          <div className="relative group max-w-full max-h-full">
            <img 
              src={resultImage} 
              alt="Generated" 
              className="rounded-lg shadow-2xl max-w-full max-h-[70vh] object-contain border border-app-border"
            />
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <a 
                href={resultImage} 
                download={`nexus-image-${Date.now()}.png`}
                className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg backdrop-blur-md flex items-center gap-2"
              >
                <Download className="w-5 h-5" /> {t('tool.image.download')}
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center text-app-subtext">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>{t('tool.image.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageTool;