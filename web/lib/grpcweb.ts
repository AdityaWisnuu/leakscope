// Minimal gRPC-web client for lightwalletd's CompactTxStreamer, enough to stream compact
// blocks into the local scanner. Requests carry only block heights, never keys or txids.

const SERVICE = 'cash.z.wallet.sdk.rpc.CompactTxStreamer';

function varint(n: number): number[] {
  const out: number[] = [];
  let v = BigInt(n);
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return out;
}

const blockId = (height: number) => [0x08, ...varint(height)]; // BlockID { height = 1 }
function blockRange(start: number, end: number): Uint8Array {
  const s = blockId(start), e = blockId(end);
  return new Uint8Array([0x0a, s.length, ...s, 0x12, e.length, ...e]);
}

function frame(msg: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + msg.length);
  new DataView(out.buffer).setUint32(1, msg.length);
  out.set(msg, 5);
  return out;
}

async function call(base: string, method: string, msg: Uint8Array, signal?: AbortSignal) {
  const r = await fetch(`${base.replace(/\/$/, '')}/${SERVICE}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1', accept: 'application/grpc-web+proto' },
    body: frame(msg) as BodyInit,
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!r.ok || !r.body) throw new Error(`${method}: HTTP ${r.status}`);
  return r;
}

/** Yields each data frame's payload as it arrives; throws on a non-zero grpc-status trailer. */
async function* frames(r: Response): AsyncGenerator<Uint8Array> {
  const reader = r.body!.getReader();
  let buf = new Uint8Array(0);
  for (;;) {
    while (buf.length >= 5) {
      const len = new DataView(buf.buffer, buf.byteOffset).getUint32(1);
      if (buf.length < 5 + len) break;
      const flag = buf[0];
      const payload = buf.slice(5, 5 + len);
      buf = buf.slice(5 + len);
      if (flag & 0x80) {
        const trailers = new TextDecoder().decode(payload);
        const status = /grpc-status:\s*(\d+)/i.exec(trailers)?.[1];
        if (status && status !== '0') {
          throw new Error(decodeURIComponent(/grpc-message:\s*(.*)/i.exec(trailers)?.[1]?.trim() ?? `grpc-status ${status}`));
        }
      } else yield payload;
    }
    const { value, done } = await reader.read();
    if (done) return;
    const next = new Uint8Array(buf.length + value.length);
    next.set(buf);
    next.set(value, buf.length);
    buf = next;
  }
}

/** Height of the server's chain tip (GetLatestBlock → BlockID.height). */
export async function latestHeight(base: string, signal?: AbortSignal): Promise<number> {
  const r = await call(base, 'GetLatestBlock', new Uint8Array(0), signal);
  for await (const msg of frames(r)) {
    // field 1, varint
    if (msg[0] !== 0x08) break;
    let h = 0, mul = 1;
    for (let i = 1; i < msg.length; i++) {
      h += (msg[i] & 0x7f) * mul;
      if (!(msg[i] & 0x80)) return h;
      mul *= 128;
    }
  }
  throw new Error('GetLatestBlock: unexpected response');
}

/** Streams protobuf-encoded CompactBlocks for [start, end], in ascending order. */
export async function* compactBlocks(base: string, start: number, end: number, signal?: AbortSignal) {
  const r = await call(base, 'GetBlockRange', blockRange(start, end), signal);
  yield* frames(r);
}
