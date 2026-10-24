import packaged from "@/data/science-knowledge.json";
import type { ScienceKnowledgeItem, ScienceKnowledgeSummary, ScienceResource } from "@/lib/science-types";
import { resolveMediaReferences } from "@/lib/media-links";

const compact = (s:string) => s.toLowerCase().replace(/[\s，。！？、；：,.!?;:()[\]{}《》〈〉「」“”‘’"'的]/gu, "");
const normalize = (s:string) => compact(s).replace(/磁铁|磁性|磁极|吸铁|铁钉/gu,"磁力");
const intentWords = /龙湾区国科温州第二幼儿园|国科温州第二幼儿园|国科温州二幼|国科二幼|科学诗歌|科学诗|科学故事|科学实验|诗歌|诗|托班|小班|中班|大班|上册|下册|上学期|下学期|全部|所有|完整|步骤图|步骤|配套|相关|对应|图片|照片|视频|二维码|封面|正文|全文|内容|介绍|资源库|媒体库|资料库|库里|库中|资源|资料|推荐|查找|搜索|检索|查看|看看|看一看|适合|关于|有关|帮我|请问|请|给我|想要|里面|哪些|有没有|一首|一个|实验详情|详情|链接|打开|返回|提供|以及|告诉我|说明|在哪里|怎么带幼儿读|朗读建议|朗读节奏|怎么读|带读|本轮要求|刚才|上面|上一条|这个|这份|它们|它的|继续|改成|改为|换成|换为|还有|呢|和|与|及|并|找|给/gu;

export function requestsReadingGuidance(query: string) {
  return /怎么(?:带幼儿)?读|带读|朗读(?:建议|节奏|方法)/u.test(query);
}

/** Hard constraints first, then evidence-bearing title/topic terms. */
export function selectTeachingResources<T extends ScienceKnowledgeSummary>(items:T[], query:string, limit=5):T[] {
  const q = normalize(query);
  const category = /科学诗|诗歌|童谣|诗/u.test(query) ? "科学诗" : /故事/u.test(query) ? "科学故事" : /实验/u.test(query) ? "科学实验" : undefined;
  const age = query.match(/托班|小班|中班|大班/u)?.[0];
  const semester = /上册|上学期/u.test(query) ? "上" : /下册|下学期/u.test(query) ? "下" : undefined;
  const quoted = query.match(/主题[：:]\s*[《〈「“"]([^》〉」”"]+)[》〉」”"]/u)?.[1]
    || query.match(/[《〈「“"]([^》〉」”"]+)[》〉」”"]/u)?.[1];
  const named = quoted ? normalize(quoted) : items.map(x=>normalize(x.title)).filter(t=>t.length>1&&q.includes(t)).sort((a,b)=>b.length-a.length)[0];
  const topic = normalize(query.replace(intentWords,""));
  const grams = topic.length >= 2 ? Array.from({length:topic.length-1},(_,i)=>topic.slice(i,i+2)) : [];
  const candidates = items.map((item,index)=>{
    if (category && item.category!==category || age && item.ageLabel!==age || semester && !item.semester.includes(semester)) return null;
    if (named && !normalize(item.title).includes(named)) return null;
    const searchable = normalize([item.title,item.topic,...item.tags,item.excerpt].join(" "));
    const relevance = !topic || named ? 1 : searchable.includes(topic) ? 100 : grams.filter(g=>searchable.includes(g)).length;
    if (!relevance) return null;
    const resources = publicResources(item);
    if (/视频|二维码/u.test(query) && !/^https:\/\//u.test(item.videoUrl || "") && !resources.some(r=>r.type==="视频资源")) return null;
    if (/步骤图|图片|照片/u.test(query) && !resources.some(r=>r.type==="图片资源")) return null;
    return {item,index,exactTopic: Boolean(!named && topic && normalize(item.topic) === topic),score:(named&&normalize(item.title)===named?2000:0)+relevance*20};
  }).filter((x):x is {item:T;index:number;exactTopic:boolean;score:number}=>x!==null);
  const exactTopics = candidates.filter(candidate => candidate.exactTopic);
  return (exactTopics.length ? exactTopics : candidates).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,Math.max(0,limit)).map(x=>x.item);
}

function resourceUrl(resource:ScienceResource) {
  const raw = (resource.externalUrl || resource.publicPath).trim();
  if (/^http:\/\/p1\.qr105\.cn\//u.test(raw)) return raw.replace(/^http:/u,"https:");
  return /^https:\/\//u.test(raw) || /^\/(?!\/)/u.test(raw) ? raw : "";
}
function publicResources(item: ScienceKnowledgeSummary) {
  return item.resources.filter(r => r.isPublic && r.knowledgeBaseId === item.baseId && resourceUrl(r));
}
function safeLabel(s:string) { return s.replace(/[\[\]\r\n]/gu," ").trim(); }

export function resourceEvidence(items:ScienceKnowledgeSummary[], query:string) {
  const wantImages = /图片|照片|步骤图|配图|封面/u.test(query);
  const wantVideos = /视频|二维码/u.test(query);
  const allSteps = /全部|所有|完整.*步骤/u.test(query);
  const photos:Array<{id:string;title:string;url:string;description:string}> = [];
  const sources:string[] = [], labLinks:Array<{id:string;title:string;href:string}> = [];
  const context:string[] = [], reply:string[] = [];
  for (const item of items) {
    const resources = publicResources(item)
      .sort((a,b)=>a.title.localeCompare(b.title,"zh-CN",{numeric:true}));
    const media=resources.filter(r=>wantImages&&r.type==="图片资源" || wantVideos&&r.type==="视频资源").slice(0,allSteps?40:3);
    const href=`/lab?item=${encodeURIComponent(item.id)}`;
    labLinks.push({id:item.id,title:item.title,href}); sources.push(item.title);
    photos.push(...media.filter(r=>r.type==="图片资源").map(r=>({id:r.id,title:r.title,url:resourceUrl(r),description:`${item.title} · ${r.title}`})));
    const body = "body" in item && typeof item.body==="string" ? item.body : item.excerpt;
    context.push(`[LAB:${item.id}] 《${item.title}》\n类别：${item.category}；年龄：${item.ageLabel}；学期：${item.semester}；主题：${item.topic}\n${resources.map(r=>`[RESOURCE:${r.id}] ${r.type} ${r.title}：${resourceUrl(r)}`).join("\n")}\n正文：\n${body.slice(0,7000)}`);
    const content = item.category==="科学诗" && (/正文|全文|内容/u.test(query) || requestsReadingGuidance(query)) ? body : item.excerpt;
    reply.push(`### ${safeLabel(item.title)}\n${item.ageLabel} · ${item.semester} · ${item.category}\n\n${content}\n\n[打开资源详情](${href})${media.map(r=>`\n- ${r.type}：[${safeLabel(r.title)}](${resourceUrl(r)})`).join("")}`);
    if(wantVideos && !media.some(r=>r.type==="视频资源") && item.videoUrl && /^https:\/\//u.test(item.videoUrl)) reply[reply.length-1]+=`\n- [视频](${item.videoUrl})`;
  }
  return {items, context:context.join("\n\n").slice(0,20000), sources,labLinks,photos,reply:reply.join("\n\n") || "资料库暂未收录符合这些条件的内容。可以补充标题、年龄段或主题再找找。"};
}

async function within<T>(promise:Promise<T>, fallback:T, milliseconds:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout> | undefined;
  try{return await Promise.race([promise.catch(()=>fallback), new Promise<T>(resolve=>{timer=setTimeout(()=>resolve(fallback),milliseconds);})]);}
  finally{clearTimeout(timer);}
}

export async function retrieveTeachingResources(query:string,{catalog,signal,resourceIds}:{catalog?:ScienceKnowledgeItem[];signal?:AbortSignal;resourceIds?:string[]}={}) {
  signal?.throwIfAborted();
  const fallback=resolveMediaReferences(packaged as unknown as ScienceKnowledgeItem[]);
  const data=await import("@/lib/science-data");
  const summaries=catalog ?? await within(data.getScienceKnowledgeSummaries(),fallback,1500);
  const candidates = resourceIds?.length ? summaries.filter(item => resourceIds.includes(item.id)) : summaries;
  const matches=selectTeachingResources(candidates,query,/一个|一首|一篇|一项/u.test(query) ? 1 : 5);
  const items=await Promise.all(matches.map(async summary=>{
    if (catalog) return summary;
    const local=fallback.find(x=>x.id===summary.id);
    return await within(data.getScienceKnowledgeItem(summary.id),local?{...local,...summary,body:local.body}:summary,1200) ?? summary;
  }));
  signal?.throwIfAborted();
  return resourceEvidence(items,query);
}
