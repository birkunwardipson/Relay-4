import { useSyncExternalStore } from "react";
import type { RecordingView } from "../recording";
import { responseOf, STEPS, unitState, type Assignment, type ResponseStatus } from "../response";
import { getRoster } from "../roster";
import { synthesizeCall } from "./audio";
import { seedDemo, type DemoState } from "./data";

// In-browser stand-in for the responder/assignment/recording APIs the backend does not have yet.
// Kept in sessionStorage so a reload keeps demo assignments; nothing here reaches the backend or any responder.
const KEY = "relay4.demo.v1";
const LATENCY_MS = 700; // simulated request time, so pending states are visible

const listeners = new Set<() => void>();
let state: DemoState = load();
const inflight = new Set<string>();
const audioUrls = new Map<string, string>();

function load(): DemoState {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as DemoState;
  } catch {
    // Fall through to a fresh seed.
  }
  return seedDemo(Date.now());
}

function commit(next: DemoState) {
  state = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable; demo changes last for this page load.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useDemoState = () => useSyncExternalStore(subscribe, () => state);

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
const statusOf = (incidentId: string) => responseOf(incidentId, state.events, state.assignments).status;

export class DemoRequestError extends Error {}

/** Mirrors what a real assignment endpoint must enforce: one request at a time, only available units, no duplicates. */
export async function demoAssign(incidentId: string, unitId: string): Promise<Assignment> {
  const key = `${incidentId}:${unitId}`;
  if (inflight.has(key)) throw new DemoRequestError("This assignment is already being submitted.");
  inflight.add(key);
  try {
    await wait();
    const unit = [...state.units, ...getRoster()].find((item) => item.id === unitId);
    if (!unit) throw new DemoRequestError("Unknown unit.");
    if (state.failNextAssignment) {
      commit({ ...state, failNextAssignment: false });
      throw new DemoRequestError("Simulated server error (503). The unit was not assigned.");
    }
    if (statusOf(incidentId) === "resolved") throw new DemoRequestError("This incident is already resolved.");
    if (state.assignments.some((item) => item.incidentId === incidentId && item.unitId === unitId)) {
      throw new DemoRequestError(`${unit.name} is already assigned to this incident.`);
    }
    const current = unitState(unit, state.assignments, statusOf);
    if (current.kind === "out_of_service") throw new DemoRequestError(`${unit.name} is out of service.`);
    if (current.kind === "assigned") throw new DemoRequestError(`${unit.name} was just assigned to ${current.incidentId}.`);

    const at = new Date().toISOString();
    const assignment: Assignment = { id: `${key}:${at}`, incidentId, unitId, service: unit.service, at };
    commit({
      ...state,
      assignments: [...state.assignments, assignment],
      events: [...state.events, { id: `${assignment.id}:assigned`, incidentId, status: "assigned", unitId, at, actor: "dispatcher", note: null }],
    });
    return assignment;
  } finally {
    inflight.delete(key);
  }
}

/** A dispatcher's manual entry of a status a unit reported (e.g. by radio). */
export async function demoLogStatus(incidentId: string, unitId: string, status: ResponseStatus): Promise<void> {
  const key = `${incidentId}:status`;
  if (inflight.has(key)) throw new DemoRequestError("An update is already being saved.");
  inflight.add(key);
  try {
    await wait();
    if (!state.assignments.some((item) => item.incidentId === incidentId && item.unitId === unitId)) {
      throw new DemoRequestError("That unit is not assigned to this incident.");
    }
    if (STEPS.indexOf(status) <= STEPS.indexOf("assigned")) throw new DemoRequestError("Use the assignment panel to assign units.");
    const at = new Date().toISOString();
    commit({ ...state, events: [...state.events, { id: `${key}:${at}`, incidentId, status, unitId, at, actor: "dispatcher", note: "Manual entry" }] });
  } finally {
    inflight.delete(key);
  }
}

export const setFailNextAssignment = (fail: boolean) => commit({ ...state, failNextAssignment: fail });

export function resetDemo() {
  audioUrls.forEach((url) => URL.revokeObjectURL(url));
  audioUrls.clear();
  commit(seedDemo(Date.now()));
}

export async function demoRecording(incidentId: string): Promise<RecordingView> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const recording = state.recordings[incidentId];
  if (!recording) return { state: "unavailable" };
  if (recording.state !== "ready") return { state: recording.state };
  let url = audioUrls.get(incidentId);
  if (!url) {
    url = URL.createObjectURL(synthesizeCall(recording.transcript, recording.durationSec));
    audioUrls.set(incidentId, url);
  }
  return { state: "ready", audioUrl: url, transcript: recording.transcript, synthetic: true };
}
