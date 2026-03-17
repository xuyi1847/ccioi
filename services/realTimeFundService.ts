type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const resultCache = new Map<string, CacheEntry<unknown>>();
const pendingCache = new Map<string, Promise<unknown>>();

function cachedRequest<T>(key: string, fn: () => Promise<T>, ttlMs: number): Promise<T> {
  const now = Date.now();
  const hit = resultCache.get(key);
  if (hit && hit.expiresAt > now) return Promise.resolve(hit.value as T);
  const pending = pendingCache.get(key);
  if (pending) return pending as Promise<T>;
  const p = fn()
    .then((v) => {
      resultCache.set(key, { expiresAt: now + ttlMs, value: v });
      pendingCache.delete(key);
      return v;
    })
    .catch((e) => {
      pendingCache.delete(key);
      throw e;
    });
  pendingCache.set(key, p);
  return p;
}

function loadScriptAndRead(url: string, globalReader: () => unknown): Promise<unknown> {
  if (typeof document === 'undefined' || !document.body) {
    return Promise.reject(new Error('browser_only'));
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      resolve(globalReader());
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      reject(new Error('script_load_failed'));
    };
    document.body.appendChild(script);
  });
}

function parseHtmlTd(row: string): string[] {
  const matches = row.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi) || [];
  return matches.map((td) => td.replace(/<[^>]*>/g, '').trim());
}

export type FundHolding = {
  code: string;
  name: string;
  weight: string;
  change: number | null;
};

export type FundRealtimeData = {
  code: string;
  name: string;
  dwjz: string | null;
  gsz: string | null;
  gszzl: number | null;
  gztime: string | null;
  jzrq: string | null;
  holdingsReportDate: string | null;
  holdingsIsLastQuarter: boolean;
  holdings: FundHolding[];
};

export async function searchFunds(keyword: string): Promise<Array<{ code: string; name: string }>> {
  const q = keyword.trim();
  if (!q) return [];
  const callback = `FundSearch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(q)}&callback=${callback}&_=${Date.now()}`;
  return new Promise((resolve) => {
    (window as any)[callback] = (data: any) => {
      try {
        const rows = Array.isArray(data?.Datas) ? data.Datas : [];
        resolve(
          rows
            .filter((r: any) => r?.CATEGORY === 700 || r?.CATEGORY === '700' || r?.CATEGORYDESC === '基金')
            .map((r: any) => ({ code: String(r.CODE || ''), name: String(r.NAME || r.SHORTNAME || '') }))
            .filter((r: any) => /^\d{6}$/.test(r.code))
            .slice(0, 20),
        );
      } finally {
        delete (window as any)[callback];
      }
    };
    loadScriptAndRead(url, () => null)
      .catch(() => resolve([]))
      .finally(() => {
        setTimeout(() => {
          delete (window as any)[callback];
        }, 1000);
      });
  });
}

function parseTopHoldings(html: string): FundHolding[] {
  const rows = (html.match(/<tr[\s\S]*?<\/tr>/gi) || []).slice(0, 30);
  const out: FundHolding[] = [];
  for (const row of rows) {
    const tds = parseHtmlTd(row);
    if (!tds.length) continue;
    const code = (tds.find((t) => /^\d{6}$/.test(t)) || '').trim();
    const weightCell = tds.find((t) => /%/.test(t)) || '';
    const weightMatch = weightCell.match(/([\d.]+)\s*%/);
    const weight = weightMatch ? `${weightMatch[1]}%` : '';
    const name = tds.find((t) => t && t !== code && !/%/.test(t)) || '';
    if (code) out.push({ code, name, weight, change: null });
  }
  return out.slice(0, 10);
}

function extractHoldingsReportDate(html: string): string | null {
  if (!html) return null;
  const m1 = html.match(/(报告期|截止日期)[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/);
  if (m1) return m1[2];
  const m2 = html.match(/(\d{4}-\d{2}-\d{2})/);
  return m2 ? m2[1] : null;
}

async function enrichHoldingsChange(holdings: FundHolding[]): Promise<FundHolding[]> {
  const codes = holdings.map((h) => h.code).filter((c) => /^\d{6}$/.test(c));
  if (!codes.length) return holdings;
  const q = codes
    .map((code) => {
      const prefix = code.startsWith('6') || code.startsWith('9') ? 'sh' : code.startsWith('4') || code.startsWith('8') ? 'bj' : 'sz';
      return `s_${prefix}${code}`;
    })
    .join(',');
  await loadScriptAndRead(`https://qt.gtimg.cn/q=${q}&_=${Date.now()}`, () => null).catch(() => null);
  return holdings.map((h) => {
    const prefix = h.code.startsWith('6') || h.code.startsWith('9') ? 'sh' : h.code.startsWith('4') || h.code.startsWith('8') ? 'bj' : 'sz';
    const raw = (window as any)[`v_s_${prefix}${h.code}`];
    if (!raw || typeof raw !== 'string') return h;
    const parts = raw.split('~');
    const val = Number(parts[5]);
    return { ...h, change: Number.isFinite(val) ? val : null };
  });
}

export async function fetchFundData(code: string): Promise<FundRealtimeData> {
  const fundCode = code.trim();
  if (!/^\d{6}$/.test(fundCode)) throw new Error('invalid_code');
  const key = `fund_${fundCode}`;
  return cachedRequest(
    key,
    async () => {
      const gzUrl = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;
      const prev = (window as any).jsonpgz;
      const gzData = await new Promise<any>((resolve, reject) => {
        (window as any).jsonpgz = (json: any) => resolve(json);
        loadScriptAndRead(gzUrl, () => null).catch(reject);
        setTimeout(() => reject(new Error('timeout')), 5000);
      }).finally(() => {
        (window as any).jsonpgz = prev;
      });

      if (!gzData || typeof gzData !== 'object') throw new Error('invalid_payload');

      const holdingsRaw = (await loadScriptAndRead(
        `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&topline=10&year=&month=&_=${Date.now()}`,
        () => (window as any).apidata,
      ).catch(() => ({ content: '' }))) as any;

      const holdingsHtml = String(holdingsRaw?.content || '');
      const holdingsReportDate = extractHoldingsReportDate(holdingsHtml);
      const parsed = parseTopHoldings(holdingsHtml);
      const holdings = await enrichHoldingsChange(parsed);

      return {
        code: String(gzData.fundcode || fundCode),
        name: String(gzData.name || ''),
        dwjz: gzData.dwjz ? String(gzData.dwjz) : null,
        gsz: gzData.gsz ? String(gzData.gsz) : null,
        gszzl: Number.isFinite(Number(gzData.gszzl)) ? Number(gzData.gszzl) : null,
        gztime: gzData.gztime ? String(gzData.gztime) : null,
        jzrq: gzData.jzrq ? String(gzData.jzrq) : null,
        holdingsReportDate,
        holdingsIsLastQuarter: true,
        holdings,
      };
    },
    10_000,
  );
}
