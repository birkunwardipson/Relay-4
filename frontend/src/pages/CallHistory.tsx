import { useEffect, useState } from "react";
import { SeverityBadge, StatusBadge } from "../components/Badges";
import { Icon } from "../components/Icon";
import { useAppData } from "../data";
import { demoRecording } from "../demo/store";
import { clock, duration, humanize, parseTime, STATUS_LABEL } from "../format";
import type { RecordingView } from "../recording";
import { href, navigate, useRoute } from "../router";
import { codeOf } from "../services";

const RECORDING_TEXT: Record<RecordingView["state"], string> = {
  loading: "…",
  ready: "Available",
  in_progress: "Call in progress",
  processing: "Processing",
  unavailable: "None",
  unauthorized: "No access",
  unsupported: "Not connected",
  no_conversation: "—",
  error: "Error",
};

export function CallHistory() {
  const { calls, dispatch, mode, now } = useAppData();
  const { params } = useRoute();
  const respondedToday = params.get("responded") === "today";
  const recordings = useDemoRecordingStates(mode === "demo" ? calls.map((call) => call.incident.id) : []);
  const today = new Date(now).toDateString();

  const rows = calls
    .map((call) => {
      const response = dispatch?.responseOf(call.incident.id) ?? null;
      const arrived = response?.events.find((event) => event.status === "on_scene");
      const toScene = arrived ? (parseTime(arrived.at) - parseTime(call.incident.created_at)) / 1000 : null;
      const arrivedToday = arrived ? new Date(parseTime(arrived.at)).toDateString() === today : false;
      return { call, response, toScene, arrivedToday };
    })
    .filter((row) => !respondedToday || row.arrivedToday)
    .sort((a, b) => parseTime(b.call.incident.created_at) - parseTime(a.call.incident.created_at));

  return (
    <div className="page">
      <section className="card">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Filter calls">
            <button className={`chip${respondedToday ? "" : " on"}`} aria-pressed={!respondedToday} onClick={() => navigate("history", {}, { replace: true })}>All calls</button>
            <button className={`chip${respondedToday ? " on" : ""}`} aria-pressed={respondedToday} onClick={() => navigate("history", { responded: "today" }, { replace: true })} disabled={!dispatch}>
              Reached scene today
            </button>
          </div>
          {respondedToday && <p className="small muted">These incidents make up the average response time on the overview.</p>}
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Reported</th>
                  <th scope="col">Incident</th>
                  <th scope="col">Location</th>
                  <th scope="col">Conversation</th>
                  <th scope="col">Response</th>
                  <th scope="col">Time to scene</th>
                  <th scope="col">Recording</th>
                  <th scope="col">Conversation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ call, response, toScene }) => (
                  <tr key={call.incident.id}>
                    <td className="nowrap">
                      {clock(call.incident.created_at)}
                      <span className="muted small block">{new Date(parseTime(call.incident.created_at)).toLocaleDateString()}</span>
                    </td>
                    <td>
                      <a href={href("incidents", { id: call.incident.id })}>
                        {codeOf(call.incident.id)} · {humanize(call.incident.incident_type, "Unclassified")}
                      </a>{" "}
                      <SeverityBadge call={call} />
                    </td>
                    <td>{call.incident.location ?? <span className="muted">Unknown</span>}</td>
                    <td>
                      {call.live ? "Call in progress" : call.incident.conversation_id ? "Ended" : STATUS_LABEL[call.incident.status]}
                      {!call.live && call.incident.conversation_id && <span className="muted small block">Intake: {STATUS_LABEL[call.incident.status]}</span>}
                    </td>
                    <td>{response ? <StatusBadge status={response.status} /> : <span className="muted">Not connected</span>}</td>
                    <td>{toScene !== null ? duration(toScene) : <span className="muted">—</span>}</td>
                    <td>
                      {mode === "demo" ? RECORDING_TEXT[recordings[call.incident.id] ?? "loading"] : call.incident.conversation_id ? RECORDING_TEXT.unsupported : "—"}
                    </td>
                    <td className="mono small">{call.incident.conversation_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            {calls.length ? "No calls match this filter." : "No calls yet."}{" "}
            {respondedToday && <a className="link" href={href("history")}>Show all calls <Icon name="chevron" size={14} /></a>}
          </p>
        )}
      </section>
    </div>
  );
}

function useDemoRecordingStates(ids: string[]) {
  const [states, setStates] = useState<Record<string, RecordingView["state"]>>({});
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    Promise.all(key.split(",").map(async (id) => [id, (await demoRecording(id)).state] as const)).then((entries) => {
      if (!cancelled) setStates(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return states;
}
