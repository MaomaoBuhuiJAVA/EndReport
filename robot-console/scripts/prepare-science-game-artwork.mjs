import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(project, "src/lib/science-games/artwork.json"), "utf8"));
const bundleIndex = process.argv.indexOf("--bundle");
const bundle = bundleIndex >= 0 ? path.resolve(process.argv[bundleIndex + 1]) : null;
const docs = path.join(project, "docs/science-games");
const style = "幼儿科学绘本风，精致二维插画，圆润简洁，柔和体积感，细腻但不过度写实。青绿色、奶油白、天空蓝为主，少量暖黄色与珊瑚红点缀。所有素材保持相同画风、左上方柔和光源、统一描边和材质。不含文字、数字、品牌、水印、UI按钮和手机边框。";
const prompt = asset => `${style}\n${asset.prompt}\n画布：${asset.width} × ${asset.height} 像素。${asset.transparent ? "输出真实透明背景PNG，保留透明通道，不要白底或棋盘格图案。" : "输出完整背景PNG。"}`;
const firstBatch = manifest.filter(asset => asset.priority === "首批");
const table = items => ["| 图片名称 | 相对文件路径 | 尺寸 px | 背景 |", "|---|---|---|---|", ...items.map(asset => `| ${asset.name} | \`${asset.file}\` | ${asset.width} × ${asset.height} | ${asset.transparent ? "真实透明" : "完整背景"} |`)].join("\n");
const checklist = `# 科学乐园美术素材清单\n\n首批 ${firstBatch.length} 张，全部 ${manifest.length} 个素材位。第一阶段只需优先生成首批；其他三款游戏仍是后续开发内容。\n\n## 风格要求\n\n${style}\n\n以同一张已确认角色图作为三张科小贝立绘的参考。不要改变角色形象。允许先生成统一风格样张，再用同一参考继续出图。所有图片不画界面文字、按钮、分数和手机外框。\n\n## 首批：首页＋完整磁铁游戏＋榜单\n\n${table(firstBatch)}\n\n## 后续：其他游戏与扩展素材\n\n${table(manifest.filter(asset => asset.priority !== "首批"))}\n\n## 交付方式\n\n- PNG 单图，透明素材需保留 alpha；棋盘格不是透明背景。\n- 按相对路径整理，整体放入网站的 \`public/assets/science-games/\`。\n- 你也可以把图片或压缩包发回来，由开发时检查、压缩与接入。图片有其他名称也能接收，但请尽量保留对应关系。\n- 画面边缘留 12%—15% 安全边距，道具保持统一视角、光线和比例规则。背景预留操作区域，不能把道具画死在背景上。\n- 尺寸为目标画布；生成工具只有邻近尺寸时，保持相近比例，保留完整主体，后续可裁切处理。\n- 封面使用4:3；实验背景6:5；道具/角色1:1。背景按主体区域适配裁切，道具使用完整包含显示。\n- 木块可以直接复用磁铁游戏原图，不必重复生成；光影游戏的剪影由程序从同一物体提取，不另生成。\n- 按钮、导航、音量图标、积分数字、星星粒子、光束、水波和投影由程序制作，不需要提供图片。\n- 本清单是当前约定4款游戏的完整素材基线。新关卡若引入新物体，届时再补充独立道具。\n\n## 现有素材与状态\n\n目前角色占位复用已有科小贝素材；新图尚未生成。新增的高清角色立绘建议以提供的角色参考图进行同角色生成。素材总览地址：\`/games/artwork\`，可查看每张图的提示词与是否已接入。\n`;
const prompts = `# 科学乐园逐图生成提示词\n\n将下面每段分别提交给图像生成工具。角色图必须同时附科小贝参考图。透明背景要求需在生成工具中启用（若该工具有此选项）。\n\n${manifest.map((asset, index) => `## ${String(index + 1).padStart(2,"0")} ${asset.name} · ${asset.priority}\n\n保存路径：\`${asset.file}\`\n\n\`\`\`text\n${prompt(asset)}\n\`\`\``).join("\n\n") }\n`;
await mkdir(docs, { recursive:true });
await writeFile(path.join(docs,"美术素材清单.md"),checklist,"utf8");
await writeFile(path.join(docs,"图片生成提示词.md"),prompts,"utf8");
await mkdir(path.join(project,"public/assets/science-games"),{ recursive:true });
await writeFile(path.join(project,"public/assets/science-games/README.md"),"# 图片放置目录\n\n按 docs/science-games/美术素材清单.md 放入 PNG。未交付素材自动使用程序占位图。\n", "utf8");
for(const group of new Set(manifest.map(asset=>path.dirname(asset.file)))) {
  await mkdir(path.join(project,"public/assets/science-games",group),{recursive:true});
  await writeFile(path.join(project,"public/assets/science-games",group,".gitkeep"),"");
}
if(bundle) {
  await mkdir(bundle,{recursive:true});
  await writeFile(path.join(bundle,"01_美术素材清单.md"),checklist,"utf8");
  await writeFile(path.join(bundle,"02_图片生成提示词.md"),prompts,"utf8");
  await copyFile(path.join(docs,"README.md"),path.join(bundle,"03_框架使用说明.md"));
  await writeFile(path.join(bundle,"artwork-manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
  await mkdir(path.join(bundle,"逐图提示词"),{recursive:true});
  for(const [index,asset] of manifest.entries()) await writeFile(path.join(bundle,"逐图提示词",`${String(index+1).padStart(2,"0")}_${asset.id}.txt`),`${asset.name} · ${asset.priority}\n保存为：${asset.file}\n\n${prompt(asset)}\n`,"utf8");
  for(const group of new Set(manifest.map(asset=>path.dirname(asset.file)))) {
    const dest=path.join(bundle,"图片交付目录",group);
    await mkdir(dest,{recursive:true});
    await writeFile(path.join(dest,"本目录文件说明.txt"),manifest.filter(asset=>path.dirname(asset.file)===group).map(asset=>`${path.basename(asset.file)} | ${asset.name} | ${asset.width}x${asset.height} | ${asset.transparent?"透明PNG":"完整背景PNG"} | ${asset.priority}`).join("\n"),"utf8");
  }
  await mkdir(path.join(bundle,"角色参考"),{recursive:true});
  await copyFile(path.join(project,"public/assets/kexiaobei-auth-idle.webp"),path.join(bundle,"角色参考/科小贝现有形象.webp"));
  await copyFile(path.join(project,"public/assets/pet-motion-v4/idle-poster.webp"),path.join(bundle,"角色参考/科小贝当前网站形象.webp"));
  await copyFile(path.join(project,"public/assets/kexiaobei-lab-spritesheet-v3.png"),path.join(bundle,"角色参考/科小贝现有动作参考.png"));
}
console.log(JSON.stringify({firstBatch:firstBatch.length,total:manifest.length,docs,bundle},null,2));
