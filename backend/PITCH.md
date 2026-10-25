# Relay4 backend pitch

## One-sentence pitch

Relay4's backend turns a live ElevenLabs emergency conversation into an auditable, idempotent incident record that a human dispatcher can review, correct, and explicitly assign—without allowing the voice agent to make an unsafe dispatch decision.

## The problem

Voice intake is fast, but raw conversation is difficult to coordinate. Important facts can be scattered across several turns, locations can be corrected, multiple callers can describe the same event, and a dispatcher needs to know what is confirmed versus what was merely inferred.

The backend creates a durable operational boundary between:

1. What the caller said.
2. What the system normalized into an incident.
3. What a dispatcher reviewed or changed.
4. What was actually assigned and what response status was recorded.

That separation is the core safety feature.

## The backend story in 60 seconds

> A conversation starts in ElevenLabs and calls our `start-incident` tool with ElevenLabs' conversation ID. Relay4 immediately opens an intake record, so the dispatcher can see the call before every detail is known. As the caller answers questions, the agent sends structured updates to `upsert-incident`. The backend binds every update to the same incident, records only real field changes, stores caller quotes as unverified evidence, and keeps a complete correction history. Retries are safe because event IDs are idempotent and conflicting reuse is rejected. A voice agent can record facts, but it cannot assign a responder. Only an authenticated dispatcher can create units, assign them, and record response events. The result is a live operational record with a clear audit trail and a hard human approval boundary.

## What is implemented

### Application foundation

- FastAPI application factory in `app/main.py`.
- SQLAlchemy ORM with a configurable database URL.
- SQLite development database by default; another SQLAlchemy-supported database can be supplied through `DATABASE_URL`.
- Pydantic request and response validation.
- Environment-backed configuration through `pydantic-settings`.
- Automatic table creation on application startup for the MVP.
- CORS configuration for the local Vite frontend.
- `/health` endpoint for service checks.

### Conversation-to-incident intake

The backend exposes two ElevenLabs server-side tools:

```text
POST /api/elevenlabs/tools/start-incident
POST /api/elevenlabs/tools/upsert-incident
```

Both require the configured `X-ElevenLabs-Webhook-Secret` header.

#### Start a conversation

`start-incident` accepts only a conversation ID:

```json
{
  "conversation_id": "{{system__conversation_id}}"
}
```

It creates an empty intake record immediately. The server derives the stable event ID `<conversation_id>:start`, so repeated start requests are safe.

#### Update the incident

`upsert-incident` accepts:

- Required: `event_id`, `conversation_id`.
- Optional facts: incident type, description, location, landmark, hazard, people count, injuries, and location confirmation.
- Optional evidence: the caller's source quote and a transcript reference.

The response includes:

```json
{
  "event_id": "conversation-123-update-2",
  "incident_id": "...",
  "status": "intake",
  "created": false,
  "duplicate": false,
  "dispatch_confirmed": false,
  "caller_message": "Your report has been received and sent to the dispatch console..."
}
```

`status` is an intake/review status, not a dispatch status. `dispatch_confirmed` is explicit so the agent cannot safely interpret intake progress as a responder assignment.

### Idempotency and retry safety

Webhook delivery can be retried. Relay4 protects the incident record with `processed_tool_events`:

1. Look up the incoming `event_id`.
2. If it is new, hash the complete payload and process it.
3. If the same event ID and payload arrive again, return the original incident with `duplicate: true`.
4. If the same event ID is reused with a different payload, reject it with `409 Conflict`.
5. A unique `conversation_id` binding ensures all updates in one conversation reach the same incident.

This means retries do not create duplicate incidents or silently overwrite an event with a different payload.

### Evidence and audit history

Every changed incident field can create an `incident_history` row containing:

- Field name.
- Previous value.
- New value.
- Conversation ID.
- Event ID.
- Source.
- Actor type.
- Timestamp.

Caller quotes are stored in `incident_evidence` with `verification_status = unverified`. The backend never upgrades a language-model statement to verified automatically.

When a dispatcher has marked an incident `reviewed` and a later voice update changes a fact, the backend moves it back to `needs_review` and records that status change in history. Corrections therefore reopen human review instead of disappearing into the record.

### Dispatch domain

Dispatch is a separate operational layer from intake:

```text
reported → assigned → accepted → en_route → on_scene → assisting → resolved
```

The backend stores:

- `Unit`: name, service, agency, last dispatcher-set location, and out-of-service state.
- `Assignment`: which unit was assigned to which incident, when, and with an optional idempotency key.
- `ResponseEvent`: a unit's or dispatcher's recorded progress and optional note.

Assignment rules include:

- A unit must exist.
- A unit cannot be out of service.
- A unit cannot be assigned twice to the same incident.
- A unit cannot be assigned to another unresolved incident.
- A resolved incident cannot receive a new assignment.
- Units with assignment history cannot be deleted; they can be marked out of service so historical records remain meaningful.
- Creating an assignment automatically records the `assigned` response event.
- Reusing an assignment idempotency key for the same assignment replays it; reusing it for a different assignment returns `409 Conflict`.
- Later response events require the unit to already be assigned and cannot move a resolved incident forward.

The operational status is calculated from the most advanced recorded response event. It never advances because a timer elapsed.

### Manual incident operations

Dispatchers can also create and patch incidents through the admin API. Manual updates use the same history mechanism and identify the actor as `dispatcher` with source `admin_api`.

## API surface

### System and authentication

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | None | Service health and simulation mode |
| `POST` | `/api/auth/login` | None | Validates the configured operator login for the console |

The default operator is `Pete`. A dedicated `OPERATOR_PASSWORD` can be configured; when it is blank in local development, the existing `ADMIN_API_KEY` is used as the login password. The frontend stores only the current browser-session login state. Dispatcher writes still require the admin key.

### Incident and history routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/incidents` | None | List incidents newest first |
| `GET` | `/api/incidents/{incident_id}` | None | Read one incident with history and evidence |
| `GET` | `/api/incidents/{incident_id}/history` | None | Read the field-level audit history |
| `POST` | `/api/incidents` | `X-Admin-API-Key` | Create a manual incident |
| `PATCH` | `/api/incidents/{incident_id}` | `X-Admin-API-Key` | Edit facts or intake status |

### ElevenLabs routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/elevenlabs/tools/start-incident` | Webhook secret | Open an incident at conversation start |
| `POST` | `/api/elevenlabs/tools/upsert-incident` | Webhook secret | Add or correct structured facts |

The webhook secret is intentionally not accepted by dispatch write routes. A voice agent can never use its tool credential to assign a unit or change response status.

### Dispatch routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/units` | None | List responder units |
| `POST` | `/api/units` | `X-Admin-API-Key` | Add a unit |
| `PATCH` | `/api/units/{unit_id}` | `X-Admin-API-Key` | Update position or availability |
| `DELETE` | `/api/units/{unit_id}` | `X-Admin-API-Key` | Delete a unit with no assignment history |
| `GET` | `/api/assignments` | None | List all assignments |
| `GET` | `/api/response-events` | None | List all response events |
| `GET` | `/api/incidents/{incident_id}/assignments` | None | List incident assignments |
| `POST` | `/api/incidents/{incident_id}/assignments` | `X-Admin-API-Key` | Assign a unit with optional idempotency |
| `GET` | `/api/incidents/{incident_id}/response-events` | None | List incident response events |
| `POST` | `/api/incidents/{incident_id}/response-events` | `X-Admin-API-Key` | Record a response status |

## Data model

```text
ConversationBinding ──► Incident ◄── IncidentHistory
                              │
                              ├── IncidentEvidence
                              ├── Assignment ◄── Unit
                              └── ResponseEvent ◄── Unit

ProcessedToolEvent ──► Incident
```

### `incidents`

The normalized shared picture: type, description, location, landmark, hazard, people count, injuries, location confirmation, intake status, conversation ID, and timestamps.

### `conversation_bindings`

One-to-one conversation-to-incident identity. It prevents a multi-turn conversation from creating a new incident for every update.

### `processed_tool_events`

The idempotency ledger for ElevenLabs tool calls. It stores the original payload hash and the incident to which the event was applied.

### `incident_history`

The change ledger for corrections and review-state transitions.

### `incident_evidence`

Caller statements and transcript references, explicitly marked unverified until a human validates them.

### `units`, `assignments`, and `response_events`

The operational response model. The database keeps assignments and event history separate so the system can answer both “who was assigned?” and “what did they report next?”

## Security boundaries

Relay4 uses separate credentials for separate trust boundaries:

| Credential | Used by | Grants |
| --- | --- | --- |
| `ELEVENLABS_WEBHOOK_SECRET` | ElevenLabs server-side tools | Create/update intake records only |
| `ADMIN_API_KEY` | Dispatcher console writes | Manage units, assignments, response events, and manual incident changes |
| `OPERATOR_PASSWORD` | Console login | Open the operator UI as Pete |

Credentials are compared with constant-time `hmac.compare_digest`. Secrets are loaded from environment variables and are not bundled into the frontend. The browser stores the dispatcher key only in local storage because the current MVP uses it for manual writes; production should replace this with a real identity provider and short-lived sessions.

## Error semantics

- `401 Unauthorized`: missing or invalid webhook, admin, or operator credentials.
- `404 Not Found`: incident or unit does not exist.
- `409 Conflict`: duplicate event with a different payload, assignment conflict, invalid state transition, or deletion of a unit with history.
- `422 Unprocessable Entity`: request shape or field validation failure.
- `503 Service Unavailable`: required authentication is not configured.

The API returns structured JSON errors through FastAPI, so the frontend can show actionable messages instead of silently failing.

## Demo and verification flow

### Simulate one complete voice intake

```bash
cd backend
source .venv/bin/activate
python scripts/simulate_call.py fire
```

Available synthetic scenarios are `fire`, `flood`, `medical`, `crash`, and `all`. The script sends several updates four seconds apart, exercising the same sequence as a live voice agent.

### Send one webhook request

```bash
ELEVENLABS_WEBHOOK_SECRET="your-value-from-.env" \
python scripts/simulate_voice_tool.py
```

### Run the backend test suite

```bash
.venv/bin/pytest -q
```

The suite covers:

- Health and operator login.
- Webhook authentication.
- Start-of-conversation creation.
- Required-field and range validation.
- Conversation binding and multi-turn updates.
- Null and missing facts.
- Caller evidence and unverified status.
- Correction history.
- Duplicate event replay.
- Conflicting event ID rejection.
- Manual-write authentication.
- Unit CRUD and availability.
- Assignment idempotency and conflicts.
- Response-event rules and resolution.
- Protection against using the webhook secret for dispatch.

## The demo narrative

1. Start with a caller speaking to ElevenLabs.
2. Show `start-incident` opening an empty record immediately.
3. Run the `fire` or `flood` scenario and show the same incident filling in over several updates.
4. Open the incident detail and show source evidence, missing facts, and correction history.
5. Explain that the voice agent can record facts but cannot dispatch.
6. Add or select a responder as Pete, confirm the assignment, and show the `assigned` event.
7. Record `accepted`, `en_route`, `on_scene`, and `resolved` to demonstrate the operational lifecycle.
8. Repeat a webhook event to show the idempotent response instead of a duplicate incident.

## What to say about safety

Use this wording in a pitch:

> Relay4 deliberately refuses to turn an AI inference into a dispatch action. The agent can collect and update facts, but a dispatcher must review the record and explicitly assign a unit. Every correction is auditable, caller quotes remain unverified until checked, and webhook retries cannot create duplicate incidents. The backend is designed to make the safe path the easiest path.

## Current limitations and next backend steps

The MVP is intentionally honest about what it does not yet do:

- Assignment records are not delivered to real responder devices.
- There is no production identity provider or server-side operator session; the login is a backend-validated console gate, while admin writes still use the admin key.
- Read endpoints are open for the local dashboard; production should add authenticated read access.
- Road routing and ETA are not connected. Unit positions are dispatcher-set and straight-line distance is a frontend fallback.
- SQLite and `create_all` are appropriate for the demo but should become managed migrations and a production database.
- There is no explicit call-ended event; the frontend infers the end of a conversation from 20 seconds without a webhook update.
- ElevenLabs post-call transcript ingestion and full recording storage are not connected.
- Rate limiting, structured production audit export, secret rotation, and observability should be added before real deployment.

The next safe backend milestone is a real authenticated dispatcher/responder identity model, server-side sessions or signed tokens, a routing adapter, and a delivery adapter that can notify a responder without allowing the voice agent to bypass human approval.
