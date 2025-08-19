"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { ethers } from "ethers";

interface PaymentNFTProps {
  nftContractAddr: string;
  tokenId: bigint;
  /** 明示アドレス（pgirlsToken() が読めない場合のフォールバック） */
  erc20Address?: string;
  langStr: string;
  mediaUrl: string;
  price: string;
  category: string;
  fileName: string;
  /** メタデータ由来の初期 soldout（オフチェーンフォールバック） */
  initialSoldout?: boolean;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

/** ---------- AutoMedia: 画像/動画のURLを安全に解決 ---------- */
const guessMediaCandidates = (
  providedUrl: string | undefined,
  category: string,
  fileName: string
) => {
  const baseName = fileName.replace(/\.[^.]+$/, ""); // drop extension (e.g., .json)
  const safeCat = encodeURIComponent(category);
  const safeBase = `/assets/${safeCat}/${encodeURIComponent(baseName)}`;

  const candidates = [
    providedUrl, // metadata にあれば最優先
    `${safeBase}.png`,
    `${safeBase}.jpg`,
    `${safeBase}.jpeg`,
    `${safeBase}.webp`,
    `${safeBase}.gif`,
    `${safeBase}.mp4`,
  ].filter(Boolean) as string[];

  return candidates.map((u) => encodeURI(u));
};

function AutoMedia({
  providedUrl,
  category,
  fileName,
  width = 360,
}: {
  providedUrl?: string;
  category: string;
  fileName: string;
  width?: number;
}) {
  const [idx, setIdx] = React.useState(0);
  const candidates = React.useMemo(
    () => guessMediaCandidates(providedUrl, category, fileName),
    [providedUrl, category, fileName]
  );

  const url = candidates[idx];
  const onError = () => setIdx((i) => Math.min(i + 1, candidates.length - 1));

  if (!url) return null;

  if (url.toLowerCase().endsWith(".mp4")) {
    return (
      <video
        src={url}
        width={width}
        controls
        loop
        playsInline
        onError={onError}
        style={{ borderRadius: 12 }}
      />
    );
  }

  return (
    <img
      src={url}
      alt="NFT Preview"
      width={width}
      style={{ borderRadius: 12 }}
      onError={onError}
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
    />
  );
}

/** ---------- Minimal ABIs ---------- */
const NFT_ABI_MIN = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  // pgirlsToken() が無いチェーン/過去デプロイでも動くよう try/catch でラップする
  "function pgirlsToken() view returns (address)",
] as const;

const NFT_ABI_WRITE = [
  ...NFT_ABI_MIN,
  "function mint(uint256 price, string tokenURI) public",
] as const;

const ERC20_ABI_MIN = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

export default function PaymentNFT(props: PaymentNFTProps) {
  const {
    nftContractAddr,
    tokenId,
    erc20Address,
    langStr,
    mediaUrl,
    price,
    category,
    fileName,
    initialSoldout,
  } = props;

  const [account, setAccount] = useState<string>("");
  const [minting, setMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isSoldOut, setIsSoldOut] = useState<boolean>(!!initialSoldout);
  const [erc20FromChain, setErc20FromChain] = useState<string>("");
  const [balance, setBalance] = useState<string>("");

  const provider = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  const getSigner = useCallback(async () => {
    if (!provider) return null;
    return provider.getSigner();
  }, [provider]);

  /** ---------- On-chain pgirlsToken address (SSoT) ---------- */
  useEffect(() => {
    (async () => {
      try {
        if (!provider || !nftContractAddr) return;
        const nftRO = new ethers.Contract(nftContractAddr, NFT_ABI_MIN, provider);
        const addr = await nftRO.pgirlsToken().catch(() => "");
        if (addr && typeof addr === "string" && addr !== ethers.ZeroAddress) {
          setErc20FromChain(addr);
        }
      } catch {}
    })();
  }, [provider, nftContractAddr]);

  /** ---------- On-chain + Off-chain soldout check ---------- */
  const checkSoldOut = useCallback(async () => {
    try {
      if (initialSoldout) {
        setIsSoldOut(true);
        return;
      }
      if (!provider || !nftContractAddr || !tokenId) return;
      const nftRO = new ethers.Contract(nftContractAddr, NFT_ABI_MIN, provider);

      let sold = false;
      try {
        const next: bigint = await nftRO.nextTokenId();
        if (tokenId < next) sold = true;
      } catch {}

      if (!sold) {
        try {
          await nftRO.ownerOf(tokenId);
          sold = true;
        } catch {}
      }
      setIsSoldOut(sold);
    } catch {
      // keep previous
    }
  }, [provider, nftContractAddr, tokenId, initialSoldout]);

  /** 初期化：アカウント取得 & soldout チェック */
  useEffect(() => {
    (async () => {
      if (!provider) return;
      try {
        await window.ethereum?.request?.({ method: "eth_requestAccounts" });
        const s = await provider.getSigner();
        setAccount(await s.getAddress());
      } catch {
        setAccount("");
      } finally {
        checkSoldOut();
      }
    })();
  }, [provider, checkSoldOut]);

  /** 残高の読み取り（アカウント/トークン変更時） */
  useEffect(() => {
    (async () => {
      try {
        const tokenAddr = erc20FromChain || erc20Address;
        if (!provider || !account || !tokenAddr) return;
        const erc20r = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, provider);
        let decimals = 18;
        try { decimals = Number(await erc20r.decimals()); } catch {}
        const raw = await erc20r.balanceOf(account);
        setBalance(ethers.formatUnits(raw, decimals));
      } catch {}
    })();
  }, [provider, account, erc20FromChain, erc20Address]);

  /** ---------- Mint ---------- */
  const handleMint = useCallback(async () => {
    if (minting || isSoldOut) return;
    try {
      setMinting(true);
      setTxHash(null);
      if (!provider) throw new Error("No provider");
      const signer = await getSigner();
      if (!signer) throw new Error("No signer");

      const tokenAddr = erc20FromChain || erc20Address;
      if (!tokenAddr) throw new Error("Missing PGirls token address");

      const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, signer);
      let decimals = 18;
      try {
        decimals = Number(await erc20.decimals());
      } catch {}

      const parsedPrice = ethers.parseUnits((price ?? "0").toString(), decimals);
      const ownerAddr = await signer.getAddress();

      const allowance: bigint = await erc20.allowance(ownerAddr, nftContractAddr);
      if (allowance < parsedPrice) {
        const txApprove = await erc20.approve(nftContractAddr, parsedPrice);
        await txApprove.wait();
      }

      const nft = new ethers.Contract(nftContractAddr, NFT_ABI_WRITE, signer);

      // 既存パターン: /metadata/<lang>/<paddedId>.json
      const paddedTokenId = tokenId.toString().padStart(3, "0");
      const tokenURI = `/metadata/${langStr}/${paddedTokenId}.json`;

      const tx = await nft.mint(parsedPrice, tokenURI);
      const receipt = await tx.wait();
      setTxHash(receipt?.hash ?? tx.hash);

      // ★ 即時反映：UI上で売切れにする
      setIsSoldOut(true);

      // 残高更新
      try {
        const erc20r = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, provider);
        let d = 18; try { d = Number(await erc20r.decimals()); } catch {}
        const raw = await erc20r.balanceOf(ownerAddr);
        setBalance(ethers.formatUnits(raw, d));
      } catch {}

      // オンチェーン確認（保険）
      await checkSoldOut();

      // ---- メタデータ側にも soldout を反映（フォールバック） ----
      try {
        await fetch(`/api/markSoldOut`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, fileName }),
        });
      } catch {}
    } catch (e: any) {
      console.error(e);
      alert(e?.reason || e?.message || "Mint failed");
    } finally {
      setMinting(false);
    }
  }, [
    minting,
    isSoldOut,
    provider,
    getSigner,
    erc20Address,
    erc20FromChain,
    nftContractAddr,
    price,
    langStr,
    tokenId,
    checkSoldOut,
    category,
    fileName,
  ]);

  const isDisabled = minting || isSoldOut;

  return (
    <div style={{ textAlign: "center" }}>
      <AutoMedia providedUrl={mediaUrl} category={category} fileName={fileName} />

      <p style={{ fontSize: "0.9rem", color: "#ccc" }}>Price: {price} PGirls</p>
      <p style={{ fontSize: "0.85rem", color: "#aaa" }}>
        Your PGirls balance (on-chain): {balance || "-"}
      </p>

      <button
        onClick={handleMint}
        disabled={isDisabled}
        style={{
          marginTop: "1rem",
          padding: "0.6rem 1.2rem",
          backgroundColor: isDisabled ? "gray" : "#00bfff",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: isDisabled ? "not-allowed" : "pointer",
        }}
      >
        {isSoldOut ? "Sold out" : minting ? "Processing..." : "Mint with PGirls"}
      </button>

      {txHash && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.85em", color: "lightgreen" }}>
          Tx Hash:{" "}
          <a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
            {txHash}
          </a>
        </p>
      )}
    </div>
  );
}
