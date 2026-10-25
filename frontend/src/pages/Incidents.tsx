import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ActivityPanel } from "../components/ActivityPanel";
import { AssignPanel } from "../components/AssignPanel";
import { IncidentCard, Notice } from "../components/Cards";
import { Icon } from "../components/Icon";
import { IncidentDetailPanel } from "../components/IncidentDetailPanel";
import { useAppData, useDetail } from "../data";
import type { Call } from "../intake";
import type { ResponseStatus } from "../response";
import { href, navigate, useRoute, type Params } from "../router";
import { codeOf, serviceOf, SERVICE_LABEL, SERVICES, type Service } from "../services";

const VIEWS = {
  active: { label: "Active (not resolved)", test: (s: ResponseStatus) => s !== "resolved" },
  awaiting: { label: "Awaiting dispatch", test: (s: ResponseStatus) => s === "reported" },
  responding: { label: "Units responding", test: (s: ResponseStatus) => s !== "reported" && s !== "resolved" },
  resolved: { label: "Resolved", test: (s: ResponseStatus) => s === "resolved" },
  all: { label: "All incidents", test: () => true },
} as const;
type View = keyof typeof VIEWS;

type Tab = "queue" | "detail" | "respond";
export type Pick = { service: Service; unitId: string | null };

export function Incidents() {
  const { calls, dispatch, now } = useAppData();
  const { params } = useRoute();
  const search = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [showFilters, setShowFilters] = useState(false);

  const q = params.get("q") ?? "";
  const service = (params.get("service") ?? "all") as Service | "all";
  // Live mode has no response status, so only "all" is meaningful there.
  const view: View = dispatch ? ((params.get("view") as View) in VIEWS ? (params.get("view") as View) : "active") : "all";
  const current: Params = { q, service, view: view === "active" ? null : view, id: params.get("id") };
  const go = (next: Params, replace = true) => navigate("incidents", { ...current, ...next }, { replace });

  useEffect(() => {
    if (params.get("focus") !== "search") return;
    search.current?.focus();
    navigate("incidents", { ...current, focus: null }, { replace: true });
  });

  const statusOf = (id: string): ResponseStatus => dispatch?.responseOf(id).status ?? "reported";
  const inView = calls.filter((call) => VIEWS[view].test(statusOf(call.incident.id)));
  const matches = inView.filter((call) => matchesSearch(call, q));
  const listed = matches.filter((call) => service === "all" || serviceOf(call.incident) === service);
  const count = (s: Service | "all") => matches.filter((call) => s === "all" || serviceOf(call.incident) === s).length;

  const selectedId = params.get("id") ?? listed[0]?.incident.id ?? null;
  const selected = calls.find((call) => call.incident.id === selectedId) ?? null;
  const detail = useDetail(selected?.incident.id ?? null, selected?.incident.updated_at);
  const hidden = selected && !listed.includes(selected);

  // Service tab and chosen unit per incident, shared by the map and the assignment panel.
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const pick: Pick = (selectedId && picks[selectedId]) || { service: (selected && serviceOf(selected.incident)) ?? "police", unitId: null };
  const setPick = (next: Pick) => selectedId && setPicks((prev) => ({ ...prev, [selectedId]: next }));

  // Up/Down move between incidents in the queue.
  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a.incident-card")];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = links[Math.max(0, Math.min(links.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="page workspace" data-tab={tab}>
      <div className="ws-tabs" role="tablist" aria-label="Workspace panels">
        {(["queue", "detail", "respond"] as Tab[]).map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? "on" : ""} onClick={() => setTab(name)}>
            {name === "queue" ? `Incidents (${listed.length})` : name === "detail" ? "Incident" : "Respond"}
          </button>
        ))}
      </div>

      <section className="card ws-queue" aria-labelledby="queue-h">
        <h2 id="queue-h">Active incidents</h2>
        <div className="search-row">
          <label className="search">
            <Icon name="search" size={18} />
            <span className="sr-only">Search incidents</span>
            <input ref={search} type="search" placeholder="Search incidents, locations, or IDs…" value={q} onChange={(event) => go({ q: event.target.value || null })} />
          </label>
          <button className={`icon-btn${showFilters ? " on" : ""}`} onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} aria-controls="queue-filters" aria-label="Status filter">
            <Icon name="sliders" />
          </button>
        </div>
        {showFilters && (
          <div id="queue-filters" className="filter-panel">
            {dispatch ? (
              <label>
                <span className="eyebrow">Response status</span>
                <select value={view} onChange={(event) => go({ view: event.target.value === "active" ? null : event.target.value })}>
                  {(Object.keys(VIEWS) as View[]).map((key) => (
                    <option key={key} value={key}>{VIEWS[key].label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="small muted">Status filters need response data from the backend. All incidents are shown.</p>
            )}
          </div>
        )}
        <div className="chips" role="group" aria-label="Filter by service">
          {(["all", ...SERVICES] as const).map((s) => (
            <button key={s} className={`chip${service === s ? " on" : ""}`} aria-pressed={service === s} onClick={() => go({ service: s === "all" ? null : s })}>
              {s === "all" ? "All" : SERVICE_LABEL[s]} ({count(s)})
            </button>
          ))}
        </div>
        {view !== "active" && dispatch && (
          <p className="small muted filter-note">
            Showing: {VIEWS[view].label} · <button className="link" onClick={() => go({ view: null })}>Reset</button>
          </p>
        )}
        {hidden && <p className="small muted filter-note">The open incident ({codeOf(selected.incident.id)}) is hidden by the current filters.</p>}
        {listed.length ? (
          <ul className="incident-list" onKeyDown={onListKey} aria-label="Incident queue">
            {listed.map((call) => (
              <li key={call.incident.id} onClick={() => setTab("detail")}>
                <IncidentCard call={call} now={now} response={dispatch?.responseOf(call.incident.id) ?? null} selected={call === selected} href={href("incidents", { ...current, id: call.incident.id })} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">{calls.length ? "No incidents match these filters." : "No incidents yet. They appear here when the voice agent reports one."}</p>
        )}
      </section>

      <section className="card ws-detail" aria-label="Incident details">
        {selected ? (
          <IncidentDetailPanel call={selected} detail={detail} pick={pick} />
        ) : params.get("id") ? (
          <Notice tone="warn" title="Incident not found">{params.get("id")} is not in the current data source.</Notice>
        ) : (
          <p className="empty">Select an incident to see its details.</p>
        )}
      </section>

      <div className="ws-side">
        {selected && (
          <>
            <AssignPanel key={selected.incident.id} call={selected} pick={pick} onPick={setPick} />
            <ActivityPanel call={selected} detail={detail.detail} />
          </>
        )}
      </div>
    </div>
  );
}

function matchesSearch(call: Call, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const { incident } = call;
  return [codeOf(incident.id), incident.id, incident.incident_type?.replaceAll("_", " "), incident.location, incident.landmark, incident.description, call.parish]
    .some((field) => field?.toLowerCase().includes(needle));
}
