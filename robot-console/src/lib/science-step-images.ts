import type { ScienceResource } from "./science-types";

const imageNumberPattern = /图片\s*(\d+)/u;

function imageOrder(resource: ScienceResource) {
  return Number(resource.title.match(imageNumberPattern)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

export function orderedExperimentImages(resources: ScienceResource[]) {
  return resources
    .map((resource, index) => ({ resource, index }))
    .filter(
      ({ resource }) =>
        resource.type === "图片资源" && resource.isPublic && Boolean(resource.publicPath),
    )
    .toSorted((left, right) => {
      const orderDifference = imageOrder(left.resource) - imageOrder(right.resource);
      return orderDifference || left.index - right.index;
    })
    .map(({ resource }) => resource);
}
