import pytest

from app.services.ai import QueryUnderstandingError, generate_sql

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


def test_request_must_match_discovered_table():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("create a new employee", SCHEMA)

    assert "Available tables: customers" in str(exc.value)


def test_singular_table_name_matches_plural_table():
    sql = generate_sql("show the customer list", SCHEMA)

    assert sql == "SELECT * FROM customers LIMIT 50"
