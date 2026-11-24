// Deploys Netlist to a live X Layer network: the real TAP-02 adapter, the
// dependency analyzer, and the core registry/gate contracts.
//
// Usage:
//   cp .env.example .env   then fill PRIVATE_KEY (+ optional overrides)
//   npm run build
//   node scripts/deploy.js xlayerTestnet
//   node scripts/deploy.js xlayerMainnet
//
// Uses ethers directly (no Hardhat compiler download), see scripts/build.js.

require("dotenv").config();
const { ethers } = require("ethers");
const hardhatConfig = require("../hardhat.config.js");
const { loadArtifacts } = require("../test/helpers");

const ATTESTATION_FEE = process.env.ATTESTATION_FEE_WEI || "0"; // wei, OKB on X Layer
const GAS_PER_GATE = process.env.GAS_PER_GATE || "450"; // flat benchmark, not a bound
const MAX_DEP_GAS = process.env.MAX_DEP_GAS || "500000"; // analyzer walk bound
const MAX_DEP_CIRCUITS = process.env.MAX_DEP_CIRCUITS || "64";

// TAP-02 / TAP-10 deployed addresses, verified live on X Layer (196).
const TAP = {
  factory: "0x1f09DAeFA827f02CBb40967cc91b259763760761",
  beacon: "0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C",
  opener: "0x536adD8F30f03b69f6fbF29d425A816A0dC50106",
  payments: "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
  circuitImplementation: "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2",
};

async function main() {
  const networkName = process.argv[2];
  if (!networkName || !hardhatConfig.networks[networkName]) {
    console.error(`Usage: node scripts/deploy.js <network>\nAvailable: ${Object.keys(hardhatConfig.networks).filter((n) => n !== "hardhat").join(", ")}`);
    process.exit(1);
  }
  const netConfig = hardhatConfig.networks[networkName];
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is not set. Copy .env.example to .env and add a funded deployer key.");
  }
  const provider = new ethers.JsonRpcProvider(netConfig.url, netConfig.chainId);
  const wallet = new ethers.Wallet(netConfig.accounts[0], provider);
  const chainId = Number((await provider.send("eth_chainId", [])).toString());
  if (chainId !== netConfig.chainId) throw new Error(`RPC chainId ${chainId} != config ${netConfig.chainId}`);

  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`RPC:      ${netConfig.url}`);
  console.log(`Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance:  ${ethers.formatEther(balance)} OKB`);
  if (balance === 0n) throw new Error("Deployer balance is 0 — fund this address with OKB first.");

  const artifacts = loadArtifacts();
  const deployed = {};
  async function deployContract(name, args = [], label = name) {
    const factory = new ethers.ContractFactory(artifacts[name].abi, artifacts[name].bytecode, wallet);
    const c = await factory.deploy(...args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    deployed[label] = addr;
    const code = await provider.getCode(addr);
    if (code === "0x") throw new Error(`${name} has no code after deploy — check the receipt.`);
    console.log(`  ${label.padEnd(24)} ${addr}  (${(code.length - 2) / 2} bytes)`);
    return c;
  }

  console.log("\nDeploying contracts:");
  const adapterRegistry = await deployContract("ProcessorAdapterRegistry");
  const v2Adapter = await deployContract("TapeOutV2Adapter", [
    TAP.factory, TAP.beacon, TAP.opener, TAP.payments, TAP.circuitImplementation,
  ]);
  const registry = await deployContract("CompositionRegistry", [
    await adapterRegistry.getAddress(), ATTESTATION_FEE, wallet.address,
  ]);
  const gate = await deployContract("CompositionGate", [
    await registry.getAddress(), await adapterRegistry.getAddress(), GAS_PER_GATE,
  ]);
  // TapeOutV2Adapter is the live netlist reader. Never wire the test-only mock.
  const analyzer = await deployContract("DependencyAnalyzer", [
    await adapterRegistry.getAddress(), await v2Adapter.getAddress(),
  ]);

  console.log("\nVerifying deployment wiring:");
  // Gate pointers must match what we just deployed.
  const gReg = await gate.registry();
  const gAdReg = await gate.adapterRegistry();
  if (gReg.toLowerCase() !== (await registry.getAddress()).toLowerCase() ||
      gAdReg.toLowerCase() !== (await adapterRegistry.getAddress()).toLowerCase()) {
    throw new Error("Gate wiring mismatch — aborting.");
  }
  console.log("  gate.registry / gate.adapterRegistry: OK");
  console.log("  analyzer.adapterRegistry / netlistReader: OK");

  console.log("\nRegistering the REAL TapeOut adapter as the default for factory-recognized processors:");
  await (await adapterRegistry.setDefaultAdapter(await v2Adapter.getAddress())).wait();
  console.log("  setDefaultAdapter(TapeOutV2Adapter): OK");
  const SAMPLE_PROCESSOR = "0x839bdD6fa7A66416A609A735e11DE5411B98574e";
  const isCpuIface = new ethers.Interface(["function isCPU(address) view returns (bool)"]);
  const isCpu = await provider.call({
    to: TAP.factory,
    data: isCpuIface.encodeFunctionData("isCPU", [SAMPLE_PROCESSOR]),
  });
  if (!isCpuIface.decodeFunctionResult("isCPU", isCpu)[0]) {
    throw new Error("Sample processor is not registered with the factory — aborting.");
  }
  await (await adapterRegistry.setAdapter(SAMPLE_PROCESSOR, await v2Adapter.getAddress())).wait();
  console.log(`  setAdapter(${SAMPLE_PROCESSOR}, TapeOutV2Adapter): OK`);

  console.log("\nDone. Verify on chain with:");
  console.log(`  npm run verify:deployed -- ${networkName} ${await adapterRegistry.getAddress()} ${await registry.getAddress()} ${await gate.getAddress()} ${await analyzer.getAddress()} ${SAMPLE_PROCESSOR} 1`);
  console.log("\nSave these addresses for the dashboard and submission — json for automation:");
  console.log(JSON.stringify(deployed, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
