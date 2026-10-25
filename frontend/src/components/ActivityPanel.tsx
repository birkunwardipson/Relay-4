import { useState } from "react";
import { useAppData } from "../data";
import { humanize, parseTime } from "../format";
import type { Call } from "../intake";
import { STATUS_TEXT, STEPS, type ResponseStatus } from "../response";
import type { IncidentDetail } from "../types";
import { ActivityFeed, Notice, type FeedItem } from "./Cards";

const ACTOR: Record<string, string> = { voice_agent: "voice agent", dispatcher: "dispatcher" };
const MANUAL_STEPS = STEPS.filter((step) => STEPS.indexOf(step) > STEPS.indexOf("assigned"));

export function ActivityPanel({ call, detail }: { call: Call; detail: IncidentDetail | null }) {
  const { dispatch } = useAppData();
  const response = dispatch?.responseOf(call.incident.id) ?? null;
  const unitName = (id: string | null) => dispatch?.units.find((unit) => unit.id === id)?.name ?? "Unit";

  const items: FeedItem[] = [
    { id: "reported", at: call.incident.created_at, title: "Report received", detail: call.incident.conversation_id ? "Via ElevenLabs voice agent" : undefined, tone: "pending" as const },
    ...(detail?.history ?? []).map((entry): FeedItem => ({
      id: entry.id,
      at: entry.changed_at,
      title: entry.field_name === "location_confirmed" && entry.new_value === "true" ? "Location confirmed" : `${humanize(entry.field_name)} ${entry.previous_value === null ? "set" : "updated"}`,
      detail: `${entry.field_name === "location_confirmed" ? "" : `${entry.new_value ?? "cleared"} · `}by ${ACTOR[entry.actor_type] ?? entry.actor_type}`,
      tone: "neutral",
    })),
    ...(response?.events ?? []).map((event): FeedItem => ({
      id: event.id,
      at: event.at,
      title: `${unitName(event.unitId)}: ${STATUS_TEXT[event.status]}`,
      detail: event.actor === "dispatcher" ? (event.note ? `${event.note} by dispatcher` : "By dispatcher") : "Reported by unit",
      tone: event.status === "resolved" ? "done" : "active",
    })),
  ].sort((a, b) => parseTime(a.at) - parseTime(b.at));

  return (
    <section className="card" aria-labelledby="activity-h">
      <h2 id="activity-h">Activity</h2>
      <ActivityFeed items={items} empty="No activity recorded yet." />
      {response && response.assignments.length > 0 && response.status !== "resolved" && (
        <ManualUpdate key={call.incident.id} incidentId={call.incident.id} unitIds={response.assignments.map((item) => item.unitId)} unitName={unitName} />
      )}
    </section>
  );
}

/** Dispatcher's manual record of a status a unit reported (e.g. by radio). Nothing advances on its own. */
function ManualUpdate({ incidentId, unitIds, unitName }: { incidentId: string; unitIds: string[]; unitName: (id: string) => string }) {
  const { dispatch } = useAppData();
  const [unitId, setUnitId] = useState(unitIds[0]);
  const [status, setStatus] = useState<ResponseStatus>("accepted");
  const [state, setState] = useState<{ kind: "idle" | "pending" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });

  const submit = async () => {
    if (!dispatch || state.kind === "pending") return;
    setState({ kind: "pending" });
    try {
      await dispatch.logStatus(incidentId, unitId, status);
      setState({ kind: "done" });
    } catch (caught) {
      setState({ kind: "error", message: caught instanceof Error ? caught.message : "Could not save the update." });
    }
  };

  return (
    <form
      className="manual-update"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="eyebrow">Record a unit status update</h3>
      <p className="small muted">For status a unit reported by radio or phone. Saved with the time you confirm it.</p>
      <div className="row">
        <label>
          <span className="sr-only">Unit</span>
          <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
            {unitIds.map((id) => <option key={id} value={id}>{unitName(id)}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">New status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as ResponseStatus)}>
            {MANUAL_STEPS.map((step) => <option key={step} value={step}>{STATUS_TEXT[step]}</option>)}
          </select>
        </label>
        <button className="btn" type="submit" disabled={state.kind === "pending"} aria-busy={state.kind === "pending"}>
          {state.kind === "pending" ? "Saving…" : "Record update"}
        </button>
      </div>
      <div aria-live="polite">
        {state.kind === "done" && <p className="small ok-text">Update recorded.</p>}
        {state.kind === "error" && <Notice tone="error" title="Update not saved">{state.message}</Notice>}
      </div>
    </form>
  );
}
