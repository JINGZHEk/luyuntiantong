import tempfile
import unittest
from pathlib import Path

from scripts.run_pc_perception import build_frame_source
from src.roadside_perception.frame_source import ImageSequenceFrameSource


class PcPerceptionEntrypointTest(unittest.TestCase):
    def test_build_frame_source_supports_image_sequence_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "001.jpg").write_bytes(b"test")

            source = build_frame_source(
                {"input": {"type": "image_sequence", "path": str(root), "fps": 5}}
            )

            self.assertIsInstance(source, ImageSequenceFrameSource)

    def test_build_frame_source_rejects_unknown_input_type(self):
        with self.assertRaisesRegex(ValueError, "unsupported input type"):
            build_frame_source({"input": {"type": "serial_camera", "path": "camera"}})


if __name__ == "__main__":
    unittest.main()
