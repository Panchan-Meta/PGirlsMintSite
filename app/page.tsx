"use client";

import React, { useEffect, useMemo, useState } from "react";
import PaymentNFT from "./ui/PaymentNFT";

type Item = { fileName: string; metadata: any };
type MetaDict = Record<string, Item[]>;

export default function RahabMintSite() {
  const [categories, setCategories] = useState<string[]>([]);
  const [nfts, setNfts] = useState<MetaDict>({});

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch("/api/metadata");
        const data = await res.json();
        if (!res.ok) {
          throw new Error((data as any)?.error || `Request failed: ${res.status}`);
        }
        if (!data || typeof data !== "object") {
          throw new Error("Invalid metadata payload");
        }
        setCategories(Object.keys(data as MetaDict));
        setNfts(data as MetaDict);
      } catch (err) {
        console.error("Error loading metadata:", err);
        setCategories([]);
        setNfts({});
      }
    };
    fetchMetadata();
  }, []);

  // グローバル tokenId の開始位置をカテゴリごとに計算
  const starts = useMemo(() => {
    const map: Record<string, number> = {};
    let acc = 1;
    for (const cat of categories) {
      map[cat] = acc;
      acc += (nfts[cat]?.length ?? 0);
    }
    return map;
  }, [categories, nfts]);

  const scrollTop = (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "sans-serif",
        color: "white",
        background: "black",
        minHeight: "100vh",
      }}
    >
      {/* ===== Sticky Header (Title + Links) ===== */}
      <header
        id="top"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          background: "black",
          padding: "1rem 0.5rem",
          borderBottom: "1px solid #222",
        }}
      >
        {/* Title + Get PGirls (横並び&中央寄せ) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
          }}
        >
          <a
            href="#top"
            onClick={scrollTop}
            style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
          >
            <h1 style={{ margin: 0 }}>Rahab Punkaholic Girls</h1>
          </a>

          <a
            href="https://blgtoken.rahabpunkaholicgirls.com/bridge"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#8ecbff", fontWeight: 700 }}
          >
            Get PGirls
          </a>
        </div>

        {/* Centered category links with equal gaps */}
        <nav
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "1.25rem",
            flexWrap: "wrap",
          }}
        >
          {categories.map((c) => (
            <a key={c} href={`#${encodeURIComponent(c)}`} style={{ color: "#8ecbff" }}>
              {c}
            </a>
          ))}
        </nav>
      </header>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3rem",
          paddingTop: "1rem",
        }}
      >
        {categories.map((cat) => (
          <div key={cat} id={cat} style={{ scrollMarginTop: "120px" }}>
            <h2
              style={{
                fontSize: "1.8rem",
                marginBottom: "1rem",
                textAlign: "center",
              }}
            >
              {cat}
            </h2>
            {nfts[cat]?.map(({ fileName, metadata }, i) => (
              <div key={`${cat}-${fileName}`} style={{ marginBottom: "2rem" }}>
                <PaymentNFT
                  nftContractAddr={"0x704Bf56A89c745e6A62C70803816E83b009d2211"}
                  erc20Address={"0x654f25F2a36997C397Aad8a66D5a8783b6E61b9b"}
                  tokenId={BigInt((starts[cat] ?? 1) + i)}
                  mediaUrl={metadata.image || metadata.animation_url}
                  price={(metadata.price ?? "")
                    .toString()
                    .replace(/[^\d.]/g, "")}
                  category={cat}
                  fileName={fileName}
                  langStr="en-US"
                  initialSoldout={Boolean(metadata.soldout)}
                  initialMintStatus={(metadata.mintStatus ?? "BeforeList") as string}
                  ownerAddress={
                    (metadata.ownerAddress ||
                      metadata.owner ||
                      metadata.walletAddress ||
                      "") as string
                  }
                />
              </div>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
