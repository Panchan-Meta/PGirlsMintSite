import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const METADATA_DIR = path.join(process.cwd(), "metadata");
const DEFAULT_MINT_STATUS = "BeforeList";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category, fileName } = body || {};

    if (!category || !fileName) {
      return NextResponse.json(
        { error: "category and fileName are required" },
        { status: 400 }
      );
    }

    const filePath = path.join(METADATA_DIR, category, fileName);
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: "metadata file not found" }, { status: 404 });
    }

    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content);

    data.soldout = true;
    data.mintStatus = DEFAULT_MINT_STATUS;
    delete data.price;

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to mark sold out", err);
    return NextResponse.json({ error: "Failed to update metadata" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
