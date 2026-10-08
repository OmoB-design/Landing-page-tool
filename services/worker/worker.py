"""Job loop entry point: `uv run python worker.py`. Stop with Ctrl+C (or SIGTERM); running jobs
pause at their next progress step and go back to the queue to resume."""

import signal
from types import FrameType

from app.config import get_settings
from app.jobs.runner import Runner
from app.log import configure_logging


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    runner = Runner(settings)

    def stop(_signum: int, _frame: FrameType | None) -> None:
        runner.stop()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    runner.run_forever()


if __name__ == "__main__":
    main()
