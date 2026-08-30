import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-with-at-least-32-characters!"
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["GEMINI_API_KEY"] = "test-gemini-key"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app
from app.services import ai

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def default_mock_ai(monkeypatch):
    def mock_gemini(prompt: str, eff=None):
        lowered = prompt.lower()
        if "intent checker" in lowered:
            if "important stuff" in lowered:
                return '{"can_execute": false, "question": "Do you mean the customers table?"}'
            return '{"can_execute": true, "analytical": false}'
        if "summarize this database query" in lowered:
            return "Query returned results successfully."
        if "running summary" in lowered or "merge everything above" in lowered:
            return "- Discussed customers table"

        user_question = lowered
        if "latest user request:" in lowered:
            user_question = lowered.split("latest user request:", 1)[1].strip()

        if any(w in user_question for w in ["delete", "remove"]):
            return "DELETE FROM customers WHERE id = 1"
        if any(w in user_question for w in ["update", "modify", "change", "set"]) and not any(w in user_question for w in ["show", "view", "see", "display"]):
            return "UPDATE customers SET name = 'Albin' WHERE id = 1"
        if any(w in user_question for w in ["insert", "add", "create"]) and not any(w in user_question for w in ["show", "view", "see", "display"]):
            return "INSERT INTO customers (name) VALUES ('Albin')"
        if "orders" in user_question:
            return "SELECT * FROM orders LIMIT 50"
        if "employees" in user_question:
            return "SELECT * FROM employees LIMIT 50"
        if "customers" in user_question:
            return "SELECT * FROM customers LIMIT 50"
        return "SELECT 1"

    monkeypatch.setattr(ai, "_gemini_generate", mock_gemini)


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
