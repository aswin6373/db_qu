from app.services.ai import _sanitize_summary, summarize_result


def test_select_summary_claiming_a_drop_is_replaced():
    out = _sanitize_summary("The phone column has been successfully dropped from the customers table.", "select", 1)
    assert "dropped" not in out.lower()
    assert "nothing was changed" in out.lower()


def test_select_summary_claiming_an_update_is_replaced():
    out = _sanitize_summary("Successfully updated the records.", "select", 0)
    assert "nothing was changed" in out.lower()


def test_real_write_summary_is_kept():
    out = _sanitize_summary("1 row inserted successfully.", "insert", 0)
    assert "inserted" in out.lower()


def test_normal_select_summary_is_untouched():
    summary = summarize_result(
        "show all customers",
        ["name"],
        [{"name": "Asha"}],
        requires_confirmation=False,
        query_type="select",
    )
    assert summary == "Query finished — 1 row(s) returned."
