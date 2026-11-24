// Recursive REF-closure resolver for TAP-02 netlists.
//
// TAP-02 §2: a REF record is `0x02 cpu(20) id(u64) nIns(u8) nOuts(u8) ins(u24×nIns)`
// = 31 + 3*nIns bytes. TAP-02 §3: a REF target must already exist, so the
// closure is acyclic. circuitInfo(id).gateCount counts gates through REF.
//
// This module walks that closure, reading netlist/circuitInfo via eth_call,
// and returns a total gate count + max depth that can be compared against
// the processor's own circuitInfo().gateCount. It is used by
// scripts/verify-ref.js as an independent, on-chain-verifiable cross-check.
//
// NOTE: this is an OFF-CHAIN resolver (a verifier/integration tool). Doing
// this inside a Solidity adapter would require an unbounded number of
// external calls and is deliberately not claimed on-chain. See README.
const { decodeTapNetlist } = require("../test/decoder");

function parseRefs(hex) {
  const b = Buffer.from(hex.replace(/^0x/, ""), "hex");
  const refs = [];
  let pos = 0;
  let signals = 2; // caller passes nIn separately; only used for validation
  while (pos < b.length) {
    const op = b[pos++];
    if (op === 0x00) {
      pos += 6;
    } else if (op === 0x01) {
      pos += 3;
    } else if (op === 0x02) {
      const cpu = "0x" + b.subarray(pos, pos + 20).toString("hex");
      pos += 20;
      const id = Number(b.readBigUInt64BE(pos));
      pos += 8;
      const nIns = b[pos++];
      const nOuts = b[pos++];
      pos += nIns * 3;
      refs.push({ cpu, id, nIns, nOuts });
    } else {
      throw new Error(`bad opcode 0x${op.toString(16)}`);
    }
  }
  return refs;
}

/**
 * Walk the REF closure of circuit (processor, tokenId).
 * @param provider ethers.JsonRpcProvider
 * @param iface ethers.Interface with circuitInfo/netlist
 * @returns { totalGates, maxDepth, circuits: [{processor,id,gates,depth,refs}], missing }
 */
async function resolveClosure(provider, iface, processor, tokenId, opts = {}) {
  const maxCircuits = opts.maxCircuits || 64;
  const seen = new Set();
  const circuits = [];
  let missing = 0;

  async function visit(cpu, id) {
    const key = cpu.toLowerCase() + ":" + id;
    if (seen.has(key)) return; // DAG: already counted (TAP-02 §3 acyclic)
    if (seen.size >= maxCircuits) throw new Error(`closure exceeded ${maxCircuits} circuits`);
    seen.add(key);

    const proc = new (require("ethers").Contract)(cpu, iface, provider);
    const info = await proc.circuitInfo(id);
    const nl = await proc.netlist(id);
    const nIn = Number(info.nIn);
    const decoded = decodeTapNetlist(nl, nIn, Number(info.nOut));
    const refs = parseRefs(nl);
    circuits.push({
      processor: cpu,
      id,
      nIn,
      nOut: Number(info.nOut),
      nState: Number(info.nState),
      decodedGates: decoded.gateCount,
      reportedGates: Number(info.gateCount),
      localDepth: decoded.depth,
      refs: refs.length,
    });
    for (const r of refs) {
      try {
        await visit(r.cpu, r.id);
      } catch (e) {
        missing++;
      }
    }
  }

  await visit(processor, tokenId);
  const totalGates = circuits.reduce((s, c) => s + c.decodedGates, 0);
  const maxDepth = circuits.reduce((m, c) => Math.max(m, c.localDepth), 0);
  return { totalGates, maxDepth, circuits, missing };
}

module.exports = { parseRefs, resolveClosure };
