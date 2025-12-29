
import React, { useState, useRef, useEffect } from 'react';
import { Video, Play, Settings, Image as ImageIcon, Trash2, Cpu, Link, Globe, Wifi, WifiOff, FileCode, CheckCircle2, Loader2, Download, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { HistoryRecord } from '../types';

const CONFIG_FILES = [
  'configs/diffusion/inference/256px.py',
  'configs/diffusion/inference/256px_tp.py',
  'configs/diffusion/inference/768px.py',
  'configs/diffusion/inference/high_compression.py',
  'configs/diffusion/inference/t2i2v_256px.py',
  'configs/diffusion/inference/t2i2v_768px.py'
];

const COND_TYPES = ['None', 'i2v_head', 'i2v_tail', 'i2v_loop'];

interface TaskLog {
  stream: 'stdout' | 'stderr';
  line: string;
}

const VideoTool: React.FC = () => {
  const { t } = useLanguage();
  const { isConnected, sendCommand, lastMessage, serverUrl, setServerUrl } = useSocket();
  
  const [prompt, setPrompt] = useState('A futuristic landscape with flying vehicles and neon structures');
  const [configFile, setConfigFile] = useState(CONFIG_FILES[0]);
  const [condType, setCondType] = useState('None');
  const [numSteps, setNumSteps] = useState(40);
  const [numFrames, setNumFrames] = useState(112);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [fps, setFps] = useState(16);
  const [refImage, setRefImage] = useState<string | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Sync condition type with reference image presence
  useEffect(() => {
    if (refImage) {
      if (condType === 'None') setCondType('i2v_head');
    } else {
      setCondType('None');
    }
  }, [refImage]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage);
        
        // Handle Logs
        if (data.type === 'TASK_LOG') {
          setLogs(prev => [...prev, { stream: data.stream, line: data.line }]);
        }
        
        // Handle Completion
        if (data.type === 'task_finished') {
          if (data.status === 'success' && data.output?.public_url) {
            setGeneratedVideoUrl(data.output.public_url);
            setIsGenerating(false);

            // SAVE TO HISTORY
            const newRecord: HistoryRecord = {
              id: data.task_id || Date.now().toString(),
              type: 'video',
              prompt: prompt,
              url: data.output.public_url,
              timestamp: Date.now(),
              params: {
                config: configFile,
                cond: condType,
                steps: numSteps,
                frames: numFrames,
                fps: fps
              }
            };

            const existingHistory = JSON.parse(localStorage.getItem('ccioi_video_history') || '[]');
            localStorage.setItem('ccioi_video_history', JSON.stringify([newRecord, ...existingHistory]));
          } else {
            console.error('Task failed or no URL provided', data);
            setIsGenerating(false);
            alert('Generation failed. Please check the logs.');
          }
        }
      } catch (e) {
        console.error('Error parsing WebSocket message', e);
      }
    }
  }, [lastMessage]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setRefImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleDispatch = () => {
    if (!isConnected) {
      alert("Socket server not connected. Please ensure the task runner is active.");
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setLogs([]); // Reset logs for new task

    const payload = {
      type: 'TASK_EXECUTION',
      task: 'VIDEO_GENERATION',
      timestamp: new Date().toISOString(),
      parameters: {
        prompt, 
        config: configFile, 
        cond: condType, 
        steps: numSteps, 
        frames: numFrames, 
        ratio: aspectRatio, 
        fps: fps, 
        ref_image: refImage 
      }
    };
    
    sendCommand(payload);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 p-2">
      {/* Sidebar - Parameters Control */}
      <div className="w-full lg:w-[400px] flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1 shrink-0">
        <div className="bg-app-surface/60 p-6 rounded-3xl border border-app-border shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-cyan-400">
              <Cpu className="w-5 h-5" /> {t('tool.video.title')}
            </h2>
            <div className={`px-2 py-1 rounded-full text-[9px] font-bold flex items-center gap-1.5 ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isConnected ? t('socket.connected') : t('socket.disconnected')}
            </div>
          </div>

          <div className="space-y-5">
            {/* Socket Settings */}
            <div className="bg-app-base/50 p-3 rounded-xl border border-app-border">
              <label className="text-[10px] text-app-subtext uppercase font-bold tracking-widest block mb-1">Task Runner URL</label>
              <div className="flex gap-2">
                <input 
                  type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-app-text outline-none"
                  placeholder="ws://115.191.1.112:8000/ws"
                />
                <Link size={12} className="text-app-subtext" />
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-2">{t('tool.video.prompt')}</label>
              <textarea
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
                className="w-full bg-app-base border border-app-border rounded-xl p-3 text-app-text text-sm h-24 outline-none focus:border-cyan-500 transition-colors"
                placeholder="Describe the scene..."
              />
            </div>

            {/* Config & Cond */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-1">{t('tool.video.config')}</label>
                <select value={configFile} onChange={(e) => setConfigFile(e.target.value)} className="w-full bg-app-base border border-app-border rounded-xl p-2.5 text-xs text-app-text outline-none">
                  {CONFIG_FILES.map(f => <option key={f} value={f}>{f.split('/').pop()}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-1">{t('tool.video.cond_type')}</label>
                <select 
                  value={condType} 
                  onChange={(e) => setCondType(e.target.value)} 
                  className="w-full bg-app-base border border-app-border rounded-xl p-2.5 text-xs text-app-text outline-none disabled:opacity-50"
                  disabled={!refImage && condType === 'None'}
                >
                  {COND_TYPES.map(t => {
                    const isDisabled = t !== 'None' && !refImage;
                    return (
                      <option key={t} value={t} disabled={isDisabled}>
                        {t} {isDisabled ? '(Needs Image)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Reference Image */}
            <div>
              <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-2">{t('tool.video.ref_image')}</label>
              <div onClick={() => !refImage && fileInputRef.current?.click()} className="aspect-video bg-app-base border-2 border-dashed border-app-border rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden group">
                {refImage ? (
                  <div className="relative w-full h-full">
                    <img src={refImage} className="w-full h-full object-cover" />
                    <button onClick={(e) => {e.stopPropagation(); setRefImage(null);}} className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                  </div>
                ) : <ImageIcon className="text-app-subtext opacity-20 group-hover:scale-110 transition-transform" size={32} />}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
              </div>
            </div>

            {/* Sampling Options */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-app-base/30 rounded-2xl border border-app-border">
              <div>
                <label className="text-[9px] font-bold text-app-subtext uppercase block mb-1">{t('tool.video.steps')}</label>
                <input type="number" value={numSteps} onChange={e => setNumSteps(parseInt(e.target.value))} className="w-full bg-app-base p-1.5 rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-app-subtext uppercase block mb-1">{t('tool.video.frames')}</label>
                <input type="number" value={numFrames} onChange={e => setNumFrames(parseInt(e.target.value))} className="w-full bg-app-base p-1.5 rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-app-subtext uppercase block mb-1">{t('tool.video.aspect_ratio')}</label>
                <input type="text" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-app-base p-1.5 rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-app-subtext uppercase block mb-1">{t('tool.video.fps')}</label>
                <input type="number" value={fps} onChange={e => setFps(parseInt(e.target.value))} className="w-full bg-app-base p-1.5 rounded-lg text-xs" />
              </div>
            </div>

            <button
              onClick={handleDispatch}
              disabled={isGenerating}
              className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-2xl font-bold shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-widest text-xs"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              {isGenerating ? 'Processing...' : t('tool.video.generate')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="bg-app-surface/30 rounded-3xl border border-app-border p-4 flex-1 flex flex-col min-h-[400px] items-center justify-center relative overflow-hidden">
          
          {isGenerating && (
            <div className="absolute inset-0 z-20 bg-app-base/90 backdrop-blur-md flex flex-col animate-fade-in">
              {/* Progress Header */}
              <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                  <Video className="absolute inset-0 m-auto text-cyan-400 animate-pulse" size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-app-text tracking-tight">Generating AI Video</h3>
                  <p className="text-app-subtext text-xs uppercase tracking-widest">Cluster Node: GPU_NODE_112</p>
                </div>
              </div>

              {/* Console Viewer */}
              <div className="flex-1 px-4 pb-4 flex flex-col overflow-hidden">
                 <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col h-full shadow-2xl">
                    <div className="bg-white/5 px-4 py-2 flex items-center justify-between border-b border-white/5">
                       <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                          <Terminal size={12} /> Live Output Logs
                       </div>
                       <button onClick={() => setShowConsole(!showConsole)} className="text-app-subtext hover:text-white transition-colors">
                          {showConsole ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                       </button>
                    </div>
                    
                    {showConsole && (
                      <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] leading-relaxed custom-scrollbar bg-black/20">
                        {logs.length === 0 ? (
                           <div className="text-app-subtext/40 animate-pulse">Initializing kernel environment...</div>
                        ) : (
                          logs.map((log, i) => (
                            <div key={i} className={`mb-1 break-all ${log.stream === 'stderr' ? 'text-rose-400' : 'text-cyan-100/70'}`}>
                               <span className="opacity-30 mr-2">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                               {log.line}
                            </div>
                          ))
                        )}
                        <div ref={logEndRef} />
                      </div>
                    )}
                 </div>
              </div>
            </div>
          )}

          {generatedVideoUrl ? (
            <div className="w-full h-full flex flex-col items-center justify-center animate-fade-in group relative">
              <video 
                src={generatedVideoUrl} 
                className="max-w-full max-h-full rounded-2xl shadow-2xl border border-white/5" 
                controls 
                autoPlay 
                loop
              />
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <a 
                  href={generatedVideoUrl} 
                  download 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-all"
                >
                  <Download size={18} />
                </a>
                <button 
                  onClick={() => setGeneratedVideoUrl(null)}
                  className="p-2 bg-red-500/60 hover:bg-red-500/80 rounded-full text-white backdrop-blur-md transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ) : !isGenerating && (
            <div className="max-w-md space-y-8 animate-fade-in text-center">
              <div className="w-24 h-24 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto relative">
                  <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping" />
                  <Video size={48} className="text-cyan-400" />
              </div>
              
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-app-text tracking-tight">CCIOI Task Bridge</h3>
                <p className="text-app-subtext text-sm leading-relaxed">
                  Your production pipeline is ready. Set your parameters on the left and dispatch to the remote cluster.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-app-base/40 p-4 rounded-2xl border border-app-border text-left">
                    <div className="flex items-center gap-2 mb-1">
                        <FileCode size={14} className="text-cyan-400" />
                        <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">Config</span>
                    </div>
                    <div className="text-xs font-mono text-app-text truncate">{configFile.split('/').pop()}</div>
                  </div>
                  <div className="bg-app-base/40 p-4 rounded-2xl border border-app-border text-left">
                    <div className="flex items-center gap-2 mb-1">
                        <Settings size={14} className="text-cyan-400" />
                        <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">Mode</span>
                    </div>
                    <div className="text-xs font-mono text-app-text">{condType}</div>
                  </div>
              </div>
              
              {isConnected && (
                <div className="flex items-center justify-center gap-2 text-[10px] text-green-400 font-bold uppercase tracking-[0.2em] bg-green-500/5 py-2 rounded-full border border-green-500/10">
                    <CheckCircle2 size={12} />
                    Bridge Connection Established
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-app-accent/5 border border-app-accent/20 rounded-2xl p-6 flex items-center gap-4 backdrop-blur-sm shrink-0">
           <div className="w-12 h-12 bg-app-accent/10 rounded-full flex items-center justify-center text-app-accent">
              <Globe size={24} />
           </div>
           <div>
              <p className="text-sm font-bold text-app-text">Cluster Execution (IP: 115.191.1.112)</p>
              <p className="text-xs text-app-subtext">Remote GPU task runner handles the heavy lifting. Results are pushed via secure WebSocket public URL.</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTool;
