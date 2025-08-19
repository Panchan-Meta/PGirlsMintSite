const hre = require("hardhat");

async function main() {
  const initialOwner = process.env.TREASURY_ADDRESS;           // 所有者＝収益受け取り者
  const pgirlsTokenAddress = process.env.PGIRLS_ERC20_ADDRESS; // ERC20のPGirls Token
  const treasuryAddress = process.env.TREASURY_ADDRESS;        // トークン受取先

  const PGirlsNFT = await hre.ethers.getContractFactory("PGirlsNFT");
  const pgirlsNFT = await PGirlsNFT.deploy(initialOwner, pgirlsTokenAddress, treasuryAddress);

  // ? ethers v6では deployed() は不要
  console.log("? PGirlsNFT deployed to:", pgirlsNFT.target);
}

main().catch((error) => {
  console.error("? Deployment failed:", error);
  process.exitCode = 1;
});
