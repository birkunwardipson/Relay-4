# Relay4 frontend

[← Project overview](../README.md) · [Running guide](../RUNNING.md) · [Backend README](../backend/README.md)

Dispatcher console with five pages: Overview, Incidents (the dispatch workspace), Responders, Call history and Settings. Everything is synthetic. The console never contacts emergency services.

For the complete two-terminal setup, ElevenLabs tunnel, webhook configuration, and troubleshooting, use [`../RUNNING.md`](../RUNNING.md). This document focuses on the React/Vite application.

## Run

```bash
cp .env.example .env        # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

`npm run build` type-checks and builds. `npm run lint` lints.

## Data sources

Pick the data source under **Settings**, or set `VITE_DATA_MODE=demo` to start in demo mode. Switching remounts the app, so the two sources never mix.

| | Live backend | Demo data |
|---|---|---|
| Incidents, caller statements, agent history | `GET /api/incidents`, `GET /api/incidents/{id}`, polled every 4 s | `src/demo/data.ts` |
| Map pins | Caller's location text geocoded with OpenStreetMap Nominatim, Louisiana only | Fixed demo positions in Hammond, LA |
| Responders, assignment, response status | Shown as "not connected" | In-browser store (`src/demo/store.ts`) |
| Call recording | Caller statements only; audio shown as "not connected" | Synthetic tone audio + transcript |

If the backend is unreachable, live mode shows an offline banner and keeps the last data it received. It never substitutes demo data. [BACKEND_CONTRACT.md](BACKEND_CONTRACT.md) lists the endpoints the missing features need.

## Behaviour

- **Severity** (Critical / Major / Minor) is suggested by rules over the reported facts (`src/intake.ts`). Its reasons are always shown.
- **Response status** (`src/response.ts`) is kept separate from the backend's intake status. It changes only on a recorded event: an assignment, a unit report, or a dispatcher's manual entry. It never changes on a timer.
- **Unit ranking** puts available units first. They are sorted by routed ETA only when every candidate has one; otherwise by straight-line distance, which is labelled, and no ETA is shown.
- **Assignment** needs an explicit unit choice and a click on confirm. The button is disabled while a request is pending. Unavailable units, and units already on the incident, can't be selected. An incident can have units from several services.
- **URL state:** filters and the selected incident are kept in the hash, for example `#/incidents?service=fire&view=awaiting&id=INC-0241`. The sidebar returns to each page's last filters.
- **Responsive layout:** three columns on wide screens, two below 1280 px, and tabs below 1100 px.

## Files

```
src/api.ts, hooks.ts        backend requests and polling
src/data.ts                 data-source switch (live vs demo) and app context
src/demo/                   demo dataset, store and synthetic audio
src/router.ts, mode.ts      hash routes, data-source setting
src/intake.ts, services.ts  severity, service suggestion, missing facts, related calls
src/response.ts             response steps, unit availability and ranking, metrics
src/pages/                  Overview, Incidents, Responders, CallHistory, Settings
src/components/             cards, badges, map, timeline, call recording, assign and activity panels
```
