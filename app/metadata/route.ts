// app/api/metadata/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, "public", "assets");

// 共通ヘルパ
const pad3 = (n: string | number) => String(n).padStart(3, "0");

function readAll() {
  const out: Record<string, { fileName: string; metadata: any }[]> = {};
  const cats = fs
    .readdirSync(ASSETS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const c of cats) {
    const dir = path.join(ASSETS_DIR, c);
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"));
    out[c] = files.map((fileName) => ({
      fileName,
      metadata: JSON.parse(fs.readFileSync(path.join(dir, fileName), "utf-8")),
    }));
  }
  return out;
}

function readOne(category: string, tokenId: string | number) {
  const id3 = pad3(tokenId);
  const file = path.join(ASSETS_DIR, category, `${id3}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// ── ハンドラ ─────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const tokenId = searchParams.get("tokenId");

    if (category && tokenId) {
      const data = readOne(decodeURIComponent(category), tokenId);
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(data);
    }

    // 一覧
    return NextResponse.json(readAll());
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load metadata" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = String(body.category ?? "");
    const tokenId = body.tokenId ?? "";
    const soldout = body.soldout ?? true;

    if (!category || tokenId === "") {
      return NextResponse.json({ error: "category/tokenId required" }, { status: 400 });
    }

    const id3 = pad3(tokenId);
    const file = path.join(ASSETS_DIR, decodeURIComponent(category), `${id3}.json`);
    if (!fs.existsSync(file)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const meta = JSON.parse(fs.readFileSync(file, "utf-8"));
    meta.soldout = !!soldout;
    fs.writeFileSync(file, JSON.stringify(meta, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
