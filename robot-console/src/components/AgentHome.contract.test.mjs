import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/AgentHome.tsx"), "utf8");

test("keeps the home hero title and image label clear at a standard desktop width", () => {
  assert.match(component, /text-4xl[^"`]*md:text-5xl/);
  assert.doesNotMatch(component, /md:text-6xl/);
  assert.match(component, /bg-gradient-to-b from-\[#173b42\]\/85/);
});

test("keeps the public home focused on the 科小贝 agent instead of embedding legacy document browsing", () => {
  assert.doesNotMatch(component, /id="school-documents"/);
  assert.doesNotMatch(component, /href="#school-documents"/);
});
