import { afterEach, beforeEach, expect, it, vi } from "vitest";
const driver = vi.hoisted(() => ({put: vi.fn()}));
vi.mock("ali-oss", () => ({default: class {put = driver.put;}}));
import { POST } from "./route";

let sequence = 30;
function request(file: File, folder = "poems") {
  const form = new FormData(); form.set("file", file); form.set("folder", folder);
  return new Request("http://localhost/api/science-resources/upload", {method: "POST", body: form, headers: {"x-forwarded-for": `198.51.100.${++sequence}`}});
}
beforeEach(() => {
  driver.put.mockReset(); driver.put.mockResolvedValue({url: "https://private.example/signed-url"});
  vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "oss-id"); vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "oss-secret");
});
afterEach(() => vi.unstubAllEnvs());

it("accepts a material file and stores it privately without any legacy upload token", async () => {
  const response = await POST(request(new File(["风儿轻轻吹"], "风.txt", {type: "text/plain"})));
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({url: expect.stringMatching(/^\/api\/media\/uploads\/science-resources\/poems\//u)});
  expect(driver.put.mock.calls[0][2].headers["x-oss-object-acl"]).toBe("private");
});

it.each(["stories", "supporting", "covers"])("preserves %s material uploads", async folder => {
  const response = await POST(request(new File(["media"], "cover.png", {type: "image/png"}), folder));
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({url: expect.stringContaining(`/uploads/science-resources/${folder}/`)});
});

it("rejects invalid folders and unsupported files before storing", async () => {
  expect((await POST(request(new File(["media"], "cover.png", {type: "image/png"}), "../backups"))).status).toBe(400);
  expect((await POST(request(new File(["page"], "page.html", {type: "text/html"})))).status).toBe(400);
  expect(driver.put).not.toHaveBeenCalled();
});

it("rejects an oversized request before parsing its multipart body", async () => {
  const response = await POST(new Request("http://localhost/api/science-resources/upload", {method: "POST", headers: {"Content-Length": String(101 * 1024 * 1024), "x-forwarded-for": "198.51.100.80"}, body: "not multipart"}));
  expect(response.status).toBe(413);
  expect(driver.put).not.toHaveBeenCalled();
});

it("does not expose credentials when OSS fails", async () => {
  driver.put.mockRejectedValue(new Error("oss-secret"));
  const response = await POST(request(new File(["poem"], "poem.txt", {type: "text/plain"})));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("oss-secret");
});
