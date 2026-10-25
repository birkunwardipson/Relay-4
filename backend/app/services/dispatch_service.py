from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import RESPONSE_STEPS, Assignment, Incident, ResponseEvent, ResponseStatus, Unit
from app.schemas import AssignmentCreate, ResponseEventCreate, UnitCreate, UnitPatch

# Assignment records what the dispatcher decided. Nothing here notifies a responder or advances a status on its own.


class DispatchConflict(ValueError):
    """The request is valid but conflicts with current state (HTTP 409)."""


def response_status(db: Session, incident_id: str) -> ResponseStatus:
    """An incident is as far along as its most advanced unit; `reported` until something happens."""
    statuses = db.scalars(select(ResponseEvent.status).where(ResponseEvent.incident_id == incident_id)).all()
    return max(statuses, key=RESPONSE_STEPS.index, default=ResponseStatus.REPORTED)


def busy_incident(db: Session, unit_id: str) -> str | None:
    """The unresolved incident this unit is assigned to, if any."""
    for incident_id in db.scalars(select(Assignment.incident_id).where(Assignment.unit_id == unit_id)):
        if response_status(db, incident_id) != ResponseStatus.RESOLVED:
            return incident_id
    return None


def create_unit(db: Session, payload: UnitCreate) -> Unit:
    lat, lng = payload.point if payload.point else (None, None)
    unit = Unit(name=payload.name.strip(), service=payload.service, agency=payload.agency.strip(), lat=lat, lng=lng, out_of_service=payload.out_of_service)
    db.add(unit)
    db.flush()
    return unit


def update_unit(db: Session, unit: Unit, payload: UnitPatch) -> Unit:
    values = payload.model_dump(exclude_unset=True)
    if "point" in values:
        unit.lat, unit.lng = values["point"] if values["point"] else (None, None)
    if values.get("out_of_service") is not None:
        unit.out_of_service = values["out_of_service"]
    db.flush()
    return unit


def delete_unit(db: Session, unit: Unit) -> None:
    if db.scalar(select(Assignment.id).where(Assignment.unit_id == unit.id).limit(1)):
        # Keep the record so past assignments still name their unit; mark it out of service instead.
        raise DispatchConflict(f"{unit.name} has assignment history and cannot be removed. Mark it out of service instead.")
    db.delete(unit)
    db.flush()


def assign_unit(db: Session, incident: Incident, payload: AssignmentCreate, idempotency_key: str | None) -> tuple[Assignment, bool]:
    """Returns (assignment, replayed). A repeated Idempotency-Key returns the original assignment."""
    if idempotency_key:
        previous = db.scalar(select(Assignment).where(Assignment.idempotency_key == idempotency_key))
        if previous:
            if previous.incident_id != incident.id or previous.unit_id != payload.unit_id:
                raise DispatchConflict("This Idempotency-Key was already used for a different assignment.")
            return previous, True

    unit = db.get(Unit, payload.unit_id)
    if unit is None:
        raise LookupError("Unit not found")
    if response_status(db, incident.id) == ResponseStatus.RESOLVED:
        raise DispatchConflict("This incident is already resolved.")
    if db.scalar(select(Assignment.id).where(Assignment.incident_id == incident.id, Assignment.unit_id == unit.id)):
        raise DispatchConflict(f"{unit.name} is already assigned to this incident.")
    if unit.out_of_service:
        raise DispatchConflict(f"{unit.name} is out of service.")
    if busy := busy_incident(db, unit.id):
        raise DispatchConflict(f"{unit.name} is already assigned to another unresolved incident ({busy}).")

    assignment = Assignment(incident_id=incident.id, unit_id=unit.id, service=unit.service, idempotency_key=idempotency_key)
    db.add(assignment)
    db.flush()
    db.add(ResponseEvent(incident_id=incident.id, unit_id=unit.id, status=ResponseStatus.ASSIGNED, actor="dispatcher", at=assignment.at))
    db.flush()
    return assignment, False


def log_response_event(db: Session, incident: Incident, payload: ResponseEventCreate, *, actor: str) -> ResponseEvent:
    """A status a unit reported (by radio, phone or a responder app), recorded as an event."""
    if RESPONSE_STEPS.index(payload.status) <= RESPONSE_STEPS.index(ResponseStatus.ASSIGNED):
        raise DispatchConflict("Use the assignments endpoint to assign units.")
    if not db.scalar(select(Assignment.id).where(Assignment.incident_id == incident.id, Assignment.unit_id == payload.unit_id)):
        raise DispatchConflict("That unit is not assigned to this incident.")
    if response_status(db, incident.id) == ResponseStatus.RESOLVED:
        raise DispatchConflict("This incident is already resolved.")
    event = ResponseEvent(incident_id=incident.id, unit_id=payload.unit_id, status=payload.status, actor=actor, note=payload.note)
    db.add(event)
    db.flush()
    return event
