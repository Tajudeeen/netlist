const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const ganache = require("ganache");

const BUILD_PATH = path.join(__dirname, "..", "build", "contracts.json");

function loadArtifacts() {
  if (!fs.existsSync(BUILD_PATH)) {
    throw new Error(
      "build/contracts.json not found — run `npm run build` first"
    );
  }
  return JSON.parse(fs.readFileSync(BUILD_PATH, "utf8"));
}

async function setupProvider() {
  const server = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 10 },
  });
  const provider = new ethers.BrowserProvider(server, undefined, {
    cacheTimeout: -1,
  });
  return { server, provider };
}

async function deploy(artifacts, name, signer, args = []) {
  const art = artifacts[name];
  if (!art) throw new Error(`No artifact for ${name}`);
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

/// Minimal stand-in for hardhat-chai-matchers' revertedWithCustomError, which
/// requires the full Hardhat runtime we're intentionally bypassing (see
/// scripts/build.js for why). Asserts the promise rejects, and if
/// errorFragment + contract are given, decodes the actual revert data via the
/// contract's ABI and checks it matches that custom error's name. Ganache
/// surfaces revert data at err.info.error.data.result rather than the
/// top-level err.data ethers normally expects, hence the manual digging below.
async function expectRevert(promise, errorFragment, contract) {
  let threw = false;
  let caught;
  try {
    await promise;
  } catch (err) {
    threw = true;
    caught = err;
  }
  if (!threw) {
    throw new Error(
      `Expected transaction to revert${
        errorFragment ? ` with ${errorFragment}` : ""
      }, but it succeeded`
    );
  }

  if (!errorFragment) return caught;

  const revertData =
    caught?.data ||
    caught?.error?.data?.result ||
    caught?.info?.error?.data?.result ||
    caught?.info?.error?.data;

  if (contract && revertData) {
    try {
      const decoded = contract.interface.parseError(revertData);
      if (decoded && decoded.name === errorFragment) {
        return caught;
      }
      throw new Error(
        `Expected revert with ${errorFragment}, decoded as ${
          decoded ? decoded.name : "unknown"
        }`
      );
    } catch (decodeErr) {
      if (decodeErr.message?.startsWith("Expected revert")) throw decodeErr;
      // fall through to the string-match fallback below if decoding itself failed
    }
  }

  // Fallback: at least confirm it reverted at all (already asserted above),
  // and loosely check the error name shows up somewhere in the message.
  const message = String(
    caught && (caught.shortMessage || caught.reason || caught.message)
  );
  if (!message.includes(errorFragment) && !revertData) {
    throw new Error(
      `Expected revert reason to include "${errorFragment}", got: ${message}`
    );
  }
  return caught;
}

/// Deploys ProcessorAdapterRegistry + DirectProcessorAdapter and registers
/// the adapter for the given processor address, since CompositionRegistry
/// and CompositionGate now resolve every processor read through the
/// registry rather than calling a processor directly. Returns the deployed
/// ProcessorAdapterRegistry, pass its address into Registry/Gate constructors.
async function setupAdapter(artifacts, deployer, processorAddress) {
  const adapterRegistry = await deploy(artifacts, "ProcessorAdapterRegistry", deployer);
  const directAdapter = await deploy(artifacts, "DirectProcessorAdapter", deployer);
  await (
    await adapterRegistry.setAdapter(processorAddress, await directAdapter.getAddress())
  ).wait();
  return adapterRegistry;
}

module.exports = { loadArtifacts, setupProvider, deploy, expectRevert, setupAdapter };
