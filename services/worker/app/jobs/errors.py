"""Errors raised by job handlers."""


class UserFacingError(Exception):
    """A failure the user should see as-is (BUILD_SPEC §6.1). The job fails without a retry."""

    def __init__(self, message: str, code: str = "user_error") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class JobInterrupted(Exception):
    """The worker is shutting down; the job is released back to the queue to resume later."""
