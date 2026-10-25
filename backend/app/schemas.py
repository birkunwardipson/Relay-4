from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import EvidenceVerificationStatus, IncidentStatus, ResponseStatus, Service, Unit


class IncidentFields(BaseModel):
    incident_type: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=10000)
    location: str | None = Field(default=None, max_length=500)
    landmark: str | None = Field(default=None, max_length=255)
    hazard: str | None = Field(default=None, max_length=255)
    people_count: int | None = Field(default=None, ge=0, le=100000)
    injuries: str | None = Field(default=None, max_length=5000)
    location_confirmed: bool | None = None


class IncidentCreate(IncidentFields):
    pass


class IncidentPatch(IncidentFields):
    status: IncidentStatus | None = None


class WebhookToolPayload(IncidentFields):
    event_id: str = Field(min_length=1, max_length=255)
    conversation_id: str = Field(min_length=1, max_length=255)
    source_quote: str | None = Field(default=None, max_length=10000)
    transcript_reference: str | None = Field(default=None, max_length=500)

    @field_validator("event_id", "conversation_id")
    @classmethod
    def non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


class HistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    field_name: str
    previous_value: str | None
    new_value: str | None
    conversation_id: str | None
    event_id: str | None
    source: str
    actor_type: str
    changed_at: datetime


class EvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_quote: str
    transcript_reference: str | None
    conversation_id: str | None
    event_id: str | None
    verification_status: EvidenceVerificationStatus
    created_at: datetime


class IncidentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    incident_type: str | None
    description: str | None
    location: str | None
    landmark: str | None
    hazard: str | None
    people_count: int | None
    injuries: str | None
    location_confirmed: bool
    status: IncidentStatus
    conversation_id: str | None
    created_at: datetime
    updated_at: datetime


class IncidentDetail(IncidentRead):
    history: list[HistoryRead]
    evidence: list[EvidenceRead]


class WebhookResponse(BaseModel):
    event_id: str
    incident_id: UUID
    status: IncidentStatus
    created: bool
    duplicate: bool


LatLng = tuple[float, float]


class UnitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    service: Service
    agency: str = Field(default="Added by dispatcher", min_length=1, max_length=255)
    point: LatLng | None = None
    out_of_service: bool = False


class UnitPatch(BaseModel):
    point: LatLng | None = None
    out_of_service: bool | None = None


class UnitRead(BaseModel):
    id: str
    name: str
    service: Service
    agency: str
    point: LatLng | None
    out_of_service: bool
    # Only set from a real routing provider; there is none yet.
    route: None = None

    @classmethod
    def of(cls, unit: Unit) -> "UnitRead":
        point = (unit.lat, unit.lng) if unit.lat is not None and unit.lng is not None else None
        return cls(id=unit.id, name=unit.name, service=unit.service, agency=unit.agency, point=point, out_of_service=unit.out_of_service)


class AssignmentCreate(BaseModel):
    unit_id: str = Field(min_length=1, max_length=36)


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str
    unit_id: str
    service: Service
    at: datetime


class ResponseEventCreate(BaseModel):
    unit_id: str = Field(min_length=1, max_length=36)
    status: ResponseStatus
    note: str | None = Field(default=None, max_length=2000)


class ResponseEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str
    status: ResponseStatus
    unit_id: str | None
    at: datetime
    actor: str
    note: str | None
