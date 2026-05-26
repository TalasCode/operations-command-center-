from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from init_db import resolve_db_path


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "file:./dev.db")
    db_path = resolve_db_path(database_url)
    journal_path = db_path.with_name(f"{db_path.name}-journal")

    if not db_path.exists():
        print(f"No existing database found at {db_path}")
        return

    connection = sqlite3.connect(db_path)

    try:
        connection.executescript("PRAGMA foreign_keys = ON;")
        connection.executescript(
            """
            DELETE FROM audit_logs;
            DELETE FROM review_queue_items;
            DELETE FROM actions;
            DELETE FROM events;
            """
        )
        connection.commit()
    finally:
        connection.close()

    if journal_path.exists():
        try:
            journal_path.unlink()
        except PermissionError:
            pass

    print(f"Cleared application data from {db_path}")


if __name__ == "__main__":
    main()
