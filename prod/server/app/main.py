"""The FastAPI application. Caddy sends /api/* here, so every route starts with /api."""

from fastapi import FastAPI

from app import health
from app.accounts import routes as me
from app.auth import routes as auth
from app.core.origin import OriginCheckMiddleware
from app.core.settings import get_settings
from app.hello import routes as hello

settings = get_settings()

app = FastAPI(
    title="3den API",
    version="0.1.0",
    # Interactive docs only in development.
    docs_url="/api/docs" if settings.is_development else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.is_development else None,
)

app.add_middleware(OriginCheckMiddleware)

app.include_router(health.router)
app.include_router(hello.router)
app.include_router(auth.router)
app.include_router(me.router)
