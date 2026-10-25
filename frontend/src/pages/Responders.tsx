import { useRef, useState, type FormEvent } from "react";
import { Notice, ResponderCard } from "../components/Cards";
import { Icon } from "../components/Icon";
import { MapView, type MapUnit } from "../components/MapView";
import { useAppData } from "../data";
import { geocode } from "../geocode";
import { rankUnits, type UnitState } from "../response";
import { addRosterUnit, removeRosterUnit, updateRosterUnit } from "../roster";
import { href, navigate, useRoute } from "../router";
import { codeOf, SERVICE_ICON, SERVICES, UNIT_SERVICE_LABEL, type Service } from "../services";
import type { LatLng } from "../types";

const STATES: { key: UnitState["kind"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "assigned", label: "Assigned" },
  { key: "out_of_service", label: "Out of service" },
];

export function Responders() {
  const { units, unitStates, calls, mode } = useAppData();
  const { params } = useRoute();
  const service = (params.get("service") ?? "all") as Service | "all";
  const state = (params.get("state") ?? "all") as UnitState["kind"] | "all";
  const adding = params.get("add") === "1";
  const [draft, setDraft] = useState<LatLng | null>(null);
  const setAdding = (open: boolean) => navigate("responders", { service, state, add: open ? "1" : null }, { replace: true });

  const { ranked } = rankUnits(units, unitStates, null);
  const shown = ranked.filter((item) => (service === "all" || item.unit.service === service) && (state === "all" || item.state.kind === state));
  const mapUnits: MapUnit[] = shown
    .filter((item): item is typeof item & { unit: { point: LatLng } } => Boolean(item.unit.point))
    .map((item) => ({ unit: item.unit as MapUnit["unit"], state: item.state.kind }));
  const unplaced = shown.filter((item) => !item.unit.point).length;

  return (
    <div className="page responders">
      <section className="card" aria-labelledby="rmap-h">
        <div className="card-head">
          <h2 id="rmap-h">Responder locations</h2>
          <button className="btn primary" onClick={() => setAdding(!adding)} aria-expanded={adding} aria-controls="add-responder">
            <Icon name={adding ? "x" : "plusCircle"} /> {adding ? "Close" : "Add responder"}
          </button>
        </div>
        {adding && <AddResponder draft={draft} setDraft={setDraft} defaultService={service === "all" ? "fire" : service} onDone={() => { setDraft(null); setAdding(false); }} />}
        <MapView
          calls={calls.filter((call) => call.point)}
          units={mapUnits}
          className="map-responders"
          label={adding ? "Click the map to place the new responder" : mode === "demo" ? "OpenStreetMap · demo + added responders" : "OpenStreetMap · responders added in this browser"}
          onPick={adding ? setDraft : undefined}
          draft={adding ? draft : null}
        />
        <div className="legend">
          <span><i className="lg-unit available" /> Available</span>
          <span><i className="lg-unit assigned" /> Assigned / out of service</span>
          <span className="muted">Incidents shown for reference</span>
          {unplaced > 0 && <span className="warn-text">{unplaced} without a location</span>}
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Filter by service">
            {(["all", ...SERVICES] as const).map((s) => (
              <button key={s} className={`chip${service === s ? " on" : ""}`} aria-pressed={service === s} onClick={() => navigate("responders", { service: s, state, add: adding ? "1" : null }, { replace: true })}>
                {s === "all" ? "All services" : UNIT_SERVICE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Filter by availability">
            {STATES.map((item) => (
              <button key={item.key} className={`chip${state === item.key ? " on" : ""}`} aria-pressed={state === item.key} onClick={() => navigate("responders", { service, state: item.key, add: adding ? "1" : null }, { replace: true })}>
                {item.label}
              </button>
            ))}
          </div>
          {mode === "live" && (
            <p className="small muted">The backend has no responder API. Responders here are the ones you added in this browser; their availability is what you set.</p>
          )}
        </div>
        {!units.length && <Notice title="No responders yet">Use “Add responder” to add a unit and place it on the map.</Notice>}
        {SERVICES.filter((s) => service === "all" || s === service).map((s) => {
          const group = shown.filter((item) => item.unit.service === s);
          return (
            <section key={s} className="unit-group" aria-labelledby={`grp-${s}`}>
              <h2 id={`grp-${s}`} className="line">
                <Icon name={SERVICE_ICON[s]} className={`svc ${s}`} /> {UNIT_SERVICE_LABEL[s]} <span className="muted small">{group.length}</span>
              </h2>
              {group.length ? (
                <ul className="unit-rows">
                  {group.map((item) => (
                    <li key={item.unit.id} className="unit-option static">
                      <ResponderCard item={item} />
                      <div className="unit-actions">
                        {item.unit.point ? (
                          <span className="muted small mono">{item.unit.point[0].toFixed(4)}, {item.unit.point[1].toFixed(4)}</span>
                        ) : (
                          <span className="warn-text small">No location</span>
                        )}
                        {item.state.kind === "assigned" && (
                          <a className="link" href={href("incidents", { id: item.state.incidentId })}>
                            Open {codeOf(item.state.incidentId)} <Icon name="chevron" size={16} />
                          </a>
                        )}
                        {item.unit.local && (
                          <>
                            <label className="check small">
                              <input type="checkbox" checked={item.unit.outOfService} onChange={(event) => updateRosterUnit(item.unit.id, { outOfService: event.target.checked })} />
                              Out of service
                            </label>
                            <button className="btn small" onClick={() => removeRosterUnit(item.unit.id)} disabled={item.state.kind === "assigned"} title={item.state.kind === "assigned" ? "Unit is on an incident" : undefined}>
                              Remove {item.unit.name}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No units match.</p>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}

function AddResponder({ draft, setDraft, defaultService, onDone }: { draft: LatLng | null; setDraft: (point: LatLng | null) => void; defaultService: Service; onDone: () => void }) {
  const [name, setName] = useState("");
  const [service, setService] = useState<Service>(defaultService);
  const [agency, setAgency] = useState("");
  const [address, setAddress] = useState("");
  const [lookup, setLookup] = useState<{ kind: "idle" | "pending" | "notfound" }>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const find = async () => {
    if (!address.trim()) return;
    setLookup({ kind: "pending" });
    const point = await geocode(address);
    setLookup({ kind: point ? "idle" : "notfound" });
    if (point) setDraft(point);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a unit name.");
      nameRef.current?.focus();
      return;
    }
    if (!draft) {
      setError("Set the location: click the map or look up an address.");
      return;
    }
    addRosterUnit({ name: name.trim(), service, agency: agency.trim() || "Added by dispatcher", point: draft, outOfService: false });
    onDone();
  };

  return (
    <form id="add-responder" className="add-responder" onSubmit={submit} noValidate>
      <label>
        <span>Unit name</span>
        <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Engine 21" required autoFocus />
      </label>
      <label>
        <span>Service</span>
        <select value={service} onChange={(event) => setService(event.target.value as Service)}>
          {SERVICES.map((s) => <option key={s} value={s}>{UNIT_SERVICE_LABEL[s]}</option>)}
        </select>
      </label>
      <label>
        <span>Agency (optional)</span>
        <input value={agency} onChange={(event) => setAgency(event.target.value)} placeholder="e.g. City Fire Dept." />
      </label>
      <div className="address">
        <label>
          <span>Location</span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                find();
              }
            }}
            placeholder="Station address in Louisiana, or click the map"
          />
        </label>
        <button type="button" className="btn" onClick={find} disabled={lookup.kind === "pending" || !address.trim()}>
          <Icon name="search" size={16} /> {lookup.kind === "pending" ? "Finding…" : "Find"}
        </button>
      </div>
      <p className="small muted full" aria-live="polite">
        {lookup.kind === "notfound"
          ? "Address not found in Louisiana. Try another, or click the map."
          : draft
            ? `Location set: ${draft[0].toFixed(5)}, ${draft[1].toFixed(5)}. Click the map to adjust.`
            : "No location set yet."}
      </p>
      {error && <p className="small error-text full" role="alert">{error}</p>}
      <div className="full row-end">
        <button type="submit" className="btn primary">
          <Icon name="check" /> Add to map
        </button>
      </div>
    </form>
  );
}
