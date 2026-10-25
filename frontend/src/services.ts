import type { IconName } from "./components/Icon";
import type { Priority } from "./intake";
import type { Incident } from "./types";

export type Service = "fire" | "police" | "medical";
export const SERVICES: Service[] = ["fire", "police", "medical"];
export const SERVICE_LABEL: Record<Service, string> = { fire: "Fire", police: "Police", medical: "Medical" };
export const SERVICE_ICON: Record<Service, IconName> = { fire: "fire", police: "police", medical: "medical" };
/** Responder-side name of each service. */
export const UNIT_SERVICE_LABEL: Record<Service, string> = { fire: "Fire", police: "Police", medical: "Ambulance" };

// Rule-based suggestion from the reported facts; the dispatcher can assign any service.
const PATTERNS: [RegExp, Service][] = [
  [/fire|smoke|burn|explos|gas.leak|hazmat|chemical|rising.water|flood|drown|swept|submerged|stranded/i, "fire"],
  [/shoot|gun|weapon|stab|assault|robbery|fight|suspicious|theft|burglar|collision|crash|traffic/i, "police"],
  [/medical|injur|breath|unconscious|unresponsive|cardiac|chest|stroke|seizure|bleeding|collapsed|overdose|hurt|fell|fall|fracture|broken/i, "medical"],
];

/** The incident type decides first; the rest of the report only if the type says nothing. */
export function serviceOf(incident: Incident): Service | null {
  const type = incident.incident_type?.replaceAll("_", " ") ?? "";
  const rest = [incident.hazard, incident.description, incident.injuries].filter(Boolean).join(" ");
  for (const text of [type, rest]) {
    const hit = PATTERNS.find(([pattern]) => pattern.test(text));
    if (hit) return hit[1];
  }
  return null;
}

export const isVehicle = (incident: Incident) => /collision|crash|vehicle|traffic/i.test(incident.incident_type ?? "");

export type Severity = "critical" | "major" | "minor";
export const SEVERITY: Record<Priority, Severity> = { 1: "critical", 2: "major", 3: "minor" };
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", major: "Major", minor: "Minor" };

/** Live ids are UUIDs; show a short reference. Demo ids are already INC-xxxx. */
export const codeOf = (id: string) => (id.startsWith("INC-") ? id : `#${id.slice(0, 8).toUpperCase()}`);
