import type { Incident, IncidentDetail } from "./types";

// Only endpoints that exist in backend/app/api are called here. Responders, assignments, response status and
// call recordings have no backend endpoints yet; see BACKEND_CONTRACT.md for what the UI needs.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new ApiError(`GET ${path} failed (${response.status})`, response.status);
  return (await response.json()) as T;
}

export const fetchIncidents = () => getJson<Incident[]>("/api/incidents");
export const fetchIncident = (id: string) => getJson<IncidentDetail>(`/api/incidents/${encodeURIComponent(id)}`);
