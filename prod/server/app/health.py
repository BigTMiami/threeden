"""GET /api/health: is the API up, and can it reach the database?"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.version import VERSION

router = APIRouter()


@router.get("/api/health")
def health(response: Response, db: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    """Whether the API can reach the database, and which version is running."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", "database": "unavailable", "version": VERSION}
    return {"status": "ok", "database": "ok", "version": VERSION}
