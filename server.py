import json
import time
import uuid
from typing import Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

# =========================================================
# GPU Registry
# =========================================================
# gpu_id -> {
#   ws: WebSocket,
#   status: "idle" | "busy",
#   last_heartbeat: float,
#   current_task: str | None
# }
gpu_registry: Dict[str, dict] = {}

# task_id -> frontend websocket
task_frontend_map: Dict[str, WebSocket] = {}


# =========================================================
# Torchrun Command Builder
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
# GPU Scheduler
# =========================================================
def select_idle_gpu():
    """
    简单调度策略：选第一个 idle GPU
    """
    for gpu_id, info in gpu_registry.items():
        if info["status"] == "idle":
            return gpu_id, info
    return None, None


# =========================================================
# GPU WebSocket (reverse connection)
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

            # ---------- 任务完成 ----------
            elif msg_type == "task_finished":
                task_id = msg.get("task_id")

                gpu_registry[gpu_id]["status"] = "idle"
                gpu_registry[gpu_id]["current_task"] = None

                print(f"✅ GPU {gpu_id} finished task {task_id}")
                print("📦 GPU RETURN PAYLOAD:")
                print(json.dumps(msg, ensure_ascii=False, indent=2))

                # 转发给前端
                frontend_ws = task_frontend_map.pop(task_id, None)
                if frontend_ws:
                    payload = {
                        "type": "TASK_RESULT",
                        "task_id": task_id,
                        "result": msg
                    }
                    print("📤 Forwarding result to frontend:")
                    print(json.dumps(payload, ensure_ascii=False, indent=2))
                    await frontend_ws.send_text(json.dumps(payload))
                else:
                    print(f"⚠️ No frontend websocket found for task {task_id}")

    except WebSocketDisconnect:
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
                print("⚠️ Unsupported frontend message:", data)
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
    except Exception as e:
        print("🔥 Frontend WS error:", e)
