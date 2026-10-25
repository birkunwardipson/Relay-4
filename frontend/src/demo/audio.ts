import type { TranscriptLine } from "../recording";

// Synthetic demo audio: soft tones shaped like speech turns, one pitch per speaker, aligned with the demo
// transcript. It is not a voice recording and is labelled as such in the player.
const RATE = 8000;

export function synthesizeCall(lines: TranscriptLine[], durationSec: number): Blob {
  const samples = Math.round(RATE * durationSec);
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);

  lines.forEach((line, index) => {
    const start = line.startSec;
    const end = Math.min((lines[index + 1]?.startSec ?? durationSec) - 0.6, start + 0.6 + line.text.length * 0.06);
    const pitch = line.speaker === "agent" ? 196 : 262;
    for (let s = Math.floor(start * RATE); s < Math.min(samples, Math.floor(end * RATE)); s++) {
      const t = s / RATE;
      const fade = Math.min(1, (t - start) * 8, (end - t) * 8);
      const syllables = Math.abs(Math.sin(Math.PI * 3.1 * (t - start))) * (0.6 + 0.4 * Math.sin(Math.PI * 0.7 * t));
      const tone = Math.sin(2 * Math.PI * pitch * t) + 0.35 * Math.sin(4 * Math.PI * pitch * t);
      view.setInt16(44 + s * 2, Math.max(-1, Math.min(1, 0.2 * fade * syllables * tone)) * 32767, true);
    }
  });

  return new Blob([view.buffer], { type: "audio/wav" });
}
