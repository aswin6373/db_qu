import pytest

from app.services.ai import QueryUnderstandingError, generate_sql

SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI", "extra": "auto_increment", "nullable": False},
                {"name": "name", "type": "varchar", "key": "", "nullable": False},
                {"name": "email", "type": "varchar", "key": "", "nullable": False},
            ]
        }
    }
}


def test_add_column_request_returns_alter_guidance():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("add a new column phone in customers", SCHEMA)
    message = str(exc.value)
    assert "blocked" in message
    assert "ALTER TABLE `customers` ADD COLUMN `phone`" in message


def test_add_column_with_type_is_kept():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("customers add column age int", SCHEMA)
    message = str(exc.value)
    assert "ADD COLUMN `age` INT" in message


def test_drop_column_request_returns_alter_guidance():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("drop the column email from customers", SCHEMA)
    assert "ALTER TABLE `customers` DROP COLUMN `email`" in str(exc.value)


def test_create_table_request_is_rejected_with_explanation():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("create a table called orders", SCHEMA)
    assert "Schema changes" in str(exc.value)


def test_add_row_request_is_not_treated_as_schema_change():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("add a customer named Rahul", SCHEMA)
    assert "ALTER TABLE" not in str(exc.value)


def test_natural_phrasing_put_a_column_is_understood():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("put a phone column in customers", SCHEMA)
    assert "ADD COLUMN `phone`" in str(exc.value)


def test_name_before_column_word_is_understood():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("customers should have a phone column", SCHEMA)
    assert "ADD COLUMN `phone`" in str(exc.value)


def test_insert_a_column_is_not_treated_as_row_insert():
    with pytest.raises(QueryUnderstandingError) as exc:
        generate_sql("insert a column called fax in customers", SCHEMA)
    assert "ADD COLUMN `fax`" in str(exc.value)


def test_read_question_mentioning_column_stays_a_read():
    sql = generate_sql("show customers with the city column", SCHEMA)
    assert sql.upper().startswith("SELECT")
    assert "ALTER TABLE" not in sql.upper()
