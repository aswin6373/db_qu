from functools import lru_cache

from cryptography.fernet import Fernet
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PRODUCTION_ENVIRONMENTS = {"production", "prod"}
DEFAULT_JWT_SECRET = "change-this-secret"


class Settings(BaseSettings):
    app_name: str = "QueryMind"
    environment: str = "local"
    database_url: str = "sqlite:///./querymind.db"
    database_ssl: bool = True
    jwt_secret_key: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    fernet_key: str = ""
    rate_limit_per_minute: int = 300
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:8b"
    openai_api_key: str = ""
    mysql_connect_timeout: int = 5
    mysql_statement_timeout_ms: int = 30000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def encryption_key(self) -> bytes:
        if self.fernet_key:
            return self.fernet_key.encode()
        return Fernet.generate_key()

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in PRODUCTION_ENVIRONMENTS

    @model_validator(mode="after")
    def validate_secrets(self) -> "Settings":
        if self.fernet_key:
            try:
                Fernet(self.fernet_key.encode())
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    "FERNET_KEY is not a valid Fernet key. Generate one with: "
                    'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
                ) from exc
        if not self.is_production:
            return self
        errors: list[str] = []
        if not self.jwt_secret_key or self.jwt_secret_key == DEFAULT_JWT_SECRET:
            errors.append("JWT_SECRET_KEY must be set to a strong value in production")
        elif len(self.jwt_secret_key) < 32:
            errors.append("JWT_SECRET_KEY must be at least 32 characters in production")
        if not self.fernet_key:
            errors.append(
                "FERNET_KEY is required in production. Saved database credentials "
                "become undecryptable after restarts without a stable key"
            )
        if errors:
            raise ValueError("; ".join(errors))
        return self

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
