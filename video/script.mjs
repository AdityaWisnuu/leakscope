// Regenerates SCRIPT.md (narration per scene) from scenes.mjs and, if present, the measured timeline.
import fs from 'node:fs';
import path from 'node:path';
import { SCENES } from './scenes.mjs';

const HERE = import.meta.dirname;
const tlPath = path.join(HERE, 'build/timeline.json');
const tl = fs.existsSync(tlPath) ? JSON.parse(fs.readFileSync(tlPath, 'utf8')) : {};

let md = `# Leakscope demo video: narration script

Generated from \`scenes.mjs\` by \`script.mjs\`; edit the scenes file, not this one.

Each numbered line is one caption and one narration take. The video is cut to the length of each
take, so you can re-record in your own voice without re-timing anything:

1. Record each line as its own file: \`build/tts/<scene>-<n>.wav\` (names below, n starts at 0).
   Leave about a quarter second of silence at the end of each take.
2. Run \`SKIP_TTS=1 ./make.sh\`. The screen recording is redone with your take lengths.

Spoken text differs from the caption only where numbers or names need to be read aloud
(for example "two point five zero one two one Z E C"); read whichever feels natural.

`;
let total = 0;
for (const s of SCENES) {
  const t = tl[s.id];
  const dur = t ? t.to - t.from - t.cuts.reduce((x, c) => x + c[1] - c[0], 0) : null;
  if (dur) total += dur;
  md += `## ${s.title}${dur ? ` (about ${Math.round(dur)} s)` : ''}\n\nOn screen: \`${s.path}\`\n\n`;
  s.beats.forEach((b, i) => {
    md += `${i + 1}. **${s.id}-${i}.wav**: ${b.text}\n`;
    if (b.say && b.say !== b.text) md += `   - *spoken:* ${b.say}\n`;
  });
  md += '\n';
}
if (total) md += `Total: about ${Math.floor(total / 60)} min ${Math.round(total % 60)} s.\n`;
fs.writeFileSync(path.join(HERE, 'SCRIPT.md'), md);
console.log('wrote SCRIPT.md');
