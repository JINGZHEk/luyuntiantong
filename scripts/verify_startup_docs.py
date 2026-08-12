"""Validate the current operational startup guide and its live links."""

from __future__ import annotations

import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STARTUP_DOC = PROJECT_ROOT / "启动.md"

REQUIRED_SECTIONS = [
    "## 环境要求",
    "## 一键 Demo",
    "## 手动启动",
    "## PC → Cloud STGNN",
    "## STGNN 数据、训练和评估",
    "## 验证",
    "## 常见问题",
    "## 相关文档",
]

REQUIRED_SNIPPETS = [
    "scripts\\start_demo.ps1",
    "conda env create -f environment-algorithm.yml",
    "conda activate v2x-ghost-algorithm",
    "python scripts\\verify_model_readiness.py --require-yolo",
    "python scripts\\verify_model_readiness.py --require-stgnn",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:8000/health",
    "scripts\\run_pc_cloud_demo.ps1",
    "scripts\\build_stgnn_training_data.py",
    "scripts\\train_stgnn.py",
    "scripts\\evaluate_stgnn_checkpoint.py",
    "--input-steps 20 --future-steps 20",
    "--device auto",
    "scripts\\verify_all.ps1",
    "npm run build",
    "POST /api/v1/model/reload",
]

RELATED_DOCS = [
    "README.md",
    "项目介绍.md",
    "docs/ARCHITECTURE.md",
    "docs/API_SPEC.md",
    "docs/DATA_MODEL.md",
    "docs/STGNN_RUNTIME.md",
    "docs/BOARD_MIGRATION_CHECKLIST.md",
    "docs/ONLINE_DEPLOYMENT.md",
]


def _fail(message: str) -> None:
    raise SystemExit(message)


def _read_doc() -> str:
    if not STARTUP_DOC.exists():
        _fail(f"Missing startup document: {STARTUP_DOC}")
    return STARTUP_DOC.read_text(encoding="utf-8")


def verify_startup_doc() -> dict[str, object]:
    content = _read_doc()
    missing_sections = [section for section in REQUIRED_SECTIONS if section not in content]
    missing_snippets = [snippet for snippet in REQUIRED_SNIPPETS if snippet not in content]
    missing_docs = [doc for doc in RELATED_DOCS if doc not in content]
    missing_files = [doc for doc in RELATED_DOCS if not (PROJECT_ROOT / doc).exists()]

    if missing_sections:
        _fail("Missing startup guide sections: " + ", ".join(missing_sections))
    if missing_snippets:
        _fail("Missing startup guide snippets: " + ", ".join(missing_snippets))
    if missing_docs:
        _fail("Missing related docs: " + ", ".join(missing_docs))
    if missing_files:
        _fail("Missing related files: " + ", ".join(missing_files))

    return {
        "document": STARTUP_DOC.name,
        "required_sections": len(REQUIRED_SECTIONS),
        "required_snippets": len(REQUIRED_SNIPPETS),
        "related_docs": RELATED_DOCS,
    }


def main() -> int:
    print(json.dumps(verify_startup_doc(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
