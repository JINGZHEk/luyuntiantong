import logging
import sys
from pathlib import Path

try:
    from pythonjsonlogger import jsonlogger
except ImportError:  # Training-only environments do not need structured file logs.
    jsonlogger = None


def setup_logger(name: str, level: str = "INFO", log_dir: str = None) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    if logger.handlers:
        return logger

    fmt = "%(asctime)s %(name)s %(levelname)s %(message)s"

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(logging.Formatter(fmt))
    logger.addHandler(stdout_handler)

    if log_dir:
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_path / f"{name}.log", encoding='utf-8')
        json_formatter = jsonlogger.JsonFormatter(fmt) if jsonlogger else logging.Formatter(fmt)
        file_handler.setFormatter(json_formatter)
        logger.addHandler(file_handler)

    return logger
