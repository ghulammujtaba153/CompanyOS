from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.db.migrate import ensure_schema
from app.db.session import get_engine, get_session_factory
from app.routers import agency, admin, ai, ai_platform, analytics, audit, auth, billing, clients, communications, contracts, documents, finance, governance, governance_api, health, hiring, log_classification, notifications, organizations, people_ops, projects, time_entries, work
from app.routers.clients import engagements_router
from app.services.seed import seed_demo_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    if settings.database_url.strip():
        engine = get_engine()
        if settings.auto_create_schema:
            from app.db import models  # noqa: F401

            ensure_schema(engine)
        if settings.seed_on_startup:
            db = get_session_factory()()
            try:
                from app.services.seed import ensure_departments_for_existing, ensure_platform_admin

                seed_demo_if_empty(db)
                ensure_platform_admin(db)
                ensure_departments_for_existing(db)
            finally:
                db.close()
        # Warm the Neon pool so the first login is not a cold-start hit.
        try:
            with engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
        except Exception:
            pass
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="CompanyOS FastAPI backend — Neon Postgres auth, societies, and clients.",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health.router)
    application.include_router(auth.router, prefix="/api/v1")
    application.include_router(organizations.router, prefix="/api/v1")
    application.include_router(clients.router, prefix="/api/v1")
    application.include_router(engagements_router, prefix="/api/v1")
    application.include_router(contracts.router, prefix="/api/v1")
    application.include_router(work.router, prefix="/api/v1")
    application.include_router(time_entries.router, prefix="/api/v1")
    application.include_router(communications.router, prefix="/api/v1")
    application.include_router(people_ops.router, prefix="/api/v1")
    application.include_router(documents.router, prefix="/api/v1")
    application.include_router(billing.router, prefix="/api/v1")
    application.include_router(finance.router, prefix="/api/v1")
    application.include_router(audit.router, prefix="/api/v1")
    application.include_router(analytics.router, prefix="/api/v1")
    application.include_router(ai_platform.router, prefix="/api/v1")
    application.include_router(governance_api.router, prefix="/api/v1")
    application.include_router(notifications.router, prefix="/api/v1")
    application.include_router(log_classification.router, prefix="/api/v1")
    application.include_router(admin.router, prefix="/api/v1")
    # Legacy demo routers (in-memory) kept for GenAI / work surfaces until fully migrated.
    application.include_router(agency.router, prefix="/api/v1/demo")
    application.include_router(projects.router, prefix="/api/v1/demo")
    application.include_router(hiring.router, prefix="/api/v1/demo")
    application.include_router(governance.router, prefix="/api/v1/demo")
    application.include_router(ai.router, prefix="/api/v1/demo")

    @application.get("/")
    def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "version": __version__,
            "docs": "/docs",
            "health": "/health",
        }

    return application


app = create_app()
