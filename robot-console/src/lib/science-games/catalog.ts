export const AGE_GROUPS = ["小班", "中班", "大班"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];
export const DAILY_POINT_LIMIT = 30;
export const COMPLETION_POINTS = 10;

export const SCIENCE_GAMES = [
  { id: "magnet", title: "磁力打捞", subtitle: "拖动磁铁，把铁制小零件送回收集盘。", topic: "材料与磁力", duration: "约 2 分钟", ages: "小班 · 中班", cover: "magnet-cover", available: true },
  { id: "water", title: "沉浮实验", subtitle: "亲手放进水里，看看谁浮起来。", topic: "水与沉浮", duration: "约 3 分钟", ages: "中班 · 大班", cover: "water-cover", available: true },
  { id: "shadow", title: "影子工坊", subtitle: "移动灯和小球，让影子对准目标。", topic: "光与影子", duration: "约 3 分钟", ages: "中班 · 大班", cover: "shadow-cover", available: true },
  { id: "growth", title: "种子成长记", subtitle: "陪一颗小种子慢慢长大。", topic: "植物与生命", duration: "约 3 分钟", ages: "中班 · 大班", cover: "growth-cover", available: false },
] as const;

export type GameId = (typeof SCIENCE_GAMES)[number]["id"];
