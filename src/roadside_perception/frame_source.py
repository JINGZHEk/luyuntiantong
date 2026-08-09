"""Hardware-independent frame sources for the roadside perception pipeline."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable, Iterator, Protocol


class FrameSource(Protocol):
    """An iterable source that yields frames accepted by ``RoadsideAgent``."""

    def __iter__(self) -> Iterator[dict[str, Any]]:
        ...


def _validate_fps(fps: float) -> float:
    value = float(fps)
    if value <= 0:
        raise ValueError("fps must be greater than zero")
    return value


def _frame_payload(
    frame_id: int,
    image: Any,
    clock: Callable[[], float],
    source: str | dict[str, Any],
) -> dict[str, Any]:
    return {
        "frame_id": frame_id,
        "timestamp": int(clock() * 1000),
        "image": image,
        "source": source,
    }


class OpenCVFrameSource:
    """Read a video file or camera index through OpenCV.

    OpenCV is imported lazily so protocol and replay tests can run without the
    algorithm environment. A capture factory can be injected for deterministic
    tests and for future board-specific adapters.
    """

    def __init__(
        self,
        source: str | Path | int,
        fps: float = 10.0,
        capture_factory: Callable[[str | Path | int], Any] | None = None,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.source = source
        self.fps = _validate_fps(fps)
        self._capture_factory = capture_factory
        self._clock = clock
        self._sleep = sleep

    def _open_capture(self) -> Any:
        if self._capture_factory is None and isinstance(self.source, (str, Path)):
            source_path = Path(self.source)
            if not source_path.exists():
                raise FileNotFoundError(f"video source not found: {source_path}")

        if self._capture_factory is not None:
            capture = self._capture_factory(self.source)
        else:
            try:
                import cv2
            except ImportError as exc:
                raise RuntimeError("OpenCV is required for video frame input") from exc
            capture = cv2.VideoCapture(self.source)

        if capture is None or not capture.isOpened():
            raise RuntimeError(f"unable to open video source: {self.source}")
        return capture

    def __iter__(self) -> Iterator[dict[str, Any]]:
        capture = self._open_capture()
        frame_interval = 1.0 / self.fps
        next_deadline = time.monotonic()
        frame_id = 0
        try:
            while True:
                ok, image = capture.read()
                if not ok:
                    break

                input_type = "camera" if isinstance(self.source, int) else "video"
                yield _frame_payload(
                    frame_id,
                    image,
                    self._clock,
                    {
                        "device_type": "pc_replay",
                        "input_type": input_type,
                        "input": str(self.source),
                    },
                )
                frame_id += 1

                next_deadline += frame_interval
                remaining = next_deadline - time.monotonic()
                if remaining > 0:
                    self._sleep(remaining)
        finally:
            capture.release()


class ImageSequenceFrameSource:
    """Read sorted image files without requiring a physical camera."""

    DEFAULT_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    def __init__(
        self,
        root: str | Path,
        fps: float = 10.0,
        image_loader: Callable[[Path], Any] | None = None,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
        suffixes: set[str] | None = None,
    ):
        self.root = Path(root)
        self.fps = _validate_fps(fps)
        self._image_loader = image_loader
        self._clock = clock
        self._sleep = sleep
        self._suffixes = {suffix.lower() for suffix in (suffixes or self.DEFAULT_SUFFIXES)}

    def _load_image(self, path: Path) -> Any:
        if self._image_loader is not None:
            return self._image_loader(path)
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError("OpenCV is required for image sequence input") from exc
        image = cv2.imread(str(path))
        if image is None:
            raise ValueError(f"unable to decode image: {path}")
        return image

    def __iter__(self) -> Iterator[dict[str, Any]]:
        if not self.root.exists() or not self.root.is_dir():
            raise FileNotFoundError(f"image sequence directory not found: {self.root}")

        paths = sorted(
            path for path in self.root.iterdir()
            if path.is_file() and path.suffix.lower() in self._suffixes
        )
        if not paths:
            raise FileNotFoundError(f"no image files found in: {self.root}")

        frame_interval = 1.0 / self.fps
        next_deadline = time.monotonic()
        for frame_id, path in enumerate(paths):
            yield _frame_payload(
                frame_id,
                self._load_image(path),
                self._clock,
                {
                    "device_type": "pc_replay",
                    "input_type": "image_sequence",
                    "input": str(self.root),
                },
            )
            next_deadline += frame_interval
            remaining = next_deadline - time.monotonic()
            if remaining > 0:
                self._sleep(remaining)
