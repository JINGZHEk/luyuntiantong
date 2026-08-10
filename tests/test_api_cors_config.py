import ast
from pathlib import Path


API_SOURCE = Path(__file__).parents[1] / "src" / "cloud_twin" / "api.py"


def configured_cors_origins() -> set[str]:
    tree = ast.parse(API_SOURCE.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute) or node.func.attr != "add_middleware":
            continue
        if not node.args or not isinstance(node.args[0], ast.Name) or node.args[0].id != "CORSMiddleware":
            continue
        for keyword in node.keywords:
            if keyword.arg != "allow_origins" or not isinstance(keyword.value, ast.List):
                continue
            return {
                element.value
                for element in keyword.value.elts
                if isinstance(element, ast.Constant) and isinstance(element.value, str)
            }
    raise AssertionError("CORSMiddleware allow_origins configuration not found")


def test_loopback_frontend_origins_are_allowed():
    origins = configured_cors_origins()

    assert {"http://localhost:3011", "http://127.0.0.1:3011"} <= origins
