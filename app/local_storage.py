import json
import os
import time
from pathlib import Path

from fastapi import HTTPException, UploadFile


STORAGE_ROOT = Path(os.getenv("LOCAL_STORAGE_ROOT", "/var/lib/ccioi/storage")).resolve()
PUBLIC_BASE = os.getenv("LOCAL_STORAGE_PUBLIC_BASE", "/api/storage").rstrip("/")
RETENTION_DAYS = max(1, int(os.getenv("LOCAL_STORAGE_RETENTION_DAYS", "7")))
MAX_BYTES = max(1, int(os.getenv("LOCAL_STORAGE_MAX_GB", "15"))) * 1024**3


def init_local_storage() -> None:
    for relative in ("uploads", "videos", "users"):
        (STORAGE_ROOT / relative).mkdir(parents=True, exist_ok=True)


def public_url(relative_path: str) -> str:
    return f"{PUBLIC_BASE}/{relative_path.lstrip('/')}"


def safe_id(value: str, field: str) -> str:
    cleaned = "".join(char for char in value if char.isalnum() or char in "-_")
    if not cleaned or cleaned != value:
        raise HTTPException(status_code=400, detail=f"Invalid {field}")
    return cleaned


async def save_upload(file: UploadFile, relative_path: str, max_bytes: int) -> int:
    destination = (STORAGE_ROOT / relative_path).resolve()
    if STORAGE_ROOT not in destination.parents:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    try:
        with destination.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="File is too large")
                target.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return total


def write_json(relative_path: str, payload: dict) -> None:
    destination = (STORAGE_ROOT / relative_path).resolve()
    if STORAGE_ROOT not in destination.parents:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temporary.replace(destination)


def read_user_history(user_id: str) -> list[dict]:
    directory = STORAGE_ROOT / "users" / safe_id(user_id, "user_id") / "meta"
    if not directory.exists():
        return []
    records = []
    for path in directory.glob("*.json"):
        try:
            records.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            continue
    records.sort(key=lambda item: item.get("created_at", 0), reverse=True)
    return records


def read_all_history() -> list[dict]:
    users_root = STORAGE_ROOT / "users"
    records = []
    if not users_root.exists():
        return records
    for user_directory in users_root.iterdir():
        if not user_directory.is_dir():
            continue
        for item in read_user_history(user_directory.name):
            records.append({**item, "user_id": user_directory.name})
    records.sort(key=lambda item: item.get("created_at", 0), reverse=True)
    return records


def delete_history(user_id: str, task_id: str) -> None:
    user_id = safe_id(user_id, "user_id")
    task_id = safe_id(task_id, "task_id")
    (STORAGE_ROOT / "users" / user_id / "meta" / f"{task_id}.json").unlink(missing_ok=True)
    (STORAGE_ROOT / "videos" / f"{task_id}.mp4").unlink(missing_ok=True)
    (STORAGE_ROOT / "uploads" / f"{task_id}-ending.jpg").unlink(missing_ok=True)


def cleanup_storage() -> None:
    init_local_storage()
    now = time.time()
    cutoff = now - RETENTION_DAYS * 86400
    files = [
        path for path in STORAGE_ROOT.rglob("*")
        if path.is_file() and not path.name.endswith(".tmp")
    ]

    for path in files:
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            continue

    files = [path for path in STORAGE_ROOT.rglob("*") if path.is_file()]
    sized = []
    total = 0
    for path in files:
        try:
            stat = path.stat()
        except OSError:
            continue
        total += stat.st_size
        sized.append((stat.st_mtime, stat.st_size, path))

    for _, size, path in sorted(sized):
        if total <= MAX_BYTES:
            break
        try:
            path.unlink(missing_ok=True)
            total -= size
        except OSError:
            continue

    for directory in sorted(
        (path for path in STORAGE_ROOT.rglob("*") if path.is_dir()),
        key=lambda path: len(path.parts),
        reverse=True,
    ):
        try:
            directory.rmdir()
        except OSError:
            pass
