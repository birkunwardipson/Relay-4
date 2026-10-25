import { clock } from "../format";
import { STATUS_TEXT, STEPS, type ResponseEvent, type ResponseStatus } from "../response";
import { Icon } from "./Icon";

/** Reported → … → Resolved. Times come only from recorded events; a step passed without one shows no time. */
export function ResponseTimeline({ status, events, reportedAt }: { status: ResponseStatus; events: ResponseEvent[]; reportedAt: string }) {
  const current = STEPS.indexOf(status);
  return (
    <ol className="timeline" aria-label="Incident response progress">
      {STEPS.map((step, index) => {
        const reached = index <= current;
        const at = step === "reported" ? reportedAt : events.find((event) => event.status === step)?.at;
        return (
          <li key={step} className={reached ? "reached" : ""} aria-current={index === current ? "step" : undefined}>
            <span className="dot">{reached && <Icon name="check" size={14} />}</span>
            <span className="step-label">{STATUS_TEXT[step]}</span>
            <span className="step-time">{reached ? (at ? clock(at) : "—") : ""}</span>
            <span className="sr-only">{reached ? (index === current ? ", current step" : ", done") : ", not reached"}</span>
          </li>
        );
      })}
    </ol>
  );
}
