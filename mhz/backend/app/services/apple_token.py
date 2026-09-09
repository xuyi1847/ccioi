import time
from pathlib import Path
import jwt
from app.core.config import Settings


class AppleDeveloperTokenService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._token: str | None = None
        self._expires_at = 0

    @property
    def configured(self) -> bool:
        return bool(self.settings.apple_team_id and self.settings.apple_key_id and self.settings.apple_private_key_path)

    def get_token(self) -> tuple[str, int]:
        now = int(time.time())
        if self._token and now < self._expires_at - 3600:
            return self._token, self._expires_at
        if not self.configured:
            raise RuntimeError("Apple Music credentials are not configured")
        private_key = Path(self.settings.apple_private_key_path or "").read_text()
        self._expires_at = now + 60 * 60 * 24 * 30
        payload = {"iss": self.settings.apple_team_id, "iat": now, "exp": self._expires_at, "origin": self.settings.apple_music_origin}
        self._token = jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": self.settings.apple_key_id})
        return self._token, self._expires_at
