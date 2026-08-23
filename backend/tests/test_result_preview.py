import json
from datetime import datetime
from decimal import Decimal

from app.api.query import serialize_result_preview


def test_preview_serializes_decimal_values():
    preview = serialize_result_preview(
        ["name", "total_spent"],
        [{"name": "Asha", "total_spent": Decimal("15200.50")}],
    )
    data = json.loads(preview)
    assert data["rows"][0]["total_spent"] == "15200.50"


def test_preview_serializes_datetime_values():
    preview = serialize_result_preview(
        ["created_at"],
        [{"created_at": datetime(2026, 8, 23, 10, 30, 0)}],
    )
    data = json.loads(preview)
    assert data["rows"][0]["created_at"] == "2026-08-23 10:30:00"


def test_preview_limits_rows_to_five():
    rows = [{"id": i} for i in range(20)]
    data = json.loads(serialize_result_preview(["id"], rows))
    assert len(data["rows"]) == 5
