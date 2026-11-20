// Verifies recursive REF closure against live X Layer circuits.
// npm run verify:refs
const { ethers } = require("ethers");
const { resolveClosure } = require("./ref-closure");

// Public RPCs reset connections occasionally; a bounded retry makes the
// verifier robust without hiding a real mismatch.
async function withRetry(label, fn, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|429|503/.test(String(e && e.message))) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${last && last.message}`);
}

const RPC = process.env.XLAYER_MAINNET_RPC || "https://rpc.xlayer.tech";
const IFACE = new ethers.Interface([
  "function circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function netlist(uint256) view returns (bytes)",
]);
const TARGETS = [
  // A real REF circuit on X Layer (verified 2026-11-20) and a non-REF one.
  { processor: "0x0565EA48CA41Ae559d8d491dbb0a9ec945DB551b", id: 1, kind: "REF" },
  { processor: "0x839bdD6fa7A66416A609A735e11DE5411B98574e", id: 1, kind: "plain" },
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const chainId = Number((await provider.send("eth_chainId", [])).toString());
  if (chainId !== 196) throw new Error(`expected X Layer chain 196, got ${chainId}`);
  const block = await provider.getBlockNumber();
  console.log(`REF-closure verification — X Layer 196, block ${block}`);
  let failures = 0;

  for (const t of TARGETS) {
    const proc = new ethers.Contract(t.processor, IFACE, provider);
    const info = await withRetry("circuitInfo", () => proc.circuitInfo(t.id));
    const closure = await withRetry("closure", () =>
      resolveClosure(provider, IFACE, t.processor, t.id)
    );
    const hasRef = closure.circuits[0].refs > 0;
    console.log(`\n${t.processor} #${t.id} (${t.kind}):`);
    for (const c of closure.circuits) {
      console.log(
        `  ${c.processor} #${c.id}: gates=${c.decodedGates} ` +
          `reported=${c.reportedGates} refs=${c.refs} depth=${c.localDepth}`
      );
    }
    console.log(
      `  closure: ${closure.circuits.length} circuits, ` +
        `${closure.totalGates} total gates, missing=${closure.missing}`
    );

    if (hasRef) {
      // TAP-02 §6: circuitInfo.gateCount includes REF sub-circuits.
      // Top-level decoded=0; the reported count must equal the closure total
      // (allow for shared sub-circuits counted once by the resolver).
      const ok = closure.missing === 0 && closure.totalGates === Number(info.gateCount);
      console.log(
        `  REF check: circuitInfo=${info.gateCount} vs closure=${closure.totalGates} ` +
          `-> ${ok ? "MATCH" : "MISMATCH"}`
      );
      if (!ok) failures++;
    } else {
      const ok = closure.totalGates === Number(info.gateCount);
      console.log(`  plain check: ${ok ? "MATCH" : "MISMATCH"}`);
      if (!ok) failures++;
    }
  }
  if (failures > 0) {
    console.log(`\nFAILED: ${failures} closure check(s) disagree.`);
    process.exit(1);
  }
  console.log("\nPASS: recursive REF closures agree with on-chain circuitInfo.");
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message || e);
  process.exit(1);
});
