from __future__ import annotations

import os
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SQL_PATH = ROOT / "prisma" / "init.sql"


def resolve_db_path(database_url: str) -> Path:
    if not database_url.startswith("file:"):
        raise ValueError("Only SQLite file: URLs are supported.")

    raw_path = database_url.removeprefix("file:")
    if raw_path.startswith("/"):
        raw_path = raw_path[1:]

    candidate = Path(raw_path)
    if candidate.is_absolute():
        return candidate

    return ROOT / "prisma" / candidate


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "file:./dev.db")
    db_path = resolve_db_path(database_url)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    sql = SQL_PATH.read_text(encoding="utf-8")
    connection = sqlite3.connect(db_path)

    try:
        connection.executescript("PRAGMA foreign_keys = ON;")
        connection.executescript(sql)
        connection.commit()
    finally:
        connection.close()

    print(f"Initialized SQLite schema at {db_path}")


if __name__ == "__main__":
    main()
