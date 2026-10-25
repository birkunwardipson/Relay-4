import type { ReactNode } from "react";
import type { Call } from "../intake";
import { STATUS_TEXT, statusTone, type ResponseStatus } from "../response";
import { isVehicle, SERVICE_ICON, SEVERITY, SEVERITY_LABEL, serviceOf } from "../services";
import { Icon, type IconName } from "./Icon";

// Severity is a filled pill (how serious); response status is a dot + text (where the response is).
// Both always carry a text label; colour is never the only signal.

export function SeverityBadge({ call }: { call: Call }) {
  const severity = SEVERITY[call.priority];
  return (
    <span className={`severity ${severity}`} title={`Suggested from the reported facts: ${call.reasons.join("; ")}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: ResponseStatus; label?: string }) {
  return (
    <span className={`status ${statusTone(status)}`}>
      <i aria-hidden="true" />
      {label ?? (status === "reported" ? "Awaiting dispatch" : STATUS_TEXT[status])}
    </span>
  );
}

export function Pill({ tone, children }: { tone: "neutral" | "pending" | "active" | "done" | "danger"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

/** Round icon tile for an incident, coloured by its suggested service. */
export function IncidentGlyph({ call, size = 44 }: { call: Call; size?: number }) {
  const service = serviceOf(call.incident);
  const icon: IconName = isVehicle(call.incident) ? "car" : service ? SERVICE_ICON[service] : "alert";
  return (
    <span className={`glyph ${service ?? "other"}`} style={{ width: size, height: size }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
