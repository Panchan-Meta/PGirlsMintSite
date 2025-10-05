"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";

const RPC_URL = (process.env.NEXT_PUBLIC_RPC_URL || "").trim();
let sharedFallbackProvider: ethers.JsonRpcProvider | null | undefined;

const getFallbackProvider = () => {
  if (!RPC_URL) return null;
  if (sharedFallbackProvider !== undefined) {
    return sharedFallbackProvider;
  }
  try {
    sharedFallbackProvider = new ethers.JsonRpcProvider(RPC_URL);
  } catch (err) {
    console.error("Failed to create fallback RPC provider", err);
    sharedFallbackProvider = null;
  }
  return sharedFallbackProvider;
};

const WATCH_ASSET = {
  address: String(process.env.NEXT_PUBLIC_PGIRLS_TOKEN_ADDRESS || ""),
  symbol: String(process.env.NEXT_PUBLIC_PGIRLS_TOKEN_SYMBOL || "PGirls").slice(
    0,
    11
  ),
  decimals: Number(process.env.NEXT_PUBLIC_PGIRLS_TOKEN_DECIMALS || 18),
  image: String(process.env.NEXT_PUBLIC_PGIRLS_TOKEN_ICON || ""),
};

async function silentlyWatchAsset(
  eth: any,
  tokenAddr?: string,
  decimals?: number
) {
  const address = tokenAddr || WATCH_ASSET.address;
  if (!eth || !address) return;
  try {
    await eth.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address,
          symbol: WATCH_ASSET.symbol,
          decimals: Number.isFinite(decimals)
            ? Number(decimals)
            : WATCH_ASSET.decimals,
          image: WATCH_ASSET.image || undefined,
        },
      },
    });
  } catch (e) {
    // 拒否や未対応は無視
    console.warn("watchAsset failed:", (e as any)?.message || e);
  }
}

/* =========================================================
 * Props
 * =======================================================*/
export interface PaymentNFTProps {
  nftContractAddr: string;
  tokenId: bigint;

  /** 明示アドレス（pgirlsToken() が読めない場合のフォールバック） */
  erc20Address?: string;

  /** 表示＆tokenURIの組み立て用 */
  langStr: string;
  mediaUrl: string;
  price: string;
  category: string;
  fileName: string;

  /** メタデータ由来の初期値（フォールバック） */
  initialSoldout?: boolean;
  initialMintStatus?: string;
  ownerAddress?: string;

  /** ウォレット */
  provider: ethers.BrowserProvider | null;
  account: string;
  chainOk: boolean;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

/* =========================================================
 * 画像/動画 自動解決
 * =======================================================*/
const guessMediaCandidates = (
  providedUrl: string | undefined,
  category: string,
  fileName: string
) => {
  const baseName = fileName.replace(/\.[^.]+$/, ""); // drop ".json"
  const safeCat = encodeURIComponent(category);
  const safeBase = `/assets/${safeCat}/${encodeURIComponent(baseName)}`;

  const candidates = [
    providedUrl, // メタデータの image/animation_url が最優先
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
        controls
        loop
        playsInline
        onError={onError}
        style={{ borderRadius: 12, width: "100%", maxWidth: width }}
      />
    );
  }

  return (
    <img
      src={url}
      alt="NFT Preview"
      onError={onError}
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
      style={{ borderRadius: 12, width: "100%", maxWidth: width }}
    />
  );
}

/* =========================================================
 * ABIs / 定数
 * =======================================================*/
const DEFAULT_MINT_STATUS = "BeforeList";
const LISTED_STATUS = "Listed";

const NFT_ABI_MIN = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function pgirlsToken() view returns (address)",
] as const;

const NFT_ABI_WRITE = [
  ...NFT_ABI_MIN,
  "function mint(uint256 price, string tokenURI) public",
  "function buy(uint256 price, string tokenURI) external",
] as const;

const ERC20_ABI_MIN = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

const INSUFFICIENT_BALANCE_PATTERNS = [
  "insufficient balance",
  "insufficient funds",
  "transfer amount exceeds balance",
  "exceeds balance",
  "balance too low",
];

function extractErrorMessage(error: any): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;

  const cands = [
    error?.reason,
    error?.shortMessage,
    error?.data?.message,
    error?.error?.message,
    error?.error?.data?.message,
    error?.message,
  ];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return undefined;
}

function getFriendlyErrorMessage(error: any): string {
  const raw = extractErrorMessage(error);
  if (!raw) return "Transaction failed";

  const lower = raw.toLowerCase();
  if (
    INSUFFICIENT_BALANCE_PATTERNS.some((pat) => lower.includes(pat)) ||
    error?.code === "INSUFFICIENT_FUNDS"
  ) {
    return "Insufficient PGirls token balance (insufficient funds).";
  }
  return raw;
}

/* =========================================================
 * 本体
 * =======================================================*/
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
    initialMintStatus,
    ownerAddress,
    provider,
    account,
    chainOk,
  } = props;

  /* ---------- ベース状態 ---------- */
  const [minting, setMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isSoldOut, setIsSoldOut] = useState<boolean>(!!initialSoldout);

  const fallbackTokenAddress = useMemo(() => {
    if (!erc20Address || typeof erc20Address !== "string") return "";
    try {
      return ethers.getAddress(erc20Address);
    } catch {
      return "";
    }
  }, [erc20Address]);

  const [resolvedTokenAddress, setResolvedTokenAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("");
  const [currentOwnerAddress, setCurrentOwnerAddress] = useState<string>(
    ownerAddress?.trim() ?? ""
  );
  const [mintStatus, setMintStatus] = useState<string>(
    initialMintStatus || DEFAULT_MINT_STATUS
  );
  const [activePrice, setActivePrice] = useState<string>(price);
  const [listPriceInput, setListPriceInput] = useState<string>(price);
  const [updatingListing, setUpdatingListing] = useState<boolean>(false);

  type ReadyState = "unknown" | "checking" | "ready" | "missing";
  const [contractStatus, setContractStatus] = useState<ReadyState>("unknown");

  /* ---------- Allowance / Approve 制御 ---------- */
  const [decimalsGuess, setDecimalsGuess] = useState<number>(18);
  const [allowanceOK, setAllowanceOK] = useState<boolean>(false);
  const [approving, setApproving] = useState<boolean>(false);

  /* ---------- Token 解決 ---------- */
  const [tokenAddr, setTokenAddr] = useState<string>("");
  const [tokenStatus, setTokenStatus] = useState<
    "unknown" | "resolving" | "resolved" | "missing"
  >("unknown");
  const watchAssetAttemptedRef = useRef(false);

  /* ---------- 各種ユーティリティ ---------- */
  const normalizedNftAddress = useMemo(() => {
    if (!nftContractAddr || typeof nftContractAddr !== "string") return "";
    try {
      return ethers.getAddress(nftContractAddr);
    } catch (err) {
      console.error("Invalid NFT contract address", err);
      return "";
    }
  }, [nftContractAddr]);

  const fallbackProvider = useMemo(() => getFallbackProvider(), []);

  const readProviders = useMemo(() => {
    const list = new Set<ethers.Provider>();
    if (provider) list.add(provider);
    if (fallbackProvider) list.add(fallbackProvider);
    return Array.from(list);
  }, [provider, fallbackProvider]);

  const primaryReadProvider = readProviders[0] ?? null;
  const hasReadProvider = readProviders.length > 0;

  useEffect(() => {
    setCurrentOwnerAddress(ownerAddress?.trim() ?? "");
  }, [ownerAddress]);

  useEffect(() => {
    setMintStatus(initialMintStatus || DEFAULT_MINT_STATUS);
  }, [initialMintStatus]);

  useEffect(() => {
    setActivePrice(price);
    setListPriceInput(price);
  }, [price]);

  const explorerBase =
    process.env.NEXT_PUBLIC_PGIRLSCHAIN_EXPLORER ||
    "https://explorer.rahabpunkaholicgirls.com";

  const isOwner = useMemo(() => {
    if (!account || !currentOwnerAddress) return false;
    return (
      account.trim().toLowerCase() === currentOwnerAddress.trim().toLowerCase()
    );
  }, [account, currentOwnerAddress]);

  /* ---------- コントラクト存在チェック ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!normalizedNftAddress) {
          if (!cancelled) setContractStatus("missing");
          return;
        }

        if (!hasReadProvider) {
          if (!cancelled) setContractStatus("unknown");
          return;
        }

        if (!cancelled) setContractStatus("checking");

        for (const runner of readProviders) {
          try {
            const code = await runner.getCode(normalizedNftAddress);
            if (cancelled) return;
            if (code && code !== "0x") {
              setContractStatus("ready");
              return;
            }
          } catch (err) {
            console.error("Failed to fetch contract code", err);
          }
        }

        if (!cancelled) setContractStatus("missing");
      } catch (err) {
        console.error(err);
        if (!cancelled) setContractStatus("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedNftAddress, hasReadProvider, readProviders]);

  const getSigner = useCallback(async () => {
    if (!provider) return null;
    return provider.getSigner();
  }, [provider]);

  const requireSigner = useCallback(async () => {
    const s = await getSigner();
    if (!s) throw new Error("No signer");
    return s;
  }, [getSigner]);

  /* ---------- ERC20 アドレス解決 ---------- */
  const validateCandidate = useCallback(
    async (candidate: string | undefined | null) => {
      if (!candidate || typeof candidate !== "string") return "";
      try {
        const normalized = ethers.getAddress(candidate);
        if (!readProviders.length) return normalized;
        for (const runner of readProviders) {
          try {
            const code = await runner.getCode(normalized);
            if (code && code !== "0x") return normalized;
          } catch (e) {
            console.error("validateCandidate getCode failed", normalized, e);
          }
        }
        console.warn("Token candidate has no code", normalized);
      } catch {
        /* ignore */
      }
      return "";
    },
    [readProviders]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setTokenStatus("resolving");

      // 1) 既に解決済みを再検証
      const resolved = await validateCandidate(resolvedTokenAddress);
      if (!cancelled && resolved) {
        setTokenAddr(resolved);
        setTokenStatus("resolved");
        return;
      }

      // 2) フォールバック（メタデータ由来）
      const fallback = await validateCandidate(fallbackTokenAddress);
      if (!cancelled && fallback) {
        if (fallback !== resolvedTokenAddress) {
          setResolvedTokenAddress(fallback);
        }
        setTokenAddr(fallback);
        setTokenStatus("resolved");
        return;
      }

      // 3) コントラクトに pgirlsToken があればそれを読む
      if (primaryReadProvider && normalizedNftAddress) {
        try {
          const nftRO = new ethers.Contract(
            normalizedNftAddress,
            NFT_ABI_MIN,
            primaryReadProvider
          );
          const onChainRaw = await nftRO.pgirlsToken().catch(() => "");
          const onChain = await validateCandidate(onChainRaw);
          if (!cancelled && onChain) {
            if (onChain !== resolvedTokenAddress) {
              setResolvedTokenAddress(onChain);
            }
            setTokenAddr(onChain);
            setTokenStatus("resolved");
            return;
          }
        } catch (err) {
          console.error("resolve token via nft failed", err);
        }
      }

      if (!cancelled) {
        setTokenAddr("");
        setTokenStatus("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    validateCandidate,
    resolvedTokenAddress,
    fallbackTokenAddress,
    primaryReadProvider,
    normalizedNftAddress,
  ]);

  /* ---------- 売切れ判定（オンチェーン + フォールバック） ---------- */
  const checkSoldOut = useCallback(async () => {
    try {
      if (mintStatus !== LISTED_STATUS) {
        setIsSoldOut(Boolean(initialSoldout));
        return;
      }
      const priceValue = (activePrice || "").trim();
      if (priceValue) {
        setIsSoldOut(false);
        return;
      }
      if (
        !primaryReadProvider ||
        !normalizedNftAddress ||
        !tokenId ||
        contractStatus !== "ready"
      )
        return;

      const nftRO = new ethers.Contract(
        normalizedNftAddress,
        NFT_ABI_MIN,
        primaryReadProvider
      );
      let sold = false;
      try {
        const next: bigint = await nftRO.nextTokenId();
        if (tokenId < next) sold = true;
      } catch (e) {}
      if (!sold) {
        try {
          await nftRO.ownerOf(tokenId);
          sold = true;
        } catch (e) {}
      }
      setIsSoldOut(sold);
    } catch (e) {
      console.error(e);
    }
  }, [
    primaryReadProvider,
    normalizedNftAddress,
    tokenId,
    mintStatus,
    contractStatus,
    initialSoldout,
    activePrice,
  ]);

  useEffect(() => {
    checkSoldOut();
  }, [checkSoldOut]);

  /* ---------- 残高/Allowance の読み取り ---------- */
  const refreshAllowance = useCallback(async () => {
    try {
      if (
        !primaryReadProvider ||
        !account ||
        !tokenAddr ||
        !normalizedNftAddress
      ) {
        setAllowanceOK(false);
        return;
      }
      const erc20r = new ethers.Contract(
        tokenAddr,
        ERC20_ABI_MIN,
        primaryReadProvider
      );
      let d = 18;
      try {
        d = Number(await erc20r.decimals());
      } catch {}
      setDecimalsGuess(Number.isFinite(d) ? d : 18);

      const priceStr = (activePrice || "").trim();
      if (!priceStr) {
        setAllowanceOK(false);
        return;
      }
      const need = ethers.parseUnits(priceStr, d);
      const cur: bigint = await erc20r.allowance(account, normalizedNftAddress);
      setAllowanceOK(cur >= need);
    } catch (e) {
      console.error("refreshAllowance", e);
      setAllowanceOK(false);
    }
  }, [primaryReadProvider, account, tokenAddr, normalizedNftAddress, activePrice]);

  useEffect(() => {
    refreshAllowance();
  }, [refreshAllowance]);

  // 残高
  useEffect(() => {
    (async () => {
      try {
        if (!primaryReadProvider || !account || !tokenAddr) {
          setBalance("");
          return;
        }
        const erc20r = new ethers.Contract(
          tokenAddr,
          ERC20_ABI_MIN,
          primaryReadProvider
        );
        let d = 18;
        try {
          d = Number(await erc20r.decimals());
        } catch {}
        const raw = await erc20r.balanceOf(account);
        setBalance(ethers.formatUnits(raw, d));
      } catch (e) {
        console.error("balance refresh", e);
        setBalance("");
      }
    })();
  }, [primaryReadProvider, account, tokenAddr]);

  useEffect(() => {
    if (!account) setBalance("");
  }, [account]);

  useEffect(() => {
    if (watchAssetAttemptedRef.current) return;
    if (!chainOk) return;
    if (tokenStatus !== "resolved") return;
    const addr = tokenAddr || WATCH_ASSET.address;
    if (!addr) return;
    const eth =
      (provider as any)?.provider ??
      (typeof window !== "undefined" ? (window as any)?.ethereum : undefined);
    if (!eth) return;
    watchAssetAttemptedRef.current = true;
    silentlyWatchAsset(eth, addr, decimalsGuess).catch(() => {});
  }, [
    chainOk,
    tokenStatus,
    tokenAddr,
    provider,
    decimalsGuess,
    watchAssetAttemptedRef,
  ]);

  const getOwnerFromMetadata = useCallback((metadata: any) => {
    if (!metadata || typeof metadata !== "object") return "";
    const cand =
      metadata.ownerAddress || metadata.owner || metadata.walletAddress || "";
    return typeof cand === "string" ? cand.trim() : "";
  }, []);

  /* ---------- Approve / Mint （二重起動禁止） ---------- */
  const txMutexRef = useRef<Promise<any> | null>(null);
  const isAlreadyPending = (e: any) =>
    e?.code === -32002 ||
    (typeof e?.message === "string" && /request.*pending/i.test(e.message));

  const handleApprove = useCallback(async () => {
    if (approving || allowanceOK) return;
    if (txMutexRef.current) return;
    try {
      setApproving(true);
      const signer = await requireSigner();
      if (!tokenAddr) throw new Error("Missing PGirls token address");
      if (!normalizedNftAddress) throw new Error("NFT contract address is missing");

      const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, signer);
      let d = decimalsGuess;
      try {
        d = Number(await erc20.decimals());
      } catch {}

      const priceStr = (activePrice || "").trim();
      if (!priceStr) throw new Error("Listing price is missing");
      const need = ethers.parseUnits(priceStr, d);

      const owner = await signer.getAddress();
      const current: bigint = await erc20.allowance(owner, normalizedNftAddress);

      const run = async () => {
        // 非0→非0 を避ける（USDT対策）
        if (current > 0n && current < need) {
          const tx0 = await erc20.approve(normalizedNftAddress, 0n);
          await tx0.wait();
        }
        const tx = await erc20.approve(normalizedNftAddress, need);
        await tx.wait();
      };

      txMutexRef.current = run();
      await txMutexRef.current;
      await refreshAllowance();
    } catch (e: any) {
      if (isAlreadyPending(e)) {
        alert("MetaMask で保留中の確認があります。アプリを切り替えて承認/拒否してください。");
      } else {
        console.error(e);
        alert(getFriendlyErrorMessage(e));
      }
    } finally {
      txMutexRef.current = null;
      setApproving(false);
    }
  }, [
    approving,
    allowanceOK,
    requireSigner,
    tokenAddr,
    decimalsGuess,
    activePrice,
    normalizedNftAddress,
    refreshAllowance,
  ]);

  const handleMint = useCallback(async () => {
    if (minting || isSoldOut || mintStatus !== LISTED_STATUS || isOwner) return;
    if (!allowanceOK) {
      alert("先に Approve を完了してください。");
      return;
    }
    if (txMutexRef.current) return;

    try {
      setMinting(true);
      setTxHash(null);

      if (!provider) throw new Error("No provider");
      if (!normalizedNftAddress) throw new Error("NFT contract address is not set.");
      if (contractStatus !== "ready") throw new Error("NFT contract not deployed.");

      const signer = await requireSigner();

      const erc20r = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, provider);
      let d = decimalsGuess;
      try {
        d = Number(await erc20r.decimals());
      } catch {}

      const priceStr = (activePrice || "").trim();
      if (!priceStr) throw new Error("Listing price is missing");
      const need = ethers.parseUnits(priceStr, d);

      const ownerAddr = await signer.getAddress();
      const bal: bigint = await erc20r.balanceOf(ownerAddr);
      if (bal < need) {
        throw new Error(
          `Insufficient PGirls token balance. Required: ${ethers.formatUnits(
            need,
            d
          )}`
        );
      }

      const nft = new ethers.Contract(normalizedNftAddress, NFT_ABI_WRITE, signer);

      // tokenURI（相対パスで API が解決する前提。必要に応じて絶対URLに変更）
      const padded = tokenId.toString().padStart(3, "0");
      const tokenURI = `/metadata/${langStr}/${padded}.json`;

      const run = async () => {
        const tx = await nft.buy(need, tokenURI);
        const receipt = await tx.wait();
        setTxHash(receipt?.hash ?? tx.hash);
      };

      txMutexRef.current = run();
      await txMutexRef.current;

      // 後処理（メタデータ側へも反映）
      try {
        const res = await fetch(`/api/updateListing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            fileName,
            mintStatus: DEFAULT_MINT_STATUS,
            price: "",
            ownerAddress: ownerAddr,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || "Failed to reset listing");
        }
        const metadata = (payload as any)?.metadata ?? {};
        const ownerFromMeta = getOwnerFromMetadata(metadata);
        if (ownerFromMeta) setCurrentOwnerAddress(ownerFromMeta);
      } catch (e) {
        console.error(e);
      }

      setMintStatus(DEFAULT_MINT_STATUS);
      setActivePrice("");
      setListPriceInput("");
      await checkSoldOut();

      // 残高を更新
      try {
        const raw = await erc20r.balanceOf(ownerAddr);
        setBalance(ethers.formatUnits(raw, d));
      } catch {}
    } catch (e: any) {
      if (isAlreadyPending(e)) {
        alert("MetaMask の確認待ちです。アプリを切り替えて承認してください。");
      } else {
        console.error(e);
        alert(getFriendlyErrorMessage(e));
      }
    } finally {
      txMutexRef.current = null;
      setMinting(false);
    }
  }, [
    minting,
    isSoldOut,
    mintStatus,
    isOwner,
    allowanceOK,
    provider,
    normalizedNftAddress,
    contractStatus,
    requireSigner,
    tokenAddr,
    decimalsGuess,
    activePrice,
    langStr,
    tokenId,
    category,
    fileName,
    getOwnerFromMetadata,
    checkSoldOut,
  ]);

  /* ---------- リスティング更新（オーナーのみ） ---------- */
  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const sanitized = value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
      setListPriceInput(sanitized);
      if (mintStatus !== LISTED_STATUS) setActivePrice(sanitized);
    },
    [mintStatus]
  );

  const canList = useMemo(() => isOwner, [isOwner]);

  const shouldShowListingControls = useMemo(() => {
    if (canList) return true;
    return !isSoldOut;
  }, [canList, isSoldOut]);

  const disableListingButton = useMemo(() => {
    if (updatingListing || !canList) return true;
    const trimmed = listPriceInput.trim();
    if (mintStatus !== LISTED_STATUS) return trimmed.length === 0;
    return false;
  }, [updatingListing, canList, listPriceInput, mintStatus]);

  const handleListingUpdate = useCallback(async () => {
    if (!canList) {
      alert("Only the owner can update the listing");
      return;
    }
    const trimmed = listPriceInput.trim();
    const willList = trimmed.length > 0;
    if (!willList && mintStatus !== LISTED_STATUS) return;

    setUpdatingListing(true);
    try {
      const res = await fetch(`/api/updateListing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          fileName,
          mintStatus: willList ? LISTED_STATUS : DEFAULT_MINT_STATUS,
          price: trimmed,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update listing");
      }
      const metadata = (payload as any)?.metadata ?? {};
      const rawStatus =
        typeof metadata.mintStatus === "string" ? metadata.mintStatus : undefined;
      const rawPrice =
        typeof metadata.price === "string"
          ? metadata.price
          : typeof metadata.price !== "undefined" && metadata.price !== null
          ? String(metadata.price)
          : undefined;

      const nextStatus =
        rawStatus ?? (willList ? LISTED_STATUS : DEFAULT_MINT_STATUS);
      const nextPrice = rawPrice ?? (willList ? trimmed : "");
      const nextOwner = getOwnerFromMetadata(metadata);

      setMintStatus(nextStatus);
      setActivePrice(nextPrice);
      setListPriceInput(nextPrice);
      if (willList) setIsSoldOut(false);
      if (nextOwner) setCurrentOwnerAddress(nextOwner);
      if (!willList) setIsSoldOut(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to update listing");
    } finally {
      setUpdatingListing(false);
    }
  }, [canList, listPriceInput, mintStatus, category, fileName, getOwnerFromMetadata]);

  /* ---------- ボタン状態/ラベル ---------- */
  const displayButtonLabel = useMemo(() => {
    if (minting) return "Processing...";
    if (!provider) return "Wallet Not Found";
    if (!account) return "Connect Wallet";
    if (!normalizedNftAddress) return "Contract Missing";
    if (contractStatus === "checking") return "Checking Contract";
    if (contractStatus === "missing") return "Contract Unavailable";
    if (tokenStatus === "resolving") return "Resolving Token";
    if (tokenStatus === "missing") return "Token Unavailable";
    if (isOwner) return "Owner Wallet";
    if (isSoldOut) return "Sold Out";
    if (mintStatus !== LISTED_STATUS) return "Not Listed";
    if (!activePrice) return "No Price";
    if (!allowanceOK) return "Approve Required";
    return "Mint";
  }, [
    minting,
    provider,
    account,
    normalizedNftAddress,
    contractStatus,
    tokenStatus,
    isOwner,
    isSoldOut,
    mintStatus,
    activePrice,
    allowanceOK,
  ]);

  const isDisabled = useMemo(
    () =>
      minting ||
      !provider ||
      !account ||
      !normalizedNftAddress ||
      contractStatus !== "ready" ||
      tokenStatus !== "resolved" ||
      mintStatus !== LISTED_STATUS ||
      !activePrice ||
      isSoldOut ||
      isOwner ||
      !allowanceOK,
    [
      minting,
      provider,
      account,
      normalizedNftAddress,
      contractStatus,
      tokenStatus,
      mintStatus,
      activePrice,
      isSoldOut,
      isOwner,
      allowanceOK,
    ]
  );

  /* ---------- Render ---------- */
  const formattedTokenId = useMemo(() => tokenId.toString(), [tokenId]);
  const displayNftAddress = useMemo(
    () => normalizedNftAddress || "-",
    [normalizedNftAddress]
  );

  return (
    <div
      style={{
        textAlign: "center",
        background: "#101010",
        borderRadius: "20px",
        padding: "1.25rem",
        width: "100%",
        maxWidth: "420px",
        margin: "0 auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        boxSizing: "border-box",
      }}
    >
      <AutoMedia providedUrl={mediaUrl} category={category} fileName={fileName} />

      <p style={{ fontSize: "0.9rem", color: "#ccc" }}>
        Price: {activePrice ? `${activePrice} PGirls` : "-"}
      </p>
      <p style={{ fontSize: "0.85rem", color: "#ccc" }}>
        Owner Address: {currentOwnerAddress || "-"}
      </p>
      <p style={{ fontSize: "0.85rem", color: "#ccc" }}>
        Connected Wallet: {account || "-"}
      </p>

      {isOwner ? (
        <p style={{ fontSize: "0.85rem", color: "#8ecbff" }}>
          You own this NFT. PGirls balance: {balance || "0"}
        </p>
      ) : (
        <p style={{ fontSize: "0.8rem", color: "#888" }}>
          Connect the owner wallet to manage the listing.
        </p>
      )}

      {!normalizedNftAddress && (
        <p style={{ fontSize: "0.8rem", color: "#ff8080" }}>
          The metadata does not include an NFT contract address.
        </p>
      )}
      {normalizedNftAddress && hasReadProvider && contractStatus === "checking" && (
        <p style={{ fontSize: "0.8rem", color: "#8ecbff" }}>Checking NFT contract...</p>
      )}
      {chainOk &&
        normalizedNftAddress &&
        hasReadProvider &&
        contractStatus === "missing" && (
          <p style={{ fontSize: "0.8rem", color: "#ff8080" }}>
            Could not detect the specified NFT contract. Please check the network and
            address.
          </p>
        )}

      {tokenStatus === "resolving" && (
        <p style={{ fontSize: "0.8rem", color: "#8ecbff" }}>
          Resolving PGirls token contract...
        </p>
      )}
      {chainOk && tokenStatus === "missing" && (
        <p style={{ fontSize: "0.8rem", color: "#ff8080" }}>
          Unable to determine the PGirls token contract. Please refresh after verifying
          the metadata.
        </p>
      )}
      {!allowanceOK && tokenStatus === "resolved" && !isOwner && (
        <p style={{ fontSize: "0.8rem", color: "#ffcf80" }}>
          Approval is required before minting.
        </p>
      )}

      <p style={{ fontSize: "0.8rem", color: "#ccc", wordBreak: "break-all" }}>
        NFT Contract: {displayNftAddress}
      </p>
      <p style={{ fontSize: "0.8rem", color: "#ccc" }}>Token ID: {formattedTokenId}</p>

      {/* List/Update controls (owner only, もしくは未売切れ時に表示) */}
      {shouldShowListingControls && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            alignItems: "center",
            marginTop: "0.75rem",
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            value={listPriceInput}
            onChange={handlePriceChange}
            placeholder="Enter price in PGirls"
            disabled={!canList}
            style={{
              padding: "0.5rem",
              borderRadius: "6px",
              border: "1px solid #444",
              background: canList ? "#111" : "#1a1a1a",
              color: "#fff",
              width: "200px",
              textAlign: "center",
              opacity: canList ? 1 : 0.5,
              cursor: canList ? "text" : "not-allowed",
            }}
          />
          <button
            onClick={handleListingUpdate}
            disabled={disableListingButton}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: disableListingButton ? "#444" : "#28a745",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: disableListingButton ? "not-allowed" : "pointer",
            }}
          >
            {mintStatus === LISTED_STATUS ? "Update Listing" : "List for Sale"}
          </button>
        </div>
      )}

      {/* Approve ボタン（必要な時だけ） */}
      {mintStatus === LISTED_STATUS &&
        !isOwner &&
        !isSoldOut &&
        activePrice &&
        tokenStatus === "resolved" && (
          <div
            style={{
              marginTop: "0.75rem",
              display: "flex",
              gap: 8,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {!allowanceOK ? (
              <button
                onClick={handleApprove}
                disabled={
                  approving ||
                  !provider ||
                  !account ||
                  contractStatus !== "ready" ||
                  tokenStatus !== "resolved"
                }
                style={{
                  padding: "0.6rem 1.2rem",
                  backgroundColor: approving ? "#444" : "#28a745",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: approving ? "not-allowed" : "pointer",
                }}
              >
                {approving ? "Approving..." : "Approve PGirls"}
              </button>
            ) : (
              <div style={{ fontSize: 12, color: "#8ecbff" }}>Allowance is ready</div>
            )}
          </div>
        )}

      {/* Mint ボタン */}
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
        {displayButtonLabel}
      </button>

      {txHash && (
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.85em",
            color: "lightgreen",
            wordBreak: "break-all",
          }}
        >
          Tx Hash:{" "}
          <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noreferrer">
            {txHash}
          </a>{" "}
          (
          <a href={explorerBase} target="_blank" rel="noreferrer">
            Explorer
          </a>
          )
        </p>
      )}
    </div>
  );
}

