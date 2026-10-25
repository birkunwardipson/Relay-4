import { useSyncExternalStore } from "react";
import type { Unit } from "./response";
import type { LatLng } from "./types";

// Responders the dispatcher adds by hand, at a location the dispatcher sets. The backend has no responder API,
// so this roster lives in this browser (localStorage) and is used by both data sources. Positions are only ever
// what was entered here; nothing moves them.
const KEY = "relay4.roster.v1";
const listeners = new Set<() => void>();

let units: Unit[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Unit[];
  } catch {
    return [];
  }
})();

function commit(next: Unit[]) {
  units = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(units));
  } catch {
    // Storage unavailable; the roster lasts for this page load.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useRoster = () => useSyncExternalStore(subscribe, () => units);
export const getRoster = () => units;

export function addRosterUnit(unit: Pick<Unit, "name" | "service" | "agency" | "point" | "outOfService">) {
  commit([...units, { ...unit, id: `local-${Date.now().toString(36)}`, route: null, local: true }]);
}

export const updateRosterUnit = (id: string, change: Partial<Pick<Unit, "point" | "outOfService">>) =>
  commit(units.map((unit) => (unit.id === id ? { ...unit, ...change } : unit)));

export const removeRosterUnit = (id: string) => commit(units.filter((unit) => unit.id !== id));

export type { LatLng };
