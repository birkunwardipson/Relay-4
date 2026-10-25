import type { TranscriptLine } from "../recording";
import type { Assignment, ResponseEvent, ResponseStatus, Unit } from "../response";
import type { IncidentDetail, IncidentStatus, LatLng } from "../types";

// Synthetic demo dataset (Hammond, Louisiana). Every name, address, unit, position, time and recording here is
// made up. Times are relative to when the demo was (re)started.

export type DemoRecording =
  | { state: "ready"; transcript: TranscriptLine[]; durationSec: number }
  | { state: "processing" | "unavailable" | "unauthorized" | "in_progress" };

export type DemoState = {
  startedAt: number;
  incidents: IncidentDetail[];
  points: Record<string, LatLng>;
  units: Unit[];
  assignments: Assignment[];
  events: ResponseEvent[];
  recordings: Record<string, DemoRecording>;
  failNextAssignment: boolean;
};

type Spec = {
  id: string;
  type: string;
  location: string;
  point: LatLng;
  description: string;
  landmark?: string;
  hazard?: string;
  people?: number;
  injuries?: string;
  confirmed: boolean;
  status: IncidentStatus;
  createdMin: number;
  updatedMin: number;
  quotes: string[];
  recording: DemoRecording;
  response?: [ResponseStatus, number, string][]; // status, minutes ago, unit id
};

const FIRE_CALL: TranscriptLine[] = [
  { speaker: "agent", startSec: 0, text: "This is RELAY4. Can you tell me what's happening at your location?" },
  { speaker: "reporter", startSec: 6, text: "There's smoke coming from the house, and I think two people are still inside." },
  { speaker: "agent", startSec: 13, text: "What is the address?" },
  { speaker: "reporter", startSec: 16, text: "801 Pecan Street." },
  { speaker: "agent", startSec: 20, text: "I'm reading back 801 Pecan Street in Hammond. Is that correct?" },
  { speaker: "reporter", startSec: 26, text: "Yes, that's right." },
  { speaker: "agent", startSec: 30, text: "Is anyone hurt that you can see?" },
  { speaker: "reporter", startSec: 34, text: "I don't know, I can't see inside." },
];

const BREATHING_CALL: TranscriptLine[] = [
  { speaker: "agent", startSec: 0, text: "This is RELAY4. What's your emergency?" },
  { speaker: "reporter", startSec: 4, text: "My mother is having trouble breathing." },
  { speaker: "agent", startSec: 9, text: "What's the address?" },
  { speaker: "reporter", startSec: 12, text: "48 Cypress Court." },
  { speaker: "agent", startSec: 16, text: "Is she awake and talking?" },
  { speaker: "reporter", startSec: 20, text: "Yes, but she's short of breath." },
];

const SPECS: Spec[] = [
  {
    id: "INC-0241", type: "structure_fire", location: "801 Pecan Street, Hammond, LA", point: [30.5089, -90.4671],
    description: "Caller reports smoke from a residential building. Two people may be inside.",
    landmark: "Two-story house, white siding", hazard: "smoke", people: 2, confirmed: true,
    status: "needs_review", createdMin: 2, updatedMin: 1,
    quotes: ["There's smoke coming from the house, and I think two people are still inside.", "Yes, that's right."],
    recording: { state: "ready", transcript: FIRE_CALL, durationSec: 40 },
  },
  {
    id: "INC-0240", type: "vehicle_collision", location: "1420 Maple Avenue, Hammond, LA", point: [30.4981, -90.4552],
    description: "Two cars collided at the intersection. One driver is hurt and complaining of neck pain; fluid leaking.",
    hazard: "fluid leaking", people: 3, injuries: "One driver hurt, neck pain", confirmed: false,
    status: "intake", createdMin: 5, updatedMin: 1,
    quotes: ["Two cars just hit each other on Maple.", "One of the drivers says his neck hurts."],
    recording: { state: "in_progress" },
  },
  {
    id: "INC-0239", type: "medical_assistance", location: "317 Oak Ridge Drive, Hammond, LA", point: [30.5152, -90.4489],
    description: "Elderly man fell at home. Conscious and talking; possible broken hip.",
    people: 1, injuries: "Possible broken hip", confirmed: true,
    status: "needs_review", createdMin: 7, updatedMin: 6,
    quotes: ["My neighbor fell and he can't get up, he thinks his hip is broken."],
    recording: { state: "processing" },
  },
  {
    id: "INC-0238", type: "suspicious_activity", location: "590 Willow Lane, Hammond, LA", point: [30.4925, -90.4734],
    description: "Person seen trying car door handles along the street.",
    people: 1, injuries: "None", confirmed: true,
    status: "reviewed", createdMin: 46, updatedMin: 45,
    quotes: ["Someone is going down the street pulling on car doors."],
    recording: { state: "unauthorized" },
    response: [["assigned", 44, "pd-12"], ["accepted", 43, "pd-12"], ["en_route", 42, "pd-12"]],
  },
  {
    id: "INC-0237", type: "medical_assistance", location: "48 Cypress Court, Hammond, LA", point: [30.5021, -90.4412],
    description: "Adult woman with difficulty breathing, awake and talking.",
    people: 1, injuries: "Short of breath", confirmed: true,
    status: "reviewed", createdMin: 24, updatedMin: 23,
    quotes: ["My mother is having trouble breathing.", "Yes, but she's short of breath."],
    recording: { state: "ready", transcript: BREATHING_CALL, durationSec: 26 },
    response: [["assigned", 22, "ems-03"], ["accepted", 21.5, "ems-03"], ["en_route", 21, "ems-03"], ["on_scene", 14, "ems-03"]],
  },
  {
    id: "INC-0236", type: "kitchen_fire", location: "2205 Magnolia Street, Hammond, LA", point: [30.5118, -90.4598],
    description: "Grease fire in an apartment kitchen, spreading to cabinets. Occupants are outside.",
    hazard: "fire", people: 3, injuries: "None", confirmed: true,
    status: "reviewed", createdMin: 41, updatedMin: 40,
    quotes: ["The kitchen is on fire, we all got out."],
    recording: { state: "unavailable" },
    response: [["assigned", 39, "fd-02"], ["accepted", 38.8, "fd-02"], ["en_route", 38.5, "fd-02"], ["on_scene", 34, "fd-02"], ["assisting", 30, "fd-02"]],
  },
  {
    id: "INC-0235", type: "traffic_hazard", location: "Morrison Boulevard at Thomas Street, Hammond, LA", point: [30.5043, -90.4790],
    description: "Large tree branch blocking the right lane.",
    people: 0, injuries: "None", confirmed: true,
    status: "reviewed", createdMin: 130, updatedMin: 129,
    quotes: ["There's a big branch down in the right lane on Morrison."],
    recording: { state: "unavailable" },
    response: [["assigned", 128, "pd-03"], ["accepted", 127.5, "pd-03"], ["en_route", 127, "pd-03"], ["on_scene", 124, "pd-03"], ["resolved", 110, "pd-03"]],
  },
];

const FIRE = "City Fire Dept. (demo)";
const POLICE = "City Police Dept. (demo)";
const EMS = "County EMS (demo)";

const UNITS: Unit[] = [
  { id: "fd-04", name: "Engine 04", service: "fire", agency: FIRE, point: [30.5043, -90.4625], outOfService: false, route: null },
  { id: "fd-12", name: "Engine 12", service: "fire", agency: FIRE, point: [30.4889, -90.4497], outOfService: false, route: null },
  { id: "fd-07", name: "Engine 07", service: "fire", agency: FIRE, point: [30.5213, -90.4402], outOfService: true, route: null },
  { id: "fd-02", name: "Engine 02", service: "fire", agency: FIRE, point: [30.5111, -90.4612], outOfService: false, route: null },
  { id: "fd-l1", name: "Ladder 1", service: "fire", agency: FIRE, point: [30.5187, -90.4805], outOfService: false, route: null },
  { id: "pd-03", name: "Patrol 3", service: "police", agency: POLICE, point: [30.5004, -90.4660], outOfService: false, route: null },
  { id: "pd-05", name: "Patrol 5", service: "police", agency: POLICE, point: [30.5126, -90.4556], outOfService: false, route: null },
  { id: "pd-09", name: "Patrol 9", service: "police", agency: POLICE, point: [30.4870, -90.4630], outOfService: true, route: null },
  { id: "pd-12", name: "Patrol 12", service: "police", agency: POLICE, point: [30.4950, -90.4705], outOfService: false, route: null },
  { id: "ems-03", name: "Medic 03", service: "medical", agency: EMS, point: [30.5025, -90.4418], outOfService: false, route: null },
  { id: "ems-05", name: "Medic 05", service: "medical", agency: EMS, point: [30.4962, -90.4601], outOfService: false, route: null },
  { id: "ems-08", name: "Medic 08", service: "medical", agency: EMS, point: [30.5234, -90.4621], outOfService: false, route: null },
];

export function seedDemo(now: number): DemoState {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
  const state: DemoState = { startedAt: now, incidents: [], points: {}, units: UNITS, assignments: [], events: [], recordings: {}, failNextAssignment: false };

  for (const spec of SPECS) {
    const conversation = `conv_demo_${spec.id.slice(4)}`;
    const span = spec.createdMin - spec.updatedMin;
    const step = (i: number, n: number) => at(spec.createdMin - (span * (i + 1)) / (n + 1));
    const fields: [string, string | null][] = [
      ["incident_type", spec.type],
      ["location", spec.location],
      ["location_confirmed", spec.confirmed ? "true" : null],
      ["description", spec.description],
    ];
    const changes = fields.filter(([, value]) => value !== null);

    state.incidents.push({
      id: spec.id,
      incident_type: spec.type,
      description: spec.description,
      location: spec.location,
      landmark: spec.landmark ?? null,
      hazard: spec.hazard ?? null,
      people_count: spec.people ?? null,
      injuries: spec.injuries ?? null,
      location_confirmed: spec.confirmed,
      status: spec.status,
      conversation_id: conversation,
      created_at: at(spec.createdMin),
      updated_at: at(spec.updatedMin),
      evidence: spec.quotes.map((quote, i) => ({
        id: `${spec.id}-q${i}`,
        source_quote: quote,
        transcript_reference: null,
        conversation_id: conversation,
        event_id: null,
        verification_status: "unverified",
        created_at: step(i, spec.quotes.length),
      })),
      history: changes.map(([field, value], i) => ({
        id: `${spec.id}-h${i}`,
        field_name: field,
        previous_value: field === "location_confirmed" ? "false" : null,
        new_value: value,
        conversation_id: conversation,
        event_id: null,
        source: "elevenlabs_webhook",
        actor_type: "voice_agent",
        changed_at: step(i, changes.length),
      })),
    });
    state.points[spec.location] = spec.point;
    state.recordings[spec.id] = spec.recording;

    for (const [status, minutesAgo, unitId] of spec.response ?? []) {
      const unit = UNITS.find((item) => item.id === unitId)!;
      if (status === "assigned") state.assignments.push({ id: `${spec.id}-${unitId}`, incidentId: spec.id, unitId, service: unit.service, at: at(minutesAgo) });
      state.events.push({
        id: `${spec.id}-${status}`,
        incidentId: spec.id,
        status,
        unitId,
        at: at(minutesAgo),
        actor: status === "assigned" ? "dispatcher" : "responder",
        note: null,
      });
    }
  }
  return state;
}
