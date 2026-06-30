import yaml
import os
from pathlib import Path


def load_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def get_config_path(name: str) -> str:
    return str(get_project_root() / "configs" / name)


def resolve_topic(template: str, **kwargs) -> str:
    result = template
    for key, value in kwargs.items():
        result = result.replace(f"{{{key}}}", str(value))
    return result
