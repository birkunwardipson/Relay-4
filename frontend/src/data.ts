import { createContext, useContext, useEffect, useState } from "react";
import { createUnit, deleteUnit, patchUnit, postAssignment, postResponseEvent, type NewUnit } from "./api";
import { demoAssign, demoLogStatus, demoRecording, useDemoState } from "./demo/store";
import { useDispatchFeed, useGeocodes, useIncidentDetail, useIncidents, useNow, type Connection, type DetailState, type DispatchFeed } from "./hooks";
import { buildCalls, type Call } from "./intake";
import { addRosterUnit, removeRosterUnit, updateRosterUnit, useRoster } from "./roster";
import type { DataMode } from "./mode";
import type { RecordingView } from "./recording";
import { responseOf, unitState, type Assignment, type ResponseEvent, type ResponseState, type ResponseStatus, type Unit, type UnitState } from "./response";
import type { Incident } from "./types";

/** Responder, assignment and response-status data. Null only when the live backend predates the dispatch API. */
export type Dispatch = {
  units: Unit[];
  assignments: Assignment[];
  events: ResponseEvent[];
  responseOf: (incidentId: string) => ResponseState;
  unitStates: Map<string, UnitState>;
  assign: (incidentId: string, unitId: string) => Promise<Assignment>;
  logStatus: (incidentId: string, unitId: string, status: ResponseStatus) => Promise<void>;
};

export type AppData = {
  mode: DataMode;
  connection: Connection | "demo";
  lastSync: number | null;
  error: string | null;
  calls: Call[];
  now: number;
  /** Every known unit. Live: the backend's roster. Demo: demo units plus responders added in this browser. */
  units: Unit[];
  unitStates: Map<string, UnitState>;
  dispatch: Dispatch | null;
  roster: RosterActions;
};

/** Adding, moving and removing responders. Live writes go to the backend and need the dispatcher key. */
export type RosterActions = {
  add: (unit: NewUnit) => Promise<void>;
  update: (id: string, change: Partial<Pick<Unit, "point" | "outOfService">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  canEdit: (unit: Unit) => boolean;
};

const BROWSER_ROSTER: RosterActions = {
  add: async (unit) => addRosterUnit(unit),
  update: async (id, change) => updateRosterUnit(id, change),
  remove: async (id) => removeRosterUnit(id),
  canEdit: (unit) => Boolean(unit.local),
};

export const DataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const data = useContext(DataContext);
  if (!data) throw new Error("useAppData outside DataContext");
  return data;
}

const NO_INCIDENTS: Incident[] = [];
const EMPTY_FEED: DispatchFeed = { units: [], assignments: [], events: [] };

export function useDataSource(mode: DataMode): AppData {
  const now = useNow();
  const live = useIncidents(mode === "live");
  const points = useGeocodes(mode === "live" ? live.incidents : NO_INCIDENTS);
  const feed = useDispatchFeed(mode === "live");
  const demo = useDemoState();
  const roster = useRoster();

  if (mode === "live") {
    const calls = buildCalls(live.incidents, points, now);
    const base = { mode, connection: live.connection, lastSync: live.lastSync, error: live.error, calls, now };
    if (!feed.supported) {
      // Older backend without the dispatch API: show the browser roster, and nothing can be assigned.
      const unitStates = new Map(roster.map((unit): [string, UnitState] => [unit.id, unit.outOfService ? { kind: "out_of_service" } : { kind: "available" }]));
      return { ...base, units: roster, unitStates, dispatch: null, roster: BROWSER_ROSTER };
    }
    const { units, assignments, events } = feed.feed ?? EMPTY_FEED;
    const statusOf = (id: string) => responseOf(id, events, assignments).status;
    const unitStates = new Map(units.map((unit) => [unit.id, unitState(unit, assignments, statusOf)]));
    // Each write re-polls at once so the result shows without waiting for the next tick.
    const after = <T,>(request: Promise<T>) => request.finally(feed.refresh);
    return {
      ...base,
      units,
      unitStates,
      dispatch: {
        units,
        assignments,
        events,
        responseOf: (id) => responseOf(id, events, assignments),
        unitStates,
        assign: (incidentId, unitId) => after(postAssignment(incidentId, unitId)),
        logStatus: (incidentId, unitId, status) => after(postResponseEvent(incidentId, unitId, status, "Manual entry")).then(() => undefined),
      },
      roster: {
        add: (unit) => after(createUnit(unit)).then(() => undefined),
        update: (id, change) => after(patchUnit(id, change)).then(() => undefined),
        remove: (id) => after(deleteUnit(id)),
        canEdit: () => true,
      },
    };
  }

  const statusOf = (id: string) => responseOf(id, demo.events, demo.assignments).status;
  const units = [...demo.units, ...roster];
  const unitStates = new Map(units.map((unit) => [unit.id, unitState(unit, demo.assignments, statusOf)]));
  return {
    mode,
    connection: "demo",
    lastSync: null,
    error: null,
    calls: buildCalls(demo.incidents, demo.points, now),
    now,
    units,
    unitStates,
    dispatch: {
      units,
      assignments: demo.assignments,
      events: demo.events,
      responseOf: (id) => responseOf(id, demo.events, demo.assignments),
      unitStates,
      assign: demoAssign,
      logStatus: demoLogStatus,
    },
    roster: BROWSER_ROSTER,
  };
}

/** Caller statements and agent field history for one incident. */
export function useDetail(id: string | null, updatedAt: string | undefined): DetailState & { loading: boolean } {
  const { mode } = useAppData();
  const demo = useDemoState();
  const live = useIncidentDetail(mode === "live" ? id : null, updatedAt);
  if (mode === "demo") {
    const detail = demo.incidents.find((incident) => incident.id === id) ?? null;
    return { detail, error: null, notFound: Boolean(id) && !detail, loading: false };
  }
  return { ...live, loading: Boolean(id) && !live.detail && !live.error };
}

/** Stored call recording for an incident. Live mode: the backend has no recording endpoint, so it says so. */
export function useRecording(incident: Incident | null, callInProgress: boolean): RecordingView {
  const { mode } = useAppData();
  const [demo, setDemo] = useState<{ id: string; view: RecordingView } | null>(null);
  const id = incident?.id ?? null;

  useEffect(() => {
    if (mode !== "demo" || !id) return;
    let cancelled = false;
    demoRecording(id)
      .then((view) => !cancelled && setDemo({ id, view }))
      .catch((caught) => !cancelled && setDemo({ id, view: { state: "error", message: caught instanceof Error ? caught.message : "Could not load recording" } }));
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  if (!incident) return { state: "no_conversation" };
  if (mode === "demo") return demo?.id === id ? demo.view : { state: "loading" };
  if (!incident.conversation_id) return { state: "no_conversation" };
  if (callInProgress) return { state: "in_progress" };
  return { state: "unsupported" };
}
