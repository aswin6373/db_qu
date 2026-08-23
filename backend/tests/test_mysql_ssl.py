import pytest

from app.connectors.mysql import MySQLConnector


def test_default_ssl_mode_adds_no_extra_options():
    connector = MySQLConnector("h", 3306, "u", "p", "db")
    assert "ssl_disabled" not in connector.config
    assert "ssl_mode" not in connector.config


def test_required_ssl_mode_is_forwarded():
    connector = MySQLConnector("h", 3306, "u", "p", "db", ssl_mode="REQUIRED")
    assert connector.config["ssl_mode"] == "REQUIRED"


def test_disabled_ssl_mode_disables_tls():
    connector = MySQLConnector("h", 3306, "u", "p", "db", ssl_mode="DISABLED")
    assert connector.config["ssl_disabled"] is True
    assert "ssl_mode" not in connector.config


def test_invalid_ssl_mode_is_rejected():
    with pytest.raises(ValueError):
        MySQLConnector("h", 3306, "u", "p", "db", ssl_mode="SOMETING_ELSE")
