import type { SiteData } from "@/lib/site-data";
import { resolveMediaReferences } from "@/lib/media-links";
import { resourceEvidence } from "./resources";
import { isSiteResourceQuery } from "./routing";

const roomTerms = /功能室|阅读坊|绘本阅读|建构|未来工作坊|科学廊|大厅|全景|园所环境/u;
const placeholder = /等待数据库|数据库同步|执行\s*seed|网页资源优化|管理员维护/u;
const clean = (text?: string | null) => text && !placeholder.test(text) ? text.trim() : "";
const label = (text: string) => text.replace(/[\[\]\r\n]/gu, " ").trim();
const aliases: Array<[string[], RegExp]> = [
  [["阅读坊", "绘本阅读", "绘本阅读坊"], /阅读坊|绘本阅读/u],
  [["建构", "建构空间", "建构空间坊"], /建构/u],
  [["未来工作坊"], /未来工作坊/u],
  [["科学廊", "纵深科学廊"], /科学廊/u],
  [["大厅"], /大厅/u],
  [["全景", "全景图"], /全景/u],
];
const subject = (text: string) => text.replace(/温州市|龙湾区国科温州第二幼儿园|国科温州第二幼儿园|国科二幼|国科温州|幼儿园|园所|校园|本园|我们园|功能室|环境|有哪些|有什么|做些什么|有什么作用|如何使用|怎样使用|全部|所有|请问|请|帮我|给我|看看|查找|介绍|照片|图片|影像|展示|换成|换为|改成|改为|可以|有没有|这个|找|看|的|呢|吗|[\s，。！？；：,.!?;:《》“”"]/gu, "");

export function siteResourceEvidence(site: SiteData, query: string) {
  const evidence = resourceEvidence([], query);
  // A later named room replaces the earlier selection; short pronouns keep it.
  const latest = query.split("\n").at(-1) || query;
  const newSubject = /换成|换为|改成|改为/u.test(latest) && Boolean(subject(latest));
  const selectedQuery = isSiteResourceQuery(latest) || newSubject ? latest : query;
  const wantPhotos = /图片|照片|全景|影像/u.test(selectedQuery);
  const roomIntent = roomTerms.test(selectedQuery) || newSubject && roomTerms.test(query);
  const sections: string[] = [];
  const add = (title: string, text: string) => {
    evidence.sources.push(title);
    sections.push(`### ${label(title)}\n${text}`);
  };

  if (roomIntent) {
    const names = subject(selectedQuery).split(/和|以及|及|与|、/u).filter(Boolean);
    const named = site.rooms.filter(room => names.some(name => {
      const exact = site.rooms.find(candidate => candidate.name === name);
      if (exact && (/\d+$/u.test(name) || !/全部|所有/u.test(selectedQuery))) return room.name === name;
      return room.name.replace(/\d+$/u, "") === name
        || aliases.some(([asked, actual]) => asked.includes(name) && actual.test(room.name));
    }));
    const rooms = named.length ? named : !names.length ? site.rooms : [];
    for (const room of rooms) {
      const text = [clean(room.summary), clean(room.description)].filter(Boolean).join("\n");
      const photos = wantPhotos ? room.assets.filter(asset => /^\/(?!\/)|^https:\/\//u.test(asset.url)).map(asset => ({id: asset.id, title: asset.title || room.name, url: asset.url, description: room.name})) : [];
      evidence.photos.push(...photos);
      add(room.name, [text, ...photos.map(photo => `[${label(photo.title)}](${photo.url})`)].filter(Boolean).join("\n") || "园所空间索引已收录此名称。详细资料暂未收录。");
    }
  } else if (wantPhotos) {
    const broad = !subject(selectedQuery) || /^(?:成长|活动)$/u.test(subject(selectedQuery));
    const photos = broad ? site.campusPhotos.filter(photo => /^\/(?!\/)|^https:\/\//u.test(photo.url)).slice(0, 8) : [];
    evidence.photos = photos.map(photo => ({id: photo.id, title: photo.title, url: photo.url, description: clean(photo.description) || photo.title}));
    if (photos.length) add("园所成长影像", photos.map(photo => `[${label(photo.title)}](${photo.url})`).join("\n"));
  } else {
    const special = /荣誉|获奖|资质|省二|评估|社团|课程|云宝|智慧校园/u.test(selectedQuery);
    if (!special) add(site.profile.name, [site.profile.slogan, site.profile.summary, site.profile.address].filter(Boolean).join("\n"));
    const category = /荣誉|获奖/u.test(selectedQuery) ? "HONOR" : /资质|省二|评估/u.test(selectedQuery) ? "QUALIFICATION" : /课程|社团/u.test(selectedQuery) ? "COURSE" : /云宝|智慧校园/u.test(selectedQuery) ? "SPEECH" : "BASIC_INFO";
    const documents = site.documents.filter(document => document.category === category
      && !/STAFF|花名册|教职工名单|名单索引|科学诗|科学故事|科学实验/u.test(`${document.category} ${document.title}`)
      && clean(document.summary));
    const years = selectedQuery.match(/20\d{2}/gu) || [];
    for (const document of documents.filter(document => !years.length || years.some(year => `${document.title} ${document.summary}`.includes(year))).slice(0, 4)) {
      add(document.title, clean(document.summary).slice(0, 2500));
    }
    if (/云宝/u.test(selectedQuery) && !documents.length) {
      const device = site.devices.find(device => /云宝/u.test(device.name));
      if (device && clean(device.description)) add("云宝简介", clean(device.description));
    }
  }

  evidence.sources = Array.from(new Set(evidence.sources));
  evidence.context = sections.join("\n\n").slice(0, 14000);
  evidence.reply = evidence.context || "园所资料库暂未收录符合本轮条件的内容。请补充准确名称或上传资料。";
  return evidence;
}

export async function retrieveSiteResources(query: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const {getSiteData, getFallbackSiteData} = await import("@/lib/site-data");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const site = await Promise.race([
      getSiteData().catch(() => getFallbackSiteData()),
      new Promise<SiteData>(resolve => {timer = setTimeout(() => resolve(getFallbackSiteData()), 1500);}),
    ]);
    signal?.throwIfAborted();
    return siteResourceEvidence(resolveMediaReferences(site), query);
  } finally {
    clearTimeout(timer);
  }
}
