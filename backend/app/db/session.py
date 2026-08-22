from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

settings = get_settings()
database_url = settings.sqlalchemy_database_url
engine_args = {"pool_pre_ping": True}
if database_url.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}
elif database_url.startswith("postgresql"):
    engine_args["connect_args"] = {"sslmode": "require"} if settings.database_ssl else {}

engine = create_engine(database_url, **engine_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
