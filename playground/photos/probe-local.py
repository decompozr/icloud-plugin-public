#!/usr/bin/env python3
"""Bounded, aggregate-only inspection of existing local Photos metadata.

Uses private schema, informed by osxphotos/photosdb/photosdb.py; this is not
PhotoKit or a supported Apple API. Never reads image bytes or emits labels,
identifiers, coordinates, blobs, or paths. No face recognition is performed.
"""

import argparse
import json
import re
import sqlite3
import time
from pathlib import Path


class ProbeError(Exception):
    pass


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def inspect(database, limit=10, timeout=2.0):
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 10:
        raise ProbeError("sample limit must be between 1 and 10")
    if not database.is_file():
        raise ProbeError("Photos database unavailable")
    # Do not request SQLite to create a missing WAL shared-memory companion.
    if Path(str(database) + "-wal").exists() and not Path(str(database) + "-shm").exists():
        raise ProbeError("WAL shared-memory companion unavailable; library left untouched")
    deadline = time.monotonic() + timeout
    connection = sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True, timeout=min(timeout, 1.0))
    try:
        connection.execute("PRAGMA query_only=ON")
        connection.set_progress_handler(lambda: int(time.monotonic() >= deadline), 1000)
        connection.execute("BEGIN")
        required = {
            "ZASSET": {"Z_PK", "ZHIDDEN", "ZTRASHEDSTATE", "ZLATITUDE", "ZLONGITUDE"},
            "ZADDITIONALASSETATTRIBUTES": {"Z_PK", "ZASSET", "ZREVERSELOCATIONDATA"},
            "ZPERSON": {"Z_PK", "ZFULLNAME"},
            "ZDETECTEDFACE": set(),
            "ZKEYWORD": {"Z_PK", "ZTITLE"},
            "Z_1KEYWORDS": {"Z_1ASSETATTRIBUTES"},
        }
        schema = {}
        for table, columns in required.items():
            schema[table] = {row[1] for row in connection.execute("PRAGMA table_info(" + quote(table) + ")")}
            if not schema[table] or not columns <= schema[table]:
                raise ProbeError("unsupported Photos schema: " + table)

        def unique(columns, candidates, label):
            matches = columns.intersection(candidates)
            if len(matches) != 1:
                raise ProbeError("unsupported Photos schema: " + label)
            return quote(matches.pop())

        face = schema["ZDETECTEDFACE"]
        asset_fk = unique(face, {"ZASSETFORFACE", "ZASSET"}, "face asset relation")
        person_fk = unique(face, {"ZPERSONFORFACE", "ZPERSON"}, "face person relation")
        keyword_fk = unique(schema["Z_1KEYWORDS"], {
            column for column in schema["Z_1KEYWORDS"] if re.fullmatch(r"Z_\d+KEYWORDS", column)
        }, "keyword relation")
        filters = ""
        for column in ["ZHIDDEN", "ZISINTRASH"]:
            if column in face:
                filters += " AND COALESCE(f." + quote(column) + ",0)=0"
        for column in ["ZCLOUDDELETESTATE", "ZMERGETARGETPERSON"]:
            if column in schema["ZPERSON"]:
                filters += " AND COALESCE(p." + quote(column) + ",0)=0"

        # The snapshot is deliberately a first-PK sample, not a library census.
        assets = connection.execute(
            "SELECT Z_PK FROM ZASSET WHERE ZHIDDEN=0 AND ZTRASHEDSTATE=0 ORDER BY Z_PK LIMIT ?", (limit,)
        ).fetchall()
        counts = {"with_named_people": 0, "with_keywords": 0, "with_valid_gps": 0, "with_cached_place_blob": 0}
        for (asset,) in assets:
            if time.monotonic() >= deadline:
                raise ProbeError("metadata probe deadline exceeded")
            people = connection.execute(
                "SELECT EXISTS(SELECT 1 FROM ZDETECTEDFACE f JOIN ZPERSON p ON p.Z_PK=f." + person_fk +
                " WHERE f." + asset_fk + "=? AND length(trim(p.ZFULLNAME))>0" + filters + ")", (asset,)
            ).fetchone()[0]
            keywords = connection.execute(
                "SELECT EXISTS(SELECT 1 FROM ZADDITIONALASSETATTRIBUTES a JOIN Z_1KEYWORDS j "
                "ON j.Z_1ASSETATTRIBUTES=a.Z_PK JOIN ZKEYWORD k ON k.Z_PK=j." + keyword_fk +
                " WHERE a.ZASSET=? AND length(trim(k.ZTITLE))>0)", (asset,)
            ).fetchone()[0]
            gps = connection.execute(
                "SELECT COALESCE(typeof(ZLATITUDE) IN ('real','integer') AND typeof(ZLONGITUDE) IN ('real','integer') "
                "AND ZLATITUDE BETWEEN -90 AND 90 AND ZLONGITUDE BETWEEN -180 AND 180,0) FROM ZASSET WHERE Z_PK=?", (asset,)
            ).fetchone()[0]
            place = connection.execute(
                "SELECT EXISTS(SELECT 1 FROM ZADDITIONALASSETATTRIBUTES WHERE ZASSET=? "
                "AND typeof(ZREVERSELOCATIONDATA)='blob' AND length(ZREVERSELOCATIONDATA)>0)", (asset,)
            ).fetchone()[0]
            for key, found in zip(counts, [people, keywords, gps, place]):
                counts[key] += int(found)
        return {
            "source": "local Photos SQLite metadata; private schema",
            "read_only": True,
            "sample_limit": limit,
            "sampled_visible_nontrashed_assets": len(assets),
            "selection": "first asset primary keys; not representative or a full-library count",
            "schema_support": {"existing_people_names": True, "keywords": True, "gps": True, "cached_place_blob": True},
            "sample_counts": counts,
            "place_names": "unparsed; blob presence does not establish a readable place name",
            "automatic_scene_labels": "unsupported",
        }
    finally:
        if connection.in_transaction:
            connection.rollback()
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", type=Path, help="explicit .photoslibrary path; otherwise require exactly one in ~/Pictures")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    try:
        library = args.library
        if library is None:
            libraries = [entry for entry in (Path.home() / "Pictures").iterdir() if entry.name.endswith(".photoslibrary") and entry.is_dir()]
            if len(libraries) != 1:
                raise ProbeError("expected exactly one Photos library in Pictures; select --library explicitly")
            library = libraries[0]
        print(json.dumps(inspect(library / "database" / "Photos.sqlite", args.limit), indent=2))
    except ProbeError as error:
        print(json.dumps({"status": "unavailable", "reason": str(error)}))
        return 1
    except (OSError, sqlite3.Error):
        print(json.dumps({"status": "unavailable", "reason": "read-only metadata probe failed or timed out; no private details emitted"}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
