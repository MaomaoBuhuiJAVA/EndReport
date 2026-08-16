import { describe, expect, it } from "vitest";
import {
  experimentImageCaption,
  experimentImageRole,
  orderedExperimentImages,
} from "./science-step-images";
import type { ScienceResource } from "./science-types";

function image(title: string, publicPath: string): ScienceResource {
  return {
    id: title,
    type: "图片资源",
    knowledgeBaseId: "base-1",
    semester: "小班",
    title,
    filePath: publicPath,
    publicPath,
    externalUrl: "",
    source: publicPath,
    isPublic: true,
  };
}

describe("orderedExperimentImages", () => {
  it("keeps only public images and orders step images by their numeric title", () => {
    const resources = [
      image("河豚 · 图片 10", "/science-assets/experiments/10.png"),
      image("河豚 · 图片 2", "/science-assets/experiments/2.png"),
      {
        ...image("河豚 · 图片 1", "/science-assets/experiments/1.png"),
        isPublic: false,
      },
      image("河豚 · 图片 3", ""),
      image("河豚 · 图片 1", "/science-assets/experiments/1.png"),
      {
        ...image("河豚 · 图片 4", "/science-assets/experiments/4.png"),
        type: "教案资源" as const,
      },
    ];

    expect(orderedExperimentImages(resources)).toEqual([
      image("河豚 · 图片 1", "/science-assets/experiments/1.png"),
      image("河豚 · 图片 2", "/science-assets/experiments/2.png"),
      image("河豚 · 图片 10", "/science-assets/experiments/10.png"),
    ]);
  });

  it("places material images before naturally numbered operation images", () => {
    const resources = [
      image("纸片 · 操作步骤 10", "/science-assets/experiments/10.png"),
      image("纸片 · 操作步骤 2", "/science-assets/experiments/2.png"),
      image("纸片 · 材料准备 1", "/science-assets/experiments/material.png"),
      image("纸片 · 操作步骤 1", "/science-assets/experiments/1.png"),
    ];

    expect(orderedExperimentImages(resources).map((resource) => resource.title)).toEqual([
      "纸片 · 材料准备 1",
      "纸片 · 操作步骤 1",
      "纸片 · 操作步骤 2",
      "纸片 · 操作步骤 10",
    ]);
  });

  it("does not treat a QR image labelled as video resource as a step image", () => {
    const resources = [
      image("纸片 · 视频资源 1", "/science-assets/experiments/qr.png"),
      image("纸片 · 材料准备 1", "/science-assets/experiments/material.png"),
    ];

    expect(orderedExperimentImages(resources).map((resource) => resource.title)).toEqual([
      "纸片 · 材料准备 1",
    ]);
    expect(experimentImageRole(resources[0])).toBe("video");
  });

  it("turns source roles into concise display captions", () => {
    expect(experimentImageCaption(image("纸片 · 材料准备 1", "/material.png"))).toBe("材料准备 1");
    expect(experimentImageCaption(image("纸片 · 操作步骤 10", "/step.png"))).toBe("操作步骤 10");
    expect(experimentImageCaption(image("纸片 · 图片 2", "/legacy.png"))).toBe("实验图片 2");
  });
});
