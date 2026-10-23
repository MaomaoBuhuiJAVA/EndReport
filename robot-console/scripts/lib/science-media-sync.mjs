function uploadedSciencePath(value) {
  if (typeof value !== "string" || !value.startsWith("/api/media/uploads/") || /[?#]/u.test(value)) return undefined;
  try {
    const parts = value.slice("/api/media/".length).split("/").map(decodeURIComponent);
    if (parts.length < 3 || parts.some(part => !part || part === "." || part === ".." || /[\\/%\u0000-\u001f:]/u.test(part))) return undefined;
    if (!["science-stories", "science-experiments", "science-story-covers", "science-resource-covers", "science-resources"].includes(parts[1])) return undefined;
    return `/api/media/${parts.map(encodeURIComponent).join("/")}`;
  } catch {return undefined;}
}

/** Read-only plan: require IDs and register only new science OSS references. */
export function planScienceMediaSync(catalog, itemIds) {
  if (!Array.isArray(itemIds) || !itemIds.length) throw new Error("Explicit item IDs are required; 请指定资料 ID");
  return [...new Set(itemIds)].map(id => {
    const item = catalog.find(candidate => candidate.id === id);
    if (!item?.baseId) throw new Error(`Catalogue item does not exist: ${id}`);
    const resources = (item.resources ?? []).flatMap((resource, index) => {
      const publicPath = uploadedSciencePath(resource.publicPath);
      const externalUrl = uploadedSciencePath(resource.externalUrl);
      if (!publicPath && !externalUrl) return [];
      if (resource.knowledgeBaseId !== item.baseId || !resource.id) throw new Error(`Resource does not belong to ${id}`);
      return [{
        id: resource.id, knowledgeBaseId: item.baseId, resourceType: resource.type,
        semester: resource.semester ?? item.semester ?? "", title: resource.title ?? "",
        filePath: resource.filePath ?? "", source: resource.source ?? "",
        publicPath: publicPath ?? resource.publicPath ?? "", externalUrl: externalUrl ?? resource.externalUrl ?? "",
        isPublic: resource.isPublic === true, sortOrder: index,
      }];
    });
    return {id, baseId: item.baseId, videoUrl: uploadedSciencePath(item.videoUrl), resources};
  });
}

/** Updates only media fields; never deletes rows or replaces teacher content. */
export async function applyScienceMediaSync(client, plans) {
  const active = plans.filter(plan => plan.videoUrl || plan.resources.length);
  return client.$transaction(async tx => {
    // Validate every target before the first write, as well as using a transaction.
    for (const plan of active) {
      const item = await tx.scienceKnowledgeItem.findUnique({where: {id: plan.id}});
      if (!item || item.baseId !== plan.baseId) throw new Error(`Database item missing or belongs to another base: ${plan.id}`);
      for (const resource of plan.resources) {
        const stored = await tx.scienceKnowledgeResource.findUnique({where: {id: resource.id}});
        if (stored && stored.knowledgeBaseId !== plan.baseId) throw new Error(`Resource belongs to another base: ${resource.id}`);
      }
    }
    let resources = 0;
    for (const plan of active) {
      for (const resource of plan.resources) {
        await tx.scienceKnowledgeResource.upsert({where: {id: resource.id}, create: resource,
          // Existing visibility and edited metadata remain authoritative.
          update: {publicPath: resource.publicPath, externalUrl: resource.externalUrl, updatedAt: new Date()},
        });
        resources++;
      }
      const data = {...(plan.videoUrl ? {videoUrl: plan.videoUrl} : {}), updatedAt: new Date()};
      if (plan.resources.some(resource => resource.resourceType === "图片资源")) {
        data.imageCount = await tx.scienceKnowledgeResource.count({where: {knowledgeBaseId: plan.baseId, resourceType: "图片资源", isPublic: true}});
      }
      await tx.scienceKnowledgeItem.update({where: {id: plan.id}, data});
    }
    return {items: active.length, resources};
  }, {maxWait: 10_000, timeout: 120_000});
}
