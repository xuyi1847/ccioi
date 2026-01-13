from __future__ import annotations

from typing import Dict, List, Optional

import pandas as pd

from app.services.data import load_cn_fund_daily


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
