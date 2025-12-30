
import React, { useState, useRef, useEffect } from 'react';
import { Video, Play, Settings, ImageIcon, Trash2, Cpu, Link, Globe, Wifi, WifiOff, FileCode, CheckCircle2, Loader2, Download, Terminal, ChevronDown, ChevronUp, Activity, Lock } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { HistoryRecord } from '../types';
import { uploadToOSS } from '../services/ossService';

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
          } else {
            setIsGenerating(false);
            alert('Generation failed. Please check the logs.');
          }
        }
      } catch (e) {
        console.error('Error parsing WebSocket message', e);
      }
    }
  }, [lastMessage]);

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

  const handleDispatch = () => {
    if (!user) {
      alert("Please login to generate video.");
      return;
    }
    if (!isConnected) {
      alert("Socket server not connected.");
      return;
    }
    if (isUploading) {
      alert("Reference image is still uploading...");
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setLogs([]);
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
  };

  return (
    <div className="flex flex-col lg:flex-row lg:h-full gap-6 p-1 lg:overflow-hidden">
      {/* Parameters Sidebar */}
      <div className="w-full lg:w-[400px] flex flex-col gap-4 lg:overflow-y-auto custom-scrollbar pr-1 lg:shrink-0">
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
            <div className="bg-app-base/50 p-3 rounded-xl border border-app-border">
              <label className="text-[10px] text-app-subtext uppercase font-bold tracking-widest block mb-1">Task Runner URL</label>
              <div className="flex gap-2">
                <input 
                  type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-app-text outline-none"
                  placeholder="ws://www.ccioi.com/ws"
                />
                <Link size={12} className="text-app-subtext" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-2">{t('tool.video.prompt')}</label>
              <textarea
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
                className="w-full bg-app-surface border border-app-border rounded-xl p-3 text-app-text text-sm h-24 outline-none focus:border-cyan-500 transition-colors"
                placeholder="Describe the scene..."
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-1">{t('tool.video.config')}</label>
                <select value={configFile} onChange={(e) => setConfigFile(e.target.value)} className="w-full bg-app-base border border-app-border rounded-xl p-2.5 text-xs text-app-text outline-none">
                  {CONFIG_FILES.map(f => <option key={f} value={f}>{f.split('/').pop()}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-1">{t('tool.video.cond_type')}</label>
                <select value={condType} onChange={(e) => setCondType(e.target.value)} className="w-full bg-app-base border border-app-border rounded-xl p-2.5 text-xs text-app-text outline-none disabled:opacity-50" disabled={!refImage && condType === 'None'}>
                  {COND_TYPES.map(t => <option key={t} value={t} disabled={t !== 'None' && !refImage}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-2">{t('tool.video.ref_image')}</label>
              <div onClick={() => !refImage && !isUploading && fileInputRef.current?.click()} className="aspect-video bg-app-base border-2 border-dashed border-app-border rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden group">
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin text-cyan-400" size={24} />
                    <span className="text-[10px] text-app-subtext uppercase font-bold">Uploading...</span>
                  </div>
                ) : refImage ? (
                  <div className="relative w-full h-full">
                    <img src={refImage} className="w-full h-full object-cover" />
                    <button onClick={(e) => {e.stopPropagation(); setRefImage(null); setRefImageUrl(null);}} className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                  </div>
                ) : <ImageIcon className="text-app-subtext opacity-20 group-hover:scale-110 transition-transform" size={32} />}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>
            </div>

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

            <div className="p-3 bg-app-base/30 rounded-2xl border border-app-border">
                <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest block mb-2 flex items-center gap-2">
                    <Activity size={12} className="text-cyan-400" />
                    {t('tool.video.motion_score')}
                </label>
                <div className="flex justify-between gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map(score => (
                        <button key={score} onClick={() => setMotionScore(score)} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${motionScore === score ? 'bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-900/40' : 'bg-app-base border-app-border text-app-subtext hover:border-app-subtext/50'}`}>
                            {score}
                        </button>
                    ))}
                </div>
            </div>

            <button 
              onClick={handleDispatch} 
              disabled={isGenerating || isUploading} 
              className={`w-full py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-widest text-xs ${
                !user 
                ? 'bg-app-surface text-app-subtext cursor-not-allowed border border-app-border' 
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-900/30'
              }`}
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : !user ? <Lock className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              {!user ? 'Login Required' : isGenerating ? 'Processing...' : t('tool.video.generate')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview / Output Box */}
      <div className="flex-1 flex flex-col gap-6 lg:overflow-hidden min-h-[500px] lg:min-h-0">
        <div className="bg-app-surface/30 rounded-3xl border border-app-border flex-1 flex flex-col items-center justify-center relative overflow-hidden group/preview p-0 bg-black/40 min-h-[400px]">
          
          {isGenerating && (
            <div className="absolute inset-0 z-[60] bg-app-base/95 backdrop-blur-md flex flex-col animate-fade-in">
              <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                  <Video className="absolute inset-0 m-auto text-cyan-400 animate-pulse" size={28} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-app-text tracking-tight">Generating AI Video</h3>
                  <p className="text-app-subtext text-xs uppercase tracking-widest opacity-60">Cluster Node: GPU_NODE_112</p>
                </div>
              </div>

              <div className="flex-1 px-6 pb-6 flex flex-col overflow-hidden">
                 <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-full shadow-2xl">
                    <div className="bg-white/5 px-4 py-2 flex items-center justify-between border-b border-white/5">
                       <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-400 uppercase tracking-widest"><Terminal size={12} /> System Logs</div>
                       <button onClick={() => setShowConsole(!showConsole)} className="text-app-subtext hover:text-white transition-colors">{showConsole ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
                    </div>
                    {showConsole && (
                      <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] leading-relaxed custom-scrollbar bg-black/40">
                        {logs.length === 0 ? <div className="text-app-subtext/40 animate-pulse">Establishing secure link with remote host...</div> : logs.map((log, i) => (
                          <div key={i} className={`mb-1 break-all ${log.stream === 'stderr' ? 'text-rose-400' : 'text-cyan-100/70'}`}>
                             <span className="opacity-30 mr-2">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>{log.line}
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
            <div className="w-full h-full flex items-center justify-center animate-fade-in group relative bg-black">
              <video src={generatedVideoUrl} className="w-full h-full max-w-full max-h-full object-contain shadow-2xl" controls autoPlay loop playsInline />
              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-3 z-20">
                <a href={generatedVideoUrl} download target="_blank" rel="noopener noreferrer" className="p-3 bg-black/80 hover:bg-app-accent rounded-full text-white backdrop-blur-md transition-all shadow-xl"><Download size={24} /></a>
                <button onClick={() => setGeneratedVideoUrl(null)} className="p-3 bg-red-600/80 hover:bg-red-500 rounded-full text-white backdrop-blur-md transition-all shadow-xl"><Trash2 size={24} /></button>
              </div>
            </div>
          ) : !isGenerating && (
            <div className="max-w-md space-y-8 animate-fade-in text-center p-8">
              <div className="w-24 h-24 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto relative"><div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping" /><Video size={48} className="text-cyan-400" /></div>
              <div className="space-y-4"><h3 className="text-3xl font-bold text-app-text tracking-tight">CCIOI Task Bridge</h3><p className="text-app-subtext text-sm leading-relaxed">Ready for high-fidelity video production. Set your technical parameters on the left and dispatch the job to the cluster.</p></div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-app-base/60 p-4 rounded-2xl border border-app-border text-left shadow-inner">
                    <div className="flex items-center gap-2 mb-1"><FileCode size={14} className="text-cyan-400" /><span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">Configuration</span></div>
                    <div className="text-xs font-mono text-app-text truncate">{configFile.split('/').pop()}</div>
                  </div>
                  <div className="bg-app-base/60 p-4 rounded-2xl border border-app-border text-left shadow-inner">
                    <div className="flex items-center gap-2 mb-1"><Settings size={14} className="text-cyan-400" /><span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">Execution Mode</span></div>
                    <div className="text-xs font-mono text-app-text">{condType}</div>
                  </div>
              </div>
              {isConnected && <div className="flex items-center justify-center gap-2 text-[10px] text-green-400 font-bold uppercase tracking-[0.2em] bg-green-500/10 py-3 rounded-full border border-green-500/20 shadow-lg shadow-green-900/10"><CheckCircle2 size={12} />Cluster Link Active</div>}
            </div>
          )}
        </div>

        <div className="bg-app-accent/5 border border-app-accent/10 rounded-3xl p-6 flex items-center gap-6 backdrop-blur-sm shrink-0 border-app-border shadow-xl">
           <div className="w-14 h-14 bg-app-accent/20 rounded-2xl flex items-center justify-center text-app-accent shrink-0"><Globe size={28} /></div>
           <div className="min-w-0">
             <p className="text-base font-bold text-app-text truncate">Cluster Dispatch Interface (Node: www.ccioi.com)</p>
             <p className="text-xs text-app-subtext leading-relaxed mt-1 opacity-70">The remote GPU compute engine handles all heavy neural rendering. Real-time updates are streamed via secure WebSocket tunnels.</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTool;
