import json
import os
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.validate_checkpoint import (
    CheckpointValidationError,
    safe_extract,
    validate_archive,
)


PREFIX = "StickLaughStudio"
CORE_FILES = {
    "package.json": b'{"name":"fixture","version":"1.0.0","engines":{"node":">=22"}}',
    "package-lock.json": b'{"lockfileVersion":3}',
    ".env": b"PRIVATE_TEST_VALUE=not-printed\n",
    "shared/schema.mjs": b"export const schema = true;\n",
}


def write_zip(path: Path, files=None):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, body in (files or CORE_FILES).items():
            archive.writestr(f"{PREFIX}/{name}", body)


class ValidateCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.archive = self.root / "fixture.zip"
        write_zip(self.archive)

    def tearDown(self):
        self.temp.cleanup()

    def test_validates_crc_sources_engine_and_env_byte_equality(self):
        original = self.root / "original.env"
        original.write_bytes(CORE_FILES[".env"])

        report = validate_archive(
            self.archive,
            project_prefix=PREFIX,
            required_paths=("package.json", "package-lock.json", "shared/schema.mjs"),
            original_env=original,
        )

        self.assertTrue(report["crc_ok"])
        self.assertEqual(report["node_engine"], ">=22")
        self.assertEqual(report["member_count"], len(CORE_FILES))
        self.assertTrue(report["environment_byte_equal_to_original"])
        self.assertNotIn("PRIVATE_TEST_VALUE", json.dumps(report))

    def test_rejects_environment_mismatch(self):
        original = self.root / "different.env"
        original.write_bytes(b"NOT_THE_ARCHIVED_ENV=1\n")
        report = validate_archive(
            self.archive,
            project_prefix=PREFIX,
            required_paths=(),
            original_env=original,
        )
        self.assertFalse(report["environment_byte_equal_to_original"])

    def test_safe_extract_preserves_files_without_overwrite(self):
        target = self.root / "extracted"
        safe_extract(self.archive, target)
        self.assertEqual(
            (target / PREFIX / ".env").read_bytes(),
            CORE_FILES[".env"],
        )
        with self.assertRaises(CheckpointValidationError):
            safe_extract(self.archive, target)

    def test_rejects_traversal_before_creating_destination(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("../outside.txt", b"escape")
        destination = self.root / "bad-extract"
        with self.assertRaises(CheckpointValidationError):
            safe_extract(self.archive, destination)
        self.assertFalse(destination.exists())
        self.assertFalse((self.root.parent / "outside.txt").exists())

    def test_rejects_absolute_and_windows_paths(self):
        for bad_name in ("/rooted.txt", r"StickLaughStudio\evil.txt", "C:/evil.txt"):
            with self.subTest(name=bad_name):
                with zipfile.ZipFile(self.archive, "w") as archive:
                    archive.writestr(bad_name, b"bad")
                with self.assertRaises(CheckpointValidationError):
                    validate_archive(
                        self.archive, project_prefix="", required_paths=()
                    )

    def test_rejects_symlinks(self):
        info = zipfile.ZipInfo(f"{PREFIX}/link")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr(info, "target")
        with self.assertRaisesRegex(CheckpointValidationError, "symlinks"):
            validate_archive(self.archive, required_paths=())

    def test_rejects_case_collisions_and_file_directory_collisions(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("StickLaughStudio/A.txt", b"a")
            archive.writestr("sticklaughstudio/a.TXT", b"b")
        with self.assertRaisesRegex(CheckpointValidationError, "duplicate"):
            validate_archive(self.archive, required_paths=())

        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("StickLaughStudio/node", b"file")
            archive.writestr("StickLaughStudio/node/child", b"child")
        with self.assertRaisesRegex(CheckpointValidationError, "directory"):
            validate_archive(self.archive, required_paths=())

        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("StickLaughStudio/Node", b"file")
            archive.writestr("sticklaughstudio/node/child", b"child")
        with self.assertRaisesRegex(CheckpointValidationError, "directory"):
            validate_archive(self.archive, required_paths=())

    def test_rejects_corrupt_crc(self):
        with zipfile.ZipFile(self.archive, "w", compression=zipfile.ZIP_STORED) as archive:
            for name, body in CORE_FILES.items():
                archive.writestr(f"{PREFIX}/{name}", body)
        raw = bytearray(self.archive.read_bytes())
        marker = CORE_FILES["shared/schema.mjs"]
        offset = raw.find(marker)
        self.assertGreaterEqual(offset, 0)
        raw[offset] ^= 0x01
        self.archive.write_bytes(raw)
        with self.assertRaises(CheckpointValidationError):
            validate_archive(self.archive, required_paths=())

    def test_enforces_uncompressed_size_limit_and_required_paths(self):
        with self.assertRaisesRegex(CheckpointValidationError, "size limit"):
            validate_archive(
                self.archive,
                required_paths=(),
                max_uncompressed_bytes=10,
            )
        with self.assertRaisesRegex(CheckpointValidationError, "required"):
            validate_archive(
                self.archive,
                required_paths=("server/index.mjs",),
            )

    def test_rejects_nonempty_or_existing_extraction_target(self):
        target = self.root / "already-there"
        target.mkdir()
        with self.assertRaisesRegex(CheckpointValidationError, "already exists"):
            safe_extract(self.archive, target)


if __name__ == "__main__":
    unittest.main()