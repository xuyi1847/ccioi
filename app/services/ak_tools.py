from __future__ import annotations

from typing import Dict, List, Optional, Tuple
from contextlib import contextmanager
import os
import time
from urllib.parse import urlparse

import pandas as pd
import akshare as ak
import requests

from app.services.data import load_cn_fund_daily


@contextmanager
def _without_proxy():
    keys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ.pop(k, None)
    no_proxy = os.environ.get("NO_PROXY", "")
    extras = "82.push2.eastmoney.com,push2.eastmoney.com,.eastmoney.com"
    os.environ["NO_PROXY"] = ",".join([p for p in [no_proxy, extras] if p])
    try:
        yield
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def _find_column(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    for col in candidates:
        if col in df.columns:
            return col
    return None


def _parse_percent(value) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip().replace("%", "")
    if text == "":
        return None
    try:
        return float(text)
    except Exception:
        return None


def _pick_latest_report(df: pd.DataFrame) -> Tuple[pd.DataFrame, Optional[str]]:
    report_col = _find_column(df, ["报告期", "截止日期", "报告日期"])
    if report_col is None and "季度" in df.columns:
        latest_q = df["季度"].max()
        return df[df["季度"] == latest_q], str(latest_q)
    if report_col is None:
        return df, None
    report_dt = pd.to_datetime(df[report_col], errors="coerce")
    if report_dt.notna().any():
        latest = report_dt.max()
        df = df[report_dt == latest]
        return df, latest.strftime("%Y-%m-%d")
    return df, None


def _slice_df(df: pd.DataFrame, start: Optional[str], end: Optional[str]) -> pd.DataFrame:
    if start:
        df = df[df.index >= pd.to_datetime(start)]
    if end:
        df = df[df.index <= pd.to_datetime(end)]
    return df


def get_fund_daily_summary(code: str, lookback_days: int = 20) -> Dict[str, object]:
    df = load_cn_fund_daily(code)
    if df.empty:
        raise ValueError("No data returned from AkShare")

    df = df.tail(max(lookback_days, 2))
    close = df["close"]
    last_close = float(close.iloc[-1])
    ret1 = float(close.iloc[-1] / close.iloc[-2] - 1.0) if len(close) >= 2 else 0.0

    def _ret_n(n: int) -> float:
        if len(close) <= n:
            return float(close.iloc[-1] / close.iloc[0] - 1.0)
        return float(close.iloc[-1] / close.iloc[-n - 1] - 1.0)

    ret5 = _ret_n(5)
    ret20 = _ret_n(20)

    nav = (1.0 + close.pct_change().fillna(0.0)).cumprod()
    nav_peak = nav.cummax()
    drawdown = float((nav.iloc[-1] / nav_peak.iloc[-1]) - 1.0)

    return {
        "code": code,
        "date": df.index[-1].strftime("%Y-%m-%d"),
        "close": round(last_close, 4),
        "return_1d": round(ret1, 4),
        "return_5d": round(ret5, 4),
        "return_20d": round(ret20, 4),
        "drawdown_from_peak": round(drawdown, 4),
        "lookback_days": lookback_days,
    }


def get_fund_daily_history(
    code: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 120,
) -> Dict[str, object]:
    df = load_cn_fund_daily(code)
    if df.empty:
        raise ValueError("No data returned from AkShare")

    df = _slice_df(df, start, end)
    if limit > 0:
        df = df.tail(limit)

    records: List[Dict[str, object]] = []
    for idx, row in df.iterrows():
        records.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "open": round(float(row["open"]), 4),
                "high": round(float(row["high"]), 4),
                "low": round(float(row["low"]), 4),
                "close": round(float(row["close"]), 4),
                "volume": round(float(row.get("volume", 0.0)), 4),
            }
        )

    return {
        "code": code,
        "start": start,
        "end": end,
        "count": len(records),
        "records": records,
    }


def get_fund_intraday_estimate(
    code: str,
    invest_amount: float = 10000.0,
    top_n: int = 100,
    year: Optional[str] = "2025",
) -> Dict[str, object]:
    """
    Estimate intraday fund movement based on holdings weights and stock realtime changes.
    """
    code = code.strip()
    with _without_proxy():
        if year:
            holdings = ak.fund_portfolio_hold_em(symbol=code, date=year)
        else:
            holdings = ak.fund_portfolio_hold_em(symbol=code, date=year)
        if holdings is None or holdings.empty:
            raise ValueError("No holdings data returned from AkShare")

        holdings, report_date = _pick_latest_report(holdings)

        code_col = _find_column(holdings, ["股票代码", "证券代码", "持仓股票代码"])
        name_col = _find_column(holdings, ["股票名称", "证券简称", "持仓股票名称"])
        weight_col = _find_column(holdings, ["占净值比例", "持仓占比", "持仓占净值比例", "占比", "占基金净值比"])

        if code_col is None or weight_col is None:
            raise ValueError("Holdings data missing code or weight columns")

        holdings = holdings[[c for c in [code_col, name_col, weight_col] if c is not None]].copy()
        holdings = holdings.rename(columns={code_col: "stock_code", weight_col: "weight", name_col: "stock_name"})
        holdings["weight"] = holdings["weight"].apply(_parse_percent) / 100.0
        holdings = holdings.dropna(subset=["stock_code", "weight"])
        holdings["stock_code"] = holdings["stock_code"].astype(str).str.strip().str.zfill(6)
        if top_n > 0:
            holdings = holdings.head(top_n)

        if holdings.empty:
            raise ValueError("Holdings data has no usable weights")

        token = os.getenv("SANHULIANGHUA_TOKEN")
        if not token:
            raise ValueError("Missing SANHULIANGHUA_TOKEN")

        base_url = os.getenv("SANHULIANGHUA_BASE_URL", "http://www.sanhulianghua.com:2008/v1/hsa_fenshi")

        def _fallback_urls(url: str) -> List[str]:
            urls = [url]
            try:
                parts = urlparse(url)
                if parts.scheme == "https":
                    host = parts.hostname or "www.sanhulianghua.com"
                    path = parts.path or "/v1/hsa_fenshi"
                    urls.append(f"http://{host}:2008{path}")
            except Exception:
                pass
            return urls

        def _get_quote(stock_code: str) -> Tuple[Optional[Dict[str, object]], Optional[Dict[str, object]]]:
            try:
                last_err = None
                for url in _fallback_urls(base_url):
                    resp = requests.get(
                        url,
                        params={
                            "token": token,
                            "code": stock_code,
                            "all": 0,
                            "simple": 0,
                        },
                        timeout=6,
                    )
                    payload = resp.json()
                    ret = payload.get("ret")
                    if str(ret) != "200" or not payload.get("data"):
                        last_err = {"ret": ret, "msg": payload.get("msg")}
                        continue
                    rows = payload["data"]
                    row = rows[0] if isinstance(rows, list) and rows else rows
                    price = row["JiaGe"] / 1000.0
                    avg_price = row["JunJia"] / 1000.0
                    pre_close = row["ZuoShou"] / 1000.0
                    change_pct = row["ZhangFu"] / 1000.0
                    return {
                        "code": stock_code,
                        "name": payload.get("name"),
                        "price": price,
                        "avg_price": avg_price,
                        "pre_close": pre_close,
                        "base": pre_close,
                        "change_pct": change_pct,
                        "time": row.get("ShiJian"),
                        "date": payload.get("date"),
                        "is_trading": row.get("ShiJian") != "15:00",
                    }, None
                return None, last_err
            except Exception as exc:
                return None, {"ret": None, "msg": str(exc)}

        total_weight = float(holdings["weight"].sum())
        total_pct = 0.0
        total_pnl = 0.0
        valid_weight = 0.0

        holdings_out: List[Dict[str, object]] = []
        for _, row in holdings.iterrows():
            stock_code = row["stock_code"]
            stock_name = row.get("stock_name")
            weight = float(row["weight"])

            quote, err = _get_quote(stock_code)
            time.sleep(0.25)
            if quote is None:
                holdings_out.append(
                    {
                        "stock_code": stock_code,
                        "stock_name": stock_name,
                        "weight": round(weight, 6),
                        "weight_pct": round(weight * 100.0, 4),
                        "quote": None,
                        "pct": None,
                        "pnl": None,
                        "error": err,
                    }
                )
                continue

            price = quote["price"]
            base = quote["base"]
            pct = (price - base) / base if base else 0.0
            pnl = pct * weight * invest_amount
            total_pct += pct * weight
            total_pnl += pnl
            valid_weight += weight

            holdings_out.append(
                {
                    "stock_code": stock_code,
                    "stock_name": stock_name or quote.get("name"),
                    "weight": round(weight, 6),
                    "weight_pct": round(weight * 100.0, 4),
                    "quote": quote,
                    "pct": round(float(pct), 6),
                    "pnl": round(float(pnl), 4),
                    "error": None,
                }
            )

        daily_df = load_cn_fund_daily(code)
        if daily_df.empty:
            raise ValueError("No fund daily data returned from AkShare")
    last_close = float(daily_df["close"].iloc[-1])
    fund_pct = (total_pct / valid_weight) if valid_weight > 0 else 0.0
    fund_pnl = fund_pct * invest_amount
    est_nav = last_close * (1.0 + fund_pct)

    trend = "flat"
    if fund_pct > 0.0002:
        trend = "up"
    elif fund_pct < -0.0002:
        trend = "down"

    return {
        "code": code,
        "report_date": report_date,
        "last_close": round(last_close, 4),
        "estimate_nav": round(est_nav, 4),
        "estimate_pct": round(float(fund_pct * 100.0), 4),
        "estimate_pnl": round(float(fund_pnl), 4),
        "invest_amount": round(float(invest_amount), 2),
        "top_n": int(top_n),
        "coverage": round(float((valid_weight / total_weight) if total_weight > 0 else 0.0), 4),
        "total_weight": round(float(total_weight), 6),
        "valid_weight": round(float(valid_weight), 6),
        "holdings_total": int(len(holdings)),
        "holdings_used": int(sum(1 for h in holdings_out if h.get("pct") is not None)),
        "trend": trend,
        "holdings": holdings_out,
    }
