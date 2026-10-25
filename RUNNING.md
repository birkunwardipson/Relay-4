# Running Relay4

This is the practical runbook for launching Relay4 locally, connecting ElevenLabs, and checking that incidents reach the dispatcher console.

For the product overview, see [`README.md`](README.md). For implementation details, see [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md).

## Prerequisites

- Python 3.11 or newer.
- Node.js and npm.
- A browser.
- Optional: `cloudflared` for an ElevenLabs-to-localhost tunnel.

## 1. Configure the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and set two different random secrets:

```dotenv
ELEVENLABS_WEBHOOK_SECRET=replace-with-a-long-random-value
ADMIN_API_KEY=replace-with-a-different-long-random-value
```

Do not commit `.env`. The local database is SQLite at `backend/relay4.db` and is ignored by Git.

## 2. Start the backend

Terminal 1:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Check it:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok","service":"relay4-backend","simulation_mode":true}
```

API documentation is available at <http://127.0.0.1:8000/docs>.

## 3. Start the frontend

Terminal 2:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open <http://127.0.0.1:5173>.

The default frontend configuration is:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

In **Settings**, choose **Live backend**. The console polls incidents, units, assignments, and response events every two seconds.

## 4. Demo mode

Demo mode is isolated from the backend and never contacts emergency services or responders. Switch to it from **Settings**, or start Vite with:

```bash
VITE_DATA_MODE=demo npm run dev -- --host 127.0.0.1 --port 5173
```

Demo assignments and recordings live in browser storage. They do not modify SQLite.

## 5. Connect ElevenLabs through a tunnel

Keep the backend running, then open Terminal 3:

```bash
cloudflared tunnel --url http://localhost:8000
```

Copy the generated HTTPS hostname. For example:

```text
https://example-words.trycloudflare.com
```

The hostname is temporary. Keep the `cloudflared` process alive while testing.

### Start-incident tool

Create a server-side ElevenLabs Webhook tool:

```text
Name: start_incident
Method: POST
URL: https://YOUR-TUNNEL.trycloudflare.com/api/elevenlabs/tools/start-incident
Header: X-ElevenLabs-Webhook-Secret: <ELEVENLABS_WEBHOOK_SECRET>
Body: conversation_id = {{system__conversation_id}}
```

Tell the agent to call this tool silently before asking the first question. It creates the initial empty incident and is safe to retry.

### Upsert-incident tool

Create the facts tool:

```text
Name: upsert_incident
Method: POST
URL: https://YOUR-TUNNEL.trycloudflare.com/api/elevenlabs/tools/upsert-incident
Header: X-ElevenLabs-Webhook-Secret: <ELEVENLABS_WEBHOOK_SECRET>
```

Required body fields:

```json
{
  "event_id": "unique-event-id",
  "conversation_id": "{{system__conversation_id}}"
}
```

Optional fields:

```json
{
  "incident_type": "fire",
  "description": "Caller reports smoke from a house.",
  "location": "801 Pecan Street, Hammond",
  "landmark": "near the west entrance",
  "hazard": "smoke",
  "people_count": 2,
  "injuries": "unknown",
  "location_confirmed": true,
  "source_quote": "There is smoke coming from the house.",
  "transcript_reference": "current-turn"
}
```

Call `upsert_incident` after each new or corrected fact. Every `event_id` must be unique for that invocation. The endpoint updates the same incident because it binds records by `conversation_id`.

### Safe agent instruction

```text
Call start_incident silently at the beginning of every conversation.
Call upsert_incident whenever the caller provides a new or corrected incident fact.
Always pass conversation_id={{system__conversation_id}}.
Use a unique event_id for every upsert call.

The webhook response field status is the intake/review state, not responder dispatch.
Never say “dispatch status unconfirmed.”
Only say that a responder is assigned, nearby, or on the way if a tool response explicitly confirms it.
Do not invent a responder name, distance, ETA, or dispatch confirmation.
After facts are recorded, use the returned caller_message as the caller-facing confirmation.
```

ElevenLabs provides `system__conversation_id` as a built-in dynamic variable. See the [dynamic variables documentation](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables) and [webhook tools documentation](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools).

## 6. Test the webhook without ElevenLabs

With the backend and tunnel running, use the tunnel hostname and the secret from `.env`:

```bash
curl -X POST \
  https://YOUR-TUNNEL.trycloudflare.com/api/elevenlabs/tools/start-incident \
  -H 'Content-Type: application/json' \
  -H 'X-ElevenLabs-Webhook-Secret: YOUR_SECRET' \
  -d '{"conversation_id":"local-smoke-test"}'
```

Then open the incidents page and wait for the two-second polling cycle:

<http://127.0.0.1:5173/#/incidents>

You can test a facts update with:

```bash
curl -X POST \
  https://YOUR-TUNNEL.trycloudflare.com/api/elevenlabs/tools/upsert-incident \
  -H 'Content-Type: application/json' \
  -H 'X-ElevenLabs-Webhook-Secret: YOUR_SECRET' \
  -d '{
    "event_id":"local-smoke-test-1",
    "conversation_id":"local-smoke-test",
    "incident_type":"fire",
    "location":"801 Pecan Street, Hammond",
    "description":"Smoke reported from a house.",
    "location_confirmed":true
  }'
```

The response includes `incident_id`, `dispatch_confirmed: false`, and a safe `caller_message`.

## 7. Dispatcher actions

1. Open **Settings**.
2. Paste the backend's `ADMIN_API_KEY` into **Dispatcher key**.
3. Open **Responders** and add units with positions.
4. Open **Incidents** and select an incident.
5. Review facts and missing information.
6. Select a unit and explicitly confirm the assignment.
7. Record response events as the unit reports them.

Assignments are recorded for the synthetic workflow. They do not contact a real responder.

## 8. Tests and builds

Backend:

```bash
cd backend
.venv/bin/pytest -q
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Frontend is blank or shows no incidents | Confirm both servers are running; check **Settings → Live backend** and open <http://127.0.0.1:8000/health>. |
| Backend offline banner | Verify Vite points to `http://localhost:8000`, then restart Uvicorn. |
| ElevenLabs gets `401` | The header name and secret must exactly match `ELEVENLABS_WEBHOOK_HEADER` and `ELEVENLABS_WEBHOOK_SECRET`. |
| ElevenLabs gets `422` | Check that `conversation_id` is `{{system__conversation_id}}`, `event_id` is present for upserts, and numeric/boolean fields have the correct types. |
| Incident does not appear | Check the `cloudflared` URL, keep the tunnel running, and wait for the frontend polling cycle. |
| Agent says dispatch is unconfirmed | Instruct it to use `caller_message` and never interpret `status` as dispatch status. No assignment is confirmed until a dispatcher records one. |
| Call still says in progress | The frontend ends the call after 20 seconds without an incident update; a later webhook update starts the window again. |
| Assignment write fails | Enter the exact `ADMIN_API_KEY` in Settings. The ElevenLabs webhook secret cannot perform dispatcher writes. |

## Stop everything

Press `Ctrl+C` in each terminal running Uvicorn, Vite, or `cloudflared`.
