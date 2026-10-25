import { useEffect, useRef, useState } from "react";
import { clock, mmss } from "../format";
import { SPEAKER_LABEL, type RecordingView, type TranscriptLine } from "../recording";
import type { Evidence } from "../types";
import { Pill } from "./Badges";
import { Icon } from "./Icon";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const BARS = 96;

type Props = { view: RecordingView; evidence: Evidence[]; conversationId: string | null; demo: boolean };

export function CallRecording({ view, evidence, conversationId, demo }: Props) {
  return (
    <section className="recording" aria-labelledby="recording-title">
      <header className="recording-head">
        <Icon name="wave" size={22} />
        <div>
          <h3 id="recording-title">Call recording</h3>
          <p className="muted small">
            Reporter + ElevenLabs agent · <b>recorded playback, not live audio</b>
            {conversationId && <span className="mono"> · {conversationId}</span>}
          </p>
        </div>
      </header>
      {view.state === "ready" ? (
        <Player key={view.audioUrl} url={view.audioUrl} transcript={view.transcript} synthetic={view.synthetic} />
      ) : (
        <>
          <RecordingState view={view} demo={demo} />
          {evidence.length > 0 && (
            <div className="statements">
              <h4 className="eyebrow">Caller statements captured by the agent · not a full transcript</h4>
              <ul className="transcript">
                {evidence.map((item) => (
                  <li key={item.id}>
                    <span className="speaker reporter">Reporter</span>
                    <time className="mono small">{clock(item.created_at)}</time>
                    <span>
                      {item.source_quote} <Pill tone={item.verification_status === "verified" ? "done" : "neutral"}>{item.verification_status === "verified" ? "Verified" : "Unverified"}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RecordingState({ view, demo }: { view: Exclude<RecordingView, { state: "ready" }>; demo: boolean }) {
  const simulated = demo ? " (simulated in demo mode)" : "";
  const [title, text, tone] = (() => {
    switch (view.state) {
      case "loading":
        return ["Loading recording…", "", "info"];
      case "in_progress":
        return ["Call in progress", "The recording becomes available after the call ends. Live listening is not supported.", "info"];
      case "processing":
        return ["Recording is processing", "ElevenLabs is still preparing the audio for this conversation. Check back shortly.", "info"];
      case "unavailable":
        return ["No recording available", "No audio was stored for this conversation.", "info"];
      case "unauthorized":
        return ["Not authorized", `The server refused access to this recording${simulated}. Check that you are signed in with permission to play call audio.`, "error"];
      case "unsupported":
        return ["Recording playback not connected", "The Relay4 backend has no recording endpoint yet, so audio cannot be played here. See BACKEND_CONTRACT.md.", "warn"];
      case "no_conversation":
        return ["No associated call", "This incident was not created from an ElevenLabs conversation.", "info"];
      case "error":
        return ["Could not load recording", view.message, "error"];
    }
  })();
  return (
    <div className={`recording-state ${tone}`} role={tone === "error" ? "alert" : "status"} aria-busy={view.state === "loading"}>
      <Icon name={tone === "error" ? (view.state === "unauthorized" ? "lock" : "alertCircle") : "info"} />
      <div>
        <strong>{title}</strong>
        {text && <p className="small">{text}</p>}
      </div>
    </div>
  );
}

/** Peaks of the decoded audio, for the waveform. Empty if decoding isn't possible; the seek bar still works. */
function usePeaks(url: string) {
  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    const context = new AudioContext();
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => context.decodeAudioData(buffer))
      .then((audio) => {
        const data = audio.getChannelData(0);
        const size = Math.floor(data.length / BARS);
        const values = Array.from({ length: BARS }, (_, bar) => {
          let peak = 0;
          for (let i = bar * size; i < (bar + 1) * size; i += 8) peak = Math.max(peak, Math.abs(data[i]));
          return peak;
        });
        const max = Math.max(...values, 0.0001);
        if (!cancelled) setPeaks(values.map((value) => value / max));
      })
      .catch(() => undefined)
      .finally(() => context.close());
    return () => {
      cancelled = true;
    };
  }, [url]);
  return peaks;
}

function Player({ url, transcript, synthetic }: { url: string; transcript: TranscriptLine[]; synthetic: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const peaks = usePeaks(url);

  const seek = (seconds: number) => {
    if (!audio.current) return;
    audio.current.currentTime = Math.max(0, Math.min(seconds, length || seconds));
    setTime(audio.current.currentTime);
  };
  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => setFailed(true));
    else element.pause();
  };
  const retry = () => {
    setFailed(false);
    audio.current?.load();
  };

  const active = transcript.reduce((found, line, index) => (line.startSec <= time ? index : found), -1);
  const progress = length ? time / length : 0;

  return (
    <div className="player">
      {synthetic && <p className="demo-note small">Demo audio: synthetic tones, not a real voice recording.</p>}
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setLength(event.currentTarget.duration);
          setReady(true);
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
      />

      {failed ? (
        <div className="recording-state error" role="alert">
          <Icon name="alertCircle" />
          <div>
            <strong>Playback error</strong>
            <p className="small">The browser could not play this recording.</p>
          </div>
          <button className="btn small" onClick={retry}>
            <Icon name="refresh" size={16} /> Retry
          </button>
        </div>
      ) : (
        <div className="player-controls">
          <button className="play" onClick={toggle} disabled={!ready} aria-label={playing ? "Pause recording" : "Play recording"}>
            <Icon name={playing ? "pause" : "play"} size={22} />
          </button>
          <div className="wave">
            <svg viewBox={`0 0 ${BARS * 3} 40`} preserveAspectRatio="none" aria-hidden="true">
              {(peaks.length ? peaks : Array<number>(BARS).fill(0.08)).map((peak, i) => {
                const height = Math.max(2, peak * 36);
                return <rect key={i} x={i * 3} y={20 - height / 2} width={2} height={height} rx={1} className={i / BARS < progress ? "played" : ""} />;
              })}
            </svg>
            <input
              type="range"
              className="seek"
              min={0}
              max={length || 0}
              step={0.1}
              value={time}
              disabled={!ready}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="Seek"
              aria-valuetext={`${mmss(time)} of ${mmss(length)}`}
            />
          </div>
          <span className="mono small time" aria-live="off">
            {mmss(time)} / {ready ? mmss(length) : "--:--"}
          </span>
          <button className="icon-btn" onClick={() => {
              setMuted(!muted);
              if (audio.current) audio.current.muted = !muted;
            }} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}>
            <Icon name={muted || volume === 0 ? "mute" : "volume"} size={18} />
          </button>
          <input
            type="range"
            className="volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => {
              const value = Number(event.target.value);
              setVolume(value);
              setMuted(value === 0);
              if (audio.current) {
                audio.current.volume = value;
                audio.current.muted = value === 0;
              }
            }}
            aria-label="Volume"
          />
          <label className="speed">
            <span className="sr-only">Playback speed</span>
            <select
              value={speed}
              onChange={(event) => {
                const value = Number(event.target.value);
                setSpeed(value);
                if (audio.current) audio.current.playbackRate = value;
              }}
            >
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {transcript.length ? (
        <ol className="transcript" aria-label="Transcript">
          {transcript.map((line, index) => (
            <li key={index} className={index === active ? "active" : ""} aria-current={index === active ? "true" : undefined}>
              <span className={`speaker ${line.speaker}`}>{SPEAKER_LABEL[line.speaker]}</span>
              <button className="ts mono small" onClick={() => seek(line.startSec)} aria-label={`Play from ${mmss(line.startSec)}`}>
                {mmss(line.startSec)}
              </button>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty">No transcript available for this recording.</p>
      )}
    </div>
  );
}
