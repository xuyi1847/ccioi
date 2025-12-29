
import React, { useState } from 'react';
import { X, Mail, User as UserIcon, ArrowRight, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // Visual only
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(email);
      } else {
        if (!name) throw new Error("Name is required");
        await register(email, name);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center p-4 bg-black/85 backdrop-blur-xl overflow-y-auto overflow-x-hidden">
      {/* Scrollable Container Wrapper */}
      <div className="w-full flex items-center justify-center min-h-full py-8">
        <div className="w-full max-w-md bg-app-surface border border-app-border rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden relative transition-all duration-300 opacity-0 animate-[fadeIn_0.3s_ease-out_forwards] flex flex-col pointer-events-auto">
          
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-app-subtext hover:text-app-text transition-colors z-[10001] p-1 bg-app-surface/50 rounded-full"
          >
            <X size={20} />
          </button>

          <div className="p-6 md:p-10">
            <div className="text-center mb-6 md:mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-app-text mb-2">
                {isLogin ? t('auth.welcome_back') : t('auth.create_account')}
              </h2>
              <p className="text-app-subtext text-xs md:text-sm">
                {isLogin ? 'Enter your details to access CCIOI tools' : 'Join us to explore the power of Generative AI'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              {!isLogin && (
                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-xs font-bold text-app-subtext uppercase tracking-wider">{t('auth.name')}</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext w-4 h-4" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your Name"
                      className="w-full bg-app-surface-hover border border-app-border rounded-xl py-3 pl-10 pr-4 text-app-text text-sm outline-none focus:border-app-accent transition-colors shadow-inner"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] md:text-xs font-bold text-app-subtext uppercase tracking-wider">{t('auth.email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext w-4 h-4" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-app-surface-hover border border-app-border rounded-xl py-3 pl-10 pr-4 text-app-text text-sm outline-none focus:border-app-accent transition-colors shadow-inner"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] md:text-xs font-bold text-app-subtext uppercase tracking-wider">{t('auth.password')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext w-4 h-4" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-app-surface-hover border border-app-border rounded-xl py-3 pl-10 pr-4 text-app-text text-sm outline-none focus:border-app-accent transition-colors shadow-inner"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-red-400 text-xs text-center bg-red-900/20 p-3 rounded-lg border border-red-900/30">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white py-3.5 rounded-xl font-bold transition-all shadow-xl shadow-app-accent/30 flex items-center justify-center gap-2 mt-4 text-sm tracking-wide"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                  <>
                    {isLogin ? t('auth.login_action') : t('auth.signup_action')} <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-app-subtext text-xs md:text-sm">
                {isLogin ? t('auth.no_account') : t('auth.have_account')}{' '}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-app-accent hover:underline font-bold"
                >
                  {isLogin ? t('auth.signup_action') : t('auth.login_action')}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
