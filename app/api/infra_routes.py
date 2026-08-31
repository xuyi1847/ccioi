# infra_routes.py
import json
import hashlib
import time
import uuid
from typing import Dict, Optional, Tuple, Any, List
from io import BytesIO
from pathlib import Path
from html.parser import HTMLParser
import ipaddress
import socket
import shlex
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

import json
import time
import random
import csv
import asyncio
import re
import traceback
import math
from playwright.sync_api import sync_playwright
from concurrent.futures import ThreadPoolExecutor
import os
import secrets
import tempfile
import jwt
import oss2
import pandas as pd

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
from app.database import (
    add_balance,
    bind_video_task,
    complete_bound_drama_shot,
    create_user,
    get_user_by_email,
    get_user_by_id,
    get_user_config,
    get_system_setting,
    list_operation_logs,
    list_users,
    list_drama_projects,
    log_operation,
    public_user,
    reconcile_drama_projects,
    list_geo_reports,
    save_geo_report,
    save_user_config,
    set_user_enabled,
    set_user_module_permissions,
    set_system_setting,
    save_drama_project,
    delete_drama_project,
    delete_generation_record,
    get_generation_record,
    list_generation_records,
    save_generation_record,
    create_video_api_task,
    get_video_api_task,
    list_queued_video_api_tasks,
    update_video_api_task,
    authenticate_video_api_key,
    create_video_api_key,
    list_video_api_keys,
    list_video_api_tasks,
    set_video_api_key_enabled,
    verify_password,
)
from app.tos_storage import (
    configured as tos_configured,
    delete_object as tos_delete_object,
    download_file as tos_download_file,
    upload_file as tos_upload_file,
    upload_stream as tos_upload_stream,
)
from app.local_storage import (
    STORAGE_ROOT,
    cleanup_storage,
    delete_history,
    public_url as local_public_url,
    read_user_history,
    read_all_history,
    safe_id,
    save_upload,
    write_json,
)

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
PUBLIC_ORIGIN = os.getenv("PUBLIC_ORIGIN", "https://www.ccioi.com").rstrip("/")
PUBLIC_MODEL_MAP = {"ccioi-cinema": "wan-2.2", "ccioi-speed": "ltx-2.3", "ccioi-standard": "opensora"}
INTERNAL_MODEL_MAP = {value: key for key, value in PUBLIC_MODEL_MAP.items()}

def _internal_model(value: str) -> str:
    return PUBLIC_MODEL_MAP.get(str(value).lower(), str(value).lower())

def _public_model(value: str) -> str:
    return INTERNAL_MODEL_MAP.get(str(value).lower(), "ccioi-standard")

def _public_gpu_id(gpu_id: Optional[str]) -> Optional[str]:
    return "node-" + hashlib.sha256(gpu_id.encode("utf-8")).hexdigest()[:8] if gpu_id else None

def _public_payload(value: Any) -> Any:
    """Remove private engine identities from values returned to browsers and API clients."""
    if isinstance(value, dict):
        return {key: _public_payload(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_public_payload(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_public_payload(item) for item in value)
    if isinstance(value, str):
        replacements = (
            (r"wan(?:-|\s)?2\.2(?:-(?:t2v|i2v))?", "ccioi-cinema"),
            (r"ltx(?:-|\s)?2\.3", "ccioi-speed"),
            (r"open(?:-|\s)?sora", "ccioi-standard"),
        )
        for pattern, replacement in replacements:
            value = re.sub(pattern, replacement, value, flags=re.IGNORECASE)
        return value
    return value

def create_jwt(user: dict) -> str:
    payload = {
        "sub": str(user["id"]),
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
    auth = parse_jwt(token)
    user = get_user_by_id(auth.get("sub", ""))
    if not user or not user.get("enabled", True):
        raise HTTPException(status_code=403, detail="Account is disabled")
    return auth


def require_super_admin(auth: dict = Depends(get_user_from_auth)) -> dict:
    user = get_user_by_id(auth.get("sub", ""))
    if not user or user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super administrator access required")
    return user

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

bucket = None
if not OSS_ACCESS_KEY_ID or not OSS_ACCESS_KEY_SECRET:
    # 启动时就给出明确错误，避免运行时才发现
    print("⚠️ OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET is missing in environment variables.")
else:
    try:
        auth = oss2.Auth(OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
        bucket = oss2.Bucket(auth, f"https://{OSS_ENDPOINT}", OSS_BUCKET)
    except Exception as e:
        print(f"⚠️ Failed to initialize OSS client: {e}")
        bucket = None

def _oss_public_url(object_key: str) -> str:
    return f"https://{OSS_BUCKET}.{OSS_ENDPOINT}/{object_key}"

def _require_oss_bucket():
    if bucket is None:
        raise HTTPException(
            status_code=503,
            detail="OSS is not configured. Please set OSS_ACCESS_KEY_ID and OSS_ACCESS_KEY_SECRET.",
        )
    return bucket

# =========================================================
# Pydantic Models
# =========================================================
class RegisterReq(BaseModel):
    email: EmailStr
    name: str
    invite_code: str
    password: str

class LoginReq(BaseModel):
    email: EmailStr
    password: str


class UserStatusReq(BaseModel):
    enabled: bool


class UserPermissionsReq(BaseModel):
    permissions: dict[str, bool]


class ShowcaseReq(BaseModel):
    featured: bool


class DramaProjectReq(BaseModel):
    id: Optional[str] = None
    name: str
    data: dict[str, Any]


class DramaStoryboardReq(BaseModel):
    script: str
    characters: list[dict[str, Any]] = []
    style: str = "电影感"
    aspect_ratio: str = "9:16"


class DramaExportReq(BaseModel):
    project_id: str
    shot_urls: list[str]


class DramaEndingFrameReq(BaseModel):
    video_url: str


class UserConfigReq(BaseModel):
    data: dict[str, Any]
    partial: bool = False


class GeoAnalyzeReq(BaseModel):
    url: str
    brand: str
    keywords: List[str] = []
    audience: Optional[str] = None
    language: str = "zh-CN"


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
    name = req.name.strip()
    invite_code = req.invite_code.strip()
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if get_user_by_email(email):
        raise HTTPException(status_code=400, detail="Email already registered")
    try:
        user = create_user(str(uuid.uuid4()), email, name, req.password, invite_code)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid invite code")
    except Exception as exc:
        if "users_email_key" in str(exc).lower():
            raise HTTPException(status_code=400, detail="Email already registered")
        raise

    token = create_jwt(user)
    return {"user": public_user(user), "token": token}

@router.post("/login")
async def login(req: LoginReq):
    email = req.email.lower().strip()
    user = get_user_by_email(email)
    if not user or not verify_password(req.password, user["password_hash"], user["password_salt"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    if not user.get("enabled", True):
        raise HTTPException(status_code=403, detail="Account is disabled")
    token = create_jwt(user)
    return {"user": public_user(user), "token": token}


@router.get("/me")
async def me(auth: dict = Depends(get_user_from_auth)):
    user = get_user_by_id(auth["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return {"user": public_user(user)}


@router.post("/recharge")
async def recharge(amount: float, auth: dict = Depends(get_user_from_auth)):
    if amount <= 0 or amount > 100000:
        raise HTTPException(status_code=400, detail="Invalid recharge amount")
    balance = add_balance(auth["sub"], amount)
    if balance is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"new_balance": balance}


@router.get("/user-config")
async def read_user_config(auth: dict = Depends(get_user_from_auth)):
    config = get_user_config(auth["sub"])
    return config or {"data": {}, "updated_at": None}


@router.put("/user-config")
async def write_user_config(req: UserConfigReq, auth: dict = Depends(get_user_from_auth)):
    return save_user_config(auth["sub"], req.data, req.partial)


@router.get("/drama/projects")
async def drama_projects(auth: dict = Depends(get_user_from_auth)):
    reconcile_drama_projects(auth["sub"])
    return _public_payload(list_drama_projects(auth["sub"]))


@router.put("/drama/projects")
async def upsert_drama_project(req: DramaProjectReq, auth: dict = Depends(get_user_from_auth)):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")
    project_id = req.id or str(uuid.uuid4())
    try:
        return _public_payload(save_drama_project(project_id, auth["sub"], name, req.data))
    except ValueError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.delete("/drama/projects/{project_id}")
async def remove_drama_project(project_id: str, auth: dict = Depends(get_user_from_auth)):
    if not delete_drama_project(project_id, auth["sub"]):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted"}


@router.post("/drama/storyboard")
async def generate_drama_storyboard(req: DramaStoryboardReq, auth: dict = Depends(get_user_from_auth)):
    if not req.script.strip():
        raise HTTPException(status_code=400, detail="Script is required")
    api_key = os.getenv("CCIOI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI storyboard service is not configured")
    client = OpenAI(api_key=api_key, base_url=os.getenv("CCIOI_BASE_URL", "https://api.deepseek.com"))
    character_context = json.dumps(req.characters, ensure_ascii=False)
    instruction = f"""你是AI短剧分镜导演。把剧本拆成适合视频生成的连续镜头。
风格：{req.style}；画幅：{req.aspect_ratio}；角色资料：{character_context}
只返回JSON对象，格式为 {{"shots": [...]}}。每个镜头必须包含：title、scene、shot_size、camera、duration（2到10秒）、prompt、dialogue、character_ids。
prompt必须描述角色外观、动作、场景、光线、镜头运动，并保持前后连续。
剧本：\n{req.script}"""
    try:
        response = client.chat.completions.create(
            model=os.getenv("CCIOI_CHAT_MODEL", "deepseek-chat"),
            messages=[{"role": "user", "content": instruction}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "[]"
        parsed = json.loads(content)
        shots = parsed if isinstance(parsed, list) else parsed.get("shots", [])
        return {"shots": shots}
    except Exception as exc:
        print("drama storyboard failed:", exc)
        raise HTTPException(status_code=502, detail=f"Storyboard generation failed: {exc}")


@router.post("/drama/export")
async def export_drama(req: DramaExportReq, auth: dict = Depends(get_user_from_auth)):
    owned_ids = {item["id"] for item in list_drama_projects(auth["sub"])}
    if req.project_id not in owned_ids:
        raise HTTPException(status_code=404, detail="Project not found")
    if not req.shot_urls:
        raise HTTPException(status_code=400, detail="No completed shots to export")
    if not tos_configured():
        raise HTTPException(status_code=503, detail="TOS is not configured")
    export_id = str(uuid.uuid4())
    with tempfile.TemporaryDirectory(prefix="ccioi-drama-") as temp_name:
        temp_dir = Path(temp_name)
        source_files = []
        for index, url in enumerate(req.shot_urls):
            filename = os.path.basename(urlparse(url).path)
            task_id = filename[:-4] if filename.endswith(".mp4") else ""
            record = get_generation_record(task_id, auth["sub"]) if task_id else None
            if not record or not record.get("object_key"):
                raise HTTPException(status_code=404, detail=f"Shot video is unavailable: {filename}")
            path = temp_dir / f"shot-{index:04d}.mp4"
            await asyncio.to_thread(tos_download_file, record["object_key"], path)
            source_files.append(path)
        concat_file = temp_dir / "concat.txt"
        output_file = temp_dir / f"{export_id}.mp4"
        concat_file.write_text("".join(f"file '{path}'\n" for path in source_files), encoding="utf-8")
        process = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", str(output_file),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        if process.returncode != 0:
            raise HTTPException(status_code=500, detail=f"FFmpeg export failed: {stderr.decode(errors='ignore')[-500:]}")
        object_key = f"drama/{auth['sub']}/{export_id}.mp4"
        result_url = await asyncio.to_thread(tos_upload_file, object_key, output_file, "video/mp4")
        return {"id": export_id, "public_url": result_url}


@router.post("/drama/ending-frame")
async def drama_ending_frame(req: DramaEndingFrameReq, auth: dict = Depends(get_user_from_auth)):
    filename = os.path.basename(urlparse(req.video_url).path)
    task_id = filename[:-4] if filename.endswith(".mp4") else ""
    if not task_id or safe_id(task_id, "task_id") != task_id:
        raise HTTPException(status_code=400, detail="Invalid shot video URL")
    record = get_generation_record(task_id, auth["sub"])
    if not record or not record.get("object_key"):
        raise HTTPException(status_code=404, detail="Shot video not found")
    with tempfile.TemporaryDirectory(prefix="ccioi-frame-") as temp_name:
        source = Path(temp_name) / filename
        destination = Path(temp_name) / f"{task_id}.jpg"
        await asyncio.to_thread(tos_download_file, record["object_key"], source)
        process = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-sseof", "-0.08", "-i", str(source), "-frames:v", "1",
            "-q:v", "2", str(destination), stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        if process.returncode != 0 or not destination.is_file():
            raise HTTPException(status_code=500, detail=f"Ending frame extraction failed: {stderr.decode(errors='ignore')[-300:]}")
        frame_key = f"frames/{auth['sub']}/{task_id}-ending.jpg"
        frame_url = await asyncio.to_thread(tos_upload_file, frame_key, destination, "image/jpeg")
        return {"public_url": frame_url}


@router.post("/chat")
async def ccioi_chat(req: DeepSeekChatReq):
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
                print(f"🔥 /chat stream failed: {exc}")
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

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=False,
        )
        return {"content": response.choices[0].message.content}
    except Exception as exc:
        print(f"🔥 /chat failed: {exc}")
        print(traceback.format_exc())
        raise HTTPException(status_code=502, detail=f"Upstream chat provider error: {exc}")


@router.post("/infra/chat")
async def ccioi_chat_compat(req: DeepSeekChatReq):
    return await ccioi_chat(req)


class _GeoHtmlParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.meta = {}
        self.headings = []
        self.json_ld_count = 0
        self.text = []
        self._tag = ""
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        self._tag = tag
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
        attributes = dict(attrs)
        if tag == "meta":
            name = (attributes.get("name") or attributes.get("property") or "").lower()
            if name and attributes.get("content"):
                self.meta[name] = attributes["content"].strip()
        if tag == "script" and attributes.get("type", "").lower() == "application/ld+json":
            self.json_ld_count += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        self._tag = ""

    def handle_data(self, data):
        value = " ".join(data.split())
        if not value:
            return
        if self._tag == "title":
            self.title += value
        if self._tag in {"h1", "h2", "h3"}:
            self.headings.append(value)
        if not self._skip_depth:
            self.text.append(value)


def _validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only public HTTP/HTTPS URLs are supported")
    for info in socket.getaddrinfo(parsed.hostname, parsed.port or 443):
        address = ipaddress.ip_address(info[4][0])
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
        ):
            raise ValueError("Private network URLs are not allowed")


class _SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urljoin(req.full_url, newurl)
        _validate_public_url(target)
        return super().redirect_request(req, fp, code, msg, headers, target)


def _fetch_geo_page(url: str) -> dict:
    _validate_public_url(url)
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; CCIOI-GEO-Audit/1.0; "
                "+https://www.ccioi.com)"
            ),
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    opener = build_opener(_SafeRedirectHandler())
    with opener.open(request, timeout=15) as response:
        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            raise ValueError("Target URL is not an HTML page")
        raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("Target page exceeds the 2MB analysis limit")
        charset = response.headers.get_content_charset() or "utf-8"
        html = raw.decode(charset, errors="replace")
        final_url = response.geturl()

    parser = _GeoHtmlParser()
    parser.feed(html)
    visible_text = " ".join(parser.text)
    return {
        "final_url": final_url,
        "title": parser.title.strip(),
        "description": parser.meta.get("description", ""),
        "canonical": parser.meta.get("og:url", ""),
        "headings": parser.headings[:40],
        "json_ld_count": parser.json_ld_count,
        "word_count": len(visible_text.split()),
        "content": visible_text[:24000],
    }


def _parse_json_response(content: str) -> dict:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("Model returned an invalid GEO report")
    return parsed


@router.post("/geo/analyze")
async def geo_analyze(req: GeoAnalyzeReq, auth: dict = Depends(get_user_from_auth)):
    if not req.brand.strip():
        raise HTTPException(status_code=400, detail="Brand or entity name is required")
    try:
        page = await asyncio.to_thread(_fetch_geo_page, req.url.strip())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to fetch target page: {exc}")

    api_key = os.getenv("CCIOI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEO analysis model is not configured")

    prompt = {
        "task": (
            "Audit this page for Generative Engine Optimization (GEO). Evaluate whether "
            "AI answer engines can understand, trust, quote and recommend the entity. "
            "Return actionable findings grounded only in the supplied page."
        ),
        "brand": req.brand.strip(),
        "keywords": [value.strip() for value in req.keywords if value.strip()][:20],
        "audience": (req.audience or "").strip(),
        "output_language": req.language,
        "page": page,
        "required_json_schema": {
            "overall_score": "integer 0-100",
            "summary": "string",
            "scores": {
                "entity_clarity": "integer 0-100",
                "answerability": "integer 0-100",
                "evidence": "integer 0-100",
                "structure": "integer 0-100",
                "trust": "integer 0-100",
            },
            "strengths": ["string"],
            "issues": [
                {
                    "priority": "high|medium|low",
                    "title": "string",
                    "reason": "string",
                    "fix": "string",
                }
            ],
            "recommended_faqs": [
                {"question": "string", "answer_outline": "string"}
            ],
            "content_brief": {
                "suggested_title": "string",
                "suggested_description": "string",
                "sections": ["string"],
                "schema_types": ["string"],
            },
            "citation_ready_passage": "string, 80-160 words",
        },
    }

    try:
        client = OpenAI(
            api_key=api_key,
            base_url=os.getenv("CCIOI_BASE_URL", "https://api.deepseek.com"),
        )
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=os.getenv("GEO_MODEL", "deepseek-chat"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a rigorous GEO auditor. Return JSON only, without markdown. "
                        "Never invent citations, statistics, certifications or page content."
                    ),
                },
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        report = _parse_json_response(response.choices[0].message.content or "")
        report["page"] = {key: value for key, value in page.items() if key != "content"}
        report_id = str(uuid.uuid4())
        save_geo_report(
            report_id,
            auth["sub"],
            page["final_url"],
            req.brand.strip(),
            req.model_dump(),
            report,
        )
        report["report_id"] = report_id
        return report
    except Exception as exc:
        print(f"🔥 /geo/analyze failed: {exc}")
        print(traceback.format_exc())
        raise HTTPException(status_code=502, detail="GEO analysis failed")


@router.get("/geo/reports")
async def geo_report_history(auth: dict = Depends(get_user_from_auth), limit: int = 20):
    return {"reports": list_geo_reports(auth["sub"], limit)}

# =========================================================
# UPLOAD API (Frontend -> local disk)
# =========================================================
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_user_from_auth),
):
    """
    上传参考文件到服务器本机存储。
    """
    try:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(status_code=400, detail="Unsupported image type")
        object_key = f"uploads/{uuid.uuid4().hex}{ext}"
        await save_upload(file, object_key, 50 * 1024**2)
        cleanup_storage()
        return {
            "status": "success",
            "object_key": object_key,
            "public_url": local_public_url(object_key),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _normalize_excel_header(value: Any) -> str:
    return (
        str(value or "")
        .strip()
        .lower()
        .replace(" ", "")
        .replace("\r", "")
        .replace("\n", "")
        .replace("\t", "")
        .replace("（", "")
        .replace("）", "")
        .replace("(", "")
        .replace(")", "")
        .replace("-", "")
        .replace("_", "")
        .replace("/", "")
    )


def _parse_excel_money(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    raw = str(value).strip()
    if not raw:
        return None
    negative_by_paren = raw.startswith("(") and raw.endswith(")")
    cleaned = (
        raw.replace("￥", "")
        .replace("¥", "")
        .replace(",", "")
        .replace(" ", "")
        .replace("(", "")
        .replace(")", "")
    )
    try:
        num = float(cleaned)
    except Exception:
        return None
    return -num if negative_by_paren else num


def _get_row_value_by_aliases(row: dict, aliases: list[str]) -> Any:
    alias_set = {_normalize_excel_header(alias) for alias in aliases}
    for key, value in row.items():
        normalized_key = _normalize_excel_header(key)
        if normalized_key in alias_set:
            return value
        if any(alias and (alias in normalized_key or normalized_key in alias) for alias in alias_set):
            return value
    return ""


def _build_excel_preview_text(df: pd.DataFrame, max_rows: int = 80) -> str:
    safe_df = df.where(pd.notna(df), "")
    columns = [str(col or "").strip() for col in safe_df.columns.tolist()]
    lines = []
    if any(columns):
        lines.append("\t".join(columns))
    for row in safe_df.head(max_rows).itertuples(index=False, name=None):
        values = [str(v or "").strip() for v in row]
        if any(values):
            lines.append("\t".join(values))
    return "\n".join(lines)


def _decode_text_bytes(content: bytes) -> str:
    encodings = ["utf-8", "utf-8-sig", "gb18030", "gbk", "latin1"]
    for enc in encodings:
        try:
            return content.decode(enc)
        except Exception:
            continue
    return ""


@router.post("/holdings/parse-file")
@router.post("/excel/holdings/parse")
async def parse_holdings_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    try:
        content = await file.read()
        preview_text = ""
        rows = []
        first_sheet_name = filename or "持仓文件"

        if ext in {".xlsx", ".xls"}:
            workbook = pd.read_excel(BytesIO(content), sheet_name=None, dtype=object)
            if not workbook:
                raise HTTPException(status_code=400, detail="文件没有可读取的工作表")
            first_sheet_name = next(iter(workbook.keys()))
            df = workbook[first_sheet_name]
            if df is None or df.empty:
                raise HTTPException(status_code=400, detail="文件没有可导入的数据")
            df = df.where(pd.notna(df), "")
            rows = df.to_dict(orient="records")
            preview_text = _build_excel_preview_text(df)
        elif ext == ".csv":
            df = pd.read_csv(BytesIO(content), dtype=object).fillna("")
            rows = df.to_dict(orient="records")
            preview_text = _build_excel_preview_text(df)
        elif ext == ".json":
            obj = json.loads(_decode_text_bytes(content) or "{}")
            if isinstance(obj, list):
                rows = obj
                df = pd.DataFrame(obj).fillna("")
                preview_text = _build_excel_preview_text(df)
            elif isinstance(obj, dict):
                rows = obj.get("rows") if isinstance(obj.get("rows"), list) else [obj]
                df = pd.DataFrame(rows).fillna("")
                preview_text = _build_excel_preview_text(df)
        else:
            preview_text = _decode_text_bytes(content)
            if preview_text:
                lines = [line.strip() for line in preview_text.splitlines() if line.strip()]
                rows = [{"raw": line} for line in lines[:200]]

        parsed_rows = []
        for row in rows:
            fund_code = _get_row_value_by_aliases(row, ["基金代码", "代码", "基金编号", "基金代号", "产品代码"])
            fund_name = _get_row_value_by_aliases(row, ["基金名称", "名称", "基金简称", "产品名称"])
            hold_amount = _get_row_value_by_aliases(row, ["持有金额", "持仓金额", "持仓市值", "持有市值", "参考市值", "市值", "金额", "金额元"])
            hold_gains = _get_row_value_by_aliases(row, ["持有收益", "持仓收益", "累计收益", "浮动盈亏", "持有盈亏", "收益", "持仓收益元"])

            item = {
                "fundCode": str(fund_code or "").strip(),
                "fundName": str(fund_name or "").strip(),
                "holdAmount": _parse_excel_money(hold_amount),
                "holdGains": _parse_excel_money(hold_gains),
            }
            if (item["fundCode"] or item["fundName"]) and item["holdAmount"] is not None and item["holdAmount"] > 0:
                parsed_rows.append(item)

        return {
            "sheetName": first_sheet_name,
            "rows": parsed_rows,
            "previewText": preview_text,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print("excel holdings parse failed:", exc)
        print(traceback.format_exc())
        raise HTTPException(status_code=400, detail="持仓文件解析失败，请检查文件内容")

# =========================================================
# HISTORY APIs (JWT -> user_id -> local metadata)
# =========================================================
@router.get("/history")
async def get_history(user: dict = Depends(get_user_from_auth)):
    """
    获取用户生成历史。
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing sub")

    try:
        return _public_payload(list_generation_records(user_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/history")
async def admin_history(admin: dict = Depends(require_super_admin)):
    users = {item["id"]: item for item in list_users()}
    return _public_payload([
        {**item, "user_email": users.get(item.get("user_id"), {}).get("email"),
         "user_name": users.get(item.get("user_id"), {}).get("name")}
        for item in list_generation_records()
    ])


@router.get("/showcase")
async def homepage_showcase():
    selected_ids = get_system_setting("homepage_showcase", []) or []
    records = {str(item.get("id")): item for item in list_generation_records() if item.get("id")}
    return _public_payload([records[task_id] for task_id in selected_ids if task_id in records])


@router.put("/admin/showcase/{task_id}")
async def update_homepage_showcase(task_id: str, req: ShowcaseReq, admin: dict = Depends(require_super_admin)):
    available = {str(item.get("id")) for item in list_generation_records() if item.get("id")}
    if task_id not in available:
        raise HTTPException(status_code=404, detail="Generation record not found")
    selected_ids = [str(item) for item in (get_system_setting("homepage_showcase", []) or [])]
    if req.featured and task_id not in selected_ids:
        if len(selected_ids) >= 8:
            raise HTTPException(status_code=400, detail="Homepage supports up to 8 videos")
        selected_ids.append(task_id)
    if not req.featured:
        selected_ids = [item for item in selected_ids if item != task_id]
    set_system_setting("homepage_showcase", selected_ids)
    return {"task_ids": selected_ids}


@router.get("/admin/operations")
async def admin_operations(limit: int = 500, admin: dict = Depends(require_super_admin)):
    return list_operation_logs(limit)


@router.get("/admin/users")
async def admin_users(admin: dict = Depends(require_super_admin)):
    history_counts: dict[str, int] = {}
    for item in list_generation_records():
        owner_id = item.get("user_id")
        if owner_id:
            history_counts[owner_id] = history_counts.get(owner_id, 0) + 1
    return [{**item, "generation_count": history_counts.get(item["id"], 0)} for item in list_users()]


@router.patch("/admin/users/{user_id}/status")
async def admin_user_status(user_id: str, req: UserStatusReq, admin: dict = Depends(require_super_admin)):
    target = get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Super administrator cannot be disabled")
    updated = set_user_enabled(user_id, req.enabled)
    if not updated:
        raise HTTPException(status_code=400, detail="Unable to update user")
    return public_user(updated)


@router.get("/admin/users/{user_id}/operations")
async def admin_user_operations(user_id: str, limit: int = 500, admin: dict = Depends(require_super_admin)):
    if not get_user_by_id(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return list_operation_logs(limit, user_id)


@router.patch("/admin/users/{user_id}/permissions")
async def admin_user_permissions(user_id: str, req: UserPermissionsReq, admin: dict = Depends(require_super_admin)):
    target = get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Super administrator permissions cannot be restricted")
    updated = set_user_module_permissions(user_id, req.permissions)
    if not updated:
        raise HTTPException(status_code=400, detail="Unable to update permissions")
    return public_user(updated)

@router.delete("/history/{task_id}")
async def delete_history_item(task_id: str, user: dict = Depends(get_user_from_auth)):
    """
    删除历史记录及对应视频。
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload: missing sub")

    try:
        record = delete_generation_record(task_id, user_id)
        if record and record.get("object_key"):
            await asyncio.to_thread(tos_delete_object, record["object_key"])
        delete_history(user_id, task_id)
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

api_dispatcher_task: Optional[asyncio.Task] = None


def _external_api_user(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
) -> dict:
    raw_key = x_api_key or (authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else None)
    if not raw_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    user = authenticate_video_api_key(hashlib.sha256(raw_key.encode("utf-8")).hexdigest())
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or disabled API key")
    return user

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
        "--prompt", str(p["prompt"]),
        "--sampling_option.num_steps", str(p["steps"]),
        "--sampling_option.num_frames", str(p["frames"]),
        "--sampling_option.aspect_ratio", p["ratio"],
        "--sampling_option.seed", str(p.get("seed", 42)),
        "--fps_save", str(p["fps"]),
        "--motion_score", str(p["motion_score"]),
    ]
    if p.get("ref_image"):
        cmd.extend(["--cond_type", p.get("cond") or "i2v_head", "--ref", p["ref_image"]])
    return shlex.join(cmd)

GPU_HEARTBEAT_TIMEOUT = 20


def _gpu_is_online(info: dict) -> bool:
    return time.time() - info.get("last_heartbeat", 0) <= GPU_HEARTBEAT_TIMEOUT


def _gpu_supported_models(info: dict) -> list[str]:
    models = info.get("supported_models")
    if isinstance(models, list) and models:
        return [str(model).lower() for model in models]
    model = info.get("model")
    if model:
        return [str(model).lower()]
    # 未声明能力的老客户端均视为 OpenSora。
    return ["opensora"]


def _gpu_supports_model(info: dict, model: str) -> bool:
    requested = model.lower()
    supported = _gpu_supported_models(info)
    if requested == "wan-2.2":
        return any(item == requested or item.startswith("wan-2.2-") for item in supported)
    return requested in supported


def select_idle_gpu(
    preferred_gpu_id: Optional[str] = None,
    model: str = "opensora",
) -> Tuple[Optional[str], Optional[dict]]:
    if preferred_gpu_id:
        preferred_gpu_id = next((real_id for real_id in gpu_registry if _public_gpu_id(real_id) == preferred_gpu_id), preferred_gpu_id)
        info = gpu_registry.get(preferred_gpu_id)
        if (
            info
            and info["status"] == "idle"
            and _gpu_is_online(info)
            and _gpu_supports_model(info, model)
        ):
            return preferred_gpu_id, info
        return None, None
    for gpu_id, info in gpu_registry.items():
        if (
            info["status"] == "idle"
            and _gpu_is_online(info)
            and _gpu_supports_model(info, model)
        ):
            return gpu_id, info
    return None, None


class ExternalVideoGenerationReq(BaseModel):
    model: str = "ccioi-cinema"
    generation_type: str = "text_to_video"
    prompt: str
    image_url: Optional[str] = None
    width: int = 1280
    height: int = 720
    num_frames: int = 81
    fps: int = 16
    seed: int = 42
    callback_url: Optional[str] = None


class ApiKeyCreateReq(BaseModel):
    name: str
    user_id: Optional[str] = None


class ApiKeyStatusReq(BaseModel):
    enabled: bool


def _public_api_task(task: dict) -> dict:
    def iso(value):
        return value.isoformat() if value else None
    return {
        "task_id": str(task["id"]), "status": task["status"],
        "progress": task.get("progress", 0), "model": _public_model(task["model"]),
        "node_id": _public_gpu_id(task.get("gpu_id")), "video_url": task.get("video_url"),
        "thumbnail_url": task.get("thumbnail_url"), "error": _public_payload(task.get("error")),
        "created_at": iso(task.get("created_at")), "started_at": iso(task.get("started_at")),
        "completed_at": iso(task.get("completed_at")),
    }


async def _send_api_callback(task: dict) -> None:
    callback_url = str(task.get("callback_url") or "").strip()
    if not callback_url:
        return
    try:
        request = Request(
            callback_url, data=json.dumps(_public_api_task(task)).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "CCIOI-Video-Webhook/1.0"},
            method="POST",
        )
        await asyncio.to_thread(lambda: build_opener().open(request, timeout=10).read())
        update_video_api_task(str(task["id"]), task["status"], callback_status="delivered")
    except Exception as exc:
        update_video_api_task(str(task["id"]), task["status"], callback_status=f"failed: {str(exc)[:300]}")


async def dispatch_queued_api_tasks() -> None:
    while True:
        try:
            for task in list_queued_video_api_tasks():
                model = str(task["model"]).lower()
                gpu_id, gpu = select_idle_gpu(model=model)
                if not gpu:
                    continue
                payload = task.get("request") or {}
                task_id = str(task["id"])
                worker_payload = {
                    "type": "exec_command", "task_id": task_id,
                    "user_id": str(task["user_id"]), "model": model,
                    "prompt": payload["prompt"], "width": payload["width"],
                    "height": payload["height"], "num_frames": payload["num_frames"],
                    "fps": payload["fps"], "seed": payload["seed"],
                    "generation_type": payload.get("generation_type", "text_to_video"),
                }
                if payload.get("image_url"):
                    worker_payload["image_url"] = payload["image_url"]
                gpu["status"] = "busy"
                gpu["current_task"] = task_id
                task_gpu_map[task_id] = gpu_id
                task_ctx_map[task_id] = {
                    "user_id": str(task["user_id"]), "prompt": payload["prompt"],
                    "source": "external_api", "created_at": time.time(),
                }
                update_video_api_task(task_id, "processing", gpu_id=gpu_id, progress=1)
                try:
                    await gpu["ws"].send_text(json.dumps(worker_payload))
                except Exception as exc:
                    gpu["status"] = "idle"
                    gpu["current_task"] = None
                    task_gpu_map.pop(task_id, None)
                    task_ctx_map.pop(task_id, None)
                    update_video_api_task(task_id, "queued", gpu_id=None, error=str(exc)[:500])
        except Exception as exc:
            print("external video dispatcher error:", exc)
        await asyncio.sleep(2)


@router.post("/v1/videos/generations", status_code=202, tags=["External Video API"])
async def create_external_video_generation(req: ExternalVideoGenerationReq, user: dict = Depends(_external_api_user)):
    public_model = req.model.lower().strip()
    if public_model not in PUBLIC_MODEL_MAP:
        raise HTTPException(status_code=422, detail="model must be ccioi-cinema, ccioi-speed, or ccioi-standard")
    model = _internal_model(public_model)
    if not req.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt is required")
    if req.generation_type not in {"text_to_video", "image_to_video"}:
        raise HTTPException(status_code=422, detail="generation_type must be text_to_video or image_to_video")
    if req.generation_type == "image_to_video" and not req.image_url:
        raise HTTPException(status_code=422, detail="image_url is required for image_to_video")
    for url, name in ((req.image_url, "image_url"), (req.callback_url, "callback_url")):
        if url and not str(url).startswith("https://"):
            raise HTTPException(status_code=422, detail=f"{name} must use https")
        if url:
            try:
                _validate_public_url(str(url))
            except Exception:
                raise HTTPException(status_code=422, detail=f"{name} must resolve to a public address")
    if req.width < 64 or req.height < 64 or req.num_frames < 1 or req.fps < 1:
        raise HTTPException(status_code=422, detail="invalid video dimensions, frames, or fps")
    if model == "ltx-2.3" and (req.num_frames > 481 or req.width % 64 or req.height % 64):
        raise HTTPException(status_code=422, detail="CCIOI Speed requires <=481 frames and dimensions divisible by 64")
    if model == "wan-2.2" and (req.num_frames - 1) % 4:
        raise HTTPException(status_code=422, detail="CCIOI Cinema num_frames must follow 4n+1")
    task_id = str(uuid.uuid4())
    payload = req.model_dump(exclude={"callback_url"})
    payload["model"] = model
    task = create_video_api_task(task_id, str(user["id"]), model, payload, req.callback_url)
    return _public_api_task(task)


@router.get("/v1/videos/generations/{task_id}", tags=["External Video API"])
async def get_external_video_generation(task_id: str, user: dict = Depends(_external_api_user)):
    task = get_video_api_task(task_id, str(user["id"]))
    if not task:
        raise HTTPException(status_code=404, detail="Video task not found")
    return _public_api_task(task)


@router.get("/admin/video-api/keys")
async def admin_video_api_keys(admin: dict = Depends(require_super_admin)):
    return list_video_api_keys()


@router.post("/admin/video-api/keys", status_code=201)
async def admin_create_video_api_key(req: ApiKeyCreateReq, admin: dict = Depends(require_super_admin)):
    owner_id = req.user_id or admin["sub"]
    if not get_user_by_id(owner_id):
        raise HTTPException(status_code=404, detail="User not found")
    name = req.name.strip()
    if not name or len(name) > 80:
        raise HTTPException(status_code=422, detail="API key name must be 1-80 characters")
    raw_key = "ccioi_" + secrets.token_urlsafe(32)
    record = create_video_api_key(owner_id, name, raw_key[:14], hashlib.sha256(raw_key.encode("utf-8")).hexdigest())
    return {**record, "key": raw_key}


@router.patch("/admin/video-api/keys/{key_id}")
async def admin_set_video_api_key_status(key_id: str, req: ApiKeyStatusReq, admin: dict = Depends(require_super_admin)):
    if not set_video_api_key_enabled(key_id, req.enabled):
        raise HTTPException(status_code=404, detail="API key not found")
    return {"id": key_id, "enabled": req.enabled}


@router.get("/admin/video-api/tasks")
async def admin_video_api_tasks(limit: int = 200, admin: dict = Depends(require_super_admin)):
    return [_public_api_task(task) | {"user_email": task.get("user_email")} for task in list_video_api_tasks(limit)]


@router.get("/gpus")
async def list_gpus(auth: dict = Depends(get_user_from_auth)):
    now = time.time()
    return {
        "gpus": [
            {
                "id": _public_gpu_id(gpu_id),
                "name": "CCIOI Compute Node",
                "status": info["status"] if _gpu_is_online(info) else "offline",
                "current_task": info.get("current_task"),
                "last_seen_seconds": max(0, round(now - info.get("last_heartbeat", now), 1)),
                "supported_models": [_public_model(model) for model in _gpu_supported_models(info)],
                "metadata": {},
            }
            for gpu_id, info in sorted(gpu_registry.items())
        ]
    }

@router.websocket("/ws/gpu")
async def gpu_ws(ws: WebSocket):
    await ws.accept()

    # 注册
    try:
        register_msg = json.loads(await ws.receive_text())
    except Exception:
        await ws.close(code=1008)
        return

    requested_gpu_id = str(register_msg.get("gpu_id") or "").strip()
    if not requested_gpu_id:
        await ws.close(code=1008)
        return

    # 多台客户端沿用默认 gpu-01 时不能互相覆盖，自动分配本次连接的唯一节点 ID。
    gpu_id = requested_gpu_id
    suffix = 2
    while gpu_id in gpu_registry and _gpu_is_online(gpu_registry[gpu_id]):
        gpu_id = f"{requested_gpu_id}-{suffix}"
        suffix += 1

    gpu_registry[gpu_id] = {
        "ws": ws,
        "name": register_msg.get("name") or requested_gpu_id,
        "model": register_msg.get("model") or (
            "ltx-2.3" if "ltx" in requested_gpu_id.lower() else None
        ),
        "supported_models": register_msg.get("supported_models") or register_msg.get("models"),
        "metadata": {
            key: value for key, value in register_msg.items()
            if key not in {"type", "gpu_id", "name"} and isinstance(value, (str, int, float, bool))
        },
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
                if task_id and get_video_api_task(task_id):
                    line = str(msg.get("line") or "")
                    match = re.search(r"(?:progress|进度)\D*(\d{1,3})%?", line, re.I)
                    if match:
                        update_video_api_task(task_id, "processing", progress=min(99, int(match.group(1))))
                frontend_ws = task_frontend_map.get(task_id)
                if frontend_ws:
                    await frontend_ws.send_text(json.dumps(_public_payload(msg)))
                else:
                    print(f"⚠️ No frontend ws for TASK_LOG, task_id={task_id}")
                continue

            if msg_type in {"TASK_PREVIEW", "task_preview"}:
                task_id = msg.get("task_id")
                frontend_ws = task_frontend_map.get(task_id)
                if frontend_ws:
                    await frontend_ws.send_text(json.dumps({
                        "type": "TASK_PREVIEW", "task_id": task_id,
                        "preview_url": msg.get("preview_url") or msg.get("image_url"),
                        "progress": msg.get("progress"),
                    }))
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

                api_task = get_video_api_task(task_id) if task_id else None
                if api_task and msg.get("status") != "success":
                    updated = update_video_api_task(task_id, "failed", error=str(msg.get("error") or "generation failed")[:1000])
                    if updated:
                        asyncio.create_task(_send_api_callback(updated))

                # 透传给前端
                if frontend_ws:
                    await frontend_ws.send_text(json.dumps(_public_payload(msg)))
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
            active_user = get_user_by_id(ws_user_id)
            if not active_user or not active_user.get("enabled", True):
                await ws.send_text(json.dumps({"type": "TASK_REJECTED", "message": "Account is disabled"}))
                continue
            permissions = active_user.get("module_permissions") or {}
            requested_module = "geo" if data.get("task") == "AMAZON_POLLUTION" else "video"
            if permissions.get(requested_module, True) is False:
                await ws.send_text(json.dumps({"type": "TASK_REJECTED", "message": f"{requested_module} module access denied"}))
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

            # 调度 GPU：前端可指定 preferred_gpu_id，为空时保持自动调度。
            preferred_gpu_id = data.get("preferred_gpu_id")
            parameters = data.get("parameters") or {}
            model = _internal_model(str(data.get("model") or parameters.get("model") or "ccioi-standard").lower())
            if model not in {"opensora", "ltx-2.3"}:
                await ws.send_text(json.dumps({
                    "type": "TASK_REJECTED",
                    "message": f"Unsupported video model: {_public_model(model)}",
                }))
                continue
            if model == "ltx-2.3":
                ltx_width = int(parameters.get("width") or 1536)
                ltx_height = int(parameters.get("height") or 1024)
                ltx_frames = int(parameters.get("num_frames") or parameters.get("frames") or 481)
                if ltx_frames < 1 or ltx_frames > 481:
                    await ws.send_text(json.dumps({"type": "TASK_REJECTED", "message": "CCIOI Speed num_frames must be between 1 and 481"}))
                    continue
                if ltx_width < 64 or ltx_height < 64 or ltx_width % 64 or ltx_height % 64:
                    await ws.send_text(json.dumps({"type": "TASK_REJECTED", "message": "CCIOI Speed width and height must be multiples of 64"}))
                    continue
            gpu_id, gpu = select_idle_gpu(preferred_gpu_id, model)
            if not gpu:
                message = (
                    f"Node {preferred_gpu_id} is busy, offline, or does not support {_public_model(model)}"
                    if preferred_gpu_id else f"No idle node supports {_public_model(model)}"
                )
                await ws.send_text(json.dumps({
                    "type": "TASK_REJECTED",
                    "message": message,
                    "gpu_id": preferred_gpu_id,
                }))
                continue

            # 构建任务
            task_id = str(uuid.uuid4())
            command = build_torchrun_command(data, task_id) if model == "opensora" else None
            prompt = parameters.get("prompt")

            # 保存 task 上下文（保证 GPU 回来时一定能补齐 user_id/prompt）
            task_ctx_map[task_id] = {
                "user_id": ws_user_id,
                "prompt": prompt,
                "project_id": parameters.get("project_id"),
                "shot_id": parameters.get("shot_id"),
                "created_at": time.time(),
            }
            try:
                bind_video_task(task_id, ws_user_id, parameters.get("project_id"), parameters.get("shot_id"))
            except ValueError:
                await ws.send_text(json.dumps({"type": "TASK_REJECTED", "message": "Drama project or shot is invalid"}))
                task_ctx_map.pop(task_id, None)
                continue

            gpu["status"] = "busy"
            gpu["current_task"] = task_id

            task_frontend_map[task_id] = ws
            task_gpu_map[task_id] = gpu_id

            print(f"📤 Dispatch task {task_id} to GPU {gpu_id}")
            print(f"🧠 Video model: {model}")
            if command:
                print("🧠 Legacy OpenSora command:")
                print(command)

            # 发给 GPU：把 user_id/prompt 也带上（这会让 gpu_client 直接回传，不依赖补齐）
            worker_payload = {
                "type": "exec_command",
                "task_id": task_id,
                "user_id": ws_user_id,
                "model": model,
                "prompt": prompt,
                "width": int(parameters.get("width") or (1536 if model == "ltx-2.3" else 768)),
                "height": int(parameters.get("height") or (1024 if model == "ltx-2.3" else 512)),
                "num_frames": int(parameters.get("num_frames") or parameters.get("frames") or (481 if model == "ltx-2.3" else 121)),
                "fps": int(parameters.get("fps") or 24),
                "seed": int(parameters.get("seed") or 42),
                "project_id": parameters.get("project_id"),
                "shot_id": parameters.get("shot_id"),
            }
            if model == "ltx-2.3":
                worker_payload.update({"video_codec": "h264", "audio_codec": "aac"})
            # LTX 图生视频字段为可选；没有 image_url 时仍按文生视频执行。
            image_url = parameters.get("image_url")
            if model == "ltx-2.3" and image_url:
                image_url = str(image_url).strip()
                if image_url.startswith("/"):
                    image_url = f"{PUBLIC_ORIGIN}{image_url}"
                if not image_url.startswith("https://"):
                    await ws.send_text(json.dumps({"type": "TASK_REJECTED", "message": "CCIOI Speed image_url must use https"}))
                    gpu["status"] = "idle"
                    gpu["current_task"] = None
                    task_frontend_map.pop(task_id, None)
                    task_gpu_map.pop(task_id, None)
                    task_ctx_map.pop(task_id, None)
                    continue
                worker_payload.update({
                    "image_url": image_url,
                    "image_frame": max(0, int(parameters.get("image_frame") or 0)),
                    "image_strength": min(1.0, max(0.0, float(parameters.get("image_strength", 0.8)))),
                })
            # 老 OpenSora Worker 仍从 command 执行；新 Worker 可直接消费上述统一字段。
            if command:
                worker_payload["command"] = command
            await gpu["ws"].send_text(json.dumps(worker_payload))
            log_operation(ws_user_id, "WS", "/ws/frontend/video-generation", 202, {
                "task_id": task_id,
                "model": model,
                "gpu_id": gpu_id,
            })

            # Ack 前端
            await ws.send_text(json.dumps({"type": "TASK_ACCEPTED", "task_id": task_id, "gpu_id": _public_gpu_id(gpu_id)}))

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
        active_user = get_user_by_id(user_id)
        if not active_user or not active_user.get("enabled", True):
            raise HTTPException(status_code=403, detail="Account is disabled")

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
# GPU UPLOAD API (GPU -> local disk + metadata)
# =========================================================
@router.post("/gpu/upload")
async def gpu_upload(
    task_id: str = Form(...),
    user_id: str = Form(...),
    prompt: str = Form(""),
    file: UploadFile = File(...),
):
    """
    GPU 生成完成后调用：上传 TOS，并把视频地址写入 PostgreSQL。
    """
    if not task_id or not user_id:
        raise HTTPException(status_code=400, detail="task_id and user_id required")

    try:
        task_id = safe_id(task_id, "task_id")
        user_id = safe_id(user_id, "user_id")
        if not tos_configured():
            raise HTTPException(status_code=503, detail="TOS is not configured")
        video_key = f"videos/{user_id}/{task_id}.mp4"
        public_url = await asyncio.to_thread(tos_upload_stream, video_key, file.file, "video/mp4")
        thumbnail_url = None
        with tempfile.TemporaryDirectory(prefix="ccioi-thumb-") as temp_name:
            thumbnail = Path(temp_name) / f"{task_id}.jpg"
            process = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-ss", "0.15", "-i", public_url, "-frames:v", "1",
                "-vf", "scale=640:-2", "-q:v", "4", str(thumbnail),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()
            if process.returncode == 0 and thumbnail.is_file():
                thumbnail_key = f"thumbnails/{user_id}/{task_id}.jpg"
                thumbnail_url = await asyncio.to_thread(tos_upload_file, thumbnail_key, thumbnail, "image/jpeg")
        save_generation_record(task_id, user_id, prompt, public_url, video_key, thumbnail_url)
        complete_bound_drama_shot(task_id, public_url, thumbnail_url)
        api_task = get_video_api_task(task_id, user_id)
        if api_task:
            updated = update_video_api_task(
                task_id, "completed", progress=100,
                video_url=public_url, thumbnail_url=thumbnail_url, error=None,
            )
            if updated:
                asyncio.create_task(_send_api_callback(updated))

        return {
            "status": "success",
            "task_id": task_id,
            "public_url": public_url,
        }

    except HTTPException:
        raise
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
                        "line": _public_payload(line)
                    }))
                continue

            if data.get("type") == "TASK_LOG":
                if frontend_ws_global:
                    await frontend_ws_global.send_text(json.dumps(_public_payload(data)))
                continue

            if data.get("type") == "OTP_REQUIRED":
                if frontend_ws_global:
                    await frontend_ws_global.send_text(json.dumps(data))
                continue

    except Exception as e:
        print("Agent WS error:", e)
