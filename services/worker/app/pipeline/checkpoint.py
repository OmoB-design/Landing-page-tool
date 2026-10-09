"""LangGraph checkpoints in Postgres (D56): one thread per build (`thread_id` = build id), in
the private `langgraph` schema, so a crashed or restarted build resumes after its last
finished node. The schema comes from a migration; the tables from PostgresSaver.setup()."""

from functools import lru_cache
from typing import Any

from langgraph.checkpoint.postgres import PostgresSaver
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings


@lru_cache
def get_checkpointer() -> PostgresSaver:
    settings = get_settings()
    pool: ConnectionPool[Connection[Any]] = ConnectionPool(
        settings.database_url,
        min_size=1,
        max_size=settings.lp_worker_concurrency + 1,
        kwargs={
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
            "options": "-c search_path=langgraph",
        },
        open=True,
    )
    saver = PostgresSaver(pool)
    saver.setup()
    return saver
