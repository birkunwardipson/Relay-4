import { useRef, useState } from "react";
import { useAppData } from "../data";
import { clock, humanize } from "../format";
import type { Call } from "../intake";
import { setMode } from "../mode";
import { href } from "../router";
import type { Pick } from "../pages/Incidents";
import { rankUnits, STATUS_TEXT, travelText } from "../response";
import { serviceOf, servicesFor, SERVICE_ICON, SERVICES, UNIT_SERVICE_LABEL, type Service } from "../services";
import { StatusBadge } from "./Badges";
import { KeyNeeded, Notice, ResponderCard } from "./Cards";
import { Icon } from "./Icon";

type Result = { kind: "pending"; unit: string } | { kind: "success"; unit: string; at: string } | { kind: "error"; unit: string; message: string } | null;

export function AssignPanel({ call, pick, onPick }: { call: Call; pick: Pick; onPick: (pick: Pick) => void }) {
  const { dispatch, mode, units, unitStates } = useAppData();
  const [result, setResult] = useState<Result>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const suggested = serviceOf(call.incident);

  if (!dispatch) {
    const { ranked } = rankUnits(units.filter((unit) => unit.service === pick.service), unitStates, call.point ?? null);
    return (
      <section className="card assign" aria-labelledby="assign-h">
        <h2 id="assign-h">Nearby responders</h2>
        <div className="segmented" role="group" aria-label="Service">
          {SERVICES.map((s: Service) => (
            <button key={s} className={pick.service === s ? "on" : ""} aria-pressed={pick.service === s} onClick={() => onPick({ service: s, unitId: null })}>
              <Icon name={SERVICE_ICON[s]} size={18} />
              {UNIT_SERVICE_LABEL[s]}
            </button>
          ))}
        </div>
        {ranked.length ? (
          <ul className="unit-rows">
            {ranked.map((item) => (
              <li key={item.unit.id} className="unit-option static">
                <ResponderCard item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No {UNIT_SERVICE_LABEL[pick.service]} responders added yet.</p>
        )}
        <a className="btn block" href={href("responders", { add: "1", service: pick.service })}>
          <Icon name="plusCircle" /> Add responder
        </a>
        <Notice tone="warn" title="Assignment not connected">
          This backend has no assignment API (it predates /api/units and /api/incidents/…/assignments), so nothing can be dispatched from here. Update and
          restart the backend. Responders shown were added in this browser; distances are straight-line.
        </Notice>
        <button className="btn block" onClick={() => setMode("demo")}>
          <Icon name="database" /> Try assignment with demo data
        </button>
      </section>
    );
  }

  const response = dispatch.responseOf(call.incident.id);
  const resolved = response.status === "resolved";
  const { ranked, basis } = rankUnits(
    dispatch.units.filter((unit) => unit.service === pick.service),
    dispatch.unitStates,
    call.point ?? null,
  );
  const onThisIncident = new Set(response.assignments.map((item) => item.unitId));
  const chosen = ranked.find((item) => item.unit.id === pick.unitId && item.state.kind === "available" && !onThisIncident.has(item.unit.id));
  const pending = result?.kind === "pending";
  // Nearest available unit for each service the report calls for and nobody covers yet. The dispatcher still confirms.
  const recommended = servicesFor(call.incident)
    .filter(({ service }) => !response.assignments.some((item) => item.service === service))
    .map(({ service, reason }) => {
      const nearest = rankUnits(dispatch.units.filter((unit) => unit.service === service), dispatch.unitStates, call.point ?? null).ranked;
      return { service, reason, best: nearest.find((item) => item.state.kind === "available" && !onThisIncident.has(item.unit.id)) ?? null };
    });

  const confirm = async () => {
    if (!chosen || pending) return;
    const unit = chosen.unit.name;
    setResult({ kind: "pending", unit });
    try {
      const assignment = await dispatch.assign(call.incident.id, chosen.unit.id);
      setResult({ kind: "success", unit, at: assignment.at });
      onPick({ ...pick, unitId: null });
    } catch (caught) {
      setResult({ kind: "error", unit, message: caught instanceof Error ? caught.message : "The request failed." });
    }
  };

  const addService = () => {
    const covered = new Set(response.assignments.map((item) => item.service));
    const next = SERVICES.find((s) => s !== pick.service && !covered.has(s)) ?? SERVICES[(SERVICES.indexOf(pick.service) + 1) % SERVICES.length];
    onPick({ service: next, unitId: null });
    setResult(null);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-service="${next}"]`)?.focus();
  };

  return (
    <section className="card assign" aria-labelledby="assign-h">
      <h2 id="assign-h">Assign responders</h2>

      <div className="segmented" role="group" aria-label="Service" ref={tabs}>
        {SERVICES.map((s: Service) => (
          <button key={s} data-service={s} className={pick.service === s ? "on" : ""} aria-pressed={pick.service === s} onClick={() => onPick({ service: s, unitId: null })}>
            <Icon name={SERVICE_ICON[s]} size={18} />
            {UNIT_SERVICE_LABEL[s]}
            {s === suggested && <span className="sr-only"> (suggested)</span>}
          </button>
        ))}
      </div>
      {!resolved && recommended.length > 0 && (
        <div className="assigned recommended">
          <h3 className="eyebrow">Recommended response</h3>
          <ul>
            {recommended.map(({ service, reason, best }) => (
              <li key={service}>
                <Icon name={SERVICE_ICON[service]} size={18} className={`svc ${service}`} />
                <span>
                  <strong>{UNIT_SERVICE_LABEL[service]}</strong> <span className="muted small">· {reason}</span>
                  <br />
                  <span className="small">{best ? `${best.unit.name} · ${travelText(best)}` : `No available ${UNIT_SERVICE_LABEL[service].toLowerCase()} unit`}</span>
                </span>
                {best && (
                  <button
                    className="btn small"
                    disabled={pending}
                    onClick={() => {
                      onPick({ service, unitId: best.unit.id });
                      setResult(null);
                    }}
                    aria-pressed={pick.unitId === best.unit.id}
                  >
                    {pick.unitId === best.unit.id ? "Selected" : `Select ${best.unit.name}`}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommended.length === 0 && <p className="small muted">
        {suggested ? (
          <>Suggested: <b>{UNIT_SERVICE_LABEL[suggested]}</b> for a reported {humanize(call.incident.incident_type, "incident").toLowerCase()}. Add other services as needed.</>
        ) : (
          "No service suggested from the report yet; choose what the situation needs."
        )}
      </p>}

      {response.assignments.length > 0 && (
        <div className="assigned">
          <h3 className="eyebrow">On this incident</h3>
          <ul>
            {response.assignments.map((item) => {
              const unit = dispatch.units.find((u) => u.id === item.unitId);
              const latest = response.events.filter((event) => event.unitId === item.unitId).at(-1);
              return (
                <li key={item.id}>
                  <Icon name={SERVICE_ICON[item.service]} size={18} className={`svc ${item.service}`} />
                  <strong>{unit?.name ?? item.unitId}</strong>
                  <StatusBadge status={latest?.status ?? "assigned"} label={latest ? STATUS_TEXT[latest.status] : "Assigned"} />
                  <span className="muted small">since {clock(item.at)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {resolved ? (
        <Notice title="Incident resolved">No further units can be assigned.</Notice>
      ) : (
        <fieldset className="unit-list" disabled={pending}>
          <legend>
            Available units ·{" "}
            {basis === "route" ? "sorted by estimated travel time" : basis === "straight" ? "sorted by straight-line distance (no routing data)" : "not ranked: incident location not on the map"}
          </legend>
          {ranked.length === 0 && <p className="empty">No {UNIT_SERVICE_LABEL[pick.service]} units in this data source.</p>}
          {ranked.map((item) => {
            const here = onThisIncident.has(item.unit.id);
            const disabled = here || item.state.kind !== "available";
            return (
              <label key={item.unit.id} className={`unit-option${disabled ? " disabled" : ""}${pick.unitId === item.unit.id && !disabled ? " checked" : ""}`}>
                <ResponderCard item={item}>
                  <input
                    type="radio"
                    name={`unit-${call.incident.id}`}
                    value={item.unit.id}
                    checked={pick.unitId === item.unit.id && !disabled}
                    disabled={disabled}
                    onChange={() => {
                      onPick({ ...pick, unitId: item.unit.id });
                      if (result?.kind !== "pending") setResult(null);
                    }}
                    aria-describedby={here ? `${item.unit.id}-here` : undefined}
                  />
                </ResponderCard>
                {here && <span id={`${item.unit.id}-here`} className="sr-only">Already assigned to this incident</span>}
              </label>
            );
          })}
        </fieldset>
      )}

      <p className="small muted line">
        <Icon name="info" size={16} /> {basis === "route" ? "Travel times from routing data." : "Distances are straight-line; no travel time is estimated."}
        {mode === "demo" && " Demo positions."}
      </p>

      {!resolved && <KeyNeeded />}
      {!resolved && (
        <button className="btn primary block" onClick={confirm} disabled={!chosen || pending} aria-busy={pending}>
          <Icon name="truck" />
          {result?.kind === "pending" ? `Assigning ${result.unit}…` : chosen ? `Confirm assignment · ${chosen.unit.name}` : "Select a unit to assign"}
        </button>
      )}
      <div aria-live="polite">
        {result?.kind === "success" && (
          <Notice tone="info" title={`${result.unit} assigned at ${clock(result.at)}`}>
            {mode === "demo" ? "Demo only: recorded in this browser. No responder was notified." : "Recorded by the backend. No responder was notified; contact the unit directly."}
          </Notice>
        )}
        {result?.kind === "error" && (
          <Notice tone="error" title={`Could not assign ${result.unit}`}>
            {result.message} Nothing was dispatched. Check the unit and confirm again.
          </Notice>
        )}
      </div>
      {!resolved && (
        <button className="btn block" onClick={addService}>
          <Icon name="plusCircle" /> Request additional service
        </button>
      )}
    </section>
  );
}
