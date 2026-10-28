/** Encodes a standard P2PKH/P2SH scriptPubKey as a t-address; other scripts get a stable tag. */
export declare function scriptToAddress(scriptHex: string, network?: 'main' | 'test'): string;
