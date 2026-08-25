from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    organization_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    organization_id: int
    role: str


class OrganizationResponse(BaseModel):
    id: int
    name: str


class ConnectionCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    host: str
    port: int = 3306
    username: str
    password: str
    database_name: str
    ssl_mode: Literal["PREFERRED", "REQUIRED", "DISABLED"] = "PREFERRED"
    test_live: bool = True
    ssh_host: str | None = None
    ssh_port: int = 22
    ssh_username: str | None = None
    ssh_password: str | None = None  # Can be private key or password


class ConnectionResponse(BaseModel):
    id: int
    name: str
    host: str
    port: int
    username: str
    database_name: str
    ssl_mode: str = "PREFERRED"
    ssh_host: str | None = None
    ssh_port: int | None = None
    ssh_username: str | None = None


class QueryGenerateRequest(BaseModel):
    connection_id: int | None = None
    question: str = Field(min_length=2)
    session_id: int | None = None


class QueryGenerateResponse(BaseModel):
    query_id: int = 0
    sql: str = ""
    query_type: str = "unknown"
    requires_confirmation: bool = False
    summary: str
    columns: list[str] = []
    rows: list[dict] = []
    needs_clarification: bool = False


class SchemaEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    column: str

    model_config = {"populate_by_name": True}


class SchemaSuggestion(BaseModel):
    severity: str
    title: str
    detail: str


class SchemaInsightsResponse(BaseModel):
    score: int
    summary: str
    table_count: int
    column_count: int
    key_count: int
    relationship_count: int
    edges: list[SchemaEdge]
    suggestions: list[SchemaSuggestion]


class DashboardResponse(BaseModel):
    organization: OrganizationResponse
    connection_count: int
    query_count: int
    recent_activity: list[dict]


class ChatSessionCreate(BaseModel):
    title: str = Field(default="New chat", max_length=255)
    connection_id: int | None = None


class ChatSessionUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class ChatSessionResponse(BaseModel):
    id: int
    title: str
    connection_id: int | None = None
    connection_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    message_count: int = 0


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    sql: str | None = None
    query_id: int | None = None
    result: dict | None = None
    created_at: datetime | None = None
