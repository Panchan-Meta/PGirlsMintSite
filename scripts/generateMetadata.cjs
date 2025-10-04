const fs = require("fs");
const path = require("path");
const { Wallet } = require("ethers");

const ASSETS_DIR = path.join(__dirname, "../public/assets");
const OUTPUT_DIR = path.join(__dirname, "../metadata");
const BASE_URL = "https://mint.rahabpunkaholicgirls.com/assets";
const OWNER_PRIVATE_KEY = (process.env.METADATA_OWNER_PRIVATE_KEY || "").trim();

function resolveOwnerAddressFromPrivateKey() {
  if (!OWNER_PRIVATE_KEY) {
    return "";
  }

  try {
    const normalizedKey = OWNER_PRIVATE_KEY.startsWith("0x")
      ? OWNER_PRIVATE_KEY
      : `0x${OWNER_PRIVATE_KEY}`;
    const wallet = new Wallet(normalizedKey);
    return wallet.address;
  } catch (err) {
    console.warn("[metadata] Failed to derive owner address from private key:", err);
    return "";
  }
}

const DEFAULT_OWNER_ADDRESS = resolveOwnerAddressFromPrivateKey();

if (!DEFAULT_OWNER_ADDRESS) {
  console.error(
    "[metadata] METADATA_OWNER_PRIVATE_KEY is missing or invalid. Unable to derive owner address."
  );
  process.exit(1);
}

let tokenId = 1;

function createMetadata(category, fileName, tokenId) {
  const isVideo = fileName.toLowerCase().endsWith(".mp4");
  const fileUrl = `${BASE_URL}/${category}/${fileName}`;

  return {
    name: `PGirls NFT #${tokenId}`,
    description: `Exclusive PGirls collectible #${tokenId}`,
    image: isVideo ? undefined : fileUrl,
    animation_url: isVideo ? fileUrl : undefined,
    price: "1.5",
    ownerAddress: DEFAULT_OWNER_ADDRESS,
    attributes: [
      {
        trait_type: "Category",
        value: category,
      },
      {
        trait_type: "Rarity",
        value: "Normal",
      },
    ],
  };
}

function generate() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const categories = fs
    .readdirSync(ASSETS_DIR)
    .filter((folder) => fs.statSync(path.join(ASSETS_DIR, folder)).isDirectory());

  categories.forEach((category) => {
    const categoryPath = path.join(ASSETS_DIR, category);
    const outputCategoryDir = path.join(OUTPUT_DIR, category);

    if (!fs.existsSync(outputCategoryDir)) {
      fs.mkdirSync(outputCategoryDir, { recursive: true });
    }

    const mediaFiles = fs
      .readdirSync(categoryPath)
      .filter((file) => /\.(png|jpg|jpeg|mp4)$/i.test(file));

    mediaFiles.forEach((file) => {
      const paddedId = String(tokenId).padStart(3, "0");
      const metadataPath = path.join(outputCategoryDir, `${paddedId}.json`);
      if (fs.existsSync(metadataPath)) {
        console.log(`⏭ [${category}] Metadata #${tokenId} ${metadataPath} (skipped, already exists)`);
        tokenId += 1;
        return;
      }

      const metadata = createMetadata(category, file, tokenId);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log(`✔ [${category}] Metadata #${tokenId} ${metadataPath}`);
      tokenId += 1;
    });
  });
}

generate();
