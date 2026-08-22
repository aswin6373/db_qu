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


def test_insert_asks_for_missing_customer_details():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("insert another customer name is arun", SCHEMA)

    assert "I need more details" in str(exc.value)
    assert "email" in str(exc.value)
    assert "city" in str(exc.value)


def test_complete_insert_uses_real_values():
    sql = generate_sql("insert customer name is arun email is arun@example.com city is kochi", SCHEMA)

    assert sql == "INSERT INTO customers (name, email, city) VALUES ('arun', 'arun@example.com', 'kochi')"
