import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const componentPath = path.resolve("src/components/ScienceLab.tsx");
const stylesPath = path.resolve("app/globals.css");

test("keeps the original lab hero and limits the redesign to the option bar", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /className="lab-hero"/);
  assert.match(component, /lab-hero__photos/);
  assert.match(component, /<RotatingText/);
  assert.doesNotMatch(component, /className="lab-shell lab-intro"/);
  assert.match(component, /label="类型"/);
  assert.match(component, /label="主题"/);
  assert.match(component, /label="年龄段"/);
});

test("uses visual type buttons on mobile and wraps topic choices when needed", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(component, /lab-category-buttons\/poetry\.png/);
  assert.match(component, /lab-category-buttons\/story\.png/);
  assert.match(component, /lab-category-buttons\/experiment\.png/);
  assert.match(component, /compact-filter-row--type/);
  assert.match(component, /compact-filter-row--topic/);
  assert.match(styles, /\.compact-filter-row--topic\s+\.compact-filter-row__choices\s*\{[\s\S]*?flex-wrap:\s*wrap/);
});

test("shows each type name below its mobile illustration", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(component, /compact-filter-choice__label/);
  assert.match(styles, /\.compact-filter-row--type\s+\.compact-filter-choice\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(styles, /\.compact-filter-row--type\s+\.compact-filter-choice__label\s*\{[\s\S]*?display:\s*block/);
});

test("opens the requested resource in the existing detail dialog", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /initialResourceId\?:\s*string/);
  assert.match(component, /initialResourceId[\s\S]*initialItems\.find/);
  assert.match(component, /void openDetail\(summary\)/);
});
