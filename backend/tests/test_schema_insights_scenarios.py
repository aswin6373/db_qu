import pytest
from app.services.schema_insights import build_schema_insights

# ---------------------------------------------------------
# Test Cases Mapped from user requests:
# 1) Difference in recommendations for same schema (path) but different readiness (aptitude) scores.
# 2) Different schemas (paths) - how suggestions and relationship inference works.
# 3) Quality of recommendations (severity validation, limits, score weighting).
# 4) Metadata-focused check (no tables / empty tables).
# 5) Edge cases (circular relationships, case sensitivity, naming patterns).
# ---------------------------------------------------------

def test_same_path_different_readiness_scores():
    """
    Test Case 1: Determine the difference in recommendation / score for the same basic database topology
    (i.e. same tables and columns) but with varying schema design qualities (e.g. keys and types).
    """
    # Schema A: High Quality (Proper PKs, bounded VARCHAR columns, key relationships)
    schema_high_quality = {
        "tables": {
            "users": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                    {"name": "email", "type": "varchar", "key": ""},
                ]
            },
            "orders": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                    {"name": "user_id", "type": "int", "key": "MUL"},
                    {"name": "total", "type": "decimal", "key": ""},
                ]
            }
        }
    }
    
    # Schema B: Low Quality (No PKs, text types for email/phone, unbounded types)
    schema_low_quality = {
        "tables": {
            "users": {
                "columns": [
                    {"name": "id", "type": "int", "key": ""},
                    {"name": "email", "type": "text", "key": ""},
                ]
            },
            "orders": {
                "columns": [
                    {"name": "id", "type": "int", "key": ""},
                    {"name": "user_id", "type": "int", "key": ""},
                    {"name": "total", "type": "decimal", "key": ""},
                ]
            }
        }
    }

    insights_high = build_schema_insights(schema_high_quality)
    insights_low = build_schema_insights(schema_low_quality)

    # 1. Compare readiness scores (Aptitude scores)
    assert insights_high["score"] > insights_low["score"]
    
    # 2. Schema A should have a high score and no warnings about missing PKs
    assert insights_high["score"] >= 80
    assert not any("primary key" in s["title"].lower() for s in insights_high["suggestions"])
    
    # 3. Schema B should have suggestions to add primary keys (severity: high) and use bounded types (severity: low)
    titles_low = [s["title"].lower() for s in insights_low["suggestions"]]
    assert any("add a primary key" in t for t in titles_low)
    assert any("use a bounded type" in t for t in titles_low)


def test_different_paths_suggestions():
    """
    Test Case 2: Different database schemas (paths) - check that suggestions fit their specific context.
    """
    # Path A: Single table DB (e.g. logging/auditing DB). Shouldn't complain about relationships.
    schema_single = {
        "tables": {
            "system_logs": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                    {"name": "message", "type": "text", "key": ""},
                    {"name": "created_at", "type": "datetime", "key": ""},
                ]
            }
        }
    }
    
    # Path B: Disconnected Multi-table DB (No _id columns present)
    schema_disconnected = {
        "tables": {
            "users": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                    {"name": "name", "type": "varchar", "key": ""},
                ]
            },
            "products": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                    {"name": "title", "type": "varchar", "key": ""},
                ]
            }
        }
    }

    insights_single = build_schema_insights(schema_single)
    insights_disconnected = build_schema_insights(schema_disconnected)

    # Single table shouldn't complain about relationships
    assert not any("relationship" in s["title"].lower() for s in insights_single["suggestions"])
    
    # Disconnected tables should trigger a "Review relationships" suggestion
    assert any("review relationships" in s["title"].lower() for s in insights_disconnected["suggestions"])


def test_quality_of_recommendations():
    """
    Test Case 3: Quality of suggestions (severity levels, limit on suggestions, score bounds).
    """
    # Create a schema with many low-quality practices to trigger lots of suggestions
    bad_schema = {
        "tables": {
            f"table_{i}": {
                "columns": [
                    {"name": "id", "type": "int", "key": ""}, # Missing PK
                    {"name": "email", "type": "text", "key": ""}, # Unbounded type
                    {"name": "phone", "type": "longtext", "key": ""}, # Unbounded type
                    {"name": "unmatched_id", "type": "int", "key": ""}, # Unmatched ID
                ]
            } for i in range(5)
        }
    }

    insights = build_schema_insights(bad_schema)

    # 1. Suggestions should be capped at 8 max to avoid UI clutter
    assert len(insights["suggestions"]) <= 8
    
    # 2. Verify all suggestion fields exist and are structured correctly
    for suggestion in insights["suggestions"]:
        assert "severity" in suggestion
        assert "title" in suggestion
        assert "detail" in suggestion
        assert suggestion["severity"] in {"high", "medium", "low"}

    # 3. Score must be bounded between 5 and 98
    assert 5 <= insights["score"] <= 98


def test_data_present_vs_not_present():
    """
    Test Case 4: Cases where data is present vs not present in DB.
    Verify that insights work purely off schema structure and handle empty schemas.
    """
    # Empty schema (0 tables)
    empty_schema = {"tables": {}}
    insights_empty = build_schema_insights(empty_schema)
    
    assert insights_empty["score"] == 0
    assert insights_empty["summary"] == "No schema has been discovered yet."
    assert insights_empty["table_count"] == 0

    # Non-empty schema metadata. Whether these tables are empty or have millions of rows,
    # the schema insights score and suggestions must compute identically.
    schema_metadata = {
        "tables": {
            "users": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                ]
            }
        }
    }
    insights_meta = build_schema_insights(schema_metadata)
    assert insights_meta["score"] > 0
    assert insights_meta["table_count"] == 1


def test_additional_edge_cases():
    """
    Test Case 5: Identify other edge cases (circular referencing, case sensitivity, pluralization bugs).
    """
    # 1. Self-referencing column (e.g. parent_id in categories table)
    schema_self_ref = {
        "tables": {
            "categories": {
                "columns": [
                    {"name": "id", "type": "int", "key": "PRI"},
                    {"name": "parent_id", "type": "int", "key": ""},
                ]
            }
        }
    }
    insights_self_ref = build_schema_insights(schema_self_ref)
    
    # Self-reference should not create a relationship edge to itself
    assert len(insights_self_ref["edges"]) == 0

    # 2. Case insensitivity in keys and types
    schema_case_insensitive = {
        "tables": {
            "users": {
                "columns": [
                    {"name": "id", "type": "int", "key": "pri"}, # Lowercase key
                    {"name": "email", "type": "TEXT", "key": ""}, # Uppercase type
                ]
            }
        }
    }
    insights_case = build_schema_insights(schema_case_insensitive)
    # The 'pri' key should be normalized and recognized as primary key (no missing PK suggestion)
    assert not any("primary key" in s["title"].lower() for s in insights_case["suggestions"])
    # The 'TEXT' type should trigger the low-severity suggestion for bounded type
    assert any("bounded type" in s["title"].lower() for s in insights_case["suggestions"])
