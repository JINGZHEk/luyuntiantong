import tempfile
import unittest
from pathlib import Path

from src.roadside_perception.frame_source import (
    ImageSequenceFrameSource,
    OpenCVFrameSource,
)


class FakeCapture:
    def __init__(self, frames):
        self.frames = list(frames)
        self.released = False

    def isOpened(self):
        return True

    def read(self):
        if not self.frames:
            return False, None
        return True, self.frames.pop(0)

    def release(self):
        self.released = True


class FrameSourceTest(unittest.TestCase):
    def test_opencv_source_emits_ordered_frames_and_releases_capture(self):
        capture = FakeCapture(["frame-a", "frame-b"])
        source = OpenCVFrameSource(
            source="traffic.mp4",
            fps=10,
            capture_factory=lambda _: capture,
            clock=lambda: 123.456,
            sleep=lambda _: None,
        )

        frames = list(source)

        self.assertEqual([frame["frame_id"] for frame in frames], [0, 1])
        self.assertEqual([frame["image"] for frame in frames], ["frame-a", "frame-b"])
        self.assertEqual([frame["timestamp"] for frame in frames], [123456, 123456])
        self.assertEqual(frames[0]["source"]["input_type"], "video")
        self.assertTrue(capture.released)

    def test_opencv_source_rejects_non_positive_fps(self):
        with self.assertRaisesRegex(ValueError, "fps must be greater than zero"):
            OpenCVFrameSource(source="traffic.mp4", fps=0)

    def test_opencv_source_reports_missing_video_path(self):
        source = OpenCVFrameSource(source="missing-traffic.mp4", fps=10)

        with self.assertRaises(FileNotFoundError):
            next(iter(source))

    def test_image_sequence_source_loads_sorted_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "002.jpg").write_bytes(b"b")
            (root / "001.jpg").write_bytes(b"a")

            source = ImageSequenceFrameSource(
                root,
                fps=5,
                image_loader=lambda path: path.read_bytes().decode("ascii"),
                clock=lambda: 10.0,
                sleep=lambda _: None,
            )

            frames = list(source)

        self.assertEqual([frame["frame_id"] for frame in frames], [0, 1])
        self.assertEqual([frame["image"] for frame in frames], ["a", "b"])
        self.assertTrue(all(frame["timestamp"] == 10000 for frame in frames))
        self.assertEqual(frames[0]["source"]["input_type"], "image_sequence")


if __name__ == "__main__":
    unittest.main()
