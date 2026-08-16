import { getSiteData } from "@/lib/site-data";
import { AgentHome } from "@/components/AgentHome";

export default async function Home() {
  const data = await getSiteData();
  const cleanSummary = data.profile.summary
    .replace(/[、与]?云宝机器人能力/g, "")
    .replace(/[、与]?云宝机器人/g, "");
  const homeData = {
    profile: { ...data.profile, summary: cleanSummary },
    campusPhotos: data.campusPhotos,
    rooms: data.rooms,
    documents: data.documents.filter(
      (document) => !/云宝|yunbao/i.test(`${document.title} ${document.summary}`),
    ),
  };

  return <AgentHome data={homeData} />;
}
