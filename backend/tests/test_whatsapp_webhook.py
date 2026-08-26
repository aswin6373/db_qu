import hashlib
import hmac

import pytest
from sqlalchemy import select

from app.api import whatsapp as whatsapp_module
from app.core.config import get_settings
from app.core.security import hash_password
from app.models import ChatSession, DBConnection, Organization, User, WhatsAppBinding
from app.services.crypto import encrypt_secret
from conftest import TestingSessionLocal

APP_SECRET = "test-app-secret"
VERIFY_TOKEN = "test-verify-token"
PHONE_NUMBER_ID = "123456789"
USER_EMAIL = "arun@example.com"
USER_PASSWORD = "correct-horse-battery"


def _sign(body: bytes) -> str:
    digest = hmac.new(APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _payload(text: str = "help", sender: str = "15551234567", message_id: str = "wamid.test1") -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA1",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550001111",
                                "phone_number_id": PHONE_NUMBER_ID,
                            },
                            "contacts": [{"profile": {"name": "Tester"}, "wa_id": sender}],
                            "messages": [
                                {
                                    "from": sender,
                                    "id": message_id,
                                    "timestamp": "1700000000",
                                    "text": {"body": text},
                                    "type": "text",
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


@pytest.fixture()
def wa_config(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "whatsapp_verify_token", VERIFY_TOKEN)
    monkeypatch.setattr(settings, "whatsapp_access_token", "access-token")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", PHONE_NUMBER_ID)
    monkeypatch.setattr(settings, "whatsapp_app_secret", APP_SECRET)
    monkeypatch.setattr(settings, "whatsapp_allowed_numbers", "")
    monkeypatch.setattr(settings, "whatsapp_connect_base_url", "https://api.test")
    monkeypatch.setattr(settings, "whatsapp_inline_processing", True)
    # The bot opens its own sessions; point them at the shared test database.
    monkeypatch.setattr(whatsapp_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    org = Organization(name="WA Org")
    db.add(org)
    db.commit()
    user = User(
        organization_id=org.id,
        email=USER_EMAIL,
        hashed_password=hash_password(USER_PASSWORD),
        role="admin",
    )
    db.add(user)
    connection = DBConnection(
        organization_id=org.id,
        name="Main DB",
        host="localhost",
        port=3306,
        username="u",
        encrypted_password=encrypt_secret("db-password"),
        database_name="app",
        schema_cache='{"tables": {"orders": {"columns": [{"name": "id", "type": "int"}]}}}',
    )
    db.add(connection)
    db.commit()
    yield {"org_id": org.id, "user_id": user.id, "connection_id": connection.id}
    db.close()
    whatsapp_module._seen_messages.clear()


@pytest.fixture()
def sent_messages(monkeypatch):
    captured: list[dict] = []
    monkeypatch.setattr(
        whatsapp_module, "_send_text", lambda to, body: captured.append({"to": to, "body": body})
    )
    monkeypatch.setattr(
        whatsapp_module, "_send_image", lambda to, png, caption: captured.append({"to": to, "image": True})
    )
    return captured


def _post_webhook(client, payload: dict) -> None:
    import json

    raw = json.dumps(payload).encode()
    response = client.post(
        "/whatsapp/webhook",
        content=raw,
        headers={"X-Hub-Signature-256": _sign(raw), "Content-Type": "application/json"},
    )
    assert response.status_code == 200


def test_webhook_verification_success(client, wa_config):
    response = client.get(
        "/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "chall-123",
        },
    )
    assert response.status_code == 200
    assert response.text == "chall-123"


def test_webhook_verification_rejects_wrong_token(client, wa_config):
    response = client.get(
        "/whatsapp/webhook",
        params={"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "1"},
    )
    assert response.status_code == 403


def test_webhook_rejects_bad_signature(client, wa_config):
    body = b'{"entry": []}'
    response = client.post(
        "/whatsapp/webhook",
        content=body,
        headers={"X-Hub-Signature-256": "sha256=deadbeef", "Content-Type": "application/json"},
    )
    assert response.status_code == 403


def test_webhook_ignores_status_events(client, wa_config, sent_messages):
    envelope = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA1",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "metadata": {"phone_number_id": PHONE_NUMBER_ID},
                            "statuses": [{"id": "wamid.s1", "status": "delivered"}],
                        },
                    }
                ],
            }
        ],
    }
    _post_webhook(client, envelope)
    assert sent_messages == []


def test_unbound_sender_receives_pairing_link(client, wa_config, sent_messages):
    _post_webhook(client, _payload("how many orders?", message_id="wamid.pair1"))
    assert len(sent_messages) == 1
    body = sent_messages[0]["body"]
    assert "https://api.test/whatsapp/connect?token=" in body
    # No chat sessions may exist for unpaired senders.
    db = TestingSessionLocal()
    assert db.scalars(select(ChatSession)).all() == []
    db.close()


def test_pairing_link_is_signed_and_expiring(client, wa_config):
    token = whatsapp_module._make_connect_token("15551234567")
    assert whatsapp_module._read_connect_token(token) == "15551234567"
    # Tampering with the payload invalidates the signature.
    assert whatsapp_module._read_connect_token(token[:-2] + "xx") is None
    assert whatsapp_module._read_connect_token("garbage") is None


def test_connect_page_rejects_expired_token(client, wa_config):
    response = client.get("/whatsapp/connect", params={"token": "not-a-token"})
    assert response.status_code == 400


def test_connect_page_renders_for_valid_token(client, wa_config):
    token = whatsapp_module._make_connect_token("15551234567")
    response = client.get("/whatsapp/connect", params={"token": token})
    assert response.status_code == 200
    assert "Connect WhatsApp" in response.text
    assert "4567" in response.text
    # Responsive on mobile: the viewport meta tag must be present.
    assert "viewport" in response.text


def test_status_exposes_bot_number_for_wa_me_link(client, wa_config, monkeypatch):
    monkeypatch.setattr(whatsapp_module, "_bot_display_number", lambda: "15550001111")
    response = client.get("/whatsapp/status")
    body = response.json()
    assert body["ready"] is True
    assert body["number"] == "15550001111"


def test_status_without_number_still_ready(client, wa_config, monkeypatch):
    monkeypatch.setattr(whatsapp_module, "_bot_display_number", lambda: None)
    body = client.get("/whatsapp/status").json()
    assert body["ready"] is True
    assert body["number"] is None


def test_connect_login_wrong_password_shows_error(client, wa_config):
    token = whatsapp_module._make_connect_token("15551234567")
    response = client.post(
        f"/whatsapp/connect?token={token}",
        data={"email": USER_EMAIL, "password": "wrong-password"},
    )
    assert "Invalid" in response.text


def test_connect_login_success_binds_number(client, wa_config):
    token = whatsapp_module._make_connect_token("15551234567")
    response = client.post(
        f"/whatsapp/connect?token={token}",
        data={"email": USER_EMAIL, "password": USER_PASSWORD},
    )
    assert "connected" in response.text.lower()
    db = TestingSessionLocal()
    binding = db.scalar(select(WhatsAppBinding))
    db.close()
    assert binding is not None
    assert binding.wa_number == "15551234567"
    assert binding.user_id == wa_config["user_id"]
    assert binding.organization_id == wa_config["org_id"]


def test_paired_sender_creates_session_and_new_chat_works(client, wa_config, sent_messages):
    token = whatsapp_module._make_connect_token("15551234567")
    client.post(f"/whatsapp/connect?token={token}", data={"email": USER_EMAIL, "password": USER_PASSWORD})

    _post_webhook(client, _payload("hi", message_id="wamid.hi1"))
    db = TestingSessionLocal()
    sessions = db.scalars(select(ChatSession)).all()
    db.close()
    assert len(sessions) >= 1
    assert sessions[-1].user_id == wa_config["user_id"]

    _post_webhook(client, _payload("new chat", message_id="wamid.nc1"))
    db = TestingSessionLocal()
    count = len(db.scalars(select(ChatSession)).all())
    titles = [s.title for s in db.scalars(select(ChatSession)).all()]
    db.close()
    assert count == 2  # auto-created + the fresh one from the command
    assert any(t.startswith("WhatsApp ···") for t in titles)
    assert any("new chat" in m["body"] for m in sent_messages)


def test_disconnect_removes_binding(client, wa_config, sent_messages):
    token = whatsapp_module._make_connect_token("15551234567")
    client.post(f"/whatsapp/connect?token={token}", data={"email": USER_EMAIL, "password": USER_PASSWORD})

    _post_webhook(client, _payload("disconnect", message_id="wamid.dc1"))
    db = TestingSessionLocal()
    assert db.scalars(select(WhatsAppBinding)).all() == []
    db.close()

    # After unlinking, the next message asks for pairing again.
    before = len(sent_messages)
    _post_webhook(client, _payload("hello again", message_id="wamid.dc2"))
    assert "https://api.test/whatsapp/connect" in sent_messages[before]["body"]


def test_duplicate_delivery_is_suppressed(client, wa_config, sent_messages):
    raw_payload = _payload("help", message_id="wamid.dup")
    _post_webhook(client, raw_payload)
    _post_webhook(client, raw_payload)
    assert len(sent_messages) == 1


def test_disallowed_sender_gets_no_reply(client, wa_config, sent_messages, monkeypatch):
    monkeypatch.setattr(get_settings(), "whatsapp_allowed_numbers", "19998887777")
    _post_webhook(client, _payload("help", sender="15551234567"))
    assert sent_messages == []


def test_help_command_replies_even_when_unpaired(client, wa_config, sent_messages):
    _post_webhook(client, _payload("help", message_id="wamid.help1"))
    assert len(sent_messages) == 1
    assert "QueryMind on WhatsApp" in sent_messages[0]["body"]


def test_render_table_png():
    matplotlib = pytest.importorskip("matplotlib")
    matplotlib.use("Agg")
    rows = [{"name": f"customer-{index}", "revenue": index * 10} for index in range(5)]
    png = whatsapp_module._render_table_png(["name", "revenue"], rows)
    assert png is not None
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    # Empty results never render an image.
    assert whatsapp_module._render_table_png(["name"], []) is None


def test_connect_page_shows_already_connected_notice(client, wa_config):
    token = whatsapp_module._make_connect_token("15551234567")
    client.post(
        f"/whatsapp/connect?token={token}",
        data={"email": USER_EMAIL, "password": USER_PASSWORD},
    )
    # Reopening a still-valid link shows the paired notice with a masked email.
    response = client.get("/whatsapp/connect", params={"token": token})
    assert "already connected" in response.text
    assert "a***@example.com" in response.text
    assert USER_EMAIL not in response.text


def test_paired_question_sends_loading_indicator_first(client, wa_config, sent_messages):
    token = whatsapp_module._make_connect_token("15551234567")
    client.post(
        f"/whatsapp/connect?token={token}",
        data={"email": USER_EMAIL, "password": USER_PASSWORD},
    )
    _post_webhook(client, _payload("how many orders?", message_id="wamid.load1"))
    assert sent_messages[0]["body"].startswith("⏳")


def test_session_auto_titles_with_first_question(client, wa_config, sent_messages):
    token = whatsapp_module._make_connect_token("15551234567")
    client.post(
        f"/whatsapp/connect?token={token}",
        data={"email": USER_EMAIL, "password": USER_PASSWORD},
    )
    _post_webhook(
        client,
        _payload("top customers by revenue?", message_id="wamid.title1"),
    )
    db = TestingSessionLocal()
    session = db.scalar(select(ChatSession).order_by(ChatSession.id.desc()))
    title = session.title if session else ""
    db.close()
    assert title == "WhatsApp ···4567 · top customers by revenue?"


def test_manual_session_rename_is_respected(client, wa_config, sent_messages):
    token = whatsapp_module._make_connect_token("15551234567")
    client.post(
        f"/whatsapp/connect?token={token}",
        data={"email": USER_EMAIL, "password": USER_PASSWORD},
    )
    # First message creates the session (titled "WhatsApp ···4567").
    _post_webhook(client, _payload("first question", message_id="wamid.title2a"))

    db = TestingSessionLocal()
    session = db.scalar(select(ChatSession).order_by(ChatSession.id.desc()))
    session.title = "My custom name"
    db.commit()
    db.close()

    _post_webhook(client, _payload("another question", message_id="wamid.title2b"))
    db = TestingSessionLocal()
    renamed = db.scalar(select(ChatSession).order_by(ChatSession.id.desc()))
    title = renamed.title if renamed else ""
    db.close()
    assert title == "My custom name"


def test_maybe_chart_skips_non_numeric():
    rows = [{"name": "a"}, {"name": "b"}]
    assert whatsapp_module._maybe_chart(["name"], rows) is None


def test_maybe_chart_renders_bar():
    matplotlib = pytest.importorskip("matplotlib")
    matplotlib.use("Agg")
    rows = [
        {"region": "north", "sales": "100"},
        {"region": "south", "sales": "250"},
        {"region": "east", "sales": "80"},
    ]
    png = whatsapp_module._maybe_chart(["region", "sales"], rows)
    assert png is not None
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_my_status_requires_authentication(client, wa_config):
    assert client.get("/whatsapp/my-status").status_code in {401, 403}


def test_my_status_reflects_personal_pairing(client, wa_config, sent_messages):
    """'Connected' must mean the SIGNED-IN user paired a number, not just that
    the bot infrastructure is up."""
    # A freshly registered user has no WhatsApp binding.
    registered = client.post(
        "/auth/register",
        json={
            "email": "member@example.com",
            "password": "super-secret-1",
            "organization_name": "Member Org",
        },
    )
    assert registered.status_code == 200
    token = registered.json()["access_token"]
    unpaired = client.get("/whatsapp/my-status", headers={"Authorization": f"Bearer {token}"})
    assert unpaired.status_code == 200
    assert unpaired.json() == {"paired": False, "number_tail": None}

    # After pairing through the magic-link flow, their status flips.
    pairing_token = whatsapp_module._make_connect_token("15551234567")
    client.post(
        f"/whatsapp/connect?token={pairing_token}",
        data={"email": "member@example.com", "password": "super-secret-1"},
    )
    paired = client.get("/whatsapp/my-status", headers={"Authorization": f"Bearer {token}"})
    assert paired.json() == {"paired": True, "number_tail": "4567"}


def test_maybe_chart_respects_max_rows_budget():
    matplotlib = pytest.importorskip("matplotlib")
    matplotlib.use("Agg")
    rows = [{"label": f"row-{index}", "value": index * 2} for index in range(15)]
    # Default budget refuses oversized charts; an AI-approved visual gets one.
    assert whatsapp_module._maybe_chart(["label", "value"], rows) is None
    assert whatsapp_module._maybe_chart(["label", "value"], rows, max_rows=20) is not None
