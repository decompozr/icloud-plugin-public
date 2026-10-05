"""Synthetic SQLite acceptance for the aggregate-only probe; no real library."""
import contextlib
import hashlib
import runpy
import sqlite3
import tempfile
import unittest
from pathlib import Path

probe = runpy.run_path(str(Path(__file__).with_name("probe-local.py")))


@contextlib.contextmanager
def fixture():
    with tempfile.TemporaryDirectory(prefix="photos-probe-test-") as directory:
        path = Path(directory) / "Photos.sqlite"
        db = sqlite3.connect(path)
        db.executescript("""
            CREATE TABLE ZASSET (Z_PK INTEGER PRIMARY KEY, ZHIDDEN, ZTRASHEDSTATE, ZLATITUDE, ZLONGITUDE);
            CREATE TABLE ZADDITIONALASSETATTRIBUTES (Z_PK INTEGER PRIMARY KEY, ZASSET, ZREVERSELOCATIONDATA);
            CREATE TABLE ZDETECTEDFACE (ZASSETFORFACE, ZPERSONFORFACE, ZHIDDEN, ZISINTRASH);
            CREATE TABLE ZPERSON (Z_PK INTEGER PRIMARY KEY, ZFULLNAME, ZCLOUDDELETESTATE, ZMERGETARGETPERSON);
            CREATE TABLE ZKEYWORD (Z_PK INTEGER PRIMARY KEY, ZTITLE);
            CREATE TABLE Z_1KEYWORDS (Z_1ASSETATTRIBUTES, Z_53KEYWORDS);
            INSERT INTO ZASSET VALUES (1,0,0,0,0),(2,0,0,-180,-180),(3,1,0,10,20),(4,0,1,10,20),(5,0,0,NULL,NULL);
            INSERT INTO ZADDITIONALASSETATTRIBUTES VALUES (101,1,X'0102'),(102,2,NULL),(105,5,'not a blob');
            INSERT INTO ZPERSON VALUES (201,'Secret Person',0,NULL),(202,'Deleted Person',1,NULL),(203,'Merged Person',0,201);
            INSERT INTO ZDETECTEDFACE VALUES (1,201,0,0),(1,201,0,0),(2,201,1,0),(2,201,0,1),(2,202,0,0),(2,203,0,0);
            INSERT INTO ZKEYWORD VALUES (301,'Secret Keyword');
            INSERT INTO Z_1KEYWORDS VALUES (101,301),(101,301);
        """)
        db.commit()
        db.close()
        yield path


class ProbeTests(unittest.TestCase):
    def test_counts_are_scoped_deduplicated_and_do_not_emit_values_or_write(self):
        with fixture() as path:
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            files = set(path.parent.iterdir())
            result = probe["inspect"](path)
            self.assertEqual(result["sampled_visible_nontrashed_assets"], 3)
            self.assertEqual(result["sample_counts"], {"with_named_people": 1, "with_keywords": 1, "with_valid_gps": 1, "with_cached_place_blob": 1})
            self.assertNotIn("Secret", str(result))
            self.assertNotIn(str(path), str(result))
            self.assertEqual(before, hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(files, set(path.parent.iterdir()))

    def test_sample_limit_and_schema_failure(self):
        with fixture() as path:
            self.assertEqual(probe["inspect"](path, 1)["sampled_visible_nontrashed_assets"], 1)
            for limit in [0, 11, True]:
                with self.assertRaises(probe["ProbeError"]):
                    probe["inspect"](path, limit)
            with sqlite3.connect(path) as db:
                db.execute("ALTER TABLE Z_1KEYWORDS ADD COLUMN Z_99KEYWORDS")
            with self.assertRaisesRegex(probe["ProbeError"], "keyword relation"):
                probe["inspect"](path)

    def test_missing_wal_companion_fails_without_creating_files(self):
        with fixture() as path:
            Path(str(path) + "-wal").touch()
            before = set(path.parent.iterdir())
            with self.assertRaisesRegex(probe["ProbeError"], "WAL"):
                probe["inspect"](path)
            self.assertEqual(before, set(path.parent.iterdir()))

    def test_deadline_fails_explicitly(self):
        with fixture() as path:
            with self.assertRaises((probe["ProbeError"], sqlite3.OperationalError)):
                probe["inspect"](path, timeout=0)


if __name__ == "__main__":
    unittest.main()
