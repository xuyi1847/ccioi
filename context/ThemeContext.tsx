import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 
  | 'nebula' 
  | 'midnight' 
  | 'forest' 
  | 'sunset' 
  | 'ocean' 
  | 'berry' 
  | 'royal' 
  | 'coffee' 
  | 'mint' 
  | 'crimson' 
  | 'void' 
  | 'cyber';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('nebula');

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    root.classList.remove(
      'theme-midnight', 
      'theme-forest', 
      'theme-sunset',
      'theme-ocean',
      'theme-berry',
      'theme-royal',
      'theme-coffee',
      'theme-mint',
      'theme-crimson',
      'theme-void',
      'theme-cyber'
    );
    
    // Add current theme class (unless default 'nebula')
    if (theme !== 'nebula') {
      root.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};