"""Tests for the AI visualization decision and conversation-memory helpers.

conftest sets LLM_PROVIDER=fallback, so every test here exercises the
heuristic/fallback paths - no network, deterministic results."""

from app.services.ai import chart_shape_ok, compress_history, decide_visualization


def test_decide_visualization_chart_for_numeric_shape():
    rows = [{"month": "Jan", "sales": 10}, {"month": "Feb", "sales": 20}, {"month": "Mar", "sales": 15}]
    assert decide_visualization("sales trend", ["month", "sales"], rows) == "chart"


def test_decide_visualization_table_for_text_data():
    rows = [{"name": "a", "bio": "b"}, {"name": "c", "bio": "d"}]
    assert decide_visualization("list users", ["name", "bio"], rows) == "table"


def test_decide_visualization_text_for_empty_result():
    assert decide_visualization("anything", ["x"], []) == "text"


def test_chart_shape_ok_respects_max_rows():
    rows = [{"label": f"r{i}", "value": i} for i in range(15)]
    assert not chart_shape_ok(["label", "value"], rows, max_rows=12)
    assert chart_shape_ok(["label", "value"], rows, max_rows=20)
    assert not chart_shape_ok(["label", "value"], rows[:1])  # single row: nothing to draw


def test_compress_history_without_ai_returns_none(monkeypatch):
    from app.services import ai
    monkeypatch.setattr(ai, "_gemini_generate", lambda prompt, eff=None: (_ for _ in ()).throw(RuntimeError("no ai")))
    assert compress_history(None, [{"role": "user", "content": "hello"}]) is None
