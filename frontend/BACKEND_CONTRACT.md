# Backend contract needed by the dispatcher console

The console calls these existing endpoints:

| Endpoint | Used for |
|---|---|
| `GET /api/incidents` | Incident queue, map, overview metrics (polled every 2 s) |
| `GET /api/incidents/{id}` | Caller statements (`evidence`) and agent field history (`history`) |
| `GET /api/units`, `GET /api/assignments`, `GET /api/response-events` | Responder roster, assignments and response status (polled every 2 s) |
| `POST/PATCH/DELETE /api/units…`, `POST /api/incidents/{id}/assignments`, `POST /api/incidents/{id}/response-events` | Dispatcher writes, sent with `X-Admin-API-Key` |

**Sections 1–3 are implemented** (see `backend/README.md`, "Dispatch"). Writes use the admin key, which the dispatcher pastes on the Settings page; it is kept in that browser only and is never part of the build. Section 4 (recordings) and 5 (identity) are still open: recordings run only in **demo mode** (`src/demo/`). The UI never falls back to demo data when a live request fails.

To connect a remaining feature, implement its endpoints, then add a live branch next to the demo one in `src/data.ts` (`useRecording`). Field names follow the frontend types in `src/recording.ts`. The browser must never hold ElevenLabs keys or webhook secrets.

## 1. Responders (implemented)

`GET /api/units` returns:

```json
[{ "id": "fd-04", "name": "Engine 04", "service": "fire|police|medical", "agency": "…",
   "point": [lat, lng] | null, "out_of_service": false,
   "route": { "eta_min": 3, "miles": 0.8 } | null }]
```

- `point` is the unit's last reported position, or `null` if unknown. The UI never invents positions.
- `route` is optional and comes only from a real routing provider, relative to an incident (for example `GET /api/incidents/{id}/units`). Without it, the UI sorts by straight-line distance, labels it as straight-line, and shows no ETA.

## 2. Assignments (implemented)

`POST /api/incidents/{id}/assignments` with body `{ "unit_id": "fd-04" }` and an `Idempotency-Key` header returns `201` with
`{ "id", "incident_id", "unit_id", "service", "at" }`.

The server must reject a request with `409` and a `detail` message when:
- the unit is out of service, or is already assigned to an unresolved incident;
- the unit is already on this incident;
- the incident is resolved.

It must record an `assigned` response event. The UI already disables the confirm button while a request is in flight, shows pending, success and error states, and never shows success without a 2xx response. Recording an assignment must not imply that anyone was notified unless a verified notification integration exists.

`GET /api/incidents/{id}/assignments` lists the assignments for an incident.

## 3. Response status, separate from intake `status` (implemented)

Steps: `reported → assigned → accepted → en_route → on_scene → assisting → resolved`. Do not add these values to `IncidentStatus` (`intake | needs_review | reviewed`), which stays the intake/review status.

- `GET /api/incidents/{id}/response-events` returns `[{ "id", "incident_id", "status", "unit_id", "at", "actor": "dispatcher|responder", "note" }]`.
- `POST /api/incidents/{id}/response-events` with body `{ "unit_id", "status", "note" }` is the dispatcher's manual entry for a status a unit reported by radio. It requires an authorized dispatcher.
- Responder apps or CAD integrations post the same events.
- Statuses change only through events, never on timers.

To keep the overview cheap, `GET /api/incidents` could include `response_status` per incident, and there could be a list endpoint for recent events. Server-sent events (`GET /api/stream`) would replace polling.

## 4. Call recordings (ElevenLabs)

`GET /api/incidents/{id}/recording` returns:

```json
{ "state": "ready|processing|unavailable|in_progress",
  "duration_sec": 138,
  "transcript": [{ "speaker": "agent|reporter", "start_sec": 0, "text": "…" }] }
```

`GET /api/incidents/{id}/recording/audio` streams the audio (`audio/mpeg`). It must support `Range` requests so seeking works.

- The backend fetches the audio from ElevenLabs with its own API key.
- Return `401`/`403` when the user is not allowed to play it. The UI has an "unauthorized" state for this.
- Live listening is not supported and is not implied anywhere in the UI.

## 5. Dispatcher identity

There is no user or session API. The header shows a fixed operator name ("Pete", set in `src/App.tsx`) in live mode; it is not a sign-in.
