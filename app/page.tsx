"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ethers } from "ethers";
import PaymentNFT from "./ui/PaymentNFT";

type MetadataRecord = Record<string, unknown>;

const DEFAULT_NFT_CONTRACT = "0x704Bf56A89c745e6A62C70803816E83b009d2211";
const DEFAULT_ERC20_CONTRACT = "0x654f25F2a36997C397Aad8a66D5a8783b6E61b9b";

const ADDRESS_KEYS = {
  nft: [
    "nftContractAddr",
    "nftContractAddress",
    "contractAddress",
    "collectionAddress",
    "nftAddress",
    "collection",
    "address",
  ],
  erc20: [
    "erc20Address",
    "pgirlsTokenAddress",
    "tokenAddress",
    "paymentTokenAddress",
    "pgirlsToken",
    "paymentToken",
    "token",
  ],
} as const;

const isRecord = (value: unknown): value is MetadataRecord =>
  typeof value === "object" && value !== null;

const getMetadataProps = (metadata: unknown): MetadataRecord => {
  if (!isRecord(metadata)) {
    return {};
  }
  const props = (metadata as MetadataRecord)["props"];
  return isRecord(props) ? (props as MetadataRecord) : {};
};

const pickAddressFromMetadata = (
  metadata: unknown,
  keys: readonly string[],
  fallback?: string
) => {
  const metaRecord = isRecord(metadata) ? metadata : {};
  const props = getMetadataProps(metadata);

  for (const key of keys) {
    const propValue = props[key];
    if (typeof propValue === "string" && propValue.trim()) {
      return propValue.trim();
    }

    const directValue = metaRecord[key];
    if (typeof directValue === "string" && directValue.trim()) {
      return directValue.trim();
    }
  }

  return fallback ?? "";
};

type Item = { fileName: string; metadata: any };
type MetaDict = Record<string, Item[]>;

const selectEthereumProvider = (ethereum?: any) => {
  if (!ethereum) return null;

  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    const metamask = ethereum.providers.find((prov: any) => prov?.isMetaMask);
    if (metamask) {
      return metamask;
    }
    return ethereum.providers[0];
  }

  const providerMap = ethereum.providerMap;
  if (providerMap?.get) {
    const metamaskProvider =
      providerMap.get("MetaMask") ?? providerMap.get("metamask");
    if (metamaskProvider) {
      return metamaskProvider;
    }
  }

  return ethereum;
};

const normalizeAddress = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return ethers.getAddress(trimmed);
  } catch {
    return trimmed;
  }
};

const getContractAddress = (metadata: any): string => {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const candidates: unknown[] = [
    metadata.contractAddress,
    metadata.contract_address,
    metadata.contract?.address,
    metadata.address,
    metadata.collection?.address,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAddress(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
};

const getTokenAddress = (metadata: any): string => {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const candidates: unknown[] = [
    metadata.pgirlsTokenAddress,
    metadata.pgirlsToken,
    metadata.paymentTokenAddress,
    metadata.paymentToken?.address,
    metadata.payment_token,
    metadata.tokenAddress,
    metadata.token_address,
    metadata.erc20Address,
    metadata.erc20?.address,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAddress(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
};

const DEFAULT_TOKEN_ADDRESS = normalizeAddress(
  process.env.NEXT_PUBLIC_PGIRLS_TOKEN_ADDRESS ??
    process.env.NEXT_PUBLIC_PGIRLS_ERC20 ??
    process.env.NEXT_PUBLIC_PGIRLS_ERC20_ADDRESS ??
    "0x654f25F2a36997C397Aad8a66D5a8783b6E61b9b"
);

export default function RahabMintSite() {
  const [categories, setCategories] = useState<string[]>([]);
  const [nfts, setNfts] = useState<MetaDict>({});
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [account, setAccount] = useState<string>("");
  const [hasProvider, setHasProvider] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const ethereumRef = useRef<any>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let mounted = true;

    const setAccountSafely = (value: string) => {
      if (!mounted) return;
      setAccount(value);
    };

    const setNormalizedAccount = (accounts: string[] | undefined | null) => {
      if (!mounted) return;
      if (accounts && accounts.length > 0) {
        try {
          setAccountSafely(ethers.getAddress(accounts[0]));
        } catch {
          setAccountSafely(accounts[0]);
        }
      } else {
        setAccountSafely("");
      }
    };

    const handleAccountsChanged = (accounts: string[]) => {
      setNormalizedAccount(accounts);
    };

    const setupProvider = (ethereumCandidate?: any) => {
      if (!mounted) return;

      const ethereum = selectEthereumProvider(ethereumCandidate);

      if (!ethereum) {
        setHasProvider(false);
        setProvider(null);
        setAccountSafely("");
        if (ethereumRef.current) {
          ethereumRef.current.removeListener?.(
            "accountsChanged",
            handleAccountsChanged
          );
        }
        ethereumRef.current = null;
        return false;
      }

      if (ethereumRef.current && ethereumRef.current !== ethereum) {
        ethereumRef.current.removeListener?.(
          "accountsChanged",
          handleAccountsChanged
        );
      }

      ethereumRef.current = ethereum;
      setHasProvider(true);
      setProvider(new ethers.BrowserProvider(ethereum));

      ethereum
        .request?.({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          setNormalizedAccount(accounts);
        })
        .catch((err: unknown) => {
          console.error("Failed to read initial accounts", err);
        });

      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.on?.("accountsChanged", handleAccountsChanged);
      return true;
    };

    const trySetupFromWindow = () => {
      const { ethereum } = window as typeof window & { ethereum?: any };
      return setupProvider(ethereum);
    };

    const handleEthereumInitialized = (event?: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail && setupProvider(detail)) {
        return;
      }
      trySetupFromWindow();
    };

    let pollId: number | undefined;
    let fallbackId: number | undefined;

    if (!trySetupFromWindow()) {
      window.addEventListener(
        "ethereum#initialized",
        handleEthereumInitialized
      );

      pollId = window.setInterval(() => {
        if (trySetupFromWindow()) {
          window.removeEventListener(
            "ethereum#initialized",
            handleEthereumInitialized
          );
          if (pollId !== undefined) {
            window.clearInterval(pollId);
          }
          if (fallbackId !== undefined) {
            window.clearTimeout(fallbackId);
          }
        }
      }, 400);

      fallbackId = window.setTimeout(() => {
        window.removeEventListener(
          "ethereum#initialized",
          handleEthereumInitialized
        );
        if (pollId !== undefined) {
          window.clearInterval(pollId);
        }
        trySetupFromWindow();
      }, 5000);
    }

    return () => {
      mounted = false;
      window.removeEventListener(
        "ethereum#initialized",
        handleEthereumInitialized
      );
      if (pollId !== undefined) {
        window.clearInterval(pollId);
      }
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
      }
      const currentEthereum = ethereumRef.current;
      currentEthereum?.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined") {
      alert("MetaMask not found");
      return;
    }
    try {
      setIsConnecting(true);
      const injected = selectEthereumProvider(
        ethereumRef.current ?? (window as typeof window & { ethereum?: any })
          .ethereum
      );

      if (!injected) {
        alert("MetaMask not found");
        return;
      }

      const accounts: string[] = await injected.request({
        method: "eth_requestAccounts",
      });
      if (accounts && accounts.length > 0) {
        try {
          setAccount(ethers.getAddress(accounts[0]));
        } catch {
          setAccount(accounts[0]);
        }
      }
      if (!provider || ethereumRef.current !== injected) {
        setProvider(new ethers.BrowserProvider(injected));
      }
      ethereumRef.current = injected;
      setHasProvider(true);
    } catch (err) {
      console.error("Failed to connect wallet", err);
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const disconnectWallet = useCallback(() => {
    setAccount("");
  }, []);

  const walletLabel = useMemo(() => {
    if (!account) return "";
    return `${account.slice(0, 6)}...${account.slice(-4)}`;
  }, [account]);

  const handleWalletButtonClick = useCallback(() => {
    if (account) {
      disconnectWallet();
    } else {
      connectWallet();
    }
  }, [account, connectWallet, disconnectWallet]);

  const walletButtonDisabled = useMemo(() => {
    if (isConnecting) return true;
    if (!hasProvider && !account) return true;
    return false;
  }, [isConnecting, hasProvider, account]);

  const walletButtonText = useMemo(() => {
    if (isConnecting) return "Connecting...";
    if (account) return "Disconnect";
    if (!hasProvider) return "No Wallet";
    return "Connect";
  }, [isConnecting, account, hasProvider]);

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
        padding: "2rem 1.25rem",
        fontFamily: "sans-serif",
        color: "white",
        background: "black",
        minHeight: "100vh",
        maxWidth: "520px",
        margin: "0 auto",
        boxSizing: "border-box",
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
          padding: "1.25rem 0.5rem 1rem",
          borderBottom: "1px solid #222",
          minHeight: "130px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          {account && (
            <span
              style={{
                fontSize: "0.85rem",
                color: "#8ecbff",
                fontFamily: "monospace",
              }}
            >
              {walletLabel}
            </span>
          )}
          <button
            onClick={handleWalletButtonClick}
            disabled={walletButtonDisabled}
            style={{
              padding: "0.4rem 1.25rem",
              borderRadius: "999px",
              border: "1px solid #8ecbff",
              background: walletButtonDisabled ? "#222" : "transparent",
              color: "#8ecbff",
              cursor: walletButtonDisabled ? "not-allowed" : "pointer",
              fontSize: "0.95rem",
            }}
          >
            {walletButtonText}
          </button>
        </div>
        {/* Title + Get PGirls (横並び&中央寄せ) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "0.25rem",
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
          width: "100%",
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
            {nfts[cat]?.map(({ fileName, metadata }, i) => {
              const nftContractAddr = pickAddressFromMetadata(
                metadata,
                ADDRESS_KEYS.nft,
                DEFAULT_NFT_CONTRACT
              );
              const erc20Address = pickAddressFromMetadata(
                metadata,
                ADDRESS_KEYS.erc20,
                DEFAULT_ERC20_CONTRACT
              );

              return (
                <div key={`${cat}-${fileName}`} style={{ marginBottom: "2rem" }}>
                  <PaymentNFT
                    nftContractAddr={nftContractAddr}
                    erc20Address={erc20Address || undefined}
                    tokenId={BigInt((starts[cat] ?? 1) + i)}
                    mediaUrl={(metadata as any).image || (metadata as any).animation_url}
                    price={((metadata as any).price ?? "")
                      .toString()
                      .replace(/[^\d.]/g, "")}
                    category={cat}
                    fileName={fileName}
                    langStr="en-US"
                    initialSoldout={Boolean((metadata as any).soldout)}
                    initialMintStatus={((metadata as any).mintStatus ?? "BeforeList") as string}
                    ownerAddress={
                      ((metadata as any).ownerAddress ||
                        (metadata as any).owner ||
                        (metadata as any).walletAddress ||
                        "") as string
                    }
                    provider={provider}
                    account={account}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </main>
  );
}
