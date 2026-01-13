
import React, { useState, useRef, useEffect } from 'react';
import { 
  TrendingUp, 
  Loader2, 
  BarChart4, 
  RefreshCcw,
  Zap,
  MessageSquare,
  Send,
  Bot,
  User as UserIcon,
  ShieldCheck,
  Target,
  Info,
  ChevronRight
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Message } from '../types';

// --- API Response Types ---
interface AssetSignal {
  code: string;
  suggested_cap: number;
  policy_cap: number;
  final_cap: number;
  signal: {
    action: string;
    final_position: number;
    state: string;
    confidence: string;
    metrics: {
      asset_cap: number;
      target_position: number;
      recent_return_1d: number;
      drawdown_from_peak: number;
    };
  };
  summary: string;
}

interface QuantResult {
  portfolio_summary: string;
  assets: AssetSignal[];
  total_amount: number;
  total_position_amount: number;
}

/**
 * 递归着色组件：涨红 (+) 跌绿 (-)
 * 逻辑：仅匹配 [+ 或 -] 紧跟数字，不改变字号，不强制加粗。
 * 排除日期：2026-01-12 中的横杠会被忽略。
 */
const ColorizeNumbers = ({ children }: { children: any }): any => {
  if (!children) return null;

  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      // 匹配逻辑：匹配 [+-]数字[%]
      // 使用正则拆分，保留匹配项。排除掉前面直接连接数字的情况以避开日期。
      const regex = /((?<!\d)[+-]\d+(?:\.\d+)?%?)/g;
      const parts = child.split(regex);

      return parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('+')) {
          return <span key={i} className="text-red-500">{part}</span>;
        }
        if (part.startsWith('-')) {
          return <span key={i} className="text-green-500">{part}</span>;
        }
        return part;
      });
    }
    
    if (React.isValidElement(child) && (child.props as any).children) {
      return React.cloneElement(child as React.ReactElement, {}, 
        <ColorizeNumbers>{(child.props as any).children}</ColorizeNumbers>
      );
    }

    return child;
  });
};

/**
 * Markdown 结构修复器
 */
const robustFixMarkdown = (text: string) => {
  if (!text) return "";
  let result = text;
  result = result.replace(/([^\n|])\n(\|)/g, '$1\n\n$2');
  result = result.replace(/(\|[:\-\s|]+\|)([^\n])/g, '$1\n$2');
  result = result.replace(/\|\|\s*/g, '|\n|');
  result = result.replace(/([^\n])\s*(#{1,6}\s)/g, '$1\n\n$2');
  return result;
};

// Markdown 自定义组件
const MarkdownComponents = {
  table: ({ children }: any) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-app-border bg-black/40 shadow-inner">
      <table className="w-full text-left text-[11px] border-collapse min-w-[350px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-app-surface/80 text-app-text font-bold border-b border-app-border uppercase">
      {children}
    </thead>
  ),
  th: ({ children }: any) => <th className="p-2.5 border-r border-app-border/30 last:border-r-0">{children}</th>,
  tr: ({ children }: any) => <tr className="border-b border-app-border/20 last:border-0 hover:bg-app-accent/5 transition-colors">{children}</tr>,
  td: ({ children }: any) => (
    <td className="p-2.5 border-r border-app-border/20 last:border-r-0 whitespace-nowrap text-app-text">
      <ColorizeNumbers>{children}</ColorizeNumbers>
    </td>
  ),
  h1: ({ children }: any) => <h1 className="text-lg font-bold text-white mt-6 mb-3 border-b border-app-border pb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-bold text-white mt-5 mb-2 flex items-center gap-2"><div className="w-1 h-3.5 bg-app-accent rounded-full" />{children}</h2>,
  p: ({ children }: any) => <p className="mb-3 leading-relaxed text-[13px] text-app-text/90 italic-none"><ColorizeNumbers>{children}</ColorizeNumbers></p>,
  ul: ({ children }: any) => <ul className="list-disc pl-4 mb-4 space-y-1.5 text-[13px] text-app-text/90">{children}</ul>,
  li: ({ children }: any) => <li className="pl-1 italic-none"><ColorizeNumbers>{children}</ColorizeNumbers></li>,
  strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
  em: ({ children }: any) => <span className="italic-none">{children}</span>, 
};

const QuantTool: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  
  const [codes, setCodes] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiConclusion, setAiConclusion] = useState<string | null>(null);
  const [quantData, setQuantData] = useState<QuantResult | null>(null);

  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      id: 'quant-welcome',
      role: 'model',
      content: '量化策略终端已就绪。输入资产代码，我将同步调用实时量化接口并进行多维度解读。',
      timestamp: Date.now()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = IS_DEV ? 'http://127.0.0.1:8000' : 'https://www.ccioi.com/api';

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleAnalyze = async () => {
    if (!user) return;
    const assetList = codes.split(/[,，\s]+/).map(c => c.trim()).filter(c => c);
    if (assetList.length === 0) return;

    setIsAnalyzing(true);
    setAiConclusion(null);
    setQuantData(null);

    try {
      const response = await fetch(`${API_BASE}/quant/evaluate_assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ fund_codes: assetList, total_amount: Number(totalAmount) || undefined })
      });
      const result: QuantResult = await response.json();
      setQuantData(result);

      // AI Interpretive Report
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `你是一个专业的金融分析师。请根据以下量化数据生成一份深度解读报告：
        1. 组合汇总: ${result.portfolio_summary}
        2. 详细资产状态: ${JSON.stringify(result.assets)}
        要求：
        - 使用 Markdown 格式。
        - 必须包含具体的风险评估、市场位置判断和最终建议。
        - 严禁使用斜体样式。
        - 对上涨数值必须显式标注 +，下跌标注 -。`,
      });
      setAiConclusion(aiResponse.text || "");
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !chatInput.trim() || isChatLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    const modelMsgId = (Date.now() + 1).toString();
    setChatMessages(prev => [...prev, { id: modelMsgId, role: 'model', content: '', timestamp: Date.now() }]);

    try {
      const history = chatMessages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content }));
      const response = await fetch(`${API_BASE}/quant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ messages: [...history, { role: 'user', content: userMsg.content }], stream: true })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";
      let sseBuffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || "";

          let updated = false;
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const content = line.trim().slice(6);
              if (content !== '[DONE]') {
                accumulatedText += content;
                updated = true;
              }
            }
          }
          if (updated) {
            setChatMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, content: accumulatedText } : m));
          }
        }
      }
    } catch (err) {
      setChatMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, content: "终端连接超时" } : m));
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col xl:flex-row h-full gap-6 p-1 overflow-hidden flex-1 text-app-text">
      {/* Parameters Panel */}
      <div className="w-full xl:w-80 flex flex-col gap-5 overflow-y-auto custom-scrollbar xl:shrink-0">
        <div className="bg-app-surface p-6 rounded-[2rem] border border-app-border shadow-2xl">
          <h2 className="text-xs font-bold text-app-accent mb-8 uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-4 h-4 fill-current" /> Quantum Computing
          </h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest px-1">资产代码列表</label>
              <textarea 
                value={codes} 
                onChange={(e) => setCodes(e.target.value)} 
                placeholder="例如: 016841, 001194" 
                className="w-full bg-[#050505] border border-app-border rounded-2xl p-4 text-[13px] text-white h-36 outline-none focus:border-app-accent transition-all font-mono placeholder:text-app-subtext/20" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-app-subtext uppercase tracking-widest px-1">拟定投入资金</label>
              <input 
                type="number" 
                value={totalAmount} 
                onChange={(e) => setTotalAmount(e.target.value)} 
                placeholder="1,000,000" 
                className="w-full bg-[#050505] border border-app-border rounded-2xl p-4 text-[13px] text-white outline-none focus:border-app-accent transition-all font-mono placeholder:text-app-subtext/20" 
              />
            </div>
            <button 
              onClick={handleAnalyze} 
              disabled={isAnalyzing} 
              className={`w-full py-4 rounded-2xl font-bold uppercase text-[11px] tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                isAnalyzing 
                ? 'bg-app-surface text-app-subtext cursor-not-allowed opacity-50' 
                : 'bg-app-accent text-white hover:bg-app-accent-hover shadow-app-accent/30'
              }`}
            >
              {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCcw className="w-4 h-4" />}
              {isAnalyzing ? '引擎计算中...' : '启动深度量化分析'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Analysis Results */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden min-h-0">
        <div className="bg-app-surface/30 rounded-[2.5rem] border border-app-border flex-1 flex flex-col min-h-0 relative overflow-hidden backdrop-blur-sm">
          {!isAnalyzing && !quantData && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-20">
              <BarChart4 size={64} strokeWidth={1} />
              <p className="text-xs font-bold uppercase tracking-widest mt-6">等待策略指令</p>
            </div>
          )}

          {isAnalyzing && (
            <div className="absolute inset-0 z-50 bg-app-base/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
              <div className="w-16 h-16 border-4 border-app-accent/20 border-t-app-accent rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.4em] text-app-accent">实时内核数据对接中</p>
                <p className="text-[9px] text-app-subtext mt-2 font-mono">FIN_QUANT_INTERFACE_ACTIVE</p>
              </div>
            </div>
          )}

          {quantData && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-10 space-y-10">
              {/* Summary Area */}
              <div className="border-b border-app-border pb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2 h-2 rounded-full bg-app-accent animate-pulse" />
                  <span className="text-[10px] font-bold text-app-accent uppercase tracking-widest">核心分析结论</span>
                </div>
                <h2 className="text-2xl font-bold text-white leading-tight">
                  <ColorizeNumbers>{quantData.portfolio_summary}</ColorizeNumbers>
                </h2>
              </div>

              {/* Individual Asset Signal Cards */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck size={16} className="text-app-subtext" />
                  <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">分项资产信号详情</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quantData.assets.map((asset, i) => (
                    <div key={i} className="bg-black/30 border border-app-border rounded-3xl p-6 hover:border-app-accent/40 transition-all flex flex-col gap-5 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xl font-mono font-bold text-white flex items-center gap-2">
                             {asset.code}
                             <ChevronRight size={14} className="opacity-20" />
                          </div>
                          <div className="text-[10px] text-app-subtext uppercase mt-1 flex items-center gap-1.5 font-bold">
                            <Target size={10} className="text-app-accent" /> {asset.signal.state}
                          </div>
                        </div>
                        <div className={`px-4 py-1 rounded-full text-[10px] font-bold tracking-widest ${
                          asset.signal.action === 'HOLD' ? 'bg-amber-500/20 text-amber-500' : 'bg-app-accent/20 text-app-accent'
                        }`}>
                          {asset.signal.action}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-app-base/60 p-3.5 rounded-2xl border border-app-border/20">
                          <div className="text-[9px] text-app-subtext uppercase font-bold mb-1 opacity-60">单日回报 (1D)</div>
                          <div className="text-sm font-mono font-bold">
                            <ColorizeNumbers>
                              {asset.signal.metrics.recent_return_1d >= 0 ? '+' : ''}
                              {(asset.signal.metrics.recent_return_1d * 100).toFixed(2)}%
                            </ColorizeNumbers>
                          </div>
                        </div>
                        <div className="bg-app-base/60 p-3.5 rounded-2xl border border-app-border/20">
                          <div className="text-[9px] text-app-subtext uppercase font-bold mb-1 opacity-60">峰值回撤</div>
                          <div className="text-sm font-mono font-bold">
                            <ColorizeNumbers>
                              {asset.signal.metrics.drawdown_from_peak > 0 ? '+' : ''}
                              {(asset.signal.metrics.drawdown_from_peak * 100).toFixed(2)}%
                            </ColorizeNumbers>
                          </div>
                        </div>
                      </div>

                      <div className="text-[12px] text-app-text/70 bg-black/40 p-4 rounded-2xl leading-relaxed italic-none flex gap-3">
                        <Info size={14} className="shrink-0 text-app-accent opacity-50" />
                        <span>{asset.summary}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Conclusion Report */}
              <div className="pt-8 border-t border-app-border">
                <div className="flex items-center gap-3 mb-6">
                  <Bot size={18} className="text-app-accent" />
                  <span className="text-[10px] font-bold text-app-accent uppercase tracking-widest">AI 多因子深度解读</span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none">
                  {aiConclusion && (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                      {robustFixMarkdown(aiConclusion)}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side Intelligence Feed (Chat) */}
      <div className="w-full xl:w-[380px] flex flex-col bg-app-surface/90 rounded-[2.5rem] border border-app-border overflow-hidden shadow-2xl h-[550px] xl:h-full backdrop-blur-md">
        <div className="p-6 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-app-accent/10 flex items-center justify-center text-app-accent shadow-inner"><MessageSquare size={16} /></div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-white block">AI 策略咨询助手</span>
              <span className="text-[9px] text-app-accent/60 font-mono">CCIOI_QUANT_READY</span>
            </div>
          </div>
          {isChatLoading && <Loader2 size={14} className="animate-spin text-app-accent" />}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={chatScrollRef}>
          {chatMessages.map((msg, idx) => {
            const isLastModel = isChatLoading && idx === chatMessages.length - 1 && msg.role === 'model';
            return (
              <div key={msg.id} className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'model' ? 'bg-app-accent text-white' : 'bg-white/10 text-app-text border border-white/5'}`}>
                  {msg.role === 'model' ? <Bot size={14} /> : <UserIcon size={14} />}
                </div>
                <div className={`max-w-[85%] p-4 rounded-2xl text-[12px] border ${
                  msg.role === 'model' 
                    ? 'bg-black/50 text-app-text border-app-border rounded-tl-none shadow-sm' 
                    : 'bg-app-accent text-white border-none rounded-tr-none shadow-lg'
                }`}>
                  <div className="prose prose-invert prose-sm max-w-none relative italic-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                      {robustFixMarkdown(msg.content)}
                    </ReactMarkdown>
                    {isLastModel && <span className="inline-block w-1.5 h-3.5 bg-app-accent ml-1 animate-pulse align-middle" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleChatSubmit} className="p-5 bg-black/40 border-t border-app-border">
          <div className="flex gap-3 relative">
            {!user && <div className="absolute inset-0 bg-app-surface/95 backdrop-blur-md z-10 flex items-center justify-center rounded-2xl text-[10px] font-bold uppercase tracking-widest text-app-subtext">锁定状态：请先登录</div>}
            <input 
              type="text" 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)} 
              disabled={!user || isChatLoading} 
              placeholder="询问量化详情或个股分析..." 
              className="flex-1 bg-[#050505] border border-app-border rounded-2xl px-5 py-3.5 text-[12px] text-white outline-none focus:border-app-accent transition-all placeholder:text-app-subtext/40 shadow-inner" 
            />
            <button 
              type="submit" 
              disabled={isChatLoading || !chatInput.trim() || !user} 
              className="bg-app-accent hover:bg-app-accent-hover text-white p-3.5 rounded-2xl shadow-xl transition-all active:scale-95"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuantTool;
