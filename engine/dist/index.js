// node_modules/@noble/hashes/esm/utils.js
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0;i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
class Hash {
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}

class HashMD extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0;pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (;blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos;i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0;i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor);
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
}
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);

class SHA256 extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0;i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16;i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0;i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
}
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256);

// node_modules/@noble/hashes/esm/sha256.js
var sha2562 = sha256;

// src/address.ts
var ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = 0n;
  for (const b of bytes)
    n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0)
      break;
    s = "1" + s;
  }
  return s;
}
function base58check(payload) {
  const check = sha2562(sha2562(payload)).slice(0, 4);
  const all = new Uint8Array(payload.length + 4);
  all.set(payload);
  all.set(check, payload.length);
  return base58(all);
}
var hexToBytes = (h) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
var PREFIX = {
  main: { p2pkh: [28, 184], p2sh: [28, 189] },
  test: { p2pkh: [29, 37], p2sh: [28, 186] }
};
function scriptToAddress(scriptHex, network = "main") {
  const p = PREFIX[network];
  let prefix;
  let hash;
  if (/^76a914[0-9a-f]{40}88ac$/.test(scriptHex)) {
    prefix = p.p2pkh;
    hash = scriptHex.slice(6, 46);
  } else if (/^a914[0-9a-f]{40}87$/.test(scriptHex)) {
    prefix = p.p2sh;
    hash = scriptHex.slice(4, 44);
  }
  if (!prefix || !hash)
    return `script:${scriptHex.slice(0, 16)}`;
  return base58check(Uint8Array.from([...prefix, ...hexToBytes(hash)]));
}
// src/events.ts
class OutputIndex {
  network;
  outputs = new Map;
  constructor(network = "main") {
    this.network = network;
  }
  add(r) {
    r.vout.forEach(([value, script], i) => {
      this.outputs.set(`${r.txid}:${i}`, { value, addr: scriptToAddress(script, this.network), txid: r.txid });
    });
  }
  get(txid, index) {
    return this.outputs.get(`${txid}:${index}`);
  }
  address(script) {
    return scriptToAddress(script, this.network);
  }
}
var SHIELDED = ["sapling", "orchard", "ironwood"];
function valueEvents(r, outputs) {
  if (r.idx === 0 || !r.vb)
    return [];
  const vb = r.vb;
  const sum = vb.sapling + vb.orchard + vb.ironwood;
  const receiving = SHIELDED.filter((p) => vb[p] < 0).sort((a, b) => vb[a] - vb[b]);
  const sending = SHIELDED.filter((p) => vb[p] > 0).sort((a, b) => vb[b] - vb[a]);
  const base = { txid: r.txid, h: r.h, time: r.time, fee: paidFee(r, outputs) };
  const events = [];
  if (r.vin.length > 0 && sum < 0) {
    const addrs = [...new Set(r.vin.map(([t, i]) => outputs.get(t, i)?.addr).filter((a) => !!a))];
    events.push({ ...base, dir: "in", from: "transparent", to: receiving[0] ?? "ironwood", amount: -sum, addrs });
  }
  if (r.vout.length > 0 && sum > 0) {
    const from = sending[0] ?? "ironwood";
    for (const [value, script] of r.vout) {
      events.push({ ...base, dir: "out", from, to: "transparent", amount: value, addrs: [outputs.address(script)] });
    }
  }
  if (receiving.length > 0 && sending.length > 0) {
    for (const to of receiving) {
      const from = sending[0];
      const amount = -vb[to];
      events.push({ ...base, dir: "out", from, to, amount, addrs: [] });
      events.push({ ...base, dir: "in", from, to, amount, addrs: [] });
    }
  }
  return events;
}
function conventionalFee(r) {
  const logical = Math.max(r.vin.length, r.vout.length) + Math.max(r.n.ss, r.n.so) + r.n.orc + r.n.iw;
  return 5000 * Math.max(2, logical);
}
function paidFee(r, outputs) {
  if (r.idx === 0)
    return null;
  if (r.fee !== null && r.vin.length === 0)
    return r.fee;
  if (!r.vb)
    return r.vin.length === 0 ? r.fee : null;
  let tin = 0;
  for (const [t, i] of r.vin) {
    const o = outputs.get(t, i);
    if (!o)
      return null;
    tin += o.value;
  }
  const tout = r.vout.reduce((s, [v]) => s + v, 0);
  return tin - tout + r.vb.sapling + r.vb.orchard + r.vb.ironwood;
}
// src/zip318.ts
var ZAT_PER_ZEC = 1e8;
var MAX_RESIDUAL_VALUE = ZAT_PER_ZEC / 100;
var DENOM_CAP = 1e4 * ZAT_PER_ZEC;
var MEAN_DELAY = 66;
var MAX_DELAY = 576;
var BOUNDARY_MODULUS = 144;
var DIGIT_PARTS = {
  1: [1],
  2: [2],
  3: [2, 1],
  4: [2, 2],
  5: [5],
  6: [5, 1],
  7: [5, 2],
  8: [5, 2, 1],
  9: [5, 2, 2]
};
function isDenomination(zat) {
  for (let p = MAX_RESIDUAL_VALUE;p <= DENOM_CAP; p *= 10) {
    if (zat === p || zat === 2 * p || zat === 5 * p)
      return zat <= DENOM_CAP;
  }
  return false;
}
function decompose(value) {
  const parts = [];
  let rem = value;
  while (rem >= DENOM_CAP) {
    parts.push(DENOM_CAP);
    rem -= DENOM_CAP;
  }
  for (let place = DENOM_CAP / 10;place >= MAX_RESIDUAL_VALUE; place /= 10) {
    const digit = Math.floor(rem / place);
    for (const n of DIGIT_PARTS[digit] ?? [])
      parts.push(n * place);
    rem -= digit * place;
  }
  return { parts, residual: rem };
}
var secureRandom = () => {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
};
function decomposeRandomized(value, rng = secureRandom) {
  const parts = [];
  let rem = value;
  while (rem >= MAX_RESIDUAL_VALUE) {
    let place = MAX_RESIDUAL_VALUE;
    while (place * 10 <= rem && place * 10 <= DENOM_CAP)
      place *= 10;
    let pick;
    if (5 * place <= rem && 5 * place <= DENOM_CAP) {
      const r = rng();
      pick = r < 0.1 ? place : r < 0.35 ? 2 * place : 5 * place;
    } else if (2 * place <= rem && 2 * place <= DENOM_CAP) {
      pick = rng() < 0.25 ? place : 2 * place;
    } else {
      pick = place;
    }
    parts.push(pick);
    rem -= pick;
  }
  return { parts, residual: rem };
}
function drawDelay(rng = secureRandom, mean = MEAN_DELAY, max = MAX_DELAY) {
  for (;; ) {
    const d = Math.round(-Math.log(1 - rng()) * mean);
    if (d <= max)
      return d;
  }
}
function schedule(parts, tip, rng = secureRandom) {
  const shuffled = [...parts];
  for (let i = shuffled.length - 1;i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  let h = Math.ceil(tip / BOUNDARY_MODULUS) * BOUNDARY_MODULUS + BOUNDARY_MODULUS;
  return shuffled.map((amount) => {
    h += drawDelay(rng);
    return { amount, height: h };
  });
}

// src/detect.ts
var DEFAULTS = { windowBlocks: 1152 * 30, maxFeeGap: 250000, network: "main" };
var ZEC = 1e8;
var fmtZec = (z) => `${(z / ZEC).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} ZEC`;
function depositMatches(depositAmount, out, maxFeeGap = DEFAULTS.maxFeeGap) {
  const gap = depositAmount - out.amount;
  if (out.fee != null)
    return gap === out.fee;
  return gap > 0 && gap <= maxFeeGap && gap % 5000 === 0;
}
var CALIBRATION = {
  fast: { severity: "high", precision: 99, label: "non-round amount, within 100 blocks" },
  day: { severity: "medium", precision: 85, label: "non-round amount, within a day" },
  "fast-round": { severity: "medium", precision: 90, label: "round amount, within 10 blocks" }
};
function linkTier(blocks, amount) {
  const round = amount % 1e5 === 0;
  if (round)
    return blocks <= 10 ? "fast-round" : null;
  return blocks <= 100 ? "fast" : blocks <= 1152 ? "day" : null;
}
function analyze(records, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const outputs = new OutputIndex(o.network);
  const findings = [];
  const events = [];
  const deshieldTxs = new Set;
  const deshieldedTo = new Map;
  const crossings = [];
  for (const r of records) {
    outputs.add(r);
    const evs = valueEvents(r, outputs);
    events.push(...evs);
    for (const e of evs) {
      if (e.dir === "out" && e.to === "transparent") {
        deshieldTxs.add(e.txid);
        for (const a of e.addrs)
          if (!deshieldedTo.has(a))
            deshieldedTo.set(a, e);
      }
      if (e.dir === "in" && e.from === "transparent") {
        const spent = r.vin.map(([t, i]) => outputs.get(t, i)).filter((x) => x && deshieldTxs.has(x.txid));
        if (spent.length > 0) {
          findings.push({
            kind: "utxo-roundtrip",
            severity: "critical",
            txids: [spent[0].txid, r.txid],
            title: `Re-shielded coins that had just been deshielded (${fmtZec(e.amount)})`,
            detail: "This shielding spends a transparent output created by an earlier deshielding. " + "Anyone can follow the coins out of the shielded pool and back in, so both ends are linked.",
            anonymitySet: 1,
            amount: e.amount,
            h: r.h,
            addresses: [...new Set(spent.map((x) => x.addr))]
          });
        } else {
          const reused = e.addrs.map((a) => deshieldedTo.get(a)).find((x) => x && x.txid !== r.txid);
          if (reused) {
            findings.push({
              kind: "address-reuse",
              severity: "high",
              txids: [reused.txid, r.txid],
              title: `Shielded from an address that earlier received deshielded funds`,
              detail: `Address ${e.addrs[0]} received a withdrawal from the shielded pool and later shielded again. ` + "Reusing a transparent address ties both shielded activities to one owner.",
              anonymitySet: 1,
              amount: e.amount,
              h: r.h,
              addresses: [e.addrs[0]]
            });
          }
        }
      }
      if (e.dir === "in" && e.from !== "transparent")
        crossings.push(e);
    }
    const fee = paidFee(r, outputs);
    if (fee !== null && fee > 0 && fee !== conventionalFee(r)) {
      findings.push({
        kind: "fee-fingerprint",
        severity: "low",
        txids: [r.txid],
        title: `Non-standard fee ${fee} zat (ZIP-317 would be ${conventionalFee(r)})`,
        detail: "Most wallets pay exactly the ZIP-317 fee. A distinctive fee narrows down which wallet " + "software made this transaction and can connect it to others with the same quirk.",
        h: r.h
      });
    }
  }
  const sameAmount = new Map;
  for (const c of crossings)
    sameAmount.set(c.amount, [...sameAmount.get(c.amount) ?? [], c.h]);
  for (const c of crossings) {
    const n = sameAmount.get(c.amount).filter((h) => Math.abs(h - c.h) <= o.windowBlocks).length;
    const standard = isDenomination(c.amount);
    findings.push({
      kind: "pool-crossing",
      severity: n === 1 ? "medium" : n <= 10 ? "low" : "info",
      txids: [c.txid],
      title: `Exact amount revealed moving ${c.from} → ${c.to}: ${fmtZec(c.amount)}`,
      detail: "Moving value between shielded pools passes through a public turnstile, so the exact amount is visible. " + (n === 1 ? "No other move of this amount happened nearby: it acts as a fingerprint that later amounts can be matched against." : `${n} moves of this amount happened within the window, so it blends in` + (standard ? " (it is a standard ZIP-318 denomination)." : ".")),
      anonymitySet: n,
      amount: c.amount,
      h: c.h
    });
  }
  const ins = events.filter((e) => e.dir === "in").sort((a, b) => a.amount - b.amount);
  const outSets = [];
  for (const out of events) {
    if (out.dir !== "out")
      continue;
    const candidates = [];
    let lo = 0, hi = ins.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (ins[mid].amount < out.amount)
        lo = mid + 1;
      else
        hi = mid;
    }
    for (let i = lo;i < ins.length && ins[i].amount <= out.amount + o.maxFeeGap; i++) {
      const cand = ins[i];
      if (cand.txid === out.txid || cand.h >= out.h || out.h - cand.h > o.windowBlocks)
        continue;
      if (cand.to !== out.from)
        continue;
      if (depositMatches(cand.amount, out, o.maxFeeGap))
        candidates.push(cand);
    }
    if (candidates.length === 0)
      continue;
    outSets.push({ event: out, candidates });
    if (candidates.length !== 1)
      continue;
    const src = candidates[0];
    const blocks = out.h - src.h;
    const tier = linkTier(blocks, out.amount);
    if (!tier)
      continue;
    const t = CALIBRATION[tier];
    findings.push({
      kind: blocks <= 100 ? "quick-roundtrip" : "amount-link",
      severity: t.severity,
      txids: [src.txid, out.txid],
      title: `Withdrawal of ${fmtZec(out.amount)} matches exactly one earlier deposit (${blocks} blocks before)`,
      detail: `Only one value entered the ${out.from} pool in the previous ${Math.round(o.windowBlocks / 1152)} days ` + `that equals this withdrawal plus its own fee. Measured on mainnet, links of this kind ` + `(${t.label}) are right about ${t.precision}% of the time — no cryptography is broken, only amounts are matched.`,
      anonymitySet: 1,
      amount: out.amount,
      h: out.h
    });
  }
  return { findings, events, outSets };
}
// src/preflight.ts
class ChainContext {
  opts;
  tip;
  byAmount;
  addrUse = new Map;
  constructor(analysis, opts = DEFAULTS) {
    this.opts = opts;
    this.byAmount = [...analysis.events].sort((a, b) => a.amount - b.amount);
    this.tip = analysis.events.reduce((m, e) => Math.max(m, e.h), 0);
    for (const e of analysis.events) {
      for (const a of e.addrs) {
        const list = this.addrUse.get(a) ?? [];
        list.push(e);
        this.addrUse.set(a, list);
      }
    }
  }
  similar(amount, dir) {
    const lo = amount - this.opts.maxFeeGap, hi = amount + this.opts.maxFeeGap;
    let i = this.lowerBound(lo);
    const out = [];
    for (;i < this.byAmount.length && this.byAmount[i].amount <= hi; i++) {
      const e = this.byAmount[i];
      const gap = Math.abs(e.amount - amount);
      if (this.tip - e.h > this.opts.windowBlocks || gap % 5000 !== 0)
        continue;
      if (dir && e.dir !== dir)
        continue;
      out.push(e);
    }
    return out;
  }
  usesOf(addr) {
    return this.addrUse.get(addr) ?? [];
  }
  lowerBound(x) {
    let lo = 0, hi = this.byAmount.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (this.byAmount[mid].amount < x)
        lo = mid + 1;
      else
        hi = mid;
    }
    return lo;
  }
}
function uniqueTxs(events) {
  const seen = new Set;
  return events.filter((e) => !seen.has(e.txid) && seen.add(e.txid));
}
function scoreForSet(n) {
  return n <= 1 ? 5 : n <= 3 ? 25 : n <= 10 ? 50 : n <= 50 ? 75 : 90;
}
function preflight(plan, ctx) {
  const warnings = [];
  const suggestions = [];
  const own = new Set(plan.ownTxids ?? []);
  const revealsAmount = plan.from !== plan.to;
  if (!revealsAmount) {
    if (plan.from === "transparent") {
      warnings.push({
        severity: "critical",
        title: "Fully transparent transaction",
        detail: "Sender, recipient and amount are all public. Shield first."
      });
      return { score: 0, anonymitySet: 1, revealsAmount: true, warnings, suggestions };
    }
    return {
      score: 100,
      anonymitySet: null,
      revealsAmount: false,
      warnings: [
        {
          severity: "info",
          title: `Stays inside the ${plan.from} pool`,
          detail: "Sender, recipient, amount and memo stay encrypted. Still visible: that a transaction happened, " + "when, its number of actions and its fee. Use the standard ZIP-317 fee so it looks like every other wallet."
        }
      ],
      suggestions
    };
  }
  const lookalikes = uniqueTxs(ctx.similar(plan.amount).filter((e) => !own.has(e.txid)));
  const anonymitySet = lookalikes.length + 1;
  let score = scoreForSet(anonymitySet);
  const dir = plan.to === "transparent" ? "leaving" : plan.from === "transparent" ? "entering" : "moving between";
  warnings.push({
    severity: anonymitySet === 1 ? "high" : anonymitySet <= 10 ? "medium" : "low",
    title: `The amount ${fmtZec(plan.amount)} will be public`,
    detail: `Value ${dir} the shielded pools is visible on-chain. In the last ` + `${Math.round(DEFAULTS.windowBlocks / 1152)} days, ${lookalikes.length} other transaction` + `${lookalikes.length === 1 ? "" : "s"} crossed a pool boundary with the same amount (allowing for fees).` + (anonymitySet === 1 ? " It would be unique: anyone matching amounts can single it out." : "")
  });
  if (plan.to === "transparent" || plan.from !== "transparent") {
    const deposits = ctx.similar(plan.amount, "in").filter((e) => e.amount >= plan.amount);
    const mine = deposits.filter((e) => own.has(e.txid));
    if (mine.length > 0 && deposits.length <= 3) {
      score = Math.min(score, 5);
      warnings.push({
        severity: "critical",
        title: "This withdrawal points straight back at your own deposit",
        detail: `Your earlier transaction moved almost exactly this amount into the pool, and only ${deposits.length} ` + "deposit(s) of that size exist in the window. An observer links the two without breaking any cryptography.",
        txids: mine.map((e) => e.txid)
      });
    }
  }
  if (plan.toAddress) {
    const uses = ctx.usesOf(plan.toAddress);
    if (uses.length > 0) {
      score = Math.min(score, 10);
      warnings.push({
        severity: "high",
        title: "Destination address already appears on-chain",
        detail: `${plan.toAddress} was used at a pool boundary ${uses.length} time(s) before. Reuse ties those transactions to this one. Use a fresh address.`,
        txids: uses.map((e) => e.txid)
      });
    }
  }
  for (const a of plan.fromAddresses ?? []) {
    const deshieldedHere = ctx.usesOf(a).filter((e) => e.dir === "out");
    if (deshieldedHere.length > 0) {
      score = Math.min(score, 10);
      warnings.push({
        severity: "high",
        title: "Shielding from an address that received shielded funds",
        detail: `${a} received a deshielding before. Shielding from it links both sides of the hop.`,
        txids: deshieldedHere.map((e) => e.txid)
      });
    }
  }
  if (!isDenomination(plan.amount)) {
    const { parts, residual } = decompose(plan.amount);
    const plan318 = schedule(parts, ctx.tip);
    const minSet = Math.min(...parts.map((p) => uniqueTxs(ctx.similar(p)).length + 1));
    suggestions.push({
      title: `Split into ${parts.length} standard ZIP-318 amount${parts.length === 1 ? "" : "s"}, spread over time`,
      detail: `${parts.map(fmtZec).join(" + ")}${residual >= 1 ? ` (leaving ${fmtZec(residual)} behind)` : ""}. ` + `Standard amounts are shared by every compliant wallet: the smallest crowd among these parts is ` + `${minSet} recent look-alikes, versus ${anonymitySet} for the exact amount. Broadcasting them at ` + `random, exponentially spaced heights (mean 66 blocks ≈ 82 min) breaks timing correlation too.`,
      schedule: plan318
    });
  }
  if (plan.to === "transparent") {
    suggestions.push({
      title: "Withdraw to a fresh address you never reuse",
      detail: "A new transparent address per withdrawal keeps observers from clustering your exits."
    });
  }
  if (plan.amount < MAX_RESIDUAL_VALUE) {
    suggestions.push({
      title: "Consider whether this needs to leave the pool at all",
      detail: "Paying a shielded address directly reveals nothing about the amount."
    });
  }
  return { score, anonymitySet, revealsAmount, warnings, suggestions };
}
// src/wallet.ts
var DEFAULT_DATA_URL = "https://leakscope-cyan.vercel.app/data";
var INDEX_POOLS = ["transparent", "sapling", "orchard", "ironwood"];
function eventsFromIndex(ix) {
  const n = ix.amount.length;
  const out = new Array(n);
  for (let i = 0;i < n; i++) {
    let id = ix.tx ? ix.tx[i] : i;
    if (!ix.tx && i > 0 && ix.from[i] !== 0 && ix.to[i] !== 0 && ix.dir[i] === 1 && ix.dir[i - 1] === 0 && ix.h[i - 1] === ix.h[i] && ix.amount[i - 1] === ix.amount[i])
      id = i - 1;
    out[i] = {
      txid: `tx:${id}`,
      h: ix.h[i],
      time: 0,
      dir: ix.dir[i] === 1 ? "in" : "out",
      from: INDEX_POOLS[ix.from[i]],
      to: INDEX_POOLS[ix.to[i]],
      amount: ix.amount[i],
      addrs: []
    };
  }
  return out;
}
function contextFromIndex(ix, boundaryAddresses = []) {
  const events = eventsFromIndex(ix);
  const chain = new ChainContext({ events });
  return { chain, tip: Math.max(ix.tip, chain.tip), events: events.length, boundaryAddresses: new Set(boundaryAddresses) };
}
async function loadPublishedContext(opts = {}) {
  const base = (opts.baseUrl ?? DEFAULT_DATA_URL).replace(/\/+$/, "");
  const f = opts.fetch ?? globalThis.fetch;
  if (!f)
    throw new Error("No fetch available: pass opts.fetch or use contextFromIndex()");
  const get = async (name) => {
    const r = await f(`${base}/${name}`, { signal: opts.signal });
    if (!r.ok)
      throw new Error(`Leakscope: could not load ${base}/${name} (${r.status})`);
    return r.json();
  };
  const [ix, addrs] = await Promise.all([
    get("event-index.json"),
    opts.addresses === false ? Promise.resolve([]) : get("boundary-addresses.json")
  ]);
  return contextFromIndex(ix, addrs);
}
var RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
function levelFor(score) {
  return score >= 75 ? "ok" : score >= 40 ? "warn" : "danger";
}
function isWalletContext(c) {
  return "chain" in c && "boundaryAddresses" in c;
}
function crowdOf(chain, amount) {
  return new Set(chain.similar(amount).map((e) => e.txid)).size + 1;
}
function runPreflight(req, c) {
  const plan = { from: req.from, to: req.to, amount: req.amountZat, ownTxids: req.ownTxids };
  if (!isWalletContext(c))
    return preflight({ ...plan, toAddress: req.toAddress, fromAddresses: req.fromAddresses }, c);
  const r = preflight(plan, c.chain);
  if (!r.revealsAmount)
    return r;
  const warnings = [...r.warnings];
  let score = r.score;
  const to = req.toAddress?.trim();
  if (to && c.boundaryAddresses.has(to)) {
    score = Math.min(score, 10);
    warnings.push({
      severity: "high",
      title: "Destination address already appears on-chain",
      detail: `${to} was already used at a shielded-pool boundary. Reuse ties those transactions to this one. Use a fresh address.`
    });
  }
  for (const a of req.fromAddresses ?? []) {
    if (!c.boundaryAddresses.has(a.trim()))
      continue;
    score = Math.min(score, 10);
    warnings.push({
      severity: "high",
      title: "Shielding from an address that already touched a shielded pool",
      detail: `${a} appeared at a pool boundary before (for example receiving a deshielding). Shielding from it links both sides of the hop.`
    });
  }
  return { ...r, score, warnings };
}
function checkSend(req, c) {
  if (!Number.isSafeInteger(req.amountZat) || req.amountZat <= 0) {
    throw new RangeError("amountZat must be a positive integer number of zatoshis");
  }
  const chain = isWalletContext(c) ? c.chain : c;
  const r = runPreflight(req, c);
  const level = levelFor(r.score);
  const warnings = [...r.warnings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const amt = fmtZec(req.amountZat);
  const crowd = r.anonymitySet;
  let suggestedSplit;
  if (req.from !== req.to && !isDenomination(req.amountZat)) {
    const { parts, residual } = decompose(req.amountZat);
    if (parts.length > 0) {
      const withCrowd = parts.map((p) => ({ amountZat: p, crowd: crowdOf(chain, p) }));
      suggestedSplit = {
        parts: withCrowd,
        residualZat: residual,
        schedule: req.currentHeight == null && r.suggestions.find((s) => s.schedule)?.schedule || schedule(parts, Math.max(req.currentHeight ?? 0, chain.tip)),
        minCrowd: Math.min(...withCrowd.map((p) => p.crowd))
      };
    }
  }
  const reasons = warnings.filter((w) => w.severity !== "info" || level === "ok").map((w) => w.title);
  let headline;
  if (!r.revealsAmount)
    headline = `Private: stays inside the ${req.from} pool`;
  else if (req.from === "transparent" && req.to === "transparent")
    headline = "Fully public: sender, recipient and amount are visible";
  else if (warnings[0] && RANK[warnings[0].severity] <= RANK.high && warnings[0].title.includes("address"))
    headline = warnings[0].title;
  else if (warnings.some((w) => w.severity === "critical"))
    headline = warnings.find((w) => w.severity === "critical").title;
  else if (crowd === 1)
    headline = `${amt} would be unique on-chain: anyone matching amounts can single it out`;
  else if (level === "ok")
    headline = `${amt} will be public, but it blends in with ${crowd - 1} recent look-alikes`;
  else
    headline = `${amt} will be public and only ${crowd - 1} recent transaction${crowd === 2 ? "" : "s"} look alike`;
  return {
    level,
    score: r.score,
    headline,
    reasons,
    revealsAmount: r.revealsAmount,
    crowd,
    suggestedSplit,
    warnings,
    suggestions: r.suggestions
  };
}
export {
  valueEvents,
  secureRandom,
  scriptToAddress,
  schedule,
  preflight,
  paidFee,
  loadPublishedContext,
  linkTier,
  levelFor,
  isDenomination,
  fmtZec,
  eventsFromIndex,
  drawDelay,
  depositMatches,
  decomposeRandomized,
  decompose,
  conventionalFee,
  contextFromIndex,
  checkSend,
  analyze,
  ZEC,
  ZAT_PER_ZEC,
  OutputIndex,
  MEAN_DELAY,
  MAX_RESIDUAL_VALUE,
  MAX_DELAY,
  INDEX_POOLS,
  DENOM_CAP,
  DEFAULT_DATA_URL,
  DEFAULTS,
  ChainContext,
  CALIBRATION,
  BOUNDARY_MODULUS
};

//# debugId=FF64038A739E240964756E2164756E21
//# sourceMappingURL=index.js.map
