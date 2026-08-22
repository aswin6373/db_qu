from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, chat, connections, organizations, query
from app.db.session import Base, engine
from app.models import entities

Base.metadata.create_all(bind=engine)

app = FastAPI(title="QueryMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(connections.router)
app.include_router(query.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "querymind"}
