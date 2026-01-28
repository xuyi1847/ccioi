
import React, { useState, useRef, useEffect } from 'react';
import { 
  Zap, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Play, 
  StopCircle, 
  BarChart3, 
  User as UserIcon, 
  Lock, 
  Link as LinkIcon, 
  Tag, 
  Loader2,
  Table as TableIcon,
  RefreshCw,
  Activity,
  Key
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

interface PollutionLog {
  stream: 'stdout' | 'stderr';
  line: string;
}

interface PerformanceMetric {
  keyword: string;
  hit: number;
  ratio: number;
}

const AmazonPollutionTool: React.FC = () => {
  const { t } = useLanguage();
  const { notify } = useNotification();
  const { isConnected, isConnecting, connect, disconnect, sendCommand, lastMessage } = useSocket();
  const { user } = useAuth();

  const [amazonUser, setAmazonUser] = useState('');
  const [amazonPass, setAmazonPass] = useState('');
  const [loginUrl, setLoginUrl] = useState('https://www.amazon.com/ap/signin');
  const [productUrl, setProductUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpPrompt, setOtpPrompt] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<PollutionLog[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const [performanceData, setPerformanceData] = useState<PerformanceMetric[] | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [runs, setRuns] = useState<string[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('');

  const logEndRef = useRef<HTMLDivElement>(null);
  const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = IS_DEV ? 'http://127.0.0.1:8000' : 'https://www.ccioi.com/api';

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage);
        if (data.type === 'TASK_LOG') {
          setLogs(prev => [...prev, { stream: data.stream, line: data.line }]);
        }
        if (data.type === 'OTP_REQUIRED') {
          setOtpRequired(true);
          setOtpPrompt(data.prompt || 'OTP Required');
          notify.warning("Amazon MFA verification requested.");
        }
        if (data.type === 'task_finished') {
          setIsProcessing(false);
          notify.success("Optimization task sequence completed.");
          disconnect();
          loadRuns();
        }
      } catch (e) {}
    }
  }, [lastMessage, disconnect, notify]);

  const loadRuns = async () => {
    try {
      const response = await fetch(`${API_BASE}/amazon/pollution/runs`);
      if (!response.ok) return;
      const data = await response.json();
      setRuns(Array.isArray(data.runs) ? data.runs : []);
    } catch {}
  };

  useEffect(() => { loadRuns(); }, []);

  const handleStartTask = async () => {
    if (!user) {
      notify.error("Authentication required. Please sign in.");
      return;
    }
    if (!amazonUser || !amazonPass || !loginUrl || !productUrl || !keywords) {
      notify.warning("Incomplete parameters. All fields are required.");
      return;
    }

    setIsProcessing(true);
    setLogs([]);

    try {
      if (!isConnected) await connect();
      sendCommand({
        task: 'AMAZON_POLLUTION',
        parameters: {
          username: amazonUser,
          password: amazonPass,
          login_url: loginUrl,
          url: productUrl,
          keywords: keywords.split(/[,，\n]+/).map(k => k.trim()).filter(k => k)
        }
      });
      notify.info("Dispatching optimization task to cluster...");
    } catch (err) {
      notify.error("Bridge connection failed. Cluster unreachable.");
      setIsProcessing(false);
      disconnect();
    }
  };

  const handleStopTask = () => {
    setIsProcessing(false);
    disconnect();
    notify.info("Task terminated by supervisor.");
  };

  const handleSubmitOtp = () => {
    if (!otpCode.trim()) return;
    try {
      sendCommand({ type: 'OTP_RESPONSE', otp: otpCode.trim() });
      setOtpRequired(false);
      setOtpPrompt('');
      setOtpCode('');
      notify.success("OTP Token transmitted.");
    } catch (err) {
      notify.error("Failed to transmit MFA token.");
    }
  };

  const queryPerformance = async () => {
    if (!user) return;
    setIsQuerying(true);
    try {
      const response = await fetch(`${API_BASE}/amazon/pollution/effect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({
          url: productUrl,
          keywords: keywords.split(/[,，\n]+/).map(k => k.trim()).filter(k => k),
          run_id: selectedRun || undefined
        })
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setPerformanceData(data.keyword_stats || []);
      notify.success("Performance metrics synchronized.");
    } catch (err) {
      notify.warning("Query server offline. Displaying simulation metrics.");
      const mockData: PerformanceMetric[] = keywords.split(/[,，\n]+/).map(k => k.trim()).filter(k => k).map((k) => ({
        keyword: k, hit: Math.floor(Math.random() * 6), ratio: Math.random()
      }));
      setPerformanceData(mockData);
    } finally { setIsQuerying(false); }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-1 overflow-hidden flex-1 tracking-tight">
      <div className="w-full lg:w-[380px] flex flex-col gap-4 overflow-y-auto custom-scrollbar lg:shrink-0">
        <div className="bg-app-surface/60 p-6 rounded-3xl border border-app-border shadow-xl backdrop-blur-md">
          <h2 className="text-lg font-bold flex items-center gap-2 text-amber-500 mb-6 uppercase tracking-wider">
            <Zap className="w-5 h-5 fill-current" /> {t('tool.amazon.title')}
          </h2>
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest block">Authentication (Amazon)</label>
              <div className="relative"><UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext w-4 h-4" />
                <input type="text" value={amazonUser} onChange={(e) => setAmazonUser(e.target.value)} placeholder={t('tool.amazon.username')} className="w-full bg-app-base border border-app-border rounded-xl py-2.5 pl-10 pr-4 text-app-text text-xs outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext w-4 h-4" />
                <input type="password" value={amazonPass} onChange={(e) => setAmazonPass(e.target.value)} placeholder={t('tool.amazon.password')} className="w-full bg-app-base border border-app-border rounded-xl py-2.5 pl-10 pr-4 text-app-text text-xs outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div className="relative"><Key className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext w-4 h-4" />
                <input type="text" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder={t('tool.amazon.login_url')} className="w-full bg-app-base border border-app-border rounded-xl py-2.5 pl-10 pr-4 text-app-text text-xs outline-none focus:border-amber-500 transition-colors" />
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest block">Targeting Details</label>
              <div className="relative"><LinkIcon className="absolute left-3 top-3 text-app-subtext w-4 h-4" />
                <textarea value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder={t('tool.amazon.url')} className="w-full bg-app-base border border-app-border rounded-xl py-2.5 pl-10 pr-4 text-app-text text-xs h-20 outline-none focus:border-amber-500 transition-colors resize-none" />
              </div>
              <div className="relative"><Tag className="absolute left-3 top-3 text-app-subtext w-4 h-4" />
                <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t('tool.amazon.keywords') + " (Comma separated)"} className="w-full bg-app-base border border-app-border rounded-xl py-2.5 pl-10 pr-4 text-app-text text-xs h-20 outline-none focus:border-amber-500 transition-colors resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={isProcessing ? handleStopTask : handleStartTask} disabled={isConnecting} className={`flex-1 py-3.5 rounded-2xl font-bold uppercase tracking-widest text-[11px] shadow-lg flex items-center justify-center gap-2 transition-all ${isProcessing ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-amber-900/30'}`}>
                {isConnecting ? <Loader2 className="animate-spin w-4 h-4" /> : isProcessing ? <StopCircle className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                {isConnecting ? 'Connecting' : isProcessing ? t('tool.amazon.stop') : t('tool.amazon.start')}
              </button>
              <button onClick={queryPerformance} disabled={isQuerying || keywords.length === 0} className="w-14 bg-app-surface-hover border border-app-border rounded-2xl flex items-center justify-center text-app-subtext hover:text-white transition-all disabled:opacity-20 shadow-lg">
                {isQuerying ? <Loader2 className="animate-spin w-4 h-4" /> : <BarChart3 className="w-5 h-5" />}
              </button>
            </div>
            {otpRequired && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3 animate-fade-up">
                <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">OTP Required</div>
                <div className="text-xs text-app-subtext">{otpPrompt}</div>
                <div className="flex gap-2">
                  <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="6-digit code" className="flex-1 bg-app-base border border-app-border rounded-xl py-2 px-3 text-app-text text-xs outline-none focus:border-amber-500 transition-colors" />
                  <button onClick={handleSubmitOtp} className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30">Submit</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-6 min-h-0">
        <div className="bg-black/80 rounded-3xl border border-app-border overflow-hidden flex flex-col flex-1 shadow-2xl">
          <div className="bg-white/5 px-6 py-3.5 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-3 text-[10px] font-bold text-amber-500 uppercase tracking-widest"><Terminal size={14} /> {t('tool.amazon.logs')}</div>
            <div className="flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-green-500 animate-pulse' : 'bg-app-subtext/20'}`} />
              <button onClick={() => setShowConsole(!showConsole)} className="text-app-subtext hover:text-white transition-colors">{showConsole ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
            </div>
          </div>
          {showConsole && (
            <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed custom-scrollbar bg-black/40">
              {logs.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-app-subtext/30"><Activity size={32} className="mb-4 opacity-10" /><p className="uppercase tracking-tighter">System standby - Link IDLE</p></div> :
                logs.map((log, i) => (
                  <div key={i} className={`mb-1.5 break-all ${log.stream === 'stderr' ? 'text-rose-400' : 'text-amber-100/70'}`}>
                    <span className="opacity-20 mr-3 text-[9px]">{new Date().toLocaleTimeString([], { hour12: false, minute:'2-digit', second:'2-digit' })}</span>
                    <span className="opacity-40 mr-2">[{log.stream.toUpperCase()}]</span>{log.line}
                  </div>
                ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
        {performanceData && (
          <div className="bg-app-surface/40 rounded-3xl border border-app-border p-6 animate-fade-up shrink-0 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-app-text flex items-center gap-2"><TableIcon size={16} className="text-amber-500" /> Rufus SEO Metrics</h3>
              <div className="flex items-center gap-3">
                <select value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)} className="bg-app-base border border-app-border rounded-lg px-2 py-1 text-[10px] text-app-text">
                  <option value="">Latest Run</option>
                  {runs.map((run) => <option key={run} value={run}>{run}</option>)}
                </select>
                <button onClick={queryPerformance} className="text-[10px] text-amber-500 font-bold uppercase hover:underline flex items-center gap-1"><RefreshCw size={10} /> Sync</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] text-app-subtext uppercase tracking-wider font-bold"><tr className="border-b border-app-border"><th className="pb-3 pr-4">Keyword</th><th className="pb-3 pr-4">Hit Count</th><th className="pb-3">Hit Rate</th></tr></thead>
                <tbody className="text-app-text">
                  {performanceData.map((row, idx) => (
                    <tr key={idx} className="border-b border-app-border/30 last:border-0 hover:bg-white/5 transition-colors">
                      <td className="py-3.5 font-medium">{row.keyword}</td><td className="py-3.5 font-mono">{row.hit}</td><td className="py-3.5"><div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-app-base rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.round(row.ratio * 100)}%` }} /></div>{(row.ratio * 100).toFixed(1)}%</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AmazonPollutionTool;
