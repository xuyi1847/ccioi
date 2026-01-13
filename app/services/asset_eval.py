from typing import Dict, Iterable

import pandas as pd

from app.services.data import load_cn_fund_daily


def _estimate_asset_cap_from_close(
    close: pd.Series,
    lookback_n: int = 5,
    dip_th: float = -0.05,
    target_vol: float = 0.08,
) -> dict:
    ret1 = close.pct_change().dropna()
    ann_vol = ret1.std() * (252 ** 0.5)

    raw_cap = target_vol / ann_vol if ann_vol > 0 else 0.1

    ret_n = close / close.shift(lookback_n) - 1.0
    dip_freq = (ret_n <= dip_th).mean()

    if dip_freq >= 0.04:
        freq_factor = 1.0
    elif dip_freq >= 0.02:
        freq_factor = 0.8
    elif dip_freq >= 0.01:
        freq_factor = 0.5
    else:
        freq_factor = 0.3

    asset_cap = raw_cap * freq_factor
    asset_cap = min(max(asset_cap, 0.1), 1.0)

    return {
        "ann_vol": round(float(ann_vol), 4),
        "dip_freq": round(float(dip_freq), 4),
        "suggested_cap": round(float(asset_cap), 2),
    }


def estimate_asset_caps(
    fund_codes: Iterable[str],
    start_date: str = "2015-01-01",
) -> Dict[str, dict]:
    results: Dict[str, dict] = {}

    for code in fund_codes:
        code = code.strip()
        if not code:
            continue
        try:
            df = load_cn_fund_daily(code)
            df = df[df.index >= start_date]
            if len(df) < 252:
                continue
            stats = _estimate_asset_cap_from_close(df["close"])
            results[code] = stats
        except Exception:
            continue

    return results
