"""One-time migration: local video files/JSON metadata -> TOS/PostgreSQL."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import connection, init_database, save_generation_record
from app.local_storage import STORAGE_ROOT, read_all_history
from app.tos_storage import configured, upload_file


def replace_urls(value, replacements: dict[str, str]):
    if isinstance(value, dict):
        return {key: replace_urls(item, replacements) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_urls(item, replacements) for item in value]
    if isinstance(value, str):
        return replacements.get(value, value)
    return value


def main() -> None:
    if not configured():
        raise RuntimeError("TOS environment variables are missing")
    init_database()
    replacements: dict[str, str] = {}
    migrated = 0
    for record in read_all_history():
        task_id = str(record.get("id") or "")
        user_id = str(record.get("user_id") or "")
        old_url = str(record.get("video_url") or "")
        source = STORAGE_ROOT / "videos" / f"{task_id}.mp4"
        if not task_id or not user_id or not source.is_file():
            continue
        object_key = f"videos/{user_id}/{task_id}.mp4"
        new_url = upload_file(object_key, source, "video/mp4")
        thumbnail_url = None
        with tempfile.TemporaryDirectory(prefix="ccioi-thumb-") as temp_name:
            thumbnail = Path(temp_name) / f"{task_id}.jpg"
            result = subprocess.run(
                ["ffmpeg", "-y", "-ss", "0.15", "-i", str(source), "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", str(thumbnail)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
            )
            if result.returncode == 0 and thumbnail.is_file():
                thumbnail_url = upload_file(f"thumbnails/{user_id}/{task_id}.jpg", thumbnail, "image/jpeg")
        save_generation_record(task_id, user_id, str(record.get("prompt") or ""), new_url, object_key, thumbnail_url)
        if old_url:
            replacements[old_url] = new_url
        migrated += 1

    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, user_id, data FROM drama_projects")
            projects = cursor.fetchall()
            for project in projects:
                data = project["data"] or {}
                urls = []
                if isinstance(data, dict):
                    if data.get("export_url"):
                        urls.append(data["export_url"])
                for old_url in urls:
                    if old_url in replacements:
                        continue
                    filename = Path(urlparse(old_url).path).name
                    source = STORAGE_ROOT / "videos" / filename
                    if source.is_file() and filename.endswith(".mp4"):
                        object_key = f"drama/{project['user_id']}/{filename}"
                        replacements[old_url] = upload_file(object_key, source, "video/mp4")
                updated = replace_urls(data, replacements)
                if updated != data:
                    cursor.execute(
                        "UPDATE drama_projects SET data = %s::jsonb, updated_at = NOW() WHERE id = %s",
                        (json.dumps(updated, ensure_ascii=False), project["id"]),
                    )
    print(json.dumps({"migrated_generation_videos": migrated, "rewritten_urls": len(replacements)}))


if __name__ == "__main__":
    main()
