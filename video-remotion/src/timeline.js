// Shared by the Remotion composition and export-srt.mjs. All times in seconds.
export const FPS = 30;
const GAP = 0.35;

// focus: [startOffsetWithinBeat, zoom, originX, originY]
export const SCENE_DEFS = [
  { id: 'intro', lead: 0.6, lines: ['intro-0', 'intro-1'], gap: 0.4, tail: 0.6, captions: false },
  { id: 'leak', lead: 0.4, lines: ['leak-0', 'leak-1'], gap: 0.45, tail: 0.8 },
  { id: 'stat', lead: 0.3, lines: ['stat-0'], gap: 0.3, tail: 0.8, rec: 'observatory' },
  { id: 'acc', lead: 0.4, lines: ['acc-0', 'acc-1'], gap: 0.35, tail: 0.7 },
  { id: 'check', lead: 0.35, rec: 'check', chapter: '01', title: 'Check a transaction', url: 'leakscope-cyan.vercel.app/check/',
    focus: { 'check-0': [1.3, 0.05, 0.92], 'check-1': [1.18, 0.5, 0.45] } },
  { id: 'plan', lead: 0.4, rec: 'plan', chapter: '02', title: 'Pre-flight a transfer', url: 'leakscope-cyan.vercel.app/plan/',
    focus: { 'plan-0': [1.15, 0.0, 0.5], 'plan-1': [1.5, 0.85, 0.2], 'plan-2': [1.3, 0.92, 0.5] } },
  { id: 'scan', lead: 0.4, rec: 'scan', chapter: '03', title: 'Scan your wallet', url: 'leakscope-cyan.vercel.app/scan/', tail: 0.6,
    focus: { 'scan-0': [1.25, 0.3, 0.4], 'scan-1': [1.45, 0.9, 0.55] } },
  { id: 'sdk', lead: 0.6, lines: ['sdk-0'], gap: 0.3, tail: 1.3 },
  { id: 'outro', lead: 0.6, lines: ['outro-0'], gap: 0.3, tail: 1.8, captions: false },
];

export function buildTimeline(N, REC) {
  let t = 0;
  const scenes = [];
  for (const d of SCENE_DEFS) {
    const s = { ...d, from: t, lines: [], segs: [] };
    if (d.rec && d.id !== 'stat') {
      const r = REC[d.rec];
      let cur = d.lead;
      r.beats.forEach((b, i) => {
        const slot = Math.max(N[b.key].dur + GAP, b.end - b.start);
        const isFirst = i === 0, isLast = i === r.beats.length - 1;
        const vStart = isFirst ? b.start - d.lead : b.start;
        const len = (isFirst ? d.lead : 0) + slot + (isLast ? (d.tail ?? 0.4) : 0);
        s.segs.push({ at: isFirst ? 0 : cur, src: vStart, len, key: b.key });
        s.lines.push({ key: b.key, text: N[b.key].text, start: t + cur, dur: N[b.key].dur, rel: cur });
        cur += slot;
      });
      s.dur = cur + (d.tail ?? 0.4);
    } else {
      let cur = d.lead;
      for (const k of d.lines ?? []) {
        s.lines.push({ key: k, text: N[k].text, start: t + cur, dur: N[k].dur, rel: cur });
        cur += N[k].dur + d.gap;
      }
      s.dur = cur - d.gap + d.tail;
      if (d.rec) s.recSrc = REC[d.rec].beats[0].start - d.lead;
    }
    s.dur = Math.round(s.dur * FPS) / FPS;
    scenes.push(s);
    t += s.dur;
  }
  return { scenes, total: t };
}
