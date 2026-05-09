"use client";

import { useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Address } from "@scaffold-ui/components";
import { parseEther } from "viem";
import { base } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const CF_ADDRESS = "0xa16e4054fb237cedc979b24aacdbbf6548f4617a";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";

function formatTimeRemaining(endsAt: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const end = Number(endsAt);
  const diff = end - now;
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m remaining`;
}

export function SpotlightPage() {
  const [postId, setPostId] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidToken, setBidToken] = useState<"ETH" | "USDC" | "CLAWD">("ETH");

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

  const { writeContractAsync: bidSpotlight, isPending: isBidding } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { writeContractAsync: resolveSpotlight, isPending: isResolving } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { data: usdcAllowance, refetch: refetchUsdc } = useScaffoldReadContract({
    contractName: "USDC",
    functionName: "allowance",
    args: [address, CF_ADDRESS],
    query: { enabled: !!address },
  });

  const { data: clawdAllowance, refetch: refetchClawd } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, CF_ADDRESS],
    query: { enabled: !!address },
  });

  const ensureConnectedOnBase = () => {
    if (!address) {
      openConnectModal?.();
      return false;
    }
    if (chainId !== base.id) {
      switchChain({ chainId: base.id });
      return false;
    }
    return true;
  };

  const handleBid = async () => {
    if (!ensureConnectedOnBase()) return;
    if (!postId.trim()) {
      notification.error("Enter a Post ID");
      return;
    }

    try {
      const postIdBig = BigInt(postId);

      if (bidToken === "ETH") {
        const ethAmt = parseEther(bidAmount || "0");
        await bidSpotlight({
          functionName: "bidSpotlight",
          args: [postIdBig, ZERO_ADDRESS as `0x${string}`, 0n],
          value: ethAmt,
        });
      } else {
        const decimals = bidToken === "USDC" ? 6 : 18;
        const tokenAmt = BigInt(Math.floor(parseFloat(bidAmount || "0") * 10 ** decimals));
        const tokenAddress = bidToken === "USDC" ? USDC_ADDRESS : CLAWD_ADDRESS;
        const allowance = bidToken === "USDC" ? usdcAllowance : clawdAllowance;

        if (!allowance || allowance < tokenAmt) {
          if (bidToken === "USDC") {
            await approveUsdc({ functionName: "approve", args: [CF_ADDRESS as `0x${string}`, tokenAmt] });
            await refetchUsdc();
          } else {
            await approveClawd({ functionName: "approve", args: [CF_ADDRESS as `0x${string}`, tokenAmt] });
            await refetchClawd();
          }
        }

        await bidSpotlight({
          functionName: "bidSpotlight",
          args: [postIdBig, tokenAddress as `0x${string}`, tokenAmt],
        });
      }

      notification.success("Bid placed!");
      setPostId("");
      setBidAmount("");
    } catch (e: any) {
      notification.error(e.message ?? "Transaction failed");
    }
  };

  const handleResolve = async () => {
    if (!ensureConnectedOnBase()) return;
    try {
      await resolveSpotlight({
        functionName: "resolveSpotlight",
      });
      notification.success("Spotlight resolved!");
    } catch (e: any) {
      notification.error(e.message ?? "Transaction failed");
    }
  };

  // spotlight tuple: [slotId[0], startsAt[1], endsAt[2], currentBid[3], currentBidder[4], currentBidPostId[5], currentBidToken[6], imageSnapshotCID[7], resolved[8]]
  const hasActiveBid = spotlight && spotlight[4] !== ZERO_ADDRESS;
  const minBidEth = priceSpotlightFloor ? (Number(priceSpotlightFloor) / 1e18).toFixed(6) : "0.000075";
  const isPending = isBidding || approvingUsdc || approvingClawd;
  const isEnded = spotlight?.[2] && Number(spotlight[2]) < Math.floor(Date.now() / 1000);

  return (
    <div className="flex flex-col items-center grow pt-6 px-4 md:px-8 max-w-3xl mx-auto w-full">
      <div className="w-full mb-6">
        <h1 className="text-3xl font-bold mb-1">🔦 Spotlight</h1>
        <p className="opacity-70">24h auction for a featured slot · Highest bidder wins</p>
      </div>

      {/* Current Spotlight Details */}
      <div className="card bg-base-200 shadow-xl w-full mb-6">
        <div className="card-body">
          <h2 className="card-title">Current Slot #{slotId?.toString() ?? "…"}</h2>
          {!spotlight ? (
            <div className="skeleton h-20 w-full" />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="opacity-60">Status: </span>
                  <span className={`badge ${spotlight[8] ? "badge-ghost" : isEnded ? "badge-error" : "badge-success"}`}>
                    {spotlight[8] ? "Resolved" : isEnded ? "Ended (needs resolve)" : "Active"}
                  </span>
                </div>
                {spotlight[2] > 0n && (
                  <div>
                    <span className="opacity-60">Time: </span>
                    <span>{formatTimeRemaining(spotlight[2])}</span>
                  </div>
                )}
              </div>

              {hasActiveBid ? (
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="opacity-60">Current Bid: </span>
                    <span className="font-bold">{(Number(spotlight[3]) / 1e18).toFixed(6)} ETH</span>
                  </div>
                  <div>
                    <span className="opacity-60">Post: </span>
                    <span className="font-mono">#{spotlight[5].toString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="opacity-60">Bidder: </span>
                    <Address address={spotlight[4]} size="sm" />
                  </div>
                </div>
              ) : (
                <p className="opacity-60">No bids yet — min bid: {minBidEth} ETH</p>
              )}

              {isEnded && !spotlight[8] && (
                <button className="btn btn-warning btn-sm w-fit mt-2" disabled={isResolving} onClick={handleResolve}>
                  {isResolving ? <span className="loading loading-spinner loading-xs" /> : "Resolve Spotlight"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bid Form */}
      <div className="card bg-base-100 border border-base-300 w-full mb-6">
        <div className="card-body">
          <h2 className="card-title">Place a Bid</h2>
          <p className="text-sm opacity-60 mb-2">Minimum bid: {minBidEth} ETH · Outbid by 5%+ to take the lead</p>

          <div className="flex flex-col gap-3 max-w-sm">
            <div>
              <label className="label">
                <span className="label-text">Post ID</span>
              </label>
              <input
                className="input input-bordered w-full"
                placeholder="Enter your post ID"
                type="number"
                value={postId}
                onChange={e => setPostId(e.target.value)}
              />
            </div>

            <div>
              <label className="label">
                <span className="label-text">Pay with</span>
              </label>
              <div className="flex gap-2">
                {(["ETH", "USDC", "CLAWD"] as const).map(t => (
                  <button
                    key={t}
                    className={`btn btn-sm ${bidToken === t ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setBidToken(t)}
                  >
                    {t}
                    {t === "CLAWD" && <span className="badge badge-xs badge-success ml-1">15% off</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">
                <span className="label-text">Amount ({bidToken})</span>
              </label>
              <input
                className="input input-bordered w-full"
                placeholder={`Amount in ${bidToken}`}
                type="number"
                step="0.0001"
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
              />
            </div>

            <button className="btn btn-primary" disabled={isPending} onClick={handleBid}>
              {isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : !address ? (
                "Connect Wallet"
              ) : chainId !== base.id ? (
                "Switch to Base"
              ) : (
                "Place Bid"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
