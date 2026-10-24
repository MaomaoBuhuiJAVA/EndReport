import { afterEach, expect, it, vi } from "vitest";
import { uploadScienceMaterial } from "./science-upload-client";

afterEach(() => vi.unstubAllGlobals());

it("uploads through the website, reports progress and returns the durable media path", async () => {
  const open = vi.fn(); let form: FormData | undefined;
  vi.stubGlobal("XMLHttpRequest", class {
    status = 201; responseText = JSON.stringify({url: "/api/media/uploads/science-resources/poems/poem.txt"});
    upload: {onprogress?: (event: {lengthComputable: boolean; loaded: number; total: number}) => void} = {};
    onload?: () => void; open = open; timeout = 0;
    send(value: FormData) {form = value; this.upload.onprogress?.({lengthComputable: true, loaded: 5, total: 10}); this.upload.onprogress?.({lengthComputable: true, loaded: 10, total: 10}); this.onload?.();}
  });
  const progress: Array<number | null> = [];
  const result = await uploadScienceMaterial(new File(["poem"], "poem.txt", {type: "text/plain"}), "poems", value => progress.push(value));
  expect(open).toHaveBeenCalledWith("POST", "/api/science-resources/upload");
  expect(form?.get("folder")).toBe("poems");
  expect(form?.get("file")).toBeInstanceOf(File);
  expect(progress).toEqual([0, 50, 99, 100]);
  expect(result).toBe("/api/media/uploads/science-resources/poems/poem.txt");
});

it("rejects failed or invalid responses instead of claiming the upload is saved", async () => {
  vi.stubGlobal("XMLHttpRequest", class {
    status = 503; responseText = JSON.stringify({error: "文件暂时无法保存"}); upload = {}; onload?: () => void;
    open() {} send() {this.onload?.();}
  });
  await expect(uploadScienceMaterial(new File(["poem"], "poem.txt"), "poems", () => {})).rejects.toThrow("文件暂时无法保存");
});
it.each(["null", "[]", "{", JSON.stringify({url: "https://other.example/upload.png"})])("handles a malformed successful response without losing the upload result: %s", async responseText => {
  vi.stubGlobal("XMLHttpRequest", class {
    status = 201; responseText = responseText; upload = {}; onload?: () => void;
    open() {} send() {this.onload?.();}
  });
  await expect(uploadScienceMaterial(new File(["poem"], "poem.txt"), "poems", () => {})).rejects.toThrow("文件暂时无法上传");
});
