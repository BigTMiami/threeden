"""The Origin check (docs/architecture.md §8.1).

Requests that change things (POST, PUT, PATCH, DELETE) must come from the
site itself. Browsers always send an Origin header on those; it must match
the address the request came in on (or one listed in EXTRA_ALLOWED_ORIGINS).
A request without Origin is allowed only if it doesn't carry the session
cookie: that's an app (bearer token), not a browser riding on a cookie.
Together with SameSite=Lax this blocks cross-site request forgery.
"""

from urllib.parse import urlsplit

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.settings import get_settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class OriginCheckMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in SAFE_METHODS:
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in scope["headers"]}
        problem = origin_problem(headers)
        if problem:
            response = JSONResponse({"detail": problem}, status_code=403)
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


def origin_problem(headers: dict[str, str]) -> str | None:
    settings = get_settings()
    origin = headers.get("origin")
    if origin is None:
        if has_session_cookie(headers.get("cookie", ""), settings.session_cookie_name):
            return "Missing Origin header."
        return None
    origin = origin.rstrip("/")
    if origin in settings.allowed_origins:
        return None
    if urlsplit(origin).netloc and urlsplit(origin).netloc == headers.get("host"):
        return None
    return "Requests from other sites aren't allowed."


def has_session_cookie(cookie_header: str, name: str) -> bool:
    return any(part.strip().startswith(f"{name}=") for part in cookie_header.split(";"))
