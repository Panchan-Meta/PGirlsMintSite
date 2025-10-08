/* eslint-disable */
// scripts/generateMetadata.cjs

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const dotenv = require("dotenv");

const PROJECT_ROOT = path.join(__dirname, "..");

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  try {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof process.env[key] === "undefined") {
        process.env[key] = value;
      }
    }
  } catch (err) {
    console.warn(`[warn] Failed to load ${envPath}:`, err?.message || err);
  }
}

const ASSETS_DIR = path.join(__dirname, "../public/assets");
const OUTPUT_DIR = path.join(__dirname, "../metadata");
const BASE_URL = "https://mint.rahabpunkaholicgirls.com/assets";
const ARTIFACT_PATH = path.join(
  PROJECT_ROOT,
  "artifacts/contracts/PGirlsNFT.sol/PGirlsNFT.json"
);
loadEnv(path.join(PROJECT_ROOT, ".env.local"));
loadEnv(path.join(PROJECT_ROOT, ".env"));

// ===== 基本設定 =====
const PUBLIC_DIR      = path.join(PROJECT_ROOT, "public", "assets");
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const METADATA_BASE_URL = String(
  process.env.METADATA_BASE_URL || `${PUBLIC_BASE_URL}/metadata`
).replace(/\/+$/, "");
const PAD             = Number(process.env.PAD || 3);

// 画面表示用の既定
const SYMBOL          = process.env.NFT_SYMBOL || "SNFT";
const NAME_PREFIX     = process.env.NFT_NAME_PREFIX || "SingleNFT #";

const DEFAULT_PRICE_PFP   = String(process.env.DEFAULT_PRICE_PFP ?? "20");
const DEFAULT_PRICE_MUSIC = String(process.env.DEFAULT_PRICE_MUSIC ?? "8");
const isPfpCollection     = (name) => /pfp/i.test(name);
const defaultPriceFor     = (name) => isPfpCollection(name) ? DEFAULT_PRICE_PFP : DEFAULT_PRICE_MUSIC;
const defaultMintStatus   = "BeforeList";

// 環境変数（CREATE2 ファクトリ等）: 別名も許容
const FACTORY_RAW = process.env.CREATE2_DEPLOYER
  || process.env.FACTORY
  || process.env.NEXT_PUBLIC_FACTORY;

const OWNER_ENV_KEYS = [
  "NFT_OWNER",
  "NEXT_PUBLIC_NFT_OWNER",
  "TREASURY_ADDRESS",
  "OWNER",
  "OWNER_ADDRESS",
];

const ownerEnvKey = OWNER_ENV_KEYS.find((key) => typeof process.env[key] === "string" && process.env[key].trim() !== "");
const OWNER_RAW = ownerEnvKey ? process.env[ownerEnvKey] : undefined;

const TREASURY_ENV_KEYS = [
  "TREASURY_ADDRESS",
  "NEXT_PUBLIC_TREASURY",
  "NEXT_PUBLIC_NFT_OWNER",
  "OWNER",
  "OWNER_ADDRESS",
];

const treasuryEnvKey = TREASURY_ENV_KEYS.find((key) => typeof process.env[key] === "string" && process.env[key].trim() !== "");
const TREASURY_RAW = treasuryEnvKey ? process.env[treasuryEnvKey] : OWNER_RAW;

const TOKEN_ENV_KEYS = [
  "PGIRLS_ERC20_ADDRESS",
  "NEXT_PUBLIC_PGIRLS_ERC20_ADDRESS",
  "NEXT_PUBLIC_PGIRLS",
];

const tokenEnvKey = TOKEN_ENV_KEYS.find((key) => typeof process.env[key] === "string" && process.env[key].trim() !== "");
const PGIRLS_TOKEN_RAW = tokenEnvKey ? process.env[tokenEnvKey] : undefined;

const RPC_URL     = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const REDEPLOY_IF_NOT_ONCHAIN = String(process.env.REDEPLOY_IF_NOT_ONCHAIN ?? "false").toLowerCase() === "true";
const DRY_RUN                 = String(process.env.DRY_RUN ?? "false").toLowerCase() === "true";

// ===== バリデーション & 正規化 =====
function toChecksumAddressOrThrow(label, value) {
  if (!value || typeof value !== "string") {
    throw new Error(`.env の ${label} が未設定です`);
  }
  try {
    return ethers.getAddress(value);
  } catch {
    throw new Error(`.env の ${label} が不正なアドレスです（値: ${value}）`);
  }
}

if (!FACTORY_RAW) throw new Error(".env の CREATE2_DEPLOYER/FACTORY/NEXT_PUBLIC_FACTORY が未設定です");
if (!OWNER_RAW)   throw new Error(".env の NFT_OWNER/NEXT_PUBLIC_NFT_OWNER/TREASURY_ADDRESS/OWNER/OWNER_ADDRESS のいずれかを設定してください");
if (!PGIRLS_TOKEN_RAW) throw new Error(".env の PGIRLS_ERC20_ADDRESS/NEXT_PUBLIC_PGIRLS_ERC20_ADDRESS/NEXT_PUBLIC_PGIRLS が未設定です");
if (!TREASURY_RAW) throw new Error(".env の TREASURY_ADDRESS/NEXT_PUBLIC_TREASURY/NEXT_PUBLIC_NFT_OWNER/OWNER/OWNER_ADDRESS が未設定です");
if (!RPC_URL)     throw new Error(".env の RPC_URL が未設定です");

const FACTORY = toChecksumAddressOrThrow("CREATE2_DEPLOYER/FACTORY/NEXT_PUBLIC_FACTORY", FACTORY_RAW);
const OWNER   = toChecksumAddressOrThrow("NFT_OWNER/NEXT_PUBLIC_NFT_OWNER/TREASURY_ADDRESS/OWNER/OWNER_ADDRESS", OWNER_RAW);
const TREASURY = toChecksumAddressOrThrow("TREASURY_ADDRESS/NEXT_PUBLIC_TREASURY/NEXT_PUBLIC_NFT_OWNER/OWNER/OWNER_ADDRESS", TREASURY_RAW);
const PGIRLS_TOKEN = toChecksumAddressOrThrow("PGIRLS_ERC20_ADDRESS/NEXT_PUBLIC_PGIRLS_ERC20_ADDRESS/NEXT_PUBLIC_PGIRLS", PGIRLS_TOKEN_RAW);

let collArtifact;
try {
  collArtifact = require(ARTIFACT_PATH);
} catch (err) {
  throw new Error(`Hardhat artifact が見つかりませんでした。先に "npx hardhat compile" を実行してください (path: ${ARTIFACT_PATH}).`);
}

// ===== 出力先 =====
const SCRIPTS_META_DIR = path.join(__dirname, "metadata");
if (!DRY_RUN) fs.mkdirSync(SCRIPTS_META_DIR, { recursive: true });
const SITE_META_DIR    = path.join(PROJECT_ROOT, "metadata");
if (!DRY_RUN) fs.mkdirSync(SITE_META_DIR, { recursive: true });

// ===== util =====
const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const bytecode = collArtifact.bytecode;

const padLeft = (n, w) => (String(n).length >= w ? String(n) : "0".repeat(w - String(n).length) + n);

// /assets/<category>/<rel> を URL セーフに
const encPath = (rel) => rel.split("/").map(encodeURIComponent).join("/");

const parseList = (s) => (s || "").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);

const splitExts = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(splitExts);
  return String(value)
    .split(/[,;\s]+/)
    .map((ext) => ext.trim())
    .filter(Boolean);
};

const normalizeExt = (ext) => ext.replace(/^\./, "").toLowerCase();

const parseExtList = (value, fallback) => {
  const parsed = splitExts(value).map(normalizeExt).filter(Boolean);
  if (parsed.length) return Array.from(new Set(parsed));
  return Array.from(new Set(splitExts(fallback).map(normalizeExt).filter(Boolean)));
};

const IMAGE_EXTS = (() => {
  const list = parseExtList(process.env.IMAGE_EXTS || process.env.IMAGE_EXT, "png");
  return list.length ? list : ["png"];
})();

const VIDEO_EXTS = (() => {
  const list = parseExtList(process.env.VIDEO_EXTS || process.env.VIDEO_EXT, "mp4");
  return list.length ? list : ["mp4"];
})();

const mediaExtsFromEnv = parseExtList(process.env.MEDIA_EXTS, []);
const MEDIA_EXTS = mediaExtsFromEnv.length
  ? mediaExtsFromEnv
  : Array.from(new Set([...IMAGE_EXTS, ...VIDEO_EXTS]));

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);
const VIDEO_EXT_SET = new Set(VIDEO_EXTS);
const MEDIA_EXT_SET = new Set(MEDIA_EXTS);
const includeCollections = parseList(process.env.INCLUDE_COLLECTIONS);
const excludeCollections = new Set(parseList(process.env.EXCLUDE_COLLECTIONS));

function listCollections() {
  if (!fs.existsSync(PUBLIC_DIR)) throw new Error(`public/assets が見つかりません: ${PUBLIC_DIR}`);
  const dirs = fs.readdirSync(PUBLIC_DIR, { withFileTypes:true })
    .filter(d=>d.isDirectory())
    .map(d=>d.name)
    .filter(name => !excludeCollections.has(name));
  return includeCollections.length ? dirs.filter(d=>includeCollections.includes(d)) : dirs;
}

function listMediaRecursive(dir, baseDir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes:true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listMediaRecursive(abs, baseDir));
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).replace(/^\./, "").toLowerCase();
      if (!MEDIA_EXT_SET.has(ext)) continue;
      const rel = path.relative(baseDir, abs).replace(/\\/g,"/");
      out.push(rel);
    }
  }
  out.sort((a,b)=>a.localeCompare(b, undefined, { numeric:true, sensitivity:"base" }));
  return out;
}

const classifyAsset = (relPath) => {
  const ext = path.extname(relPath).replace(/^\./, "").toLowerCase();
  const isVideo = VIDEO_EXT_SET.has(ext);
  const isImage = !isVideo && (IMAGE_EXT_SET.size === 0 || IMAGE_EXT_SET.has(ext));
  return { ext, isVideo, isImage };
};

const readJsonSafe = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function listJsonRecursive(dir, baseDir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes:true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listJsonRecursive(abs, baseDir));
    } else if (ent.isFile() && /\.json$/i.test(ent.name)) {
      const rel = path.relative(baseDir, abs).replace(/\\/g, "/");
      out.push(rel);
    }
  }
  out.sort((a,b)=>a.localeCompare(b, undefined, { numeric:true, sensitivity:"base" }));
  return out;
}

const normaliseTokenId = (meta, jsonRel) => {
  const candidates = [
    meta?.tokenId,
    meta?.index,
    meta?.number,
    meta?.number_padded,
    path.basename(jsonRel || "", ".json"),
  ];
  for (const cand of candidates) {
    if (typeof cand === "number" && Number.isFinite(cand) && cand > 0) return Number(cand);
    if (typeof cand === "string" && cand.trim()) {
      const parsed = Number(cand.replace(/^0+/, "")) || Number(cand);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 0;
};

const baseDefaultsFor = (collectionName) => ({
  price: defaultPriceFor(collectionName),
  soldout: false,
});

// コレクション単位の salt
function collectionSalt(collectionName) {
  return ethers.keccak256(ethers.toUtf8Bytes(`collection-${collectionName}`));
}

// ===== 1コレクション処理 =====
async function genOneCollection(provider, collectionName, allRows) {
  const collectionDir = path.join(PUBLIC_DIR, collectionName);
  const mediaFiles = listMediaRecursive(collectionDir, collectionDir);
  if (!mediaFiles.length) { console.warn(`[warn] メディアファイルが見つかりません (skip): ${collectionName}`); return; }

  const encodedCat = encodeURIComponent(collectionName);
  const collectionMetaDir = path.join(SITE_META_DIR, collectionName);
  if (!DRY_RUN) fs.mkdirSync(collectionMetaDir, { recursive: true });

  // --- コレクション1本の予測アドレス ---
  const salt = collectionSalt(collectionName);
  const nameForCollection = `${NAME_PREFIX}${collectionName}`; // 例: "SingleNFT #PFPs_1st_Collection"

  // (address initialOwner, address pgirlsToken, address treasury)
  const encodedArgs = abiCoder.encode(["address","address","address"], [OWNER, PGIRLS_TOKEN, TREASURY]);
  const initCode     = bytecode + encodedArgs.slice(2);
  const initCodeHash = ethers.keccak256(initCode);
  const predictedCollection = ethers.getCreate2Address(FACTORY, salt, initCodeHash);

  // deploy.sh を安全に生成
  const deploySh = path.join(SCRIPTS_META_DIR, `deploy_${encodedCat}.sh`);
  if (!DRY_RUN) {
    const header = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      '# --- .env を自動読込（存在すれば / Linux & macOS 両対応） ---',
      'if [ -f ".env.local" ]; then set -a; . ./.env.local; set +a; fi',
      'if [ -f ".env" ]; then set -a; . ./.env; set +a; fi',
      '',
      ': "${CREATE2_DEPLOYER:?Missing CREATE2_DEPLOYER}"',
      ': "${RPC_URL:?Missing RPC_URL}"',
      ': "${PRIVATE_KEY:?Missing PRIVATE_KEY}"',
      ': "${PGIRLS_ERC20_ADDRESS:=${NEXT_PUBLIC_PGIRLS_ERC20_ADDRESS:-${NEXT_PUBLIC_PGIRLS:-}}}"',
      ': "${TREASURY_ADDRESS:=${NEXT_PUBLIC_TREASURY:-${NEXT_PUBLIC_NFT_OWNER:-${OWNER:-${OWNER_ADDRESS:-}}}}}"',
      'OWNER_ADDRESS=${NFT_OWNER:-${NEXT_PUBLIC_NFT_OWNER:-${TREASURY_ADDRESS:-${OWNER:-${OWNER_ADDRESS:-}}}}}',
      ': "${OWNER_ADDRESS:?Missing owner address (NFT_OWNER/NEXT_PUBLIC_NFT_OWNER/TREASURY_ADDRESS/OWNER/OWNER_ADDRESS)}"',
      `EXPECTED_OWNER="${OWNER}"`,
      'EXPECTED_OWNER_LC=$(printf "%s" "$EXPECTED_OWNER" | tr "[:upper:]" "[:lower:]")',
      'OWNER_ADDRESS_LC=$(printf "%s" "$OWNER_ADDRESS" | tr "[:upper:]" "[:lower:]")',
      'if [ "$OWNER_ADDRESS_LC" != "$EXPECTED_OWNER_LC" ]; then',
      '  echo "[warn] OWNER_ADDRESS と metadata owner が一致しません: $OWNER_ADDRESS vs $EXPECTED_OWNER" >&2',
      'fi',
      '',
      '# EIP-1559 非対応ノード向けの既定値',
      'CAST_FLAGS=${CAST_FLAGS:---legacy}',
      'GAS_PRICE_OPT=""',
      '[ -n "${GAS_PRICE:-}" ] && GAS_PRICE_OPT="--gas-price ${GAS_PRICE}"',
      '',
      `echo "Deploy ${collectionName.replace(/"/g, '\\"')} (predicted ${predictedCollection})"`,
      ''
    ];
    fs.writeFileSync(deploySh, header.join("\n"), "utf8");
  }

  /** @type {Array<Record<string,string>>} */
  const rows = [];
  console.log(`\n=== ${collectionName} (${mediaFiles.length} assets) ===`);

  const existingMetaDir = path.join(SITE_META_DIR, collectionName);
  const existingJsonRels = listJsonRecursive(existingMetaDir, existingMetaDir);
  /** @type {Map<string,{data:Record<string,any>,jsonRel:string,abs:string}>} */
  const existingMetaByAsset = new Map();
  let highestTokenId = 0;
  for (const rel of existingJsonRels) {
    const abs = path.join(existingMetaDir, rel);
    const data = readJsonSafe(abs);
    if (!data) continue;
    const tokenId = normaliseTokenId(data, rel);
    if (tokenId > highestTokenId) highestTokenId = tokenId;
    const metaRecord = { data, jsonRel: rel, abs, tokenId };
    const imgUrl = typeof data.image === "string" ? data.image : undefined;
    if (imgUrl) {
      existingMetaByAsset.set(imgUrl, metaRecord);
    }
    const animationUrl = typeof data.animation_url === "string" ? data.animation_url : undefined;
    if (animationUrl) {
      existingMetaByAsset.set(animationUrl, metaRecord);
    }
  }

  let tokenCounter = highestTokenId;

  for (const assetRel of mediaFiles) {
    const subdir    = path.dirname(assetRel).replace(/^\.$/, "");
    const assetUrl  = `${PUBLIC_BASE_URL}/assets/${encodedCat}/${encPath(assetRel)}`;
    const { isVideo: isVideoAsset } = classifyAsset(assetRel);
    const existing = existingMetaByAsset.get(assetUrl);

    if (existing) {
      const defaults = baseDefaultsFor(collectionName);
      const finalMeta = existing.data || {};
      const tokenId = normaliseTokenId(finalMeta, existing.jsonRel)
        || (typeof existing.tokenId === "number" && existing.tokenId > 0 ? existing.tokenId : 0)
        || existingMetaByAsset.size;
      if (tokenId > tokenCounter) tokenCounter = tokenId;
      const baseNum = padLeft(tokenId, PAD);
      const jsonRel = existing.jsonRel;
      const tokenURI = finalMeta.tokenURI
        || `${METADATA_BASE_URL}/${encodedCat}/${encPath(jsonRel)}`;
      const finalPrice =
        typeof finalMeta.price === "undefined" || finalMeta.price === null || finalMeta.price === ""
          ? defaults.price
          : String(finalMeta.price);
      const finalSoldout = typeof finalMeta.soldout === "boolean"
        ? finalMeta.soldout
        : typeof finalMeta.soldout === "string"
          ? finalMeta.soldout.toLowerCase() === "true"
          : Boolean(
              typeof finalMeta.soldout === "number"
                ? finalMeta.soldout
                : finalMeta.soldout ?? defaults.soldout
            );
      const finalImage = typeof finalMeta.image === "string" ? finalMeta.image : "";
      const finalAnimation = typeof finalMeta.animation_url === "string" ? finalMeta.animation_url : "";
      const rowImage = finalImage || (!finalAnimation && !isVideoAsset ? assetUrl : "");
      const rowAnimation = finalAnimation || (isVideoAsset ? assetUrl : "");
      const row = {
        collection: collectionName,
        index: String(tokenId),
        number_padded: baseNum,
        name: finalMeta.name || `${NAME_PREFIX}${tokenId}`,
        tokenURI,
        image: rowImage,
        animation_url: rowAnimation,
        contractAddress: finalMeta.contractAddress || predictedCollection,
        fileName: finalMeta.fileName || jsonRel,
        price: String(finalPrice),
        soldout: finalSoldout,
        tokenId: String(tokenId),
      };
      rows.push(row);
      console.log(`#${baseNum} (existing): ${predictedCollection}   ${assetRel}`);
      continue;
    }

    tokenCounter += 1;
    const baseNum  = padLeft(tokenCounter, PAD);   // 001, 002, ...
    const name     = `${NAME_PREFIX}${tokenCounter}`;
    const jsonRel  = (subdir ? subdir + "/" : "") + `${baseNum}.json`;
    const tokenURI = `${METADATA_BASE_URL}/${encodedCat}/${encPath(jsonRel)}`;

    const jsonAbs = path.join(collectionMetaDir, jsonRel);
    const jsonDir = path.dirname(jsonAbs);
    if (!DRY_RUN) fs.mkdirSync(jsonDir, { recursive: true });

    if (!DRY_RUN) {
      const defaults = baseDefaultsFor(collectionName);
      const meta = {
        name,
        description: name,
        external_url: PUBLIC_BASE_URL,
        attributes: [],
        tokenId: tokenCounter,
        contractAddress: predictedCollection,
        price: defaults.price,
        soldout: defaults.soldout,
        mintStatus: defaultMintStatus,
        ownerAddress: OWNER,
        owner: OWNER,
        walletAddress: OWNER,
        category: collectionName,
        fileName: jsonRel,
        tokenURI,
      };
      if (isVideoAsset) {
        meta.animation_url = assetUrl;
      } else {
        meta.image = assetUrl;
      }
      if (!meta.image && !meta.animation_url) {
        meta.image = assetUrl;
      }
      fs.writeFileSync(jsonAbs, JSON.stringify(meta, null, 2), "utf8");
    }

    const defaults = baseDefaultsFor(collectionName);
    const priceForRow = defaults.price;
    const row = {
      collection: collectionName,
      index: String(tokenCounter),
      number_padded: baseNum,
      name,
      tokenURI,
      image: isVideoAsset ? "" : assetUrl,
      animation_url: isVideoAsset ? assetUrl : "",
      contractAddress: predictedCollection,
      fileName: jsonRel,
      price: String(priceForRow),
      soldout: defaults.soldout,
      tokenId: String(tokenCounter),
    };
    rows.push(row);

    console.log(`#${baseNum}: ${predictedCollection}   ${assetRel}`);
  }

  // コレクション本体が未デプロイなら deploy 行を1回だけ追加
  if (!DRY_RUN) {
    let shouldDeploy = true;
    try {
      const code = await provider.getCode(predictedCollection);
      shouldDeploy = !(code && code !== "0x");
    } catch (e) {
      console.warn(`[warn] getCode failed for ${predictedCollection}:`, e?.message || e);
    }
    if (shouldDeploy) {
      const lines = [
        `echo "Deploying collection ${collectionName} -> ${predictedCollection}"`,
        `cast send $CREATE2_DEPLOYER 'deploy(bytes32,bytes)' ${collectionSalt(collectionName)} ${bytecode + abiCoder.encode(["address","address","address"], [OWNER, PGIRLS_TOKEN, TREASURY]).slice(2)} --rpc-url $RPC_URL --private-key $PRIVATE_KEY $CAST_FLAGS $GAS_PRICE_OPT`,
        `echo ""`,
        ``
      ];
      fs.appendFileSync(deploySh, lines.join("\n"), "utf8");
    }
    fs.appendFileSync(deploySh, `echo "All done (${collectionName})."\n`, "utf8");

    // 実行権限付与
    try { fs.chmodSync(deploySh, 0o755); } catch {}
    console.log(`deploy script: ${deploySh}`);
  }

  return rows;
}

// ===== メイン =====
async function main() {
  const collections = listCollections();
  if (!collections.length) { console.log("public/assets にコレクションが見つかりませんでした。"); return; }
  console.log("対象コレクション:", collections.join(", "));
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  /** @type {Array<Record<string,string>>} */
  const allRows = [];
  for (const c of collections) {
    const rows = await genOneCollection(provider, c, allRows);
    if (rows && rows.length) allRows.push(...rows);
  }

  if (allRows.length && !DRY_RUN) {
    const allJson = path.join(SITE_META_DIR, "addresses_all.json");
    const allCsv  = path.join(SITE_META_DIR, "addresses_all.csv");
    fs.writeFileSync(allJson, JSON.stringify(allRows, null, 2), "utf8");

    const header = Object.keys(allRows[0]);
    const csv = [header.join(",")]
      .concat(allRows.map(r => header.map(k => {
        const s = String(r[k] ?? "");
        return (/[",\n]/.test(s)) ? `"${s.replace(/"/g,'""')}"` : s;
      }).join(",")))
      .join("\n");
    fs.writeFileSync(allCsv, csv, "utf8");

    console.log(`\nAggregated address lists written: ${allJson}, ${allCsv}`);
  }
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
