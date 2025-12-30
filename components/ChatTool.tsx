
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Lock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { streamChat } from '../services/geminiService';
import { Message } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

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

  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'welcome') {
      setMessages([{
        id: 'welcome',
        role: 'model',
        content: t('tool.chat.welcome'),
        timestamp: Date.now()
      }]);
    }
  }, [t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please login to chat.");
      return;
    }
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const modelMsgId = (Date.now() + 1).toString();
    // Start with empty content to facilitate typewriter effect
    setMessages(prev => [...prev, {
      id: modelMsgId,
      role: 'model',
      content: '', 
      timestamp: Date.now()
    }]);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      let accumulatedText = "";
      
      await streamChat(history, userMsg.content, (chunk) => {
        accumulatedText += chunk;
        setMessages(prev => prev.map(m => 
          m.id === modelMsgId ? { ...m, content: accumulatedText } : m
        ));
      });

    } catch (err) {
      setMessages(prev => prev.map(m => 
        m.id === modelMsgId ? { ...m, content: "Sorry, I encountered an error. Please try again." } : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-app-surface/50 rounded-2xl border border-app-border overflow-hidden shadow-2xl min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={scrollRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'model' ? 'bg-app-accent' : 'bg-app-surface-hover'
            }`}>
              {msg.role === 'model' ? <Bot size={18} className="text-white" /> : <User size={18} className="text-app-text" />}
            </div>
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'model' 
                ? 'bg-app-surface-hover text-app-text rounded-tl-none' 
                : 'bg-app-accent text-white rounded-tr-none'
            }`}>
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>
                  {msg.content || (msg.role === 'model' && isLoading && messages[messages.length-1].id === msg.id ? '▌' : '')}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1].role === 'user' && (
           <div className="flex items-start gap-3">
             <div className="w-8 h-8 rounded-full bg-app-accent flex items-center justify-center shrink-0">
               <Bot size={18} className="text-white" />
             </div>
             <div className="bg-app-surface-hover text-app-text p-3 rounded-2xl rounded-tl-none">
               <Loader2 className="animate-spin w-4 h-4" />
             </div>
           </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-app-surface border-t border-app-border shrink-0">
        <div className="flex gap-2 relative">
          {!user && (
            <div className="absolute inset-0 bg-app-surface/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl cursor-not-allowed">
              <span className="flex items-center gap-2 text-xs font-bold text-app-subtext">
                <Lock size={12} /> Login to unlock conversation
              </span>
            </div>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!user}
            placeholder={user ? t('tool.chat.placeholder') : 'Locked'}
            className="flex-1 bg-app-surface-hover border-transparent focus:border-app-accent focus:ring-0 rounded-xl px-4 py-3 text-app-text placeholder-app-subtext outline-none transition-all"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !user}
            className="bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all"
          >
            <Send size={20} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatTool;
