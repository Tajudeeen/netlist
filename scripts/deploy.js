// Deploys CompositionRegistry and CompositionGate to a live network.
//
// Usage:
//   node scripts/deploy.js xlayerTestnet
//   node scripts/deploy.js xlayerMainnet
//
// Reads RPC URL / chain ID from hardhat.config.js's networks entry and the
// deployer key from PRIVATE_KEY in .env (see .env.example). Uses ethers
// directly rather than `npx hardhat run`, since this sandbox's network
// policy blocks Hardhat's own compiler downloader (see scripts/build.js);
// outside this sandbox, `npx hardhat run scripts/deploy.js --network
// xlayerTestnet` after a normal `npx hardhat compile` works too, this script
// just doesn't require it.

require("dotenv").config();
const { ethers } = require("ethers");
const hardhatConfig = require("../hardhat.config.js");
const { loadArtifacts } = require("../test/helpers");

const ATTESTATION_FEE = process.env.ATTESTATION_FEE_WEI || "0"; // in wei (OKB on X Layer)
const GAS_PER_GATE = process.env.GAS_PER_GATE || "450"; // see CompositionGate.sol notes, flat estimate only

async function main() {
  const networkName = process.argv[2];
  if (!networkName || !hardhatConfig.networks[networkName]) {
    console.error(
      `Usage: node scripts/deploy.js <network>\nAvailable: ${Object.keys(
        hardhatConfig.networks
      )
        .filter((n) => n !== "hardhat")
        .join(", ")}`
    );
    process.exit(1);
  }

  const netConfig = hardhatConfig.networks[networkName];
  const provider = new ethers.JsonRpcProvider(netConfig.url, netConfig.chainId);
  const wallet = new ethers.Wallet(netConfig.accounts[0], provider);

  console.log(`Network:  ${networkName} (chainId ${netConfig.chainId})`);
  console.log(`RPC:      ${netConfig.url}`);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance:  ${ethers.formatEther(balance)} (native gas token, OKB on X Layer)`);
  if (balance === 0n) {
    console.warn(
      "WARNING: deployer balance is 0. Fund this address before deploying to a real network."
    );
  }

  const artifacts = loadArtifacts();

  function deployContract(name, args) {
    const factory = new ethers.ContractFactory(
      artifacts[name].abi,
      artifacts[name].bytecode,
      wallet
    );
    return factory.deploy(...args);
  }

  console.log("\nDeploying ProcessorAdapterRegistry...");
  const adapterRegistry = await deployContract("ProcessorAdapterRegistry", []);
  await adapterRegistry.waitForDeployment();
  console.log(`ProcessorAdapterRegistry: ${await adapterRegistry.getAddress()}`);

  console.log("\nDeploying DirectProcessorAdapter...");
  console.log("(the provisional, unverified-ABI adapter, see ITapeOutProcessor.sol's");
  console.log("notes before pointing this at a real processor address)");
  const directAdapter = await deployContract("DirectProcessorAdapter", []);
  await directAdapter.waitForDeployment();
  console.log(`DirectProcessorAdapter: ${await directAdapter.getAddress()}`);

  console.log("\nDeploying CompositionRegistry...");
  const registry = await deployContract("CompositionRegistry", [
    await adapterRegistry.getAddress(),
    ATTESTATION_FEE,
    wallet.address,
  ]);
  await registry.waitForDeployment();
  console.log(`CompositionRegistry: ${await registry.getAddress()}`);

  console.log("\nDeploying CompositionGate...");
  const gate = await deployContract("CompositionGate", [
    await registry.getAddress(),
    await adapterRegistry.getAddress(),
    GAS_PER_GATE,
  ]);
  await gate.waitForDeployment();
  console.log(`CompositionGate: ${await gate.getAddress()}`);

  console.log("\nDone. None of this is wired to a real processor yet: call");
  console.log("adapterRegistry.setAdapter(<realProcessorAddress>, <adapterAddress>)");
  console.log("once you've confirmed what adapter actually matches that processor's");
  console.log("real ABI, see scripts/verify.js. Until then, every read for an");
  console.log("unconfigured processor reverts with NoAdapterConfigured, by design.");
  console.log("\nSave these addresses, you'll need them for the dashboard and for the");
  console.log("accelerator submission (processor contract address + circuit ID is");
  console.log("asked for separately, these four are Netlist's own contracts).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
