import manifest from "./artwork.json";

export type ArtworkAsset = { id: string; group: string; name: string; file: string; width: number; height: number; transparent: boolean; priority: string; prompt: string };
export const GAME_ARTWORK: ArtworkAsset[] = manifest;
export const ART_BASE = "/assets/science-games/";
export const ART_STYLE = "幼儿科学绘本风，精致二维插画，圆润简洁，柔和体积感，细腻但不过度写实。青绿色、奶油白、天空蓝为主，少量暖黄色与珊瑚红点缀。所有素材保持相同画风、左上方柔和光源、统一描边和材质。不含文字、数字、品牌、水印、UI按钮和手机边框。";
export function artworkPrompt(asset: ArtworkAsset) {
  return `${ART_STYLE}\n${asset.prompt}\n画布：${asset.width} × ${asset.height} 像素。${asset.transparent ? "输出真实透明背景PNG，保留透明通道，不要白底或棋盘格图案。" : "输出完整背景PNG。"}`;
}
