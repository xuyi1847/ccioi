
import React, { useState, useRef } from 'react';
import { Video, Play, Settings, Image as ImageIcon, Trash2, Cpu, Link, Globe, Wifi, WifiOff, FileCode, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';

const CONFIG_FILES = [
  'configs/diffusion/inference/256px.py',
  'configs/diffusion/inference/256px_tp.py',
  'configs/diffusion/inference/768px.py',
  'configs/diffusion/inference/high_compression.py',
  'configs/diffusion/inference/t2i2v_256px.py',
  'configs/diffusion/inference/t2i2v_768px.py'
];

const COND_TYPES = ['None', 'i2v_head', 'i2v_tail', 'i2v_loop'];

const VideoTool: React.FC = () => {
  const { t } = useLanguage();
  const { isConnected, sendCommand, serverUrl, setServerUrl } = useSocket();
  
  const [prompt, setPrompt] = useState('A futuristic landscape with flying vehicles and neon structures');
  const [configFile, setConfigFile] = useState(CONFIG_FILES[0]);
  const [condType, setCondType] = useState(COND_TYPES[1]);
  const [numSteps, setNumSteps] = useState(40);
  const [numFrames, setNumFrames] = useState(112);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [fps, setFps] = useState(16);
  const [refImage, setRefImage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      alert("Socket server not connected. Please run your task runner on your local machine.");
      return;
    }

    // Dispatching structured parameters only, no shell command strings
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
        ref_image: refImage // Sending full data to the server
      }
    };
    
    sendCommand(payload);
    // Visual feedback could be improved here
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 p-2">
      {/* Sidebar - Parameters Control */}
      <div className="w-full lg:w-[400px] flex flex-col gap-4 overflow-y-auto custom-scrollbar">
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
                  placeholder="ws://localhost:8765"
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
                <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-1">{t('tool.video.cond')}</label>
                <select value={condType} onChange={(e) => setCondType(e.target.value)} className="w-full bg-app-base border border-app-border rounded-xl p-2.5 text-xs text-app-text outline-none">
                  {COND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Reference Image */}
            <div>
              <label className="block text-xs font-bold text-app-subtext uppercase tracking-widest mb-2">{t('tool.video.ref')}</label>
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
                <label className="text-[9px] font-bold text-app-subtext uppercase block mb-1">{t('tool.video.ratio')}</label>
                <input type="text" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-app-base p-1.5 rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-app-subtext uppercase block mb-1">{t('tool.video.fps')}</label>
                <input type="number" value={fps} onChange={e => setFps(parseInt(e.target.value))} className="w-full bg-app-base p-1.5 rounded-lg text-xs" />
              </div>
            </div>

            <button
              onClick={handleDispatch}
              className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] uppercase tracking-widest text-xs"
            >
              <Play className="w-4 h-4 fill-current" /> {t('tool.video.dispatch')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview Area - Clean Status Interface */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="bg-app-surface/30 rounded-3xl border border-app-border p-8 flex-1 flex flex-col min-h-[400px] items-center justify-center text-center">
          <div className="max-w-md space-y-8 animate-fade-in">
             <div className="w-24 h-24 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto relative">
                <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping" />
                <Video size={48} className="text-cyan-400" />
             </div>
             
             <div className="space-y-4">
               <h3 className="text-2xl font-bold text-app-text tracking-tight">Production Studio</h3>
               <p className="text-app-subtext text-sm leading-relaxed">
                 Configure your technical parameters on the left and dispatch them to your local CCIOI execution cluster.
               </p>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="bg-app-base/40 p-4 rounded-2xl border border-app-border text-left">
                   <div className="flex items-center gap-2 mb-1">
                      <FileCode size={14} className="text-cyan-400" />
                      <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">Active Config</span>
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
        </div>

        {/* Info Card */}
        <div className="bg-app-accent/5 border border-app-accent/20 rounded-2xl p-6 flex items-center gap-4 backdrop-blur-sm">
           <div className="w-12 h-12 bg-app-accent/10 rounded-full flex items-center justify-center text-app-accent">
              <Globe size={24} />
           </div>
           <div>
              <p className="text-sm font-bold text-app-text">Bridge Orchestration Ready</p>
              <p className="text-xs text-app-subtext">The frontend will send a raw JSON parameter packet. No shell commands are exposed to the end user.</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTool;
