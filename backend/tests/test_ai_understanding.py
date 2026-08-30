from types import SimpleNamespace
import pytest

from app.services import ai
from app.services.ai import AIConfig, QueryUnderstandingError, generate_sql

SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI"},
                {"name": "name", "type": "varchar", "key": ""},
                {"name": "email", "type": "varchar", "key": ""},
                {"name": "city", "type": "varchar", "key": ""},
            ]
        }
    }
}


def test_generate_sql_uses_ai_model(monkeypatch):
    monkeypatch.setattr(ai, "_gemini_generate", lambda prompt, eff=None: "SELECT * FROM customers LIMIT 50")
    config = AIConfig(provider="gemini", api_key="fake-key")

    sql = generate_sql("show all customers", SCHEMA, ai_config=config)
    assert sql == "SELECT * FROM customers LIMIT 50"


def test_ai_generation_validates_against_discovered_schema(monkeypatch):
    # If the model hallucinates an unknown table, validator must reject it.
    monkeypatch.setattr(ai, "_gemini_generate", lambda prompt, eff=None: "SELECT * FROM unknown_table")
    config = AIConfig(provider="gemini", api_key="fake-key")

    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("show all secrets", SCHEMA, ai_config=config)
    assert "Unknown table" in str(exc.value)


def test_ai_generation_reports_missing_or_failed_ai_provider(monkeypatch):
    # Without a valid AI key or working provider, it raises a clear error instead of generating dummy SQL
    def _fail_gemini(prompt, eff=None):
        raise RuntimeError("Gemini API key is not configured")

    monkeypatch.setattr(ai, "_gemini_generate", _fail_gemini)
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("show the customer list", SCHEMA)
    assert "Gemini API key is not configured" in str(exc.value)


def test_ai_generation_handles_conversational_meta_response(monkeypatch):
    monkeypatch.setattr(ai, "_gemini_generate", lambda prompt, eff=None: "META: Hello! How can I help you today?")
    config = AIConfig(provider="gemini", api_key="fake-key")

    with pytest.raises(ai.SchemaAnswer) as exc:
        generate_sql("hello", SCHEMA, ai_config=config)
    assert "Hello!" in str(exc.value)
