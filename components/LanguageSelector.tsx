import React, { useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { languages } from '../locales/resources';

const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full text-app-subtext hover:text-app-text hover:bg-app-surface-hover transition-colors"
        title="Select Language"
      >
        <Globe size={20} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-app-surface border border-app-border rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
            {languages.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  language === l.code 
                    ? 'bg-app-surface-hover text-app-text' 
                    : 'text-app-subtext hover:bg-app-surface-hover/50 hover:text-app-text'
                }`}
              >
                <span className="text-lg">{l.flag}</span>
                <span className="flex-1 text-left">{l.name}</span>
                {language === l.code && <Check size={14} className="text-app-accent" />}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Click outside closer overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default LanguageSelector;