
import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  ImageIcon, 
  Video, 
  Mic, 
  FileText, 
  LayoutDashboard, 
  Menu,
  X,
  Play,
  Sparkles,
  History,
  Link as LinkIcon,
  Zap,
  TrendingUp
} from 'lucide-react';
import { AppView, ToolConfig } from './types';
import ChatTool from './components/ChatTool';
import ImageTool from './components/ImageTool';
import VideoTool from './components/VideoTool';
import AudioTool from './components/AudioTool';
import TextTool from './components/TextTool';
import HistoryTool from './components/HistoryTool';
import AmazonPollutionTool from './components/AmazonPollutionTool';
import QuantTool from './components/QuantTool';
import Logo from './components/Logo';
import AuthModal from './components/AuthModal';
import PaymentModal from './components/PaymentModal';
import { ThemeProvider } from './context/ThemeContext';
import ThemeSelector from './components/ThemeSelector';
import { AuthProvider } from './context/AuthContext';
import UserMenu from './components/UserMenu';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import LanguageSelector from './components/LanguageSelector';
import { SocketProvider } from './context/SocketContext';

// --- App Content Wrapper ---
const AppContent: React.FC = () => {
  const { t } = useLanguage();
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  
  // Centralized Modal States
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const tools: ToolConfig[] = [
    { id: AppView.CHAT, name: t('nav.chat'), description: t('nav.chat.desc'), icon: MessageSquare, color: 'text-indigo-400' },
    { id: AppView.IMAGE, name: t('nav.image'), description: t('nav.image.desc'), icon: ImageIcon, color: 'text-purple-400' },
    { id: AppView.VIDEO, name: t('nav.video'), description: t('nav.video.desc'), icon: Video, color: 'text-cyan-400' },
    { id: AppView.AUDIO, name: t('nav.audio'), description: t('nav.audio.desc'), icon: Mic, color: 'text-rose-400' },
    { id: AppView.TEXT_ANALYSIS, name: t('nav.text'), description: t('nav.text.desc'), icon: FileText, color: 'text-emerald-400' },
    { id: AppView.AMAZON_POLLUTION, name: t('nav.amazon'), description: t('nav.amazon.desc'), icon: Zap, color: 'text-amber-500' },
    { id: AppView.QUANTITATIVE_ANALYSIS, name: t('nav.quant'), description: t('nav.quant.desc'), icon: TrendingUp, color: 'text-green-500' },
    { id: AppView.HISTORY, name: t('nav.history'), description: t('nav.history.desc'), icon: History, color: 'text-app-subtext' },
  ];

  const demoVideos = [
    { id: 1, url: 'https://yisvideo.oss-cn-shanghai.aliyuncs.com/videos/ceshi1.mp4', label: 'Cinematic Portrait' },
    { id: 2, url: 'https://yisvideo.oss-cn-shanghai.aliyuncs.com/videos/ceshi2.mp4', label: 'AI Motion Concept' },
    { id: 3, url: 'https://yisvideo.oss-cn-shanghai.aliyuncs.com/videos/ceshi3.mp4', label: 'Runway Strides'}
  ];

  // Handle Intro Animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 3000); 
    return () => clearTimeout(timer);
  }, []);

  const renderContent = () => {
    switch (currentView) {
      case AppView.CHAT: return <ChatTool />;
      case AppView.IMAGE: return <ImageTool />;
      case AppView.VIDEO: return <VideoTool />;
      case AppView.AUDIO: return <AudioTool />;
      case AppView.TEXT_ANALYSIS: return <TextTool />;
      case AppView.AMAZON_POLLUTION: return <AmazonPollutionTool />;
      case AppView.QUANTITATIVE_ANALYSIS: return <QuantTool />;
      case AppView.HISTORY: return <HistoryTool />;
      default: return (
        <div className="flex-1 overflow-y-auto custom-scrollbar w-full">
          <div className="flex flex-col items-center gap-8 md:gap-16 py-4 md:py-8">
            <div className="text-center space-y-3 md:space-y-6 animate-fade-in-up px-4">
               <h1 className="text-2xl md:text-6xl font-bold text-app-text tracking-tight">
                 {t('app.welcome')} <span className="text-app-accent">CCIOI.com</span>
               </h1>
               <p className="text-app-subtext max-w-2xl mx-auto text-sm md:text-lg leading-relaxed">{t('app.subtitle')}</p>
            </div>
            
            <div className="w-full max-w-6xl px-4">
              <h2 className="text-[10px] md:text-sm font-bold text-app-subtext uppercase tracking-[0.3em] mb-4 md:mb-8 text-center">{t('app.modules')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                {tools.filter(t => t.id !== AppView.HISTORY).map((tool) => (
                  <button key={tool.id} onClick={() => setCurrentView(tool.id)} className="group bg-app-surface/40 hover:bg-app-surface border border-app-border p-4 md:p-6 rounded-2xl md:rounded-3xl transition-all hover:-translate-y-1 hover:border-app-accent/30 text-center relative overflow-hidden backdrop-blur-sm">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-app-base flex items-center justify-center mx-auto mb-3 md:mb-4 ${tool.color} group-hover:scale-110 transition-transform`}><tool.icon size={20} /></div>
                    <h3 className="text-sm md:text-base font-bold text-app-text mb-1 truncate">{tool.name}</h3>
                    <p className="text-app-subtext text-[10px] md:text-xs line-clamp-1">{tool.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full max-w-6xl px-4 pb-8 md:pb-12">
              <div className="flex items-center justify-between mb-6 md:mb-8">
                 <h2 className="text-lg md:text-xl font-bold text-app-text flex items-center gap-2 md:gap-3"><Sparkles className="text-app-accent w-5 h-5 md:w-6 md:h-6" />AI Studio Showcase</h2>
                 <div className="h-[1px] flex-1 bg-gradient-to-r from-app-border to-transparent ml-4 md:ml-6" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                 {demoVideos.map((video) => (
                   <div key={video.id} className="relative group aspect-[9/16] bg-app-surface rounded-2xl md:rounded-3xl border border-app-border overflow-hidden shadow-2xl transition-all hover:scale-[1.02] hover:border-app-accent/50">
                      <video src={video.url} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                         <span className="text-[10px] text-app-accent font-mono uppercase tracking-widest mb-1">Generated by CCIOI</span>
                         <p className="text-white text-sm font-bold">{video.label}</p>
                      </div>
                      <div className="absolute top-3 left-3 px-2 py-1 bg-black/30 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-1.5"><Play size={8} className="fill-white text-white" /><span className="text-[9px] font-bold text-white uppercase tracking-tighter">Demo</span></div>
                   </div>
                 ))}
                 <div className="hidden sm:flex flex-col items-center justify-center aspect-[9/16] bg-app-surface/20 border-2 border-dashed border-app-border rounded-2xl md:rounded-3xl text-app-subtext gap-3 p-6 text-center"><div className="w-12 h-12 rounded-full border border-app-border flex items-center justify-center"><Sparkles size={20} className="opacity-20" /></div><p className="text-xs">Your creation could be here. Start generating today.</p></div>
                 <div className="hidden sm:flex flex-col items-center justify-center aspect-[9/16] bg-app-surface/20 border-2 border-dashed border-app-border rounded-2xl md:rounded-3xl text-app-subtext gap-3 p-6 text-center"><div className="w-12 h-12 rounded-full border border-app-border flex items-center justify-center"><Video size={20} className="opacity-20" /></div><p className="text-xs text-balance">High-fidelity 9:16 portrait video production.</p></div>
              </div>
              <div className="mt-16 pt-8 border-t border-app-border text-center"><p className="text-xs text-app-subtext font-mono uppercase tracking-widest opacity-60">&copy; 2025 CCIOI.com // {t('app.icp')}</p></div>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="h-screen bg-app-base text-app-text flex overflow-hidden transition-colors duration-500">
      {showIntro && (
        <div className="fixed inset-0 z-[100] bg-app-base flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none animate-pulse" /><div className="absolute inset-0 bg-gradient-to-t from-app-base via-transparent to-transparent z-0" />
          <div className="z-10 flex flex-col items-center gap-12 w-full max-w-md px-8 text-center"><div className="transform scale-110 md:scale-125 mb-4"><Logo size="lg" autoAnimate={true} /></div><div className="flex flex-col items-center gap-2"><h2 className="text-app-text font-medium tracking-[0.4em] uppercase text-[10px] md:text-sm animate-fade-up" style={{ animationDelay: '0.8s' }}>Generative Intelligence</h2><p className="text-app-subtext text-[10px] font-mono animate-fade-up" style={{ animationDelay: '1.2s' }}>{t('app.initializing')}</p></div><div className="w-full max-w-[200px] h-[2px] bg-app-surface-hover rounded-full overflow-hidden mt-4 relative"><div className="absolute inset-0 bg-app-accent/50 blur-[2px] animate-progress" /><div className="h-full bg-app-accent animate-progress" /></div></div>
          <div className="absolute bottom-8 text-app-subtext text-[10px] font-mono uppercase tracking-widest z-10">v1.0.0 // {t('app.icp')}</div>
        </div>
      )}

      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-[60] lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-[70] w-64 bg-app-surface border-r border-app-border transform transition-transform duration-300 ease-in-out flex flex-col shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-20 flex items-center px-6 border-b border-app-border"><Logo size="sm" /><button onClick={() => setIsSidebarOpen(false)} className="lg:hidden ml-auto text-app-subtext"><X size={24} /></button></div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto"><button onClick={() => { setCurrentView(AppView.DASHBOARD); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === AppView.DASHBOARD ? 'bg-app-accent text-white shadow-lg shadow-app-accent/20' : 'text-app-subtext hover:bg-app-surface-hover hover:text-app-text'}`}><LayoutDashboard size={20} /><span className="font-medium">{t('nav.dashboard')}</span></button><div className="pt-6 pb-3 px-4 text-xs font-bold text-app-subtext uppercase tracking-widest">{t('app.modules')}</div>
          {tools.map((tool) => (
            <button key={tool.id} onClick={() => { setCurrentView(tool.id); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === tool.id ? 'bg-app-surface-hover text-app-text border border-app-border shadow-md' : 'text-app-subtext hover:bg-app-surface-hover hover:text-app-text'}`}><tool.icon size={20} className={currentView === tool.id ? tool.color : ''} /><span className="font-medium">{tool.name}</span></button>
          ))}</nav>
        <div className="p-4 border-t border-app-border"><p className="text-[10px] text-app-subtext font-mono text-center opacity-50">{t('app.icp')}</p></div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-20 flex items-center justify-between px-4 lg:px-8 border-b border-app-border bg-app-surface/90 backdrop-blur-md z-[60] shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-app-subtext hover:text-app-text transition-colors"><Menu size={20} /></button>
            <div className="lg:hidden"><Logo size="sm" /></div>
            {currentView !== AppView.DASHBOARD && (
              <div className="hidden lg:flex items-center gap-3 animate-fade-in"><div className="w-10 h-10 rounded-xl bg-app-base flex items-center justify-center text-app-accent border border-app-border">{(() => { const tool = tools.find(t => t.id === currentView); const Icon = tool?.icon || LayoutDashboard; return <Icon size={20} />; })()}</div><div><h2 className="text-sm font-bold text-app-text tracking-wide uppercase">{tools.find(t => t.id === currentView)?.name}</h2><p className="text-[10px] text-app-subtext font-medium opacity-60">CCIOI AI MODULE</p></div></div>
            )}
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="flex items-center gap-1 border-r border-app-border pr-3 md:pr-4 mr-1"><LanguageSelector /><ThemeSelector /></div>
            <UserMenu onOpenAuth={() => setIsAuthModalOpen(true)} onOpenPayment={() => setIsPaymentModalOpen(true)} />
          </div>
        </header>

        <div className="flex-1 flex flex-col min-h-0 relative p-4 lg:p-6 overflow-hidden">
           <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"><div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-app-accent/5 rounded-full blur-[100px]" /><div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-app-surface-hover/20 rounded-full blur-[100px]" /></div>
           <div className="relative z-10 max-w-7xl mx-auto w-full h-full flex flex-col min-h-0">
             {renderContent()}
           </div>
        </div>
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider><AuthProvider><SocketProvider><ThemeProvider><AppContent /></ThemeProvider></SocketProvider></AuthProvider></LanguageProvider>
  );
};

export default App;
