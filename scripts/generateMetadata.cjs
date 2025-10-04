/* eslint-disable */
// scripts/generateMetadata.cjs

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// ===== .env 読み込み（プロジェクトルート固定 & 変数展開対応） =====
const PROJECT_ROOT = path.join(__dirname, "..");
const dotenv = require("dotenv");
let dotenvExpand;
try { dotenvExpand = require("dotenv-expand"); } catch { /* optional */ }

function loadEnv(file) {
  if (fs.existsSync(file)) {
    const parsed = dotenv.config({ path: file });
    if (!parsed.error && dotenvExpand) dotenvExpand.expand(parsed);
  }
}
loadEnv(path.join(PROJECT_ROOT, ".env.local"));
loadEnv(path.join(PROJECT_ROOT, ".env"));

// ===== 基本設定 =====
const PUBLIC_DIR      = path.join(PROJECT_ROOT, "public", "assets");
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const IMAGE_EXT       = (process.env.IMAGE_EXT || "png").replace(/^\./, ""); // 例: png/jpg/webp
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

const OWNER_RAW = process.env.NFT_OWNER
  || process.env.NEXT_PUBLIC_NFT_OWNER
  || process.env.TREASURY_ADDRESS     // ← よく使われる別名を許容
  || process.env.OWNER
  || process.env.OWNER_ADDRESS;

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
if (!RPC_URL)     throw new Error(".env の RPC_URL が未設定です");

const FACTORY = toChecksumAddressOrThrow("CREATE2_DEPLOYER/FACTORY/NEXT_PUBLIC_FACTORY", FACTORY_RAW);
const OWNER   = toChecksumAddressOrThrow("NFT_OWNER/NEXT_PUBLIC_NFT_OWNER/TREASURY_ADDRESS/OWNER/OWNER_ADDRESS", OWNER_RAW);

// ===== Artifact =====
const ARTIFACT_PATH = path.join(PROJECT_ROOT, "artifacts", "contracts", "ERC721Collection.sol", "ERC721Collection.json");
if (!fs.existsSync(ARTIFACT_PATH)) {
  throw new Error(`Artifact not found: ${ARTIFACT_PATH}\n先に "npx hardhat compile" を実行してください。`);
}
const collArtifact = require(ARTIFACT_PATH);

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

function listImagesRecursive(dir, baseDir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes:true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listImagesRecursive(abs, baseDir));
    } else if (ent.isFile() && new RegExp(`\\.${IMAGE_EXT}$`, "i").test(ent.name)) {
      const rel = path.relative(baseDir, abs).replace(/\\/g,"/");
      out.push(rel);
    }
  }
  out.sort((a,b)=>a.localeCompare(b, undefined, { numeric:true, sensitivity:"base" }));
  return out;
}
const readJsonSafe = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

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
  const imgs = listImagesRecursive(collectionDir, collectionDir);
  if (!imgs.length) { console.warn(`[warn] 画像が見つかりません (skip): ${collectionName}`); return; }

  const encodedCat = encodeURIComponent(collectionName);

  // --- コレクション1本の予測アドレス ---
  const salt = collectionSalt(collectionName);
  const nameForCollection = `${NAME_PREFIX}${collectionName}`; // 例: "SingleNFT #PFPs_1st_Collection"

  // (address owner, string name, string symbol)
  const encodedArgs = abiCoder.encode(["address","string","string"], [OWNER, nameForCollection, SYMBOL]);
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
  console.log(`\n=== ${collectionName} (${imgs.length} images) ===`);
  let tokenCounter = 0;

  for (const imageRel of imgs) {
    tokenCounter += 1;
    const baseNum  = padLeft(tokenCounter, PAD);   // 001, 002, ...
    const name     = `${NAME_PREFIX}${tokenCounter}`;

    const subdir   = path.dirname(imageRel).replace(/^\.$/, "");
    const jsonRel  = (subdir ? subdir + "/" : "") + `${baseNum}.json`;

    const imageUrl = `${PUBLIC_BASE_URL}/assets/${encodedCat}/${encPath(imageRel)}`;
    const tokenURI = `${PUBLIC_BASE_URL}/assets/${encodedCat}/${encPath(jsonRel)}`;

    const jsonAbs = path.join(collectionDir, jsonRel);
    const jsonDir = path.dirname(jsonAbs);
    if (!DRY_RUN) fs.mkdirSync(jsonDir, { recursive: true });

    const existing = fs.existsSync(jsonAbs) ? readJsonSafe(jsonAbs) : null;

    // 新規生成：contractAddress は全てコレクションの predicted、tokenId は連番
    if ((!existing) && !DRY_RUN) {
      const defaults = baseDefaultsFor(collectionName);
      const meta = {
        name,
        description: name,
        image: imageUrl,
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
      };
      fs.writeFileSync(jsonAbs, JSON.stringify(meta, null, 2), "utf8");
    }

    const defaults = baseDefaultsFor(collectionName);
    const finalMeta = readJsonSafe(jsonAbs) || {};
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
    const row = {
      collection: collectionName,
      index: String(tokenCounter),
      number_padded: baseNum,
      name,
      tokenURI,
      image: imageUrl,
      contractAddress: predictedCollection,
      fileName: jsonRel,
      price: String(finalPrice),
      soldout: finalSoldout,
      tokenId: String(tokenCounter),
    };
    rows.push(row);

    console.log(`#${baseNum}: ${predictedCollection}   ${imageRel}`);
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
        `cast send $CREATE2_DEPLOYER 'deploy(bytes32,bytes)' ${collectionSalt(collectionName)} ${bytecode + abiCoder.encode(["address","string","string"], [OWNER, `${NAME_PREFIX}${collectionName}`, SYMBOL]).slice(2)} --rpc-url $RPC_URL --private-key $PRIVATE_KEY $CAST_FLAGS $GAS_PRICE_OPT`,
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
