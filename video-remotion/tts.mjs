import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LINES } from './narration.mjs';
const DIR = path.resolve(import.meta.dirname, 'public/audio');
const VOICE = process.env.VOICE ?? 'Samantha', RATE = process.env.RATE ?? '182';
const out = {};
for (const [k, l] of Object.entries(LINES)) {
  const wav = path.join(DIR, `${k}.wav`), aiff = wav.replace('.wav', '.aiff');
  execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, l.say ?? l.text]);
  // trim trailing silence a bit, normalize
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000', '-ac', '2', wav]);
  fs.unlinkSync(aiff);
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
  out[k] = { wav, dur, text: l.text };
}
fs.writeFileSync(path.resolve(import.meta.dirname, 'src/narration.json'), JSON.stringify(out, null, 2));
const tot = Object.values(out).reduce((a, b) => a + b.dur, 0);
console.log(Object.entries(out).map(([k, v]) => `${k} ${v.dur.toFixed(2)}`).join('\n'), '\ntotal', tot.toFixed(1));
