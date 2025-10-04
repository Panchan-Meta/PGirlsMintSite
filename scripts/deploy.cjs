const hre = require("hardhat");

async function main() {
  const initialOwner = process.env.TREASURY_ADDRESS;
  const pgirlsTokenAddress = process.env.PGIRLS_ERC20_ADDRESS;
  const treasuryAddress = process.env.TREASURY_ADDRESS;

  if (!process.env.PRIVATE_KEY && !process.env.PGIRLSCHAIN_PRIVATE_KEY) {
    throw new Error(
      "Missing PRIVATE_KEY. Please export PRIVATE_KEY (0x...) or PGIRLSCHAIN_PRIVATE_KEY before deploying."
    );
  }

  if (!initialOwner || !pgirlsTokenAddress || !treasuryAddress) {
    throw new Error(
      "Missing deployment parameters. Ensure TREASURY_ADDRESS and PGIRLS_ERC20_ADDRESS are set in the environment."
    );
  }

  const PGirlsNFT = await hre.ethers.getContractFactory("PGirlsNFT");
  const pgirlsNFT = await PGirlsNFT.deploy(initialOwner, pgirlsTokenAddress, treasuryAddress);
  await pgirlsNFT.waitForDeployment();

  console.log("✅ PGirlsNFT deployed to:", pgirlsNFT.target);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
