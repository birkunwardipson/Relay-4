export type Speaker = "agent" | "reporter";
export type TranscriptLine = { speaker: Speaker; startSec: number; text: string };

export const SPEAKER_LABEL: Record<Speaker, string> = { agent: "Agent", reporter: "Reporter" };

/**
 * What the call-recording panel can show for an incident. Audio is only ever a stored recording of a finished
 * call; there is no live listening.
 */
export type RecordingView =
  | { state: "loading" }
  | { state: "ready"; audioUrl: string; transcript: TranscriptLine[]; synthetic: boolean }
  | { state: "in_progress" } // call still running, recording not stored yet
  | { state: "processing" } // call ended, provider still preparing the audio
  | { state: "unavailable" } // no recording stored for this conversation
  | { state: "unauthorized" } // backend refused the request (401/403)
  | { state: "unsupported" } // backend has no recording endpoint yet
  | { state: "no_conversation" } // incident was not created from a call
  | { state: "error"; message: string };
