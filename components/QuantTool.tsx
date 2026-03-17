import React from 'react';
import HomePage from '../real-time-fund/app/page.jsx';
import rtfCssHref from '../real-time-fund/app/globals.css?url';

const QuantTool: React.FC = () => {
  React.useEffect(() => {
    const id = 'rtf-runtime-stylesheet';
    const overrideId = 'rtf-runtime-overrides';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    let style = document.getElementById(overrideId) as HTMLStyleElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = rtfCssHref;
      document.head.appendChild(link);
    }
    if (!style) {
      style = document.createElement('style');
      style.id = overrideId;
      style.textContent = `
        .navbar {
          position: fixed !important;
          top: 0 !important;
        }
        @media (min-width: 1024px) {
          .navbar {
            left: calc(16px + 16rem) !important;
            right: 16px !important;
          }
        }
        @media (max-width: 1023px) {
          .navbar {
            left: 16px !important;
            right: 16px !important;
          }
        }
        @media (max-width: 640px) {
          .navbar {
            left: 0 !important;
            right: 0 !important;
          }
        }
        .navbar .actions { display: none !important; }
        .navbar .navbar-add-fund {
          flex: 1 1 720px !important;
          max-width: 760px !important;
        }
        @media (max-width: 1023px) {
          .navbar .navbar-add-fund {
            flex: 1 1 auto !important;
            max-width: none !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      const overrideEl = document.getElementById(overrideId);
      if (overrideEl && overrideEl.parentNode) overrideEl.parentNode.removeChild(overrideEl);
    };
  }, []);

  return <HomePage />;
};

export default QuantTool;
