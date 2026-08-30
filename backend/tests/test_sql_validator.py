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


def test_sleep_function_is_blocked():
    result = validate_sql("SELECT SLEEP(10) FROM customers", SCHEMA)
    assert result.ok is False
    assert "SLEEP" in result.error


def test_load_file_function_is_blocked():
    result = validate_sql("SELECT id FROM customers WHERE LOAD_FILE('/etc/passwd') IS NOT NULL", SCHEMA)
    assert result.ok is False
    assert "LOAD_FILE" in result.error


def test_benchmark_function_is_blocked():
    result = validate_sql("SELECT id FROM customers WHERE BENCHMARK(50000000, MD5('x'))", SCHEMA)
    assert result.ok is False
    assert "BENCHMARK" in result.error


def test_update_without_where_is_rejected():
    result = validate_sql("UPDATE customers SET name = 'x'", SCHEMA)
    assert result.ok is False
    assert "WHERE" in result.error


def test_delete_without_where_is_rejected():
    result = validate_sql("DELETE FROM customers", SCHEMA)
    assert result.ok is False
    assert "WHERE" in result.error


def test_delete_with_where_still_requires_confirmation():
    result = validate_sql("DELETE FROM customers WHERE id = 1", SCHEMA)
    assert result.ok is True
    assert result.query_type == "delete"
    assert result.requires_confirmation is True


def test_banned_word_as_column_identifier_is_allowed():
    schema = {
        "tables": {
            "customers": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                    {"name": "create", "type": "datetime", "key": ""},
                ]
            }
        }
    }
    result = validate_sql("SELECT `create` FROM customers", schema)
    assert result.ok is True


def test_valid_insert_with_column_list_requires_confirmation():
    result = validate_sql(
        "INSERT INTO customers (name, email, city) VALUES ('QueryMind Test', 'qm@example.com', 'Testville')",
        SCHEMA,
    )
    assert result.ok is True
    assert result.query_type == "insert"
    assert result.requires_confirmation is True


def test_derived_subqueries_with_aliases_pass():
    multi_schema = {
        "tables": {
            "customers": {
                "columns": [{"name": "id"}, {"name": "name"}, {"name": "city"}]
            },
            "orders": {
                "columns": [{"name": "id"}, {"name": "customer_id"}, {"name": "total"}]
            },
            "order_items": {
                "columns": [{"name": "id"}, {"name": "order_id"}, {"name": "product_id"}, {"name": "quantity"}]
            },
            "products": {
                "columns": [{"name": "id"}, {"name": "name"}, {"name": "price"}]
            },
        }
    }
    sql = """
    SELECT * FROM (
        SELECT 'customer' AS category, c.name AS name, SUM(oi.quantity) AS total_quantity
        FROM customers c
        JOIN orders o ON c.id = o.customer_id
        JOIN order_items oi ON o.id = oi.order_id
        GROUP BY c.id, c.name
        ORDER BY total_quantity DESC
        LIMIT 1
    ) AS cust
    UNION ALL
    SELECT * FROM (
        SELECT 'product' AS category, p.name, SUM(oi.quantity) AS total_quantity
        FROM products p
        JOIN order_items oi ON p.id = oi.product_id
        GROUP BY p.id, p.name
        ORDER BY total_quantity DESC
        LIMIT 1
    ) AS prod
    """
    result = validate_sql(sql, multi_schema)
    assert result.ok is True, result.error


def test_cte_query_passes():
    schema = {
        "tables": {
            "customers": {
                "columns": [{"name": "id"}, {"name": "name"}]
            }
        }
    }
    sql = "WITH top_cust AS (SELECT id, name FROM customers) SELECT * FROM top_cust"
    result = validate_sql(sql, schema)
    assert result.ok is True, result.error
