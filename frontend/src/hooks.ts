import { useEffect, useState } from "react";
import { ApiError, fetchAssignments, fetchIncident, fetchIncidents, fetchResponseEvents, fetchUnits } from "./api";
import { geocode } from "./geocode";
import { parseTime } from "./format";
import type { Assignment, ResponseEvent, Unit } from "./response";
import type { Incident, IncidentDetail, LatLng } from "./types";

const POLL_MS = 2000;

export type Connection = "connecting" | "online" | "offline";

/** Polls the backend while enabled. On failure the last good list is kept and marked stale; nothing is substituted. */
export function useIncidents(enabled: boolean) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const list = await fetchIncidents();
        if (cancelled) return;
        setIncidents(list.sort((a, b) => parseTime(b.updated_at) - parseTime(a.updated_at)));
        setConnection("online");
        setLastSync(Date.now());
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setConnection("offline");
        setError(caught instanceof Error ? caught.message : "Request failed");
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return { incidents, connection, lastSync, error };
}

export type DispatchFeed = { units: Unit[]; assignments: Assignment[]; events: ResponseEvent[] };

/**
 * Responders, assignments and response events, polled with the incidents. `supported` is false when the backend
 * predates these endpoints (404), so the UI can say so instead of showing an empty roster. `refresh` re-polls at
 * once, used right after a write so the change shows without waiting for the next tick.
 */
export function useDispatchFeed(enabled: boolean) {
  const [feed, setFeed] = useState<DispatchFeed | null>(null);
  const [supported, setSupported] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const [units, assignments, events] = await Promise.all([fetchUnits(), fetchAssignments(), fetchResponseEvents()]);
        if (cancelled) return;
        setFeed({ units, assignments, events });
        setSupported(true);
      } catch (caught) {
        // Keep the last good copy; connection state comes from the incident poll.
        if (!cancelled && caught instanceof ApiError && caught.status === 404) setSupported(false);
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, tick]);

  return { feed, supported, refresh: () => setTick((value) => value + 1) };
}

export type DetailState ={ detail: IncidentDetail | null; error: string | null; notFound: boolean };

/** Full record (caller statements and field history) for one incident; refetched when the incident changes. */
export function useIncidentDetail(id: string | null, updatedAt: string | undefined): DetailState {
  const [result, setResult] = useState<{ id: string; detail: IncidentDetail | null; error: string | null; notFound: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchIncident(id)
      .then((detail) => !cancelled && setResult({ id, detail, error: null, notFound: false }))
      .catch((caught) => {
        if (cancelled) return;
        const notFound = caught instanceof ApiError && caught.status === 404;
        // Keep the previous copy of this incident if a refresh fails.
        setResult((prev) => ({ id, detail: prev?.id === id ? prev.detail : null, error: caught instanceof Error ? caught.message : "Request failed", notFound }));
      });
    return () => {
      cancelled = true;
    };
  }, [id, updatedAt]);

  return result && result.id === id ? result : { detail: null, error: null, notFound: false };
}

/** location text → coordinates. Missing key = still looking up; null = not found. */
export function useGeocodes(incidents: Incident[]) {
  const [points, setPoints] = useState<Record<string, LatLng | null>>({});
  const key = [...new Set(incidents.map((incident) => incident.location).filter(Boolean))].join("\n");

  useEffect(() => {
    let cancelled = false;
    for (const location of key.split("\n").filter(Boolean)) {
      geocode(location).then((point) => {
        if (!cancelled) setPoints((prev) => (location in prev && prev[location] === point ? prev : { ...prev, [location]: point }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key]);

  return points;
}

export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
