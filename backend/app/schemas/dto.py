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
    test_live: bool = True


class ConnectionResponse(BaseModel):
    id: int
    name: str
    host: str
    port: int
    username: str
    database_name: str


class QueryGenerateRequest(BaseModel):
    connection_id: int | None = None
    question: str = Field(min_length=2)


class QueryGenerateResponse(BaseModel):
    query_id: int
    sql: str
    query_type: str
    requires_confirmation: bool
    summary: str
    columns: list[str] = []
    rows: list[dict] = []


class DashboardResponse(BaseModel):
    organization: OrganizationResponse
    connection_count: int
    query_count: int
    recent_activity: list[dict]
