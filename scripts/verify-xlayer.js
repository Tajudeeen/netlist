// Block-pinned, multi-RPC verifier for Netlist's X Layer TapeOut adapter.
// Requires two independent RPC endpoints:
// XLAYER_RPC_URLS=https://rpc-a,https://rpc-b npm run verify:xlayer
const { ethers } = require("ethers");
const { decodeTapNetlist } = require("../test/decoder");

const RPC_URLS = (process.env.XLAYER_RPC_URLS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ADDR = {
  factory: "0x1f09DAeFA827f02CBb40967cc91b259763760761",
  beacon: "0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C",
  circuitImplementation: "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2",
  opener: "0x536adD8F30f03b69f6fbF29d425A816A0dC50106",
  payments: "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
};
const FACTORY_IFACE = new ethers.Interface([
  "function isSealed() view returns (bool)",
  "function cpuCount() view returns (uint256)",
  "function cpuAt(uint256) view returns (address)",
]);
const CIRCUIT_IFACE = new ethers.Interface([
  "function circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function netlist(uint256) view returns (bytes)",
]);
const BEACON_IFACE = new ethers.Interface(["function implementation() view returns (address)"]);

async function readSnapshot(provider, blockTag) {
  const block = await provider.getBlock(blockTag);
  const blockHex = ethers.toQuantity(blockTag);
  const code = {};
  for (const [name, address] of Object.entries(ADDR)) {
    code[name] = await provider.send("eth_getCode", [address, blockHex]);
    if (code[name] === "0x") throw new Error(`${name} has no code at pinned block ${blockTag}`);
  }

  const factory = new ethers.Contract(ADDR.factory, FACTORY_IFACE, provider);
  const beacon = new ethers.Contract(ADDR.beacon, BEACON_IFACE, provider);
  const [sealed, cpuCount, implementation] = await Promise.all([
    factory.isSealed({ blockTag }),
    factory.cpuCount({ blockTag }),
    beacon.implementation({ blockTag }),
  ]);

  const circuits = [];
  for (let p = 0; p < Math.min(3, Number(cpuCount)) && circuits.length < 9; p++) {
    const cpu = await factory.cpuAt(p, { blockTag });
    const proc = new ethers.Contract(cpu, CIRCUIT_IFACE, provider);
    for (let id = 1; id <= 3 && circuits.length < 9; id++) {
      try {
        const [info, nl] = await Promise.all([
          proc.circuitInfo(id, { blockTag }),
          proc.netlist(id, { blockTag }),
        ]);
        const decoded = decodeTapNetlist(nl, Number(info.nIn), Number(info.nOut));
        circuits.push({
          processor: cpu.toLowerCase(),
          id,
          netlistHash: ethers.keccak256(nl),
          nIn: Number(info.nIn),
          nOut: Number(info.nOut),
          nState: Number(info.nState),
          reportedGateCount: Number(info.gateCount),
          localGateCount: decoded.gateCount,
          localDepth: decoded.depth,
          hasRef: decoded.hasRef,
          refCount: decoded.refCount,
        });
      } catch (error) {
        // A missing circuit id is expected. Malformed data must not be skipped.
        if (/no circuit/i.test(error.message || "")) continue;
        throw error;
      }
    }
  }
  return {
    blockNumber: blockTag,
    blockHash: block.hash,
    codeHashes: Object.fromEntries(Object.entries(code).map(([k, v]) => [k, ethers.keccak256(v)])),
    sealed,
    cpuCount: Number(cpuCount),
    implementation: implementation.toLowerCase(),
    circuits,
  };
}

async function main() {
  if (RPC_URLS.length < 2) {
    throw new Error("set XLAYER_RPC_URLS to at least two independent RPC endpoints; one endpoint is not quorum evidence");
  }
  const providers = RPC_URLS.map((url) => new ethers.JsonRpcProvider(url));
  const chainIds = await Promise.all(providers.map(async (p) => Number((await p.send("eth_chainId", [])).toString())));
  if (chainIds.some((id) => id !== 196)) throw new Error(`all endpoints must report chain 196, got ${chainIds.join(",")}`);

  const heights = await Promise.all(providers.map((p) => p.getBlockNumber()));
  const blockTag = Math.min(...heights);
  const blocks = await Promise.all(providers.map((p) => p.getBlock(blockTag)));
  if (blocks.some((b) => !b) || blocks.some((b) => b.hash !== blocks[0].hash)) {
    throw new Error(`RPCs disagree on canonical block ${blockTag}`);
  }

  const snapshots = await Promise.all(providers.map((p) => readSnapshot(p, blockTag)));
  const canonical = JSON.stringify(snapshots[0]);
  for (let i = 1; i < snapshots.length; i++) {
    if (JSON.stringify(snapshots[i]) !== canonical) {
      throw new Error(`independent RPC snapshot disagreement at block ${blockTag}`);
    }
  }

  const s = snapshots[0];
  console.log(`X Layer 196, pinned block ${s.blockNumber} (${s.blockHash})`);
  console.log(`Independent RPCs agreeing: ${providers.length}`);
  console.log(`Factory processors: ${s.cpuCount}`);
  console.log(`Factory sealed: ${s.sealed}`);
  console.log(`Beacon implementation: ${s.implementation}`);
  console.log(`Implementation matches pinned address: ${s.implementation === ADDR.circuitImplementation.toLowerCase()}`);
  console.log(`Circuits inspected: ${s.circuits.length}`);

  for (const c of s.circuits) {
    if (!c.hasRef && c.localGateCount !== c.reportedGateCount) {
      throw new Error(`local gate count mismatch for ${c.processor} #${c.id}`);
    }
    console.log(
      `  ${c.processor} #${c.id}: localGates=${c.localGateCount}, ` +
      `reportedExpandedGates=${c.reportedGateCount}, localDepth=${c.localDepth}, ` +
      `refs=${c.refCount}, hash=${c.netlistHash}`
    );
  }

  console.log("\nBoundaries:");
  console.log("  - The reported gateCount is expanded by TAP-02; localGateCount is only this netlist's own gates.");
  console.log("  - localDepth excludes referenced circuit internals. Use verify:refs for recursive closure checks.");
  console.log("  - Matching RPC reads prove agreement at this block, not correctness of the deployed X Layer implementation.");
  console.log("  - Netlist CompositionGate deployment/enforcement is a separate claim and is not proven by this script.");
  console.log("\nPASS: pinned multi-RPC reads and structural decoding agree.");
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message || e);
  process.exit(1);
});
