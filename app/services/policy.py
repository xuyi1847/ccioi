from typing import Iterable

from app.services.data import is_etf_code


def load_policy(fund_codes: Iterable[str]) -> dict:
    defaults = {
        "asset_cap": 0.3,
        "min_history_days": 252,
    }

    assets = {}
    seen = set()
    for code in fund_codes:
        code = str(code).strip()
        if not code or code in seen:
            continue
        seen.add(code)

        assets[code] = {
            "name": f"FUND_{code}",
            "type": "etf" if is_etf_code(code) else "open_fund",
            "asset_cap": defaults["asset_cap"],
            "risk_level": "medium",
            "notes": "Placeholder: to be computed from AkShare data.",
        }

    return {
        "version": "dynamic",
        "updated_at": "",
        "defaults": defaults,
        "assets": assets,
    }

def resolve_asset_cap(code: str, policy: dict, suggested: float) -> float:
    asset_cfg = policy.get("assets", {}).get(code)
    if asset_cfg:
        return min(asset_cfg["asset_cap"], suggested)
    return min(policy["defaults"]["asset_cap"], suggested)
