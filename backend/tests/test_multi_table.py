import pytest

from types import SimpleNamespace

import app.services.ai as ai
from app.services.ai import QueryUnderstandingError, generate_sql

SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI", "nullable": False},
                {"name": "name", "type": "varchar", "key": "", "nullable": False},
            ]
        }
    }
}

MULTI_SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI", "nullable": False},
                {"name": "name", "type": "varchar", "key": "", "nullable": False},
            ]
        },
        "products": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI", "nullable": False},
                {"name": "name", "type": "varchar", "key": "", "nullable": False},
                {"name": "price", "type": "decimal", "key": "", "nullable": False},
            ]
        },
        "orders": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI", "nullable": False},
                {"name": "customer_id", "type": "int", "key": "MUL", "nullable": False},
                {"name": "product_id", "type": "int", "key": "MUL", "nullable": False},
            ]
        }
    }
}


def test_multi_table_question_reaches_llm_without_single_table_block(monkeypatch):
    captured = {}

    def fake_gemini(prompt, eff=None):
        captured["prompt"] = prompt
        return "```sql\nSELECT c.name, p.name FROM customers c JOIN orders o ON o.customer_id = c.id JOIN products p ON p.id = o.product_id\n```"

    monkeypatch.setattr(ai, "_gemini_generate", fake_gemini)
    monkeypatch.setattr(
        ai,
        "get_settings",
        lambda: SimpleNamespace(
            llm_provider="gemini",
            gemini_api_key="test",
            gemini_model="test",
            ollama_base_url="http://localhost",
            ollama_model="test",
        ),
    )

    sql = generate_sql("tell me the customer name and product name", MULTI_SCHEMA)
    assert sql.upper().startswith("SELECT")
    assert "JOIN" in sql.upper()
    assert "customers" in captured["prompt"]


def test_multi_table_question_still_blocked_in_fallback_mode():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("tell me the customer name and product name", MULTI_SCHEMA)
    assert "multiple possible tables" in str(exc.value)


def test_join_sql_still_validated_against_schema(monkeypatch):
    # LLM hallucinating an unknown table must still be rejected by the validator.
    monkeypatch.setattr(ai, "_gemini_generate", lambda prompt, eff=None: "SELECT * FROM secret_table")
    monkeypatch.setattr(
        ai,
        "get_settings",
        lambda: SimpleNamespace(
            llm_provider="gemini",
            gemini_api_key="test",
            gemini_model="test",
            ollama_base_url="http://localhost",
            ollama_model="test",
        ),
    )

    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("tell me the customer name and product name", MULTI_SCHEMA)
    assert "Unknown table" in str(exc.value)