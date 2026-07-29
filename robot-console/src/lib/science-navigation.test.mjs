import assert from "node:assert/strict";
import test from "node:test";

import {
  availableAges,
  availableTopics,
  filterScienceItems,
  normalizeScienceSelection,
  scienceDetailHref,
} from "./science-navigation.ts";

const items = [
  { id: "poem-wind-young", category: "科学诗", topic: "风", ageLabel: "小班", title: "风爷爷" },
  { id: "poem-light-middle", category: "科学诗", topic: "光影", ageLabel: "中班", title: "影子" },
  { id: "story-light-young", category: "科学故事", topic: "光学现象", ageLabel: "小班", title: "彩虹的秘密" },
];

test("derives topics and ages from the selected type and topic", () => {
  assert.deepEqual(availableTopics(items, "科学诗"), ["风", "光影"]);
  assert.deepEqual(availableAges(items, "科学诗", "风"), ["小班"]);
});

test("resets invalid downstream selections after a type change", () => {
  assert.deepEqual(
    normalizeScienceSelection(items, {
      category: "科学故事",
      topic: "风",
      ageLabel: "中班",
    }),
    { category: "科学故事", topic: "光学现象", ageLabel: "小班" },
  );
});

test("filters by all three navigation levels and the optional text query", () => {
  assert.deepEqual(
    filterScienceItems(items, {
      category: "科学诗",
      topic: "风",
      ageLabel: "小班",
      query: "爷爷",
    }).map((item) => item.id),
    ["poem-wind-young"],
  );
});

test("builds a detail URL that preserves a science item ID", () => {
  assert.equal(
    scienceDetailHref("air-car / 1"),
    "/lab?item=air-car%20%2F%201",
  );
});
