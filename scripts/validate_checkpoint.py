#!/usr/bin/env python3
"""Validate provenance and safely extract a StickLaugh Studio checkpoint ZIP.

This tool never follows archive symlinks, overwrites existing files, or prints
the contents of the project's environment file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Iterable


DEFAULT_REQUIRED_PATHS = (
    "package.json",
    "package-lock.json",
    "shared/schema.mjs",
    "shared/motion-ir.mjs",
    "shared/rig.mjs",
    "shared/timeline.mjs",
    "shared/frame-clock.mjs",
    "shared/replay.mjs",
    "shared/action-time.mjs",
    "shared/canonical-story-ir.mjs",
    "shared/character-design.mjs",
    "shared/capability-compiler.mjs",
    "shared/scene-graph.mjs",
    "shared/visual-spec-schema.mjs",
    "shared/asset-ready-visual.mjs",
    "shared/raster-asset.mjs",
    "shared/raster-asset-schema.mjs",
    "shared/visual-capability-manifest.mjs",
    "shared/svg-path.mjs",
    "shared/geometry-library.mjs",
    "renderer/draw.mjs",
    "renderer/engine.mjs",
    "renderer/index.tsx",
    "server/index.mjs",
    "server/capability-discovery.mjs",
    "server/choreographer.mjs",
    "server/inspect.mjs",
    "server/scene-compile.mjs",
    "server/asset-factory.mjs",
    "server/asset-providers.mjs",
    "server/story-contract.mjs",
    "server/providers.mjs",
    "server/sound-director.mjs",
    "server/render.mjs",
    "server/queue.mjs",
    "server/media.mjs",
    "server/timing.mjs",
    "tests/canonical-story-ir.test.mjs",
    "tests/capability-compiler.test.mjs",
    "tests/capability-discovery.test.mjs",
    "tests/point8-replay.test.mjs",
    "tests/scene-graph.test.mjs",
    "tests/visual-geometry.test.mjs",
    "tests/point12-asset-ready.test.mjs",
    "tests/point13-asset-factory.test.mjs",
    "tests/point14-asset-providers.test.mjs",
    "tests/point13-png-fixture.mjs",
    "examples/point12-asset-ready-visuals.json",
    "examples/point12-raster-fixtures/manifest.json",
    "examples/point12-raster-fixtures/appleFixture.png",
    "examples/point12-raster-fixtures/pearFixture.png",
    "examples/point12-raster-fixtures/sandwichFixture.png",
    "examples/point12-raster-fixtures/teapotFixture.png",
    "examples/point12-raster-fixtures/lampFixture.png",
    "examples/point12-raster-fixtures/basketFixture.png",
    "examples/point12-raster-fixtures/stopMarkerFixture.png",
    "examples/point12-raster-fixtures/arrowSignFixture.png",
    "docs/POINT10-STRUCTURED-VISUAL-GEOMETRY.md",
    "docs/POINT11-PARAMETRIC-SHAPE-COMPONENTS.md",
    "docs/POINT12-ASSET-READY-SCHEMA-VALIDATION.md",
    "docs/POINT13-ASSET-FACTORY-PIPELINE.md",
    "docs/POINT14-PROVIDER-RESOLUTION.md",
    "scripts/smoke-point13-assets.mjs",
    "scripts/smoke-point14-assets.mjs",
    "docs/POINT6-FRAME-IR.md",
    "docs/POINT7-CAPABILITY-COMPILER.md",
    "docs/POINT8-LEGACY-REPLAY.md",
    "docs/POINT9-ENTITY-SCENE-GRAPH.md",
    "web/src/main.ts",
    "web/src/app.html",
)
WINDOWS_RESERVED = re.compile(
    r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$", re.IGNORECASE
)


class CheckpointValidationError(ValueError):
    """Raised when a checkpoint archive is malformed or unsafe."""


def _portable_name(info: zipfile.ZipInfo) -> tuple[str, bool]:
    """Return a canonical relative POSIX path and whether it is a directory."""
    raw = info.filename
    if not raw or "\x00" in raw or "\\" in raw or raw.startswith("/"):
        raise CheckpointValidationError(f"unsafe archive path: {raw!r}")

    is_dir = info.is_dir() or raw.endswith("/")
    body = raw[:-1] if is_dir else raw
    parts = body.split("/")
    if not body or any(part in ("", ".", "..") for part in parts):
        raise CheckpointValidationError(f"unsafe archive path: {raw!r}")
    if parts[0].endswith(":"):
        raise CheckpointValidationError(f"drive-qualified archive path: {raw!r}")

    normalized: list[str] = []
    for part in parts:
        canonical = unicodedata.normalize("NFC", part)
        if (
            canonical.endswith((".", " "))
            or ":" in canonical
            or WINDOWS_RESERVED.fullmatch(canonical)
        ):
            raise CheckpointValidationError(f"non-portable archive path: {raw!r}")
        normalized.append(canonical)

    mode = info.external_attr >> 16
    kind = stat.S_IFMT(mode)
    if kind == stat.S_IFLNK:
        raise CheckpointValidationError(f"archive symlinks are not permitted: {raw}")
    if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
        raise CheckpointValidationError(f"special file is not permitted: {raw}")
    if is_dir and kind == stat.S_IFREG:
        raise CheckpointValidationError(f"directory/file type mismatch: {raw}")
    if not is_dir and kind == stat.S_IFDIR:
        raise CheckpointValidationError(f"directory/file type mismatch: {raw}")

    return "/".join(normalized), is_dir


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _equal_streams(left, right) -> bool:
    while True:
        a = left.read(1024 * 1024)
        b = right.read(1024 * 1024)
        if a != b:
            return False
        if not a:
            return True


def _validate_prefix(prefix: str) -> str:
    if not prefix:
        return ""
    if prefix.startswith("/") or "\\" in prefix:
        raise CheckpointValidationError("project prefix must be a safe relative path")
    parts = prefix.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise CheckpointValidationError("project prefix must be a safe relative path")
    return "/".join(unicodedata.normalize("NFC", part) for part in parts)


def validate_archive(
    archive: str | Path,
    *,
    project_prefix: str = "StickLaughStudio",
    required_paths: Iterable[str] = DEFAULT_REQUIRED_PATHS,
    env_relative_path: str = ".env",
    original_env: str | Path | None = None,
    max_entries: int = 100_000,
    max_uncompressed_bytes: int = 2 * 1024 * 1024 * 1024,
) -> dict:
    """Check ZIP integrity, member safety, required sources, and optional env equality."""
    archive = Path(archive)
    if archive.is_symlink() or not archive.is_file():
        raise CheckpointValidationError("archive must be a regular, non-symlink file")
    prefix = _validate_prefix(project_prefix)
    env_relative = _validate_prefix(env_relative_path)
    required = tuple(required_paths)
    if not env_relative:
        raise CheckpointValidationError("environment path cannot be empty")

    try:
        archive_sha = _sha256_file(archive)
        with zipfile.ZipFile(archive, "r") as zipped:
            infos = zipped.infolist()
            if len(infos) > max_entries:
                raise CheckpointValidationError(
                    f"archive has {len(infos)} entries; limit is {max_entries}"
                )

            records: dict[str, tuple[zipfile.ZipInfo, bool]] = {}
            collision_keys: set[str] = set()
            folded_records: dict[str, tuple[str, tuple[zipfile.ZipInfo, bool]]] = {}
            total_size = 0
            for info in infos:
                name, is_dir = _portable_name(info)
                collision_key = name.casefold()
                if collision_key in collision_keys:
                    raise CheckpointValidationError(
                        f"duplicate or case-colliding archive path: {info.filename!r}"
                    )
                collision_keys.add(collision_key)
                records[name] = (info, is_dir)
                folded_records[collision_key] = (name, (info, is_dir))
                total_size += info.file_size
                if total_size > max_uncompressed_bytes:
                    raise CheckpointValidationError(
                        "archive exceeds the uncompressed size limit"
                    )

            # Reject file/parent collisions before creating anything on disk.
            for name, (_, is_dir) in records.items():
                parents = PurePosixPath(name).parents
                for parent in parents:
                    parent_name = parent.as_posix()
                    if parent_name == ".":
                        continue
                    existing = folded_records.get(parent_name.casefold())
                    if existing and not existing[1][1]:
                        raise CheckpointValidationError(
                            f"file/directory collision at {existing[0]!r}"
                        )
                if not is_dir and any(
                    other.casefold().startswith(name.casefold() + "/")
                    for other in records
                ):
                    raise CheckpointValidationError(
                        f"file/directory collision: file has archive children at {name!r}"
                    )

            bad_member = zipped.testzip()
            if bad_member is not None:
                raise CheckpointValidationError(
                    f"CRC check failed for archive member: {bad_member}"
                )

            project_root = f"{prefix}/" if prefix else ""
            missing = [
                f"{project_root}{path}"
                for path in required
                if f"{project_root}{path}" not in records
                or records[f"{project_root}{path}"][1]
            ]
            if missing:
                raise CheckpointValidationError(
                    "required project source paths missing: " + ", ".join(missing)
                )

            env_name = f"{project_root}{env_relative}"
            env_record = records.get(env_name)
            if env_record is None or env_record[1]:
                raise CheckpointValidationError(
                    f"expected environment file is missing: {env_name}"
                )
            env_equal: bool | None = None
            if original_env is not None:
                original_env = Path(original_env)
                if not original_env.is_file() or original_env.is_symlink():
                    raise CheckpointValidationError(
                        "original environment reference must be a regular file"
                    )
                with zipped.open(env_record[0], "r") as embedded, original_env.open(
                    "rb"
                ) as original:
                    env_equal = _equal_streams(embedded, original)

            package_name = f"{project_root}package.json"
            metadata: dict = {}
            if package_name in records:
                try:
                    package = json.loads(zipped.read(records[package_name][0]))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise CheckpointValidationError(
                        "package.json is not valid UTF-8 JSON"
                    ) from error
                if not isinstance(package, dict):
                    raise CheckpointValidationError("package.json must be a JSON object")
                metadata = {
                    "package_name": package.get("name"),
                    "package_version": package.get("version"),
                    "node_engine": package.get("engines", {}).get("node")
                    if isinstance(package.get("engines"), dict)
                    else None,
                    "scripts": package.get("scripts", {}),
                }

    except zipfile.BadZipFile as error:
        raise CheckpointValidationError("input is not a valid ZIP archive") from error
    except (OSError, RuntimeError, EOFError) as error:
        raise CheckpointValidationError(f"archive could not be read: {error}") from error

    return {
        "archive": archive.name,
        "archive_sha256": archive_sha,
        "archive_bytes": archive.stat().st_size,
        "member_count": len(infos),
        "uncompressed_bytes": total_size,
        "crc_ok": True,
        "symlink_count": 0,
        "project_prefix": prefix,
        "required_paths": len(required),
        "environment_path": env_name,
        "environment_present": True,
        "environment_byte_equal_to_original": env_equal,
        **metadata,
    }


def safe_extract(
    archive: str | Path,
    destination: str | Path,
    *,
    project_prefix: str = "StickLaughStudio",
    env_relative_path: str = ".env",
) -> Path:
    """Extract into a new directory after validating all members and CRCs."""
    archive = Path(archive)
    destination = Path(destination)
    if os.path.lexists(destination):
        raise CheckpointValidationError("extraction destination already exists")

    # Validation, including CRC checks, occurs before the destination is created.
    validate_archive(
        archive,
        required_paths=(),
        project_prefix=project_prefix,
        env_relative_path=env_relative_path,
    )
    target = destination.parent.resolve() / destination.name
    if os.path.lexists(target):
        raise CheckpointValidationError("resolved extraction destination exists")

    target.mkdir(parents=False)
    try:
        with zipfile.ZipFile(archive, "r") as zipped:
            for info in zipped.infolist():
                name, is_dir = _portable_name(info)
                out = target.joinpath(*name.split("/"))
                parent = out if is_dir else out.parent
                parent.relative_to(target)
                _mkdir_no_symlink(target, parent)
                if is_dir:
                    continue

                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
                if hasattr(os, "O_NOFOLLOW"):
                    flags |= os.O_NOFOLLOW
                mode = info.external_attr >> 16
                permissions = (mode & 0o755) if mode else 0o644
                descriptor = os.open(out, flags, permissions)
                written = 0
                try:
                    with os.fdopen(descriptor, "wb") as output, zipped.open(
                        info, "r"
                    ) as source:
                        for chunk in iter(lambda: source.read(1024 * 1024), b""):
                            written += len(chunk)
                            output.write(chunk)
                        output.flush()
                        os.fsync(output.fileno())
                    if written != info.file_size:
                        raise CheckpointValidationError(
                            f"extracted size mismatch for {info.filename!r}"
                        )
                    os.chmod(out, permissions)
                except BaseException:
                    try:
                        out.unlink()
                    except FileNotFoundError:
                        pass
                    raise
    except BaseException:
        # A failed extraction must not leave a partial tree that looks usable.
        import shutil

        shutil.rmtree(target, ignore_errors=True)
        raise

    return target


def _mkdir_no_symlink(root: Path, directory: Path) -> None:
    relative = directory.relative_to(root)
    current = root
    for component in relative.parts:
        current = current / component
        try:
            current.mkdir()
        except FileExistsError:
            pass
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            raise CheckpointValidationError(
                f"extraction parent is not a real directory: {current}"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--project-prefix", default="StickLaughStudio")
    parser.add_argument("--original-env", type=Path)
    parser.add_argument("--extract-to", type=Path)
    args = parser.parse_args(argv)
    try:
        report = validate_archive(
            args.archive,
            project_prefix=args.project_prefix,
            original_env=args.original_env,
        )
        if args.extract_to:
            extracted = safe_extract(
                args.archive,
                args.extract_to,
                project_prefix=args.project_prefix,
            )
            report["extracted_to"] = str(extracted)
            if args.original_env:
                extracted_env = (
                    extracted / args.project_prefix / ".env"
                    if args.project_prefix
                    else extracted / ".env"
                )
                with extracted_env.open("rb") as packaged, args.original_env.open(
                    "rb"
                ) as original:
                    report["extracted_environment_byte_equal_to_original"] = (
                        _equal_streams(packaged, original)
                    )
        report["status"] = "PASS"
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0
    except (CheckpointValidationError, OSError, zipfile.BadZipFile) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())