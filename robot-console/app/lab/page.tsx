import type { Metadata } from "next";
import { ScienceLab } from "@/components/ScienceLab";
import { getScienceKnowledgeSummaries } from "@/lib/science-data";
import type { ScienceKnowledgeSummary } from "@/lib/science-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "科小贝资源库 | 龙湾区国科温州第二幼儿园",
  description: "国科二幼园本科学诗、科学故事与科学实验资源库。",
};

/**
 * The lab list only needs one experiment thumbnail and literature cover URLs.
 * Full step galleries are fetched when a teacher opens a detail dialog; keeping
 * them out of the initial payload makes the story and poem pages substantially
 * faster without changing the detail response.
 */
function listItem(item: ScienceKnowledgeSummary): ScienceKnowledgeSummary {
  return {
    ...item,
    resources: item.category === "科学实验"
      ? item.resources.filter((resource) => resource.type === "图片资源").slice(0, 1)
      : [],
  };
}

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
  const items = (await getScienceKnowledgeSummaries()).map(listItem);
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
