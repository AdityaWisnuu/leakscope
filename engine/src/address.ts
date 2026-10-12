import { sha256 } from '@noble/hashes/sha256';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}

function base58check(payload: Uint8Array): string {
  const check = sha256(sha256(payload)).slice(0, 4);
  const all = new Uint8Array(payload.length + 4);
  all.set(payload);
  all.set(check, payload.length);
  return base58(all);
}

const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

const PREFIX = {
  main: { p2pkh: [0x1c, 0xb8], p2sh: [0x1c, 0xbd] },
  test: { p2pkh: [0x1d, 0x25], p2sh: [0x1c, 0xba] },
} as const;

/** Encodes a standard P2PKH/P2SH scriptPubKey as a t-address; other scripts get a stable tag. */
export function scriptToAddress(scriptHex: string, network: 'main' | 'test' = 'main'): string {
  const p = PREFIX[network];
  let prefix: readonly number[] | undefined;
  let hash: string | undefined;
  if (/^76a914[0-9a-f]{40}88ac$/.test(scriptHex)) {
    prefix = p.p2pkh;
    hash = scriptHex.slice(6, 46);
  } else if (/^a914[0-9a-f]{40}87$/.test(scriptHex)) {
    prefix = p.p2sh;
    hash = scriptHex.slice(4, 44);
  }
  if (!prefix || !hash) return `script:${scriptHex.slice(0, 16)}`;
  return base58check(Uint8Array.from([...prefix, ...hexToBytes(hash)]));
}
