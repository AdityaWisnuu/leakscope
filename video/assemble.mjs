// Cuts each recorded scene, lays the narration lines at their beat times, fades, concatenates,
// normalises loudness and writes out/leakscope-demo.mp4 + out/leakscope-demo.srt.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES } from './scenes.mjs';

const HERE = import.meta.dirname;
const BUILD = path.join(HERE, 'build');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const tl = JSON.parse(fs.readFileSync(path.join(BUILD, 'timeline.json'), 'utf8'));
const tts = JSON.parse(fs.readFileSync(path.join(BUILD, 'tts.json'), 'utf8'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const FADE = 0.45;

const parts = [];
const srt = [];
let offset = 0;
for (const scene of SCENES) {
  const s = tl[scene.id];
  if (!s) throw new Error(`scene ${scene.id} not recorded; run record.mjs ${scene.id}`);
  // keep [from, to] minus cuts
  const keep = [];
  let a = s.from;
  for (const [c0, c1] of s.cuts) { if (c0 > a) keep.push([a, c0]); a = c1; }
  keep.push([a, s.to]);
  const map = (t) => t - s.from - s.cuts.filter((c) => c[1] <= t).reduce((x, c) => x + (c[1] - c[0]), 0);
  const D = keep.reduce((x, [p, q]) => x + (q - p), 0);

  const sel = keep.map(([p, q]) => `between(t,${p.toFixed(3)},${q.toFixed(3)})`).join('+');
  let vf = `select='${sel}',setpts=N/30/TB`;
  if (s.fadeIn) vf += `,fade=t=in:st=0:d=${FADE}`;
  if (s.fadeOut) vf += `,fade=t=out:st=${(D - FADE).toFixed(3)}:d=${FADE}`;

  const inputs = ['-i', s.file];
  const af = [];
  s.beats.forEach((b, i) => {
    const wav = tts[b.key]?.wav ?? b.audio;
    inputs.push('-i', wav);
    const ms = Math.round(map(b.start) * 1000);
    af.push(`[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`);
    const st = offset + map(b.start);
    const next = s.beats[i + 1] ? offset + map(s.beats[i + 1].start) : offset + D;
    srt.push({ st, en: Math.min(next - 0.05, st + (tts[b.key]?.dur ?? b.dur) + 0.35), text: b.text });
  });
  af.push(`${s.beats.map((_, i) => `[a${i}]`).join('')}amix=inputs=${s.beats.length}:normalize=0:dropout_transition=0,apad,atrim=0:${D.toFixed(3)}[aout]`);
  const outp = path.join(BUILD, `final-${scene.id}.mp4`);
  ff([...inputs, '-filter_complex', `[0:v]${vf}[vout];${af.join(';')}`, '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', D.toFixed(3), outp]);
  parts.push(outp);
  console.log(`scene ${scene.id}: ${D.toFixed(1)}s`);
  offset += D;
}

const list = path.join(BUILD, 'concat.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
const joined = path.join(BUILD, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
const final = path.join(OUT, 'leakscope-demo.mp4');
ff(['-i', joined, '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart', final]);

const ts = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
fs.writeFileSync(path.join(OUT, 'leakscope-demo.srt'), srt.map((c, i) => `${i + 1}\n${ts(c.st)} --> ${ts(c.en)}\n${c.text}\n`).join('\n'));
const size = fs.statSync(final).size / 1e6;
console.log(`→ ${final}  ${Math.floor(offset / 60)}:${String(Math.round(offset % 60)).padStart(2, '0')}  ${size.toFixed(1)} MB`);
