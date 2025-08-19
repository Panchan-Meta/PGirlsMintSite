const fs = require("fs");
const path = require("path");

const ASSETS_DIR = path.join(__dirname, "../public/assets");
const OUTPUT_DIR = path.join(__dirname, "../metadata");
const BASE_URL = "https://mint.rahabpunkaholicgirls.com/assets";

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
    attributes: [
      {
        trait_type: "Category",
        value: category // ? ← サブディレクトリ名を反映
      },
      {
        trait_type: "Rarity",
        value: "Normal"
      }
    ]
  };
}

function generate() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const categories = fs.readdirSync(ASSETS_DIR).filter(folder =>
    fs.statSync(path.join(ASSETS_DIR, folder)).isDirectory()
  );

  categories.forEach(category => {
    const categoryPath = path.join(ASSETS_DIR, category);
    const outputCategoryDir = path.join(OUTPUT_DIR, category);

    if (!fs.existsSync(outputCategoryDir)) {
      fs.mkdirSync(outputCategoryDir, { recursive: true });
    }

    const mediaFiles = fs.readdirSync(categoryPath).filter(file =>
      /\.(png|jpg|jpeg|mp4)$/i.test(file)
    );

    mediaFiles.forEach(file => {
      const metadata = createMetadata(category, file, tokenId);
      const paddedId = String(tokenId).padStart(3, "0");
      const metadataPath = path.join(outputCategoryDir, `${paddedId}.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log(`? [${category}] Metadata #${tokenId} → ${metadataPath}`);
      tokenId++;
    });
  });
}

generate();
