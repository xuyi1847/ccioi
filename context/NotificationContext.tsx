
import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationContextType {
  notify: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((type: NotificationType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => removeNotification(id), 5000);
  }, [removeNotification]);

  const notify = {
    success: (msg: string) => addNotification('success', msg),
    error: (msg: string) => addNotification('error', msg),
    info: (msg: string) => addNotification('info', msg),
    warning: (msg: string) => addNotification('warning', msg),
  };

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed top-6 right-6 z-[20000] flex flex-col gap-3 w-80 pointer-events-none">
        {notifications.map((n) => (
          <div 
            key={n.id} 
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl animate-fade-in transition-all duration-300 ${
              n.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
              n.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
              n.type === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
              'bg-blue-500/10 border-blue-500/30 text-blue-400'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {n.type === 'success' && <CheckCircle2 size={18} />}
              {n.type === 'error' && <AlertCircle size={18} />}
              {n.type === 'warning' && <AlertTriangle size={18} />}
              {n.type === 'info' && <Info size={18} />}
            </div>
            <div className="flex-1 text-xs font-medium leading-relaxed uppercase tracking-tight">
              {n.message}
            </div>
            <button 
              onClick={() => removeNotification(n.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within NotificationProvider');
  return context;
};
