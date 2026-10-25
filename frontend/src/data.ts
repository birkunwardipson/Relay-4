import { createContext, useContext, useEffect, useState } from "react";
import { demoAssign, demoLogStatus, demoRecording, useDemoState } from "./demo/store";
import { useGeocodes, useIncidentDetail, useIncidents, useNow, type Connection, type DetailState } from "./hooks";
import { buildCalls, type Call } from "./intake";
import { useRoster } from "./roster";
import type { DataMode } from "./mode";
import type { RecordingView } from "./recording";
import { responseOf, unitState, type Assignment, type ResponseEvent, type ResponseState, type ResponseStatus, type Unit, type UnitState } from "./response";
import type { Incident } from "./types";

/** Responder, assignment and response-status data. Null in live mode: the backend has no such API yet. */
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
  /** Every known unit: the data source's own plus responders added in this browser. */
  units: Unit[];
  unitStates: Map<string, UnitState>;
  dispatch: Dispatch | null;
};

export const DataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const data = useContext(DataContext);
  if (!data) throw new Error("useAppData outside DataContext");
  return data;
}

const NO_INCIDENTS: Incident[] = [];

export function useDataSource(mode: DataMode): AppData {
  const now = useNow();
  const live = useIncidents(mode === "live");
  const points = useGeocodes(mode === "live" ? live.incidents : NO_INCIDENTS);
  const demo = useDemoState();
  const roster = useRoster();

  if (mode === "live") {
    // No assignment data in live mode: a unit is available unless the dispatcher marked it out of service.
    const unitStates = new Map(roster.map((unit): [string, UnitState] => [unit.id, unit.outOfService ? { kind: "out_of_service" } : { kind: "available" }]));
    return { mode, connection: live.connection, lastSync: live.lastSync, error: live.error, calls: buildCalls(live.incidents, points, now), now, units: roster, unitStates, dispatch: null };
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
