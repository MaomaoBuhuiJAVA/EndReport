import assert from "node:assert/strict";
import test from "node:test";

import {
  availableAges,
  availableTopics,
  filterScienceItems,
  normalizeScienceSelection,
  normalizeScienceSearchText,
  scienceDetailHref,
} from "./science-navigation.ts";

const items = [
  { id: "poem-wind-young", category: "科学诗", topic: "风", ageLabel: "小班", title: "风爷爷" },
  { id: "poem-light-middle", category: "科学诗", topic: "光影", ageLabel: "中班", title: "影子" },
  {
    id: "story-light-young",
    category: "科学故事",
    topic: "光学现象",
    ageLabel: "小班",
    title: "彩虹的秘密",
    tags: ["水滴", "折射"],
  },
  {
    id: "experiment-water-young",
    category: "科学实验",
    topic: "水与液体",
    ageLabel: "小班",
    title: "水上烟花",
  },
];

test("derives topics and ages from the selected type and topic", () => {
  assert.deepEqual(availableTopics(items, "科学诗"), ["风", "光影"]);
  assert.deepEqual(availableAges(items, "科学诗", "风"), ["小班"]);
});

test("treats empty dependent selections as all values", () => {
  assert.deepEqual(availableTopics(items, ""), ["风", "光学现象", "光影", "水与液体"]);
  assert.deepEqual(availableAges(items, "", ""), ["小班", "中班"]);
  assert.deepEqual(availableAges(items, "科学诗", ""), ["小班", "中班"]);
});

test("preserves empty selections while still resetting invalid non-empty dependencies", () => {
  assert.deepEqual(
    normalizeScienceSelection(items, { category: "", topic: "", ageLabel: "" }),
    { category: "", topic: "", ageLabel: "" },
  );
  assert.deepEqual(
    normalizeScienceSelection(items, { category: "科学诗", topic: "", ageLabel: "" }),
    { category: "科学诗", topic: "", ageLabel: "" },
  );
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

test("uses empty navigation values as wildcards", () => {
  assert.deepEqual(
    filterScienceItems(items, { category: "", topic: "", ageLabel: "" }).map((item) => item.id),
    ["poem-wind-young", "poem-light-middle", "story-light-young", "experiment-water-young"],
  );
  assert.deepEqual(
    filterScienceItems(items, { category: "科学诗", topic: "", ageLabel: "" }).map((item) => item.id),
    ["poem-wind-young", "poem-light-middle"],
  );
});

test("keeps navigation selections while searching normalized text", () => {
  assert.deepEqual(
    filterScienceItems(items, {
      category: "科学故事",
      topic: "光学现象",
      ageLabel: "小班",
      query: "水， 折射",
    }).map((item) => item.id),
    ["story-light-young"],
  );
  assert.deepEqual(
    filterScienceItems(items, {
      category: "科学故事",
      topic: "光学现象",
      ageLabel: "小班",
      query: "风， 爷爷",
    }).map((item) => item.id),
    [],
  );
});

test("matches tags after Chinese whitespace and punctuation normalization", () => {
  assert.deepEqual(
    filterScienceItems(items, {
      category: "科学故事",
      topic: "光学现象",
      ageLabel: "小班",
      query: "水， 折射",
    }).map((item) => item.id),
    ["story-light-young"],
  );
  assert.equal(normalizeScienceSearchText("  水，会跳舞！\n"), "水 会跳舞");
});

test("matches compact Chinese combinations of age, topic, and resource type", () => {
  assert.deepEqual(
    filterScienceItems(items, {
      category: "",
      topic: "",
      ageLabel: "",
      query: "小班水实验",
    }).map((item) => item.id),
    ["experiment-water-young"],
  );
  assert.deepEqual(
    filterScienceItems(items, {
      category: "",
      topic: "",
      ageLabel: "",
      query: "科学实验小班水与液体",
    }).map((item) => item.id),
    ["experiment-water-young"],
  );
  assert.deepEqual(
    filterScienceItems(items, {
      category: "",
      topic: "",
      ageLabel: "",
      query: "小班光学故事",
    }).map((item) => item.id),
    ["story-light-young"],
  );
});

test("builds a detail URL that preserves a science item ID", () => {
  assert.equal(
    scienceDetailHref("air-car / 1"),
    "/lab?item=air-car%20%2F%201",
  );
});
