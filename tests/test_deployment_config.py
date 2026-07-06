import os
import json
import subprocess
import sys
import tempfile
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

    def test_docker_compose_verifier_checks_mqtt_demo_contract(self):
        verifier = Path("scripts/verify_docker_compose_config.py")
        self.assertTrue(verifier.exists())

        result = subprocess.run(
            [sys.executable, str(verifier)],
            check=True,
            capture_output=True,
            text=True,
        )
        summary = json.loads(result.stdout)

        self.assertEqual(summary["service_count"], 6)
        self.assertEqual(summary["mqtt_demo_services"], ["cloud-agent", "replay-engine", "vehicle-agent"])
        self.assertEqual(summary["frontend"]["port"], "3000:80")
        self.assertEqual(summary["cloud_api"]["port"], "8000:8000")
        self.assertEqual(summary["mqtt"]["host"], "mosquitto")
        self.assertEqual(summary["mqtt"]["port"], "1883")

    def test_ci_and_verify_all_run_docker_compose_verifier(self):
        workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        backend_steps = workflow["jobs"]["backend"]["steps"]
        run_blocks = "\n".join(step.get("run", "") for step in backend_steps)
        verify_all = Path("scripts/verify_all.ps1").read_text(encoding="utf-8")

        self.assertIn("scripts/verify_docker_compose_config.py", run_blocks)
        self.assertIn("scripts\\verify_docker_compose_config.py", verify_all)

    def test_startup_doc_verifier_covers_all_operational_paths(self):
        verifier = Path("scripts/verify_startup_docs.py")
        self.assertTrue(verifier.exists())

        result = subprocess.run(
            [sys.executable, str(verifier)],
            check=True,
            capture_output=True,
            text=True,
        )
        summary = json.loads(result.stdout)

        self.assertEqual(summary["document"], "启动.md")
        self.assertEqual(summary["required_sections"], 10)
        self.assertGreaterEqual(summary["required_snippets"], 30)
        self.assertIn("scripts\\start_demo.ps1", summary["covered_commands"])
        self.assertIn("scripts\\verify_docker_compose_config.py", summary["covered_commands"])
        self.assertIn("docs/END_TO_END_DEMO.md", summary["related_docs"])

    def test_ci_and_verify_all_run_startup_doc_verifier(self):
        workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        backend_steps = workflow["jobs"]["backend"]["steps"]
        run_blocks = "\n".join(step.get("run", "") for step in backend_steps)
        verify_all = Path("scripts/verify_all.ps1").read_text(encoding="utf-8")

        self.assertIn("scripts/verify_startup_docs.py", run_blocks)
        self.assertIn("scripts\\verify_startup_docs.py", verify_all)

    def test_external_readiness_verifier_reports_remaining_environment_gaps(self):
        verifier = Path("scripts/verify_external_readiness.py")
        self.assertTrue(verifier.exists())

        result = subprocess.run(
            [sys.executable, str(verifier), "--search-root", str(Path("data"))],
            check=True,
            capture_output=True,
            text=True,
        )
        summary = json.loads(result.stdout)

        self.assertIn("dair", summary)
        self.assertIn("docker", summary)
        self.assertIn("mqtt_broker", summary)
        self.assertIn("algorithm", summary)
        self.assertIn("next_actions", summary)
        self.assertEqual(summary["dair"]["required"], False)
        self.assertEqual(summary["docker"]["required"], False)
        self.assertEqual(summary["mqtt_broker"]["required"], False)
        self.assertEqual(summary["algorithm"]["required"], False)

    def test_external_readiness_strict_real_dair_requirement_fails_without_dataset(self):
        verifier = Path("scripts/verify_external_readiness.py")
        self.assertTrue(verifier.exists())

        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [
                    sys.executable,
                    str(verifier),
                    "--search-root",
                    tmp,
                    "--require-real-dair",
                ],
                capture_output=True,
                text=True,
            )

        self.assertNotEqual(result.returncode, 0)
        summary = json.loads(result.stdout)
        self.assertEqual(summary["dair"]["ready"], False)
        self.assertIn("real DAIR-V2X", summary["missing_required"])

    def test_ci_and_verify_all_run_external_readiness_verifier(self):
        workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        backend_steps = workflow["jobs"]["backend"]["steps"]
        run_blocks = "\n".join(step.get("run", "") for step in backend_steps)
        verify_all = Path("scripts/verify_all.ps1").read_text(encoding="utf-8")

        self.assertIn("scripts/verify_external_readiness.py", run_blocks)
        self.assertIn("scripts\\verify_external_readiness.py", verify_all)

    def test_m1_acceptance_verifier_reports_three_agent_gates(self):
        verifier = Path("scripts/verify_m1_acceptance.py")
        self.assertTrue(verifier.exists())

        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [
                    sys.executable,
                    str(verifier),
                    "--frames",
                    "80",
                    "--scenario",
                    "heavy",
                    "--db",
                    str(Path(tmp) / "m1.db"),
                ],
                check=True,
                capture_output=True,
                text=True,
            )

        summary = json.loads(result.stdout)
        self.assertEqual(summary["stage"], "M1")
        self.assertTrue(summary["ready"])
        self.assertEqual(summary["checks"]["complete_frames"]["status"], "pass")
        self.assertEqual(summary["checks"]["ghost_probe_event"]["status"], "pass")
        self.assertEqual(summary["checks"]["fallback_recovery"]["status"], "pass")
        self.assertEqual(summary["checks"]["brake_decision"]["status"], "pass")
        self.assertEqual(summary["checks"]["early_warning_lead_time"]["status"], "pass")
        self.assertEqual(summary["checks"]["latency_target"]["status"], "pass")
        self.assertGreater(summary["metrics"]["brake_frame_count"], 0)
        self.assertGreater(summary["metrics"]["max_brake_decel"], 0.0)
        self.assertGreaterEqual(summary["metrics"]["lead_time_seconds"], 1.5)
        self.assertLessEqual(summary["metrics"]["lead_time_seconds"], 3.0)
        self.assertLessEqual(summary["metrics"]["max_e2e_latency_ms"], 100.0)

    def test_ci_and_verify_all_run_m1_acceptance_verifier(self):
        workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        backend_steps = workflow["jobs"]["backend"]["steps"]
        run_blocks = "\n".join(step.get("run", "") for step in backend_steps)
        verify_all = Path("scripts/verify_all.ps1").read_text(encoding="utf-8")

        self.assertIn("scripts/verify_m1_acceptance.py", run_blocks)
        self.assertIn("scripts\\verify_m1_acceptance.py", verify_all)


if __name__ == "__main__":
    unittest.main()
