# Relay4 backend

[← Project overview](../README.md) · [Running guide](../RUNNING.md) · [Frontend README](../frontend/README.md)

FastAPI backend for Relay4's synthetic emergency voice intake workflow. MVP 1 receives structured facts from an ElevenLabs Conversational AI webhook tool, persists incidents in SQLite, and records corrections without making dispatch decisions.

For local setup, tunnel configuration, ElevenLabs fields, smoke tests, and troubleshooting, use [`../RUNNING.md`](../RUNNING.md). This document focuses on the backend contract and implementation.

For a pitch-ready explanation of the backend architecture, data model, security boundaries, API surface, demo narrative, and roadmap, see [`PITCH.md`](PITCH.md).

## Responsibilities

- Receive and normalize emergency intake data.
- Store live incident records and their correction history.
- Receive and validate structured incident facts from ElevenLabs.
- Persist incidents, source evidence, conversation bindings, and correction history.
- Make repeated webhook events idempotent using a unique event ID.
- Protect manual incident writes with an admin API key.
- Record dispatcher assignments and unit status, authenticated by the admin key. The voice agent can never assign or dispatch.
- Provide a stable API boundary for future DeepSpace integration.

## Suggested structure

```text
backend/
├── app/
│   ├── api/          # Incident and ElevenLabs webhook routes
│   ├── models/       # SQLAlchemy persistence models
│   ├── services/     # Incident upsert and audit logic
│   ├── config.py     # Environment-backed settings
│   ├── database.py   # SQLite/SQLAlchemy setup
│   ├── schemas.py    # Pydantic request and response models
│   ├── security.py   # Admin and webhook authentication
│   └── main.py       # FastAPI application entry point
├── scripts/          # Synthetic webhook request script
├── tests/
├── .env.example
├── requirements.txt
└── README.md
```

## Setup

Python 3.11+ is required.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set different random values for `ELEVENLABS_WEBHOOK_SECRET` and `ADMIN_API_KEY` in `.env`. Never commit `.env` or real credentials.

The console login operator defaults to `Pete`. Set `OPERATOR_PASSWORD` for a dedicated login password; if it is blank, the local login accepts the configured `ADMIN_API_KEY` as the operator password. The operator login is checked by `POST /api/auth/login`; dispatcher writes remain protected by `X-Admin-API-Key`.

Start the service from the `backend/` directory:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API documentation is available at <http://127.0.0.1:8000/docs>.

## API behavior

- `GET /health` is a basic service check.
- `POST /api/elevenlabs/tools/start-incident` opens an empty intake record at conversation start. Send `conversation_id` from ElevenLabs' `{{system__conversation_id}}` dynamic variable.
- `POST /api/elevenlabs/tools/upsert-incident` is protected by the configured webhook secret. It requires a unique `event_id` and `conversation_id`.
- The webhook response includes `dispatch_confirmed: false` and a `caller_message`, which is safe for ElevenLabs to read aloud. It confirms receipt and coordination only; it does not claim that a responder was assigned.
- The first authenticated event for a conversation creates a server-side conversation binding and an incident. Later events for that conversation update the same incident.
- Repeating an `event_id` returns the existing incident with `duplicate: true` and makes no additional changes.
- LLM-provided source quotes are stored in `incident_evidence` as `unverified`. This MVP does not mark evidence verified automatically.
- `POST /api/incidents` and `PATCH /api/incidents/{id}` require `X-Admin-API-Key`. These are manual development/admin operations.
- Incident statuses are limited to `intake`, `needs_review`, and `reviewed`.
- No endpoint allows ElevenLabs to approve assignments or dispatch responders. The webhook secret is not accepted on any dispatch endpoint.

### Dispatch (responders, assignments, response status)

Reads are open, like `GET /api/incidents`. Every write requires `X-Admin-API-Key` (the dispatcher console sends the key the dispatcher enters on its Settings page).

- `GET /api/units`, `POST /api/units`, `PATCH /api/units/{id}` (position, out of service), `DELETE /api/units/{id}`. A unit with assignment history cannot be deleted (`409`); mark it out of service instead.
- `POST /api/incidents/{id}/assignments` with `{"unit_id": ...}` and an optional `Idempotency-Key` header. It returns `201`; repeating the same key returns the original assignment with `200`. It returns `409` when the unit is out of service, is already on an unresolved incident or on this one, or the incident is resolved. Each assignment records an `assigned` response event.
- `POST /api/incidents/{id}/response-events` with `{"unit_id", "status", "note"}` records a status a unit reported (`accepted`, `en_route`, `on_scene`, `assisting`, `resolved`). The unit must be assigned to the incident.
- `GET /api/incidents/{id}/assignments`, `GET /api/incidents/{id}/response-events`, plus `GET /api/assignments` and `GET /api/response-events` for all incidents (the console polls these).
- An incident's response status is its most advanced event. It changes only when an event is recorded, never on a timer. Assignments are recorded, not sent: nothing notifies a responder.

## Configure the ElevenLabs agent

Create a server-side webhook tool in the ElevenLabs agent configuration with:

- URL: `https://YOUR-BACKEND-HOST/api/elevenlabs/tools/upsert-incident`
- HTTP method: `POST`
- Header: `X-ElevenLabs-Webhook-Secret: <same value as ELEVENLABS_WEBHOOK_SECRET>`
- JSON body fields:
  - Required: `event_id`, `conversation_id`
  - Optional incident facts: `incident_type`, `description`, `location`, `landmark`, `hazard`, `people_count`, `injuries`, `location_confirmed`
  - Optional evidence: `source_quote`, `transcript_reference`

Use an event ID that is unique for each tool invocation. The exact ElevenLabs UI field names and webhook configuration can change, so verify the current agent tool schema before connecting a deployed agent. The backend intentionally does not require an ElevenLabs API key for inbound webhook authentication.

Create a second server-side webhook tool for the start of every conversation:

- URL: `https://YOUR-BACKEND-HOST/api/elevenlabs/tools/start-incident`
- HTTP method: `POST`
- Header: `X-ElevenLabs-Webhook-Secret: <same value as ELEVENLABS_WEBHOOK_SECRET>`
- JSON body: `{ "conversation_id": "{{system__conversation_id}}" }`

In the ElevenLabs agent instructions, call `start-incident` silently before asking the first question. For each new fact, call `upsert-incident` with `conversation_id` set to `{{system__conversation_id}}` and a unique `event_id`. Tell the agent to read the returned `caller_message` after the details have been recorded. Never say “dispatch status unconfirmed”; `dispatch_confirmed: false` means only that the report is recorded and no responder assignment has been confirmed. Do not invent a responder name, distance, ETA, or dispatch confirmation.

Example request:

```json
{
  "event_id": "demo-event-001",
  "conversation_id": "demo-conversation-001",
  "incident_type": "stranded_vehicle",
  "location": "Cypress Bend Market",
  "landmark": "West service entrance",
  "hazard": "rising_water",
  "people_count": 2,
  "location_confirmed": true,
  "source_quote": "We're stuck near the market and water is rising.",
  "transcript_reference": "demo-transcript-message-001"
}
```

## Synthetic webhook test

Start Uvicorn, then run this from the `backend/` directory:

```bash
ELEVENLABS_WEBHOOK_SECRET="your-value-from-.env" python scripts/simulate_voice_tool.py
```

The script uses synthetic data and does not require an ElevenLabs account.

## Automated tests

```bash
pytest -q
```

The tests use a temporary SQLite database and cover authentication, validation, null handling, conversation binding, idempotent retries, corrections, evidence status, protected writes, the dispatch rules (conflicts, idempotency, resolution), and that the voice tool's secret cannot assign units.
