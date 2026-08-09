from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.scenario_library.repository import ScenarioRepository
from src.scenario_library.seed_data import SCENARIO_SEEDS, seed_scenario_library


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the SQLite traffic scenario library")
    parser.add_argument("--database", default="data/v2x_cloud.db")
    parser.add_argument("--check", action="store_true", help="validate without changing seed rows")
    args = parser.parse_args()

    repository = ScenarioRepository(str(Path(args.database)))
    if not args.check:
        seed_scenario_library(repository)
    report = repository.validate_library()
    report["seed_count"] = len(SCENARIO_SEEDS)
    report["database"] = repository.db_path
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if not report.get("missing") and not report.get("invalid") else 1


if __name__ == "__main__":
    raise SystemExit(main())
