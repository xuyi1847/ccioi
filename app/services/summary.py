def summarize_signal(signal: dict) -> str:
    pos = float(signal.get("final_position", 0.0))
    state = str(signal.get("state", "IDLE"))
    action = str(signal.get("action", "HOLD"))

    if pos == 0.0:
        if state == "ACTIVE":
            core = "当前系统状态允许参与，但今日未检测到有效机会，建议保持空仓观望。"
        elif state == "PROBE":
            core = "系统处于试探阶段，当前不建议建立仓位。"
        elif state == "COOLDOWN":
            core = "系统处于风控冷却期，明确建议空仓。"
        else:
            core = "当前无策略信号，建议空仓。"
    else:
        pct = int(round(pos * 100))
        if state == "ACTIVE":
            core = f"系统确认有效机会，建议持有约 {pct}% 的仓位。"
        elif state == "PROBE":
            core = f"系统处于试探阶段，建议小仓位参与（约 {pct}%）。"
        else:
            core = f"建议持有约 {pct}% 的仓位。"

    if action == "BUY":
        act = "需要加仓。"
    elif action == "SELL":
        act = "需要减仓。"
    else:
        act = "无需调整当前仓位。"

    return f"{core}{act}"


def summarize_portfolio(assets: list[dict], total_amount: float | None = None) -> str:
    if not assets:
        return "当前无可用资产，组合维持空仓。"

    total_pos = sum(float(a["signal"]["final_position"]) for a in assets)
    total_cap = sum(float(a.get("final_cap", 0.0)) for a in assets)

    pos_pct = int(round(total_pos * 100))
    cap_pct = int(round(total_cap * 100)) if total_cap > 0 else 0

    actions = [a["signal"]["action"] for a in assets]
    buy_count = actions.count("BUY")
    sell_count = actions.count("SELL")

    if buy_count and not sell_count:
        action_note = "组合整体偏加仓。"
    elif sell_count and not buy_count:
        action_note = "组合整体偏减仓。"
    elif buy_count and sell_count:
        action_note = "组合内有加有减，按各资产信号分别调整。"
    else:
        action_note = "组合整体无需调整。"

    states = {a["signal"]["state"] for a in assets}
    if "COOLDOWN" in states:
        state_note = "部分资产处于风控冷却期。"
    elif states == {"IDLE"}:
        state_note = "组合整体暂无有效信号。"
    elif "PROBE" in states:
        state_note = "部分资产处于试探阶段。"
    else:
        state_note = "组合整体允许参与。"

    if cap_pct > 0:
        pos_note = f"组合建议总体仓位约 {pos_pct}%，组合上限约 {cap_pct}%。"
    else:
        pos_note = f"组合建议总体仓位约 {pos_pct}%。"

    if total_amount is not None:
        total_pos_amount = int(round(total_amount * total_pos))
        amount_note = f"对应资金约 {total_pos_amount}。"
        return f"{pos_note}{amount_note}{state_note}{action_note}"

    return f"{pos_note}{state_note}{action_note}"
