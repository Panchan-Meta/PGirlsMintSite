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
  initialMintStatus?: string;
  ownerAddress?: string;
  provider: ethers.BrowserProvider | null;
  account: string;
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
        controls
        loop
        playsInline
        onError={onError}
        style={{
          borderRadius: 12,
          width: "100%",
          maxWidth: width,
        }}
      />
    );
  }

  return (
    <img
      src={url}
      alt="NFT Preview"
      style={{
        borderRadius: 12,
        width: "100%",
        maxWidth: width,
      }}
      onError={onError}
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
    />
  );
}

/** ---------- Minimal ABIs ---------- */
const DEFAULT_MINT_STATUS = "BeforeList";
const LISTED_STATUS = "Listed";

const NFT_ABI_MIN = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  // pgirlsToken() が無いチェーン/過去デプロイでも動くよう try/catch でラップする
  "function pgirlsToken() view returns (address)",
] as const;

const NFT_ABI_WRITE = [
  ...NFT_ABI_MIN,
  "function mint(uint256 price, string tokenURI) public",
  "function buy(uint256 price, string tokenURI) external",
] as const;

const ERC20_ABI_MIN = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
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

const ALLOWANCE_RESET_PATTERNS = [
  "missing revert data",
  "without a reason string",
];

async function ensureAllowance({
  erc20,
  user,
  spender,
  price,
}: {
  erc20: ethers.Contract;
  user: string;
  spender: string;
  price: bigint;
}) {
  const currentAllowance: bigint = await erc20.allowance(user, spender);
  if (currentAllowance >= price) {
    return;
  }

  if (currentAllowance > 0n) {
    const resetTx = await erc20.approve(spender, 0n);
    await resetTx.wait();
  }

  const approveTx = await erc20.approve(spender, price);
  await approveTx.wait();
}

function extractErrorMessage(error: any): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;

  const candidates = [
    error?.reason,
    error?.shortMessage,
    error?.data?.message,
    error?.error?.message,
    error?.error?.data?.message,
    error?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function getFriendlyErrorMessage(error: any): string {
  const raw = extractErrorMessage(error);
  if (!raw) return "Mint failed";

  const normalized = raw.toLowerCase();

  const matchesInsufficient = INSUFFICIENT_BALANCE_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );

  if (matchesInsufficient || error?.code === "INSUFFICIENT_FUNDS") {
    return "Insufficient PGirls token balance (insufficient funds error).";
  }

  const matchesAllowanceReset = ALLOWANCE_RESET_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
  if (matchesAllowanceReset) {
    return (
      "Approval failed. Please reset the PGirls token allowance to 0 in " +
      "your wallet and then try approving again before minting."
    );
  }

  return raw;
}

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
  } = props;

  const [minting, setMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isSoldOut, setIsSoldOut] = useState<boolean>(!!initialSoldout);
  const fallbackTokenAddress = useMemo(() => {
    if (!erc20Address || typeof erc20Address !== "string") {
      return "";
    }
    try {
      return ethers.getAddress(erc20Address);
    } catch (err) {
      console.error("Invalid fallback ERC20 address", erc20Address, err);
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
  const [contractStatus, setContractStatus] = useState<
    "unknown" | "checking" | "ready" | "missing"
  >("unknown");
  const [autoApproveState, setAutoApproveState] = useState<
    "idle" | "pending" | "succeeded" | "failed"
  >("idle");
  const [lastAutoApproveKey, setLastAutoApproveKey] = useState<string>("");

  const normalizedNftAddress = useMemo(() => {
    if (!nftContractAddr || typeof nftContractAddr !== "string") {
      return "";
    }
    try {
      return ethers.getAddress(nftContractAddr);
    } catch (err) {
      console.error("Invalid NFT contract address", err);
      return "";
    }
  }, [nftContractAddr]);

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!normalizedNftAddress) {
          if (!cancelled) {
            setContractStatus("missing");
          }
          return;
        }

        if (!provider) {
          if (!cancelled) {
            setContractStatus("unknown");
          }
          return;
        }

        if (!cancelled) {
          setContractStatus("checking");
        }

        const code = await provider.getCode(normalizedNftAddress);
        if (cancelled) return;
        if (code && code !== "0x") {
          setContractStatus("ready");
        } else {
          setContractStatus("missing");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setContractStatus("missing");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, normalizedNftAddress]);

  const getSigner = useCallback(async () => {
    if (!provider) return null;
    return provider.getSigner();
  }, [provider]);

  const [tokenAddr, setTokenAddr] = useState<string>("");
  const [tokenStatus, setTokenStatus] = useState<
    "unknown" | "resolving" | "resolved" | "missing"
  >("unknown");
  const autoApproveKey = useMemo(() => {
    const trimmedPrice = (activePrice || "").trim();
    if (
      !account ||
      !tokenAddr ||
      !normalizedNftAddress ||
      !trimmedPrice ||
      mintStatus !== LISTED_STATUS
    ) {
      return "";
    }
    return `${account.toLowerCase()}-${tokenAddr}-${normalizedNftAddress}-${trimmedPrice}`;
  }, [account, tokenAddr, normalizedNftAddress, activePrice, mintStatus]);

  const isOwner = useMemo(() => {
    if (!account || !currentOwnerAddress) return false;
    return (
      account.trim().toLowerCase() === currentOwnerAddress.trim().toLowerCase()
    );
  }, [account, currentOwnerAddress]);

  const validateCandidate = useCallback(
    async (candidate: string | undefined | null) => {
      if (!candidate || typeof candidate !== "string") {
        return "";
      }

      try {
        const normalized = ethers.getAddress(candidate);
        if (!provider) {
          return normalized;
        }

        try {
          const code = await provider.getCode(normalized);
          if (code && code !== "0x") {
            return normalized;
          }
          console.warn(
            "Resolved PGirls token candidate has no contract code",
            normalized
          );
        } catch (codeErr) {
          console.error("Failed to validate ERC20 candidate", normalized, codeErr);
        }
      } catch (err) {
        console.error("Invalid ERC20 candidate", candidate, err);
      }

      return "";
    },
    [provider]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!cancelled) {
        setTokenStatus("resolving");
      }
      const resolved = await validateCandidate(resolvedTokenAddress);
      if (!cancelled && resolved) {
        setTokenAddr(resolved);
        setTokenStatus("resolved");
        return;
      }

      const fallback = await validateCandidate(fallbackTokenAddress);
      if (!cancelled && fallback) {
        if (fallback !== resolvedTokenAddress) {
          setResolvedTokenAddress(fallback);
        }
        setTokenAddr(fallback);
        setTokenStatus("resolved");
        return;
      }

      if (!provider || !normalizedNftAddress) {
        if (!cancelled) {
          setTokenAddr("");
          setTokenStatus(fallbackTokenAddress ? "resolving" : "missing");
        }
        return;
      }

      try {
        const nftRO = new ethers.Contract(
          normalizedNftAddress,
          NFT_ABI_MIN,
          provider
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
        console.error("Failed to resolve ERC20 via NFT", err);
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
    provider,
    normalizedNftAddress,
  ]);

  /** ---------- On-chain + Off-chain soldout check ---------- */
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
        !provider ||
        !normalizedNftAddress ||
        !tokenId ||
        contractStatus !== "ready"
      )
        return;
      const nftRO = new ethers.Contract(
        normalizedNftAddress,
        NFT_ABI_MIN,
        provider
      );

      let sold = false;
      try {
        const next: bigint = await nftRO.nextTokenId();
        if (tokenId < next) sold = true;
      } catch (err) {
        console.error(err);
      }

      if (!sold) {
        try {
          await nftRO.ownerOf(tokenId);
          sold = true;
        } catch (err) {
          console.error(err);
        }
      }
      setIsSoldOut(sold);
    } catch (err) {
      console.error(err);
      // keep previous
    }
  }, [
    provider,
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

  useEffect(() => {
    if (!autoApproveKey) {
      if (autoApproveState !== "idle") {
        setAutoApproveState("idle");
      }
      if (lastAutoApproveKey !== "") {
        setLastAutoApproveKey("");
      }
      return;
    }

    if (isOwner) {
      if (autoApproveState !== "idle") {
        setAutoApproveState("idle");
      }
      if (lastAutoApproveKey !== "") {
        setLastAutoApproveKey("");
      }
      return;
    }

    if (
      autoApproveState === "pending" ||
      lastAutoApproveKey === autoApproveKey ||
      !provider ||
      !account ||
      !tokenAddr ||
      !normalizedNftAddress ||
      tokenStatus !== "resolved" ||
      contractStatus !== "ready" ||
      mintStatus !== LISTED_STATUS
    ) {
      return;
    }

    let cancelled = false;

    const runAutoApprove = async () => {
      setAutoApproveState("pending");
      try {
        const signer = await getSigner();
        if (!signer) {
          throw new Error("No signer");
        }

        const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, signer);
        let decimals = 18;
        try {
          const rawDecimals = await erc20.decimals();
          const parsedDecimals = Number(rawDecimals);
          if (Number.isFinite(parsedDecimals)) {
            decimals = parsedDecimals;
          }
        } catch (decimalsErr) {
          console.error(decimalsErr);
        }

        const trimmedPrice = (activePrice || "").trim();
        if (!trimmedPrice) {
          throw new Error("Listing price is missing");
        }

        const parsedPrice = ethers.parseUnits(trimmedPrice, decimals);
        const ownerAddr = await signer.getAddress();

        await ensureAllowance({
          erc20,
          user: ownerAddr,
          spender: normalizedNftAddress,
          price: parsedPrice,
        });

        if (!cancelled) {
          setAutoApproveState("succeeded");
          setLastAutoApproveKey(autoApproveKey);
        }
      } catch (err) {
        console.error("Automatic approval failed", err);
        if (!cancelled) {
          setLastAutoApproveKey(autoApproveKey);
          setAutoApproveState("failed");
        }
      }
    };

    runAutoApprove();

    return () => {
      cancelled = true;
    };
  }, [
    autoApproveKey,
    autoApproveState,
    lastAutoApproveKey,
    provider,
    account,
    tokenAddr,
    normalizedNftAddress,
    tokenStatus,
    contractStatus,
    mintStatus,
    isOwner,
    getSigner,
    activePrice,
  ]);

  /** 残高の読み取り（アカウント/トークン変更時） */
  useEffect(() => {
    (async () => {
      try {

        if (!provider || !account || !tokenAddr) return;
        const erc20r = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, provider);
        let decimals = 18;
        try {
          decimals = Number(await erc20r.decimals());
        } catch (decimalsErr) {
          console.error(decimalsErr);
        }
        const raw = await erc20r.balanceOf(account);
        setBalance(ethers.formatUnits(raw, decimals));
      } catch (balanceErr) {
        console.error(balanceErr);
      }
    })();
  }, [provider, account, tokenAddr]);

  useEffect(() => {
    if (!account) {
      setBalance("");
    }
  }, [account]);

  const getOwnerFromMetadata = useCallback((metadata: any) => {
    if (!metadata || typeof metadata !== "object") return "";
    const candidate =
      metadata.ownerAddress || metadata.owner || metadata.walletAddress || "";
    return typeof candidate === "string" ? candidate.trim() : "";
  }, []);

  /** ---------- Mint ---------- */
  const handleMint = useCallback(async () => {
    if (minting || isSoldOut || mintStatus !== LISTED_STATUS || isOwner) return;
    try {
      setMinting(true);
      setTxHash(null);
      if (!provider) throw new Error("No provider");
      if (!normalizedNftAddress) {
        throw new Error("NFT contract address is not set.");
      }
      if (contractStatus !== "ready") {
        throw new Error("NFT contract deployment could not be confirmed.");
      }
      const signer = await getSigner();
      if (!signer) throw new Error("No signer");

      if (!tokenAddr) throw new Error("Missing PGirls token address");

      const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, signer);
      let decimals = 18;
      try {
        decimals = Number(await erc20.decimals());
      } catch (err) {
        console.error(err);
      }

      const priceValue = (activePrice || "").trim();
      if (!priceValue) {
        throw new Error("Listing price is missing");
      }

      const parsedPrice = ethers.parseUnits(priceValue, decimals);
      const ownerAddr = await signer.getAddress();
      const normalizedOwnerAddr = ownerAddr.trim();

      const balanceRaw: bigint = await erc20.balanceOf(ownerAddr);
      if (balanceRaw < parsedPrice) {
        const requiredAmount = ethers.formatUnits(parsedPrice, decimals);
        throw new Error(
          `Insufficient PGirls token balance. Required amount: ${requiredAmount}`
        );
      }

      await ensureAllowance({
        erc20,
        user: ownerAddr,
        spender: normalizedNftAddress,
        price: parsedPrice,
      });

      // Re-read allowance to ensure the approval actually succeeded before minting.
      const updatedAllowance: bigint = await erc20.allowance(
        ownerAddr,
        normalizedNftAddress
      );
      if (updatedAllowance < parsedPrice) {
        throw new Error(
          "Approval transaction completed but allowance is still insufficient. Please retry."
        );
      }

      const nft = new ethers.Contract(
        normalizedNftAddress,
        NFT_ABI_WRITE,
        signer
      );

      // 既存パターン: /metadata/<lang>/<paddedId>.json
      const paddedTokenId = tokenId.toString().padStart(3, "0");
      const tokenURI = `/metadata/${langStr}/${paddedTokenId}.json`;

      const tx = await nft.buy(parsedPrice, tokenURI);
      const receipt = await tx.wait();
      setTxHash(receipt?.hash ?? tx.hash);

      // ★ 即時反映：UI上で初期状態に戻す
      setIsSoldOut(false);
      if (normalizedOwnerAddr) {
        setCurrentOwnerAddress(normalizedOwnerAddr);
      }

      // 残高更新
      try {
        const erc20r = new ethers.Contract(tokenAddr, ERC20_ABI_MIN, provider);
        let d = 18;
        try {
          d = Number(await erc20r.decimals());
        } catch (err) {
          console.error(err);
        }
        const raw = await erc20r.balanceOf(ownerAddr);
        setBalance(ethers.formatUnits(raw, d));
      } catch (balanceRefreshErr) {
        console.error(balanceRefreshErr);
      }

      // ---- メタデータ側にも soldout を反映（フォールバック） ----
      try {
        const response = await fetch(`/api/updateListing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            fileName,
            mintStatus: DEFAULT_MINT_STATUS,
            price: "",
            ownerAddress: normalizedOwnerAddr,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Failed to reset listing");
        }
        const metadata = (payload as any)?.metadata ?? {};
        const ownerFromMetadata = getOwnerFromMetadata(metadata);
        if (ownerFromMetadata) {
          setCurrentOwnerAddress(ownerFromMetadata);
        }
      } catch (err) {
        console.error(err);
      }

      setMintStatus(DEFAULT_MINT_STATUS);
      setActivePrice("");
      setListPriceInput("");
      await checkSoldOut();
    } catch (e: any) {
      console.error(e);
      alert(getFriendlyErrorMessage(e));
    } finally {
      setMinting(false);
    }
  }, [
    minting,
    isSoldOut,
    isOwner,
    provider,
    getSigner,
    normalizedNftAddress,
    activePrice,
    langStr,
    tokenId,
    category,
    fileName,
    mintStatus,
    checkSoldOut,
    getOwnerFromMetadata,
    contractStatus,

  ]);

  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const sanitized = value
        .replace(/[^\d.]/g, "")
        .replace(/(\..*)\./g, "$1");
      setListPriceInput(sanitized);
      if (mintStatus !== LISTED_STATUS) {
        setActivePrice(sanitized);
      }
    },
    [mintStatus]
  );

  const canList = useMemo(() => {
    if (!isOwner) return false;
    return true;
  }, [isOwner]);

  const shouldShowListingControls = useMemo(() => {
    if (canList) return true;
    return !isSoldOut;
  }, [canList, isSoldOut]);

  const disableListingButton = useMemo(() => {
    if (updatingListing || !canList) return true;
    const trimmed = listPriceInput.trim();
    if (mintStatus !== LISTED_STATUS) {
      return trimmed.length === 0;
    }
    return false;
  }, [updatingListing, canList, listPriceInput, mintStatus]);

  const handleListingUpdate = useCallback(async () => {
    if (!canList) {
      alert("Only the owner can update the listing");
      return;
    }

    const trimmed = listPriceInput.trim();
    const willList = trimmed.length > 0;
    if (!willList && mintStatus !== LISTED_STATUS) {
      return;
    }

    setUpdatingListing(true);
    try {
      const response = await fetch(`/api/updateListing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          fileName,
          mintStatus: willList ? LISTED_STATUS : DEFAULT_MINT_STATUS,
          price: trimmed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
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
      if (willList) {
        setIsSoldOut(false);
      }
      if (nextOwner) {
        setCurrentOwnerAddress(nextOwner);
      }
      if (!willList) {
        setIsSoldOut(false);
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to update listing");
    } finally {
      setUpdatingListing(false);
    }
  }, [
    canList,
    listPriceInput,
    mintStatus,
    category,
    fileName,
    getOwnerFromMetadata,
  ]);

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
    return "Mint";
    }, [
      minting,
      provider,
      account,
      normalizedNftAddress,
      contractStatus,
      tokenStatus,
      isSoldOut,
      mintStatus,
      activePrice,
      isOwner,
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
      isOwner,
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
    ]
  );

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
      {canList ? (
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
      {normalizedNftAddress && provider && contractStatus === "checking" && (
        <p style={{ fontSize: "0.8rem", color: "#8ecbff" }}>
          Checking NFT contract...
        </p>
      )}
      {normalizedNftAddress && provider && contractStatus === "missing" && (
        <p style={{ fontSize: "0.8rem", color: "#ff8080" }}>
          Could not detect the specified NFT contract. Please check the network
          and address.
        </p>
      )}

      {tokenStatus === "resolving" && (
        <p style={{ fontSize: "0.8rem", color: "#8ecbff" }}>
          Resolving PGirls token contract...
        </p>
      )}
      {tokenStatus === "missing" && (
        <p style={{ fontSize: "0.8rem", color: "#ff8080" }}>
          Unable to determine the PGirls token contract. Please refresh after
          verifying the metadata.
        </p>
      )}
      {autoApproveState === "pending" && (
        <p style={{ fontSize: "0.8rem", color: "#8ecbff" }}>
          Automatically approving PGirls token spending...
        </p>
      )}
      {autoApproveState === "failed" && (
        <p style={{ fontSize: "0.8rem", color: "#ff8080" }}>
          Automatic approval failed. You may need to retry minting manually.
        </p>
      )}
      {autoApproveState === "succeeded" && (
        <p style={{ fontSize: "0.8rem", color: "#8ecbff" }}>
          PGirls token allowance is ready for minting.
        </p>
      )}
      <p style={{ fontSize: "0.8rem", color: "#ccc", wordBreak: "break-all" }}>
        NFT Contract: {displayNftAddress}
      </p>
      <p style={{ fontSize: "0.8rem", color: "#ccc" }}>Token ID: {formattedTokenId}</p>

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
              backgroundColor:
                disableListingButton ? "#444" : "#28a745",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor:
                disableListingButton ? "not-allowed" : "pointer",
            }}
          >
            {mintStatus === LISTED_STATUS ? "Update Listing" : "List for Sale"}
          </button>
        </div>
      )}

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
          <a
            href={`${explorerBase}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
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
