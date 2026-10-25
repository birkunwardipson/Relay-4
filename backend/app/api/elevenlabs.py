from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import StartConversationPayload, WebhookResponse, WebhookToolPayload
from app.security import require_webhook_secret
from app.services.incident_service import upsert_from_webhook

router = APIRouter(prefix="/api/elevenlabs/tools", tags=["elevenlabs"])


def _response(payload: WebhookToolPayload, result, caller_message: str) -> WebhookResponse:
    return WebhookResponse(
        event_id=payload.event_id,
        incident_id=result.incident.id,
        status=result.incident.status,
        created=result.created,
        duplicate=result.duplicate,
        # Intake recording is not responder dispatch.
        dispatch_confirmed=False,
        caller_message=caller_message,
    )


@router.post(
    "/start-incident",
    response_model=WebhookResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_webhook_secret)],
)
async def start_incident(payload: StartConversationPayload, db: Session = Depends(get_db)):
    # Stable event ID makes repeated start requests idempotent.
    start_payload = WebhookToolPayload(
        event_id=f"{payload.conversation_id}:start",
        conversation_id=payload.conversation_id,
    )
    try:
        result = upsert_from_webhook(db, start_payload)
        db.commit()
        db.refresh(result.incident)
    except IntegrityError:
        db.rollback()
        result = upsert_from_webhook(db, start_payload)
        db.commit()
        db.refresh(result.incident)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return _response(
        start_payload,
        result,
        "The report is open. Continue gathering the caller's details.",
    )


@router.post(
    "/upsert-incident",
    response_model=WebhookResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_webhook_secret)],
)
async def upsert_incident(payload: WebhookToolPayload, db: Session = Depends(get_db)):
    try:
        result = upsert_from_webhook(db, payload)
        db.commit()
        db.refresh(result.incident)
    except IntegrityError:
        db.rollback()
        # A concurrent retry may have committed this event after the initial lookup.
        result = upsert_from_webhook(db, payload)
        db.commit()
        db.refresh(result.incident)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return _response(
        payload,
        result,
        caller_message=(
            "Your report has been received and sent to the dispatch console. "
            "I cannot confirm a responder or arrival distance yet. Please stay safe; help is being coordinated."
        ),
    )
