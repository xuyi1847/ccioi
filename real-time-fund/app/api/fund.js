import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isString } from 'lodash';
import { cachedRequest, clearCachedRequest } from '../lib/cacheRequest';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_TZ = 'Asia/Shanghai';
const getBrowserTimeZone = () => {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || DEFAULT_TZ;
  }
  return DEFAULT_TZ;
};
const TZ = getBrowserTimeZone();
dayjs.tz.setDefault(TZ);
const nowInTz = () => dayjs().tz(TZ);
const toTz = (input) => (input ? dayjs.tz(input, TZ) : nowInTz());

export const loadScript = (url) => {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve(null);

  let cacheKey = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('_');
    parsed.searchParams.delete('_t');
    cacheKey = parsed.toString();
  } catch (e) {
  }

  const cacheTime = 10 * 60 * 1000;

  return cachedRequest(
    () =>
      new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          cleanup();
          resolve({ ok: false, error: '请求超时' });
        }, 10000);

        const cleanup = () => {
          clearTimeout(timer);
          if (document.body.contains(script)) document.body.removeChild(script);
        };

        script.onload = () => {
          if (done) return;
          done = true;
          cleanup();
          let apidata;
          try {
            apidata = window?.apidata ? JSON.parse(JSON.stringify(window.apidata)) : undefined;
          } catch (e) {
            apidata = window?.apidata;
          }
          resolve({ ok: true, apidata });
        };

        script.onerror = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve({ ok: false, error: '数据加载失败' });
        };

        document.body.appendChild(script);
      }),
    cacheKey,
    { cacheTime }
  ).then((result) => {
    if (!result?.ok) {
      clearCachedRequest(cacheKey);
      throw new Error(result?.error || '数据加载失败');
    }
    return result.apidata;
  });
};

export const fetchFundNetValue = async (code, date) => {
  if (typeof window === 'undefined') return null;
  try {
    const data = await fetchFundPingzhongdata(String(code).trim());
    const trend = Array.isArray(data?.Data_netWorthTrend) ? data.Data_netWorthTrend : [];
    for (const point of trend) {
      if (!Number.isFinite(Number(point?.x))) continue;
      if (dayjs(Number(point.x)).tz(TZ).format('YYYY-MM-DD') !== date) continue;
      const value = Number(point.y);
      return Number.isFinite(value) ? value : null;
    }
    return null;
  } catch (e) {
    return null;
  }
};

const parseLatestNetValueFromLsjzContent = (content) => {
  if (!content || content.includes('暂无数据')) return null;
  const rowMatches = content.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rowMatches) {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
    if (!cells.length) continue;
    const getText = (td) => td.replace(/<[^>]+>/g, '').trim();
    const dateStr = getText(cells[0] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    const navStr = getText(cells[1] || '');
    const nav = parseFloat(navStr);
    if (!Number.isFinite(nav)) continue;
    let growth = null;
    for (const c of cells) {
      const txt = getText(c);
      const m = txt.match(/([-+]?\d+(?:\.\d+)?)\s*%/);
      if (m) {
        growth = parseFloat(m[1]);
        break;
      }
    }
    return { date: dateStr, nav, growth };
  }
  return null;
};

const extractHoldingsReportDate = (html) => {
  if (!html) return null;

  // 优先匹配带有“报告期 / 截止日期”等关键字附近的日期
  const m1 = html.match(/(报告期|截止日期)[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/);
  if (m1) return m1[2];

  // 兜底：取文中出现的第一个 yyyy-MM-dd 格式日期
  const m2 = html.match(/(\d{4}-\d{2}-\d{2})/);
  return m2 ? m2[1] : null;
};

const isLastQuarterReport = (reportDateStr) => {
  if (!reportDateStr) return false;

  const report = dayjs(reportDateStr, 'YYYY-MM-DD');
  if (!report.isValid()) return false;

  const now = nowInTz();
  const m = now.month(); // 0-11
  const q = Math.floor(m / 3); // 当前季度 0-3 => Q1-Q4

  let lastQ;
  let year;
  if (q === 0) {
    // 当前为 Q1，则上一季度是上一年的 Q4
    lastQ = 3;
    year = now.year() - 1;
  } else {
    lastQ = q - 1;
    year = now.year();
  }

  const quarterEnds = [
    { month: 2, day: 31 }, // Q1 -> 03-31
    { month: 5, day: 30 }, // Q2 -> 06-30
    { month: 8, day: 30 }, // Q3 -> 09-30
    { month: 11, day: 31 } // Q4 -> 12-31
  ];

  const { month: endMonth, day: endDay } = quarterEnds[lastQ];
  const lastQuarterEnd = dayjs(
    `${year}-${String(endMonth + 1).padStart(2, '0')}-${endDay}`,
    'YYYY-MM-DD'
  );

  return report.isSame(lastQuarterEnd, 'day');
};

export const fetchSmartFundNetValue = async (code, startDate) => {
  const today = nowInTz().startOf('day');
  let current = toTz(startDate).startOf('day');
  for (let i = 0; i < 30; i++) {
    if (current.isAfter(today)) break;
    const dateStr = current.format('YYYY-MM-DD');
    const val = await fetchFundNetValue(code, dateStr);
    if (val !== null) {
      return { date: dateStr, value: val };
    }
    current = current.add(1, 'day');
  }
  return null;
};

export const fetchFundDataFallback = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  return new Promise(async (resolve, reject) => {
    const searchCallbackName = `SuggestData_fallback_${Date.now()}`;
    const searchUrl = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(c)}&callback=${searchCallbackName}&_=${Date.now()}`;
    let fundName = '';
    try {
      await new Promise((resSearch, rejSearch) => {
        window[searchCallbackName] = (data) => {
          if (data && data.Datas && data.Datas.length > 0) {
            const found = data.Datas.find(d => d.CODE === c);
            if (found) {
              fundName = found.NAME || found.SHORTNAME || '';
            }
          }
          delete window[searchCallbackName];
          resSearch();
        };
        const script = document.createElement('script');
        script.src = searchUrl;
        script.async = true;
        script.onload = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
        };
        script.onerror = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
          delete window[searchCallbackName];
          rejSearch(new Error('搜索接口失败'));
        };
        document.body.appendChild(script);
        setTimeout(() => {
          if (window[searchCallbackName]) {
            delete window[searchCallbackName];
            resSearch();
          }
        }, 3000);
      });
    } catch (e) {
    }
    try {
      const data = await fetchFundPingzhongdata(c);
      const trend = Array.isArray(data?.Data_netWorthTrend) ? data.Data_netWorthTrend : [];
      const valid = trend
        .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
        .sort((a, b) => Number(a.x) - Number(b.x));
      const point = valid[valid.length - 1];
      const previous = valid[valid.length - 2];
      const latest = point ? {
        date: dayjs(Number(point.x)).tz(TZ).format('YYYY-MM-DD'),
        nav: Number(point.y),
        growth: Number.isFinite(Number(point.equityReturn))
          ? Number(point.equityReturn)
          : (previous && Number(previous.y) > 0
            ? ((Number(point.y) - Number(previous.y)) / Number(previous.y)) * 100
            : null)
      } : null;
      if (latest && latest.nav) {
        const name = data?.fundName || fundName || `未知基金(${c})`;
        resolve({
          code: c,
          name,
          dwjz: String(latest.nav),
          gsz: null,
          gztime: null,
          jzrq: latest.date,
          gszzl: null,
          zzl: Number.isFinite(latest.growth) ? latest.growth : null,
          noValuation: true,
          holdings: [],
          holdingsReportDate: null,
          holdingsIsLastQuarter: false
        });
      } else {
        reject(new Error('未能获取到基金数据'));
      }
    } catch (e) {
      reject(new Error('基金数据加载失败'));
    }
  });
};

export const fetchFundData = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  const code = String(c || '').trim();
  if (!/^\d{6}$/.test(code)) throw new Error('基金编码无效');

  const requestJson = async (url, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const valuationPromise = cachedRequest(
    () => requestJson(
      `https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast?FCODES=${encodeURIComponent(code)}&FIELDS=FCODE%2CSHORTNAME%2CGSZZL%2CGZTIME%2CGSZ%2CNAV%2CPDATE`
    ),
    `fund_valuation_last_${code}`,
    { cacheTime: 10000 }
  );

  const holdingsCacheKey = `fund_holdings_mobile_${code}`;
  const holdingsPromise = cachedRequest(
    () => requestJson(
      `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${encodeURIComponent(code)}&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0`
    ),
    holdingsCacheKey,
    { cacheTime: 60 * 60 * 1000 }
  ).catch(() => {
    clearCachedRequest(holdingsCacheKey);
    return null;
  });

  let valuation;
  try {
    const response = await valuationPromise;
    valuation = Array.isArray(response?.data)
      ? response.data.find((item) => String(item?.FCODE || '') === code)
      : null;
    if (!response?.success || !valuation) throw new Error('估值接口未返回基金数据');
  } catch (e) {
    clearCachedRequest(`fund_valuation_last_${code}`);
    return fetchFundDataFallback(code);
  }

  const holdingsResponse = await holdingsPromise;
  const stockRows = Array.isArray(holdingsResponse?.Datas?.fundStocks)
    ? holdingsResponse.Datas.fundStocks
    : [];
  const holdings = stockRows.slice(0, 10).map((item) => ({
    code: String(item?.GPDM || ''),
    name: String(item?.GPJC || ''),
    weight: item?.JZBL == null ? '' : `${item.JZBL}%`,
    change: null
  }));
  const quoteCodes = holdings
    .map((holding) => {
      if (/^\d{6}$/.test(holding.code)) {
        const prefix = holding.code.startsWith('6') || holding.code.startsWith('9')
          ? 'sh'
          : (holding.code.startsWith('4') || holding.code.startsWith('8') ? 'bj' : 'sz');
        return `s_${prefix}${holding.code}`;
      }
      if (/^\d{5}$/.test(holding.code)) return `s_hk${holding.code}`;
      return null;
    })
    .filter(Boolean);
  if (quoteCodes.length) {
    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `https://qt.gtimg.cn/q=${quoteCodes.join(',')}&_=${Date.now()}`;
      script.async = true;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (document.body.contains(script)) document.body.removeChild(script);
        resolve();
      };
      const timer = setTimeout(finish, 5000);
      script.onload = () => {
        holdings.forEach((holding) => {
          let variable = '';
          if (/^\d{6}$/.test(holding.code)) {
            const prefix = holding.code.startsWith('6') || holding.code.startsWith('9')
              ? 'sh'
              : (holding.code.startsWith('4') || holding.code.startsWith('8') ? 'bj' : 'sz');
            variable = `v_s_${prefix}${holding.code}`;
          } else if (/^\d{5}$/.test(holding.code)) {
            variable = `v_s_hk${holding.code}`;
          }
          const parts = variable && typeof window[variable] === 'string'
            ? window[variable].split('~')
            : [];
          const change = Number(parts[5]);
          if (Number.isFinite(change)) holding.change = change;
        });
        finish();
      };
      script.onerror = finish;
      document.body.appendChild(script);
    });
  }

  const now = nowInTz();
  const currentQuarterStartMonth = Math.floor(now.month() / 3) * 3;
  const previousQuarterEnd = now
    .month(currentQuarterStartMonth)
    .startOf('month')
    .subtract(1, 'day')
    .format('YYYY-MM-DD');
  const gsz = valuation.GSZ == null ? null : Number(valuation.GSZ);
  const gszzl = valuation.GSZZL == null ? null : Number(valuation.GSZZL);

  return {
    code,
    name: String(valuation.SHORTNAME || ''),
    dwjz: valuation.NAV == null ? null : String(valuation.NAV),
    gsz: Number.isFinite(gsz) ? gsz : null,
    gztime: valuation.GZTIME ? String(valuation.GZTIME) : null,
    jzrq: valuation.PDATE ? String(valuation.PDATE) : null,
    gszzl: Number.isFinite(gszzl) ? gszzl : null,
    noValuation: !Number.isFinite(gsz) || !Number.isFinite(gszzl),
    holdings,
    holdingsReportDate: stockRows.length ? previousQuarterEnd : null,
    holdingsIsLastQuarter: stockRows.length > 0
  };
};

export const searchFunds = async (val) => {
  if (!val.trim()) return [];
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  const callbackName = `SuggestData_${Date.now()}`;
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(val)}&callback=${callbackName}&_=${Date.now()}`;
  return new Promise((resolve, reject) => {
    window[callbackName] = (data) => {
      let results = [];
      if (data && data.Datas) {
        results = data.Datas.filter(d =>
          d.CATEGORY === 700 ||
          d.CATEGORY === '700' ||
          d.CATEGORYDESC === '基金'
        );
      }
      delete window[callbackName];
      resolve(results);
    };
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      delete window[callbackName];
      reject(new Error('搜索请求失败'));
    };
    document.body.appendChild(script);
  });
};

export const fetchShanghaiIndexDate = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://qt.gtimg.cn/q=sh000001&_t=${Date.now()}`;
    script.onload = () => {
      const data = window.v_sh000001;
      let dateStr = null;
      if (data) {
        const parts = data.split('~');
        if (parts.length > 30) {
          dateStr = parts[30].slice(0, 8);
        }
      }
      if (document.body.contains(script)) document.body.removeChild(script);
      resolve(dateStr);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      reject(new Error('指数数据加载失败'));
    };
    document.body.appendChild(script);
  });
};

export const fetchLatestRelease = async () => {
  const envUrl =
    (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL)
    || (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GITHUB_LATEST_RELEASE_URL)
    || null;
  const url = envUrl;
  if (!url) return null;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    tagName: data.tag_name,
    body: data.body || ''
  };
};

export const submitFeedback = async (formData) => {
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    body: formData
  });
  return response.json();
};

const PINGZHONGDATA_GLOBAL_KEYS = [
  'ishb',
  'fS_name',
  'fS_code',
  'fund_sourceRate',
  'fund_Rate',
  'fund_minsg',
  'stockCodes',
  'zqCodes',
  'stockCodesNew',
  'zqCodesNew',
  'syl_1n',
  'syl_6y',
  'syl_3y',
  'syl_1y',
  'Data_fundSharesPositions',
  'Data_netWorthTrend',
  'Data_ACWorthTrend',
  'Data_grandTotal',
  'Data_rateInSimilarType',
  'Data_rateInSimilarPersent',
  'Data_fluctuationScale',
  'Data_holderStructure',
  'Data_assetAllocation',
  'Data_performanceEvaluation',
  'Data_currentFundManager',
  'Data_buySedemption',
  'swithSameType',
];

let pingzhongdataQueue = Promise.resolve();

const enqueuePingzhongdataLoad = (fn) => {
  const p = pingzhongdataQueue.then(fn, fn);
  // 避免队列被 reject 永久阻塞
  pingzhongdataQueue = p.catch(() => undefined);
  return p;
};

const snapshotPingzhongdataGlobals = (fundCode) => {
  const out = {};
  for (const k of PINGZHONGDATA_GLOBAL_KEYS) {
    if (typeof window?.[k] === 'undefined') continue;
    try {
      out[k] = JSON.parse(JSON.stringify(window[k]));
    } catch (e) {
      out[k] = window[k];
    }
  }

  return {
    fundCode: out.fS_code || fundCode,
    fundName: out.fS_name || '',
    ...out,
  };
};

const jsonpLoadPingzhongdata = (fundCode, timeoutMs = 10000) => {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || !document.body) {
      reject(new Error('无浏览器环境'));
      return;
    }

    const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`;
    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    let done = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      script.onload = null;
      script.onerror = null;
      if (document.body.contains(script)) document.body.removeChild(script);
    };

    timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('pingzhongdata 请求超时'));
    }, timeoutMs);

    script.onload = () => {
      if (done) return;
      done = true;
      const data = snapshotPingzhongdataGlobals(fundCode);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('pingzhongdata 加载失败'));
    };

    document.body.appendChild(script);
  });
};

const fetchAndParsePingzhongdata = async (fundCode) => {
  // 使用 JSONP(script 注入) 方式获取并解析 pingzhongdata
  return enqueuePingzhongdataLoad(() => jsonpLoadPingzhongdata(fundCode));
};

/**
 * 获取并解析「基金走势图/资产等」数据（pingzhongdata）
 * 来源：https://fund.eastmoney.com/pingzhongdata/${fundCode}.js
 */
export const fetchFundPingzhongdata = async (fundCode, { cacheTime = 60 * 60 * 1000 } = {}) => {
  if (!fundCode) throw new Error('fundCode 不能为空');
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }

  const cacheKey = `pingzhongdata_${fundCode}`;

  try {
    return await cachedRequest(
      () => fetchAndParsePingzhongdata(fundCode),
      cacheKey,
      { cacheTime }
    );
  } catch (e) {
    clearCachedRequest(cacheKey);
    throw e;
  }
};

export const fetchFundHistory = async (code, range = '1m') => {
  if (typeof window === 'undefined') return [];

  const end = nowInTz();
  let start = end.clone();

  switch (range) {
    case '1m': start = start.subtract(1, 'month'); break;
    case '3m': start = start.subtract(3, 'month'); break;
    case '6m': start = start.subtract(6, 'month'); break;
    case '1y': start = start.subtract(1, 'year'); break;
    case '3y': start = start.subtract(3, 'year'); break;
    case 'all': start = dayjs(0).tz(TZ); break;
    default: start = start.subtract(1, 'month');
  }

  // 业绩走势统一走 pingzhongdata.Data_netWorthTrend
  try {
    const pz = await fetchFundPingzhongdata(code);
    const trend = pz?.Data_netWorthTrend;
    if (Array.isArray(trend) && trend.length) {
      const startMs = start.startOf('day').valueOf();
      // end 可能是当日任意时刻，这里用 end-of-day 包含最后一天
      const endMs = end.endOf('day').valueOf();
      const out = trend
        .filter((d) => d && typeof d.x === 'number' && d.x >= startMs && d.x <= endMs)
        .map((d) => {
          const value = Number(d.y);
          if (!Number.isFinite(value)) return null;
          const date = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
          return { date, value };
        })
        .filter(Boolean);

      if (out.length) return out;
    }
  } catch (e) {
    return [];
  }
  return [];
};

export const parseFundTextWithLLM = async (text) => {
  if (!text) return null;

  const chatEndpoint = (((import.meta?.env?.VITE_CHAT_ENDPOINT) || '/api/chat')).replace(/\/$/, '');

  try {
    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: "你是一个基金文本解析助手。请从提供的OCR文本中执行以下任务：\n抽取所有基金信息，包括：基金名称：中文字符串（可含英文或括号），名称后常跟随金额数字。基金代码：6位数字（如果存在）。持有金额：数字格式（可能含千分位逗号或小数，如果存在）。持有收益：数字格式（可能含千分位逗号或小数，如果存在）。忽略无关文本。输出格式：以JSON数组形式返回结果，每个基金信息为一个对象，包含以下字段：基金名称（必填，字符串）基金代码（可选，字符串，不存在时为空字符串）持有金额（可选，字符串，不存在时为空字符串）持有收益（可选，字符串，不存在时为空字符串）示例输出：[{'fundName':'华夏成长混合','fundCode':'000001','holdAmounts':'50,000.00','holdGains':'2,500.00'},{'fundName':'易方达消费行业','fundCode':'','holdAmounts':'10,000.00','holdGains':'}]。除了示例输出的内容外，不要输出任何多余内容"},
        { role: 'user', content: text }
      ],
      stream: false
    };
    const headers = { 'Content-Type': 'application/json' };

    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data?.content || null;
  } catch (e) {
    return null;
  }
};

export const parseHoldingsFile = async (file) => {
  if (!file) throw new Error('缺少文件');

  const formData = new FormData();
  formData.append('file', file);

  const base = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000'
    : 'https://www.ccioi.com/api';

  const response = await fetch(`${base}/holdings/parse-file`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || '持仓文件解析失败');
  }
  return data;
};
