// Independent, block-pinned REF closure verifier for X Layer.
// Requires at least two independently operated RPC URLs:
// XLAYER_RPC_URLS=https://rpc-a,https://rpc-b npm run verify:refs
const { ethers } = require("ethers");
const { resolveClosure } = require("./ref-closure");

const RPC_URLS = (process.env.XLAYER_RPC_URLS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const IFACE = new ethers.Interface([
  "function circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function netlist(uint256) view returns (bytes)",
]);
const TARGETS = [
  { processor: "0x0565EA48CA41Ae559d8d491dbb0a9ec945DB551b", id: 1 },
  { processor: "0x839bdD6fa7A66416A609A735e11DE5411B98574e", id: 1 },
];

async function main() {
  if (RPC_URLS.length < 2) {
    throw new Error("set XLAYER_RPC_URLS to at least two independent RPC endpoints; single-RPC output is not quorum evidence");
  }

  const providers = RPC_URLS.map((url) => new ethers.JsonRpcProvider(url));
  const chainIds = await Promise.all(providers.map(async (p) => Number((await p.send("eth_chainId", [])).toString())));
  if (chainIds.some((id) => id !== 196)) throw new Error(`all RPCs must report X Layer chain 196, got ${chainIds.join(",")}`);

  const heights = await Promise.all(providers.map((p) => p.getBlockNumber()));
  const blockTag = Math.min(...heights);
  const blocks = await Promise.all(providers.map((p) => p.getBlock(blockTag)));
  if (blocks.some((b) => !b) || blocks.some((b) => b.hash !== blocks[0].hash)) {
    throw new Error(`RPC disagreement at pinned block ${blockTag}`);
  }
  const blockHash = blocks[0].hash;
  console.log(`Pinned X Layer block ${blockTag} (${blockHash}) across ${providers.length} RPC endpoints`);

  let failures = 0;
  for (const target of TARGETS) {
    const reports = await Promise.all(providers.map((provider) =>
      resolveClosure(provider, IFACE, target.processor, target.id, {
        blockTag, maxDepth: 32, maxCircuits: 128, maxInstances: 512,
      })
    ));

    const canonical = reports[0];
    for (let i = 1; i < reports.length; i++) {
      const other = reports[i];
      const same = other.uniqueCircuitCount === canonical.uniqueCircuitCount &&
        other.expandedInstanceCount === canonical.expandedInstanceCount &&
        other.expandedGateCount === canonical.expandedGateCount &&
        other.expandedStateCount === canonical.expandedStateCount &&
        other.maxRefDepth === canonical.maxRefDepth;
      if (!same) {
        failures++;
        console.error(`RPC result disagreement for ${target.processor} #${target.id}`);
      }
    }

    console.log(`\n${target.processor} #${target.id}`);
    console.log(`  unique circuits:       ${canonical.uniqueCircuitCount}`);
    console.log(`  expanded instances:    ${canonical.expandedInstanceCount}`);
    console.log(`  expanded gate count:   ${canonical.expandedGateCount}`);
    console.log(`  expanded state count:  ${canonical.expandedStateCount}`);
    console.log(`  maximum REF depth:     ${canonical.maxRefDepth}`);
    for (const circuit of canonical.circuits) {
      console.log(`  ${circuit.processor} #${circuit.id}: local gates=${circuit.localGateCount}, local latches=${circuit.localStateCount}, REF records=${circuit.refs.length}`);
    }
  }

  if (failures) throw new Error(`${failures} independent RPC comparison(s) failed`);
  console.log("\nPASS: recursive REF closure and expanded gate/state counts agree across independent RPCs at one pinned block.");
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message || e);
  process.exit(1);
});
