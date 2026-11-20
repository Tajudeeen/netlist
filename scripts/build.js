// Compiles every contract under contracts/ using the `solc` npm package
// directly (pure JS, installed from the npm registry) instead of Hardhat's
// built-in compile task.
//
// Why: Hardhat's compiler downloader fetches the solc binary/compiler list
// from binaries.soliditylang.org, which this build environment's network
// policy does not allow. The `solc` npm package ships the compiler itself,
// so no further network access is needed at compile time.
//
// Outside this sandbox, on a normal machine with unrestricted network
// access, `npx hardhat compile` works fine with the hardhat.config.js
// already in this repo and produces the same ABI/bytecode. This script is
// kept as a documented fallback, not a replacement, for that case.

const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const BUILD_DIR = path.join(__dirname, "..", "build");

function findSolFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findSolFiles(full));
    } else if (entry.name.endsWith(".sol")) {
      results.push(full);
    }
  }
  return results;
}

function toSourceName(absPath) {
  return "contracts/" + path.relative(CONTRACTS_DIR, absPath).split(path.sep).join("/");
}

function importCallback(importPath) {
  // Resolve relative imports (./interfaces/..., ../interfaces/...) against
  // the contracts directory. This project has no external npm Solidity
  // dependencies (no OpenZeppelin, etc.), so only relative/local paths need
  // resolving here.
  const candidates = [
    path.join(CONTRACTS_DIR, importPath.replace(/^contracts\//, "")),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { contents: fs.readFileSync(c, "utf8") };
    }
  }
  return { error: `File not found: ${importPath}` };
}

function main() {
  const solFiles = findSolFiles(CONTRACTS_DIR);
  const sources = {};

  for (const file of solFiles) {
    sources[toSourceName(file)] = { content: fs.readFileSync(file, "utf8") };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: importCallback })
  );

  let hadError = false;
  if (output.errors) {
    for (const err of output.errors) {
      const stream = err.severity === "error" ? console.error : console.warn;
      stream(err.formattedMessage || err.message);
      if (err.severity === "error") hadError = true;
    }
  }

  if (hadError) {
    process.exit(1);
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const combined = {};
  for (const sourceName of Object.keys(output.contracts || {})) {
    for (const contractName of Object.keys(output.contracts[sourceName])) {
      const c = output.contracts[sourceName][contractName];
      combined[contractName] = {
        sourceName,
        abi: c.abi,
        bytecode: "0x" + c.evm.bytecode.object,
        deployedBytecode: "0x" + c.evm.deployedBytecode.object,
      };
    }
  }

  fs.writeFileSync(
    path.join(BUILD_DIR, "contracts.json"),
    JSON.stringify(combined, null, 2)
  );

  console.log(
    `Compiled ${Object.keys(combined).length} contracts -> build/contracts.json`
  );
  for (const name of Object.keys(combined)) {
    console.log(`  - ${name}`);
  }
}

main();
