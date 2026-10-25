import { useSyncExternalStore } from "react";

// "live" reads the Relay4 backend only. "demo" reads a synthetic, in-browser dataset and never calls the backend.
// The two are never mixed: a failing backend shows an offline state, it does not fall back to demo data.
export type DataMode = "live" | "demo";

const KEY = "relay4.mode";
const DEFAULT: DataMode = import.meta.env.VITE_DATA_MODE === "demo" ? "demo" : "live";
const listeners = new Set<() => void>();

let mode: DataMode = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "live" || saved === "demo" ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
})();

export function setMode(next: DataMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage unavailable; the choice lasts for this page load.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useMode = () => useSyncExternalStore(subscribe, () => mode);
