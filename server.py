import json
import time
import uuid
from typing import Dict, Optional, Tuple

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

# =========================================================
# GPU Registry
# =========================================================
# gpu_id -> {
#   ws: WebSocket,
#   status: "idle" | "busy",
#   last_heartbeat: float,
#   current_task: Optional[str]
# }
gpu_registry: Dict[str, dict] = {}

# task_id -> frontend websocket
task_frontend_map: Dict[str, WebSocket] = {}

# task_id -> gpu_id (for debugging / optional future use)
task_gpu_map: Dict[str, str] = {}


# =========================================================
# Command Builder
# =========================================================
def build_torchrun_command(payload: dict) -> str:
    """
    构建 torchrun 命令：
    - ref_image 为 None 时，不传 --cond_type / --ref
    """
    p = payload["parameters"]

    cmd = [
        "torchrun",
        "--nproc_per_node", "1",
        "--standalone",
        "scripts/diffusion/inference.py",
        p["config"],
        "--save-dir", "outputs/videodemo5",
        "--prompt", f"\"{p['prompt']}\"",
        "--sampling_option.num_steps", str(p["steps"]),
        "--sampling_option.num_frames", str(p["frames"]),
        "--sampling_option.aspect_ratio", p["ratio"],
        "--fps_save", str(p["fps"]),
    ]

    # ✅ 只有存在 ref_image 时才加 cond_type / ref
    if p.get("ref_image"):
        cmd.extend([
            "--cond_type", p["cond"],
            "--ref", p["ref_image"]
        ])

    return " ".join(cmd)


# =========================================================
# Scheduler
# =========================================================
def select_idle_gpu() -> Tuple[Optional[str], Optional[dict]]:
    # 简单策略：选第一个 idle GPU
    for gpu_id, info in gpu_registry.items():
        if info["status"] == "idle":
            return gpu_id, info
    return None, None


# =========================================================
# GPU WebSocket (reverse)
# =========================================================
@app.websocket("/ws/gpu")
async def gpu_ws(ws: WebSocket):
    await ws.accept()

    # ---------- 注册 ----------
    try:
        register_msg = json.loads(await ws.receive_text())
    except Exception:
        await ws.close(code=1008)
        return

    gpu_id = register_msg.get("gpu_id")
    if not gpu_id:
        await ws.close(code=1008)
        return

    gpu_registry[gpu_id] = {
        "ws": ws,
        "status": "idle",
        "last_heartbeat": time.time(),
        "current_task": None,
    }

    print(f"🔥 GPU registered: {gpu_id}")

    try:
        while True:
            msg = json.loads(await ws.receive_text())
            msg_type = msg.get("type")

            # ---------- 心跳 ----------
            if msg_type == "heartbeat":
                gpu_registry[gpu_id]["last_heartbeat"] = time.time()

            # ---------- 实时日志 ----------
            elif msg_type == "TASK_LOG":
                task_id = msg.get("task_id")
                frontend_ws = task_frontend_map.get(task_id)
                if frontend_ws:
                    # 原样转发给前端
                    await frontend_ws.send_text(json.dumps(msg))
                else:
                    # 前端可能已断开/重连；这里先打印，方便定位
                    #（后续可升级为 session_id 方案避免丢消息）
                    print(f"⚠️ No frontend ws for TASK_LOG, task_id={task_id}")

            # ---------- 任务完成（含 public_url） ----------
            elif msg_type == "task_finished":
                task_id = msg.get("task_id")

                # GPU 状态恢复
                if gpu_id in gpu_registry:
                    gpu_registry[gpu_id]["status"] = "idle"
                    gpu_registry[gpu_id]["current_task"] = None

                print(f"✅ GPU {gpu_id} finished task {task_id}")
                print("📦 GPU RETURN PAYLOAD:")
                print(json.dumps(msg, ensure_ascii=False, indent=2))

                frontend_ws = task_frontend_map.pop(task_id, None)
                task_gpu_map.pop(task_id, None)

                if frontend_ws:
                    print("📤 Forwarding task_finished to frontend (passthrough)")
                    # ✅ 原样透传，不包、不改
                    await frontend_ws.send_text(json.dumps(msg))
                else:
                    print(f"⚠️ No frontend websocket found for task {task_id}")

            else:
                print(f"⚠️ Unknown GPU message type: {msg_type}")

    except WebSocketDisconnect:
        # GPU 断开
        gpu_registry.pop(gpu_id, None)
        print(f"❌ GPU disconnected: {gpu_id}")
    except Exception as e:
        gpu_registry.pop(gpu_id, None)
        print(f"🔥 GPU error ({gpu_id}): {e}")


# =========================================================
# Frontend WebSocket
# =========================================================
@app.websocket("/ws")
async def frontend_ws(ws: WebSocket):
    await ws.accept()
    print("✅ Frontend connected")

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)

            if data.get("type") != "TASK_EXECUTION":
                await ws.send_text(json.dumps({
                    "type": "IGNORED",
                    "message": "Unsupported message type"
                }))
                continue

            # ---------- 调度 GPU ----------
            gpu_id, gpu = select_idle_gpu()
            if not gpu:
                await ws.send_text(json.dumps({
                    "type": "TASK_REJECTED",
                    "message": "No idle GPU available"
                }))
                continue

            # ---------- 构建任务 ----------
            task_id = str(uuid.uuid4())
            command = build_torchrun_command(data)

            gpu["status"] = "busy"
            gpu["current_task"] = task_id

            task_frontend_map[task_id] = ws
            task_gpu_map[task_id] = gpu_id

            print(f"📤 Dispatch task {task_id} to GPU {gpu_id}")
            print("🧠 Torchrun command:")
            print(command)

            # ---------- 发送给 GPU ----------
            await gpu["ws"].send_text(json.dumps({
                "type": "exec_command",
                "task_id": task_id,
                "command": command
            }))

            # ---------- Ack 前端 ----------
            await ws.send_text(json.dumps({
                "type": "TASK_ACCEPTED",
                "task_id": task_id,
                "gpu_id": gpu_id
            }))

    except WebSocketDisconnect:
        print("❌ Frontend disconnected")
        # 可选：清理该 ws 相关的 task 映射（这里保守不清理，避免误删）
    except Exception as e:
        print("🔥 Frontend WS error:", e)
