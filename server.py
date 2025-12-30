import json
import time
import uuid
from typing import Dict, Optional, Tuple
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import os
import oss2
from fastapi import UploadFile, File, HTTPException
from fastapi import Depends, Header
app = FastAPI()

# =========================================================
# CORS (Frontend Upload Support)
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://115.191.1.112:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# =========================================================
# OSS CONFIG (⚠️ 明文写入，仅按你的要求)
# =========================================================
OSS_ACCESS_KEY_ID = os.getenv("OSS_ACCESS_KEY_ID")
OSS_ACCESS_KEY_SECRET = os.getenv("OSS_ACCESS_KEY_SECRET")
OSS_BUCKET = os.getenv("OSS_BUCKET", "yisvideo")
OSS_ENDPOINT = os.getenv("OSS_ENDPOINT", "oss-cn-shanghai.aliyuncs.com")
auth = oss2.Auth(OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
bucket = oss2.Bucket(
    auth,
    f"https://{OSS_ENDPOINT}",
    OSS_BUCKET
)
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
        "--nproc_per_node", "2",
        "--standalone",
        "scripts/diffusion/inference.py",
        p["config"],
        "--save-dir", "outputs/videodemo5",
        "--prompt", f"\"{p['prompt']}\"",
        "--sampling_option.num_steps", str(p["steps"]),
        "--sampling_option.num_frames", str(p["frames"]),
        "--sampling_option.aspect_ratio", p["ratio"],
        "--fps_save", str(p["fps"]),
        "--motion_score", str(p["motion_score"])
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
                if msg.get("status") == "success":
                    user_id = msg.get("user_id")
                    task_id = msg.get("task_id")

                    if user_id:
                        meta_key = f"users/{user_id}/meta/{task_id}.json"
                        bucket.put_object(
                            meta_key,
                            json.dumps({
                                "id": task_id,
                                "user_id": user_id,
                                "prompt": msg.get("prompt"),
                                "video_url": msg.get("public_url"),
                                "created_at": time.time(),
                            })
                        )

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
# =========================================================
# HTTP Upload API (Frontend -> Server -> OSS)
# =========================================================
@app.post("/upload")
async def upload_to_oss(file: UploadFile = File(...)):
    """
    上传文件到 OSS
    返回可公网访问的 URL
    """
    try:
        # 生成唯一文件名
        ext = os.path.splitext(file.filename)[1]
        object_key = f"uploads/{uuid.uuid4().hex}{ext}"

        # 读文件内容
        content = await file.read()

        # 上传到 OSS
        bucket.put_object(object_key, content)

        public_url = f"https://{OSS_BUCKET}.{OSS_ENDPOINT}/{object_key}"

        return {
            "status": "success",
            "object_key": object_key,
            "public_url": public_url
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr
import uuid
import time
# =========================================================
# 邀请码配置（后面你可以改成 DB / Redis / 管理后台）
# =========================================================
VALID_INVITE_CODES = {
    "CCIOI-ALPHA",
    "CCIOI-BETA",
    "INTERNAL-2025",
}

# =========================================================
# 内存用户表（占位用）
# =========================================================
users_by_email = {}
users_by_id = {}
import uuid
import time

users_by_email = {}
users_by_id = {}

# =========================================================
# 预置 10 个用户（开发 / 内测用）
# =========================================================
for i in range(1, 11):
    user_id = str(uuid.uuid4())
    email = f"user{i}@ccioi.com"

    user = {
        "id": user_id,
        "email": email,
        "name": f"Test User {i}",
        "balance": 100.0,           # 给点初始余额，方便你后面计费
        "created_at": time.time(),
        "invite_code": "SYSTEM_PRESET",
    }

    users_by_email[email] = user
    users_by_id[user_id] = user
# =========================================================
# Models
# =========================================================
class RegisterReq(BaseModel):
    email: EmailStr
    name: str
    invite_code: str

class LoginReq(BaseModel):
    email: EmailStr

class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    balance: float = 0.0


# =========================================================
# 注册（必须邀请码）
# =========================================================
@app.post("/register", response_model=UserOut)
async def register(req: RegisterReq):
    email = req.email.lower().strip()
    name = req.name.strip()
    invite_code = req.invite_code.strip()

    # 1️⃣ 校验邀请码
    if invite_code not in VALID_INVITE_CODES:
        raise HTTPException(status_code=403, detail="Invalid invite code")

    # 2️⃣ 校验是否已注册
    if email in users_by_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    # 3️⃣ 创建用户
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": email,
        "name": name,
        "balance": 0.0,
        "created_at": time.time(),
        "invite_code": invite_code,
    }

    users_by_email[email] = user
    users_by_id[user_id] = user

    return user


# =========================================================
# 登录
# =========================================================
@app.post("/login", response_model=UserOut)
async def login(req: LoginReq):
    email = req.email.lower().strip()

    user = users_by_email.get(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def get_user_id_from_auth(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return authorization.replace("Bearer ", "").strip()


@app.get("/history")
async def get_history(user_id: str = Depends(get_user_id_from_auth)):
    """
    获取用户生成历史（从 OSS meta 目录读取）
    """
    prefix = f"users/{user_id}/meta/"
    records = []

    try:
        for obj in oss2.ObjectIterator(bucket, prefix=prefix):
            content = bucket.get_object(obj.key).read().decode("utf-8")
            records.append(json.loads(content))

        # 按时间倒序
        records.sort(key=lambda x: x.get("created_at", 0), reverse=True)
        return records

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/history/{task_id}")
async def delete_history_item(
    task_id: str,
    user_id: str = Depends(get_user_id_from_auth)
):
    """
    删除历史记录（meta + video）
    """
    meta_key = f"users/{user_id}/meta/{task_id}.json"
    video_key = f"users/{user_id}/videos/{task_id}.mp4"

    try:
        # meta 必删
        if bucket.object_exists(meta_key):
            bucket.delete_object(meta_key)

        # video 可选删（你可以只删 meta，保留视频）
        if bucket.object_exists(video_key):
            bucket.delete_object(video_key)

        return {"status": "deleted", "task_id": task_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
