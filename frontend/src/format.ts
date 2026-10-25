import type { Incident } from "./types";

// A call counts as ongoing while it is still in intake and the agent has sent an
// update recently. The backend has no explicit call-ended event yet.
export const LIVE_WINDOW_MS = 10 * 60 * 1000;

// SQLite returns UTC timestamps without an offset; treat them as UTC.
export function parseTime(value: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

export function isLive(incident: Incident, now: number): boolean {
  return incident.status === "intake" && now - parseTime(incident.updated_at) < LIVE_WINDOW_MS;
}

export function ago(value: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - parseTime(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(parseTime(value)).toLocaleDateString();
}

export function clock(value: string): string {
  return new Date(parseTime(value)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function humanize(value: string | null, fallback = "Unknown"): string {
  if (!value) return fallback;
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const STATUS_LABEL: Record<Incident["status"], string> = {
  intake: "Intake",
  needs_review: "Needs review",
  reviewed: "Reviewed",
};

export function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}m ${String(total % 60).padStart(2, "0")}s` : `${total}s`;
}

/** 0:42 style, for audio. */
export function mmss(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const miles = (value: number) => `${value < 0.1 ? "<0.1" : value.toFixed(1)} mi`;
