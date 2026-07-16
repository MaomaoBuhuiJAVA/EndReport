import type { Metadata } from "next";
import { ScienceLab } from "@/components/ScienceLab";
import { getScienceKnowledgeSummaries } from "@/lib/science-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "科小贝实验室 | 龙湾区国科温州第二幼儿园",
  description: "国科二幼园本科学诗、教师实验与家庭实验资源中心。",
};

export default async function LabPage() {
  const items = await getScienceKnowledgeSummaries();
  return <ScienceLab initialItems={items} />;
}
