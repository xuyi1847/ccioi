import hashlib
import hmac
import json
import os
import secrets
from contextlib import contextmanager
from typing import Any, Optional


DEFAULT_MODULE_PERMISSIONS = {
    "chat": True, "image": True, "video": True, "audio": True,
    "text": True, "geo": True, "fund": True, "history": True,
}


def _database_url() -> str:
    value = os.getenv("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL is not configured")
    return value


@contextmanager
def connection():
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError as exc:
        raise RuntimeError("psycopg2 is not installed") from exc

    conn = psycopg2.connect(_database_url(), cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database() -> None:
    statements = (
        """
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
            role TEXT NOT NULL DEFAULT 'user',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            module_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
            invite_code TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS module_permissions JSONB NOT NULL DEFAULT '{}'::jsonb",
        """
        CREATE TABLE IF NOT EXISTS operation_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS invite_codes (
            code TEXT PRIMARY KEY,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            max_uses INTEGER,
            use_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS user_configs (
            user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS geo_reports (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target_url TEXT NOT NULL,
            brand TEXT NOT NULL,
            input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            result JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))",
        "CREATE INDEX IF NOT EXISTS idx_geo_reports_user_created ON geo_reports (user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs (created_at DESC)",
    )
    with connection() as conn:
        with conn.cursor() as cursor:
            for statement in statements:
                cursor.execute(statement)
            for code in ("CCIOI-ALPHA", "CCIOI-BETA", "INTERNAL-2025"):
                cursor.execute(
                    "INSERT INTO invite_codes (code) VALUES (%s) ON CONFLICT (code) DO NOTHING",
                    (code,),
                )
            cursor.execute(
                "UPDATE users SET role = 'super_admin', updated_at = NOW() WHERE LOWER(email) = LOWER(%s)",
                ("xuyi1847@gmail.com",),
            )


def hash_password(password: str, salt_hex: Optional[str] = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return digest.hex(), salt.hex()


def verify_password(password: str, expected_hash: str, salt_hex: str) -> bool:
    actual_hash, _ = hash_password(password, salt_hex)
    return hmac.compare_digest(actual_hash, expected_hash)


def public_user(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "name": row["name"],
        "balance": float(row["balance"]),
        "role": row.get("role", "user"),
        "enabled": row.get("enabled", True),
        "module_permissions": {**DEFAULT_MODULE_PERMISSIONS, **(row.get("module_permissions") or {})},
    }


def log_operation(user_id: str, method: str, path: str, status_code: int, detail: Optional[dict] = None) -> None:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO operation_logs (user_id, method, path, status_code, detail)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                """,
                (user_id, method, path, status_code, json.dumps(detail or {}, ensure_ascii=False)),
            )


def list_operation_logs(limit: int = 500, user_id: Optional[str] = None) -> list[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT l.id, l.method, l.path, l.status_code, l.detail, l.created_at,
                       u.id AS user_id, u.email, u.name
                FROM operation_logs l
                LEFT JOIN users u ON u.id = l.user_id
                WHERE (%s::uuid IS NULL OR l.user_id = %s::uuid)
                ORDER BY l.created_at DESC
                LIMIT %s
                """,
                (user_id, user_id, min(max(limit, 1), 2000)),
            )
            return [
                {**dict(row), "user_id": str(row["user_id"]) if row["user_id"] else None,
                 "created_at": row["created_at"].isoformat()}
                for row in cursor.fetchall()
            ]


def list_users() -> list[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT u.id, u.email, u.name, u.role, u.enabled, u.module_permissions, u.balance,
                       u.invite_code, u.created_at, COUNT(l.id) AS operation_count,
                       MAX(l.created_at) AS last_active_at
                FROM users u LEFT JOIN operation_logs l ON l.user_id = u.id
                GROUP BY u.id ORDER BY u.created_at DESC
                """
            )
            return [
                {**dict(row), "id": str(row["id"]), "balance": float(row["balance"]),
                 "module_permissions": {**DEFAULT_MODULE_PERMISSIONS, **(row["module_permissions"] or {})},
                 "created_at": row["created_at"].isoformat(),
                 "last_active_at": row["last_active_at"].isoformat() if row["last_active_at"] else None}
                for row in cursor.fetchall()
            ]


def set_user_enabled(user_id: str, enabled: bool) -> Optional[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users SET enabled = %s, updated_at = NOW()
                WHERE id = %s AND role <> 'super_admin'
                RETURNING *
                """,
                (enabled, user_id),
            )
            return cursor.fetchone()


def set_user_module_permissions(user_id: str, permissions: dict[str, bool]) -> Optional[dict]:
    normalized = {key: bool(permissions.get(key, True)) for key in DEFAULT_MODULE_PERMISSIONS}
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users SET module_permissions = %s::jsonb, updated_at = NOW()
                WHERE id = %s AND role <> 'super_admin'
                RETURNING *
                """,
                (json.dumps(normalized), user_id),
            )
            return cursor.fetchone()


def get_user_by_email(email: str) -> Optional[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
            return cursor.fetchone()


def get_system_setting(key: str, default: Any = None) -> Any:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT value FROM system_settings WHERE key = %s", (key,))
            row = cursor.fetchone()
            return row["value"] if row else default


def set_system_setting(key: str, value: Any) -> None:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO system_settings (key, value) VALUES (%s, %s::jsonb)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                """,
                (key, json.dumps(value, ensure_ascii=False)),
            )


def get_user_by_id(user_id: str) -> Optional[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            return cursor.fetchone()


def create_user(user_id: str, email: str, name: str, password: str, invite_code: str) -> dict:
    password_hash, password_salt = hash_password(password)
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE invite_codes
                SET use_count = use_count + 1
                WHERE code = %s
                  AND active = TRUE
                  AND (max_uses IS NULL OR use_count < max_uses)
                RETURNING code
                """,
                (invite_code,),
            )
            if not cursor.fetchone():
                raise ValueError("invalid_invite_code")
            cursor.execute(
                """
                INSERT INTO users
                    (id, email, name, password_hash, password_salt, invite_code)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (user_id, email, name, password_hash, password_salt, invite_code),
            )
            user = cursor.fetchone()
            cursor.execute(
                "INSERT INTO user_configs (user_id) VALUES (%s) ON CONFLICT DO NOTHING",
                (user_id,),
            )
            return user


def add_balance(user_id: str, amount: float) -> Optional[float]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users SET balance = balance + %s, updated_at = NOW()
                WHERE id = %s RETURNING balance
                """,
                (amount, user_id),
            )
            row = cursor.fetchone()
            return float(row["balance"]) if row else None


def get_user_config(user_id: str) -> Optional[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT data, updated_at FROM user_configs WHERE user_id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "data": row["data"] or {},
                "updated_at": row["updated_at"].isoformat(),
            }


def save_user_config(user_id: str, data: dict[str, Any], partial: bool = False) -> dict:
    encoded = json.dumps(data, ensure_ascii=False)
    with connection() as conn:
        with conn.cursor() as cursor:
            if partial:
                cursor.execute(
                    """
                    INSERT INTO user_configs (user_id, data)
                    VALUES (%s, %s::jsonb)
                    ON CONFLICT (user_id) DO UPDATE
                    SET data = user_configs.data || EXCLUDED.data, updated_at = NOW()
                    RETURNING data, updated_at
                    """,
                    (user_id, encoded),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO user_configs (user_id, data)
                    VALUES (%s, %s::jsonb)
                    ON CONFLICT (user_id) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = NOW()
                    RETURNING data, updated_at
                    """,
                    (user_id, encoded),
                )
            row = cursor.fetchone()
            return {"data": row["data"], "updated_at": row["updated_at"].isoformat()}


def save_geo_report(
    report_id: str,
    user_id: str,
    target_url: str,
    brand: str,
    input_data: dict[str, Any],
    result: dict[str, Any],
) -> dict:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO geo_reports (id, user_id, target_url, brand, input_data, result)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb)
                RETURNING id, target_url, brand, result, created_at
                """,
                (
                    report_id,
                    user_id,
                    target_url,
                    brand,
                    json.dumps(input_data, ensure_ascii=False),
                    json.dumps(result, ensure_ascii=False),
                ),
            )
            row = cursor.fetchone()
            return {
                "id": str(row["id"]),
                "target_url": row["target_url"],
                "brand": row["brand"],
                "result": row["result"],
                "created_at": row["created_at"].isoformat(),
            }


def list_geo_reports(user_id: str, limit: int = 20) -> list[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, target_url, brand, result, created_at
                FROM geo_reports
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (user_id, max(1, min(limit, 100))),
            )
            return [
                {
                    "id": str(row["id"]),
                    "target_url": row["target_url"],
                    "brand": row["brand"],
                    "result": row["result"],
                    "created_at": row["created_at"].isoformat(),
                }
                for row in cursor.fetchall()
            ]
