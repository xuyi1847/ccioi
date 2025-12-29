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
#   ws,
#   status,
#   last_heartbeat,
#   current_task
# }
gpu_registry: Dict[str, dict] = {}

# task_id -> frontend websocket
task_frontend_map: Dict[str, WebSocket] = {}


# =========================================================
# Command Builder
# =========================================================
def build_torchrun_command(payload: dict) -> str:
    p = payload["parameters"]

    cmd = [
        "torchrun",
        "--nproc_per_node", "1",
        "--standalone",
        "scripts/diffusion/inference.py",
        p["config"],
        "--cond_type", p["cond"],
        "--save-dir", "outputs/videodemo5",
        "--prompt", f"\"{p['prompt']}\"",
        "--sampling_option.num_steps", str(p["steps"]),
        "--sampling_option.num_frames", str(p["frames"]),
        "--sampling_option.aspect_ratio", p["ratio"],
        "--fps_save", str(p["fps"]),
    ]

    if p.get("ref_image"):
        cmd.extend(["--ref", p["ref_image"]])

    return " ".join(cmd)


def select_idle_gpu():
    for gpu_id, info in gpu_registry.items():
        if info["status"] == "idle":
            return gpu_id, info
    return None, None


# =========================================================
# GPU WebSocket
# =========================================================
@app.websocket("/ws/gpu")
async def gpu_ws(ws: WebSocket):
    await ws.accept()

    register_msg = json.loads(await ws.receive_text())
    gpu_id = register_msg.get("gpu_id")
    if not gpu_id:
        await ws.close()
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

            if msg_type == "heartbeat":
                gpu_registry[gpu_id]["last_heartbeat"] = time.time()

            elif msg_type == "task_finished":
                task_id = msg.get("task_id")

                gpu_registry[gpu_id]["status"] = "idle"
                gpu_registry[gpu_id]["current_task"] = None

                print(f"✅ GPU {gpu_id} finished task {task_id}")

                # ===== 转发给前端 =====
                frontend_ws = task_frontend_map.pop(task_id, None)
                if frontend_ws:
                    await frontend_ws.send_text(json.dumps({
                        "type": "TASK_RESULT",
                        "task_id": task_id,
                        "result": msg
                    }))

    except WebSocketDisconnect:
        gpu_registry.pop(gpu_id, None)
        print(f"❌ GPU disconnected: {gpu_id}")


# =========================================================
# Frontend WebSocket
# =========================================================
@app.websocket("/ws")
async def frontend_ws(ws: WebSocket):
    await ws.accept()
    print("✅ Frontend connected")

    try:
        while True:
            data = json.loads(await ws.receive_text())

            if data.get("type") != "TASK_EXECUTION":
                continue

            gpu_id, gpu = select_idle_gpu()
            if not gpu:
                await ws.send_text(json.dumps({
                    "status": "error",
                    "message": "No idle GPU available"
                }))
                continue

            task_id = str(uuid.uuid4())
            command = build_torchrun_command(data)

            gpu["status"] = "busy"
            gpu["current_task"] = task_id
            task_frontend_map[task_id] = ws

            await gpu["ws"].send_text(json.dumps({
                "type": "exec_command",
                "task_id": task_id,
                "command": command
            }))

            await ws.send_text(json.dumps({
                "type": "TASK_ACCEPTED",
                "task_id": task_id,
                "gpu_id": gpu_id
            }))

            print(f"📤 Task {task_id} → GPU {gpu_id}")

    except WebSocketDisconnect:
        print("❌ Frontend disconnected")
