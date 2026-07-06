import os
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from src.communication.mqtt_config import apply_mqtt_env_overrides


class DeploymentConfigTest(unittest.TestCase):
    def test_docker_compose_defines_full_demo_stack(self):
        compose = yaml.safe_load(Path("docker-compose.yml").read_text(encoding="utf-8"))
        services = compose["services"]

        for service_name in ("mosquitto", "cloud-api", "frontend", "cloud-agent", "vehicle-agent", "replay-engine"):
            self.assertIn(service_name, services)

        self.assertEqual(services["frontend"]["ports"], ["3000:80"])
        self.assertIn("cloud-api", services["frontend"]["depends_on"])
        self.assertIn("mosquitto", services["cloud-api"]["depends_on"])
        self.assertEqual(services["cloud-agent"]["profiles"], ["mqtt-demo"])
        self.assertEqual(services["vehicle-agent"]["profiles"], ["mqtt-demo"])
        self.assertEqual(services["replay-engine"]["profiles"], ["mqtt-demo"])

    def test_mqtt_config_accepts_environment_overrides(self):
        config = {"broker": {"host": "localhost", "port": 1883, "keepalive": 60}}

        with patch.dict(os.environ, {"MQTT_HOST": "mosquitto", "MQTT_PORT": "1884"}):
            updated = apply_mqtt_env_overrides(config)

        self.assertEqual(updated["broker"]["host"], "mosquitto")
        self.assertEqual(updated["broker"]["port"], 1884)
        self.assertEqual(updated["broker"]["keepalive"], 60)

    def test_ci_runs_m2_demo_sample_verification(self):
        workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        backend_steps = workflow["jobs"]["backend"]["steps"]
        run_blocks = "\n".join(step.get("run", "") for step in backend_steps)

        self.assertIn("scripts/verify_m2_demo_sample.py", run_blocks)
        self.assertIn("--frames 60", run_blocks)
        self.assertIn("--horizon 30", run_blocks)

    def test_ci_runs_model_readiness_diagnostic(self):
        workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        backend_steps = workflow["jobs"]["backend"]["steps"]
        run_blocks = "\n".join(step.get("run", "") for step in backend_steps)

        self.assertIn("scripts/verify_model_readiness.py", run_blocks)

    def test_ci_runs_external_mosquitto_broker_validation(self):
        workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        backend_steps = workflow["jobs"]["backend"]["steps"]
        run_blocks = "\n".join(step.get("run", "") for step in backend_steps)

        self.assertIn("apt-get install -y mosquitto", run_blocks)
        self.assertIn("mosquitto -d", run_blocks)
        self.assertIn("scripts/verify_mqtt_broker_demo.py", run_blocks)
        self.assertIn("--verify-fallback", run_blocks)

    def test_algorithm_workflow_runs_real_yolo_and_stgnn_validation(self):
        workflow_path = Path(".github/workflows/algorithm.yml")
        self.assertTrue(workflow_path.exists())
        workflow = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))
        run_blocks = "\n".join(
            step.get("run", "")
            for job in workflow["jobs"].values()
            for step in job["steps"]
        )

        self.assertIn("workflow_dispatch", workflow["on"])
        self.assertIn("environment-algorithm.yml", run_blocks)
        self.assertIn("scripts/verify_model_readiness.py --require-yolo --require-stgnn", run_blocks)
        self.assertIn("scripts/verify_yolo_image_inference.py --min-detections 1", run_blocks)
        self.assertIn("scripts/verify_algorithm_pipeline.py", run_blocks)
        self.assertIn("--real-stgnn", run_blocks)

    def test_start_demo_passes_backend_url_to_frontend_dev_server(self):
        script = Path("scripts/start_demo.ps1").read_text(encoding="utf-8")

        self.assertIn("$frontendApiBaseUrl = \"$backendUrl/api/v1\"", script)
        self.assertIn("$env:VITE_CLOUD_API_BASE_URL = $frontendApiBaseUrl", script)
        self.assertIn("$previousCloudApiBaseUrl", script)
        self.assertIn("$env:VITE_CLOUD_API_BASE_URL = $previousCloudApiBaseUrl", script)

    def test_gitignore_excludes_runtime_build_and_model_artifacts(self):
        ignored_patterns = set(
            line.strip()
            for line in Path(".gitignore").read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        )

        for pattern in (
            "__pycache__/",
            "logs/",
            "data/",
            "*.db",
            "*.db-wal",
            "frontend/node_modules/",
            "frontend/dist/",
            "frontend/.tmp-tests/",
            "models/",
            "/路云天瞳/",
        ):
            self.assertIn(pattern, ignored_patterns)


if __name__ == "__main__":
    unittest.main()
