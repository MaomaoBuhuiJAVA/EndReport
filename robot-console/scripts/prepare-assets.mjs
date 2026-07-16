import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();

async function optimizeFolder({ inputDir, outputDir, prefix, max = 80 }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const files = fs
    .readdirSync(inputDir)
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .sort()
    .slice(0, max);

  const manifest = [];

  for (let index = 0; index < files.length; index += 1) {
    const original = files[index];
    const input = path.join(inputDir, original);
    const outputName = `${prefix}-${String(index + 1).padStart(2, "0")}.webp`;
    const output = path.join(outputDir, outputName);
    const metadata = await sharp(input).rotate().metadata();

    await sharp(input)
      .rotate()
      .resize({ width: 1800, height: 1300, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(output);

    manifest.push({
      title: path.parse(original).name,
      src: `/${path.relative(path.join(root, "public"), output).replaceAll("\\", "/")}`,
      original,
      width: metadata.width,
      height: metadata.height,
    });
  }

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

await optimizeFolder({
  inputDir: path.join(root, "images"),
  outputDir: path.join(root, "public", "gallery"),
  prefix: "campus",
  max: 100,
});

await optimizeFolder({
  inputDir: path.join(root, "rooms"),
  outputDir: path.join(root, "public", "rooms"),
  prefix: "room",
  max: 40,
});

console.log("assets prepared");
