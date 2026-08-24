from app.services.sql_validator import validate_sql

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


def test_valid_select_passes():
    result = validate_sql("SELECT id, name FROM customers", SCHEMA)
    assert result.ok is True
    assert result.query_type == "select"
    assert result.requires_confirmation is False


def test_count_aggregate_passes():
    result = validate_sql("SELECT COUNT(*) FROM customers", SCHEMA)
    assert result.ok is True


def test_aggregate_functions_with_alias_pass():
    for sql in (
        "SELECT SUM(id) FROM customers",
        "SELECT AVG(id) AS avg_id FROM customers",
        "select count(*) as total from customers where city = 'Berlin'",
    ):
        result = validate_sql(sql, SCHEMA)
        assert result.ok is True, sql


def test_drop_table_is_rejected():
    result = validate_sql("DROP TABLE customers", SCHEMA)
    assert result.ok is False


def test_nonexistent_column_is_rejected():
    result = validate_sql("SELECT missing_column FROM customers", SCHEMA)
    assert result.ok is False
    assert "Unknown column" in result.error


def test_multi_statement_injection_is_rejected():
    result = validate_sql("SELECT id FROM customers; DROP TABLE customers", SCHEMA)
    assert result.ok is False


def test_valid_update_requires_confirmation():
    result = validate_sql("UPDATE customers SET name = 'Aswin' WHERE id = 1", SCHEMA)
    assert result.ok is True
    assert result.query_type == "update"
    assert result.requires_confirmation is True


def test_valid_insert_with_column_list_requires_confirmation():
    result = validate_sql(
        "INSERT INTO customers (name, email, city) VALUES ('QueryMind Test', 'qm@example.com', 'Testville')",
        SCHEMA,
    )
    assert result.ok is True
    assert result.query_type == "insert"
    assert result.requires_confirmation is True
