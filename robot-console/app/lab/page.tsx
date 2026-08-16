import type { Metadata } from "next";
import { ScienceLab } from "@/components/ScienceLab";
import { getScienceKnowledgeSummaries } from "@/lib/science-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "科小贝资源库 | 龙湾区国科温州第二幼儿园",
  description: "国科二幼园本科学诗、科学故事与科学实验资源库。",
};

export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{
    item?: string | string[];
    resource?: string | string[];
    type?: string | string[];
  }>;
}) {
  const { item, resource, type } = await searchParams;
  const items = await getScienceKnowledgeSummaries();
  const initialResourceId =
    typeof item === "string" ? item : typeof resource === "string" ? resource : undefined;
  const initialCategory = typeof type === "string" ? type : undefined;

  return (
    <ScienceLab
      key={initialCategory ?? "all"}
      initialItems={items}
      initialResourceId={initialResourceId}
      initialCategory={initialCategory}
    />
  );
}
