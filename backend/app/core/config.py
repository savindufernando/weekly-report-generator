"""Application settings.

Read once at import and validated by Pydantic, so a missing or malformed value
fails at startup rather than on the first request that needs it.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- app ---
    PROJECT_NAME: str = "Weekly Report Generator"
    ENVIRONMENT: Literal["development", "production"] = "development"
    API_V1_PREFIX: str = "/api/v1"

    # --- database ---
    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None
    SQL_ECHO: bool = False

    # --- auth ---
    JWT_SECRET: str = Field(..., min_length=16)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- cookies ---
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    REFRESH_COOKIE_NAME: str = "refresh_token"
    REFRESH_COOKIE_PATH: str = "/api/v1/auth"

    # --- cors ---
    # NoDecode stops pydantic-settings from JSON-parsing the raw env value, so
    # our own comma-splitting validator below is what runs.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # --- business rules ---
    # The brief asks for "late" but never defines a deadline. This is the
    # documented assumption: a first submission after week_end + this many
    # hours is late. Lateness is judged on the FIRST submission, so correcting
    # a report never retroactively makes it late.
    SUBMISSION_DEADLINE_GRACE_HOURS: int = 24

    # --- pagination ---
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # --- ai (bonus) ---
    AI_ENABLED: bool = False
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> list[str]:
        """Accept a comma-separated string from the environment."""
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def require_utf8mb4(cls, v: str) -> str:
        # Without this the connection negotiates latin1 and any non-ASCII text
        # is silently replaced with "?" on the way in — unrecoverable.
        if v.startswith("mysql") and "charset=utf8mb4" not in v:
            raise ValueError("DATABASE_URL must include ?charset=utf8mb4")
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
