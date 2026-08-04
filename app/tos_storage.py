import os
from pathlib import Path
from urllib.parse import quote


TOS_ACCESS_KEY = os.getenv("TOS_ACCESS_KEY", "").strip()
TOS_SECRET_KEY = os.getenv("TOS_SECRET_KEY", "").strip()
TOS_ENDPOINT = os.getenv("TOS_ENDPOINT", "tos-cn-beijing.volces.com").replace("https://", "").strip("/")
TOS_REGION = os.getenv("TOS_REGION", "cn-beijing").strip()
TOS_BUCKET = os.getenv("TOS_BUCKET", "ccioi").strip()
TOS_PUBLIC_BASE = os.getenv("TOS_PUBLIC_BASE", f"https://{TOS_BUCKET}.{TOS_ENDPOINT}").rstrip("/")


def configured() -> bool:
    return bool(TOS_ACCESS_KEY and TOS_SECRET_KEY and TOS_BUCKET)


def _client():
    if not configured():
        raise RuntimeError("TOS is not configured")
    import tos
    return tos.TosClientV2(TOS_ACCESS_KEY, TOS_SECRET_KEY, TOS_ENDPOINT, TOS_REGION)


def public_url(object_key: str) -> str:
    return f"{TOS_PUBLIC_BASE}/{quote(object_key.lstrip('/'), safe='/')}"


def upload_stream(object_key: str, stream, content_type: str = "video/mp4") -> str:
    stream.seek(0)
    _client().put_object(TOS_BUCKET, object_key, content=stream, content_type=content_type)
    return public_url(object_key)


def upload_file(object_key: str, source: Path, content_type: str = "video/mp4") -> str:
    _client().put_object_from_file(TOS_BUCKET, object_key, str(source), content_type=content_type)
    return public_url(object_key)


def download_file(object_key: str, destination: Path) -> None:
    _client().get_object_to_file(TOS_BUCKET, object_key, str(destination))


def delete_object(object_key: str) -> None:
    if object_key:
        _client().delete_object(TOS_BUCKET, object_key)
