import { getSessionUser } from "@/lib/auth";
import { getSiteData } from "@/lib/site-data";
import { SchoolPortal } from "@/components/SchoolPortal";

export default async function Home() {
  const user = await getSessionUser();
  const data = await getSiteData(user?.role);
  const portalData = {
    profile: data.profile,
    campusPhotos: data.campusPhotos,
    rooms: data.rooms,
    documents: data.documents,
  };

  return <SchoolPortal data={portalData} initialUser={user} />;
}
