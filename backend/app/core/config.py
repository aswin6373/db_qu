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
    postgres_connect_timeout: int = 5
    postgres_statement_timeout_ms: int = 30000
    max_result_rows: int = 500
    # Per-LLM-call cap. Kept low so one stalled call cannot eat the whole
    # request budget: deadline check (45s) + this overshoot stays under the
    # 60s Vercel maxDuration, so the answer always reaches the browser.
    llm_timeout_seconds: int = 12
    # Wall-clock budget for one /query/generate request. Optional LLM stages
    # (clarity check, summary, agent rescue) are skipped once it is spent so
    # the request always answers within serverless limits (Vercel maxDuration).
    query_time_budget_seconds: int = 45
    # Ollama is a rescue fallback for cloud providers; if the local server
    # cannot answer that fast it would not have helped anyway.
    ollama_fallback_timeout_seconds: int = 8
    forwarded_allow_ips: str = "127.0.0.1"
    confirmation_ttl_minutes: int = 15
    # WhatsApp Cloud API bot (app/api/whatsapp.py). The first three values come
    # from the Meta app dashboard; without them the webhook stays disabled.
    whatsapp_verify_token: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_app_secret: str = ""
    # Public origin of THIS backend (e.g. https://api.example.com). Used to
    # build the magic links users tap to pair their WhatsApp number.
    whatsapp_connect_base_url: str = ""
    # Pairing links expire this fast - treat them like one-time passwords.
    whatsapp_connect_token_ttl_minutes: int = 15
    # Comma-separated allowlist of sender numbers (digits only, empty = open).
    # Intended for testing only; production auth is per-user via pairing.
    whatsapp_allowed_numbers: str = ""
    whatsapp_graph_version: str = "v21.0"
    # Wall-clock budget for answering one WhatsApp message (Meta retries
    # webhooks that respond too slowly, so this stays under /query's budget).
    whatsapp_time_budget_seconds: int = 30
    # Serverless platforms may freeze background threads right after the HTTP
    # response returns; flip this on there so processing finishes inside the
    # request instead (self-hosted Docker is fine with the default).
    whatsapp_inline_processing: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def whatsapp_configured(self) -> bool:
        return bool(
            self.whatsapp_verify_token
            and self.whatsapp_access_token
            and self.whatsapp_phone_number_id
        )

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
