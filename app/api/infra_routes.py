# infra_routes.py
import json
import time
import uuid
from typing import Dict, Optional, Tuple, Any

import json
import time
import random
import csv
import asyncio
import traceback
from playwright.sync_api import sync_playwright
from concurrent.futures import ThreadPoolExecutor
import os
import jwt
import oss2

from fastapi import (
    FastAPI,
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    HTTPException,
    Depends,
    Header,
    Form,
)
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from openai import OpenAI

# =========================================================
# APP / ROUTER
# =========================================================
router = APIRouter()
app = FastAPI()
app.include_router(router)
frontend_ws_global = None
agent_ws_global = None
# =========================================================
# JWT CONFIG
# =========================================================
JWT_SECRET = os.getenv("JWT_SECRET", "ccioi-dev-secret")
JWT_ALGO = "HS256"
JWT_EXPIRE_SECONDS = 60 * 60 * 24 * 7  # 7 天

def create_jwt(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRE_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def parse_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_user_from_auth(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    token = authorization.replace("Bearer ", "").strip()
    return parse_jwt(token)

# =========================================================
# CORS
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.ccioi.com",
        "https://ccioi.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://115.191.1.112:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# OSS CONFIG
# =========================================================
OSS_ACCESS_KEY_ID = os.getenv("OSS_ACCESS_KEY_ID")
OSS_ACCESS_KEY_SECRET = os.getenv("OSS_ACCESS_KEY_SECRET")
OSS_BUCKET = os.getenv("OSS_BUCKET", "yisvideo")
OSS_ENDPOINT = os.getenv("OSS_ENDPOINT", "oss-cn-shanghai.aliyuncs.com")

if not OSS_ACCESS_KEY_ID or not OSS_ACCESS_KEY_SECRET:
    # 启动时就给出明确错误，避免运行时才发现
    print("⚠️ OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET is missing in environment variables.")

auth = oss2.Auth(OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
bucket = oss2.Bucket(auth, f"https://{OSS_ENDPOINT}", OSS_BUCKET)

def _oss_public_url(object_key: str) -> str:
    return f"https://{OSS_BUCKET}.{OSS_ENDPOINT}/{object_key}"

# =========================================================
# INVITE CODES + IN-MEM USERS
# =========================================================
VALID_INVITE_CODES = {
    "CCIOI-ALPHA",
    "CCIOI-BETA",
    "INTERNAL-2025",
}

users_by_email: Dict[str, dict] = {}
users_by_id: Dict[str, dict] = {}

# 预置 10 个用户（开发/内测）
for i in range(1, 11):
    user_id = str(uuid.uuid4())
    email = f"user{i}@ccioi.com"
    user = {
        "id": user_id,
        "email": email,
        "name": f"Test User {i}",
        "balance": 100.0,
        "created_at": time.time(),
        "invite_code": "SYSTEM_PRESET",
    }
    users_by_email[email] = user
    users_by_id[user_id] = user

# =========================================================
# Pydantic Models
# =========================================================
class RegisterReq(BaseModel):
    email: EmailStr
    name: str
    invite_code: str

class LoginReq(BaseModel):
    email: EmailStr


class DeepSeekChatReq(BaseModel):
    messages: list[dict]
    stream: bool = False
    model: Optional[str] = None

# =========================================================
# AUTH APIs
# =========================================================
@router.post("/register")
async def register(req: RegisterReq):
    email = req.email.lower().strip()

    if req.invite_code not in VALID_INVITE_CODES:
        raise HTTPException(status_code=403, detail="Invalid invite code")

    if email in users_by_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": email,
        "name": req.name.strip(),
        "balance": 0.0,
        "created_at": time.time(),
        "invite_code": req.invite_code.strip(),
    }
    users_by_email[email] = user
    users_by_id[user_id] = user

    token = create_jwt(user)

    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "balance": user["balance"],
        },
        "token": token,
    }

@router.post("/login")
async def login(req: LoginReq):
    email = req.email.lower().strip()
    user = users_by_email.get(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = create_jwt(user)

    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "balance": user["balance"],
        },
        "token": token,
    }


@router.post("/chat")
async def ccioi_chat(req: DeepSeekChatReq):
    api_key = os.getenv("CCIOI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="CCIOI_API_KEY is missing")

    base_url = os.getenv("CCIOI_BASE_URL", "https://api.deepseek.com")
    client = OpenAI(api_key=api_key, base_url=base_url)
    model = req.model or "deepseek-chat"

    system_guardrail = (
        "You are the CCIOI AI Assistant. Do not reveal or discuss model "
        "identity, training data, or provider details. If asked, say you are "
        "a CCIOI assistant and cannot disclose internal implementation details."
    )
    messages = [{"role": "system", "content": system_guardrail}] + req.messages

    if req.stream:
        def stream_generator():
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    stream=True,
                )
                for chunk in response:
                    delta = chunk.choices[0].delta
                    content = getattr(delta, "content", None)
                    if content:
                        yield f"data: {content}\n\n"
            except Exception as exc:
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
        messages=messages,
        stream=False,
    )
    return {"content": response.choices[0].message.content}


@router.post("/infra/chat")
async def ccioi_chat_compat(req: DeepSeekChatReq):
    return await ccioi_chat(req)

# =========================================================
# UPLOAD API (Frontend -> Server -> OSS)
# =========================================================
@router.post("/upload")
async def upload_to_oss(file: UploadFile = File(...)):
    """
    上传文件到 OSS
    返回可公网访问的 URL
    """
    try:
        ext = os.path.splitext(file.filename or "")[1] or ""
        object_key = f"uploads/{uuid.uuid4().hex}{ext}"

        content = await file.read()
        bucket.put_object(object_key, content)

        return {
            "status": "success",
            "object_key": object_key,
            "public_url": _oss_public_url(object_key),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================
# HISTORY APIs (JWT -> user_id -> list OSS meta)
# =========================================================
@router.get("/history")
async def get_history(user: dict = Depends(get_user_from_auth)):
    """
    获取用户生成历史（从 OSS meta 目录读取）
    目录约定：users/{user_id}/meta/{task_id}.json
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing sub")

    prefix = f"users/{user_id}/meta/"
    records = []

    try:
        for obj in oss2.ObjectIterator(bucket, prefix=prefix):
            raw = bucket.get_object(obj.key).read()
            try:
                content = raw.decode("utf-8")
                records.append(json.loads(content))
            except Exception:
                # 某个 meta 文件损坏不影响整体
                continue

        records.sort(key=lambda x: x.get("created_at", 0), reverse=True)
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/{task_id}")
async def delete_history_item(task_id: str, user: dict = Depends(get_user_from_auth)):
    """
    删除历史记录：
    - 删除 meta: users/{user_id}/meta/{task_id}.json
    - 不强制删除视频（因为你的视频目前在 videos/{task_id}.mp4，不在 users/{user_id}/videos/）
      如需删视频，这里可以按 meta 里的 video_url 反推出 key 再删
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing sub")

    meta_key = f"users/{user_id}/meta/{task_id}.json"

    try:
        if bucket.object_exists(meta_key):
            bucket.delete_object(meta_key)
        return {"status": "deleted", "task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================
# GPU Registry / WS Bridge
# =========================================================
# gpu_id -> {ws, status, last_heartbeat, current_task}
gpu_registry: Dict[str, dict] = {}

# task_id -> frontend websocket
task_frontend_map: Dict[str, WebSocket] = {}

# task_id -> gpu_id
task_gpu_map: Dict[str, str] = {}

# task_id -> {"user_id": str, "prompt": str, "created_at": float}
task_ctx_map: Dict[str, dict] = {}

def build_torchrun_command(payload: dict,taskid: str) -> str:
    """
    构建 torchrun 命令：
    - ref_image 为 None 时，不传 --cond_type / --ref
    """
    p = payload["parameters"]
    try:
        nproc_per_node = max(1, int(p.get("nproc_per_node", 1)))
    except (TypeError, ValueError):
        nproc_per_node = 1
    cmd = [
        "torchrun",
        "--nproc_per_node", str(nproc_per_node),
        "--standalone",
        "scripts/diffusion/inference.py",
        p["config"],
        "--save-dir", f"outputs/{taskid}",
        "--prompt", f"\"{p['prompt']}\"",
        "--sampling_option.num_steps", str(p["steps"]),
        "--sampling_option.num_frames", str(p["frames"]),
        "--sampling_option.aspect_ratio", p["ratio"],
        "--fps_save", str(p["fps"]),
        "--motion_score", str(p["motion_score"]),
    ]
    if p.get("ref_image"):
        cmd.extend(["--cond_type", p.get("cond") or "i2v_head", "--ref", p["ref_image"]])
    return " ".join(cmd)

def select_idle_gpu() -> Tuple[Optional[str], Optional[dict]]:
    for gpu_id, info in gpu_registry.items():
        if info["status"] == "idle":
            return gpu_id, info
    return None, None

@router.websocket("/ws/gpu")
async def gpu_ws(ws: WebSocket):
    await ws.accept()

    # 注册
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
            print(msg)
            if msg_type == "heartbeat":
                gpu_registry[gpu_id]["last_heartbeat"] = time.time()
                continue

            if msg_type == "TASK_LOG":
                task_id = msg.get("task_id")
                frontend_ws = task_frontend_map.get(task_id)
                if frontend_ws:
                    await frontend_ws.send_text(json.dumps(msg))
                else:
                    print(f"⚠️ No frontend ws for TASK_LOG, task_id={task_id}")
                continue

            if msg_type == "task_finished":
                task_id = msg.get("task_id")

                # GPU 状态恢复
                if gpu_id in gpu_registry:
                    gpu_registry[gpu_id]["status"] = "idle"
                    gpu_registry[gpu_id]["current_task"] = None

                # 关联上下文补齐（关键：解决 user_id/prompt 为 null）
                ctx = task_ctx_map.pop(task_id, {}) if task_id else {}
                if ctx:
                    msg.setdefault("user_id", ctx.get("user_id"))
                    msg.setdefault("prompt", ctx.get("prompt"))

                print(f"✅ GPU {gpu_id} finished task {task_id}")
                print("📦 GPU RETURN PAYLOAD:")
                print(json.dumps(msg, ensure_ascii=False, indent=2))

                frontend_ws = task_frontend_map.pop(task_id, None)
                task_gpu_map.pop(task_id, None)

                # 透传给前端
                if frontend_ws:
                    await frontend_ws.send_text(json.dumps(msg))
                else:
                    print(f"⚠️ No frontend websocket found for task {task_id}")
                continue

            print(f"⚠️ Unknown GPU message type: {msg_type}")

    except WebSocketDisconnect:
        gpu_registry.pop(gpu_id, None)
        print(f"❌ GPU disconnected: {gpu_id}")
    except Exception as e:
        gpu_registry.pop(gpu_id, None)
        print(f"🔥 GPU error ({gpu_id}): {e}")

@router.websocket("/ws")
async def frontend_ws(ws: WebSocket):
    global frontend_ws_global
    frontend_ws_global = ws
    """
    前端 WS：要求第一条消息携带 token，用于绑定该 WS 的 user_id
    你前端已“所有接口调用都传递 token”，这里也按 token 来做。
    """
    await ws.accept()
    print("✅ Frontend connected")

    ws_user_id: Optional[str] = None

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            print("📨 Frontend WS message:", data)

            task_id = str(uuid.uuid4())
            command = build_torchrun_command(data,task_id)
            print("🧠 Torchrun command:",command)
            # 允许前端发一个 init 消息先绑定用户
            # 约定：{type:"AUTH", token:"..."} 或 {token:"..."} 都可
            if ws_user_id is None:
                token = data.get("token")
                if data.get("type") == "AUTH" and token:
                    payload = parse_jwt(token)
                    ws_user_id = payload.get("sub")
                    await ws.send_text(json.dumps({"type": "AUTH_OK", "user_id": ws_user_id}))
                    continue
                # 如果第一条就直接是 TASK_EXECUTION，也允许在里面带 token
                if data.get("type") == "TASK_EXECUTION" and data.get("token"):
                    payload = parse_jwt(data["token"])
                    ws_user_id = payload.get("sub")
                    # 不 continue，允许继续往下执行该任务
                else:
                    await ws.send_text(json.dumps({"type": "AUTH_REQUIRED", "message": "Send token first"}))
                    continue
            # =========================================================
            # AMAZON POLLUTION (真实 Rufus 调用版本)
            # =========================================================
            # 如果是 Amazon 污染任务 → 转发给 Agent
            if data.get("task") == "AMAZON_POLLUTION":
                params = data.get("parameters", {})
                
                # 如果 Agent 已连接，则转发
                if agent_ws_global:
                    await agent_ws_global.send_text(json.dumps({
                        "task": "AMAZON_POLLUTION",
                        "parameters": params
                    }))
                else:
                    await ws.send_text(json.dumps({
                        "type": "TASK_LOG",
                        "stream": "stderr",
                        "line": "本地 Agent 未连接，无法执行自动化污染任务"
                    }))
                
                continue

            if data.get("type") == "OTP_RESPONSE":
                if agent_ws_global:
                    await agent_ws_global.send_text(json.dumps(data))
                else:
                    await ws.send_text(json.dumps({
                        "type": "TASK_LOG",
                        "stream": "stderr",
                        "line": "本地 Agent 未连接，无法发送验证码"
                    }))
                continue




            if data.get("type") != "TASK_EXECUTION":
                await ws.send_text(json.dumps({"type": "IGNORED", "message": "Unsupported message type"}))
                continue

            # 调度 GPU
            gpu_id, gpu = select_idle_gpu()
            if not gpu:
                await ws.send_text(json.dumps({"type": "TASK_REJECTED", "message": "No idle GPU available"}))
                continue

            # 构建任务
            task_id = str(uuid.uuid4())
            command = build_torchrun_command(data,task_id)
            prompt = (data.get("parameters") or {}).get("prompt")

            # 保存 task 上下文（保证 GPU 回来时一定能补齐 user_id/prompt）
            task_ctx_map[task_id] = {
                "user_id": ws_user_id,
                "prompt": prompt,
                "created_at": time.time(),
            }

            gpu["status"] = "busy"
            gpu["current_task"] = task_id

            task_frontend_map[task_id] = ws
            task_gpu_map[task_id] = gpu_id

            print(f"📤 Dispatch task {task_id} to GPU {gpu_id}")
            print("🧠 Torchrun command:")
            print(command)

            # 发给 GPU：把 user_id/prompt 也带上（这会让 gpu_client 直接回传，不依赖补齐）
            await gpu["ws"].send_text(
                json.dumps(
                    {
                        "type": "exec_command",
                        "task_id": task_id,
                        "command": command,
                        "user_id": ws_user_id,
                        "prompt": prompt,
                    }
                )
            )

            # Ack 前端
            await ws.send_text(json.dumps({"type": "TASK_ACCEPTED", "task_id": task_id, "gpu_id": gpu_id}))

    except WebSocketDisconnect:
        print("❌ Frontend disconnected")
    except Exception as e:
        print("🔥 Frontend WS error:", e)

from pydantic import BaseModel
from typing import Literal, Optional, List
from fastapi import Header, HTTPException
import asyncio

from optimizedprompt import refine_prompts


class OptimizePromptReq(BaseModel):
    type: Literal["VIDEO", "IMAGE"]
    prompt: str


@router.post("/optimizePrompt")
async def optimize_prompt(
    req: OptimizePromptReq,
    authorization: Optional[str] = Header(None),
):
    raw_prompt = req.prompt.strip()
    if not raw_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    # JWT 可选
    user_id = None
    if authorization:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid auth header")
        token = authorization.replace("Bearer ", "").strip()
        payload = parse_jwt(token)
        user_id = payload.get("sub")

    loop = asyncio.get_running_loop()

    try:
        # ⚠️ 注意：refine_prompts 是阻塞函数，必须进线程池
        if req.type == "VIDEO":
            result = await loop.run_in_executor(
                None,
                lambda: refine_prompts(
                    [raw_prompt],     # ✅ 必须是 list
                    type="t2v"
                )
            )
        elif req.type == "IMAGE":
            result = await loop.run_in_executor(
                None,
                lambda: refine_prompts(
                    [raw_prompt],
                    type="t2i"
                )
            )
        else:
            raise HTTPException(status_code=400, detail="Unsupported optimize type")

        # refine_prompts 返回的是 list
        optimized_prompt = result[0] if result else raw_prompt

        return {
            "optimized_prompt": optimized_prompt
        }

    except Exception as e:
        print("🔥 optimizePrompt failed:", e)
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================
# GPU UPLOAD API (GPU -> Server -> OSS + META)
# =========================================================
@router.post("/gpu/upload")
async def gpu_upload(
    task_id: str = Form(...),
    user_id: str = Form(...),
    prompt: str = Form(""),
    file: UploadFile = File(...),
):
    """
    GPU 生成完成后调用：
    - 上传视频
    - 写 OSS
    - 写 meta
    """
    if not task_id or not user_id:
        raise HTTPException(status_code=400, detail="task_id and user_id required")

    try:
        # ===== 1. 存视频 =====
        video_key = f"videos/{task_id}.mp4"
        content = await file.read()
        bucket.put_object(video_key, content)
        public_url = _oss_public_url(video_key)

        # ===== 2. 写 meta =====
        meta_key = f"users/{user_id}/meta/{task_id}.json"
        bucket.put_object(
            meta_key,
            json.dumps(
                {
                    "id": task_id,
                    "user_id": user_id,
                    "prompt": prompt,
                    "video_url": public_url,
                    "created_at": time.time(),
                },
                ensure_ascii=False,
            ),
        )

        return {
            "status": "success",
            "task_id": task_id,
            "public_url": public_url,
        }

    except Exception as e:
        print("🔥 gpu_upload failed:", e)
        raise HTTPException(status_code=500, detail=str(e))

class AmazonPollutionEffectReq(BaseModel):
    url: Optional[str] = None
    keywords: Optional[List[str]] = None
    run_id: Optional[str] = None


@router.post("/amazon/pollution/effect")
async def amazon_pollution_effect(req: AmazonPollutionEffectReq):
    runs_dir = "rufus_runs"
    if req.run_id:
        safe_name = os.path.basename(req.run_id)
        RAW_FILE = os.path.join(runs_dir, safe_name)
    else:
        RAW_FILE = "rufus_raw.csv"

    if not os.path.exists(RAW_FILE):
        return {"error": "No pollution task executed yet"}

    rows = []
    with open(RAW_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            answer = row.get("answer") or row.get("response") or ""
            rows.append(answer.lower())

    # 动态从 CSV 自动发现关键词（出现次数前10）
    from collections import Counter
    words = []

    for ans in rows:
        for w in ans.replace(",", " ").split():
            if len(w) > 3:
                words.append(w)

    freq = Counter(words).most_common(20)

    keyword_stats = []
    if req.keywords:
        for k in req.keywords:
            k_lower = k.lower()
            hit = sum(1 for ans in rows if k_lower in ans)
            keyword_stats.append({"keyword": k, "hit": hit, "ratio": round(hit / max(len(rows), 1), 4)})

    return {
        "total": len(rows),
        "top_keywords": freq,
        "keyword_stats": keyword_stats,
        "run_id": os.path.basename(RAW_FILE),
    }


@router.get("/amazon/pollution/runs")
async def amazon_pollution_runs():
    runs_dir = "rufus_runs"
    if not os.path.isdir(runs_dir):
        return {"runs": []}
    files = []
    for name in os.listdir(runs_dir):
        if not name.endswith(".csv"):
            continue
        files.append(name)
    files.sort(reverse=True)
    return {"runs": files}

@router.websocket("/ws/agent")
async def agent_ws(ws: WebSocket):
    global agent_ws_global
    agent_ws_global = ws

    await ws.accept()
    print("Agent connected.")

    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)

            # 心跳
            if data.get("type") == "HEARTBEAT":
                continue

            # Agent 发送的日志转发给前端
            if data.get("type") == "AGENT_LOG":
                line = data.get("line", "")
                if frontend_ws_global:
                    await frontend_ws_global.send_text(json.dumps({
                        "type": "TASK_LOG",
                        "stream": "stdout",
                        "line": line
                    }))
                continue

            if data.get("type") == "TASK_LOG":
                if frontend_ws_global:
                    await frontend_ws_global.send_text(json.dumps(data))
                continue

            if data.get("type") == "OTP_REQUIRED":
                if frontend_ws_global:
                    await frontend_ws_global.send_text(json.dumps(data))
                continue

    except Exception as e:
        print("Agent WS error:", e)
