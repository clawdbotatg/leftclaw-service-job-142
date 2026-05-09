"use client";

import dynamic from "next/dynamic";

const SpotlightDynamic = dynamic(() => import("./SpotlightContent").then(m => ({ default: m.SpotlightPage })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center grow pt-6 px-4 max-w-3xl mx-auto w-full">
      <div className="skeleton h-12 w-64 mb-4" />
      <div className="skeleton h-48 w-full mb-4" />
      <div className="skeleton h-64 w-full" />
    </div>
  ),
});

export function SpotlightWrapper() {
  return <SpotlightDynamic />;
}
