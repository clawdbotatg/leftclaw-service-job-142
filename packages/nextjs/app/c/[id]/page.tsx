import { CrownPageWrapper } from "./CrownWrapper";
import type { NextPage } from "next";

// Pre-generate 50 category pages for static export (required for output: export)
export function generateStaticParams() {
  return Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1) }));
}

type PageParams = { id: string };

const CrownPage: NextPage<{ params: Promise<PageParams> }> = async ({ params }) => {
  const { id } = await params;
  return <CrownPageWrapper id={id} />;
};

export default CrownPage;
