"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Address } from "@scaffold-ui/components";
import { base } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function formatReignTime(reignStart: bigint): string {
  if (!reignStart || reignStart === 0n) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(reignStart);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function formatCountdown(challengeStart: bigint, durationSec: number = 172800): string {
  if (!challengeStart || challengeStart === 0n) return "";
  const end = Number(challengeStart) + durationSec;
  const now = Math.floor(Date.now() / 1000);
  const diff = end - now;
  if (diff <= 0) return "Voting ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m remaining`;
}

export function CrownContent({ id }: { id: string }) {
  const categoryId = BigInt(id);

  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const { data: category } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "categories",
    args: [categoryId],
  });

  const { data: crown } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "crowns",
    args: [categoryId],
  });

  const { data: records } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "categoryRecords",
    args: [categoryId],
  });

  const { data: priceChallenge } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "priceChallenge",
  });

  const { writeContractAsync: submitFirst, isPending: isSubmittingFirst } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { writeContractAsync: challenge, isPending: isChallenging } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { writeContractAsync: vote, isPending: isVoting } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { writeContractAsync: resolveCrown, isPending: isResolving } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const { data: priceVote } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "priceVote",
  });

  // crowns tuple: [championPostId[0], championOwner[1], challengerPostId[2], challengerOwner[3], championVotes[4], challengerVotes[5], challengeStart[6], cooldownEnd[7], reignStart[8], challengeRound[9], imageSnapshotCID[10]]
  // categories tuple: [id[0], name[1], creator[2], createdAt[3]]
  // categoryRecords tuple: [longestReignSeconds[0], longestReignChampion[1], longestReignPostId[2], mostDefensesCount[3], mostDefensesChampion[4], firstEverWinner[5], firstEverWinnerPostId[6]]
  const hasChampion = crown && crown[1] !== ZERO_ADDRESS;
  const hasChallenge = crown && crown[3] !== ZERO_ADDRESS && crown[6] > 0n;

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

  const handleClaimFirst = async () => {
    if (!ensureConnectedOnBase()) return;
    const postIdStr = prompt("Your Post ID to crown:");
    if (!postIdStr) return;
    try {
      const price = priceChallenge ?? 500000000000000n;
      await submitFirst({
        functionName: "submitFirstChampion",
        args: [categoryId, BigInt(postIdStr), ZERO_ADDRESS as `0x${string}`],
        value: price,
      });
      notification.success("Crown claimed!");
    } catch (e: any) {
      notification.error(e.message ?? "Failed");
    }
  };

  const handleChallenge = async () => {
    if (!ensureConnectedOnBase()) return;
    const postIdStr = prompt("Your Post ID to challenge with:");
    if (!postIdStr) return;
    try {
      const price = priceChallenge ?? 500000000000000n;
      await challenge({
        functionName: "challengeCrown",
        args: [categoryId, BigInt(postIdStr), ZERO_ADDRESS as `0x${string}`],
        value: price,
      });
      notification.success("Challenge submitted!");
    } catch (e: any) {
      notification.error(e.message ?? "Failed");
    }
  };

  const handleVote = async (forChallenger: boolean) => {
    if (!ensureConnectedOnBase()) return;
    try {
      const price = priceVote ?? 10000000000000n;
      await vote({
        functionName: "voteOnCrown",
        args: [categoryId, forChallenger, ZERO_ADDRESS as `0x${string}`],
        value: price,
      });
      notification.success("Vote cast!");
    } catch (e: any) {
      notification.error(e.message ?? "Failed");
    }
  };

  const handleResolve = async () => {
    if (!ensureConnectedOnBase()) return;
    try {
      await resolveCrown({
        functionName: "resolveCrown",
        args: [categoryId],
      });
      notification.success("Crown resolved!");
    } catch (e: any) {
      notification.error(e.message ?? "Failed");
    }
  };

  return (
    <div className="flex flex-col items-center grow pt-6 px-4 md:px-8 max-w-3xl mx-auto w-full">
      {/* Category Header */}
      <div className="w-full mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">👑</span>
          <h1 className="text-3xl font-bold">{category?.[1] ?? `Category ${id}`}</h1>
        </div>
        <p className="opacity-60 text-sm">Category #{id}</p>
      </div>

      {/* Crown State */}
      <div className="card bg-base-200 shadow-xl w-full mb-4">
        <div className="card-body">
          <h2 className="card-title">Crown Status</h2>
          {!crown ? (
            <div className="skeleton h-16 w-full" />
          ) : !hasChampion ? (
            <div>
              <p className="opacity-60 mb-4">No champion yet — be the first!</p>
              <button className="btn btn-primary" disabled={isSubmittingFirst} onClick={handleClaimFirst}>
                {isSubmittingFirst ? <span className="loading loading-spinner loading-sm" /> : "Claim this Crown"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-4">
                <div>
                  <span className="label-text text-xs opacity-60">Champion Post</span>
                  <div className="font-mono">#{crown[0].toString()}</div>
                </div>
                <div>
                  <span className="label-text text-xs opacity-60">Owner</span>
                  <Address address={crown[1]} size="sm" />
                </div>
                <div>
                  <span className="label-text text-xs opacity-60">Reign</span>
                  <div>{formatReignTime(crown[8])}</div>
                </div>
                <div>
                  <span className="label-text text-xs opacity-60">Defenses</span>
                  <div className="font-bold">{crown[4]?.toString() ?? "0"}</div>
                </div>
              </div>

              {/* Active Challenge */}
              {hasChallenge ? (
                <div className="bg-warning/20 rounded-xl p-4 flex flex-col gap-3">
                  <div className="font-semibold text-warning">⚔️ Active Challenge</div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="opacity-60">Challenger Post: </span>
                      <span className="font-mono">#{crown[2].toString()}</span>
                    </div>
                    <div>
                      <span className="opacity-60">Challenger: </span>
                      <Address address={crown[3]} size="sm" />
                    </div>
                    <div>
                      <span className="opacity-60">Champion Votes: </span>
                      <span className="font-bold">{crown[4]?.toString()}</span>
                    </div>
                    <div>
                      <span className="opacity-60">Challenger Votes: </span>
                      <span className="font-bold">{crown[5]?.toString()}</span>
                    </div>
                  </div>
                  <div className="text-sm opacity-60">{formatCountdown(crown[6])}</div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-success btn-sm" disabled={isVoting} onClick={() => handleVote(false)}>
                      {isVoting ? <span className="loading loading-spinner loading-xs" /> : "Vote Champion"}
                    </button>
                    <button className="btn btn-warning btn-sm" disabled={isVoting} onClick={() => handleVote(true)}>
                      {isVoting ? <span className="loading loading-spinner loading-xs" /> : "Vote Challenger"}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={isResolving} onClick={handleResolve}>
                      {isResolving ? <span className="loading loading-spinner loading-xs" /> : "Resolve Challenge"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-outline btn-sm" disabled={isChallenging} onClick={handleChallenge}>
                    {isChallenging ? <span className="loading loading-spinner loading-xs" /> : "Challenge for $0.50"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Records — tuple: [longestReignSeconds[0], longestReignChampion[1], ..., mostDefensesCount[3], mostDefensesChampion[4], firstEverWinner[5], ...] */}
      {records && records[1] !== ZERO_ADDRESS && (
        <div className="card bg-base-100 border border-base-300 w-full mb-6">
          <div className="card-body py-4">
            <h3 className="font-semibold text-lg">Category Records</h3>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="opacity-60">Longest Reign: </span>
                <span className="font-bold">{Math.floor(Number(records[0]) / 3600)}h</span>
                <span className="ml-2 opacity-60">by </span>
                <Address address={records[1]} size="sm" />
              </div>
              <div>
                <span className="opacity-60">Most Defenses: </span>
                <span className="font-bold">{records[3].toString()}</span>
                {records[4] !== ZERO_ADDRESS && (
                  <>
                    <span className="ml-2 opacity-60">by </span>
                    <Address address={records[4]} size="sm" />
                  </>
                )}
              </div>
              {records[5] !== ZERO_ADDRESS && (
                <div>
                  <span className="opacity-60">First Ever Winner: </span>
                  <Address address={records[5]} size="sm" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
