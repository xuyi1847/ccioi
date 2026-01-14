
import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
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
  Dice5,
  AlertCircle
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

const EXAMPLES = [
  {
    speakers: 2,
    script: "Speaker 0: Welcome to our AI podcast demonstration!\nSpeaker 1: Thanks for having me. This is exciting!"
  },
  {
    speakers: 3,
    script: "Speaker 0: Let's discuss the future of AI.\nSpeaker 1: I think it's going to be transformative.\nSpeaker 2: Absolutely, especially in creative fields like voice synthesis."
  }
];

const AudioTool: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  
  // 状态初始化
  const [numSpeakers, setNumSpeakers] = useState(2);
  const [speakers, setSpeakers] = useState<string[]>(['en-Alice_woman', 'en-Carter_man', 'en-Frank_man', 'en-Maya_woman']);
  const [cfgScale, setCfgScale] = useState(1.3);
  const [script, setScript] = useState('');
  const [apiUrl, setApiUrl] = useState('http://localhost:7860');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [resultAudio, setResultAudio] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // 调试日志：组件挂载与更新
  useEffect(() => {
    console.log("[AudioTool] Component Rendered", { 
      user: user?.email, 
      scriptLength: script.length, 
      isGenerating 
    });
  });

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

  const handleRandomExample = () => {
    const example = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
    setNumSpeakers(example.speakers);
    setScript(example.script);
  };

  const handleGenerate = async (e: React.MouseEvent) => {
    // 强制阻止默认行为并立即打印日志
    e.preventDefault();
    console.log("[AudioTool] handleGenerate Triggered");
    
    // 如果没有用户，提示登录
    if (!user) {
      console.error("[AudioTool] No user detected");
      setProgressLog(prev => [...prev, "❌ Error: Please login first."]);
      return;
    }

    // 如果脚本为空，提示输入
    if (!script.trim()) {
      console.warn("[AudioTool] Script is empty");
      setProgressLog(prev => [...prev, "⚠️ Warning: Please enter a script."]);
      return;
    }

    setIsGenerating(true);
    setResultAudio(null);
    setProgressLog(['🎙️ Connecting to VibeVoice Bridge...']);
    setStatusMessage('Initiating synthesis engine...');

    try {
      // 准备 payload
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

      console.log("[AudioTool] Requesting:", `${apiUrl}/api/predict`, payload);
      
      const response = await fetch(`${apiUrl}/api/predict`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log("[AudioTool] Response status:", response.status);

      if (!response.ok) {
        throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log("[AudioTool] JSON Result:", result);
      
      // 解析 Gradio 数据结构
      // 在提供的 Python 代码中，输出为：outputs=[audio_output, complete_audio_output, log_output, ...]
      // 对应 index: 0: streaming, 1: complete, 2: log
      if (result.data && result.data.length > 1) {
        const audioData = result.data[1]; 
        const logData = result.data[2];

        if (logData) {
          setProgressLog(prev => [...prev, logData]);
        }

        if (audioData && audioData.url) {
          // 处理 Gradio 文件 URL
          const fullAudioUrl = audioData.url.startsWith('http') 
            ? audioData.url 
            : `${apiUrl}/file=${audioData.name}`;
            
          console.log("[AudioTool] Final Audio URL:", fullAudioUrl);
          setResultAudio(fullAudioUrl);
          setProgressLog(prev => [...prev, '✨ Synthesis complete. Audio ready for playback.']);
        } else if (typeof audioData === 'string' && audioData.startsWith('data:')) {
          setResultAudio(audioData);
          setProgressLog(prev => [...prev, '✨ Received base64 audio stream.']);
        } else {
          setProgressLog(prev => [...prev, '⚠️ Generation finished but no valid audio URL was returned.']);
        }
      } else {
        throw new Error('Unexpected response format from backend.');
      }
    } catch (err: any) {
      console.error("[AudioTool] Error caught:", err);
      setProgressLog(prev => [...prev, `❌ Error: ${err.message}`]);
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setProgressLog(prev => [...prev, `💡 Troubleshooting: Ensure Gradio is running at ${apiUrl} and check CORS/Mixed Content settings.`]);
      }
    } finally {
      setIsGenerating(false);
      setStatusMessage(null);
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    console.log("[AudioTool] handleStop Triggered");
    setIsGenerating(false);
    setProgressLog(prev => [...prev, '🛑 Render process halted by user.']);
  };

  // 按钮逻辑判断：即使没有登录也允许点击以触发日志（方便调试），但在函数内部拦截
  const canClick = true; 

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-1 overflow-hidden flex-1">
      {/* Parameters Panel */}
      <div className="w-full lg:w-[350px] flex flex-col gap-4 overflow-y-auto custom-scrollbar lg:shrink-0 min-h-0">
        <div className="bg-app-surface/60 p-6 rounded-[2rem] border border-app-border shadow-2xl backdrop-blur-md">
          <h2 className="text-sm font-bold text-rose-400 mb-6 uppercase tracking-widest flex items-center gap-2">
            <Mic className="w-4 h-4" /> {t('tool.audio.title')}
          </h2>

          <div className="space-y-6">
            <div className="bg-app-base/40 p-3 rounded-2xl border border-app-border">
              <label className="text-[9px] text-app-subtext uppercase font-bold tracking-widest block mb-1.5 flex items-center gap-1">
                <Server size={10} /> {t('tool.audio.api')}
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
                  <Users size={14} /> {t('tool.audio.speakers')}
                </label>
                <span className="text-xs font-mono text-rose-400">{numSpeakers}</span>
              </div>
              <input 
                type="range" min="1" max="4" step="1" 
                value={numSpeakers} 
                onChange={(e) => setNumSpeakers(parseInt(e.target.value))}
                className="w-full h-1.5 bg-app-border rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              
              <div className="grid grid-cols-2 gap-3">
                {[...Array(numSpeakers)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <label className="text-[9px] font-bold text-app-subtext uppercase tracking-wider block">Speaker {i}</label>
                    <select 
                      value={speakers[i]} 
                      onChange={(e) => handleSpeakerChange(i, e.target.value)}
                      className="w-full bg-app-base border border-app-border rounded-xl p-2 text-[10px] text-app-text outline-none focus:border-rose-500 transition-colors"
                    >
                      {DEFAULT_VOICES.map(v => <option key={v} value={v}>{v.split('-').pop()?.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest flex items-center gap-2">
                  <Sliders size={14} /> {t('tool.audio.cfg')}
                </label>
                <span className="text-xs font-mono text-rose-400">{cfgScale}</span>
              </div>
              <input 
                type="range" min="1.0" max="2.0" step="0.05" 
                value={cfgScale} 
                onChange={(e) => setCfgScale(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-app-border rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>

            <div className="pt-2">
              {!user && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 animate-fade-in">
                  <AlertCircle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-rose-200/70 leading-relaxed uppercase tracking-tighter">Authentication required. Please sign in to use VibeVoice.</p>
                </div>
              )}
              
              <button 
                type="button"
                onClick={isGenerating ? handleStop : handleGenerate} 
                className={`w-full py-4 rounded-2xl font-bold uppercase text-[11px] tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                  isGenerating 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : (!user || !script.trim())
                      ? 'bg-app-surface text-app-subtext/40 border border-app-border cursor-pointer opacity-80' 
                      : 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-rose-900/40 hover:from-rose-500 hover:to-pink-500'
                }`}
              >
                {isGenerating ? <Loader2 className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                {isGenerating ? t('tool.audio.stop') : t('tool.audio.generate')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6 min-h-0">
        <div className="bg-app-surface/30 rounded-[2.5rem] border border-app-border flex-1 flex flex-col min-h-0 relative overflow-hidden backdrop-blur-sm">
          
          <div className="flex-1 flex flex-col p-8 gap-6 overflow-hidden min-h-0">
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest flex items-center gap-2">
                  <FileText size={14} /> {t('tool.audio.script')}
                </label>
                <button 
                  type="button"
                  onClick={handleRandomExample}
                  className="text-[10px] font-bold text-rose-400 hover:text-white transition-colors flex items-center gap-1 uppercase tracking-widest"
                >
                  <Dice5 size={12} /> Random Example
                </button>
              </div>
              <textarea 
                value={script} 
                onChange={(e) => setScript(e.target.value)}
                placeholder={t('tool.audio.placeholder')}
                className="w-full bg-black/40 border border-app-border rounded-3xl p-6 text-[13px] text-white h-44 outline-none focus:border-rose-500 transition-all font-mono resize-none leading-relaxed placeholder:text-app-subtext/20" 
              />
            </div>

            <div className="flex-1 flex flex-col min-h-0 gap-6">
              <div className="flex-1 bg-black/60 border border-white/5 rounded-[2rem] overflow-hidden flex flex-col shadow-inner">
                <div className="bg-white/5 px-6 py-3 flex items-center justify-between border-b border-white/5">
                  <div className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} /> Telemetry Log
                  </div>
                  {isGenerating && <Loader2 size={12} className="animate-spin text-rose-400" />}
                </div>
                <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed custom-scrollbar text-rose-100/60">
                  {progressLog.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20">
                      <Volume2 size={48} strokeWidth={1} />
                      <p className="mt-4 uppercase tracking-[0.3em]">System Standby</p>
                    </div>
                  ) : (
                    progressLog.map((log, i) => (
                      <div key={i} className="mb-2 animate-fade-in border-l border-rose-500/20 pl-4">
                        <span className="opacity-30 mr-3 text-[9px]">{new Date().toLocaleTimeString([], { hour12: false })}</span>
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>

              {resultAudio && (
                <div className="bg-gradient-to-r from-rose-600/10 to-pink-600/10 border border-rose-500/30 rounded-[2.5rem] p-6 animate-fade-up flex flex-col sm:flex-row items-center gap-6 shadow-xl">
                  <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-lg shrink-0">
                    <Volume2 size={24} />
                  </div>
                  <div className="flex-1 w-full">
                    <audio ref={audioRef} src={resultAudio} controls className="w-full h-10 accent-rose-500" />
                  </div>
                  <div className="flex gap-2 shrink-0">
                     <a 
                      href={resultAudio} 
                      download={`VibeVoice_${Date.now()}.wav`}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-rose-400 border border-white/10 transition-all active:scale-95"
                    >
                      <Download size={20} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isGenerating && (
            <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-app-base/90 to-transparent pointer-events-none">
              <div className="flex items-center gap-4 animate-fade-in">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                   <div className="h-full bg-rose-500 w-1/3 animate-progress" />
                </div>
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">{statusMessage || 'Processing...'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioTool;
