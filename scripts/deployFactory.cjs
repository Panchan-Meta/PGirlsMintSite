// scripts/deployFactory.cjs
/* eslint-disable no-console */
const hre = require("hardhat");

function parseGasPrice(input, ethers) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (s.endsWith("gwei")) return ethers.parseUnits(s.replace("gwei", "").trim(), "gwei");
  if (s.endsWith("wei"))  return BigInt(s.replace("wei", "").trim());
  // 数値だけなら gwei とみなす
  if (/^\d+(\.\d+)?$/.test(s)) return ethers.parseUnits(s, "gwei");
  throw new Error(`Invalid GAS_PRICE: ${input}`);
}

async function main() {
  const { ethers, network } = hre;
  const [signer] = await ethers.getSigners();
  const fee = await ethers.provider.getFeeData();

  // 送信オプション（EIP-1559 非対応→legacy、または FORCE_LEGACY=1 で強制 legacy）
  const overrides = {};
  const wantLegacy =
    String(process.env.FORCE_LEGACY || process.env.LEGACY || "") === "1" ||
    fee.maxFeePerGas == null || fee.maxPriorityFeePerGas == null;

  const envGas = parseGasPrice(process.env.GAS_PRICE, ethers);

  if (wantLegacy) {
    overrides.type = 0;
    overrides.gasPrice = envGas ?? fee.gasPrice ?? ethers.parseUnits("1", "gwei");
  } else if (envGas) {
    // EIP-1559 対応ノードでも type:0 は許容されるが、ここではそのまま legacy で投げる
    overrides.type = 0;
    overrides.gasPrice = envGas;
  }

  console.log("network:", network.name);
  console.log("chainId:", await ethers.provider.getNetwork().then(n => n.chainId.toString()));
  console.log("deployer:", await signer.getAddress());
  const bal = await ethers.provider.getBalance(await signer.getAddress());
  console.log("balance(wei):", bal.toString());
  if (overrides.type === 0) {
    console.log("txType: LEGACY");
    console.log("gasPrice:", overrides.gasPrice.toString());
  } else {
    console.log("txType: EIP-1559");
  }

  const Factory = await ethers.getContractFactory("Create2Deployer");
  const contract = await Factory.deploy(overrides); // constructor 引数なし
  const tx = contract.deploymentTransaction();
  console.log("deploy tx:", tx.hash);

  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("CREATE2_DEPLOYER=", addr);

  const rcpt = await tx.wait();
  console.log("gasUsed:", rcpt.gasUsed?.toString?.() || rcpt.gasUsed);
  console.log("status:", rcpt.status);

  // コード検証（保険）
  const code = await ethers.provider.getCode(addr);
  if (!code || code === "0x") throw new Error("Deployment appears to have failed (no code at address)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
