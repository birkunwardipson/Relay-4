import { useSyncExternalStore } from "react";
import type { Assignment, ResponseEvent, ResponseStatus, Unit } from "./response";
import type { Service } from "./services";
import type { Incident, IncidentDetail, LatLng } from "./types";

// Endpoints in backend/app/api. Call recordings have no backend endpoint yet; see BACKEND_CONTRACT.md.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// The dispatcher's key (the backend's ADMIN_API_KEY), typed in on the Settings page and kept in this browser only.
// It is never part of the build. Reads do not need it; every write does.
const KEY_STORAGE = "relay4.dispatcherKey";
const keyListeners = new Set<() => void>();
let dispatcherKey = (() => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
})();

export function setDispatcherKey(next: string) {
  dispatcherKey = next.trim();
  try {
    if (dispatcherKey) localStorage.setItem(KEY_STORAGE, dispatcherKey);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage unavailable; the key lasts for this page load.
  }
  keyListeners.forEach((listener) => listener());
}

export const useDispatcherKey = () =>
  useSyncExternalStore(
    (listener) => {
      keyListeners.add(listener);
      return () => keyListeners.delete(listener);
    },
    () => dispatcherKey,
  );

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new ApiError(`GET ${path} failed (${response.status})`, response.status);
  return (await response.json()) as T;
}

/** Authenticated write. Error messages are the backend's `detail`, which says what to fix. */
async function send<T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  if (!dispatcherKey) throw new ApiError("Enter the dispatcher key in Settings to make changes.", 401);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-API-Key": dispatcherKey, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((data: { detail?: unknown }) => (typeof data.detail === "string" ? data.detail : null))
      .catch(() => null);
    const message = response.status === 401 ? "The dispatcher key was rejected. Check it in Settings." : (detail ?? `${method} ${path} failed (${response.status}).`);
    throw new ApiError(message, response.status);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const fetchIncidents = () => getJson<Incident[]>("/api/incidents");
export const fetchIncident = (id: string) => getJson<IncidentDetail>(`/api/incidents/${encodeURIComponent(id)}`);

// Wire formats (snake_case, as in backend/app/schemas.py), mapped to the frontend types in src/response.ts.
type UnitWire = { id: string; name: string; service: Service; agency: string; point: LatLng | null; out_of_service: boolean; route: { eta_min: number; miles: number } | null };
type AssignmentWire = { id: string; incident_id: string; unit_id: string; service: Service; at: string };
type EventWire = { id: string; incident_id: string; status: ResponseStatus; unit_id: string | null; at: string; actor: "dispatcher" | "responder"; note: string | null };

const toUnit = (unit: UnitWire): Unit => ({
  id: unit.id,
  name: unit.name,
  service: unit.service,
  agency: unit.agency,
  point: unit.point,
  outOfService: unit.out_of_service,
  route: unit.route && { etaMin: unit.route.eta_min, miles: unit.route.miles },
});
const toAssignment = (item: AssignmentWire): Assignment => ({ id: item.id, incidentId: item.incident_id, unitId: item.unit_id, service: item.service, at: item.at });
const toEvent = (item: EventWire): ResponseEvent => ({ id: item.id, incidentId: item.incident_id, status: item.status, unitId: item.unit_id, at: item.at, actor: item.actor, note: item.note });

export const fetchUnits = () => getJson<UnitWire[]>("/api/units").then((list) => list.map(toUnit));
export const fetchAssignments = () => getJson<AssignmentWire[]>("/api/assignments").then((list) => list.map(toAssignment));
export const fetchResponseEvents = () => getJson<EventWire[]>("/api/response-events").then((list) => list.map(toEvent));

export type NewUnit = Pick<Unit, "name" | "service" | "agency" | "point" | "outOfService">;

export const createUnit = (unit: NewUnit) =>
  send<UnitWire>("POST", "/api/units", { name: unit.name, service: unit.service, agency: unit.agency, point: unit.point, out_of_service: unit.outOfService }).then(toUnit);

export const patchUnit = (id: string, change: Partial<Pick<Unit, "point" | "outOfService">>) =>
  send<UnitWire>("PATCH", `/api/units/${encodeURIComponent(id)}`, {
    ...("point" in change ? { point: change.point } : {}),
    ...("outOfService" in change ? { out_of_service: change.outOfService } : {}),
  }).then(toUnit);

export const deleteUnit = (id: string) => send<void>("DELETE", `/api/units/${encodeURIComponent(id)}`);

// randomUUID needs a secure context (https or localhost); plain-http LAN access falls back.
const requestKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** One key per confirm click, so a retried request cannot create a second assignment. */
export const postAssignment = (incidentId: string, unitId: string) =>
  send<AssignmentWire>("POST", `/api/incidents/${encodeURIComponent(incidentId)}/assignments`, { unit_id: unitId }, { "Idempotency-Key": requestKey() }).then(toAssignment);

export const postResponseEvent = (incidentId: string, unitId: string, status: ResponseStatus, note: string | null) =>
  send<EventWire>("POST", `/api/incidents/${encodeURIComponent(incidentId)}/response-events`, { unit_id: unitId, status, note }).then(toEvent);
