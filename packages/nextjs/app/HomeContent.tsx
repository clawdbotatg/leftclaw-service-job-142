"use client";

import { useState } from "react";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Address } from "@scaffold-ui/components";
import { parseEther } from "viem";
import { base } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const CF_ADDRESS = "0xa16e4054fb237cedc979b24aacdbbf6548f4617a";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Category labels for the three crown preview
const CROWN_CATEGORIES: Record<number, string> = {
  1: "Birds",
  2: "Mammals",
  3: "Pets & Companions",
};

function formatTimeRemaining(endsAt: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const end = Number(endsAt);
  const diff = end - now;
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m remaining`;
}

function formatReignTime(reignStart: bigint): string {
  if (reignStart === 0n) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(reignStart);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function encodeAsBytes32(str: string): `0x${string}` {
  // Encode a string as bytes32 (left-aligned, zero-padded)
  const hex = Buffer.from(str.slice(0, 31), "utf8").toString("hex");
  return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
}

// ──────────────────────────────────────────
// Hero Section: Today's Spotlight
// ──────────────────────────────────────────
function SpotlightHero() {
  const [bidPostId, setBidPostId] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidToken, setBidToken] = useState<"ETH" | "USDC" | "CLAWD">("ETH");
  const [showBidForm, setShowBidForm] = useState(false);

  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const { data: slotId } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "currentSpotlightSlotId",
  });

  const { data: spotlight } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "spotlights",
    args: [slotId],
    query: { enabled: slotId !== undefined },
  });

  const { data: priceSpotlightFloor } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "priceSpotlightFloor",
  });

  const { writeContractAsync: approveUsdc, isPending: approvingUsdc } = useScaffoldWriteContract({
    contractName: "USDC",
  });

  const { writeContractAsync: approveClawd, isPending: approvingClawd } = useScaffoldWriteContract({
    contractName: "CLAWD",
  });

  const { writeContractAsync: bidSpotlight, isPending: biddingSpotlight } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { data: usdcAllowance } = useScaffoldReadContract({
    contractName: "USDC",
    functionName: "allowance",
    args: [address, CF_ADDRESS],
    query: { enabled: !!address },
  });

  const { data: clawdAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, CF_ADDRESS],
    query: { enabled: !!address },
  });

  const handleBid = async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    if (chainId !== base.id) {
      switchChain({ chainId: base.id });
      return;
    }

    try {
      const postIdBig = BigInt(bidPostId || "0");
      if (bidToken === "ETH") {
        const ethAmt = parseEther(bidAmount || "0");
        await bidSpotlight({
          functionName: "bidSpotlight",
          args: [postIdBig, ZERO_ADDRESS as `0x${string}`, 0n],
          value: ethAmt,
        });
      } else {
        const tokenAddress = bidToken === "USDC" ? USDC_ADDRESS : CLAWD_ADDRESS;
        const decimals = bidToken === "USDC" ? 6 : 18;
        const tokenAmt = BigInt(Math.floor(parseFloat(bidAmount || "0") * 10 ** decimals));
        const allowance = bidToken === "USDC" ? usdcAllowance : clawdAllowance;
        if (!allowance || allowance < tokenAmt) {
          if (bidToken === "USDC") {
            await approveUsdc({ functionName: "approve", args: [CF_ADDRESS as `0x${string}`, tokenAmt] });
          } else {
            await approveClawd({ functionName: "approve", args: [CF_ADDRESS as `0x${string}`, tokenAmt] });
          }
        }
        await bidSpotlight({
          functionName: "bidSpotlight",
          args: [postIdBig, tokenAddress as `0x${string}`, tokenAmt],
        });
      }
      setShowBidForm(false);
    } catch (e: any) {
      notification.error(e.message ?? "Transaction failed");
    }
  };

  const minBidEth = priceSpotlightFloor ? (Number(priceSpotlightFloor) / 1e18).toFixed(4) : "0.0001";

  // spotlight tuple: [slotId, startsAt, endsAt, currentBid, currentBidder, currentBidPostId, currentBidToken, imageSnapshotCID, resolved]
  const hasActiveBid = spotlight && spotlight[4] !== ZERO_ADDRESS;

  return (
    <section className="card bg-base-200 shadow-xl w-full mb-6">
      <div className="card-body">
        <h2 className="card-title text-2xl">Today&apos;s Spotlight</h2>
        {spotlight ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4">
              <div>
                <span className="label-text text-xs opacity-60">Slot</span>
                <div className="font-mono text-sm">{slotId?.toString() ?? "—"}</div>
              </div>
              {hasActiveBid && (
                <>
                  <div>
                    <span className="label-text text-xs opacity-60">Current bid</span>
                    <div className="font-bold">{(Number(spotlight[3]) / 1e18).toFixed(6)} ETH</div>
                  </div>
                  <div>
                    <span className="label-text text-xs opacity-60">Bidder</span>
                    <Address address={spotlight[4]} size="sm" />
                  </div>
                  <div>
                    <span className="label-text text-xs opacity-60">Post #</span>
                    <div>{spotlight[5]?.toString()}</div>
                  </div>
                </>
              )}
              {!hasActiveBid && (
                <div className="text-sm opacity-60">No bids yet — be the first to claim the spotlight!</div>
              )}
              <div>
                <span className="label-text text-xs opacity-60">Time</span>
                <div className="text-sm">{spotlight[2] ? formatTimeRemaining(spotlight[2]) : "—"}</div>
              </div>
            </div>

            {!showBidForm ? (
              <button className="btn btn-primary w-fit" onClick={() => setShowBidForm(true)}>
                Bid Spotlight (min ~${minBidEth} ETH)
              </button>
            ) : (
              <div className="bg-base-300 p-4 rounded-xl flex flex-col gap-3 max-w-md">
                <input
                  className="input input-bordered w-full"
                  placeholder="Post ID"
                  type="number"
                  value={bidPostId}
                  onChange={e => setBidPostId(e.target.value)}
                />
                <div className="flex gap-2">
                  {(["ETH", "USDC", "CLAWD"] as const).map(t => (
                    <button
                      key={t}
                      className={`btn btn-sm ${bidToken === t ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setBidToken(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  className="input input-bordered w-full"
                  placeholder={`Amount in ${bidToken}`}
                  type="number"
                  step="0.0001"
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary"
                    disabled={biddingSpotlight || approvingUsdc || approvingClawd}
                    onClick={handleBid}
                  >
                    {biddingSpotlight || approvingUsdc || approvingClawd ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : !address ? (
                      "Connect Wallet"
                    ) : chainId !== base.id ? (
                      "Switch to Base"
                    ) : (
                      "Place Bid"
                    )}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowBidForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="skeleton h-20 w-full" />
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────
// Crown Card Component
// ──────────────────────────────────────────
function CrownCard({ categoryId }: { categoryId: number }) {
  const { data: crown } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "crowns",
    args: [BigInt(categoryId)],
  });

  const { data: category } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "categories",
    args: [BigInt(categoryId)],
  });

  // crowns tuple: [championPostId[0], championOwner[1], ..., reignStart[8], ...]
  // categories tuple: [id[0], name[1], creator[2], createdAt[3]]
  const hasChampion = crown && crown[1] !== ZERO_ADDRESS;

  return (
    <div className="card bg-base-100 shadow-md flex-1 min-w-[240px]">
      <div className="card-body gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👑</span>
          <h3 className="card-title text-lg">
            {category?.[1] ?? CROWN_CATEGORIES[categoryId] ?? `Category ${categoryId}`}
          </h3>
        </div>
        {hasChampion ? (
          <>
            <div>
              <span className="label-text text-xs opacity-60">Champion Post</span>
              <div className="font-mono text-sm">#{crown[0]?.toString()}</div>
            </div>
            <div>
              <span className="label-text text-xs opacity-60">Owner</span>
              <Address address={crown[1]} size="sm" />
            </div>
            <div>
              <span className="label-text text-xs opacity-60">Reign</span>
              <div className="text-sm">{formatReignTime(crown[8])}</div>
            </div>
          </>
        ) : (
          <p className="text-sm opacity-60">No champion yet</p>
        )}
        <Link href={`/c/${categoryId}`} className="btn btn-outline btn-sm mt-2">
          {hasChampion ? "Challenge for $0.50" : "Claim this Crown"}
        </Link>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Create Post Section
// ──────────────────────────────────────────
// Tag enum: 0=Wild, 1=Pet, 2=Art
// SourceType enum: 0=InatObservation, 1=IPFS
function CreatePost() {
  const [tab, setTab] = useState<"Wild" | "Pet" | "Art">("Wild");
  const [source, setSource] = useState("");
  const [payToken, setPayToken] = useState<"ETH" | "USDC" | "CLAWD">("ETH");

  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const { data: pricePost } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "pricePost",
  });

  const { writeContractAsync: approveUsdc, isPending: approvingUsdc } = useScaffoldWriteContract({
    contractName: "USDC",
  });

  const { writeContractAsync: approveClawd, isPending: approvingClawd } = useScaffoldWriteContract({
    contractName: "CLAWD",
  });

  const { writeContractAsync: createPost, isPending: isCreating } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useScaffoldReadContract({
    contractName: "USDC",
    functionName: "allowance",
    args: [address, CF_ADDRESS],
    query: { enabled: !!address },
  });

  const { data: clawdAllowance, refetch: refetchClawdAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, CF_ADDRESS],
    query: { enabled: !!address },
  });

  const tagMap: Record<"Wild" | "Pet" | "Art", number> = { Wild: 0, Pet: 1, Art: 2 };
  const sourceTypeMap: Record<"Wild" | "Pet" | "Art", number> = { Wild: 0, Pet: 1, Art: 1 };

  const postPriceEth = pricePost ? pricePost : 75000000000000n; // 0.000075 ETH fallback
  const tokenAddress = payToken === "USDC" ? USDC_ADDRESS : payToken === "CLAWD" ? CLAWD_ADDRESS : ZERO_ADDRESS;

  const needsApproval = () => {
    if (payToken === "ETH") return false;
    const decimals = payToken === "USDC" ? 6 : 18;
    const needed = BigInt(Math.floor(0.075 * 10 ** decimals));
    const allowance = payToken === "USDC" ? usdcAllowance : clawdAllowance;
    return !allowance || allowance < needed;
  };

  const handleShare = async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    if (chainId !== base.id) {
      switchChain({ chainId: base.id });
      return;
    }

    if (!source.trim()) {
      notification.error("Please enter a source ID");
      return;
    }

    try {
      const sourceBytes = encodeAsBytes32(source.trim());
      const tag = tagMap[tab];
      const sourceType = sourceTypeMap[tab];

      if (payToken !== "ETH" && needsApproval()) {
        const decimals = payToken === "USDC" ? 6 : 18;
        const amount = BigInt(Math.floor(0.075 * 1.2 * 10 ** decimals)); // 20% buffer
        if (payToken === "USDC") {
          await approveUsdc({ functionName: "approve", args: [CF_ADDRESS as `0x${string}`, amount] });
          await refetchUsdcAllowance();
        } else {
          await approveClawd({ functionName: "approve", args: [CF_ADDRESS as `0x${string}`, amount] });
          await refetchClawdAllowance();
        }
      }

      if (payToken === "ETH") {
        await createPost({
          functionName: "createPost",
          args: [tag, sourceBytes, sourceType, ZERO_ADDRESS as `0x${string}`],
          value: postPriceEth,
        });
      } else {
        await createPost({
          functionName: "createPost",
          args: [tag, sourceBytes, sourceType, tokenAddress as `0x${string}`],
        });
      }

      setSource("");
      notification.success("Post shared!");
    } catch (e: any) {
      notification.error(e.message ?? "Transaction failed");
    }
  };

  const isPending = isCreating || approvingUsdc || approvingClawd;

  const buttonLabel = () => {
    if (!address) return "Connect Wallet";
    if (chainId !== base.id) return "Switch to Base";
    if (payToken !== "ETH" && needsApproval()) return `Approve ${payToken}`;
    if (isPending) return null;
    return "Share Post ($0.075)";
  };

  return (
    <section className="card bg-base-200 shadow-xl w-full mb-6">
      <div className="card-body">
        <h2 className="card-title text-2xl">Share a Post</h2>
        <div className="tabs tabs-boxed w-fit mb-3">
          {(["Wild", "Pet", "Art"] as const).map(t => (
            <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
              {t === "Wild" ? "🌿 Wild" : t === "Pet" ? "🐾 Pet" : "🎨 Art"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 max-w-md">
          <input
            className="input input-bordered w-full"
            placeholder={tab === "Wild" ? "iNaturalist Observation ID" : "IPFS CID of your image"}
            value={source}
            onChange={e => setSource(e.target.value)}
          />

          <div className="flex gap-2">
            {(["ETH", "USDC", "CLAWD"] as const).map(t => (
              <button
                key={t}
                className={`btn btn-sm ${payToken === t ? "btn-primary" : "btn-outline"}`}
                onClick={() => setPayToken(t)}
              >
                {t}
                {t === "CLAWD" && <span className="badge badge-xs badge-success ml-1">15% off</span>}
              </button>
            ))}
          </div>

          <button className="btn btn-primary w-fit" disabled={isPending} onClick={handleShare}>
            {isPending ? <span className="loading loading-spinner loading-sm" /> : buttonLabel()}
          </button>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────
// Main Homepage
// ──────────────────────────────────────────
export function HomeContent() {
  const { data: postCounter } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "postCounter",
  });

  const { data: categoryCounter } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "categoryCounter",
  });

  return (
    <div className="flex flex-col items-center grow pt-6 px-4 md:px-8 max-w-5xl mx-auto w-full">
      {/* Tagline */}
      <div className="text-center mb-6">
        <h1 className="text-4xl font-bold mb-2">🐾 Creature Feature</h1>
        <p className="text-lg opacity-70">
          Wildlife crown game on Base · Share wild sightings, pets &amp; art · Every interaction funds WWF via Endaoment
        </p>
      </div>

      {/* Spotlight Hero */}
      <SpotlightHero />

      {/* Three Crowns */}
      <section className="w-full mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold">Featured Crowns</h2>
          <Link href="/categories" className="btn btn-sm btn-ghost">
            All Categories →
          </Link>
        </div>
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3].map(id => (
            <CrownCard key={id} categoryId={id} />
          ))}
        </div>
      </section>

      {/* Create Post */}
      <CreatePost />

      {/* Recent Posts Feed */}
      <section className="card bg-base-200 shadow-xl w-full mb-6">
        <div className="card-body">
          <h2 className="card-title text-2xl">Recent Posts</h2>
          {!postCounter || postCounter === 0n ? (
            <p className="text-center opacity-60 py-6">No posts yet — be the first to share!</p>
          ) : (
            <p className="opacity-70">
              {postCounter.toString()} post{postCounter !== 1n ? "s" : ""} shared on Creature Feature.
            </p>
          )}
        </div>
      </section>

      {/* Live Counters */}
      <section className="card bg-base-100 border border-base-300 w-full mb-8">
        <div className="card-body py-4">
          <h3 className="font-semibold text-lg">Protocol Stats</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="opacity-60">Total Posts: </span>
              <span className="font-bold">{postCounter?.toString() ?? "…"}</span>
            </div>
            <div>
              <span className="opacity-60">Categories: </span>
              <span className="font-bold">{categoryCounter?.toString() ?? "…"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="opacity-60">Contract: </span>
              <Address address={CF_ADDRESS} size="sm" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
