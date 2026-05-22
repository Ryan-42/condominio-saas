import logging
import os
import sys


def setup_logging() -> None:
    """JSON logging in production, readable plain text in development."""
    env = os.getenv("ENV", "development")
    level = logging.DEBUG if env == "development" else logging.INFO

    if env == "production":
        try:
            from pythonjsonlogger import jsonlogger

            class _Fmt(jsonlogger.JsonFormatter):
                def add_fields(self, log_record, record, message_dict):
                    super().add_fields(log_record, record, message_dict)
                    log_record["service"] = "condosys"
                    log_record["env"] = env
                    log_record["level"] = record.levelname

            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(
                _Fmt("%(asctime)s %(levelname)s %(name)s %(message)s")
            )
            logging.root.setLevel(level)
            logging.root.handlers = [handler]
            return
        except ImportError:
            pass  # fall through to basic config

    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
        stream=sys.stdout,
    )
