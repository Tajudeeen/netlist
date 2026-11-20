// Fetches real TapeOut circuits from live X Layer mainnet (chain 196) and
// saves them as a test fixture. Run with: node scripts/fetch-xlayer-fixtures.js
// The fixture is committed so `npm test` needs no network; this script exists
// to make the provenance of the bytes reproducible and re-verifiable.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC = process.env.XLAYER_TESTNET_RPC || "https://rpc.xlayer.tech";
const FACTORY = "0x1f09DAeFA827f02CBb40967cc91b259763760761";
const OUT = path.join(__dirname, "..", "test", "fixtures", "xlayer-circuits.json");

const iface = new ethers.Interface([
  "function cpuCount() view returns (uint256)",
  "function nextId() view returns (uint256)",
  "function cpuAt(uint256) view returns (address)",
  "function circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function netlist(uint256) view returns (bytes)",
  "function ownerOf(uint256) view returns (address)",
]);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const chainId = Number((await provider.send("eth_chainId", [])).toString());
  if (chainId !== 196) throw new Error(`expected X Layer chain 196, got ${chainId}`);
  const block = await provider.getBlockNumber();
  const factory = new ethers.Contract(FACTORY, iface, provider);
  const cpuCount = Number(await factory.cpuCount());
  console.log(`X Layer chain ${chainId}, block ${block}, ${cpuCount} processors`);

  const circuits = [];
  // First three processors, first 3 circuits each. Deterministic, small sample.
  for (let p = 0; p < Math.min(3, cpuCount) && circuits.length < 9; p++) {
    const cpu = await factory.cpuAt(p);
    const proc = new ethers.Contract(cpu, iface, provider);
    let nextId;
    try {
      nextId = Number(await proc.nextId());
    } catch {
      nextId = 5;
    }
    for (let id = 1; id <= Math.min(3, nextId - 1); id++) {
      try {
        const info = await proc.circuitInfo(id);
        const netlistBytes = await proc.netlist(id);
        let owner = null;
        try {
          owner = await proc.ownerOf(id);
        } catch {}
        circuits.push({
          processor: cpu,
          tokenId: id,
          nIn: Number(info.nIn),
          nOut: Number(info.nOut),
          nState: Number(info.nState),
          gateCount: Number(info.gateCount),
          netlist: netlistBytes,
          owner,
        });
        console.log(`  ${cpu} #${id}: ${netlistBytes.length / 2 - 2} bytes, ${info.gateCount} gates`);
      } catch (e) {
        // processor may not expose circuit ids sequentially
      }
    }
  }
  if (circuits.length === 0) throw new Error("no real circuits fetched");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: `live eth_call on X Layer (chain ${chainId})`,
        rpc: RPC,
        block,
        factory,
        fetchedAt: new Date().toISOString(),
        circuits,
      },
      null,
      2
    )
  );
  console.log(`wrote ${circuits.length} circuits -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
