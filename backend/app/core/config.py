from functools import lru_cache

from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "QueryMind"
    database_url: str = "sqlite:///./querymind.db"
    database_ssl: bool = True
    jwt_secret_key: str = "change-this-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    fernet_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:8b"
    openai_api_key: str = ""
    mysql_connect_timeout: int = 5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def encryption_key(self) -> bytes:
        if self.fernet_key:
            return self.fernet_key.encode()
        return Fernet.generate_key()

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url

    @property
    def allowed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
