from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class EvaluateRequest(BaseModel):
    fund_codes: List[str]
    date: Optional[str] = None
    total_amount: Optional[float] = None

class Signal(BaseModel):
    action: str
    final_position: float
    state: str
    confidence: str
    metrics: Dict[str, Any]

class AssetResult(BaseModel):
    code: str
    suggested_cap: float
    policy_cap: float
    final_cap: float
    signal: Signal
    summary: str


class Allocation(BaseModel):
    code: str
    target_position: float
    target_amount: Optional[float] = None
    target_weight: Optional[float] = None

class EvaluateResponse(BaseModel):
    date: Optional[str]
    assets: List[AssetResult]
    portfolio_summary: Optional[str] = None
    total_amount: Optional[float] = None
    total_position_amount: Optional[float] = None
    allocations: Optional[List[Allocation]] = None
