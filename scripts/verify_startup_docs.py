"""Validate that the startup guide keeps the operational entry points together."""

from __future__ import annotations

import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STARTUP_DOC = PROJECT_ROOT / "启动.md"

REQUIRED_SECTIONS = [
    "## 1. 推荐启动方式：Windows 一键演示",
    "## 2. 浏览器访问入口",
    "## 3. 手动启动：当前端到端 Demo",
    "## 4. 快速验证",
    "## 5. M1 路线：MQTT 三端联动启动",
    "## 6. Docker Compose",
    "## 7. M2 数据集入口：DAIR-V2X mini split",
    "## 8. 前置环境",
    "## 9. 常见问题",
    "## 10. 相关文档",
]

REQUIRED_SNIPPETS = [
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\start_demo.ps1",
    "-BackendPort 8001 -FrontendPort 5173",
    "-Scenario heavy",
    "http://localhost:3000/monitor",
    "http://localhost:3000/replay",
    "http://localhost:3000/evaluation",
    "http://localhost:3000/settings",
    "http://localhost:8000/docs",
    "http://localhost:8000/api/v1/health",
    "http://localhost:8000/api/v1/demo/status",
    "VITE_CLOUD_API_BASE_URL=http://localhost:<BackendPort>/api/v1",
    "python -m uvicorn src.cloud_twin.api:app --host 0.0.0.0 --port 8000",
    "Invoke-WebRequest \"http://localhost:8000/api/v1/demo/start?fps=10&scenario=moderate\" -Method POST",
    "npm run dev -- --host 0.0.0.0 --port 3000",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\verify_all.ps1",
    "python scripts\\verify_external_readiness.py",
    "python scripts\\verify_external_readiness.py --search-root E:\\路云天瞳 --require-real-dair --require-docker --require-broker --require-algorithm",
    "python scripts\\verify_docker_compose_config.py",
    "python scripts\\verify_mqtt_broker_demo.py --frames 80 --fps 10 --verify-fallback",
    "python scripts\\verify_inmemory_mqtt_demo.py --scenario heavy --frames 80 --verify-fallback",
    "scripts\\verify_embedded_mqtt_broker_demo.py --frames 80 --fps 10 --verify-fallback --min-complete-frames 20",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\start_mqtt_demo.ps1",
    "docker compose --profile mqtt-demo up --build",
    "python scripts\\verify_dair_dataset.py --search-root E:\\路云天瞳 --require-real",
    "python scripts\\build_dair_mini_split.py --demo-sample --output data\\mini_split --max-frames 60 --scene-id demo_dair_001",
    "python scripts\\verify_m2_demo_sample.py --frames 60 --horizon 30",
    "python scripts\\verify_algorithm_pipeline.py --work-dir data\\algorithm_validation --frames 60 --horizon 30",
    "conda env create -f environment-algorithm.yml",
    "conda activate v2x-ghost-algorithm",
    "python scripts\\verify_model_readiness.py --require-yolo",
    "python scripts\\verify_model_readiness.py --require-stgnn",
    "scripts\\verify_yolo_image_inference.py --min-detections 1",
    "python scripts\\evaluate_yolo_detection.py --manifest data\\mini_split\\manifest.json --output data\\mini_split\\yolo_detection.json --dry-run --max-frames 20",
    "python scripts\\train_stgnn.py --samples data\\stgnn_training\\samples.jsonl --output models\\occaware_stgnn.ts --epochs 5 --batch-size 16 --dry-run",
    "python scripts\\evaluate_stgnn_checkpoint.py --samples data\\stgnn_training\\samples.jsonl --checkpoint models\\occaware_stgnn.ts --output data\\mini_split\\stgnn_evaluation.json --dry-run",
    "logs\\demo_backend.err.log",
    "docs/END_TO_END_DEMO.md",
]

COVERED_COMMANDS = [
    "scripts\\start_demo.ps1",
    "scripts\\verify_all.ps1",
    "scripts\\verify_external_readiness.py",
    "scripts\\verify_docker_compose_config.py",
    "scripts\\start_mqtt_demo.ps1",
    "scripts\\verify_mqtt_broker_demo.py",
    "scripts\\verify_inmemory_mqtt_demo.py",
    "scripts\\verify_dair_dataset.py",
    "scripts\\verify_m2_demo_sample.py",
    "scripts\\verify_algorithm_pipeline.py",
    "scripts\\verify_model_readiness.py",
    "scripts\\verify_yolo_image_inference.py",
    "scripts\\evaluate_yolo_detection.py",
    "scripts\\train_stgnn.py",
    "scripts\\evaluate_stgnn_checkpoint.py",
]

RELATED_DOCS = [
    "GOAL.md",
    "项目介绍.md",
    "docs/END_TO_END_DEMO.md",
    "docs/API_SPEC.md",
    "docs/ARCHITECTURE.md",
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
    missing_commands = [command for command in COVERED_COMMANDS if command not in content]
    missing_docs = [doc for doc in RELATED_DOCS if doc not in content]

    if missing_sections:
        _fail("Missing startup guide sections: " + ", ".join(missing_sections))
    if missing_snippets:
        _fail("Missing startup guide snippets: " + ", ".join(missing_snippets))
    if missing_commands:
        _fail("Missing startup guide commands: " + ", ".join(missing_commands))
    if missing_docs:
        _fail("Missing related docs: " + ", ".join(missing_docs))

    return {
        "document": STARTUP_DOC.name,
        "required_sections": len(REQUIRED_SECTIONS),
        "required_snippets": len(REQUIRED_SNIPPETS),
        "covered_commands": COVERED_COMMANDS,
        "related_docs": RELATED_DOCS,
    }


def main() -> int:
    summary = verify_startup_doc()
    print(json.dumps(summary, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
