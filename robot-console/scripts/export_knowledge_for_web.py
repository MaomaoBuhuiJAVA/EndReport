from __future__ import annotations

import csv
import json
import re
import shutil
from pathlib import Path
from urllib.parse import quote


PROJECT_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = PROJECT_ROOT.parents[1]
KNOWLEDGE_ROOT = WORKSPACE_ROOT / "国科二幼智能体知识库"
OUTPUT_ROOT = PROJECT_ROOT / "public"
DATA_PATH = OUTPUT_ROOT / "data" / "knowledge.json"
ASSET_ROOT = OUTPUT_ROOT / "knowledge"


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as source:
        for line in source:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def public_path(relative_path: str) -> str:
    normalized = relative_path.replace("\\", "/")
    return "/knowledge/" + quote(normalized, safe="/")


def make_excerpt(body: str, limit: int = 150) -> str:
    plain = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", body)
    plain = re.sub(r"[#>*_`\-]+", " ", plain)
    plain = re.sub(r"\s+", " ", plain).strip()
    return plain if len(plain) <= limit else plain[:limit].rstrip() + "…"


def main() -> None:
    knowledge_rows = read_jsonl(KNOWLEDGE_ROOT / "知识库清单.jsonl")
    resource_rows = read_csv(KNOWLEDGE_ROOT / "资源清单.csv")

    resources_by_base_id: dict[str, list[dict]] = {}
    copied_images = 0
    restricted_images = 0

    for row in resource_rows:
        relative_path = row.get("文件路径", "").strip()
        resource_type = row.get("资源类型", "").strip()
        is_context_photo = resource_type == "图片资源" and "活动情境图" in row.get("标题", "")
        is_public = not is_context_photo
        if is_context_photo:
            restricted_images += 1

        if resource_type == "图片资源" and relative_path:
            destination = ASSET_ROOT / relative_path
            if is_public:
                source = KNOWLEDGE_ROOT / relative_path
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                copied_images += 1
            elif destination.exists():
                destination.unlink()

        resource = {
            "id": row.get("资源ID", "").strip(),
            "type": resource_type,
            "knowledgeBaseId": row.get("关联内容ID", "").strip(),
            "semester": row.get("学期", "").strip(),
            "title": row.get("标题", "").strip(),
            "filePath": relative_path,
            "publicPath": public_path(relative_path)
            if resource_type == "图片资源" and relative_path
            else "",
            "externalUrl": row.get("外部链接", "").strip(),
            "source": row.get("来源", "").strip(),
            "isPublic": is_public,
        }
        resources_by_base_id.setdefault(resource["knowledgeBaseId"], []).append(resource)

    output: list[dict] = []
    for row in knowledge_rows:
        item_id = str(row.get("ID", "")).strip()
        base_id = re.sub(r"-(?:P|T)$", "", item_id)
        resources = resources_by_base_id.get(base_id, [])
        category = str(row.get("分类", "")).strip()
        resource_types = sorted(
            {
                resource["type"]
                for resource in resources
                if resource["isPublic"] or resource["type"] != "图片资源"
            }
        )
        if category == "科学实验（教师版）" and "教案资源" not in resource_types:
            resource_types.append("教案资源")

        body = str(row.get("正文", "")).strip()
        output.append(
            {
                "id": item_id,
                "baseId": base_id,
                "semester": str(row.get("学期", "")).strip(),
                "category": category,
                "title": str(row.get("标题", "")).strip(),
                "ageLabel": str(row.get("原始年龄标注", "")).strip(),
                "topic": str(row.get("原始主题", "")).strip(),
                "author": str(row.get("作者或提供者", "")).strip(),
                "sourceFile": str(row.get("来源文件", "")).strip(),
                "sourcePage": str(row.get("来源PDF页", "")).strip(),
                "allocationBasis": str(row.get("学期分配依据", "")).strip(),
                "tags": [tag for tag in str(row.get("标签", "")).split("|") if tag],
                "ingestStatus": str(row.get("向量入库状态", "")).strip(),
                "duplicateOf": str(row.get("重复内容指向", "")).strip(),
                "knowledgeFile": str(row.get("知识文件", "")).strip(),
                "imageCount": int(row.get("图片数量", 0) or 0),
                "videoUrl": str(row.get("视频链接", "")).strip(),
                "excerpt": make_excerpt(body),
                "body": body,
                "resourceTypes": sorted(resource_types),
                "resources": resources,
            }
        )

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "knowledgeItems": len(output),
                "resources": len(resource_rows),
                "imagesCopied": copied_images,
                "restrictedContextImages": restricted_images,
                "output": str(DATA_PATH),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
