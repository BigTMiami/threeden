from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.db import get_db
from app.core.version import VERSION
from app.main import app


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "version": VERSION}


class _BrokenSession:
    def execute(self, *args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("database is down"))


def test_health_reports_database_down() -> None:
    app.dependency_overrides[get_db] = lambda: _BrokenSession()
    try:
        response = TestClient(app).get("/api/health")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unavailable", "version": VERSION}
