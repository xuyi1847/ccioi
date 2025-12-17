import React, { useState, useEffect } from 'react';

interface LogoProps {
  size?: 'sm' | 'lg';
  autoAnimate?: boolean;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 'sm', autoAnimate = false, className = '' }) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (autoAnimate) {
      // Small delay to ensure render before animation starts
      const timer = setTimeout(() => {
        setActive(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoAnimate]);

  const toggle = () => setActive(!active);

  // Size classes
  // Reduced tracking and gap significantly
  const containerClass = size === 'lg' 
    ? "text-7xl md:text-8xl tracking-tighter gap-0" 
    : "text-xl tracking-tight gap-0";
  
  const bracketColor = active ? "text-app-accent" : "text-app-text";
  const innerColor = active ? "text-app-text" : "text-app-text";

  // Common transition styles for characters
  // Added margin transition to handle the spacing collapse/expand smoothly
  const charBase = "logo-char transition-all duration-500 ease-in-out";

  return (
    <div 
      className={`font-bold font-mono flex items-center justify-center cursor-pointer select-none group ${containerClass} ${className}`}
      onClick={toggle}
      onMouseEnter={() => !autoAnimate && setActive(true)}
      onMouseLeave={() => !autoAnimate && setActive(false)}
    >
      {/* First C -> ( */}
      <span className={`${charBase} ${bracketColor} ${active ? 'scale-110 mx-1' : 'mx-0.5'}`}>
        {active ? '(' : 'C'}
      </span>

      {/* Second C -> Disappears */}
      {/* Using max-w transition instead of width for smoother animation with flex */}
      <span 
        className={`${charBase} overflow-hidden whitespace-nowrap ${innerColor} ${
          active ? 'max-w-0 opacity-0 -mx-1' : 'max-w-[1ch] opacity-100 mx-0.5'
        }`}
      >
        C
      </span>

      {/* I -> i */}
      <span className={`${charBase} ${innerColor} ${active ? 'mx-0.5' : 'mx-0.5'}`}>
        {active ? 'i' : 'I'}
      </span>

      {/* O -> o */}
      <span className={`${charBase} ${innerColor} ${active ? 'mx-0.5' : 'mx-0.5'}`}>
        {active ? 'o' : 'O'}
      </span>

      {/* I -> i */}
      <span className={`${charBase} ${innerColor} ${active ? 'mx-0.5' : 'mx-0.5'}`}>
        {active ? 'i' : 'I'}
      </span>

      {/* Hidden -> ) */}
      <span 
        className={`${charBase} overflow-hidden whitespace-nowrap ${bracketColor} ${
          active ? 'max-w-[1ch] opacity-100 scale-110 mx-1' : 'max-w-0 opacity-0'
        }`}
      >
        {')'}
      </span>
    </div>
  );
};

export default Logo;