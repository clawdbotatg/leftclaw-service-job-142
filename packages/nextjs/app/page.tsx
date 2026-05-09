"use client";

import dynamic from "next/dynamic";

const HomeContentDynamic = dynamic(() => import("./HomeContent").then(m => ({ default: m.HomeContent })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center grow pt-6 px-4 max-w-5xl mx-auto w-full">
      <div className="skeleton h-16 w-64 mb-6" />
      <div className="skeleton h-48 w-full mb-6" />
      <div className="skeleton h-32 w-full mb-6" />
      <div className="skeleton h-64 w-full mb-6" />
    </div>
  ),
});

export default function Page() {
  return <HomeContentDynamic />;
}
