import { IncidentGlyph, SeverityBadge, StatusBadge } from "../components/Badges";
import { ActivityFeed, Notice, SummaryCard, type FeedItem } from "../components/Cards";
import { Icon } from "../components/Icon";
import { MapView, type MapUnit } from "../components/MapView";
import { useAppData } from "../data";
import { ago, duration, humanize, parseTime } from "../format";
import type { Call } from "../intake";
import { averageResponseSeconds, type ResponseEvent, type ResponseStatus } from "../response";
import { href, navigate, useRoute } from "../router";
import { codeOf, SERVICE_ICON, serviceOf, SERVICE_LABEL, SERVICES, UNIT_SERVICE_LABEL, type Service } from "../services";
import type { LatLng } from "../types";

const EVENT_PHRASE: Record<ResponseStatus, string> = {
  reported: "reported",
  assigned: "assigned",
  accepted: "accepted assignment",
  en_route: "en route",
  on_scene: "arrived on scene",
  assisting: "assisting on scene",
  resolved: "cleared · incident resolved",
};

const RESPONDING: ResponseStatus[] = ["assigned", "accepted", "en_route", "on_scene", "assisting"];

export function Overview() {
  const { calls, dispatch, now, mode, units, unitStates } = useAppData();
  const { params } = useRoute();
  const service = (params.get("service") ?? "all") as Service | "all";

  const statusOf = (id: string): ResponseStatus | null => dispatch?.responseOf(id).status ?? null;
  const active = calls.filter((call) => statusOf(call.incident.id) !== "resolved");
  const awaiting = dispatch ? active.filter((call) => statusOf(call.incident.id) === "reported") : null;
  const available = units.filter((unit) => unitStates.get(unit.id)?.kind === "available");
  const average = dispatch ? averageResponseSeconds(calls.map((call) => call.incident), dispatch.events, now) : null;
  const shown = active.filter((call) => service === "all" || serviceOf(call.incident) === service);
  const count = (s: Service) => active.filter((call) => serviceOf(call.incident) === s).length;
  const notOnMap = shown.filter((call) => call.point === null).length;

  const mapUnits: MapUnit[] = units
    .filter((unit): unit is typeof unit & { point: LatLng } => Boolean(unit.point) && (service === "all" || unit.service === service))
    .map((unit) => ({ unit, state: unitStates.get(unit.id)?.kind ?? "available" }));

  return (
    <div className="page overview">
      <section className="summary-row" aria-label="Summary">
        <SummaryCard
          icon="fire" tone="red" title="Active incidents" value={String(active.length)} href={href("incidents", { view: "active" })}
          sub={dispatch ? "Across all services" : "All incidents · no resolved state in backend"}
          definition={dispatch ? "Incidents whose response is not resolved." : "Every incident the backend returns; the backend has no resolved state yet."}
        />
        <SummaryCard
          icon="alert" tone="amber" title="Awaiting dispatch" value={awaiting ? String(awaiting.length) : "—"} href={href("incidents", { view: "awaiting" })}
          sub={awaiting ? (awaiting.length ? <span className="pill pending">Needs attention</span> : "None waiting") : "Needs assignment API"}
          definition="Active incidents with no unit assigned yet."
        />
        <SummaryCard
          icon="truck" tone="teal" title="Available units" value={units.length ? String(available.length) : "—"} href={href("responders", { state: "available" })}
          sub={units.length ? `Of ${units.length} total units` : "No responders added yet"}
          definition="Units in service and not assigned to an unresolved incident."
        />
        <SummaryCard
          icon="clock" tone="gray" title="Avg. response time" value={average ? duration(average.seconds) : "—"} href={href("history", { responded: "today" })}
          sub={dispatch ? (average ? `Today · ${average.count} incident${average.count > 1 ? "s" : ""}${mode === "demo" ? " · demo data" : ""}` : "No arrivals today") : "Needs response events"}
          definition="Mean time from the report to the first unit arriving on scene, for incidents that reached the scene today."
        />
      </section>

      <div className="overview-grid">
        <section className="card map-card area-map" aria-labelledby="map-title">
          <div className="card-head">
            <h2 id="map-title">Incident map</h2>
            <div className="chips" role="group" aria-label="Filter map by service">
              <FilterChip label={`All services (${active.length})`} on={service === "all"} onClick={() => navigate("overview", {}, { replace: true })} />
              {SERVICES.map((s) => (
                <FilterChip key={s} label={`${SERVICE_LABEL[s]} (${count(s)})`} on={service === s} onClick={() => navigate("overview", { service: s }, { replace: true })} />
              ))}
            </div>
          </div>
          <MapView
            calls={shown}
            units={mapUnits}
            statusOf={statusOf}
            popups
            className="map-overview"
            label={mode === "demo" ? "OpenStreetMap · demo positions" : "OpenStreetMap · geocoded caller locations"}
          />
          <div className="legend">
            <span><i className="lg-pin critical" /> Critical</span>
            <span><i className="lg-pin major" /> Major</span>
            <span><i className="lg-pin minor" /> Minor</span>
            {units.length ? (
              <>
                <span><i className="lg-unit available" /> Available unit</span>
                <span><i className="lg-unit assigned" /> Assigned / unavailable unit</span>
              </>
            ) : (
              <a className="link" href={href("responders", { add: "1" })}>Add responders to show them on the map</a>
            )}
            {notOnMap > 0 && <span className="warn-text">{notOnMap} not on map (location unknown or not found)</span>}
          </div>
        </section>

        <section className="card area-queue" aria-labelledby="queue-title">
          <div className="card-head">
            <h2 id="queue-title">
              Needs dispatch {awaiting && <span className="count-badge">{awaiting.length}</span>}
            </h2>
            <a className="icon-btn" href={href("incidents", { view: awaiting ? "awaiting" : undefined })} aria-label="Open dispatch queue">
              <Icon name="chevron" />
            </a>
          </div>
          {!awaiting && (
            <Notice tone="warn" title="Assignment status not available">
              The backend has no assignment data, so this lists open incidents by suggested severity.
            </Notice>
          )}
          <QueueList calls={prioritise(awaiting ?? active).slice(0, 4)} now={now} empty={awaiting ? "No incidents are waiting for a unit." : "No incidents yet."} />
          <a className="btn primary block" href={href("incidents", { view: awaiting ? "awaiting" : undefined })}>
            <Icon name="truck" /> Open dispatch queue
          </a>
        </section>

        <section className="card table-card area-table" aria-labelledby="active-title">
          <div className="card-head">
            <h2 id="active-title">Active response</h2>
            <a className="link" href={href("incidents", { view: "responding" })}>
              View all incidents <Icon name="chevron" size={16} />
            </a>
          </div>
          {dispatch ? <ResponseTable calls={active.filter((call) => RESPONDING.includes(statusOf(call.incident.id)!))} /> : <Notice title="Response tracking not connected">Unit status (en route, on scene…) needs responder events from the backend.</Notice>}
        </section>

        <section className="card area-avail" aria-labelledby="avail-title">
          <div className="card-head">
            <h2 id="avail-title">Responder availability</h2>
          </div>
          {units.length ? (
            <>
              <ul className="avail">
                {SERVICES.map((s) => {
                  const pool = units.filter((unit) => unit.service === s);
                  const free = pool.filter((unit) => unitStates.get(unit.id)?.kind === "available").length;
                  return (
                    <li key={s}>
                      <a href={href("responders", { service: s })}>
                        <Icon name={SERVICE_ICON[s]} className={`svc ${s}`} />
                        <span className="avail-name">{UNIT_SERVICE_LABEL[s]}</span>
                        <span className="bar" role="img" aria-label={`${free} of ${pool.length} available`}>
                          <span style={{ width: `${pool.length ? (free / pool.length) * 100 : 0}%` }} />
                        </span>
                        <span className="avail-count">{free} / {pool.length}</span>
                        <Icon name="chevron" size={16} className="chev" />
                      </a>
                    </li>
                  );
                })}
              </ul>
              <a className="link right" href={href("responders")}>View all units <Icon name="arrow" size={16} /></a>
            </>
          ) : (
            <Notice title="No responders yet" action={<a className="btn small" href={href("responders", { add: "1" })}>Add responder</a>}>
              The backend has no responder API. Add units and their locations on the Responders page.
            </Notice>
          )}
        </section>

        <section className="card area-activity" aria-labelledby="activity-title">
          <div className="card-head">
            <h2 id="activity-title">Recent activity</h2>
            <a className="icon-btn" href={href("history")} aria-label="Open call history">
              <Icon name="chevron" />
            </a>
          </div>
          <ActivityFeed items={recentActivity(calls, dispatch?.events ?? [], dispatch?.units ?? []).slice(0, 5)} now={now} empty="No activity yet." />
        </section>
      </div>
    </div>
  );
}

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
}

/** Most severe first, then longest waiting. */
const prioritise = (calls: Call[]) => [...calls].sort((a, b) => a.priority - b.priority || parseTime(a.incident.created_at) - parseTime(b.incident.created_at));

function QueueList({ calls, now, empty }: { calls: Call[]; now: number; empty: string }) {
  if (!calls.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="queue">
      {calls.map((call) => (
        <li key={call.incident.id}>
          <a href={href("incidents", { id: call.incident.id })}>
            <IncidentGlyph call={call} size={40} />
            <span className="queue-body">
              <span className="queue-top">
                <strong>{humanize(call.incident.incident_type, "Unclassified incident")}</strong>
                <SeverityBadge call={call} />
              </span>
              <span className="addr muted small">
                <Icon name="pin" size={14} />
                <span>{call.incident.location ?? "Location unknown"}</span>
              </span>
            </span>
            <time className="muted small" dateTime={call.incident.created_at}>{ago(call.incident.created_at, now)}</time>
            <Icon name="chevron" size={16} className="chev" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function ResponseTable({ calls }: { calls: Call[] }) {
  const { dispatch } = useAppData();
  if (!dispatch) return null;
  if (!calls.length) return <p className="empty">No units are responding right now.</p>;
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Incident</th>
            <th scope="col">Service</th>
            <th scope="col">Status</th>
            <th scope="col">Assigned unit</th>
            <th scope="col">ETA</th>
            <th scope="col"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => {
            const response = dispatch.responseOf(call.incident.id);
            const assigned = response.assignments.map((item) => dispatch.units.find((unit) => unit.id === item.unitId)).filter((unit) => unit !== undefined);
            const services = [...new Set(assigned.map((unit) => unit.service))];
            const arrived = response.status === "on_scene" || response.status === "assisting";
            const routed = assigned.find((unit) => unit.route);
            return (
              <tr key={call.incident.id}>
                <td><a href={href("incidents", { id: call.incident.id })}>{codeOf(call.incident.id)}</a></td>
                <td>
                  <span className="line">
                    {services.map((s) => <Icon key={s} name={SERVICE_ICON[s]} size={16} className={`svc ${s}`} />)}
                    {services.map((s) => UNIT_SERVICE_LABEL[s]).join(", ")}
                  </span>
                </td>
                <td><StatusBadge status={response.status} /></td>
                <td>{assigned.map((unit) => unit.name).join(", ")}</td>
                <td>{arrived ? "Arrived" : routed?.route ? `${routed.route.etaMin} min` : <span className="muted" title="No routing data; ETA is not estimated">No ETA</span>}</td>
                <td>
                  <a className="icon-btn" href={href("incidents", { id: call.incident.id })} aria-label={`Open ${codeOf(call.incident.id)}`}>
                    <Icon name="chevron" size={16} />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function recentActivity(calls: Call[], events: ResponseEvent[], units: { id: string; name: string }[]): FeedItem[] {
  const byId = new Map(calls.map((call) => [call.incident.id, call]));
  const where = (id: string) => {
    const call = byId.get(id);
    return call ? `${codeOf(id)} · ${humanize(call.incident.incident_type, "Unclassified")} · ${call.incident.location ?? "Location unknown"}` : codeOf(id);
  };
  const items: FeedItem[] = calls.map((call) => ({
    id: `${call.incident.id}:reported`,
    at: call.incident.created_at,
    title: "New incident reported via voice agent",
    detail: where(call.incident.id),
    tone: "pending",
  }));
  if (!events.length) {
    for (const call of calls) {
      if (call.incident.updated_at !== call.incident.created_at) {
        items.push({ id: `${call.incident.id}:updated`, at: call.incident.updated_at, title: "Incident details updated", detail: where(call.incident.id), tone: "neutral" });
      }
    }
  }
  for (const event of events) {
    const unit = units.find((item) => item.id === event.unitId)?.name ?? "Unit";
    items.push({
      id: event.id,
      at: event.at,
      title: `${unit} ${EVENT_PHRASE[event.status]}`,
      detail: `${where(event.incidentId)}${event.note ? ` · ${event.note}` : ""}`,
      tone: event.status === "resolved" ? "done" : "active",
    });
  }
  return items.sort((a, b) => parseTime(b.at) - parseTime(a.at));
}
