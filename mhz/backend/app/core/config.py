from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MHz API"
    environment: str = "development"
    music_provider: str = "mock"
    audius_app_name: str = "MHz"
    musicbrainz_user_agent: str = "MHz/0.1 (https://www.ccioi.com)"
    database_url: str = "sqlite+aiosqlite:///./mhz.db"
    redis_url: str = "redis://localhost:6379/0"
    apple_team_id: str | None = None
    apple_key_id: str | None = None
    apple_private_key_path: str | None = None
    apple_music_storefront: str = "cn"
    apple_music_origin: str = "http://localhost:3000"
    ccioi_api_url: str = "https://www.ccioi.com/api"
    cors_origins: str = "http://localhost:3000"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
