const hre = require("hardhat");

async function main() {
  const initialOwner = process.env.TREASURY_ADDRESS;           // ���L�ҁ����v�󂯎���
  const pgirlsTokenAddress = process.env.PGIRLS_ERC20_ADDRESS; // ERC20��PGirls Token
  const treasuryAddress = process.env.TREASURY_ADDRESS;        // �g�[�N������

  const PGirlsNFT = await hre.ethers.getContractFactory("PGirlsNFT");
  const pgirlsNFT = await PGirlsNFT.deploy(initialOwner, pgirlsTokenAddress, treasuryAddress);

  // ? ethers v6�ł� deployed() �͕s�v
  console.log("? PGirlsNFT deployed to:", pgirlsNFT.target);
}

main().catch((error) => {
  console.error("? Deployment failed:", error);
  process.exitCode = 1;
});
