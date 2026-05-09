"use client";

import dynamic from "next/dynamic";

const CrownContentDynamic = dynamic(() => import("./CrownContent").then(m => ({ default: m.CrownContent })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center grow pt-6 px-4 max-w-3xl mx-auto w-full">
      <div className="skeleton h-12 w-64 mb-4" />
      <div className="skeleton h-48 w-full mb-4" />
      <div className="skeleton h-32 w-full" />
    </div>
  ),
});

export function CrownPageWrapper({ id }: { id: string }) {
  return <CrownContentDynamic id={id} />;
}
