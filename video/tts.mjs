// Narration: one WAV per beat via macOS `say`, plus durations. Output: build/tts/*.wav, build/tts.json
// VOICE / RATE env vars override the voice. To use your own recordings instead, drop
// build/tts/<scene>-<n>.wav files in place and run with SKIP_TTS=1 (durations are re-measured).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES } from './scenes.mjs';

const DIR = path.resolve(import.meta.dirname, 'build/tts');
fs.mkdirSync(DIR, { recursive: true });
const VOICE = process.env.VOICE ?? 'Samantha';
const RATE = process.env.RATE ?? '186';

const out = {};
for (const s of SCENES) {
  s.beats.forEach((b, i) => {
    const key = `${s.id}-${i}`;
    const wav = path.join(DIR, `${key}.wav`);
    if (!process.env.SKIP_TTS) {
      const aiff = path.join(DIR, `${key}.aiff`);
      execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, b.say ?? b.text]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '48000', '-ac', '2', wav]);
      fs.unlinkSync(aiff);
    }
    const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
    out[key] = { wav, dur };
  });
}
fs.writeFileSync(path.resolve(import.meta.dirname, 'build/tts.json'), JSON.stringify(out, null, 2));
const total = Object.values(out).reduce((a, b) => a + b.dur, 0);
console.log(`tts: ${Object.keys(out).length} lines, ${total.toFixed(1)}s of speech (${VOICE} @ ${RATE})`);
