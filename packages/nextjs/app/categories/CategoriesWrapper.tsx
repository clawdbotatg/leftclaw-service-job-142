"use client";

import dynamic from "next/dynamic";

const CategoriesDynamic = dynamic(() => import("./CategoriesContent").then(m => ({ default: m.CategoriesPage })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center grow pt-6 px-4 max-w-4xl mx-auto w-full">
      <div className="skeleton h-12 w-64 mb-4" />
      <div className="skeleton h-48 w-full" />
    </div>
  ),
});

export function CategoriesWrapper() {
  return <CategoriesDynamic />;
}
