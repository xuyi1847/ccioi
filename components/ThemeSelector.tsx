import React, { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme, Theme } from '../context/ThemeContext';

const themes: { id: Theme; name: string; color: string }[] = [
  { id: 'nebula', name: 'Nebula', color: '#6366f1' },   // Indigo
  { id: 'midnight', name: 'Midnight', color: '#3b82f6' }, // Blue
  { id: 'forest', name: 'Forest', color: '#10b981' },    // Emerald
  { id: 'sunset', name: 'Sunset', color: '#f97316' },    // Orange
  { id: 'ocean', name: 'Ocean', color: '#22d3ee' },      // Cyan
  { id: 'berry', name: 'Berry', color: '#ec4899' },      // Pink
  { id: 'royal', name: 'Royal', color: '#8b5cf6' },      // Violet
  { id: 'coffee', name: 'Coffee', color: '#f59e0b' },    // Amber
  { id: 'mint', name: 'Mint', color: '#2dd4bf' },        // Teal
  { id: 'crimson', name: 'Crimson', color: '#e11d48' },  // Rose
  { id: 'void', name: 'Void', color: '#d4d4d4' },        // Neutral
  { id: 'cyber', name: 'Cyber', color: '#84cc16' },      // Lime
];

const ThemeSelector: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full text-app-subtext hover:text-app-text hover:bg-app-surface-hover transition-colors"
        title="Select Theme"
      >
        <Palette size={20} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-app-surface border border-app-border rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-2 grid grid-cols-1 gap-1 max-h-[80vh] overflow-y-auto">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  theme === t.id 
                    ? 'bg-app-surface-hover text-app-text' 
                    : 'text-app-subtext hover:bg-app-surface-hover/50 hover:text-app-text'
                }`}
              >
                <div 
                  className="w-4 h-4 rounded-full shadow-sm shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                <span className="flex-1 text-left">{t.name}</span>
                {theme === t.id && <Check size={14} className="text-app-accent" />}
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

export default ThemeSelector;