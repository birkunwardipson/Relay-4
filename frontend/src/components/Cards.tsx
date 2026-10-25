import type { ReactNode } from "react";
import { useDispatcherKey } from "../api";
import { useAppData } from "../data";
import { ago, clock, humanize, STATUS_LABEL } from "../format";
import type { Call } from "../intake";
import { travelText, type RankedUnit, type ResponseState } from "../response";
import { href } from "../router";
import { codeOf, UNIT_SERVICE_LABEL } from "../services";
import { IncidentGlyph, Pill, SeverityBadge, StatusBadge } from "./Badges";
import { Icon, type IconName } from "./Icon";

export function SummaryCard(props: { icon: IconName; tone: string; title: string; value: string; sub: ReactNode; href: string; definition: string }) {
  return (
    <a className="summary-card card" href={props.href} title={props.definition}>
      <span className={`summary-icon ${props.tone}`}>
        <Icon name={props.icon} size={28} />
      </span>
      <span className="summary-text">
        <span className="summary-title">{props.title}</span>
        <strong className="summary-value">{props.value}</strong>
        <span className="summary-sub">{props.sub}</span>
        <span className="sr-only">. {props.definition}</span>
      </span>
      <Icon name="chevron" className="chev" />
    </a>
  );
}

/** One row in an incident queue. Shows response status when known, otherwise the backend's intake status. */
export function IncidentCard({ call, now, response, selected, href }: { call: Call; now: number; response: ResponseState | null; selected?: boolean; href: string }) {
  const { incident } = call;
  return (
    <a className={`incident-card${selected ? " selected" : ""}`} href={href} aria-current={selected ? "true" : undefined}>
      <IncidentGlyph call={call} />
      <span className="incident-card-body">
        <span className="incident-card-top">
          <strong>{humanize(incident.incident_type, "Unclassified incident")}</strong>
          <SeverityBadge call={call} />
          <time dateTime={incident.created_at} title={clock(incident.created_at)}>{ago(incident.created_at, now)}</time>
        </span>
        <span className="muted small">{codeOf(incident.id)}</span>
        <span className="addr">
          <Icon name="pin" size={16} />
          <span>{incident.location ?? "Location unknown"}</span>
        </span>
        <span className="line">
          {response ? (
            <StatusBadge status={response.status} />
          ) : (
            <span className="muted small">Intake: {STATUS_LABEL[incident.status]}</span>
          )}
          {call.live && <Pill tone="danger">● Call in progress</Pill>}
        </span>
      </span>
      <Icon name="chevron" className="chev" />
    </a>
  );
}

const STATE_TEXT = { available: "Available", assigned: "Assigned", out_of_service: "Out of service" } as const;

export function UnitAvailability({ item }: { item: RankedUnit }) {
  const { state } = item;
  return (
    <span className={`status ${state.kind === "available" ? "done" : state.kind === "assigned" ? "active" : "off"}`}>
      <i aria-hidden="true" />
      {STATE_TEXT[state.kind]}
      {state.kind === "assigned" && <span className="muted"> · {codeOf(state.incidentId)}</span>}
    </span>
  );
}

export function ResponderCard({ item, children }: { item: RankedUnit; children?: ReactNode }) {
  return (
    <>
      {children}
      <span className="unit-icon">
        <Icon name="truck" size={26} />
      </span>
      <span className="unit-body">
        <strong>{item.unit.name}</strong>
        <span className="muted small">
          {item.unit.agency} · {UNIT_SERVICE_LABEL[item.unit.service]}
        </span>
      </span>
      <span className="unit-meta">
        <UnitAvailability item={item} />
        <span className="muted small">{item.state.kind === "out_of_service" ? "" : travelText(item)}</span>
      </span>
    </>
  );
}

export type FeedItem = { id: string; at: string; title: string; detail?: ReactNode; tone: "pending" | "active" | "done" | "neutral" };

export function ActivityFeed({ items, now, empty }: { items: FeedItem[]; now?: number; empty: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ol className="feed">
      {items.map((item) => (
        <li key={item.id} className={item.tone}>
          <time dateTime={item.at}>{now ? ago(item.at, now) : clock(item.at)}</time>
          <div>
            <strong>{item.title}</strong>
            {item.detail && <p className="muted small">{item.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "error" | "demo"; title: string; children?: ReactNode; action?: ReactNode }) {
  const icon: IconName = tone === "error" ? "alertCircle" : tone === "warn" ? "alert" : tone === "demo" ? "database" : "info";
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : undefined}>
      <Icon name={icon} />
      <div>
        <strong>{title}</strong>
        {children && <div className="small">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Shown before a live change is attempted, so the dispatcher learns about the key before filling in a form. */
export function KeyNeeded() {
  const { mode, dispatch } = useAppData();
  const key = useDispatcherKey();
  if (mode !== "live" || !dispatch || key) return null;
  return (
    <Notice
      tone="warn"
      title="Dispatcher key needed"
      action={
        <a className="btn small" href={href("settings")}>
          Open Settings
        </a>
      }
    >
      Changes need the backend's admin key. Paste it once in Settings; it stays in this browser.
    </Notice>
  );
}
