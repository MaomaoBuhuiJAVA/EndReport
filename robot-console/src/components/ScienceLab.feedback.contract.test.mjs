import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/ScienceLab.tsx"), "utf8");

test("explains why a direct resource link cannot open instead of failing silently", () => {
  assert.match(component, /const \[resourceNotice, setResourceNotice\] = useState\(""\)/);
  assert.match(component, /未找到对应资料，可能已更新或下架/);
  assert.match(component, /role="status"/);
});

test("does not present a missing public video as a playable archived resource", () => {
  assert.doesNotMatch(component, /视频素材已归档/);
  assert.match(component, /暂未提供在线播放链接/);
  assert.match(component, /视频原文件已收录，公开播放地址补充后可在此直接观看/);
});

test("keeps resource-library navigation focused on 科小贝 instead of unrelated legacy sections", () => {
  assert.doesNotMatch(component, /label: "成长照片"/);
  assert.doesNotMatch(component, /label: "功能室"/);
  assert.doesNotMatch(component, /label: "园所资料"/);
});

test("keeps the resource-library title visible instead of leaving an animation gap", () => {
  assert.match(component, /<span className="rotating-text">资源库<\/span>/);
  assert.doesNotMatch(component, /<RotatingText/);
});
