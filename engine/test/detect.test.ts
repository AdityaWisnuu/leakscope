import { describe, expect, test } from 'bun:test';
import { analyze, conventionalFee, type TxRecord } from '../src';

const P2PKH = (n: number) => `76a914${n.toString(16).padStart(40, '0')}88ac`;
let seq = 0;
const tx = (h: number, part: Partial<TxRecord>): TxRecord => ({
  h, time: h * 75, txid: (++seq).toString(16).padStart(64, '0'), idx: 1, fee: null,
  vin: [], vout: [], n: { ss: 0, so: 0, orc: 0, iw: 0 }, ...part,
});

describe('amount correlation', () => {
  test('a unique odd amount shielded then deshielded minus a ZIP-317 fee is linked', () => {
    const fund = tx(1, { vout: [[123_456_789, P2PKH(1)]] });
    const shield = tx(10, { vin: [[fund.txid, 0]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: -123_436_789 } });
    const deshield = tx(50, { vout: [[123_421_789, P2PKH(2)]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: 123_436_789 } });
    const { findings } = analyze([fund, shield, deshield]);
    const link = findings.find((f) => f.kind === 'quick-roundtrip');
    expect(link?.txids).toEqual([shield.txid, deshield.txid]);
    expect(link?.anonymitySet).toBe(1);
  });

  test('a common amount hides among many deposits', () => {
    const recs: TxRecord[] = [];
    for (let i = 0; i < 20; i++) {
      const f = tx(i * 2 + 1, { vout: [[100_010_000, P2PKH(i)]] });
      recs.push(f, tx(i * 2 + 2, { vin: [[f.txid, 0]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: -100_000_000 } }));
    }
    recs.push(tx(100, { vout: [[99_990_000, P2PKH(99)]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: 100_000_000 } }));
    const { findings, outSets } = analyze(recs);
    expect(outSets[0].candidates.length).toBe(20);
    expect(findings.filter((f) => f.kind === 'amount-link' || f.kind === 'quick-roundtrip')).toHaveLength(0);
  });
});

describe('deterministic links', () => {
  test('re-shielding a deshielded output is a critical round trip', () => {
    const out = tx(5, { vout: [[50_000_000, P2PKH(7)]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: 50_010_000 } });
    const back = tx(9, { vin: [[out.txid, 0]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: -49_990_000 } });
    const f = analyze([out, back]).findings.find((x) => x.kind === 'utxo-roundtrip');
    expect(f?.severity).toBe('critical');
    expect(f?.txids).toEqual([out.txid, back.txid]);
  });

  test('shielding from an address that received a deshielding is flagged', () => {
    const out = tx(5, { vout: [[50_000_000, P2PKH(7)]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: 50_010_000 } });
    const other = tx(6, { vout: [[70_000_000, P2PKH(7)]] });
    const back = tx(9, { vin: [[other.txid, 0]], n: { ss: 0, so: 0, orc: 0, iw: 2 }, vb: { sapling: 0, orchard: 0, ironwood: -69_990_000 } });
    expect(analyze([out, other, back]).findings.some((x) => x.kind === 'address-reuse')).toBe(true);
  });
});

describe('turnstile', () => {
  test('Orchard → Ironwood migration reveals the exact amount', () => {
    const m = tx(3, { n: { ss: 0, so: 0, orc: 4, iw: 2 }, vb: { sapling: 0, orchard: 92_901_400, ironwood: -92_871_400 } });
    const f = analyze([m]).findings.find((x) => x.kind === 'pool-crossing');
    expect(f?.amount).toBe(92_871_400);
  });
});

describe('fees', () => {
  test('ZIP-317 fee for a 2-action Ironwood tx is 10000', () => {
    expect(conventionalFee(tx(1, { n: { ss: 0, so: 0, orc: 0, iw: 2 } }))).toBe(10_000);
  });
  test('a non-standard fee is a fingerprint', () => {
    const t = tx(1, { fee: 12_345, n: { ss: 0, so: 0, orc: 0, iw: 2 } });
    expect(analyze([t]).findings.some((x) => x.kind === 'fee-fingerprint')).toBe(true);
  });
});
