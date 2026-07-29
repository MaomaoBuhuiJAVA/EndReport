export const SCIENCE_TYPE_ORDER = ["科学诗", "科学故事", "科学实验"] as const;
export const SCIENCE_AGE_ORDER = ["托班", "小班", "中班", "大班"] as const;

export type ScienceNavigationItem = {
  category: string;
  topic: string;
  ageLabel: string;
  title: string;
  author?: string;
  excerpt?: string;
  tags?: readonly string[];
};

export type ScienceSelection = {
  category: string;
  topic: string;
  ageLabel: string;
};

export type ScienceFilter = ScienceSelection & { query?: string };

export function scienceDetailHref(id: string) {
  return `/lab?item=${encodeURIComponent(id)}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function orderValues(values: string[], preferredOrder: readonly string[]) {
  return unique(values).sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left);
    const rightIndex = preferredOrder.indexOf(right);

    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right, "zh-CN");
  });
}

export function availableTypes(items: readonly ScienceNavigationItem[]) {
  return orderValues(items.map((item) => item.category), SCIENCE_TYPE_ORDER);
}

export function availableTopics(
  items: readonly ScienceNavigationItem[],
  category: string,
) {
  return orderValues(
    items.filter((item) => item.category === category).map((item) => item.topic),
    [],
  );
}

export function availableAges(
  items: readonly ScienceNavigationItem[],
  category: string,
  topic: string,
) {
  return orderValues(
    items
      .filter((item) => item.category === category && item.topic === topic)
      .map((item) => item.ageLabel),
    SCIENCE_AGE_ORDER,
  );
}

export function normalizeScienceSelection(
  items: readonly ScienceNavigationItem[],
  selection: ScienceSelection,
): ScienceSelection {
  const categories = availableTypes(items);
  const category = categories.includes(selection.category) ? selection.category : (categories[0] ?? "");
  const topics = availableTopics(items, category);
  const topic = topics.includes(selection.topic) ? selection.topic : (topics[0] ?? "");
  const ages = availableAges(items, category, topic);
  const ageLabel = ages.includes(selection.ageLabel) ? selection.ageLabel : (ages[0] ?? "");

  return { category, topic, ageLabel };
}

export function filterScienceItems<T extends ScienceNavigationItem>(
  items: readonly T[],
  { category, topic, ageLabel, query = "" }: ScienceFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");

  return items.filter((item) => {
    if (item.category !== category || item.topic !== topic || item.ageLabel !== ageLabel) {
      return false;
    }

    if (!normalizedQuery) return true;

    return [item.title, item.author, item.topic, item.excerpt, ...(item.tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery);
  });
}
