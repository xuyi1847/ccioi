import React, { useState } from 'react';
import { FileText, Loader2, List, Activity, Tag } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { analyzeText } from '../services/geminiService';
import { useLanguage } from '../context/LanguageContext';

const TextTool: React.FC = () => {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [analysisType, setAnalysisType] = useState<'SUMMARY' | 'SENTIMENT' | 'KEYWORDS'>('SUMMARY');
  const [result, setResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!text) return;
    setIsAnalyzing(true);
    try {
      const output = await analyzeText(text, analysisType);
      setResult(output);
    } catch (error) {
      console.error(error);
      setResult("Error analyzing text.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getIcon = () => {
    switch (analysisType) {
      case 'SUMMARY': return <List className="w-4 h-4" />;
      case 'SENTIMENT': return <Activity className="w-4 h-4" />;
      case 'KEYWORDS': return <Tag className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-6">
       <div className="flex flex-col h-full bg-app-surface/50 rounded-2xl border border-app-border p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-emerald-400">
            <FileText className="w-5 h-5" />
            {t('tool.text.title')}
          </h2>

          <div className="flex bg-app-surface-hover p-1 rounded-lg mb-4">
             {(['SUMMARY', 'SENTIMENT', 'KEYWORDS'] as const).map(type => (
               <button
                 key={type}
                 onClick={() => setAnalysisType(type)}
                 className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
                   analysisType === type 
                     ? 'bg-emerald-600 text-white shadow-md' 
                     : 'text-app-subtext hover:text-app-text'
                 }`}
               >
                 {t(`tool.text.${type.toLowerCase()}`)}
               </button>
             ))}
          </div>
          
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('tool.text.placeholder')}
            className="flex-1 w-full bg-app-surface-hover border border-app-border rounded-xl p-4 text-app-text focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none mb-4"
          />

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !text}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-white shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="animate-spin w-5 h-5" /> {t('pay.processing')}
              </>
            ) : (
              <>
                {getIcon()} {t('tool.text.analyze')}
              </>
            )}
          </button>
       </div>

       <div className="bg-app-base rounded-2xl border border-app-border p-6 overflow-y-auto">
          <h3 className="text-sm font-semibold text-app-subtext uppercase tracking-wider mb-4">Results</h3>
          {result ? (
            <div className="prose prose-invert prose-emerald max-w-none text-app-text">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-app-subtext text-center">
               <div>
                  <Activity className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>{t('tool.text.empty')}</p>
               </div>
            </div>
          )}
       </div>
    </div>
  );
};

export default TextTool;