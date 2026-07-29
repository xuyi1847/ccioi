import hashlib
import hmac
import json
import os
import secrets
from contextlib import contextmanager
from typing import Any, Optional


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
            invite_code TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
        "CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))",
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
    }


def get_user_by_email(email: str) -> Optional[dict]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
            return cursor.fetchone()


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
