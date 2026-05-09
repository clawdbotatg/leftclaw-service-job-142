"use client";

import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { base } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function formatDate(ts: bigint): string {
  if (!ts || ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString();
}

function CategoryRow({ id }: { id: number }) {
  const { data: category } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "categories",
    args: [BigInt(id)],
  });

  // categories tuple: [id[0], name[1], creator[2], createdAt[3]]
  if (!category || category[0] === 0n) return null;

  return (
    <tr className="hover">
      <td className="font-mono text-sm">{id}</td>
      <td className="font-semibold">{category[1]}</td>
      <td className="text-sm opacity-70">{formatDate(category[3])}</td>
      <td>
        <Link href={`/c/${id}`} className="btn btn-sm btn-outline">
          View Crown
        </Link>
      </td>
    </tr>
  );
}

export function CategoriesPage() {
  const { data: categoryCounter } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "categoryCounter",
  });

  const { data: priceCreateCategory } = useScaffoldReadContract({
    contractName: "CreatureFeature",
    functionName: "priceCreateCategory",
  });

  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const { writeContractAsync: createCategory, isPending } = useScaffoldWriteContract({
    contractName: "CreatureFeature",
  });

  const handleCreate = async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    if (chainId !== base.id) {
      switchChain({ chainId: base.id });
      return;
    }

    const name = prompt("Category name:");
    if (!name?.trim()) return;

    try {
      const price = priceCreateCategory ?? 1000000000000000n; // 0.001 ETH fallback
      await createCategory({
        functionName: "createCategory",
        args: [name.trim(), ZERO_ADDRESS as `0x${string}`],
        value: price,
      });
      notification.success(`Category "${name}" created!`);
    } catch (e: any) {
      notification.error(e.message ?? "Transaction failed");
    }
  };

  const count = categoryCounter ? Number(categoryCounter) : 0;
  const ids = Array.from({ length: count }, (_, i) => i + 1);

  return (
    <div className="flex flex-col items-center grow pt-6 px-4 md:px-8 max-w-4xl mx-auto w-full">
      <div className="w-full mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="opacity-70 mt-1">{count} categories · Each holds one Crown Champion</p>
        </div>
        <button className="btn btn-primary" disabled={isPending} onClick={handleCreate}>
          {isPending ? <span className="loading loading-spinner loading-sm" /> : "Create Category — $1.00"}
        </button>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ids.map(id => (
              <CategoryRow key={id} id={id} />
            ))}
            {count === 0 && (
              <tr>
                <td colSpan={4} className="text-center opacity-60 py-8">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CategoriesPage;
