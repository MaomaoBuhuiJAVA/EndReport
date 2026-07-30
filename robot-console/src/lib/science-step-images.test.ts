import { describe, expect, it } from "vitest";
import { orderedExperimentImages } from "./science-step-images";
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
});
