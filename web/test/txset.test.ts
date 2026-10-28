import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildTxSet, readTxSet } from '../lib/txset';

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('') + n * 0;

describe('txset', () => {
  test('no false negatives, few false positives', () => {
    const ids = Array.from({ length: 5000 }, (_, i) => hex(i));
    const set = readTxSet(buildTxSet(ids, 10, 20, 16, 8).buffer as ArrayBuffer);
    expect(set.from).toBe(10);
    expect(set.to).toBe(20);
    expect(set.count).toBe(5000);
    expect(ids.every((t) => set.has(t))).toBe(true);
    expect(ids.every((t) => set.has(t.toUpperCase()))).toBe(true);
    let fp = 0;
    for (let i = 0; i < 5000; i++) if (set.has(hex(i))) fp++;
    expect(fp).toBeLessThan(250);
  });

  test('published filter covers the published range and contains known findings', () => {
    const file = path.join(import.meta.dir, '../public/txset.bin');
    const b = fs.readFileSync(file);
    const set = readTxSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const summary = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '../public/data/summary.json'), 'utf8'));
    expect(set.from).toBe(summary.range.from);
    expect(set.to).toBe(summary.range.to);
    const ex = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '../public/data/examples.json'), 'utf8'));
    for (const list of Object.values(ex) as { txids: string[] }[][]) for (const f of list) expect(set.has(f.txids.at(-1)!)).toBe(true); // earlier ends may sit in the warm-up blocks before the range
    expect(set.has('a'.repeat(64))).toBe(false);
  });
});
