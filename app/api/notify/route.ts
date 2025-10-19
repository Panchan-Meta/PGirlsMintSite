// app/api/notify/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";          // Node ランタイムで外部HTTP可
export const dynamic = "force-dynamic";   // キャッシュさせない
export const revalidate = 0;

type In = {
  event?: string;        // "mint_start" | "mint_ok" | "mint_error" 等
  buyer?: string;
  contract?: string;
  tokenId?: string | number;
  price?: string | number;
  category?: string;
  fileName?: string;
  tx?: string;
  error?: string;
};

const WEBHOOK = (process.env.DISCORD_WEBHOOK_URL || "").trim();

function str(v: unknown) {
  if (v == null) return "";
  try { return String(v); } catch { return ""; }
}

function nowIso() {
  return new Date().toISOString();
}

function buildDiscordPayload(body: In) {
  const ev = str(body.event).toLowerCase() || "mint_event";
  const ok  = ev.includes("ok") || ev.includes("success");
  const err = ev.includes("err");

  const title =
    ev === "mint_start" ? "🚀 Mint Start" :
    ok                  ? "✅ Mint Succeeded" :
    err                 ? "❌ Mint Error" :
                          `📣 ${ev}`;

  const color =
    ev === "mint_start" ? 0x00b3ff :
    ok                  ? 0x2ecc71 :
    err                 ? 0xe74c3c :
                          0x95a5a6;

  const fields = [
    { name: "Buyer",     value: str(body.buyer)     || "-", inline: false },
    { name: "Contract",  value: str(body.contract)  || "-", inline: false },
    { name: "Token ID",  value: str(body.tokenId)   || "-", inline: true  },
    { name: "Price",     value: str(body.price)     || "-", inline: true  },
    { name: "Category",  value: str(body.category)  || "-", inline: true  },
    { name: "File",      value: str(body.fileName)  || "-", inline: true  },
    { name: "Tx",        value: str(body.tx)        || "-", inline: false },
  ];

  if (body.error) {
    fields.push({ name: "Error", value: "```\n" + str(body.error).slice(0, 1200) + "\n```", inline: false });
  }

  return {
    content: ok ? "✅ **Mint OK**" : err ? "❌ **Mint Error**" : "📣 **Mint Event**",
    embeds: [
      {
        title,
        color,
        timestamp: nowIso(),
        fields,
      },
    ],
  };
}

async function sendToDiscord(payload: any) {
  if (!WEBHOOK) {
    console.warn("[/api/notify] DISCORD_WEBHOOK_URL is empty. Skip sending.");
    return { ok: false, status: 0, text: "no webhook" };
  }
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

// CORS (念のため)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  let data: In = {};
  let send = { ok: false, status: 0, text: "" };

  try {
    data = await req.json();
  } catch (e: any) {
    console.error("[/api/notify] bad json:", e?.message || e);
    // ここで落とさず空で続行
  }

  try {
    const payload = buildDiscordPayload(data);
    send = await sendToDiscord(payload);
  } catch (e: any) {
    console.error("[/api/notify] send error:", e?.message || e);
  }

  // 常に 200 を返す（フロントの処理を塞がない）
  return new Response(
    JSON.stringify({
      ok: true,
      sent: !!send.ok,
      status: send.status,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  );
}
