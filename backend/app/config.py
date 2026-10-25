from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    api_port: int = 8000
    database_url: str = "sqlite:///./relay4.db"
    elevenlabs_agent_id: str | None = None
    elevenlabs_webhook_secret: str = Field(default="", repr=False)
    elevenlabs_webhook_header: str = "X-ElevenLabs-Webhook-Secret"
    admin_api_key: str = Field(default="", repr=False)
    operator_username: str = "Pete"
    operator_password: str = Field(default="", repr=False)
    simulation_mode: bool = True
    cors_origins: str = ""

    @property
    def configured_cors_origins(self) -> list[str]:
        configured = self.cors_origins
        if not configured and self.app_env == "development":
            configured = ",".join(
                (
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://localhost:5174",
                    "http://127.0.0.1:5174",
                )
            )
        return [origin.strip() for origin in configured.split(",") if origin.strip()]

    @property
    def configured_operator_password(self) -> str:
        """Use a separate operator password when configured; otherwise use the local admin key."""
        return self.operator_password or self.admin_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
