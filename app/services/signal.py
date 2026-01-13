from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional

import pandas as pd

from app.services.data import load_cn_fund_daily


@dataclass(frozen=True)
class MeanReversionParams:
    lookback_n: int = 5
    th_small: float = 0.00
    th_mid: float = -0.02
    th_big: float = -0.05


def compute_target_position(close: pd.Series, p: MeanReversionParams) -> pd.Series:
    ret_n = close / close.shift(p.lookback_n) - 1.0
    k = abs(p.th_big)
    target = (-ret_n / k).clip(lower=0.0, upper=1.0)
    target = target.where(ret_n < 0, 0.0)
    return target.fillna(0.0)


class TradeState(str, Enum):
    IDLE = "IDLE"
    PROBE = "PROBE"
    ACTIVE = "ACTIVE"
    COOLDOWN = "COOLDOWN"


@dataclass
class RiskParams:
    hard_stop_dd: float = 0.10
    rebound_y: float = 0.02
    favorable_days: int = 3
    unfavorable_x: float = 0.02
    cap_idle: float = 0.0
    cap_probe: float = 0.25
    cap_active: float = 1.0
    cap_cooldown: float = 0.0


@dataclass(frozen=True)
class AssetParams:
    asset_cap: float = 1.0


@dataclass
class RiskContext:
    state: TradeState = TradeState.IDLE
    ref_price: Optional[float] = None
    cooldown_since: Optional[pd.Timestamp] = None
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
    state = ctx.state

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

    if state == TradeState.COOLDOWN:
        if ret1_t >= rp.rebound_y:
            return RiskContext(
                state=TradeState.PROBE,
                ref_price=close_t,
                cooldown_since=None,
                probe_start=t,
            )
        return ctx

    if state == TradeState.IDLE:
        if target_eff_t > 0:
            return RiskContext(
                state=TradeState.PROBE,
                ref_price=close_t,
                cooldown_since=None,
                probe_start=t,
            )
        return ctx

    if state == TradeState.ACTIVE:
        if ret1_t <= -rp.unfavorable_x:
            return RiskContext(
                state=TradeState.PROBE,
                ref_price=close_t,
                cooldown_since=None,
                probe_start=t,
            )
        return ctx

    if state == TradeState.PROBE:
        if ctx.probe_start is None:
            ctx.probe_start = t

        days_in_probe = (t - ctx.probe_start).days
        if target_eff_t <= 0:
            return RiskContext(
                state=TradeState.IDLE,
                ref_price=None,
                cooldown_since=None,
                probe_start=None,
            )
        if days_in_probe >= rp.favorable_days and ret1_t > -rp.unfavorable_x:
            return RiskContext(
                state=TradeState.ACTIVE,
                ref_price=close_t,
                cooldown_since=None,
                probe_start=None,
            )
        return ctx

    return ctx


@dataclass(frozen=True)
class CostParams:
    fee_bps: float = 5.0


def backtest(
    df: pd.DataFrame,
    sp: MeanReversionParams,
    rp: RiskParams,
    cp: CostParams,
    ap: AssetParams,
) -> pd.DataFrame:
    close = df["close"].copy()
    ret1 = close.pct_change().fillna(0.0)

    target = compute_target_position(close, sp)
    target_eff = target.shift(1).fillna(0.0)

    ctx = RiskContext()
    states = []
    caps = []
    actual_pos = []

    for t, close_t in close.items():
        ret1_t = float(ret1.loc[t])
        target_eff_t = float(target_eff.loc[t])

        ctx = step_fsm(t, float(close_t), ret1_t, target_eff_t, ctx, rp)
        cap_t = cap_by_state(ctx.state, rp)

        if ctx.state == TradeState.PROBE:
            cap_t = min(cap_t, target_eff_t)

        pos_t = min(max(target_eff_t, 0.0), cap_t, ap.asset_cap)

        states.append(ctx.state.value)
        caps.append(cap_t)
        actual_pos.append(pos_t)

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

    out["turnover"] = out["pos"].diff().abs().fillna(out["pos"].abs())
    out["cost"] = out["turnover"] * (cp.fee_bps / 10000.0)
    out["strategy_ret"] = out["pos"].shift(1).fillna(0.0) * out["ret1"] - out["cost"]
    out["nav"] = (1.0 + out["strategy_ret"]).cumprod()
    out["nav_peak"] = out["nav"].cummax()
    out["dd"] = out["nav"] / out["nav_peak"] - 1.0

    return out


def export_daily_signal(
    out: pd.DataFrame,
    fund_code: str,
    asset_cap: float,
    rebalance_threshold: float = 0.01,
) -> Dict[str, object]:
    if out.empty:
        raise ValueError("Backtest output is empty")

    last = out.iloc[-1]

    final_position = float(last["pos"])
    target_position = float(last["target_eff"])
    state = str(last["state"])

    prev_pos = float(out["pos"].iloc[-2]) if len(out) >= 2 else 0.0
    delta = final_position - prev_pos

    if abs(delta) < rebalance_threshold:
        action = "HOLD"
    elif delta > 0:
        action = "BUY"
    else:
        action = "SELL"

    if state == "ACTIVE" and final_position >= 0.5 * asset_cap:
        confidence = "HIGH"
    elif state in ("ACTIVE", "PROBE"):
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    metrics = {
        "asset_cap": round(asset_cap, 4),
        "target_position": round(target_position, 4),
        "recent_return_1d": round(float(last["ret1"]), 4),
        "drawdown_from_peak": round(float(last["dd"]), 4),
    }

    return {
        "code": fund_code,
        "action": action,
        "final_position": round(final_position, 4),
        "state": state,
        "confidence": confidence,
        "metrics": metrics,
    }


def evaluate_single_asset(code: str, asset_cap: float) -> dict:
    df = load_cn_fund_daily(code)
    df = df[df.index >= "2015-01-01"].copy()

    sp = MeanReversionParams(lookback_n=5, th_mid=-0.02, th_big=-0.05)
    rp = RiskParams(
        hard_stop_dd=0.10,
        rebound_y=0.02,
        favorable_days=3,
        unfavorable_x=0.02,
        cap_probe=0.25,
        cap_active=1.0,
    )
    cp = CostParams(fee_bps=10.0)
    ap = AssetParams(asset_cap=asset_cap)

    out = backtest(df, sp, rp, cp, ap)
    return export_daily_signal(out, code, asset_cap)
