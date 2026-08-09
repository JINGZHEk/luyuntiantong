import json
import tempfile
import unittest
from pathlib import Path

from src.scenario_library.compiler import ScenarioCompiler
from src.scenario_library.models import (
    ScenarioActor,
    ScenarioDetail,
    ScenarioKeyframe,
    ScenarioSummary,
)
from src.scenario_library.repository import ScenarioRepository
from src.scenario_library.seed_data import seed_scenario_library


class ScenarioCompilerTest(unittest.TestCase):
    def make_repository(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        repository = ScenarioRepository(str(Path(tmp.name) / "scenario.db"))
        seed_scenario_library(repository)
        return repository

    def make_two_keyframe_repository(self):
        class MinimalRepository:
            def get_scenario(self, scenario_id):
                summary = ScenarioSummary(
                    scenario_id=scenario_id,
                    name="test",
                    category="ghost_probe",
                    description="test",
                    duration_ms=1000,
                    default_fps=10.0,
                )
                actors = (
                    ScenarioActor(scenario_id, "ego", None, "ego", "car"),
                    ScenarioActor(scenario_id, "target", 1, "target", "person"),
                )
                frames = (
                    ScenarioKeyframe(scenario_id, "ego", 0, (0, 0), (0, 0), 0, 0, 1, True, "idle"),
                    ScenarioKeyframe(scenario_id, "ego", 1000, (0, 0), (0, 0), 0, 0, 1, True, "idle"),
                    ScenarioKeyframe(scenario_id, "target", 0, (0, 0), (10, 0), 0, 3, 1, False, "hidden"),
                    ScenarioKeyframe(scenario_id, "target", 1000, (10, 0), (10, 0), 0, 2, 1, True, "visible"),
                )
                return ScenarioDetail(summary, actors, frames, ())

        return MinimalRepository()

    def test_compiler_interpolates_position_and_velocity(self):
        compiler = ScenarioCompiler(self.make_two_keyframe_repository())
        frame = compiler.compile_at("TEST", "run-001", 500, 1500, 42)
        target = next(item for item in frame.perception["objects"] if item["track_id"] == 1)
        self.assertAlmostEqual(target["world_pos"][0], 5.0, places=4)
        self.assertEqual(target["occlusion_level"], 2)

    def test_gp07_has_two_pedestrian_tracks(self):
        frame = ScenarioCompiler(self.make_repository()).compile_at("GP-07", "run", 7600, 1000)
        people = [item for item in frame.perception["objects"] if item["class"] == "person"]
        self.assertEqual({item["track_id"] for item in people}, {1, 2})

    def test_gp08_reverses_velocity(self):
        compiler = ScenarioCompiler(self.make_repository())
        before = next(item for item in compiler.compile_at("GP-08", "run", 7600, 1000).perception["objects"] if item["class"] == "person")
        after = next(item for item in compiler.compile_at("GP-08", "run", 9000, 1000).perception["objects"] if item["class"] == "person")
        self.assertLess(before["velocity"][1] * after["velocity"][1], 0.0)

    def test_nm03_has_lateral_lane_change(self):
        frame = ScenarioCompiler(self.make_repository()).compile_at("NM-03", "run", 7200, 1000)
        bicycle = next(item for item in frame.perception["objects"] if item["track_id"] == 2)
        self.assertGreater(abs(bicycle["velocity"][1]), 0.1)

    def test_ic02_ego_heading_changes(self):
        compiler = ScenarioCompiler(self.make_repository())
        first = compiler.compile_at("IC-02", "run", 5000, 1000)
        second = compiler.compile_at("IC-02", "run", 6500, 1000)
        self.assertNotEqual(first.vehicle_status["heading"], second.vehicle_status["heading"])

    def test_same_seed_is_deterministic(self):
        repository = self.make_repository()
        compiler = ScenarioCompiler(repository)
        self.assertEqual(
            compiler.compile_at("GP-01", "run", 6000, 1000, random_seed=7).to_json(),
            compiler.compile_at("GP-01", "run", 6000, 1000, random_seed=7).to_json(),
        )

    def test_invisible_target_is_not_emitted_but_occlusion_three_is(self):
        repository = self.make_two_keyframe_repository()
        compiler = ScenarioCompiler(repository)
        hidden = compiler.compile_at("TEST", "run", 0, 1000)
        self.assertFalse(any(item["track_id"] == 1 for item in hidden.perception["objects"]))
        frame = compiler.compile_at("TEST", "run", 250, 1000)
        target = next(item for item in frame.perception["objects"] if item["track_id"] == 1)
        self.assertEqual(target["occlusion_level"], 2)
        self.assertEqual(target["coordinate_status"], "valid")
        self.assertEqual(target["predicted_traj"], [])


if __name__ == "__main__":
    unittest.main()
