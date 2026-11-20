// Post-deployment proof: confirms the deployed Netlist contracts are real,
// wired correctly, and actually read a real X Layer circuit through the
// TapeOutV2Adapter — including a dependency-aware gate check.
//
// Usage:
//   node scripts/verify-deployed.js <network> <adapterRegistry> <registry> <gate> <analyzer> [processor] [tokenId]
const { ethers } = require("ethers");
const hardhatConfig = require("../hardhat.config.js");
const { loadArtifacts } = require("../test/helpers");

const [networkName, adapterRegistryAddr, registryAddr, gateAddr, analyzerAddr,
  processorArg, tokenArg] = process.argv.slice(2);

async function main() {
  if (!networkName || !adapterRegistryAddr || !registryAddr || !gateAddr || !analyzerAddr) {
    console.error("Usage: node scripts/verify-deployed.js <network> <adapterRegistry> <registry> <gate> <analyzer> [processor] [tokenId]");
    process.exit(1);
  }
  const net = hardhatConfig.networks[networkName];
  if (!net) throw new Error(`Unknown network ${networkName}`);
  const provider = new ethers.JsonRpcProvider(net.url, net.chainId);
  const chainId = Number((await provider.send("eth_chainId", [])).toString());
  const block = await provider.getBlockNumber();
  const artifacts = loadArtifacts();
  const processor = processorArg || "0x839bdD6fa7A66416A609A735e11DE5411B98574e";
  const tokenId = BigInt(tokenArg || "1");

  console.log("=".repeat(64));
  console.log("NETLIST — deployed-contract verification");
  console.log("=".repeat(64));
  console.log(`chainId ${chainId} · block ${block} · RPC ${net.url}`);

  let failures = 0;
  const check = (ok, label, detail = "") => {
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? " — " + detail : ""}`);
    if (!ok) failures++;
  };

  for (const [label, addr] of Object.entries({
    adapterRegistry: adapterRegistryAddr, registry: registryAddr,
    gate: gateAddr, analyzer: analyzerAddr,
  })) {
    const code = await provider.getCode(addr);
    check(code !== "0x", `${label} has code`, `${addr} (${(code.length - 2) / 2} bytes)`);
  }

  const gate = new ethers.Contract(gateAddr, artifacts.CompositionGate.abi, provider);
  check((await gate.registry()).toLowerCase() === registryAddr.toLowerCase(), "gate.registry wired");
  check((await gate.adapterRegistry()).toLowerCase() === adapterRegistryAddr.toLowerCase(), "gate.adapterRegistry wired");

  const analyzer = new ethers.Contract(analyzerAddr, artifacts.DependencyAnalyzer.abi, provider);
  check((await analyzer.adapterRegistry()).toLowerCase() === adapterRegistryAddr.toLowerCase(), "analyzer.adapterRegistry wired");

  const adapterRegistry = new ethers.Contract(adapterRegistryAddr, artifacts.ProcessorAdapterRegistry.abi, provider);
  const adapterAddr = await adapterRegistry.adapterFor(processor);
  check(adapterAddr !== ethers.ZeroAddress, "real adapter configured", adapterAddr);
  const adapter = new ethers.Contract(adapterAddr, artifacts.TapeOutV2Adapter.abi, provider);

  // Live reads through the deployed adapter.
  const nHash = await adapter.netlistHash(processor, tokenId);
  const gates = await adapter.gateCount(processor, tokenId);
  const depth = await adapter.circuitDepth(processor, tokenId);
  const owner = await adapter.ownerOf(processor, tokenId);
  const sealed = await adapter.isSealed(processor);
  const container = await adapter.containerOf(processor, tokenId);
  console.log(`\n  Live circuit ${processor} #${tokenId}:`);
  console.log(`    netlistHash ${nHash}`);
  console.log(`    gates ${gates} · depth ${depth} · owner ${owner}`);
  console.log(`    sealed ${sealed} · container ${container}`);
  check(gates > 0n, "adapter reads real gate count");
  check(nHash !== ethers.ZeroHash, "adapter derives real netlist hash");

  const dep = await analyzer.analyze(processor, tokenId, 32, 64);
  console.log(`    REF closure: ${dep.totalCircuits} circuits, depth ${dep.maxDepth}, complete ${dep.complete}`);

  const policy = Array.from(await gate.defaultPolicy());
  const report = await gate.statusReport(processor, tokenId);
  console.log("\n  Gate statusReport:");
  console.log(`    gateCount ${report.gateCount} · estimatedGas ${report.estimatedGas}`);
  console.log(`    publisher ${report.hasPublisherAttestation} · stale ${report.publisherAttestationStale}`);
  console.log(`    sealed ${report.processorSealed} · containerLive ${report.containerLive}`);
  check(Number(report.gateCount) === Number(gates), "gate and adapter agree on gate count");

  const [allowed, reason] = await gate.checkCallWithDependencies(
    processor, tokenId, policy, analyzerAddr, 32, 64
  );
  console.log(`\n  checkCallWithDependencies -> allowed=${allowed} reason="${reason}"`);
  // An unattested circuit must be denied; a passing result would mean policy
  // is not actually enforced.
  check(allowed === false && reason === "no-attestation", "policy denies unattested circuit", reason);

  console.log("\n" + "=".repeat(64));
  if (failures) {
    console.log(`FAILED: ${failures} check(s)`);
    process.exit(1);
  }
  console.log("PASS: deployed contracts are live, wired, and enforce policy on real circuits.");
}

main().catch((e) => { console.error("VERIFY FAILED:", e.message || e); process.exit(1); });
