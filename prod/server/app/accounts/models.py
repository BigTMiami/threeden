import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.ids import uuid7


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        # Email is unique whatever its capitals; it's kept as typed.
        Index("accounts_email_lower_key", text("lower(email)"), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    username: Mapped[str] = mapped_column(String(20), unique=True)  # always lowercase
    email: Mapped[str] = mapped_column(String(254))
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
