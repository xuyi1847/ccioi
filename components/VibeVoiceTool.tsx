
import React, { useState, useRef, useEffect } from 'react';
import { 
  Radio, 
  Loader2, 
  Play, 
  Square, 
  Volume2, 
  Users, 
  Sliders, 
  FileText, 
  Lock, 
  Server,
  Download,
  Activity,
  User as UserIcon
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

const DEFAULT_VOICES = [
  'en-Alice_woman', 
  'en-Carter_man', 
  'en-Frank_man', 
  'en-Maya_woman',
  'zh-Xiaoxiao',
  'zh-Yunxi'
];

const VibeVoiceTool: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  
  const [numSpeakers, setNumSpeakers] = useState(2);
  const [speakers, setSpeakers] = useState<string[]>(['en-Alice_woman', 'en-Carter_man', '', '']);
  const [cfgScale, setCfgScale] = useState(1.3);
  const [script, setScript] = useState('');
  const [apiUrl, setApiUrl] = useState('http://localhost:7860');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [resultAudio, setResultAudio] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progressLog]);

  const handleSpeakerChange = (index: number, value: string) => {
    const newSpeakers = [...speakers];
    newSpeakers[index] = value;
    setSpeakers(newSpeakers);
  };

  const handleGenerate = async () => {
    if (!user) return;
    if (!script.trim()) return;

    setIsGenerating(true);
    setResultAudio(null);
    setProgressLog(['🎙️ Initiating VibeVoice Dialogue Session...']);
    setStatusMessage('Connecting to backend cluster...');

    try {
      // Note: This matches the structure of the Gradio API for the provided code.
      // Usually Gradio uses /api/predict or /run/predict.
      // Since this is a specialized local integration, we use the standard Gradio client pattern.
      
      const payload = {
        data: [
          numSpeakers,
          script,
          speakers[0] || null,
          speakers[1] || null,
          speakers[2] || null,
          speakers[3] || null,
          cfgScale
        ]
      };

      const response = await fetch(`${apiUrl}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Backend connection failed');

      const result = await response.json();
      
      // Gradio usually returns data in the 'data' array
      // In the provided Python code, the last yields include audio results.
      // We assume index 1 contains the complete audio path/data.
      if (result.data && result.data.length > 0) {
        // Extracting audio URL. Gradio returns file objects usually.
        const audioData = result.data[1]; 
        if (audioData && audioData.url) {
          setResultAudio(`${apiUrl}/file=${audioData.name}`);
          setProgressLog(prev => [...prev, '✅ Generation successful. Complete audio is ready.']);
        } else if (typeof audioData === 'string' && audioData.startsWith('data:')) {
          setResultAudio(audioData);
          setProgressLog(prev => [...prev, '✅ Generation successful. Base64 audio loaded.']);
        }
      }
    } catch (err) {
      console.error(err);
      setProgressLog(prev => [...prev, '❌ Error: Failed to communicate with local VibeVoice server. Ensure it is running at the specified URL.']);
    } finally {
      setIsGenerating(false);
      setStatusMessage(null);
    }
  };

  const handleStop = () => {
    // Gradio doesn't always support easy cancellation via REST, 
    // but we can at least stop the UI state.
    setIsGenerating(false);
    setProgressLog(prev => [...prev, '🛑 Session terminated by user.']);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-1 overflow-hidden flex-1">
      {/* Parameters Panel */}
      <div className="w-full lg:w-[360px] flex flex-col gap-4 overflow-y-auto custom-scrollbar lg:shrink-0 min-h-0">
        <div className="bg-app-surface/60 p-6 rounded-[2rem] border border-app-border shadow-2xl backdrop-blur-md">
          <h2 className="text-sm font-bold text-violet-400 mb-6 uppercase tracking-widest flex items-center gap-2">
            <Radio className="w-4 h-4" /> {t('tool.vibevoice.title')}
          </h2>

          <div className="space-y-6">
            <div className="bg-app-base/40 p-3 rounded-2xl border border-app-border">
              <label className="text-[9px] text-app-subtext uppercase font-bold tracking-widest block mb-1.5 flex items-center gap-1">
                <Server size={10} /> {t('tool.vibevoice.api')}
              </label>
              <input 
                type="text" 
                value={apiUrl} 
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full bg-transparent text-[11px] text-app-text outline-none font-mono"
                placeholder="http://localhost:7860"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest flex items-center gap-2">
                  <Users size={14} /> {t('tool.vibevoice.speakers')}
                </label>
                <span className="text-xs font-mono text-violet-400">{numSpeakers}</span>
              </div>
              <input 
                type="range" min="1" max="4" step="1" 
                value={numSpeakers} 
                onChange={(e) => setNumSpeakers(parseInt(e.target.value))}
                className="w-full h-1.5 bg-app-border rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              
              <div className="grid grid-cols-2 gap-3">
                {[...Array(numSpeakers)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <label className="text-[9px] font-bold text-app-subtext uppercase tracking-wider block">Speaker {i+1}</label>
                    <select 
                      value={speakers[i]} 
                      onChange={(e) => handleSpeakerChange(i, e.target.value)}
                      className="w-full bg-app-base border border-app-border rounded-xl p-2 text-[10px] text-app-text outline-none focus:border-violet-500 transition-colors"
                    >
                      <option value="">Select Voice...</option>
                      {DEFAULT_VOICES.map(v => <option key={v} value={v}>{v.split('-').pop()}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest flex items-center gap-2">
                  <Sliders size={14} /> {t('tool.vibevoice.cfg')}
                </label>
                <span className="text-xs font-mono text-violet-400">{cfgScale}</span>
              </div>
              <input 
                type="range" min="1.0" max="2.0" step="0.05" 
                value={cfgScale} 
                onChange={(e) => setCfgScale(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-app-border rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>

            <button 
              onClick={isGenerating ? handleStop : handleGenerate} 
              disabled={!user || !script.trim()} 
              className={`w-full py-4 rounded-2xl font-bold uppercase text-[11px] tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                !user 
                ? 'bg-app-surface text-app-subtext cursor-not-allowed border border-app-border' 
                : isGenerating 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-900/40 hover:from-violet-500 hover:to-indigo-500'
              }`}
            >
              {isGenerating ? <Loader2 className="animate-spin w-4 h-4" /> : isGenerating ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              {!user ? 'Login Required' : isGenerating ? t('tool.vibevoice.stop') : t('tool.vibevoice.generate')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6 min-h-0">
        <div className="bg-app-surface/30 rounded-[2.5rem] border border-app-border flex-1 flex flex-col min-h-0 relative overflow-hidden backdrop-blur-sm">
          
          <div className="flex-1 flex flex-col p-8 gap-6 overflow-hidden min-h-0">
            <div className="flex flex-col gap-2 shrink-0">
              <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} /> {t('tool.vibevoice.script')}
              </label>
              <textarea 
                value={script} 
                onChange={(e) => setScript(e.target.value)}
                placeholder={t('tool.vibevoice.placeholder')}
                className="w-full bg-black/40 border border-app-border rounded-3xl p-6 text-[13px] text-white h-48 outline-none focus:border-violet-500 transition-all font-mono resize-none leading-relaxed placeholder:text-app-subtext/20" 
              />
            </div>

            <div className="flex-1 flex flex-col min-h-0 gap-6">
              <div className="flex-1 bg-black/60 border border-white/5 rounded-[2rem] overflow-hidden flex flex-col shadow-inner">
                <div className="bg-white/5 px-6 py-3 flex items-center justify-between border-b border-white/5">
                  <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} /> Telemetry Log
                  </div>
                  {isGenerating && <Loader2 size={12} className="animate-spin text-violet-400" />}
                </div>
                <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed custom-scrollbar text-violet-100/60">
                  {progressLog.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20">
                      <Radio size={48} strokeWidth={1} />
                      <p className="mt-4 uppercase tracking-[0.3em]">Standby for Audio Synthesis</p>
                    </div>
                  ) : (
                    progressLog.map((log, i) => (
                      <div key={i} className="mb-2 animate-fade-in">
                        <span className="opacity-30 mr-3">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>

              {resultAudio && (
                <div className="bg-gradient-to-r from-violet-600/10 to-indigo-600/10 border border-violet-500/30 rounded-[2rem] p-6 animate-fade-up flex flex-col sm:flex-row items-center gap-6 shadow-xl">
                  <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center text-white shadow-lg shrink-0">
                    <Volume2 size={24} />
                  </div>
                  <div className="flex-1 w-full">
                    <audio ref={audioRef} src={resultAudio} controls className="w-full h-10 accent-violet-500" />
                  </div>
                  <a 
                    href={resultAudio} 
                    download={`VibeVoice_${Date.now()}.wav`}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-violet-400 border border-white/10 transition-all active:scale-95 shrink-0"
                  >
                    <Download size={20} />
                  </a>
                </div>
              )}
            </div>
          </div>

          {isGenerating && (
            <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-app-base/90 to-transparent pointer-events-none">
              <div className="flex items-center gap-4 animate-fade-in">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                   <div className="h-full bg-violet-500 w-1/3 animate-progress" />
                </div>
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">{statusMessage || 'Rendering High-Fidelity Dialogue...'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VibeVoiceTool;
