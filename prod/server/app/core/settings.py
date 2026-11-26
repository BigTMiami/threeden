"""Settings, read from the environment (prod/.env locally)."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    test_database_url: str | None = None
    app_env: str = "development"
    session_secret: str

    # Sessions (docs/architecture.md §8.1)
    session_cookie_name: str = "threeden_session"
    session_days: int = 90
    # Origins allowed to make changes besides the site's own (comma-separated).
    extra_allowed_origins: str = ""

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def cookie_secure(self) -> bool:
        # Plain http in development (localhost, and the iPhone over Wi-Fi).
        return not self.is_development

    @property
    def allowed_origins(self) -> set[str]:
        return {o.strip().rstrip("/") for o in self.extra_allowed_origins.split(",") if o.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  (values come from the environment)
