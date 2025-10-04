import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const METADATA_DIR = path.join(process.cwd(), "metadata");
const DEFAULT_MINT_STATUS = "BeforeList";

function normalizeOwner(ownerAddress: unknown) {
  if (typeof ownerAddress === "string") {
    const trimmed = ownerAddress.trim();
    return trimmed || undefined;
  }
  return undefined;
}

async function loadMetadata(filePath: string) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function saveMetadata(filePath: string, data: Record<string, any>) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category, fileName, mintStatus, price, ownerAddress } = body || {};

    if (!category || !fileName) {
      return NextResponse.json(
        { error: "category and fileName are required" },
        { status: 400 }
      );
    }

    const filePath = path.join(METADATA_DIR, category, fileName);
    try {
      await fs.access(filePath);
    } catch (err) {
      return NextResponse.json({ error: "metadata file not found" }, { status: 404 });
    }

    const data = await loadMetadata(filePath);

    if (typeof mintStatus === "string" && mintStatus.trim()) {
      data.mintStatus = mintStatus.trim();
    } else if (!data.mintStatus) {
      data.mintStatus = DEFAULT_MINT_STATUS;
    }

    if (typeof price !== "undefined") {
      const normalizedPrice =
        typeof price === "string" ? price.trim() : String(price ?? "");
      if (normalizedPrice) {
        data.price = normalizedPrice;
      } else {
        delete data.price;
      }
    }

    if (typeof ownerAddress !== "undefined") {
      const normalizedOwner = normalizeOwner(ownerAddress);
      if (normalizedOwner) {
        data.ownerAddress = normalizedOwner;
        data.owner = normalizedOwner;
        data.walletAddress = normalizedOwner;
      } else {
        delete data.ownerAddress;
        delete data.owner;
        delete data.walletAddress;
      }
    }

    if (!data.mintStatus) {
      data.mintStatus = DEFAULT_MINT_STATUS;
    }

    await saveMetadata(filePath, data);
    return NextResponse.json({ ok: true, metadata: data });
  } catch (err) {
    console.error("Failed to update metadata", err);
    return NextResponse.json({ error: "Failed to update metadata" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
