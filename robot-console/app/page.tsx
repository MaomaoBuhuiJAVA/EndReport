import { getSiteData } from "@/lib/site-data";
import { AgentHome } from "@/components/AgentHome";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const [data, user] = await Promise.all([getSiteData(), getSessionUser()]);
  const cleanSummary = data.profile.summary
    .replace(/[、与]?云宝机器人能力/g, "")
    .replace(/[、与]?云宝机器人/g, "");
  const homeData = {
    profile: { ...data.profile, summary: cleanSummary },
    campusPhotos: data.campusPhotos,
    rooms: data.rooms,
  };

  return <AgentHome data={homeData} initialUser={user} />;
}
