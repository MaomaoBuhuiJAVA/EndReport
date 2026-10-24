import { expect, it } from "vitest";
import type { SiteData } from "@/lib/site-data";
import { siteResourceEvidence } from "./site-resources";

const site: SiteData = {
  profile: {name: "国科二幼", shortName: "国科二幼", slogan: "筑可探之境，润向美童心", summary: "科学探究和审美体验。"},
  rooms: [
    {id: "reading", name: "绘本阅读坊", slug: "reading", summary: "阅读空间", description: "支持故事表达。", assets: [{id: "reading-photo", title: "绘本阅读坊", url: "/rooms/room-08.webp"}]},
    {id: "construction", name: "建构空间坊", slug: "construction", summary: "建构空间", description: "积木探究。", assets: [{id: "blocks-photo", title: "建构空间坊", url: "/rooms/room-04.webp"}]},
  ],
  campusPhotos: [], documents: [], devices: [], logs: [], commands: [],
};

it("returns only photographs belonging to the requested school room", () => {
  const evidence = siteResourceEvidence(site, "找绘本阅读坊的照片");
  expect(evidence.photos.map(photo => photo.url)).toEqual(["/rooms/room-08.webp"]);
  expect(evidence.context).toContain("支持故事表达");
  expect(evidence.reply).not.toContain("建构");
  expect(evidence.sources).toEqual(["绘本阅读坊"]);
});

it("does not replace an unknown room with other room or experiment photos", () => {
  const evidence = siteResourceEvidence(site, "找月球基地功能室照片");
  expect(evidence.photos).toEqual([]);
  expect(evidence.reply).toContain("暂未");
});

it("replaces a previously requested room with a new room in a follow-up", () => {
  const evidence = siteResourceEvidence(site, "找绘本阅读坊的照片\n换成建构空间坊的照片");
  expect(evidence.photos.map(photo => photo.url)).toEqual(["/rooms/room-04.webp"]);
});

it("switches from room photos to school philosophy when the follow-up changes topic", () => {
  const evidence = siteResourceEvidence(site, "找绘本阅读坊的照片\n介绍办园理念");
  expect(evidence.photos).toEqual([]);
  expect(evidence.reply).toContain("筑可探之境，润向美童心");
});

it("does not reuse the previous room when a follow-up names an unknown room", () => {
  const evidence = siteResourceEvidence(site, "找绘本阅读坊的照片\n换成月球基地功能室的照片");
  expect(evidence.photos).toEqual([]);
  expect(evidence.reply).toContain("暂未");
});

it("does not reuse a previous room for a named replacement without the word room", () => {
  const evidence = siteResourceEvidence(site, "找绘本阅读坊的照片\n换成月球基地的照片");
  expect(evidence.photos).toEqual([]);
  expect(evidence.sources).toEqual([]);
});

it("does not partially match an unknown room name to a known alias", () => {
  const evidence = siteResourceEvidence(site, "找月球基地建构功能室照片");
  expect(evidence.photos).toEqual([]);
});

it("does not substitute general school information for unverified award details", () => {
  const evidence = siteResourceEvidence(site, "国科二幼2025年的教师获奖汇总");
  expect(evidence.context).toBe("");
  expect(evidence.reply).toContain("暂未");
  expect(evidence.sources).toEqual([]);
});

it("provides authoritative profile context without private or simulated device status", () => {
  const evidence = siteResourceEvidence({...site, devices: [{id: "private-device", name: "云宝", battery: 86, description: "设备状态"}]}, "介绍国科二幼的办园理念");
  expect(evidence.context).toContain("筑可探之境，润向美童心");
  expect(evidence.context).not.toContain("86");
  expect(evidence.photos).toEqual([]);
});

it("lists the available room photos for a broad request without exposing technical placeholders", () => {
  const evidence = siteResourceEvidence({...site, rooms: site.rooms.map(room => ({...room, summary: "功能室资料等待数据库同步", description: "执行 seed 后写入数据库"}))}, "园所功能室有哪些，给我照片");
  expect(evidence.photos).toHaveLength(2);
  expect(evidence.reply).not.toMatch(/seed|数据库/u);
});
