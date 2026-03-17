from __future__ import annotations

import json
import os
import time
from typing import Dict, List, Optional

import oss2


class FundIntradayStore:
    def save(self, record: Dict[str, object]) -> None:
        raise NotImplementedError

    def list(self, limit: int = 50) -> List[Dict[str, object]]:
        raise NotImplementedError


class _MemoryFundIntradayStore(FundIntradayStore):
    def __init__(self, max_items: int = 500) -> None:
        self._max_items = max_items
        self._items: List[Dict[str, object]] = []

    def save(self, record: Dict[str, object]) -> None:
        self._items.append(record)
        if len(self._items) > self._max_items:
            del self._items[:-self._max_items]

    def list(self, limit: int = 50) -> List[Dict[str, object]]:
        return list(reversed(self._items))[:limit]


class _OssFundIntradayStore(FundIntradayStore):
    def __init__(
        self,
        endpoint: str,
        access_key_id: str,
        access_key_secret: str,
        bucket_name: str,
        prefix: str = "fund_intraday/",
    ) -> None:
        auth = oss2.Auth(access_key_id, access_key_secret)
        self._bucket = oss2.Bucket(auth, f"https://{endpoint}", bucket_name)
        self._prefix = prefix.rstrip("/") + "/"

    def save(self, record: Dict[str, object]) -> None:
        ts = record.get("ts") or time.time()
        code = record.get("code", "unknown")
        key = f"{self._prefix}{int(float(ts))}_{code}.json"
        payload = json.dumps(record, ensure_ascii=False).encode("utf-8")
        self._bucket.put_object(key, payload)

    def list(self, limit: int = 50) -> List[Dict[str, object]]:
        records: List[Dict[str, object]] = []
        try:
            for obj in oss2.ObjectIterator(self._bucket, prefix=self._prefix):
                raw = self._bucket.get_object(obj.key).read()
                try:
                    records.append(json.loads(raw.decode("utf-8")))
                except Exception:
                    continue
        except Exception:
            return []
        records.sort(key=lambda x: x.get("ts", 0), reverse=True)
        return records[:limit]


def get_fund_intraday_store() -> FundIntradayStore:
    endpoint = os.getenv("OSS_ENDPOINT")
    access_key_id = os.getenv("OSS_ACCESS_KEY_ID")
    access_key_secret = os.getenv("OSS_ACCESS_KEY_SECRET")
    bucket_name = os.getenv("OSS_BUCKET")
    if endpoint and access_key_id and access_key_secret and bucket_name:
        return _OssFundIntradayStore(
            endpoint=endpoint,
            access_key_id=access_key_id,
            access_key_secret=access_key_secret,
            bucket_name=bucket_name,
            prefix=os.getenv("FUND_INTRADAY_OSS_PREFIX", "fund_intraday/"),
        )
    return _MemoryFundIntradayStore()
