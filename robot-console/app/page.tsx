import { getSessionUser } from "@/lib/auth";
import { getSiteData } from "@/lib/site-data";
import { SchoolPortal } from "@/components/SchoolPortal";

export default async function Home() {
  const user = await getSessionUser();
  const data = await getSiteData(user?.role);
  const cleanSummary = data.profile.summary
    .replace(/[、与]?云宝机器人能力/g, "")
    .replace(/[、与]?云宝机器人/g, "");
  const portalData = {
    profile: { ...data.profile, summary: cleanSummary },
    campusPhotos: data.campusPhotos,
    rooms: data.rooms,
    documents: data.documents.filter(
      (document) => !/云宝|yunbao/i.test(`${document.title} ${document.summary}`),
    ),
  };

  return <SchoolPortal data={portalData} initialUser={user} />;
}
