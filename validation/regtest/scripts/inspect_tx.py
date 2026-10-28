#!/usr/bin/env python3
"""Summarise what a Zcash transaction reveals on-chain, using Zebra's getrawtransaction (verbose=1).

Usage: inspect_tx.py <txid> [--raw] [--rpc http://127.0.0.1:18232]
"""
import json, sys, urllib.request

def rpc(url, method, params):
    req = urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                 headers={"content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    if r.get("error"):
        raise SystemExit(r["error"])
    return r["result"]

def trim(o):
    if isinstance(o, dict): return {k: trim(v) for k, v in o.items() if k != "hex"}
    if isinstance(o, list): return [trim(x) for x in o]
    if isinstance(o, str) and len(o) > 72: return f"{o[:32]}...({len(o)//2} bytes)"
    return o

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    url = "http://127.0.0.1:18232"
    if "--rpc" in sys.argv: url = sys.argv[sys.argv.index("--rpc") + 1]; args.remove(url)
    txid = args[0]
    tx = rpc(url, "getrawtransaction", [txid, 1])
    if "--raw" in sys.argv:
        print(json.dumps(trim(tx), indent=1)); return
    s = {
        "txid": txid, "version": tx.get("version"), "size_bytes": tx.get("size"),
        "height": tx.get("height"), "expiryheight": tx.get("expiryheight"), "locktime": tx.get("locktime"),
        "coinbase": any("coinbase" in i for i in tx.get("vin", [])),
        "transparent_inputs": [{"prevout": f'{i["txid"][:16]}..:{i["vout"]}', "value": i.get("value"), "address": i.get("address")}
                               for i in tx.get("vin", []) if "txid" in i],
        "transparent_outputs": [{"value": o["value"], "addresses": o["scriptPubKey"].get("addresses")} for o in tx.get("vout", [])],
        "sapling": {"spends": len(tx.get("vShieldedSpend", [])), "outputs": len(tx.get("vShieldedOutput", [])),
                    "valueBalance": tx.get("valueBalance")},
    }
    for pool in ("orchard", "ironwood"):
        b = tx.get(pool)
        if b is not None:
            acts = b.get("actions", [])
            s[pool] = {"actions": len(acts), "nullifiers_revealed": len(acts) if acts else 0,
                       "valueBalance": b.get("valueBalance"), "flags": b.get("flags"),
                       "anchor": (b.get("anchor") or "")[:16] + "..." if b.get("anchor") else None,
                       "encCiphertext_bytes_per_action": len(acts[0]["encCiphertext"]) // 2 if acts else None,
                       "proof_bytes": len(b.get("proof", "")) // 2 if b.get("proof") else 0}
        else:
            s[pool] = "field absent"
    print(json.dumps(s, indent=1))

main()
