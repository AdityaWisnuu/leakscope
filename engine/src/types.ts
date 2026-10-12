/** One transaction as the indexer records it: only what any observer can see. */
export interface TxRecord {
  h: number;
  time: number;
  txid: string;
  /** Position in the block; 0 is the coinbase. */
  idx: number;
  /** Fee in zatoshis when the server could compute it (no transparent inputs). */
  fee: number | null;
  /** Spent transparent outpoints: [prevTxid, index]. */
  vin: [string, number][];
  /** Created transparent outputs: [value in zatoshis, scriptPubKey hex]. */
  vout: [number, string][];
  /** Shielded component counts: Sapling spends/outputs, Orchard actions, Ironwood actions. */
  n: { ss: number; so: number; orc: number; iw: number };
  /** Per-pool value balances (positive = value leaving the pool). Present where it can leak. */
  vb?: { sapling: number; orchard: number; ironwood: number };
  expiry?: number;
  version?: string;
}

export type Pool = 'transparent' | 'sapling' | 'orchard' | 'ironwood';
export type ShieldedPool = Exclude<Pool, 'transparent'>;

/**
 * A publicly visible amount crossing a pool boundary. These are the raw material for
 * every amount-correlation attack: what goes into the shielded set at one moment and
 * what comes out at another.
 */
export interface ValueEvent {
  txid: string;
  h: number;
  time: number;
  /** 'in' = value entering a shielded pool; 'out' = value leaving one. */
  dir: 'in' | 'out';
  from: Pool;
  to: Pool;
  amount: number;
  /** Transparent addresses on the transparent side, when known. */
  addrs: string[];
  /** Fee paid by this event's transaction, when every input value is known. */
  fee?: number | null;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  /** Transactions involved, earliest first. */
  txids: string[];
  /** Short human headline. */
  title: string;
  /** Why this is a leak, in plain words. */
  detail: string;
  /** How many indistinguishable alternatives an observer has (1 = fully linked). */
  anonymitySet?: number;
  amount?: number;
  /** Height of the latest transaction involved: when the leak became observable. */
  h?: number;
  /** Transparent addresses that carry the link, when the leak runs through one. */
  addresses?: string[];
}

export type FindingKind =
  | 'utxo-roundtrip'
  | 'address-reuse'
  | 'amount-link'
  | 'pool-crossing'
  | 'fee-fingerprint'
  | 'quick-roundtrip';
