import pandas as pd
import akshare as ak


def is_etf_code(fund_code: str) -> bool:
    fund_code = fund_code.strip()
    return fund_code.startswith(("15", "51", "52", "58"))


def load_cn_fund_daily(fund_code: str) -> pd.DataFrame:
    """
    Load China fund / ETF daily data via AkShare.
    Returns a DataFrame indexed by date with OHLCV-compatible columns.
    """
    fund_code = fund_code.strip()

    if is_etf_code(fund_code):
        df = ak.fund_etf_hist_em(
            symbol=fund_code,
            period="daily",
            adjust="qfq",
        )
        if df is None or df.empty:
            raise ValueError(f"No ETF data for {fund_code}")
        df = df.rename(
            columns={
                "日期": "date",
                "开盘": "open",
                "最高": "high",
                "最低": "low",
                "收盘": "close",
                "成交量": "volume",
            }
        )
    else:
        df = ak.fund_open_fund_info_em(
            symbol=fund_code,
            indicator="单位净值走势",
        )
        if df is None or df.empty:
            raise ValueError(f"No open fund data for {fund_code}")
        df = df.rename(
            columns={
                "净值日期": "date",
                "单位净值": "close",
            }
        )
        df["open"] = df["close"]
        df["high"] = df["close"]
        df["low"] = df["close"]
        df["volume"] = 0.0

    df["date"] = pd.to_datetime(df["date"])
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if "volume" in df.columns:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    else:
        df["volume"] = 0.0

    df = df.dropna(subset=["close"])
    df = df.sort_values("date").set_index("date")

    return df[["open", "high", "low", "close", "volume"]]
