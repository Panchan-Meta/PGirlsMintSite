require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox"); // これだけでOK

const PGIRLSCHAIN_RPC_URL = process.env.PGIRLSCHAIN_RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PGIRLSCHAIN_PRIVATE_KEY;

module.exports = {
  defaultNetwork: "pgirls",
  networks: {
    pgirls: {
      url: PGIRLSCHAIN_RPC_URL,
      chainId: 20250511,
      gas: 3000000,
      gasPrice: 30_000_000_000,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "london",
          viaIR: true,
        },
      },
    ],
  },
};
