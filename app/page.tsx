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

// === Chain config from env ===
const CHAIN_ID_HEX =
  process.env.NEXT_PUBLIC_CHAIN_ID_HEX?.toLowerCase() ?? "0x539"; // 0x539 = 1337 (dummy)
const CHAIN_NAME =
  process.env.NEXT_PUBLIC_CHAIN_NAME ?? "PGirlsChain";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "";
const NATIVE_SYMBOL =
  process.env.NEXT_PUBLIC_NATIVE_SYMBOL ?? "PGC";
const EXPLORER =
  process.env.NEXT_PUBLIC_PGIRLSCHAIN_EXPLORER ?? "";

// --- auto chain helpers (silent) ---
const EXPECTED_CHAIN_ID_NUM = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 0);
const EXPECTED_CHAIN_ID_HEX = EXPECTED_CHAIN_ID_NUM
  ? "0x" + EXPECTED_CHAIN_ID_NUM.toString(16)
  : CHAIN_ID_HEX;

const TARGET_CHAIN_HEX = EXPECTED_CHAIN_ID_HEX.toLowerCase();

const CHAIN_PARAMS = {
  chainId: EXPECTED_CHAIN_ID_HEX,
  chainName: CHAIN_NAME || "PGirlsChain",
  nativeCurrency: {
    name: process.env.NEXT_PUBLIC_NATIVE_SYMBOL || NATIVE_SYMBOL || "PGC",
    symbol: process.env.NEXT_PUBLIC_NATIVE_SYMBOL || NATIVE_SYMBOL || "PGC",
    decimals: 18,
  },
  rpcUrls: [String(process.env.NEXT_PUBLIC_RPC_URL || RPC_URL || "")].filter(
    Boolean
  ),
  blockExplorerUrls: [
    String(
      process.env.NEXT_PUBLIC_EXPLORER_URL ||
        process.env.NEXT_PUBLIC_PGIRLSCHAIN_EXPLORER ||
        EXPLORER ||
        ""
    ),
  ].filter(Boolean),
};

async function silentlyEnsureChain(eth: any) {
  if (!eth || !EXPECTED_CHAIN_ID_HEX) return;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: EXPECTED_CHAIN_ID_HEX }],
    });
  } catch (e: any) {
    if (e?.code === 4902) {
      // 未登録なら追加→切替
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [CHAIN_PARAMS],
      });
    } else {
      // それ以外は無視（ユーザーが拒否した等）
      console.warn("switch chain failed:", e?.message || e);
    }
  }
}

// Ensure wallet is connected to the correct chain
async function ensureCorrectNetwork(eth: any) {
  if (!eth) return false;
  const current: string = (await eth.request({ method: "eth_chainId" })) ?? "";
  if (current?.toLowerCase() === TARGET_CHAIN_HEX) return true;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: EXPECTED_CHAIN_ID_HEX }],
    });
    return true;
  } catch (err: any) {
    if (err?.code === 4902 && RPC_URL) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: EXPECTED_CHAIN_ID_HEX,
            chainName: CHAIN_NAME,
            rpcUrls: [RPC_URL],
            nativeCurrency: {
              name: CHAIN_NAME,
              symbol: NATIVE_SYMBOL,
              decimals: 18,
            },
            blockExplorerUrls: EXPLORER ? [EXPLORER] : [],
          },
        ],
      });
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: EXPECTED_CHAIN_ID_HEX }],
      });
      return true;
    }
    throw err;
  }
}

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

const selectEthereumProvider = (ethereumCandidate?: any) => {
  const candidates: any[] = [];

  const addCandidate = (value: any) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (!candidates.includes(value)) {
      candidates.push(value);
    }
  };

  addCandidate(ethereumCandidate);

  if (typeof window !== "undefined") {
    const globalWindow = window as typeof window & {
      ethereum?: any;
      web3?: { currentProvider?: any };
    };
    addCandidate(globalWindow.ethereum);
    addCandidate(globalWindow.web3?.currentProvider);
  }

  for (const candidate of [...candidates]) {
    if (!candidate) continue;

    const { providers, providerMap, selectedProvider } = candidate;

    if (Array.isArray(providers)) {
      providers.forEach(addCandidate);
    } else if (providers && typeof providers === "object") {
      Object.values(providers).forEach(addCandidate);
    }

    if (providerMap?.get) {
      addCandidate(providerMap.get("MetaMask"));
      addCandidate(providerMap.get("metamask"));
    }

    addCandidate(selectedProvider);
  }

  for (const candidate of candidates) {
    if (candidate?.isMetaMask) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate?.request === "function") {
      return candidate;
    }
    if (typeof candidate?.enable === "function") {
      return candidate;
    }
  }

  return null;
};

const createBrowserProvider = (
  ethereum: any
): ethers.BrowserProvider | null => {
  if (!ethereum) return null;
  try {
    return new ethers.BrowserProvider(ethereum);
  } catch (err) {
    console.error("Failed to initialize BrowserProvider", err);
    return null;
  }
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
  const [networkOk, setNetworkOk] = useState<boolean>(true);
  const ethereumRef = useRef<any>(null);
  const ensureChainOnceRef = useRef(false);

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

    const handleChainChanged = async (_chainId: string) => {
      try {
        if (!ethereumRef.current) return;
        const ok = await ensureCorrectNetwork(ethereumRef.current);
        const nextProvider = createBrowserProvider(ethereumRef.current);
        setProvider(ok ? nextProvider : null);
        setNetworkOk(Boolean(ok));
      } catch {
        setProvider(null);
        setNetworkOk(false);
      }
    };

    const setupProvider = (ethereumCandidate?: any) => {
      if (!mounted) return;

      const ethereum = selectEthereumProvider(ethereumCandidate);

      if (!ethereum) {
        setHasProvider(false);
        setProvider(null);
        setAccountSafely("");
        setNetworkOk(false);
        if (ethereumRef.current) {
          ethereumRef.current.removeListener?.(
            "accountsChanged",
            handleAccountsChanged
          );
          ethereumRef.current.removeListener?.("chainChanged", handleChainChanged);
        }
        ethereumRef.current = null;
        return false;
      }

      if (ethereumRef.current && ethereumRef.current !== ethereum) {
        ethereumRef.current.removeListener?.(
          "accountsChanged",
          handleAccountsChanged
        );
        ethereumRef.current.removeListener?.(
          "chainChanged",
          handleChainChanged
        );
      }

      ethereumRef.current = ethereum;
      setHasProvider(true);
      const nextProvider = createBrowserProvider(ethereum);
      setProvider(nextProvider);

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
      ethereum.removeListener?.("chainChanged", handleChainChanged);
      ethereum.on?.("chainChanged", handleChainChanged);
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
      currentEthereum?.removeListener?.("chainChanged", handleChainChanged);
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
      setHasProvider(true);

      await ensureCorrectNetwork(injected);
      setNetworkOk(true);

      let accounts: string[] = [];

      if (typeof injected.request === "function") {
        accounts =
          (await injected.request({
            method: "eth_requestAccounts",
            params: [],
          })) ?? [];
      } else if (typeof injected.enable === "function") {
        accounts = (await injected.enable()) ?? [];
      }

      if (accounts && accounts.length > 0) {
        try {
          setAccount(ethers.getAddress(accounts[0]));
        } catch {
          setAccount(accounts[0]);
        }
      } else {
        throw new Error("No accounts returned by provider");
      }

      const nextProvider = createBrowserProvider(injected);
      if (nextProvider) {
        setProvider(nextProvider);
      } else if (!provider) {
        setProvider(null);
      }
      ethereumRef.current = injected;

      if (!ensureChainOnceRef.current) {
        ensureChainOnceRef.current = true;
        try {
          await silentlyEnsureChain(injected);
        } catch (e) {
          console.warn("ensureChain after connect:", e);
        }
      }
    } catch (err) {
      console.error("Failed to connect wallet", err);
      alert(
        "Wallet connection failed. Please approve the network switch in your wallet and try again."
      );
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const disconnectWallet = useCallback(() => {
    setAccount("");
    ensureChainOnceRef.current = false;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const eth = ethereumRef.current;
        if (!eth) {
          setNetworkOk(false);
          return;
        }
        const id = (await eth.request({ method: "eth_chainId" }))?.toLowerCase();
        setNetworkOk(id === TARGET_CHAIN_HEX);
      } catch {
        setNetworkOk(false);
      }
    })();
  }, [provider, account]);

  // provider が確定したら1回だけ quietly スイッチ
  useEffect(() => {
    const eth = ethereumRef.current;
    if (!eth || ensureChainOnceRef.current) return;
    ensureChainOnceRef.current = true;
    silentlyEnsureChain(eth).catch(() => {});
    // これ以上繰り返さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const switchNetworkManually = useCallback(async () => {
    try {
      const eth = ethereumRef.current;
      if (!eth) return;
      await ensureCorrectNetwork(eth);
      const next = createBrowserProvider(eth);
      setProvider(next);
      setNetworkOk(true);
    } catch (e) {
      console.error(e);
      alert("Failed to switch network in wallet.");
    }
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

  const walletButtonDisabled = useMemo(
    () => isConnecting,
    [isConnecting]
  );

  const walletButtonText = useMemo(() => {
    if (isConnecting) return "Connecting...";
    if (account) return "Disconnect";
    if (!hasProvider) return "Connect Wallet";
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
          {/* ネットワーク切り替えは必須ではないため、案内ボタンは表示しない */}
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
                    chainOk={networkOk}
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
