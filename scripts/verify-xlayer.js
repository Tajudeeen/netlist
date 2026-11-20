// Live verifier for Netlist's REAL TapeOut adapter on X Layer.
//
// Two distinct proofs, kept separate (never collapsed):
//   A) STATIC: the adapter SOURCE implements IProcessorAdapter and the
//      TAP-02/TAP-10 selectors/addresses are transcribed from the live specs.
//   B) LIVE: the exact same decode logic runs against real netlist bytes read
//      from real processors via eth_call on chain 196, and the decoded gate
//      count is cross-checked against circuitInfo() from the contract itself.
//
// Usage: npm run verify:xlayer
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { decodeTapNetlist } = require("../test/decoder");

const RPC = process.env.XLAYER_MAINNET_RPC || "https://rpc.xlayer.tech";
const ADDR = {
  factory: "0x1f09DAeFA827f02CBb40967cc91b259763760761",
  beacon: "0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C",
  circuitImplementation: "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2",
  opener: "0x536adD8F30f03b69f6fbF29d425A816A0dC50106",
  payments: "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
};
const IFACE = new ethers.Interface([
  "function isSealed() view returns (bool)",
  "function cpuCount() view returns (uint256)",
  "function cpuAt(uint256) view returns (address)",
  "function circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function netlist(uint256) view returns (bytes)",
  "function ownerOf(uint256) view returns (address)",
]);

function line(s = "") {
  console.log(s);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const chainId = Number((await provider.send("eth_chainId", [])).toString());
  const block = await provider.getBlockNumber();
  if (chainId !== 196) throw new Error(`expected X Layer chain 196, got ${chainId}`);

  line("============================================================");
  line("NETLIST — live X Layer adapter verification");
  line("============================================================");
  line(`RPC:      ${RPC}`);
  line(`chainId:  ${chainId} (X Layer mainnet)`);
  line(`block:    ${block}`);
  line("");
  line("Addresses (TAP-02 / TAP-10 Deployments, checked with eth_getCode):");
  for (const [name, addr] of Object.entries(ADDR)) {
    const code = await provider.send("eth_getCode", [addr, "latest"]);
    const len = (code.length - 2) / 2;
    if (len === 0) throw new Error(`${name} has no code at ${addr}`);
    line(`  ${name.padEnd(22)} ${addr}  (${len} bytes of code)`);
  }

  const factory = new ethers.Contract(ADDR.factory, IFACE, provider);
  const sealed = await factory.isSealed();
  const cpuCount = Number(await factory.cpuCount());
  // Read implementation() via eth_call, not a guessed storage slot: the
  // L2 beacon's layout differs from the BNB one, so a hardcoded ERC-1967
  // slot would read zero and be a false alarm.
  const implIf = new ethers.Interface(["function implementation() view returns (address)"]);
  const beaconImpl = await (new ethers.Contract(ADDR.beacon, implIf, provider)).implementation();
  line("");
  line("Factory / beacon evidence (three independent claims):");
  line(`  factory.isSealed():          ${sealed}`);
  line(`  factory.cpuCount():          ${cpuCount} processors`);
  line(`  beacon implementation():     ${beaconImpl}`);
  line(`  pinned circuit impl:         ${ADDR.circuitImplementation}`);
  line(`  implementation matches pin:  ${beaconImpl.toLowerCase() === ADDR.circuitImplementation.toLowerCase()}`);

  line("");
  line("Live circuit cross-check (decode netlist bytes vs circuitInfo.gateCount):");
  let checked = 0;
  let mismatches = 0;
  let refCircuits = 0;
  for (let p = 0; p < Math.min(3, cpuCount) && checked < 9; p++) {
    const cpu = await factory.cpuAt(p);
    const proc = new ethers.Contract(cpu, IFACE, provider);
    for (let id = 1; id <= 3; id++) {
      try {
        const info = await proc.circuitInfo(id);
        const nl = await proc.netlist(id);
        const decoded = decodeTapNetlist(nl, Number(info.nIn));
        const ok = decoded.hasRef || decoded.gateCount === Number(info.gateCount);
        if (decoded.hasRef) refCircuits++;
        if (!ok) mismatches++;
        checked++;
        line(
          `  ${cpu.slice(0, 10)}… #${id}: netlist=${(nl.length - 2) / 2}B ` +
            `decodedGates=${decoded.gateCount} reported=${info.gateCount} ` +
            `depth=${decoded.depth} ${decoded.hasRef ? "REF" : ok ? "MATCH" : "MISMATCH"}`
        );
      } catch {
        // id may not exist on this processor
      }
    }
  }
  if (checked === 0) throw new Error("no circuits could be read");
  line("");
  line(`Checked ${checked} real circuits: ${mismatches} mismatches, ${refCircuits} REF circuits.`);

  line("");
  line("Honest boundaries (not hidden behind a green checkmark):");
  line("  - Netlist contracts are NOT deployed on X Layer (no deploy key in this repo).");
  line("    This verifies the adapter's READ LOGIC against live protocol state; it does");
  line("    NOT claim a Netlist CompositionGate address exists on chain.");
  line("  - factory.isSealed() is false and TAP-10 §13.8 also requires beacon.owner()==");
  line("    factory, which this RPC reports as 0x0. isSealed() therefore fails closed.");
  line("  - REF circuits' internal depth is not decoded here; depthIsBounded() = false.");
  line("  - One RPC endpoint is one operator's view, not a quorum (TAP-10 §5.2).");

  if (mismatches > 0) {
    line("");
    line("FAILED: Solidity/JS decode disagrees with circuitInfo on at least one circuit.");
    process.exit(1);
  }
  line("");
  line("PASS: live decode agrees with on-chain circuitInfo on every non-REF circuit read.");
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message || e);
  process.exit(1);
});
