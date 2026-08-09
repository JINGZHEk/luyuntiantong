import tempfile
import unittest
from pathlib import Path

from src.scenario_library.repository import ScenarioRepository
from src.scenario_library.seed_data import SCENARIO_MATRIX, seed_scenario_library


EXPECTED_SCENARIOS = {
    "GP-01", "GP-02", "GP-03", "GP-04", "GP-05", "GP-06", "GP-07", "GP-08",
    "NM-01", "NM-02", "NM-03", "NM-04",
    "IC-01", "IC-02", "IC-03", "IC-04",
}


class ScenarioLibraryTest(unittest.TestCase):
    def make_repository(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        return ScenarioRepository(str(Path(tmp.name) / "scenario.db"))

    def test_seed_is_idempotent_and_complete(self):
        repository = self.make_repository()
        seed_scenario_library(repository)
        seed_scenario_library(repository)

        scenarios = repository.list_scenarios()
        counts = repository.validate_library()

        self.assertEqual({item.scenario_id for item in scenarios}, EXPECTED_SCENARIOS)
        self.assertEqual(counts["templates"], 16)
        self.assertEqual(
            counts["categories"],
            {"ghost_probe": 8, "non_motor": 4, "intersection_conflict": 4},
        )
        self.assertEqual(set(SCENARIO_MATRIX), EXPECTED_SCENARIOS)

    def test_each_scenario_has_ego_target_events_and_keyframes(self):
        repository = self.make_repository()
        seed_scenario_library(repository)

        for summary in repository.list_scenarios():
            detail = repository.get_scenario(summary.scenario_id)
            roles = [actor.role for actor in detail.actors]
            self.assertEqual(roles.count("ego"), 1, summary.scenario_id)
            self.assertGreaterEqual(roles.count("target"), 1, summary.scenario_id)
            self.assertTrue(
                set(roles).intersection({"occluder", "conflict", "background"}),
                summary.scenario_id,
            )
            self.assertGreaterEqual(len(detail.events), 4, summary.scenario_id)
            counts = {}
            for keyframe in detail.keyframes:
                counts[keyframe.actor_id] = counts.get(keyframe.actor_id, 0) + 1
            self.assertTrue(all(count >= 3 for count in counts.values()), summary.scenario_id)

    def test_special_scenario_tracks_are_present(self):
        repository = self.make_repository()
        seed_scenario_library(repository)

        gp07 = repository.get_scenario("GP-07")
        self.assertEqual(
            {actor.track_id for actor in gp07.actors if actor.actor_class == "person"},
            {1, 2},
        )

        nm03 = repository.get_scenario("NM-03")
        self.assertEqual(
            len([actor for actor in nm03.actors if actor.actor_class == "bicycle"]), 3
        )

        ic02 = repository.get_scenario("IC-02")
        ego_headings = [
            frame.heading_deg
            for frame in ic02.keyframes
            if frame.actor_id == "ego"
        ]
        self.assertGreater(len(set(ego_headings)), 1)

    def test_unknown_scenario_is_explicit_error(self):
        repository = self.make_repository()
        with self.assertRaises(KeyError):
            repository.get_scenario("missing")

    def test_run_history_survives_reseeding(self):
        repository = self.make_repository()
        seed_scenario_library(repository)
        created = repository.create_run(
            "run-001", "GP-01", 1000, 10.0, False, 42
        )
        updated = repository.update_run(
            "run-001", "completed", ended_at=2000, current_frame=120
        )
        seed_scenario_library(repository)

        self.assertEqual(created["status"], "running")
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["current_frame"], 120)
        self.assertEqual(repository.get_run("run-001")["scenario_id"], "GP-01")


if __name__ == "__main__":
    unittest.main()
