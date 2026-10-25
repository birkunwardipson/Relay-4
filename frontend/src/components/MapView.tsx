import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { humanize } from "../format";
import type { Call } from "../intake";
import { LOUISIANA_BOUNDS } from "../louisiana";
import { STATUS_TEXT, type ResponseStatus, type UnitState, type Unit } from "../response";
import { href } from "../router";
import { codeOf, isVehicle, SEVERITY, SEVERITY_LABEL, serviceOf, UNIT_SERVICE_LABEL } from "../services";
import type { LatLng } from "../types";

const PAN_LIMIT = L.latLngBounds(LOUISIANA_BOUNDS).pad(0.15);

// Icon markup for Leaflet's HTML markers (same outlines as components/Icon).
const svg = (body: string) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const GLYPH = {
  fire: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  police: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  medical: svg('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'),
  car: svg('<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
  alert: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  truck: svg('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'),
};

function incidentIcon(call: Call, selected: boolean) {
  const service = serviceOf(call.incident);
  const glyph = isVehicle(call.incident) ? GLYPH.car : service ? GLYPH[service] : GLYPH.alert;
  const severity = SEVERITY[call.priority];
  return L.divIcon({
    className: "",
    html: `<span class="map-pin ${severity}${selected ? " selected" : ""}${call.live ? " live" : ""}">${glyph}</span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -38],
  });
}

const unitIcon = (unit: Unit, state: UnitState["kind"], chosen: boolean, dim: boolean) =>
  L.divIcon({
    className: "",
    html: `<span class="map-unit ${unit.service} ${state}${chosen ? " chosen" : ""}${dim ? " dim" : ""}">${GLYPH[unit.service === "fire" ? "truck" : unit.service === "police" ? "police" : "medical"]}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fly the view to what is shown whenever the set of points changes; Louisiana when there is nothing. */
function FitTo({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((point) => point.join(",")).join(";");
  useEffect(() => {
    const list = key ? key.split(";").map((pair) => pair.split(",").map(Number) as LatLng) : [];
    const motion = { animate: !reducedMotion(), duration: 0.8 };
    if (!list.length) map.flyToBounds(LOUISIANA_BOUNDS, { padding: [16, 16], ...motion });
    else if (list.length === 1) map.flyTo(list[0], 15, motion);
    else map.flyToBounds(L.latLngBounds(list), { padding: [40, 40], maxZoom: 15, ...motion });
  }, [map, key]);
  return null;
}

const PING_MS = 4500;

/** Ripple at a live call's location when it first appears on the map or moves, so new and corrected locations stand out. */
function Pings({ calls }: { calls: (Call & { point: LatLng })[] }) {
  const seen = useRef(new Map<string, string>());
  const [pings, setPings] = useState<{ id: string; point: LatLng; severity: string; at: number }[]>([]);
  const key = calls.map((call) => `${call.incident.id}@${call.point.join(",")}${call.live ? "!" : ""}`).join(";");

  useEffect(() => {
    const fresh = calls.filter((call) => call.live && seen.current.get(call.incident.id) !== call.point.join(","));
    for (const call of calls) seen.current.set(call.incident.id, call.point.join(","));
    if (!fresh.length) return;
    const at = Date.now();
    setPings((prev) => [
      ...prev.filter((ping) => !fresh.some((call) => call.incident.id === ping.id)),
      ...fresh.map((call) => ({ id: call.incident.id, point: call.point, severity: SEVERITY[call.priority], at })),
    ]);
    // Not cleared on the next change: each ping removes itself even if more arrive in the meantime.
    setTimeout(() => setPings((prev) => prev.filter((ping) => ping.at !== at)), PING_MS);
    // `key` captures every change to the calls that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return pings.map((ping) => (
    <Marker
      key={`${ping.id}-${ping.at}`}
      position={ping.point}
      interactive={false}
      keyboard={false}
      zIndexOffset={-50}
      icon={L.divIcon({ className: "", html: `<span class="map-ping ${ping.severity}"><i></i><i></i><i></i></span>`, iconSize: [120, 120], iconAnchor: [60, 60] })}
    />
  ));
}

export type MapUnit = { unit: Unit & { point: LatLng }; state: UnitState["kind"]; dim?: boolean };

function ClickToPick({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({ click: (event) => onPick([event.latlng.lat, event.latlng.lng]) });
  return null;
}

type Props = {
  calls: Call[];
  units: MapUnit[];
  selectedId?: string | null;
  chosenUnitId?: string | null;
  statusOf?: (id: string) => ResponseStatus | null;
  popups?: boolean;
  label: string;
  className?: string;
  onSelect?: (id: string) => void;
  /** Map click sets a location (used when adding a responder); `draft` marks it. */
  onPick?: (point: LatLng) => void;
  draft?: LatLng | null;
};

export function MapView({ calls, units, selectedId, chosenUnitId, statusOf, popups, label, className, onSelect, onPick, draft }: Props) {
  const pinned = calls.filter((call): call is Call & { point: LatLng } => Boolean(call.point));
  const selected = pinned.find((call) => call.incident.id === selectedId);
  const chosen = units.find((item) => item.unit.id === chosenUnitId);
  const fitPoints = [...pinned.map((call) => call.point), ...units.filter((item) => !item.dim).map((item) => item.unit.point)];

  return (
    <div className={`map-frame ${className ?? ""}`}>
      <MapContainer bounds={LOUISIANA_BOUNDS} maxBounds={PAN_LIMIT} maxBoundsViscosity={1} minZoom={6} className="map" scrollWheelZoom={false}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
        <FitTo points={fitPoints} />
        <Pings calls={pinned} />
        {onPick && <ClickToPick onPick={onPick} />}
        {draft && (
          <CircleMarker center={draft} radius={10} pathOptions={{ color: "#0f6e6e", weight: 3, fillOpacity: 0.3 }}>
            <Tooltip permanent direction="top" offset={[0, -10]}>New responder location</Tooltip>
          </CircleMarker>
        )}

        {units.map(({ unit, state, dim }) => (
          <Marker key={unit.id} position={unit.point} icon={unitIcon(unit, state, unit.id === chosenUnitId, Boolean(dim))} zIndexOffset={dim ? -200 : -100} title={`${unit.name}, ${UNIT_SERVICE_LABEL[unit.service]}, ${state.replaceAll("_", " ")}`} keyboard>
            <Tooltip direction="top" offset={[0, -12]}>
              <strong>{unit.name}</strong> · {UNIT_SERVICE_LABEL[unit.service]} · {state === "available" ? "Available" : state === "assigned" ? "Assigned" : "Out of service"}
              <br />
              {unit.agency}
              {unit.local ? " · location set by dispatcher" : ""}
            </Tooltip>
          </Marker>
        ))}

        {selected && chosen && (
          <Polyline positions={[chosen.unit.point, selected.point]} pathOptions={{ color: "#0f766e", weight: 3, dashArray: "6 8" }}>
            <Tooltip sticky>Straight line, not a driving route</Tooltip>
          </Polyline>
        )}

        {pinned.map((call) => {
          const status = statusOf?.(call.incident.id) ?? null;
          const name = humanize(call.incident.incident_type, "Unclassified incident");
          return (
            <Marker
              key={call.incident.id}
              position={call.point}
              icon={incidentIcon(call, call === selected)}
              zIndexOffset={call === selected ? 1000 : (4 - call.priority) * 100}
              title={`${codeOf(call.incident.id)} ${name}, ${SEVERITY_LABEL[SEVERITY[call.priority]]}`}
              keyboard
              eventHandlers={onSelect ? { click: () => onSelect(call.incident.id) } : undefined}
            >
              {popups ? (
                <Popup>
                  <div className="map-popup">
                    <strong>
                      {codeOf(call.incident.id)} · {name}
                    </strong>
                    <span>
                      <span className={`severity ${SEVERITY[call.priority]}`}>{SEVERITY_LABEL[SEVERITY[call.priority]]}</span>{" "}
                      {status && (status === "reported" ? "Awaiting dispatch" : STATUS_TEXT[status])}
                    </span>
                    <span>{call.incident.location}</span>
                    <a href={href("incidents", { id: call.incident.id })}>View incident →</a>
                  </div>
                </Popup>
              ) : (
                <Tooltip direction="top" offset={[0, -38]}>
                  {name} · {call.incident.location}
                </Tooltip>
              )}
            </Marker>
          );
        })}
      </MapContainer>
      <span className="map-label">{label}</span>
    </div>
  );
}
