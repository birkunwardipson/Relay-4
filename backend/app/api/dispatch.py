from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Assignment, Incident, ResponseEvent, Unit
from app.schemas import (
    AssignmentCreate,
    AssignmentRead,
    ResponseEventCreate,
    ResponseEventRead,
    UnitCreate,
    UnitPatch,
    UnitRead,
)
from app.security import require_admin_api_key
from app.services.dispatch_service import (
    DispatchConflict,
    assign_unit,
    create_unit,
    delete_unit,
    log_response_event,
    update_unit,
)

# Reads are open like GET /api/incidents; every write needs the dispatcher's admin key. The voice-agent webhook
# secret grants nothing here, so the agent can never assign units or change response status.
router = APIRouter(tags=["dispatch"])
admin = [Depends(require_admin_api_key)]


def _incident(db: Session, incident_id: UUID) -> Incident:
    incident = db.get(Incident, str(incident_id))
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


def _unit(db: Session, unit_id: str) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit


@router.get("/api/units", response_model=list[UnitRead])
async def list_units(db: Session = Depends(get_db)):
    return [UnitRead.of(unit) for unit in db.scalars(select(Unit).order_by(Unit.created_at.asc()))]


@router.post("/api/units", response_model=UnitRead, status_code=status.HTTP_201_CREATED, dependencies=admin)
async def add_unit(payload: UnitCreate, db: Session = Depends(get_db)):
    unit = create_unit(db, payload)
    db.commit()
    return UnitRead.of(unit)


@router.patch("/api/units/{unit_id}", response_model=UnitRead, dependencies=admin)
async def change_unit(unit_id: str, payload: UnitPatch, db: Session = Depends(get_db)):
    unit = update_unit(db, _unit(db, unit_id), payload)
    db.commit()
    return UnitRead.of(unit)


@router.delete("/api/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin)
async def remove_unit(unit_id: str, db: Session = Depends(get_db)):
    try:
        delete_unit(db, _unit(db, unit_id))
    except DispatchConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()


@router.get("/api/assignments", response_model=list[AssignmentRead])
async def list_all_assignments(db: Session = Depends(get_db)):
    return list(db.scalars(select(Assignment).order_by(Assignment.at.asc())))


@router.get("/api/response-events", response_model=list[ResponseEventRead])
async def list_all_response_events(db: Session = Depends(get_db)):
    return list(db.scalars(select(ResponseEvent).order_by(ResponseEvent.at.asc())))


@router.get("/api/incidents/{incident_id}/assignments", response_model=list[AssignmentRead])
async def list_assignments(incident_id: UUID, db: Session = Depends(get_db)):
    incident = _incident(db, incident_id)
    return list(db.scalars(select(Assignment).where(Assignment.incident_id == incident.id).order_by(Assignment.at.asc())))


@router.post(
    "/api/incidents/{incident_id}/assignments",
    response_model=AssignmentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=admin,
)
async def create_assignment(
    incident_id: UUID,
    payload: AssignmentCreate,
    response: Response,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=255),
):
    incident = _incident(db, incident_id)
    try:
        assignment, replayed = assign_unit(db, incident, payload, idempotency_key)
        db.commit()
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DispatchConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        # A concurrent request committed the same assignment or key first.
        raise HTTPException(status_code=409, detail="This unit was just assigned by another request.") from exc
    if replayed:
        response.status_code = status.HTTP_200_OK
    return assignment


@router.get("/api/incidents/{incident_id}/response-events", response_model=list[ResponseEventRead])
async def list_response_events(incident_id: UUID, db: Session = Depends(get_db)):
    incident = _incident(db, incident_id)
    return list(db.scalars(select(ResponseEvent).where(ResponseEvent.incident_id == incident.id).order_by(ResponseEvent.at.asc())))


@router.post(
    "/api/incidents/{incident_id}/response-events",
    response_model=ResponseEventRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=admin,
)
async def create_response_event(incident_id: UUID, payload: ResponseEventCreate, db: Session = Depends(get_db)):
    incident = _incident(db, incident_id)
    try:
        event = log_response_event(db, incident, payload, actor="dispatcher")
        db.commit()
    except DispatchConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return event
