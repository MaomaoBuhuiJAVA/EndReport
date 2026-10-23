/** Website upload keeps OSS credentials and private-object signing on the server. */
export function uploadScienceMaterial(file: File, folder: "poems" | "stories" | "supporting" | "covers", onProgress: (percentage: number | null) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/science-resources/upload");
    xhr.timeout = 180_000;
    const failed = () => reject(new Error("文件暂时无法上传，请稍后重试"));
    xhr.onerror = failed; xhr.ontimeout = failed; xhr.onabort = failed;
    xhr.upload.onprogress = event => onProgress(event.lengthComputable && event.total > 0 ? Math.min(99, Math.round(event.loaded / event.total * 100)) : null);
    xhr.onload = () => {
      let result: {url?: unknown; error?: unknown};
      try {result = JSON.parse(xhr.responseText);} catch {failed(); return;}
      if (!result || typeof result !== "object" || Array.isArray(result)) {failed(); return;}
      if (xhr.status < 200 || xhr.status >= 300 || typeof result.url !== "string" || !result.url.startsWith("/api/media/uploads/science-resources/")) {
        reject(new Error(typeof result.error === "string" ? result.error : "文件暂时无法上传，请稍后重试")); return;
      }
      onProgress(100); resolve(result.url);
    };
    const form = new FormData(); form.set("file", file); form.set("folder", folder);
    onProgress(0); xhr.send(form);
  });
}
