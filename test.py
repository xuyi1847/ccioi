# run_backtest_stooq.py
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional

import pandas as pd


# =========================
# 0) Data
# =========================
def load_stooq_daily(symbol: str) -> pd.DataFrame:
    """
    Stooq daily CSV endpoint (no API key):
      https://stooq.com/q/d/l/?s=spy.us&i=d
    Returns df indexed by date ascending with columns:
      open, high, low, close, volume
    """
    url = f"https://stooq.com/q/d/l/?s={symbol.lower()}&i=d"
    df = pd.read_csv(url)  # pandas supports URL read_csv
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values("Date").set_index("Date")
    df.columns = [c.lower() for c in df.columns]
    # Basic sanity checks
    for col in ["open", "high", "low", "close"]:
        if col not in df.columns:
            raise ValueError(f"Missing column {col} in data for {symbol}")
    return df


# =========================
# 1) Strategy (Mean Reversion target position)
# =========================
@dataclass(frozen=True)
class MeanReversionParams:
    lookback_n: int = 5
    th_small: float = 0.00   # 0%~2% small dip bucket lower bound handled in logic
    th_mid: float = -0.02    # -2%
    th_big: float = -0.05    # -5%


def compute_target_position(close: pd.Series, p: MeanReversionParams) -> pd.Series:
    """
    Continuous mean-reversion target position in [0, 1].

    Interpretation:
    - ret_n >= 0      -> 0
    - ret_n <= -K     -> 1
    - linear in between
    """
    ret_n = close / close.shift(p.lookback_n) - 1.0

    K = abs(p.th_big)   # 用原来的 -5% 作为“满仓尺度”，不引入新参数

    target = (-ret_n / K).clip(lower=0.0, upper=1.0)

    # ret_n >= 0 → target = 0
    target = target.where(ret_n < 0, 0.0)

    return target.fillna(0.0)


# =========================
# 2) Risk FSM
# =========================
class TradeState(str, Enum):
    IDLE = "IDLE"
    PROBE = "PROBE"
    ACTIVE = "ACTIVE"
    COOLDOWN = "COOLDOWN"


@dataclass
class RiskParams:
    # hard stop: if drawdown from entry/reference exceeds this, force exit + cooldown
    hard_stop_dd: float = 0.10  # 10% adverse move from reference
    # rebound confirm to unlock COOLDOWN: single-day return >= rebound_y
    rebound_y: float = 0.02     # +2% day
    # favorable confirm for PROBE -> ACTIVE: no "unfavorable" within confirm window, simplified as:
    favorable_days: int = 3
    # unfavorable confirm for ACTIVE -> PROBE: single-day return <= -unfavorable_x
    unfavorable_x: float = 0.02 # -2% day

    # caps
    cap_idle: float = 0.0
    cap_probe: float = 0.25
    cap_active: float = 1.0
    cap_cooldown: float = 0.0

# =========================
# 2.5) Asset Params (NEW)
# =========================
@dataclass(frozen=True)
class AssetParams:
    asset_cap: float = 1.0   # 该资产允许的最大总体仓位

@dataclass
class RiskContext:
    state: TradeState = TradeState.IDLE
    # a reference price for hard stop (e.g., last (re-)entry price)
    ref_price: Optional[float] = None
    # cooldown bookkeeping
    cooldown_since: Optional[pd.Timestamp] = None
    # probe bookkeeping
    probe_start: Optional[pd.Timestamp] = None


def cap_by_state(state: TradeState, rp: RiskParams) -> float:
    return {
        TradeState.IDLE: rp.cap_idle,
        TradeState.PROBE: rp.cap_probe,
        TradeState.ACTIVE: rp.cap_active,
        TradeState.COOLDOWN: rp.cap_cooldown,
    }[state]


def step_fsm(
    t: pd.Timestamp,
    close_t: float,
    ret1_t: float,
    target_eff_t: float,
    ctx: RiskContext,
    rp: RiskParams,
) -> RiskContext:
    """
    Update state using only price behavior + simple events.
    Events:
      - hard_stop: price drawdown from ref_price exceeds threshold
      - rebound_confirm: ret1_t >= rebound_y (unlock cooldown)
      - unfavorable: ret1_t <= -unfavorable_x (degrade active -> probe)
      - favorable: after PROBE for favorable_days without unfavorable, promote to ACTIVE
    """
    state = ctx.state

    # ---- hard stop check (if we have exposure intent and a ref_price)
    hard_stop = False
    if ctx.ref_price is not None:
        dd_from_ref = (close_t / ctx.ref_price) - 1.0
        if dd_from_ref <= -rp.hard_stop_dd:
            hard_stop = True

    if hard_stop:
        return RiskContext(
            state=TradeState.COOLDOWN,
            ref_price=None,
            cooldown_since=t,
            probe_start=None,
        )

    # ---- COOLDOWN unlock
    if state == TradeState.COOLDOWN:
        if ret1_t >= rp.rebound_y:
            # unlock to PROBE
            return RiskContext(
                state=TradeState.PROBE,
                ref_price=close_t,      # set new ref at unlock
                cooldown_since=None,
                probe_start=t,
            )
        else:
            return ctx  # stay cooldown, forced flat by cap

    # ---- IDLE: enter PROBE only if target suggests any position (after T+1)
    if state == TradeState.IDLE:
        if target_eff_t > 0:
            return RiskContext(
                state=TradeState.PROBE,
                ref_price=close_t,
                cooldown_since=None,
                probe_start=t,
            )
        else:
            return ctx

    # ---- ACTIVE: degrade to PROBE on unfavorable
    if state == TradeState.ACTIVE:
        if ret1_t <= -rp.unfavorable_x:
            return RiskContext(
                state=TradeState.PROBE,
                ref_price=close_t,  # reset ref on downgrade
                cooldown_since=None,
                probe_start=t,
            )
        return ctx

    # ---- PROBE: if no unfavorable for favorable_days, promote to ACTIVE
    if state == TradeState.PROBE:
        if ctx.probe_start is None:
            ctx.probe_start = t

        days_in_probe = (t - ctx.probe_start).days
        # If target_eff disappears, go back to IDLE (no reason to stay engaged)
        if target_eff_t <= 0:
            return RiskContext(
                state=TradeState.IDLE,
                ref_price=None,
                cooldown_since=None,
                probe_start=None,
            )
        # Promote if enough time has passed and today is not unfavorable
        if days_in_probe >= rp.favorable_days and ret1_t > -rp.unfavorable_x:
            return RiskContext(
                state=TradeState.ACTIVE,
                ref_price=close_t,  # reset ref at promotion
                cooldown_since=None,
                probe_start=None,
            )
        return ctx

    return ctx


# =========================
# 3) Backtest
# =========================
@dataclass(frozen=True)
class CostParams:
    fee_bps: float = 5.0  # 5 bps per unit turnover


def backtest(
    df: pd.DataFrame,
    sp: MeanReversionParams,
    rp: RiskParams,
    cp: CostParams,
    ap: AssetParams,   # 👈 NEW
) -> pd.DataFrame:
    close = df["close"].copy()
    ret1 = close.pct_change().fillna(0.0)

    target = compute_target_position(close, sp)
    target_eff = target.shift(1).fillna(0.0)  # T+1

    ctx = RiskContext()
    states = []
    caps = []
    actual_pos = []

    prev_pos = 0.0

    for t, close_t in close.items():
        ret1_t = float(ret1.loc[t])
        target_eff_t = float(target_eff.loc[t])

        # update FSM
        ctx = step_fsm(t, float(close_t), ret1_t, target_eff_t, ctx, rp)
        cap_t = cap_by_state(ctx.state, rp)

        # ===== NEW: extra damping in PROBE =====
        if ctx.state == TradeState.PROBE:
            # signal-weighted probing: weaker signal → smaller probe
            cap_t = min(cap_t, target_eff_t)

        
        pos_t = min(max(target_eff_t, 0.0), cap_t, ap.asset_cap)

        states.append(ctx.state.value)
        caps.append(cap_t)
        actual_pos.append(pos_t)
        prev_pos = pos_t

    out = pd.DataFrame(
        {
            "close": close,
            "ret1": ret1,
            "target": target,
            "target_eff": target_eff,
            "state": states,
            "cap": caps,
            "pos": pd.Series(actual_pos, index=close.index),
        }
    )

    # turnover + costs
    out["turnover"] = out["pos"].diff().abs().fillna(out["pos"].abs())
    out["cost"] = out["turnover"] * (cp.fee_bps / 10000.0)

    # strategy return: position held over the day -> use pos.shift(1)
    out["strategy_ret"] = out["pos"].shift(1).fillna(0.0) * out["ret1"] - out["cost"]
    out["nav"] = (1.0 + out["strategy_ret"]).cumprod()

    # drawdown
    out["nav_peak"] = out["nav"].cummax()
    out["dd"] = out["nav"] / out["nav_peak"] - 1.0

    return out


def summarize(out: pd.DataFrame) -> Dict[str, float]:
    nav = out["nav"]
    ret = out["strategy_ret"]

    # annualization assumes 252 trading days
    ann_ret = nav.iloc[-1] ** (252.0 / max(len(nav), 1)) - 1.0
    ann_vol = ret.std() * (252.0 ** 0.5)
    sharpe = (ret.mean() / (ret.std() + 1e-12)) * (252.0 ** 0.5)

    mdd = out["dd"].min()
    avg_pos = out["pos"].mean()
    trades = (out["turnover"] > 1e-12).sum()
    fee_drag = out["cost"].sum()

    state_counts = out["state"].value_counts(normalize=True).to_dict()

    res = {
        "ann_ret": float(ann_ret),
        "ann_vol": float(ann_vol),
        "sharpe": float(sharpe),
        "max_drawdown": float(mdd),
        "avg_position": float(avg_pos),
        "trade_days": float(trades),
        "total_cost": float(fee_drag),
    }
    # flatten state ratios
    for k, v in state_counts.items():
        res[f"state_{k}_ratio"] = float(v)
    return res

import akshare as ak
import pandas as pd


def load_cn_fund_daily(fund_code: str) -> pd.DataFrame:
    """
    Load China fund / ETF daily data via AkShare.
    - ETF: uses fund_etf_hist_em
    - Open-end fund: uses fund_open_fund_info_em

    Parameters
    ----------
    fund_code : str
        e.g. "510300", "159915", "110022"

    Returns
    -------
    DataFrame indexed by date with OHLCV-compatible columns.
    """

    fund_code = fund_code.strip()

    # ===== 判断是否 ETF（经验规则：ETF 多为 5/6 位，且以 15/51/52/58 开头）
    is_etf = fund_code.startswith(("15", "51", "52", "58"))

    if is_etf:
        # -------------------------
        # ETF：有真实“收盘价”
        # -------------------------
        df = ak.fund_etf_hist_em(
            symbol=fund_code,
            period="daily",
            adjust="qfq",   # 前复权，研究阶段推荐
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
        # -------------------------
        # 普通开放式基金：只有单位净值
        # -------------------------
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

        # 用 NAV 构造 OHLCV（研究级常规做法）
        df["open"] = df["close"]
        df["high"] = df["close"]
        df["low"] = df["close"]
        df["volume"] = 0.0

    # ===== 通用清洗
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

import json
from datetime import datetime, timezone, timedelta


def export_daily_signal(
    out: pd.DataFrame,
    fund_code: str,
    asset_type: str,
    asset_cap: float,
    rebalance_threshold: float = 0.01,
) -> dict:
    """
    Export the latest row of backtest result to a daily signal JSON dict.
    """

    if out.empty:
        raise ValueError("Backtest output is empty")

    last = out.iloc[-1]

    date = out.index[-1].strftime("%Y-%m-%d")

    final_position = float(last["pos"])
    target_position = float(last["target_eff"])
    state = str(last["state"])

    # -------- action inference (simple + robust)
    prev_pos = float(out["pos"].iloc[-2]) if len(out) >= 2 else 0.0
    delta = final_position - prev_pos

    if abs(delta) < rebalance_threshold:
        action = "HOLD"
    elif delta > 0:
        action = "BUY"
    else:
        action = "SELL"

    # -------- confidence (optional but useful)
    if state == "ACTIVE" and final_position >= 0.5 * asset_cap:
        confidence = "HIGH"
    elif state in ("ACTIVE", "PROBE"):
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # -------- metrics for inspection (not execution)
    metrics = {
        "target_position": round(target_position, 4),
        "recent_return_1d": round(float(last["ret1"]), 4),
        "drawdown_from_peak": round(float(last["dd"]), 4),
    }

    # -------- effective execution date (T+1)
    effective_date = (
        out.index[-1] + pd.Timedelta(days=1)
    ).strftime("%Y-%m-%d")

    signal = {
        "version": "1.0",
        "date": date,
        "asset": {
            "code": fund_code,
            "type": asset_type,
        },
        "signal": {
            "final_position": round(final_position, 4),
            "state": state,
            "action": action,
            "confidence": confidence,
        },
        "constraints": {
            "asset_cap": round(asset_cap, 4),
        },
        "metrics": metrics,
        "execution": {
            "effective_date": effective_date,
            "rebalance_threshold": rebalance_threshold,
        },
        "meta": {
            "generated_at": datetime.now(
                timezone(timedelta(hours=8))
            ).isoformat(timespec="seconds"),
            "engine_version": "quant_fsm_v1.0",
        },
    }

    return signal

def render_signal_to_text(signal: dict) -> str:
    """
    Convert daily_signal.json dict into human-readable Chinese text.
    """

    asset = signal["asset"]["code"]
    s = signal["signal"]
    exec_info = signal["execution"]

    pos = s["final_position"]
    state = s["state"]
    action = s["action"]
    eff_date = exec_info["effective_date"]

    # ---- 核心语义判断
    if pos == 0.0:
        if state == "ACTIVE":
            core = "当前系统状态允许参与，但今日未检测到有效机会，建议保持空仓观望。"
        elif state == "PROBE":
            core = "系统处于试探阶段，当前不建议建立仓位。"
        elif state == "COOLDOWN":
            core = "系统处于风控冷却期，明确建议空仓。"
        else:  # IDLE
            core = "当前无策略信号，建议空仓。"
    else:
        pct = int(round(pos * 100))
        if state == "ACTIVE":
            core = f"系统确认有效机会，建议持有约 {pct}% 的仓位。"
        elif state == "PROBE":
            core = f"系统处于试探阶段，建议小仓位参与（约 {pct}%）。"
        else:
            core = f"建议持有约 {pct}% 的仓位。"

    # ---- 动作提示
    if action == "BUY":
        act = "需要加仓。"
    elif action == "SELL":
        act = "需要减仓。"
    else:
        act = "无需调整当前仓位。"

    text = (
        f"【今日持仓建议：{asset}】\n"
        f"{core}\n"
        f"{act}\n\n"
        f"执行生效日期：{eff_date}"
    )

    return text


if __name__ == "__main__":

    fund_codes=[
        "001194",
        "016841",
        "161226",
        "001037",
        "019005",
        "007817",
        "000218",
        "020412",
        "020412"
    ]
    for fund_code in fund_codes:
        # print(fund_code)
        # exit()
        df = load_cn_fund_daily(fund_code)
        df = df[df.index >= "2015-01-01"].copy()

        sp = MeanReversionParams(
            lookback_n=5,
            th_mid=-0.02,
            th_big=-0.05,
        )

        rp = RiskParams(
            hard_stop_dd=0.10,
            rebound_y=0.02,
            favorable_days=3,
            unfavorable_x=0.02,
            cap_probe=0.25,
            cap_active=1.0,
        )

        cp = CostParams(fee_bps=10.0)

        # 👇 关键新增
        ap = AssetParams(asset_cap=0.3)

        out = backtest(df, sp, rp, cp, ap)
        stats = summarize(out)


        print(f"Fund code: {fund_code}")
        for k in sorted(stats.keys()):
            print(f"{k:>22s}: {stats[k]: .6f}")

        out.to_csv(f"backtest_{fund_code}.csv", index=True)
        print("Saved:", f"backtest_{fund_code}.csv")

        signal = export_daily_signal(
        out=out,
        fund_code=fund_code,
        asset_type="open_fund",   # or "etf"
        asset_cap=ap.asset_cap,
        )

        with open(f"daily_signal_{fund_code}.json", "w", encoding="utf-8") as f:
            json.dump(signal, f, ensure_ascii=False, indent=2)

        print("Saved daily signal:", f"daily_signal_{fund_code}.json")

        print(render_signal_to_text(signal))

# if __name__ == "__main__":
#     # ---- Choose a real symbol from Stooq
#     # Examples: "spy.us" (S&P500 ETF), "qqq.us", "^spx" (index)
#     symbol = "spy.us"

#     df = load_stooq_daily(symbol)

#     # Optional: cut a modern window to reduce regime mixing
#     df = df[df.index >= "2010-01-01"].copy()

#     sp = MeanReversionParams(lookback_n=5, th_mid=-0.02, th_big=-0.05)
#     rp = RiskParams(
#         hard_stop_dd=0.10,
#         rebound_y=0.02,
#         favorable_days=3,
#         unfavorable_x=0.02,
#         cap_probe=0.25,
#         cap_active=1.0,
#     )
#     cp = CostParams(fee_bps=5.0)

#     out = backtest(df, sp, rp, cp)
#     stats = summarize(out)

#     print(f"Symbol: {symbol}")
#     for k in sorted(stats.keys()):
#         print(f"{k:>18s}: {stats[k]: .6f}")

#     # Save result for inspection
#     out.to_csv(f"backtest_{symbol.replace('^','')}.csv", index=True)
#     print("Saved:", f"backtest_{symbol.replace('^','')}.csv")
