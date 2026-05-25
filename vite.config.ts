import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Added __dirname equivalent for ES modules to resolve path errors
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      optimizeDeps: {
        exclude: ['xlsx'],
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
            secure: false,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env': JSON.stringify({
          API_KEY: env.GEMINI_API_KEY || '',
          GEMINI_API_KEY: env.GEMINI_API_KEY || '',
          NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || '',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY: env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || '',
          NEXT_PUBLIC_IFLOW_API_KEY: env.NEXT_PUBLIC_IFLOW_API_KEY || '',
          NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL: env.NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL || '',
        }),
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
          '@': path.resolve(__dirname, 'real-time-fund'),
          'next/image': path.resolve(__dirname, 'services/nextImageShim.tsx'),
          react: path.resolve(__dirname, 'node_modules/react'),
          'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
          'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
          'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
          'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion'),
        }
      }
    };
});
