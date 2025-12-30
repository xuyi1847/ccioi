
import React, { useState, useRef, useEffect } from 'react';
import { Video, Play, Settings, ImageIcon, Trash2, Cpu, Link, Globe, Wifi, WifiOff, FileCode, CheckCircle2, Loader2, Download, Terminal, ChevronDown, ChevronUp, Activity, Lock, Sparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { HistoryRecord } from '../types';
import { uploadToOSS } from '../services/ossService';
import { mockBackend } from '../services/mockBackend';
import { optimizePrompt as clientSideOptimize } from '../services/geminiService';

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
  const { isConnected, isConnecting, connect, disconnect, sendCommand, lastMessage, serverUrl, setServerUrl } = useSocket();
  const { user } = useAuth();
  
  const [prompt, setPrompt] = useState('A futuristic landscape with flying vehicles and neon structures');
  const [configFile, setConfigFile] = useState(CONFIG_FILES[0]);
  const [condType, setCondType] = useState('None');
  const [numSteps, setNumSteps] = useState(40);
  const [numFrames, setNumFrames] = useState(112);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [fps, setFps] = useState(16);
  const [motionScore, setMotionScore] = useState(6);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    if (refImage) {
      if (condType === 'None') setCondType('i2v_head');
    } else {
      setCondType('None');
    }
  }, [refImage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isGenerating) {
        disconnect();
      }
    };
  }, [isGenerating, disconnect]);

  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage);
        if (data.type === 'TASK_LOG') {
          setLogs(prev => [...prev, { stream: data.stream, line: data.line }]);
        }
        if (data.type === 'task_finished') {
          if (data.status === 'success' && data.output?.public_url) {
            setGeneratedVideoUrl(data.output.public_url);
            setIsGenerating(false);
            const newRecord: HistoryRecord = {
              id: data.task_id || Date.now().toString(),
              type: 'video',
              prompt: prompt,
              url: data.output.public_url,
              timestamp: Date.now(),
              params: { config: configFile, cond: condType, steps: numSteps, frames: numFrames, fps: fps, motion_score: motionScore }
            };
            const existingHistory = JSON.parse(localStorage.getItem('ccioi_video_history') || '[]');
            localStorage.setItem('ccioi_video_history', JSON.stringify([newRecord, ...existingHistory]));
            
            // Task finished, disconnect WS to save resources
            disconnect();
          } else {
            setIsGenerating(false);
            alert('Generation failed. Please check the logs.');
            disconnect();
          }
        }
      } catch (e) {
        console.error('Error parsing WebSocket message', e);
      }
    }
  }, [lastMessage, prompt, configFile, condType, numSteps, numFrames, fps, motionScore, disconnect]);

  const handleOptimize = async () => {
    if (!prompt.trim() || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const optimized = await mockBackend.optimizePrompt('VIDEO', prompt, user?.token);
      setPrompt(optimized);
    } catch (error) {
      console.warn("Backend optimization failed, falling back to client-side Gemini...", error);
      try {
        const optimized = await clientSideOptimize(prompt, 'VIDEO');
        setPrompt(optimized);
      } catch (fallbackError) {
        console.error("All optimization attempts failed", fallbackError);
        alert("AI optimization failed. Please check your network connection.");
      }
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      alert("Please login to upload images.");
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setRefImage(reader.result as string);
      reader.readAsDataURL(file);

      setIsUploading(true);
      try {
        const url = await uploadToOSS(file, user.token);
        setRefImageUrl(url);
      } catch (err) {
        alert('Reference image upload to OSS failed.');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleDispatch = async () => {
    if (!user) {
      alert("Please login to generate video.");
      return;
    }
    if (isUploading) {
      alert("Reference image is still uploading...");
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setLogs([]);

    try {
      // Step 1: Establish connection only when needed
      if (!isConnected) {
        await connect();
      }

      // Step 2: Dispatch the task
      const sanitizedPrompt = prompt.replace(/"/g, '\\"');
      sendCommand({
        type: 'TASK_EXECUTION',
        task: 'VIDEO_GENERATION',
        token: user.token,
        timestamp: new Date().toISOString(),
        parameters: {
          prompt: sanitizedPrompt, 
          config: configFile, 
          cond: condType, 
          steps: numSteps, 
          frames: numFrames, 
          ratio: aspectRatio, 
          fps: fps,
          motion_score: motionScore,
          ref_image: refImageUrl 
        }
      });
    } catch (err) {
      console.error("Dispatch failed", err);
      alert("Failed to connect to CCIOI Bridge. Please try again.");
      setIsGenerating(false);
      disconnect();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-1 overflow-hidden flex-1">
      {/* Parameters Sidebar */}
      <div className="w-full lg:w-[360px] flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1 lg:shrink-0 min-h-0">
        <div className="bg-app-surface/60 p-5 rounded-3xl border border-app-border shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2 text-cyan-400">
              <Cpu className="w-4 h-4" /> {t('tool.video.title')}
            </h2>
            <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1.5 ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-app-subtext/20 text-app-subtext'}`}>
              {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isConnecting ? 'Connecting...' : isConnected ? t('socket.connected') : 'Bridge Offline'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-app-base/50 p-2.5 rounded-xl border border-app-border">
              <label className="text-[9px] text-app-subtext uppercase font-bold tracking-widest block mb-1">Runner URL</label>
              <div className="flex gap-2">
                <input 
                  type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
                  className="flex-1 bg-transparent text-[10px] text-app-text outline-none"
                  placeholder="ws://..."
                />
                <Link size={10} className="text-app-subtext" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-bold text-app-subtext uppercase tracking-widest">{t('tool.video.prompt')}</label>
                <button
                  onClick={handleOptimize}
                  disabled={!prompt.trim() || isOptimizing}
                  className="flex items-center gap-1.5 text-[9px] font-bold text-cyan-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase"
                >
                  {isOptimizing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                  Optimize
                </button>
              </div>
              <div className="relative">
                <textarea
                  value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  className="w-full bg-app-surface border border-app-border rounded-xl p-2.5 text-app-text text-xs h-20 outline-none focus:border-cyan-500 transition-colors resize-none"
                  placeholder="Describe sequence..."
                />
                {isOptimizing && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] rounded-xl flex items-center justify-center">
                    <Loader2 size={16} className="text-cyan-400 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-app-subtext uppercase tracking-widest mb-1">{t('tool.video.config')}</label>
                <select value={configFile} onChange={(e) => setConfigFile(e.target.value)} className="w-full bg-app-base border border-app-border rounded-lg p-1.5 text-[10px] text-app-text outline-none">
                  {CONFIG_FILES.map(f => <option key={f} value={f}>{f.split('/').pop()}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-app-subtext uppercase tracking-widest mb-1">{t('tool.video.cond_type')}</label>
                <select value={condType} onChange={(e) => setCondType(e.target.value)} className="w-full bg-app-base border border-app-border rounded-lg p-1.5 text-[10px] text-app-text outline-none disabled:opacity-50" disabled={!refImage && condType === 'None'}>
                  {COND_TYPES.map(t => <option key={t} value={t} disabled={t !== 'None' && !refImage}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-app-subtext uppercase tracking-widest mb-1.5">{t('tool.video.ref_image')}</label>
              <div onClick={() => !refImage && !isUploading && fileInputRef.current?.click()} className="aspect-video bg-app-base border border-dashed border-app-border rounded-xl flex items-center justify-center cursor-pointer overflow-hidden group">
                {isUploading ? (
                  <div className="flex flex-col items-center gap-1">
                    <Loader2 className="animate-spin text-cyan-400" size={16} />
                    <span className="text-[8px] text-app-subtext uppercase font-bold">Uploading</span>
                  </div>
                ) : refImage ? (
                  <div className="relative w-full h-full">
                    <img src={refImage} className="w-full h-full object-cover" />
                    <button onClick={(e) => {e.stopPropagation(); setRefImage(null); setRefImageUrl(null);}} className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-full text-red-400"><Trash2 size={12}/></button>
                  </div>
                ) : <ImageIcon className="text-app-subtext opacity-20" size={20} />}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 p-2.5 bg-app-base/30 rounded-xl border border-app-border">
              <div>
                <label className="text-[8px] font-bold text-app-subtext uppercase block mb-0.5">{t('tool.video.steps')}</label>
                <input type="number" value={numSteps} onChange={e => setNumSteps(parseInt(e.target.value))} className="w-full bg-app-base p-1 rounded text-[10px]" />
              </div>
              <div>
                <label className="text-[8px] font-bold text-app-subtext uppercase block mb-0.5">{t('tool.video.frames')}</label>
                <input type="number" value={numFrames} onChange={e => setNumFrames(parseInt(e.target.value))} className="w-full bg-app-base p-1 rounded text-[10px]" />
              </div>
              <div>
                <label className="text-[8px] font-bold text-app-subtext uppercase block mb-0.5">{t('tool.video.aspect_ratio')}</label>
                <input type="text" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-app-base p-1 rounded text-[10px]" />
              </div>
              <div>
                <label className="text-[8px] font-bold text-app-subtext uppercase block mb-0.5">{t('tool.video.fps')}</label>
                <input type="number" value={fps} onChange={e => setFps(parseInt(e.target.value))} className="w-full bg-app-base p-1 rounded text-[10px]" />
              </div>
            </div>

            <button 
              onClick={handleDispatch} 
              disabled={isGenerating || isUploading} 
              className={`w-full py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-widest text-[10px] ${
                !user 
                ? 'bg-app-surface text-app-subtext cursor-not-allowed border border-app-border' 
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-900/30'
              }`}
            >
              {isGenerating || isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : !user ? <Lock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              {!user ? 'Login Required' : isConnecting ? 'Connecting...' : isGenerating ? 'Processing' : t('tool.video.generate')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview / Output Box */}
      <div className="flex-1 flex flex-col gap-6 min-h-0 h-full overflow-hidden">
        <div className="bg-app-surface/30 rounded-3xl border border-app-border flex-1 flex flex-col items-center justify-center relative overflow-hidden group/preview p-0 bg-black/60 min-h-0">
          
          {(isGenerating || isConnecting) && (
            <div className="absolute inset-0 z-[60] bg-app-base/95 backdrop-blur-md flex flex-col animate-fade-in">
              <div className="p-8 flex flex-col items-center justify-center gap-4 text-center shrink-0">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                  <Video className="absolute inset-0 m-auto text-cyan-400 animate-pulse" size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-app-text">
                    {isConnecting ? 'Establishing Bridge' : 'Generating Sequence'}
                  </h3>
                  <p className="text-app-subtext text-[10px] uppercase tracking-widest opacity-60">
                    {isConnecting ? 'Waking up GPU Cluster...' : 'Node: CLUSTER_EDGE_PRO'}
                  </p>
                </div>
              </div>

              <div className="flex-1 px-6 pb-6 flex flex-col overflow-hidden">
                 <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-full shadow-2xl">
                    <div className="bg-white/5 px-4 py-2 flex items-center justify-between border-b border-white/5 shrink-0">
                       <div className="flex items-center gap-2 text-[9px] font-bold text-cyan-400 uppercase tracking-widest"><Terminal size={10} /> Live Stream Logs</div>
                       <button onClick={() => setShowConsole(!showConsole)} className="text-app-subtext hover:text-white transition-colors">{showConsole ? <ChevronDown size={12} /> : <ChevronUp size={12} />}</button>
                    </div>
                    {showConsole && (
                      <div className="flex-1 overflow-y-auto p-4 font-mono text-[9px] leading-relaxed custom-scrollbar bg-black/40">
                        {logs.length === 0 ? <div className="text-app-subtext/40 animate-pulse">Waiting for telemetry...</div> : logs.map((log, i) => (
                          <div key={i} className={`mb-1 break-all ${log.stream === 'stderr' ? 'text-rose-400' : 'text-cyan-100/70'}`}>
                             <span className="opacity-20 mr-2">{new Date().toLocaleTimeString([], { hour12: false, minute:'2-digit', second:'2-digit' })}</span>{log.line}
                          </div>
                        ))}
                        <div ref={logEndRef} />
                      </div>
                    )}
                 </div>
              </div>
            </div>
          )}

          {generatedVideoUrl ? (
            <div className="w-full h-full flex items-center justify-center animate-fade-in group relative bg-black overflow-hidden">
              <video 
                src={generatedVideoUrl} 
                className="max-w-full max-h-full w-auto h-auto object-contain shadow-2xl z-10" 
                controls 
                autoPlay 
                loop 
                playsInline 
              />
              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-3 z-30">
                <a href={generatedVideoUrl} download target="_blank" rel="noopener noreferrer" className="p-2.5 bg-black/80 hover:bg-app-accent rounded-full text-white transition-all shadow-xl"><Download size={20} /></a>
                <button onClick={() => { setGeneratedVideoUrl(null); disconnect(); }} className="p-2.5 bg-red-600/80 hover:bg-red-500 rounded-full text-white transition-all shadow-xl"><Trash2 size={20} /></button>
              </div>
            </div>
          ) : !isGenerating && !isConnecting && (
            <div className="max-w-md space-y-8 animate-fade-in text-center p-8">
              <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto relative"><Video size={40} className="text-cyan-400" /></div>
              <div className="space-y-4"><h3 className="text-2xl font-bold text-app-text tracking-tight">CCIOI Task Bridge</h3><p className="text-app-subtext text-xs leading-relaxed">Ready for high-fidelity video production. Set your technical parameters on the left and dispatch the job.</p></div>
              <div className="flex items-center justify-center gap-2 text-[9px] text-app-subtext font-bold uppercase tracking-[0.2em] bg-app-surface/40 py-2.5 px-6 rounded-full border border-app-border">Bridge Session Standby</div>
            </div>
          )}
        </div>

        <div className="bg-app-accent/5 border border-app-border rounded-3xl p-5 flex items-center gap-5 backdrop-blur-sm shrink-0 shadow-lg">
           <div className="w-12 h-12 bg-app-accent/20 rounded-2xl flex items-center justify-center text-app-accent shrink-0"><Globe size={24} /></div>
           <div className="min-w-0">
             <p className="text-sm font-bold text-app-text truncate">Cluster Dispatch Interface</p>
             <p className="text-[10px] text-app-subtext leading-relaxed mt-0.5 opacity-60">Neural rendering is handled by CCIOI distributed GPU nodes. WebSocket session is established per task.</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTool;
