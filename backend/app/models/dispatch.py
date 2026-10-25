from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Service(str, Enum):
    FIRE = "fire"
    POLICE = "police"
    MEDICAL = "medical"


class ResponseStatus(str, Enum):
    """Operational response steps, in order. Separate from the intake/review IncidentStatus."""

    REPORTED = "reported"
    ASSIGNED = "assigned"
    ACCEPTED = "accepted"
    EN_ROUTE = "en_route"
    ON_SCENE = "on_scene"
    ASSISTING = "assisting"
    RESOLVED = "resolved"


RESPONSE_STEPS = list(ResponseStatus)


def _now() -> datetime:
    # Set in Python: SQLite's CURRENT_TIMESTAMP has one-second resolution, which would tie quick successive events.
    return datetime.now(timezone.utc)


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    service: Mapped[Service] = mapped_column(SqlEnum(Service, native_enum=False), nullable=False)
    agency: Mapped[str] = mapped_column(String(255), nullable=False)
    # Last position the dispatcher set; null when unknown. Never estimated.
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    out_of_service: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("incident_id", "unit_id", name="uq_assignment_incident_unit"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_id: Mapped[str] = mapped_column(ForeignKey("units.id"), nullable=False, index=True)
    service: Mapped[Service] = mapped_column(SqlEnum(Service, native_enum=False), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class ResponseEvent(Base):
    __tablename__ = "response_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_id: Mapped[str | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    status: Mapped[ResponseStatus] = mapped_column(SqlEnum(ResponseStatus, native_enum=False), nullable=False)
    actor: Mapped[str] = mapped_column(String(50), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
