import type { TxRecord, ValueEvent } from './types.js';
export interface OutputInfo {
    value: number;
    addr: string;
    /** The transaction that created this output. */
    txid: string;
}
/** Resolves transparent outpoints to their value and address, from every transaction seen so far. */
export declare class OutputIndex {
    private network;
    private outputs;
    constructor(network?: 'main' | 'test');
    add(r: TxRecord): void;
    get(txid: string, index: number): OutputInfo | undefined;
    address(script: string): string;
}
/**
 * Public amounts crossing pool boundaries in one transaction.
 *
 * - Shielding: transparent → pool, amount = net value entering the shielded pools.
 * - Deshielding: pool → transparent, one event per transparent output (each lands at a visible address).
 * - Pool crossing: the turnstile between two shielded pools reveals the exact amount moved.
 */
export declare function valueEvents(r: TxRecord, outputs: OutputIndex): ValueEvent[];
/** ZIP-317 conventional fee for a transaction's shape. */
export declare function conventionalFee(r: TxRecord): number;
/** The fee actually paid, when every input value is known. */
export declare function paidFee(r: TxRecord, outputs: OutputIndex): number | null;
