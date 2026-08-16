import type { ScienceResource } from "./science-types";

export type ExperimentImageRole = "material" | "operation" | "video" | "legacy";

const rolePatterns: Array<{ role: ExperimentImageRole; pattern: RegExp; rank: number }> = [
  { role: "material", pattern: /材料准备\s*(\d+)/u, rank: 0 },
  { role: "operation", pattern: /操作(?:步骤)?\s*(\d+)/u, rank: 1 },
  { role: "video", pattern: /视频资源\s*(\d+)/u, rank: Number.MAX_SAFE_INTEGER },
  { role: "legacy", pattern: /图片\s*(\d+)/u, rank: 2 },
];

function roleMatch(resource: ScienceResource) {
  return rolePatterns.find(({ pattern }) => pattern.test(resource.title));
}

export function experimentImageRole(resource: ScienceResource): ExperimentImageRole {
  return roleMatch(resource)?.role ?? "legacy";
}

function imageOrder(resource: ScienceResource) {
  return Number(roleMatch(resource)?.pattern.exec(resource.title)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function imageRank(resource: ScienceResource) {
  return roleMatch(resource)?.rank ?? 2;
}

export function experimentImageCaption(resource: ScienceResource) {
  const match = roleMatch(resource);
  const number = match?.pattern.exec(resource.title)?.[1];

  if (!number) return "实验图片";
  if (match?.role === "material") return `材料准备 ${number}`;
  if (match?.role === "operation") return `操作步骤 ${number}`;
  return `实验图片 ${number}`;
}

export function orderedExperimentImages(resources: ScienceResource[]) {
  return resources
    .map((resource, index) => ({ resource, index }))
    .filter(
      ({ resource }) =>
        resource.type === "图片资源" &&
        resource.isPublic &&
        Boolean(resource.publicPath) &&
        experimentImageRole(resource) !== "video",
    )
    .toSorted((left, right) => {
      const rankDifference = imageRank(left.resource) - imageRank(right.resource);
      if (rankDifference) return rankDifference;
      const orderDifference = imageOrder(left.resource) - imageOrder(right.resource);
      return orderDifference || left.index - right.index;
    })
    .map(({ resource }) => resource);
}
