import { describe, expect, it } from "vitest";
import { selectTeachingResources, resourceEvidence } from "./resources";
import type { ScienceKnowledgeItem } from "@/lib/science-types";

const fixture = (id:string, title:string, category:string, ageLabel:string, semester:string, topic:string): ScienceKnowledgeItem => ({
  id,baseId:id,title,category,ageLabel,semester,topic,author:"",sourceFile:"教师资料",sourcePage:1,
  allocationBasis:"",tags:[topic],ingestStatus:"ready",duplicateOf:"",knowledgeFile:"",imageCount:2,videoUrl:"",excerpt:topic,body:`${title}真实正文`,resourceTypes:["图片资源","视频资源"],
  resources:[
    {id:`${id}-10`,knowledgeBaseId:id,type:"图片资源",title:"步骤10",publicPath:`/media/${id}/10.png`,externalUrl:"",isPublic:true},
    {id:`${id}-2`,knowledgeBaseId:id,type:"图片资源",title:"步骤2",publicPath:`/media/${id}/2.png`,externalUrl:"",isPublic:true},
    {id:`${id}-v`,knowledgeBaseId:id,type:"视频资源",title:"演示视频",publicPath:"",externalUrl:`https://example.com/${id}.mp4`,isPublic:true},
  ],
} as unknown as ScienceKnowledgeItem);
const items = [fixture("A","会跳舞的纸片","科学实验","中班","中班上册","磁力"),fixture("B","小磁铁","科学诗","小班","小班上册","磁力"),fixture("C","小磁铁","科学诗","小班","小班下册","磁力"),fixture("D","小水滴","科学诗","小班","小班上册","水")];

describe("grounded catalog selection",()=>{
  it("requires a single-character topic to match rather than selecting every poem", () => {
    expect(selectTeachingResources(items, "找小班水的科学诗").map(item => item.id)).toEqual(["D"]);
    expect(selectTeachingResources(items, "找小班风的科学诗")).toEqual([]);
  });
  it("ignores delivery instructions while selecting a poem's actual topic", () => {
    expect(selectTeachingResources(items, "找一首小班关于水的科学诗，返回完整正文").map(item => item.id)).toEqual(["D"]);
  });
  it("keeps the science topic when the request names the school", () => {
    expect(selectTeachingResources(items, "找国科二幼小班水的科学诗全文").map(item => item.id)).toEqual(["D"]);
  });
  it("prefers the authoritative topic over an incidental mention in another poem", () => {
    const frog = {...items[3], id: "E", title: "青蛙的家", topic: "动物与昆虫", tags: ["动物"], excerpt: "小青蛙住在水草里。"};
    expect(selectTeachingResources([frog, ...items], "推荐小班水的科学诗").map(item => item.id)).toEqual(["D"]);
  });
  it("does not mistake a request for video locations for a story topic", () => {
    const story: ScienceKnowledgeItem = {...items[0], category: "科学故事", ageLabel: "大班"};
    expect(selectTeachingResources([story], "给大班推荐一个科学故事，并告诉我配套视频在哪里").map(item => item.id)).toEqual(["A"]);
  });
  it("uses the requested theme rather than the quoted school template title", () => {
    const query = "请按示例“温州市龙湾区国科温州第二幼儿园教育教学活动设计表”生成一份完整教案。主题：《会跳舞的纸片》；班级（适用年龄段）：中班；不附加其他实验链接或推荐资源。";
    expect(selectTeachingResources(items, query).map(item => item.id)).toEqual(["A"]);
  });
  it("applies category, age, semester and topic together",()=>{
    expect(selectTeachingResources(items,"找小班上册磁铁的科学诗").map(x=>x.id)).toEqual(["B"]);
  });
  it("does not invent a match for an unknown topic just because its category matches",()=>{
    expect(selectTeachingResources(items,"推荐科学诗《火星小汽车》")).toEqual([]);
    expect(selectTeachingResources(items,"小班恐龙科学诗")).toEqual([]);
  });
  it("returns only the named experiment and orders all its step images naturally",()=>{
    const found=selectTeachingResources(items,"《会跳舞的纸片》的全部步骤图");
    const evidence=resourceEvidence(found,"《会跳舞的纸片》的全部步骤图");
    expect(found.map(x=>x.id)).toEqual(["A"]);
    expect(evidence.photos.map(x=>x.url)).toEqual(["/media/A/2.png","/media/A/10.png"]);
    expect(evidence.context).not.toContain("小水滴");
  });
  it("does not return step photos when only a video is requested",()=>{
    const evidence=resourceEvidence([items[0]],"《会跳舞的纸片》的视频");
    expect(evidence.photos).toEqual([]);
    expect(evidence.reply).toContain("https://example.com/A.mp4");
    expect(evidence.reply).not.toContain("/media/A/2.png");
  });

  it("does not treat follow-up instruction words as topic evidence", () => {
    const unrelated = {...items[3], excerpt: "材料可以换成小水滴。"};
    expect(selectTeachingResources([items[1], unrelated], "推荐磁铁科学诗\n换成小班上册").map(x => x.id)).toEqual(["B"]);
  });

  it("does not select an item using media belonging to a different resource", () => {
    const wrongMedia = {...items[0], resources: items[3].resources};
    expect(selectTeachingResources([wrongMedia], "《会跳舞的纸片》的步骤图")).toEqual([]);
  });
});
