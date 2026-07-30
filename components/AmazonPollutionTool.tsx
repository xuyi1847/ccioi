import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  FileText,
  Globe2,
  History,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
  Quote,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';

interface GeoIssue {
  priority: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  fix: string;
}

interface GeoReport {
  report_id?: string;
  overall_score: number;
  summary: string;
  scores: Record<string, number>;
  strengths: string[];
  issues: GeoIssue[];
  recommended_faqs: Array<{ question: string; answer_outline: string }>;
  content_brief: {
    suggested_title: string;
    suggested_description: string;
    sections: string[];
    schema_types: string[];
  };
  citation_ready_passage: string;
  page: {
    final_url: string;
    title: string;
    description: string;
    headings: string[];
    json_ld_count: number;
    word_count: number;
  };
}

interface SavedGeoReport {
  id: string;
  brand: string;
  target_url: string;
  result: GeoReport;
  created_at: string;
}

const scoreLabels: Record<string, string> = {
  entity_clarity: '实体清晰度',
  answerability: '问题可回答性',
  evidence: '证据与可引用性',
  structure: '内容结构',
  trust: '可信度信号',
};

const priorityStyle = {
  high: 'bg-red-500/10 text-red-400 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

const clampScore = (score: number) => Math.max(0, Math.min(100, Number(score) || 0));

const AmazonPollutionTool: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { notify } = useNotification();
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState('');
  const [keywords, setKeywords] = useState('');
  const [audience, setAudience] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<GeoReport | null>(null);
  const [savedReports, setSavedReports] = useState<SavedGeoReport[]>([]);
  const [error, setError] = useState('');
  const API_BASE = ((import.meta as any).env?.VITE_API_BASE || '/api').replace(/\/$/, '');

  const keywordList = useMemo(
    () => keywords.split(/[,，\n]+/).map((value) => value.trim()).filter(Boolean),
    [keywords],
  );

  const loadReports = async () => {
    if (!user?.token) return;
    try {
      const response = await fetch(`${API_BASE}/geo/reports?limit=20`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setSavedReports(Array.isArray(data.reports) ? data.reports : []);
    } catch {}
  };

  useEffect(() => {
    loadReports();
  }, [user?.id]);

  const analyze = async () => {
    if (!user) {
      notify.error('请先登录后使用 GEO 分析');
      return;
    }
    if (!url.trim() || !brand.trim()) {
      notify.warning('请填写目标页面和品牌/实体名称');
      return;
    }
    setIsAnalyzing(true);
    setError('');
    setReport(null);
    try {
      const response = await fetch(`${API_BASE}/geo/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          url: url.trim(),
          brand: brand.trim(),
          keywords: keywordList,
          audience: audience.trim(),
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'GEO 分析失败');
      setReport(data);
      loadReports();
      notify.success('GEO 分析完成');
    } catch (err: any) {
      setError(err.message || 'GEO 分析失败');
      notify.error(err.message || 'GEO 分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-1">
      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
        <section className="bg-app-surface/60 p-6 rounded-3xl border border-app-border shadow-xl backdrop-blur-md h-fit">
          <div className="mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-violet-400">
              <Globe2 className="w-5 h-5" /> GEO 分析
            </h2>
            <p className="text-xs text-app-subtext mt-2 leading-relaxed">
              检查页面是否容易被 ChatGPT、DeepSeek、Perplexity 等生成式搜索引擎理解、引用和推荐。
            </p>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">目标页面 *</span>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-3.5 w-4 h-4 text-app-subtext" />
                <textarea
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/product"
                  className="w-full h-20 bg-app-base border border-app-border rounded-xl py-3 pl-10 pr-3 text-xs text-app-text outline-none focus:border-violet-500 resize-none"
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">品牌 / 产品 / 实体 *</span>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-subtext" />
                <input
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  placeholder="例如：CCIOI"
                  className="w-full bg-app-base border border-app-border rounded-xl py-3 pl-10 pr-3 text-xs text-app-text outline-none focus:border-violet-500"
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">目标问题 / 关键词</span>
              <div className="relative">
                <Tag className="absolute left-3 top-3.5 w-4 h-4 text-app-subtext" />
                <textarea
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="AI 视频生成，基金估值工具，生成式 AI 平台"
                  className="w-full h-24 bg-app-base border border-app-border rounded-xl py-3 pl-10 pr-3 text-xs text-app-text outline-none focus:border-violet-500 resize-none"
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-bold text-app-subtext uppercase tracking-widest">目标受众</span>
              <div className="relative">
                <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-subtext" />
                <input
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="例如：寻找 AI 工具的内容创作者"
                  className="w-full bg-app-base border border-app-border rounded-xl py-3 pl-10 pr-3 text-xs text-app-text outline-none focus:border-violet-500"
                />
              </div>
            </label>

            <button
              onClick={analyze}
              disabled={isAnalyzing}
              className="w-full py-3.5 rounded-2xl font-bold text-xs bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {isAnalyzing ? '正在抓取并分析页面…' : '开始 GEO 分析'}
            </button>

            {savedReports.length > 0 && (
              <div className="pt-2 border-t border-app-border">
                <div className="flex items-center gap-2 text-[10px] font-bold text-app-subtext uppercase tracking-widest mb-2">
                  <History className="w-3.5 h-3.5" /> 历史报告
                </div>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const selected = savedReports.find((item) => item.id === event.target.value);
                    if (!selected) return;
                    setReport({ ...selected.result, report_id: selected.id });
                    setBrand(selected.brand);
                    setUrl(selected.target_url);
                  }}
                  className="w-full bg-app-base border border-app-border rounded-xl py-2.5 px-3 text-xs text-app-text outline-none focus:border-violet-500"
                >
                  <option value="">选择已保存的 GEO 报告</option>
                  {savedReports.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.brand} · {new Date(item.created_at).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                {error}
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 space-y-6">
          {!report && !isAnalyzing && (
            <div className="min-h-[520px] rounded-3xl border border-dashed border-app-border bg-app-surface/30 flex items-center justify-center text-center p-8">
              <div className="max-w-md">
                <Sparkles className="w-12 h-12 mx-auto text-violet-400/30 mb-4" />
                <h3 className="text-app-text font-bold">让内容更容易进入 AI 答案</h3>
                <p className="text-xs text-app-subtext mt-2 leading-relaxed">
                  系统会分析实体定义、答案密度、事实证据、内容结构、可信度和结构化数据，并生成可直接执行的修改方案。
                </p>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="min-h-[520px] rounded-3xl border border-app-border bg-app-surface/30 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-violet-400 mx-auto" />
                <p className="text-sm text-app-text mt-4">正在构建 GEO 报告</p>
                <p className="text-xs text-app-subtext mt-1">抓取页面、识别实体、评估可引用性</p>
              </div>
            </div>
          )}

          {report && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5">
                <div className="rounded-3xl border border-app-border bg-app-surface/60 p-6 flex flex-col items-center justify-center">
                  <div className="relative w-32 h-32 rounded-full flex items-center justify-center bg-app-base border-8 border-violet-500/20">
                    <span className="text-4xl font-black text-violet-400">{clampScore(report.overall_score)}</span>
                    <span className="absolute bottom-7 text-[9px] text-app-subtext">/ 100</span>
                  </div>
                  <div className="mt-4 text-sm font-bold text-app-text">GEO 综合评分</div>
                </div>
                <div className="rounded-3xl border border-app-border bg-app-surface/60 p-6">
                  <h3 className="font-bold text-app-text flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-400" /> 分项评分
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-5">
                    {Object.entries(report.scores || {}).map(([key, value]) => (
                      <div key={key}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-app-subtext">{scoreLabels[key] || key}</span>
                          <span className="text-app-text font-mono">{clampScore(value)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-app-base overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-400" style={{ width: `${clampScore(value)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-app-subtext leading-relaxed mt-5">{report.summary}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-app-border bg-app-surface/60 p-6">
                <h3 className="font-bold text-app-text flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> 优先改进项
                </h3>
                <div className="space-y-3">
                  {(report.issues || []).map((issue, index) => (
                    <div key={index} className="rounded-2xl border border-app-border bg-app-base/50 p-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md border text-[9px] uppercase ${priorityStyle[issue.priority] || priorityStyle.medium}`}>
                          {issue.priority}
                        </span>
                        <span className="text-sm font-bold text-app-text">{issue.title}</span>
                      </div>
                      <p className="text-xs text-app-subtext mt-2">{issue.reason}</p>
                      <div className="mt-3 flex gap-2 text-xs text-violet-300">
                        <Lightbulb className="w-4 h-4 shrink-0" /> {issue.fix}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-3xl border border-app-border bg-app-surface/60 p-6">
                  <h3 className="font-bold text-app-text flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 当前优势
                  </h3>
                  <ul className="space-y-3">
                    {(report.strengths || []).map((item, index) => (
                      <li key={index} className="text-xs text-app-subtext flex gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-3xl border border-app-border bg-app-surface/60 p-6">
                  <h3 className="font-bold text-app-text flex items-center gap-2 mb-4">
                    <FileText className="w-4 h-4 text-sky-400" /> 内容方案
                  </h3>
                  <div className="text-xs space-y-3">
                    <div><span className="text-app-subtext">建议标题：</span><span className="text-app-text">{report.content_brief?.suggested_title}</span></div>
                    <div><span className="text-app-subtext">建议描述：</span><span className="text-app-text">{report.content_brief?.suggested_description}</span></div>
                    <div>
                      <span className="text-app-subtext">结构化数据：</span>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(report.content_brief?.schema_types || []).map((item) => (
                          <span key={item} className="px-2 py-1 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20">{item}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-app-border bg-app-surface/60 p-6">
                <h3 className="font-bold text-app-text flex items-center gap-2 mb-4">
                  <Bot className="w-4 h-4 text-violet-400" /> 推荐 FAQ
                </h3>
                <div className="space-y-3">
                  {(report.recommended_faqs || []).map((faq, index) => (
                    <details key={index} className="group rounded-xl border border-app-border bg-app-base/40 p-4">
                      <summary className="cursor-pointer text-sm font-medium text-app-text">{faq.question}</summary>
                      <p className="text-xs text-app-subtext mt-3 leading-relaxed">{faq.answer_outline}</p>
                    </details>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-6">
                <h3 className="font-bold text-app-text flex items-center gap-2 mb-3">
                  <Quote className="w-4 h-4 text-violet-400" /> AI 易引用段落
                </h3>
                <p className="text-sm text-app-text/90 leading-7">{report.citation_ready_passage}</p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default AmazonPollutionTool;
