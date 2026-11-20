// The toolbox registers plugins and needs a live HardhatContext. The deploy
// scripts load this file from plain Node, where the import throws HH5.
try {
  require("@nomicfoundation/hardhat-toolbox");
} catch (e) {
  if (e?.number !== 5) throw e; // HH5 = no context: expected outside Hardhat
}
require("dotenv").config();

// No fallback key: fail loudly when PRIVATE_KEY is absent instead of
// silently signing with a bogus key (see hardhat-contract-dev skill).
const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    // X Layer testnet and mainnet RPC/chainId values below are from public
    // OKX/X Layer documentation at the time this was written. Re-confirm
    // against https://web3.okx.com/xlayer/docs before deploying anything that
    // spends real OKB — endpoints and chain IDs on L2s do change.
    xlayerTestnet: {
      url: process.env.XLAYER_TESTNET_RPC || "https://testrpc.xlayer.tech",
      chainId: 1952, // verified live 2026-11-20 (eth_chainId = 0x7a0)
      accounts: [PRIVATE_KEY],
    },
    xlayerMainnet: {
      url: process.env.XLAYER_MAINNET_RPC || "https://rpc.xlayer.tech",
      chainId: 196,
      accounts: [PRIVATE_KEY],
    },
  },
};
