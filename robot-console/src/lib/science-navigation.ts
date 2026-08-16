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

export function normalizeScienceSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isAllSelection(value: string) {
  return !value.trim();
}

function matchesSelection(value: string, selection: string) {
  return isAllSelection(selection) || value === selection;
}

function normalizedSelectionValue(value: string) {
  return value.trim();
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
    items.filter((item) => matchesSelection(item.category, category)).map((item) => item.topic),
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
      .filter(
        (item) =>
          matchesSelection(item.category, category) && matchesSelection(item.topic, topic),
      )
      .map((item) => item.ageLabel),
    SCIENCE_AGE_ORDER,
  );
}

export function normalizeScienceSelection(
  items: readonly ScienceNavigationItem[],
  selection: ScienceSelection,
): ScienceSelection {
  const categories = availableTypes(items);
  const requestedCategory = normalizedSelectionValue(selection.category);
  const category = isAllSelection(requestedCategory)
    ? ""
    : categories.includes(requestedCategory)
      ? requestedCategory
      : (categories[0] ?? "");
  const topics = availableTopics(items, category);
  const requestedTopic = normalizedSelectionValue(selection.topic);
  const topic = isAllSelection(requestedTopic)
    ? ""
    : topics.includes(requestedTopic)
      ? requestedTopic
      : (topics[0] ?? "");
  const ages = availableAges(items, category, topic);
  const requestedAgeLabel = normalizedSelectionValue(selection.ageLabel);
  const ageLabel = isAllSelection(requestedAgeLabel)
    ? ""
    : ages.includes(requestedAgeLabel)
      ? requestedAgeLabel
      : (ages[0] ?? "");

  return { category, topic, ageLabel };
}

export function filterScienceItems<T extends ScienceNavigationItem>(
  items: readonly T[],
  { category, topic, ageLabel, query = "" }: ScienceFilter,
) {
  const searchTerms = normalizeScienceSearchText(query).split(" ").filter(Boolean);

  return items.filter((item) => {
    if (
      (!matchesSelection(item.category, category) ||
        !matchesSelection(item.topic, topic) ||
        !matchesSelection(item.ageLabel, ageLabel))
    ) {
      return false;
    }

    if (!searchTerms.length) return true;

    const searchableText = normalizeScienceSearchText(
      [
        item.category,
        item.topic,
        item.ageLabel,
        item.title,
        item.author,
        item.excerpt,
        ...(item.tags ?? []),
      ]
      .filter(Boolean)
      .join(" "),
    );

    return searchTerms.every((term) => searchableText.includes(term));
  });
}
