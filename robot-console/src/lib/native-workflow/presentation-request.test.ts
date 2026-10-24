import {expect, it} from "vitest";
import {requestedPresentation} from "./presentation-request";

it.each([
  ["制作10页PPT", 10],
  ["制作十页课件", 10],
  ["制作二十一页PPT", 21],
  ["prepare 12 slides", 12],
  ["把10页PPT改成5页", 5],
  ["制作10页PPT，并修改第 3 页标题", 10],
  ["制作10页PPT，其中封面1页、正文8页、总结1页", 10],
  ["制作10页PPT，封面单独一页", 10],
  ["制作10页PPT，其中1页封面、8页正文、1页总结", 10],
  ["制作10页空气观察PPT，正文最多8页，封面1页，总结1页", 10],
  ["制作10页空气观察PPT，正文大概8页，封面1页，总结1页", 10],
  ["制作10页空气观察PPT，正文8-9页", 10],
  ["制作10页空气观察PPT，封面至少1页", 10],
])("recognizes an explicit presentation length: %s", (query, count) => {
  expect(requestedPresentation(query as string)?.slideCount).toBe(count);
});

it.each([
  "修改PPT第12页的标题",
  "PPT最多10页",
  "PPT不少于10页",
  "修改PPT第 12 页的标题",
  "制作8-10页PPT",
  "制作八到十页PPT",
  "制作8页至10页PPT",
  "prepare 8–10 slides",
  "制作10页以内的PPT",
  "制作大约10页PPT",
  "制作10页PPT\n改成最多9页",
  "制作10页PPT\n改成8-9页",
  "把PDF导出PPT，链接https://example.com/10.pdf?page=12",
])("does not mistake page indexes, bounds or source links for an exact presentation length: %s", query => {
  expect(requestedPresentation(query)).toBeUndefined();
});
