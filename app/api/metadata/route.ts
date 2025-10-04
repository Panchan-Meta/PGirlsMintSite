import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const METADATA_DIR = path.join(process.cwd(), "metadata");
const DEFAULT_MINT_STATUS = "BeforeList";

async function ensureDirectoryExists(dir: string) {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      // metadata がまだ生成されていない場合は空オブジェクトを返す
      throw new Error("ENO_METADATA");
    }
    throw err;
  }
}

function normalizeOwnerFields(metadata: Record<string, any>) {
  const ownerCandidate =
    typeof metadata.ownerAddress === "string" && metadata.ownerAddress.trim()
      ? metadata.ownerAddress.trim()
      : typeof metadata.owner === "string" && metadata.owner.trim()
      ? metadata.owner.trim()
      : typeof metadata.walletAddress === "string" && metadata.walletAddress.trim()
      ? metadata.walletAddress.trim()
      : "";

  if (ownerCandidate) {
    metadata.ownerAddress = ownerCandidate;
    metadata.owner = ownerCandidate;
    metadata.walletAddress = ownerCandidate;
  }
}

function normalizeMetadata(metadata: Record<string, any>) {
  const payload = { ...metadata };
  if (!payload.mintStatus || typeof payload.mintStatus !== "string") {
    payload.mintStatus = DEFAULT_MINT_STATUS;
  }
  normalizeOwnerFields(payload);
  return payload;
}

async function readCategory(category: string) {
  const categoryPath = path.join(METADATA_DIR, category);
  const entries = await fs.readdir(categoryPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

  const result: Array<{ fileName: string; metadata: Record<string, any> }> = [];
  for (const file of files) {
    const filePath = path.join(categoryPath, file.name);
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      result.push({ fileName: file.name, metadata: normalizeMetadata(parsed) });
    } catch (err) {
      console.error(`Failed to read metadata: ${filePath}`, err);
    }
  }

  const getOrderKey = (item: { fileName: string; metadata: Record<string, any> }) => {
    const { metadata, fileName } = item;
    const tokenIdValue = metadata?.tokenId;
    if (typeof tokenIdValue === "number" && Number.isFinite(tokenIdValue)) {
      return tokenIdValue;
    }
    if (typeof tokenIdValue === "string" && tokenIdValue.trim()) {
      const parsed = Number.parseInt(tokenIdValue, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    const match = fileName.match(/\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  result.sort((a, b) => {
    const aKey = getOrderKey(a);
    const bKey = getOrderKey(b);

    const aFinite = Number.isFinite(aKey);
    const bFinite = Number.isFinite(bKey);

    if (aFinite && bFinite) {
      return aKey - bKey;
    }
    if (aFinite) return -1;
    if (bFinite) return 1;
    return a.fileName.localeCompare(b.fileName, "en");
  });

  return result;
}

export async function GET() {
  try {
    await ensureDirectoryExists(METADATA_DIR);
    const entries = await fs.readdir(METADATA_DIR, { withFileTypes: true });
    const categories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const response: Record<string, Array<{ fileName: string; metadata: Record<string, any> }>> = {};
    for (const category of categories) {
      response[category] = await readCategory(category);
    }

    return NextResponse.json(response);
  } catch (err: any) {
    if (err?.message === "ENO_METADATA") {
      return NextResponse.json({});
    }
    console.error("Failed to load metadata", err);
    return NextResponse.json({ error: "Failed to load metadata" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
