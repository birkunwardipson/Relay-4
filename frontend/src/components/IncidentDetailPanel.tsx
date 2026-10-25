import { useAppData, useRecording } from "../data";
import type { DetailState } from "../hooks";
import { clock, humanize, STATUS_LABEL } from "../format";
import type { Call } from "../intake";
import type { Pick } from "../pages/Incidents";
import { href } from "../router";
import { codeOf, SEVERITY, SEVERITY_LABEL } from "../services";
import type { LatLng } from "../types";
import { IncidentGlyph, Pill, SeverityBadge } from "./Badges";
import { CallRecording } from "./CallRecording";
import { Notice } from "./Cards";
import { Icon, type IconName } from "./Icon";
import { MapView, type MapUnit } from "./MapView";
import { ResponseTimeline } from "./ResponseTimeline";

type Props = { call: Call; detail: DetailState & { loading: boolean }; pick: Pick };

export function IncidentDetailPanel({ call, detail, pick }: Props) {
  const { dispatch, mode, units: allUnits, unitStates } = useAppData();
  const { incident, point, parish, live, reasons, facts, related } = call;
  const recording = useRecording(incident, live);
  const response = dispatch?.responseOf(incident.id) ?? null;
  const severity = SEVERITY[call.priority];

  // Every responder with a known location; those outside the service being assigned are dimmed.
  const units: MapUnit[] = allUnits
    .filter((unit): unit is typeof unit & { point: LatLng } => Boolean(unit.point))
    .map((unit) => ({ unit, state: unitStates.get(unit.id)?.kind ?? "available", dim: unit.service !== pick.service }));

  return (
    <article className="incident-detail" aria-labelledby="incident-title">
      <header className="detail-head">
        <IncidentGlyph call={call} size={52} />
        <div className="detail-title">
          <h2 id="incident-title">
            {humanize(incident.incident_type, "Unclassified incident")} <SeverityBadge call={call} />
            {live ? (
              <Pill tone="danger">● Call in progress</Pill>
            ) : incident.conversation_id ? (
              <Pill tone="neutral">● Call ended</Pill>
            ) : null}
          </h2>
          <p className="addr">
            <Icon name="pin" size={18} />
            <span>
              {incident.location ?? "Location not reported yet"}
              {incident.landmark && <span className="muted"> · {incident.landmark}</span>}
            </span>
            {incident.location &&
              (incident.location_confirmed ? (
                <span className="ok-text line"><Icon name="checkCircle" size={18} /> Location confirmed</span>
              ) : (
                <span className="warn-text line"><Icon name="alert" size={18} /> Not confirmed by caller</span>
              ))}
          </p>
        </div>
        <div className="detail-id">
          <strong>{codeOf(incident.id)}</strong>
          <span className="muted small">Intake: {STATUS_LABEL[incident.status]}</span>
        </div>
      </header>

      {detail.error && <Notice tone="error" title="Could not refresh incident details">{detail.error}</Notice>}

      <section>
        <h3>Summary</h3>
        {incident.description ? (
          <p>{incident.description}</p>
        ) : factSummary(incident) ? (
          <p>
            {factSummary(incident)} <span className="muted small">(built from what the caller has said so far; the agent has not sent a summary yet)</span>
          </p>
        ) : (
          <p className="muted">Nothing reported yet.</p>
        )}
      </section>

      <div className="facts-grid">
        <Fact icon="alert" label="Incident type" value={humanize(incident.incident_type)} />
        <Fact icon="users" label="People reported" value={incident.people_count == null ? "Unknown" : `${incident.people_count} ${incident.people_count === 1 ? "person" : "people"}`} />
        <Fact icon="medical" label="Injuries" value={incident.injuries ?? "Unknown"} />
        <Fact icon="fire" label="Hazards" value={humanize(incident.hazard)} />
      </div>

      <p className="small muted reasons">
        <b className={`sev-text ${severity}`}>{SEVERITY_LABEL[severity]} (suggested):</b> {reasons.join("; ")}. The dispatcher decides.
      </p>

      <MapView
        calls={[call]}
        units={units}
        selectedId={incident.id}
        chosenUnitId={pick.unitId}
        className="map-detail"
        label={mode === "demo" ? "OpenStreetMap · demo positions" : "OpenStreetMap · geocoded from caller's words"}
      />
      <p className="small muted">
        {point
          ? `${point[0].toFixed(5)}, ${point[1].toFixed(5)}${parish ? ` · ${parish}` : ""} · geocoded from the reported location${incident.location_confirmed ? "" : ", not yet confirmed"}`
          : !incident.location
            ? "No location yet. Ask the caller for an address, cross street or landmark."
            : point === undefined
              ? "Locating on the map…"
              : "Location could not be found on the map. Ask for a cross street, parish or nearby landmark."}
      </p>

      {facts.asks.length > 0 && (
        <section>
          <h3>Still to ask <span className="muted small">{facts.known}/{facts.total} key facts known</span></h3>
          <ul className="asks">
            {facts.asks.map((ask) => <li key={ask}>{ask}</li>)}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section>
          <h3>Possibly the same incident <span className="muted small">confirm before linking</span></h3>
          <ul className="related">
            {related.map((item) => (
              <li key={item.id}>
                <a href={href("incidents", { id: item.id })}>
                  {codeOf(item.id)} · {humanize(item.label)} <span className="muted">{item.detail}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Incident response progress</h3>
        {response ? (
          <ResponseTimeline status={response.status} events={response.events} reportedAt={incident.created_at} />
        ) : (
          <Notice title="Response tracking not connected">
            Reported {clock(incident.created_at)}. Assignment and unit status need responder events from the backend.
          </Notice>
        )}
      </section>

      {detail.loading ? (
        <p className="empty" aria-busy="true">Loading call details…</p>
      ) : (
        <CallRecording view={recording} evidence={detail.detail?.evidence ?? []} conversationId={incident.conversation_id} demo={mode === "demo"} />
      )}
    </article>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className={`fact${value === "Unknown" ? " unknown" : ""}`}>
      <Icon name={icon} />
      <span>
        <strong>{value}</strong>
        <span className="muted small">{label}</span>
      </span>
    </div>
  );
}

/** Plain-text summary of the facts so far, for a call still in progress before the agent's own description. */
function factSummary(incident: Call["incident"]): string | null {
  const parts = [
    (incident.incident_type || incident.location) &&
      `${humanize(incident.incident_type, "Incident")}${incident.location ? ` at ${incident.location}` : ""}${incident.landmark ? ` (${incident.landmark})` : ""}.`,
    incident.people_count != null && `${incident.people_count} ${incident.people_count === 1 ? "person" : "people"} involved.`,
    incident.hazard && `Hazard: ${humanize(incident.hazard).toLowerCase()}.`,
    incident.injuries && `Injuries: ${incident.injuries}.`,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
