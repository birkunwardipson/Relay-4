import { useState } from "react";
import { API_BASE_URL, setDispatcherKey, useDispatcherKey } from "../api";
import { Notice } from "../components/Cards";
import { useAppData } from "../data";
import { resetDemo, setFailNextAssignment, useDemoState } from "../demo/store";
import { clock } from "../format";
import { setMode } from "../mode";

export function Settings() {
  const { mode, connection, lastSync, dispatch } = useAppData();
  const demo = useDemoState();
  const key = useDispatcherKey();
  const [draftKey, setDraftKey] = useState("");

  return (
    <div className="page narrow settings">
      <section className="card" aria-labelledby="source-h">
        <h2 id="source-h">Data source</h2>
        <fieldset className="radio-cards">
          <legend className="sr-only">Data source</legend>
          <label className={mode === "live" ? "checked" : ""}>
            <input type="radio" name="mode" checked={mode === "live"} onChange={() => setMode("live")} />
            <span>
              <strong>Live backend</strong>
              <span className="small muted">
                Incidents, responders, assignments and response status from <span className="mono">{API_BASE_URL}</span>, polled every 2 s. Call recordings are not
                available until the backend provides them.
              </span>
            </span>
          </label>
          <label className={mode === "demo" ? "checked" : ""}>
            <input type="radio" name="mode" checked={mode === "demo"} onChange={() => setMode("demo")} />
            <span>
              <strong>Demo data</strong>
              <span className="small muted">Synthetic incidents, units, recordings and assignments kept in this browser. Never contacts the backend or any responder.</span>
            </span>
          </label>
        </fieldset>
        {mode === "live" && (
          <p className="small muted">
            Connection: {connection}
            {lastSync && ` · last update ${clock(new Date(lastSync).toISOString())}`}. If the backend is unreachable the console shows an offline state; it never switches to demo
            data by itself.
          </p>
        )}
      </section>

      {mode === "live" && (
        <section className="card" aria-labelledby="key-h">
          <h2 id="key-h">Dispatcher key</h2>
          <p className="small muted">
            Needed to add responders, assign units and record status updates. It is the backend's <span className="mono">ADMIN_API_KEY</span>, kept only in this
            browser and sent with each change. Viewing does not need it.
          </p>
          {key ? (
            <p className="line">
              <span className="ok-text">Key saved in this browser.</span>
              <button className="btn small" onClick={() => setDispatcherKey("")}>Forget key</button>
            </p>
          ) : (
            <form
              className="line"
              onSubmit={(event) => {
                event.preventDefault();
                setDispatcherKey(draftKey);
                setDraftKey("");
              }}
            >
              <label className="sr-only" htmlFor="dispatcher-key">Dispatcher key</label>
              <input id="dispatcher-key" type="password" autoComplete="off" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Paste the key" />
              <button className="btn primary" type="submit" disabled={!draftKey.trim()}>Save key</button>
            </form>
          )}
          {!dispatch && <p className="small warn-text">This backend has no dispatch API yet; update and restart it to use assignments.</p>}
        </section>
      )}

      {mode === "demo" && (
        <section className="card" aria-labelledby="demo-h">
          <h2 id="demo-h">Demo controls</h2>
          <label className="check">
            <input type="checkbox" checked={demo.failNextAssignment} onChange={(event) => setFailNextAssignment(event.target.checked)} />
            Fail the next assignment request (to see the error state)
          </label>
          <button className="btn" onClick={resetDemo}>
            Reset demo data
          </button>
          <p className="small muted">Demo data started at {clock(new Date(demo.startedAt).toISOString())}. Resetting restores the original incidents and clears demo assignments.</p>
        </section>
      )}

      <section className="card" aria-labelledby="defs-h">
        <h2 id="defs-h">Definitions</h2>
        <dl className="defs">
          <dt>Severity (Critical / Major / Minor)</dt>
          <dd>Suggested from the reported facts (life threats, injuries, hazards), always shown with its reasons. The dispatcher decides.</dd>
          <dt>Intake status</dt>
          <dd>The backend's review state of the call record: Intake, Needs review, Reviewed. Separate from the response status.</dd>
          <dt>Response status</dt>
          <dd>Reported → Assigned → Accepted → En route → On scene → Assisting → Resolved. Changes only on a recorded event: a dispatcher assignment, a unit report, or a dispatcher's manual entry. Never on a timer.</dd>
          <dt>Active incidents</dt>
          <dd>Incidents whose response is not resolved.</dd>
          <dt>Awaiting dispatch</dt>
          <dd>Active incidents with no unit assigned.</dd>
          <dt>Available units</dt>
          <dd>In service and not assigned to an unresolved incident.</dd>
          <dt>Average response time</dt>
          <dd>Mean time from report to the first unit on scene, for incidents that reached the scene today.</dd>
          <dt>Distance and ETA</dt>
          <dd>Travel time is shown only when routing data provides it. Otherwise the straight-line distance is shown and labelled, with no ETA.</dd>
        </dl>
      </section>

      <Notice title="Not a live dispatch system">Relay4 does not contact emergency services. Assignments are recorded, not sent: no responder is notified.</Notice>
    </div>
  );
}
