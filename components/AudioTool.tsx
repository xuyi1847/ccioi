import React, { useState } from 'react';
import { Mic, Loader2, Volume2, PlayCircle } from 'lucide-react';
import { generateSpeech } from '../services/geminiService';
import { decodeAudioData, playAudioBuffer } from '../services/audioUtils';
import { useLanguage } from '../context/LanguageContext';

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

const AudioTool: React.FC = () => {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const handleGenerate = async () => {
    if (!text) return;
    setIsGenerating(true);
    setAudioBuffer(null);
    try {
      const rawData = await generateSpeech(text, selectedVoice);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const buffer = await decodeAudioData(rawData, ctx, 24000, 1);
      setAudioBuffer(buffer);
      playAudioBuffer(ctx, buffer);
    } catch (error) {
      console.error(error);
      alert("Failed to generate speech");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayAgain = () => {
    if (audioBuffer) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      playAudioBuffer(ctx, audioBuffer);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-app-surface/50 p-6 rounded-2xl border border-app-border shadow-xl">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-rose-400">
          <Mic className="w-5 h-5" />
          {t('tool.audio.title')}
        </h2>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
             {VOICES.map(voice => (
               <button
                key={voice}
                onClick={() => setSelectedVoice(voice)}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                  selectedVoice === voice 
                    ? 'bg-rose-900/30 border-rose-500/50 text-rose-200' 
                    : 'bg-app-surface-hover border-app-border text-app-subtext hover:bg-app-surface-hover/80'
                }`}
               >
                 <Volume2 className="w-4 h-4 mb-1" />
                 <span className="text-sm font-medium">{voice}</span>
               </button>
             ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-app-subtext mb-2">{t('tool.audio.prompt')}</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('tool.audio.placeholder')}
              className="w-full bg-app-surface-hover border border-app-border rounded-xl p-4 text-app-text h-32 focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none resize-none text-lg"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !text}
              className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-white shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 transition-all"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" /> {t('pay.processing')}
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" /> {t('tool.audio.generate')}
                </>
              )}
            </button>

            {audioBuffer && (
               <button 
                 onClick={handlePlayAgain}
                 className="px-6 py-3 bg-app-surface-hover hover:bg-app-surface-hover/80 text-app-text rounded-xl flex items-center gap-2 transition-colors border border-app-border"
               >
                 <PlayCircle className="w-5 h-5" /> {t('tool.audio.replay')}
               </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Visualizer Placeholder */}
      <div className="h-24 bg-app-base border border-app-border rounded-xl flex items-center justify-center overflow-hidden relative">
         <div className={`flex items-center gap-1 ${isGenerating || audioBuffer ? 'opacity-100' : 'opacity-20'}`}>
            {[...Array(20)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-2 bg-rose-500 rounded-full animate-pulse" 
                  style={{
                    height: `${Math.random() * 40 + 10}px`,
                    animationDelay: `${i * 0.1}s`
                  }}
                />
            ))}
         </div>
      </div>
    </div>
  );
};

export default AudioTool;