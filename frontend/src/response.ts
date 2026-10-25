import { miles, parseTime } from "./format";
import { distanceKm } from "./louisiana";
import type { Service } from "./services";
import type { LatLng } from "./types";

// Operational response status. Kept separate from the backend's intake/review status (Incident.status).
// It only changes through recorded events (responder reports or a dispatcher's manual entry), never on a timer.
export const STEPS = ["reported", "assigned", "accepted", "en_route", "on_scene", "assisting", "resolved"] as const;
export type ResponseStatus = (typeof STEPS)[number];

export const STATUS_TEXT: Record<ResponseStatus, string> = {
  reported: "Reported",
  assigned: "Assigned",
  accepted: "Accepted",
  en_route: "En route",
  on_scene: "On scene",
  assisting: "Assisting",
  resolved: "Resolved",
};

export type Tone = "pending" | "active" | "done";
export const statusTone = (status: ResponseStatus): Tone => (status === "reported" ? "pending" : status === "resolved" ? "done" : "active");

export type ResponseEvent = {
  id: string;
  incidentId: string;
  status: ResponseStatus;
  unitId: string | null;
  at: string;
  actor: "dispatcher" | "responder";
  note: string | null;
};

export type Unit = {
  id: string;
  name: string;
  service: Service;
  agency: string;
  point: LatLng | null;
  outOfService: boolean;
  /** Only set when a routing provider supplied it. Never estimated here. */
  route: { etaMin: number; miles: number } | null;
  /** Added by the dispatcher in this browser (src/roster.ts). */
  local?: boolean;
};

export type Assignment = { id: string; incidentId: string; unitId: string; service: Service; at: string };

export type ResponseState = { status: ResponseStatus; events: ResponseEvent[]; assignments: Assignment[] };

const byTime = <T>(get: (item: T) => string) => (a: T, b: T) => parseTime(get(a)) - parseTime(get(b));

export function responseOf(incidentId: string, events: ResponseEvent[], assignments: Assignment[]): ResponseState {
  const own = events.filter((event) => event.incidentId === incidentId).sort(byTime((event) => event.at));
  // With several units on one incident, the incident is as far along as its most advanced unit.
  return {
    status: own.reduce<ResponseStatus>((max, event) => (STEPS.indexOf(event.status) > STEPS.indexOf(max) ? event.status : max), "reported"),
    events: own,
    assignments: assignments.filter((assignment) => assignment.incidentId === incidentId),
  };
}

export type UnitState = { kind: "available" } | { kind: "assigned"; incidentId: string } | { kind: "out_of_service" };

export function unitState(unit: Unit, assignments: Assignment[], statusOf: (incidentId: string) => ResponseStatus): UnitState {
  if (unit.outOfService) return { kind: "out_of_service" };
  const busy = assignments.find((assignment) => assignment.unitId === unit.id && statusOf(assignment.incidentId) !== "resolved");
  return busy ? { kind: "assigned", incidentId: busy.incidentId } : { kind: "available" };
}

export type RankedUnit = { unit: Unit; state: UnitState; miles: number | null; etaMin: number | null };
export type RankBasis = "route" | "straight" | "none";

const KM_TO_MI = 0.621371;

/** Available units first, then by routed travel time if every candidate has one, else straight-line distance. */
export function rankUnits(units: Unit[], states: Map<string, UnitState>, target: LatLng | null): { ranked: RankedUnit[]; basis: RankBasis } {
  const ranked = units.map((unit) => ({
    unit,
    state: states.get(unit.id) ?? ({ kind: "available" } as UnitState),
    miles: unit.route?.miles ?? (unit.point && target ? distanceKm(unit.point, target) * KM_TO_MI : null),
    etaMin: unit.route?.etaMin ?? null,
  }));
  const available = ranked.filter((item) => item.state.kind === "available");
  const basis: RankBasis = available.length && available.every((item) => item.etaMin !== null) ? "route" : available.some((item) => item.miles !== null) ? "straight" : "none";
  const key = (item: RankedUnit) => (basis === "route" ? item.etaMin : item.miles) ?? Infinity;
  ranked.sort((a, b) => Number(b.state.kind === "available") - Number(a.state.kind === "available") || key(a) - key(b));
  return { ranked, basis };
}

/** Mean time from report to first "on scene" event, for incidents that reached the scene today. */
export function averageResponseSeconds(incidents: { id: string; created_at: string }[], events: ResponseEvent[], now: number): { seconds: number; count: number } | null {
  const today = new Date(now).toDateString();
  const samples = incidents.flatMap((incident) => {
    const arrived = events
      .filter((event) => event.incidentId === incident.id && event.status === "on_scene")
      .sort(byTime((event) => event.at))[0];
    if (!arrived || new Date(parseTime(arrived.at)).toDateString() !== today) return [];
    return [(parseTime(arrived.at) - parseTime(incident.created_at)) / 1000];
  });
  if (!samples.length) return null;
  return { seconds: samples.reduce((sum, value) => sum + value, 0) / samples.length, count: samples.length };
}

/** Distance text that says what it is: routed ETA only when a routing provider gave one, else straight-line. */
export function travelText(item: RankedUnit): string {
  if (item.etaMin !== null) return `${item.etaMin} min · ${item.miles !== null ? miles(item.miles) : "distance unknown"} by road`;
  if (item.miles !== null) return `${miles(item.miles)} straight-line · no ETA`;
  return "Position unknown";
}
