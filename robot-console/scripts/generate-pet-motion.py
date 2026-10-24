"""Build transparent, seamless mascot loops from the site's original artwork.

Requires Pillow, numpy and opencv-python. No image generation API is used.
The original sprite sheet is never modified. Run from robot-console.
"""

from pathlib import Path
import json
import math
import zipfile

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/assets/pet-motion-v4"
OUTPUT = ROOT.parents[1] / "output/pet-motion-v4"
SOURCE = ROOT / "public/assets/kexiaobei-lab-spritesheet-v3.png"
SIZE = (240, 260)
FPS = 25
sheet = Image.open(SOURCE).convert("RGBA")
ASSETS.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)
yy, xx = np.mgrid[:208, :192].astype(np.float32)


def crop(col, row):
    return np.array(sheet.crop((col * 192, row * 208, (col + 1) * 192, (row + 1) * 208)))


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normalize(rgba):
    """Keep the cap centered and feet at a common baseline between states."""
    alpha = rgba[:, :, 3]
    rows, cols = np.where(alpha > 160)
    cap = (rgba[:, :, 2] > 95) & (rgba[:, :, 0] < 45) & (yy < 94) & (alpha > 200)
    cap_x = np.where(cap)[1]
    center = (np.percentile(cap_x, 5) + np.percentile(cap_x, 95)) / 2
    scale = 231 / (rows.max() - rows.min())
    transform = np.array([[scale, 0, 120 - center * scale], [0, scale, 247 - rows.max() * scale]], dtype=np.float32)
    result = unpremultiply(cv2.warpAffine(premultiply(rgba), transform, SIZE, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT))
    result[result[:, :, 3] < 5] = 0
    return result


def blink_amount(t, centers):
    # Fast close, slightly slower release; no pause on half-closed eyes.
    amount = 0
    for center in centers:
        delta = t - center
        if -0.07 < delta < 0.13:
            amount = max(amount, float(smooth(-0.07, 0, delta) * (1 - smooth(0.025, 0.13, delta))))
    return amount


def premultiply(rgba):
    result = rgba.astype(np.float32) / 255
    result[:, :, :3] *= result[:, :, 3:4]
    return result


def unpremultiply(rgba):
    result = rgba.copy()
    result[:, :, :3] /= np.maximum(result[:, :, 3:4], 1 / 255)
    return np.uint8(np.clip(result * 255, 0, 255))


def rig_frame(base, phase, duration, state):
    t = phase * duration
    theta = phase * math.tau
    breath = math.sin(theta)
    # Continuous inverse warp: head and hands have independent, soft weights.
    head = 1 - smooth(125, 145, yy)
    torso = smooth(130, 146, yy) * (1 - smooth(165, 184, yy))
    angle = math.radians((0.65 if state == "idle" else 1.25) * math.sin(theta))
    if state == "speaking":
        angle += math.radians(0.45 * math.sin(theta * 3))
    if state == "waiting":
        angle += math.radians(1.4 * (1 - math.cos(theta)) / 2)
    map_x = xx + head * angle * (yy - 132) - (xx - 96) * torso * breath * 0.008
    map_y = yy - head * angle * (xx - 96) + torso * breath * 0.65 + head * breath * 0.48
    hand = np.exp(-(((xx - 139) / 20) ** 2 + ((yy - 150) / 27) ** 2))
    if state in ("speaking", "working", "moving"):
        map_y += hand * math.sin(theta * (2 if state == "speaking" else 1)) * 1.5
    if state == "speaking":
        # Stretch only the original open mouth, with eased syllable rhythm.
        mouth = np.exp(-(((xx - 97) / 8) ** 4 + ((yy - 124) / 8) ** 4))
        syllable = (0.5 + 0.5 * math.sin(theta * 9)) * (0.78 + 0.22 * math.sin(theta * 2))
        map_y += mouth * (yy - 124) * (1.6 * (1 - syllable))
    rendered = cv2.remap(premultiply(base), map_x.astype(np.float32), map_y.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    rendered = unpremultiply(rendered)
    return normalize(rendered)


def make_loop(state, col, row, duration):
    base = crop(col, row)
    closed = crop(2, 0)
    # Original closed eyelids, feathered over the eyes; retain the same face.
    eye_mask = np.zeros((208, 192), np.float32)
    for cx in (78, 115):
        eye_mask += np.exp(-(((xx - cx) / 14) ** 6 + ((yy - 107) / 8) ** 6))
    eye_mask = np.clip(eye_mask, 0, 1)[:, :, None]
    frames = []
    for i in range(round(duration * FPS)):
        phase = i / round(duration * FPS)
        blink = blink_amount(phase * duration, (1.6, duration - 0.5))
        # Close eyes only on the neutral/listening pose, whose face matches
        # the original closed-eye drawing exactly. Other poses keep their art.
        pose = np.uint8(base * (1 - eye_mask * blink) + closed * eye_mask * blink) if row == 0 else base
        frames.append(Image.fromarray(rig_frame(pose, phase, duration, state)))
    return frames


def walking_loop(row):
    keyframes = [normalize(crop(col, row)) for col in range(6)]
    flow_engine = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    h, w = keyframes[0].shape[:2]
    gy, gx = np.mgrid[:h, :w].astype(np.float32)
    frames = []
    for index, first in enumerate(keyframes):
        second = keyframes[(index + 1) % len(keyframes)]
        def gray(frame):
            rgba = frame.astype(np.float32) / 255
            rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + 0.94 * (1 - rgba[:, :, 3:4])
            return cv2.cvtColor(np.uint8(rgb * 255), cv2.COLOR_RGB2GRAY)
        forward = flow_engine.calc(gray(first), gray(second), None)
        backward = flow_engine.calc(gray(second), gray(first), None)
        for step in range(4):
            t = step / 4
            a = cv2.remap(premultiply(first), gx - forward[:, :, 0] * t, gy - forward[:, :, 1] * t, cv2.INTER_LINEAR)
            b = cv2.remap(premultiply(second), gx - backward[:, :, 0] * (1 - t), gy - backward[:, :, 1] * (1 - t), cv2.INTER_LINEAR)
            # Use the nearer warped drawing at limb occlusions. Blending both
            # silhouettes would create translucent duplicate arms and feet.
            frames.append(Image.fromarray(unpremultiply(a if t < 0.5 else b)))
    return frames


def save(state, frames):
    frames[0].save(ASSETS / f"{state}-poster.webp", lossless=True)
    # At 104px on the site, 192px playback is sufficient for retina screens.
    # Quantized alpha removes invisible edge noise without a dark matte.
    playback = []
    for frame in frames:
        rgba = np.array(frame.resize((192, 208), Image.Resampling.LANCZOS))
        rgba[:, :, 3] = np.uint8(np.minimum(255, np.rint(rgba[:, :, 3].astype(float) / 17) * 17))
        rgba[rgba[:, :, 3] == 0] = 0
        playback.append(Image.fromarray(rgba))
    playback[0].save(ASSETS / f"{state}.webp", save_all=True, append_images=playback[1:], duration=40, loop=0, quality=80, method=4)
    # GIF previews have an opaque pale background because GIF only supports
    # one-bit transparency. The website and PNG sequence retain full alpha.
    gif_frames = []
    for frame in frames:
        bg = Image.new("RGBA", frame.size, "#edf5f1")
        bg.alpha_composite(frame)
        gif_frames.append(bg.convert("RGB"))
    gif_frames[0].save(OUTPUT / f"{state}.gif", save_all=True, append_images=gif_frames[1:], duration=40, loop=0, optimize=True)
    with zipfile.ZipFile(OUTPUT / f"{state}-frames.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        from io import BytesIO
        for i, frame in enumerate(frames):
            data = BytesIO()
            frame.save(data, format="PNG")
            archive.writestr(f"{state}/{i:04d}.png", data.getvalue())
    info = {"frames": len(frames), "fps": FPS, "durationMs": len(frames) * 40, "bytes": (ASSETS / f"{state}.webp").stat().st_size}
    print(f"Saved {state}: {info}", flush=True)
    return info


loops = {
    "idle": make_loop("idle", 1, 0, 4.8),
    "waiting": make_loop("waiting", 1, 0, 4.0),
    "working": make_loop("working", 3, 6, 3.2),
    "speaking": make_loop("speaking", 1, 4, 3.2),
    "moving": make_loop("moving", 0, 5, 2.4),
    "running-right": walking_loop(1),
    "running-left": walking_loop(2),
}
manifest = {"version": 4, "source": str(SOURCE.relative_to(ROOT)), "method": "original raster artwork, continuous mesh deformation and optical-flow inbetweens; no AI generation", "size": SIZE, "playbackSize": [192, 208], "states": {state: save(state, frames) for state, frames in loops.items()}}
(ASSETS / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

# A portable comparison page travels with the downloadable assets.
labels = {"idle": "待机 · 自然呼吸与眨眼", "waiting": "倾听 · 轻柔侧头", "working": "思考 · 查看记录板", "speaking": "回答 · 嘴型与点头", "moving": "拖动 · 轻盈摆动", "running-right": "向右走 · 连续补帧", "running-left": "向左走 · 连续补帧"}
cards = "".join(f'<article><div class="stage"><picture><source media="(prefers-reduced-motion: reduce)" srcset="{state}-poster.webp"><img src="{state}.webp" width="240" height="260" alt="{label}"></picture></div><h2>{label}</h2><p>{manifest["states"][state]["frames"]} 帧 · 25 fps</p></article>' for state, label in labels.items())
preview = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>科小贝 · 动态形象预览</title><style>*{{box-sizing:border-box}}body{{margin:0;padding:48px 6vw;background:#f5f7f3;color:#183f3b;font-family:system-ui,sans-serif}}small{{letter-spacing:.18em;color:#6c867b}}h1{{font-size:36px;margin:12px 0}}header p{{color:#6c8176;line-height:1.8}}main{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-top:32px}}article{{background:#fff;border:1px solid #dfe9e1;border-radius:20px;overflow:hidden}}.stage{{display:grid;place-items:center;height:290px;background:radial-gradient(ellipse at center,#e4efe5,transparent 66%)}}img{{display:block;object-fit:contain}}h2{{font-size:16px;margin:0 24px 9px}}article p{{font-size:12px;color:#84958c;margin:0 24px 24px}}@media(max-width:560px){{body{{padding:28px 20px}}h1{{font-size:28px}}}}</style><header><small>GUOKE · KEXIAOBEI</small><h1>熟悉的科小贝，更自然的陪伴。</h1><p>沿用网站原始形象 · 透明 WebP 连续动画 · 25 帧/秒 · 循环首尾连续<br>待机、倾听、思考、回答和移动，各有自己的小动作。</p></header><main>{cards}</main></html>'''
(ASSETS / "preview.html").write_text(preview, encoding="utf-8")
with zipfile.ZipFile(OUTPUT / "科小贝动态素材包-v4.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for file in ASSETS.iterdir():
        archive.write(file, file.name)
print(json.dumps(manifest, ensure_ascii=False, indent=2))
