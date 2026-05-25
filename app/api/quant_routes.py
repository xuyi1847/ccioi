import json
import os
import time
import traceback
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel
from app.schemas.models import EvaluateRequest, EvaluateResponse
from app.services.asset_eval import estimate_asset_caps
from app.services.policy import load_policy, resolve_asset_cap
from app.services.signal import evaluate_single_asset
from app.services.summary import summarize_signal, summarize_portfolio
from app.services.ak_tools import get_fund_daily_history, get_fund_daily_summary, get_fund_intraday_estimate
from app.services.fund_intraday_store import get_fund_intraday_store

router = APIRouter(prefix="/quant")

_fund_intraday_store = get_fund_intraday_store()

class QuantChatReq(BaseModel):
    messages: list[dict]
    stream: bool = False
    model: Optional[str] = None

@router.post("/evaluate_assets", response_model=EvaluateResponse)
def evaluate_assets(req: EvaluateRequest):

    codes = [c for c in req.fund_codes if c.isdigit()]
    if not codes:
        raise HTTPException(status_code=400, detail="No valid fund codes")

    policy = load_policy(codes)
    suggestions = estimate_asset_caps(codes)

    assets_out = []

    for code in codes:
        suggested = suggestions.get(code)
        if not suggested:
            continue

        final_cap = resolve_asset_cap(
            code,
            policy,
            suggested["suggested_cap"]
        )

        signal = evaluate_single_asset(code, final_cap)
        summary = summarize_signal(signal)

        assets_out.append({
            "code": code,
            "suggested_cap": suggested["suggested_cap"],
            "policy_cap": policy.get(code, {}).get(
                "asset_cap",
                policy["defaults"]["asset_cap"]
            ),
            "final_cap": final_cap,
            "signal": signal,
            "summary": summary,
        })

    total_amount = req.total_amount
    total_pos = sum(float(a["signal"]["final_position"]) for a in assets_out)
    allocations = []

    for asset in assets_out:
        target_position = float(asset["signal"]["final_position"])
        target_amount = (
            round(total_amount * target_position, 2)
            if total_amount is not None
            else None
        )
        target_weight = (
            round(target_position / total_pos, 4)
            if total_pos > 0
            else None
        )
        allocations.append(
            {
                "code": asset["code"],
                "target_position": round(target_position, 4),
                "target_amount": target_amount,
                "target_weight": target_weight,
            }
        )

    total_position_amount = (
        round(total_amount * total_pos, 2)
        if total_amount is not None
        else None
    )

    return {
        "date": req.date,
        "assets": assets_out,
        "portfolio_summary": summarize_portfolio(assets_out, total_amount),
        "total_amount": total_amount,
        "total_position_amount": total_position_amount,
        "allocations": allocations,
    }


@router.post("/chat")
async def quant_chat(req: QuantChatReq):
    api_key = os.getenv("CCIOI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Missing API key: set CCIOI_API_KEY (or OPENAI_API_KEY for local development).",
        )

    base_url = os.getenv("CCIOI_BASE_URL", "https://api.deepseek.com")
    client = OpenAI(api_key=api_key, base_url=base_url)
    model = req.model or "deepseek-chat"

    system_guardrail = (
        "You are the CCIOI Quant Assistant. Do not reveal or discuss model "
        "identity, training data, or provider details. If asked, say you are "
        "a CCIOI assistant and cannot disclose internal implementation details."
    )
    tool_list = (
        "Tools:\n"
        "1) fund_daily_summary(code, lookback_days=20): latest close, 1d/5d/20d return, drawdown.\n"
        "2) fund_daily_history(code, start=None, end=None, limit=120): OHLCV history.\n"
        "If tool is needed, respond ONLY with JSON like:\n"
        '{"tool":"fund_daily_summary","args":{"code":"161226","lookback_days":60}}\n'
        'or {"tool":"none"}.\n'
    )

    try:
        decision = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a finance data router."},
                {"role": "system", "content": system_guardrail},
                {"role": "system", "content": tool_list},
                *req.messages,
            ],
            stream=False,
        )
        decision_text = decision.choices[0].message.content or ""
        tool_call = {"tool": "none", "args": {}}
        try:
            tool_call = json.loads(decision_text)
        except Exception:
            tool_call = {"tool": "none", "args": {}}

        tool_result = None
        if tool_call.get("tool") == "fund_daily_summary":
            args = tool_call.get("args", {})
            tool_result = get_fund_daily_summary(
                code=str(args.get("code", "")).strip(),
                lookback_days=int(args.get("lookback_days", 20)),
            )
        elif tool_call.get("tool") == "fund_daily_history":
            args = tool_call.get("args", {})
            tool_result = get_fund_daily_history(
                code=str(args.get("code", "")).strip(),
                start=args.get("start"),
                end=args.get("end"),
                limit=int(args.get("limit", 120)),
            )

        final_messages = [{"role": "system", "content": system_guardrail}] + list(req.messages)
        if tool_result is not None:
            final_messages = [
                {"role": "system", "content": system_guardrail},
                {"role": "system", "content": "Use the tool result to answer the user."},
                {"role": "system", "content": f"Tool result: {json.dumps(tool_result, ensure_ascii=False)}"},
                *req.messages,
            ]

        if req.stream:
            def stream_generator():
                try:
                    response = client.chat.completions.create(
                        model=model,
                        messages=final_messages,
                        stream=True,
                    )
                    for chunk in response:
                        delta = chunk.choices[0].delta
                        content = getattr(delta, "content", None)
                        if content:
                            yield f"data: {content}\n\n"
                except Exception as exc:
                    print(f"🔥 /quant/chat stream failed: {exc}")
                    print(traceback.format_exc())
                    yield f"data: [ERROR] {exc}\n\n"

            return StreamingResponse(
                stream_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                },
            )

        response = client.chat.completions.create(
            model=model,
            messages=final_messages,
            stream=False,
        )
        return {"content": response.choices[0].message.content}
    except Exception as exc:
        print(f"🔥 /quant/chat failed: {exc}")
        print(traceback.format_exc())
        raise HTTPException(status_code=502, detail=f"Upstream chat provider error: {exc}")


@router.get("/fund_intraday_estimate")
async def fund_intraday_estimate(
    code: str,
    stream: bool = False,
    interval: int = 15,
    amount: float = 10000.0,
    invest_amount: Optional[float] = None,
    top_n: int = 100,
    year: Optional[str] = None,
):
    """
    Estimate intraday fund NAV based on holdings weights and realtime stock changes.
    """
    code = str(code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Missing fund code")
    if not code.isdigit() or len(code) != 6:
        raise HTTPException(status_code=400, detail="Fund code must be a 6-digit number")
    if invest_amount is not None:
        amount = float(invest_amount)
    interval = max(3, min(int(interval), 120))

    if not stream:
        _fund_intraday_store.save(
            {
                "ts": time.time(),
                "code": code,
                "amount": amount,
                "top_n": top_n,
                "year": year,
            }
        )
        try:
            result = get_fund_intraday_estimate(code, invest_amount=amount, top_n=top_n, year=year)
            return result
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    def stream_generator():
        while True:
            _fund_intraday_store.save(
                {
                    "ts": time.time(),
                    "code": code,
                    "amount": amount,
                    "top_n": top_n,
                    "year": year,
                }
            )
            try:
                payload = get_fund_intraday_estimate(code, invest_amount=amount, top_n=top_n, year=year)
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            time.sleep(interval)

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/fund_intraday_history")
async def fund_intraday_history():
    records = _fund_intraday_store.list(limit=500)
    unique = {}
    for r in records:
        code = str(r.get("code") or "")
        if not code or code in unique:
            continue
        unique[code] = {
            "code": code,
            "invest_amount": r.get("amount"),
            "top_n": r.get("top_n"),
            "year": r.get("year"),
            "ts": r.get("ts"),
        }
    result = list(unique.values())
    return {"count": len(result), "records": result}
