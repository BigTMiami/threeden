"""The FastAPI application. Caddy sends /api/* here, so every route starts with /api."""

from fastapi import FastAPI
from fastapi.routing import APIRoute

from app import health
from app.accounts import routes as me
from app.auth import routes as auth
from app.core.openapi import simplify_optionals
from app.core.origin import OriginCheckMiddleware
from app.core.settings import get_settings
from app.core.version import VERSION
from app.events import routes as events
from app.hello import routes as hello
from app.spaces import routes as spaces

settings = get_settings()


def operation_id(route: APIRoute) -> str:
    """Each endpoint's OpenAPI id is its function's name ("answer_event"), so the
    iOS app's generated client reads well."""
    return route.name


app = FastAPI(
    title="3den API",
    version=VERSION,
    # Interactive docs only in development.
    docs_url="/api/docs" if settings.is_development else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.is_development else None,
    generate_unique_id_function=operation_id,
)

_fastapi_openapi = app.openapi


def openapi() -> dict:
    """FastAPI's OpenAPI document, with optional fields made plain (app/core/openapi.py)."""
    if app.openapi_schema is None:
        app.openapi_schema = simplify_optionals(_fastapi_openapi())
    return app.openapi_schema


app.openapi = openapi  # type: ignore[method-assign]

app.add_middleware(OriginCheckMiddleware)

app.include_router(health.router)
app.include_router(hello.router)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(spaces.router)
app.include_router(events.router)
