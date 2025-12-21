
import React, { useState, useRef, useEffect } from 'react';
import { User as UserIcon, LogOut, CreditCard, ChevronDown, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthModal from './AuthModal';
import PaymentModal from './PaymentModal';

interface UserMenuProps {
  compact?: boolean;
}

const UserMenu: React.FC<UserMenuProps> = ({ compact = false }) => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          className={`bg-app-accent hover:bg-app-accent-hover text-white rounded-full text-sm font-medium transition-all shadow-lg shadow-app-accent/20 flex items-center justify-center gap-2 ${
            compact ? 'p-2' : 'px-4 py-2'
          }`}
        >
          <UserIcon size={compact ? 18 : 16} />
          {!compact && <span>{t('auth.login')}</span>}
        </button>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </>
    );
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex items-center rounded-full border border-app-border bg-app-surface/50 hover:bg-app-surface hover:border-app-subtext/50 transition-all group ${
            compact ? 'p-1' : 'p-1 pl-3 pr-2 gap-3'
          }`}
        >
          {!compact && (
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-app-text">{user.name}</div>
              <div className="text-[10px] text-app-accent font-medium flex items-center justify-end gap-1">
                {user.balance} {t('pay.credits')}
              </div>
            </div>
          )}
          <div className="relative shrink-0">
            <img 
              src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`} 
              alt={user.name} 
              className="w-8 h-8 rounded-full border border-app-border group-hover:border-app-accent transition-colors"
            />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-app-surface"></div>
          </div>
          {!compact && <ChevronDown size={14} className="text-app-subtext group-hover:text-app-text" />}
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-app-surface border border-app-border rounded-xl shadow-xl overflow-hidden z-50 animate-fade-up">
             <div className="p-4 border-b border-app-border bg-app-surface-hover/30">
                <p className="text-sm font-bold text-app-text">{user.name}</p>
                <p className="text-xs text-app-subtext truncate">{user.email}</p>
             </div>
             
             <div className="p-2">
               <div className="mb-2 px-2 py-2 bg-app-accent/10 rounded-lg flex items-center justify-between">
                  <span className="text-xs font-medium text-app-accent flex items-center gap-1">
                    <Sparkles size={12} /> {t('pay.balance')}
                  </span>
                  <span className="text-sm font-bold text-app-accent">{user.balance}</span>
               </div>

               <button
                 onClick={() => {
                   setIsMenuOpen(false);
                   setShowPaymentModal(true);
                 }}
                 className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-app-text hover:bg-app-surface-hover transition-colors text-left"
               >
                 <CreditCard size={16} className="text-app-subtext" />
                 <span>{t('pay.recharge')}</span>
               </button>

               <div className="my-1 border-t border-app-border"></div>

               <button
                 onClick={() => {
                   logout();
                   setIsMenuOpen(false);
                 }}
                 className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
               >
                 <LogOut size={16} />
                 <span>{t('auth.logout')}</span>
               </button>
             </div>
          </div>
        )}
      </div>
      
      <PaymentModal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} />
    </>
  );
};

export default UserMenu;
