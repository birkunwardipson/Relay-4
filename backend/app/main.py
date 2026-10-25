from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import sessionmaker

from app.api.dispatch import router as dispatch_router
from app.api.elevenlabs import router as elevenlabs_router
from app.api.incidents import router as incidents_router
from app.api.auth import router as auth_router
from app.config import Settings, get_settings
from app.database import Base, make_engine
from app.models import (  # noqa: F401 - register all models before create_all
    Assignment,
    ConversationBinding,
    Incident,
    IncidentEvidence,
    IncidentHistory,
    ProcessedToolEvent,
    ResponseEvent,
    Unit,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    engine = make_engine(app_settings.database_url)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(
        title="Relay4 MVP 1 Backend",
        description="Synthetic emergency voice intake and incident coordination API.",
        version="0.1.0",
    )
    app.state.settings = app_settings
    app.state.engine = engine
    app.state.session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    if app_settings.configured_cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=app_settings.configured_cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Content-Type", "X-Admin-API-Key", "Idempotency-Key", app_settings.elevenlabs_webhook_header],
        )

    app.include_router(incidents_router)
    app.include_router(elevenlabs_router)
    app.include_router(dispatch_router)
    app.include_router(auth_router)

    @app.get("/health", tags=["system"])
    async def health():
        return {"status": "ok", "service": "relay4-backend", "simulation_mode": app_settings.simulation_mode}

    return app


app = create_app()
