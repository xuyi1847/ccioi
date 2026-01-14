
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Lock, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

/**
 * 针对流式输出优化的 Markdown 修复器
 */
const fixMarkdownStreaming = (text: string) => {
  if (!text) return "";
  let formatted = text;
  // 补齐标题前后的换行
  formatted = formatted.replace(/([^\n])\s*(#{1,6}\s+)/g, '$1\n\n$2');
  // 确保表格起始前有换行
  formatted = formatted.replace(/([^\n])\s*(\|(?!\s*\|))/g, '$1\n\n$2');
  // 转换常见的流式表格行拼接符 ||
  formatted = formatted.replace(/\|\|\s*/g, '|\n|');
  return formatted;
};

const MarkdownComponents = {
  table: ({ children }: any) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 shadow-md">
      <table className="w-full text-left text-xs border-collapse min-w-[200px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-white/5 text-app-subtext uppercase font-bold border-b border-white/10">{children}</thead>,
  th: ({ children }: any) => <th className="p-3 font-semibold border-r border-white/5 last:border-r-0">{children}</th>,
  td: ({ children }: any) => <td className="p-3 border-b border-white/5 border-r border-white/5 last:border-r-0 leading-relaxed">{children}</td>,
  a: ({ children, href }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-app-accent hover:underline inline-flex items-center gap-1 font-bold">
      {children} <ExternalLink size={10} />
    </a>
  ),
  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
  h1: ({ children }: any) => <h1 className="text-lg font-bold text-white mt-4 mb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-bold text-white mt-3 mb-2">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-bold text-white mt-2 mb-1">{children}</h3>,
  code: ({ children }: any) => <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-indigo-300 text-[11px]">{children}</code>,
};

const ChatTool: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content: t('tool.chat.welcome'),
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = IS_DEV ? 'http://127.0.0.1:8000' : 'https://www.ccioi.com/api';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const modelMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: modelMsgId, role: 'model', content: '', timestamp: Date.now() }]);

    try {
      const history = messages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content }));
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are the CCIOI AI Assistant. Do not reveal or discuss model identity, training data, or provider details. If asked, say you are a CCIOI assistant and cannot disclose internal implementation details. Be helpful and concise.'
            },
            ...history,
            { role: 'user', content: userMsg.content }
          ],
          stream: true
        })
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
            setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, content: accumulatedText } : m));
          }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, content: "系统终端连接异常。" } : m));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-app-surface/50 rounded-2xl border border-app-border overflow-hidden shadow-2xl flex-1">
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar" ref={scrollRef}>
        {messages.map((msg, idx) => {
          const isLastModel = isLoading && idx === messages.length - 1 && msg.role === 'model';
          return (
            <div key={msg.id} className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'model' ? 'bg-app-accent text-white' : 'bg-app-surface-hover text-app-text'}`}>
                {msg.role === 'model' ? <Bot size={20} /> : <User size={20} />}
              </div>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm border overflow-hidden ${msg.role === 'model' ? 'bg-app-surface-hover/80 text-app-text border-white/5 rounded-tl-none' : 'bg-app-accent text-white border-app-accent/20 rounded-tr-none shadow-lg'}`}>
                <div className="prose prose-sm prose-invert max-w-none relative">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                    {fixMarkdownStreaming(msg.content)}
                  </ReactMarkdown>
                  {isLastModel && <span className="inline-block w-1.5 h-3.5 bg-app-accent ml-1 animate-pulse align-middle" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-app-surface border-t border-app-border shrink-0">
        <div className="flex gap-2 relative">
          {!user && <div className="absolute inset-0 bg-app-surface/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl text-xs font-bold text-app-subtext">请先登录解锁对话功能</div>}
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={!user || isLoading} placeholder="输入您的问题..." className="flex-1 bg-app-surface-hover border border-transparent focus:border-app-accent rounded-xl px-4 py-3 text-sm text-app-text outline-none transition-all" />
          <button type="submit" disabled={isLoading || !input.trim() || !user} className="bg-app-accent hover:bg-app-accent-hover text-white p-3 rounded-xl shadow-lg transition-all active:scale-95">
            <Send size={20} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatTool;
