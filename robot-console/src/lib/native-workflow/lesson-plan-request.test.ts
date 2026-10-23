import {describe, expect, it} from "vitest";
import {requestedLessonPlanDocument} from "./lesson-plan-request";

const draft = "## 活动目标\n观察空气。\n## 活动准备\n气球。\n## 活动内容\n先猜想再操作。";
describe("lesson form export request", () => {
  it("takes the latest confirmed theme, age and duration on a follow-up", () => {
    expect(requestedLessonPlanDocument("设计大班《纸片》教案，30分钟\n改成中班《空气》，20分钟，导出Word", draft, "教案")).toEqual({
      title: "空气", ageGroup: "中班", duration: "20分钟",
    });
  });
  it("reads explicit dialog fields without choosing the reference form title as the lesson topic", () => {
    expect(requestedLessonPlanDocument("按《教学活动设计表》生成完整教案；主题：《纸片》；班级（适用年龄段）：小班；活动时长：15分钟", draft, "教案")).toEqual({
      title: "纸片", ageGroup: "小班", duration: "15分钟",
    });
  });
  it("does not treat a parent notice based on a lesson as a lesson form", () => {
    expect(requestedLessonPlanDocument("根据这份教案生成家长通知Word", draft, "通知")).toBeUndefined();
    expect(requestedLessonPlanDocument("提取教案的正文导出Word", draft, "正文")).toBeUndefined();
    expect(requestedLessonPlanDocument("生成空气教案Word", "# 只有概述\n空气在哪里", "空气")).toBeUndefined();
  });
  it("does not let historical explicit fields override newer ordinary instructions", () => {
    expect(requestedLessonPlanDocument("生成教案；主题：磁铁；班级：小四班；活动时长：\n换成《空气》并改为中班，15分钟，导出Word", draft, "教案")).toEqual({
      title: "空气", ageGroup: "中班", duration: "15分钟",
    });
  });
});
