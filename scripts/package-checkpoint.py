from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import zipfile

parser = argparse.ArgumentParser(description="Package a cumulative project checkpoint.")
parser.add_argument("root", type=Path)
parser.add_argument("destination", type=Path)
parser.add_argument("notes", type=Path)
parser.add_argument(
    "--include-env",
    action="store_true",
    help="Include the configured .env after comparing it to the supplied archive.",
)
parser.add_argument(
    "--original-archive",
    type=Path,
    help="Source ZIP containing StickLaughStudio/.env for byte-equality verification.",
)
args = parser.parse_args()

root = args.root.resolve()
dest = args.destination.resolve()
notes = args.notes.read_text(encoding="utf-8")
if dest.exists():
    raise SystemExit("Refusing to overwrite a verified checkpoint")
if args.include_env and not args.original_archive:
    raise SystemExit("--include-env requires --original-archive")

dirs = {
    "assets", "docs", "examples", "prompts", "renderer", "scripts",
    "server", "shared", "tests", "web", "samples",
}
excluded = {"node_modules", ".angular", "dist", ".git", "__pycache__", ".cache"}
files = []
for item in sorted(root.iterdir()):
    if item.is_file() and (
        item.name
        in {
            "package.json", "package-lock.json", ".env.example", ".gitignore",
            "start.sh", "START_WINDOWS.bat", "START_HERE_HINDI.txt",
        }
        or item.name.startswith("README")
    ):
        files.append(item)
    elif item.is_dir() and item.name in dirs:
        for parent, folders, names in os.walk(item, followlinks=False):
            folders[:] = sorted(
                name
                for name in folders
                if name not in excluded and not Path(parent, name).is_symlink()
            )
            for name in sorted(names):
                item_path = Path(parent, name)
                if (
                    item_path.is_symlink()
                    or (name.startswith(".env") and name != ".env.example")
                    or item_path.suffix.lower()
                    in {".zip", ".pyc", ".log", ".tmp"}
                ):
                    continue
                if item_path.resolve().is_relative_to(root):
                    files.append(item_path)

secrets = []
env = root / ".env"
if env.exists():
    if not env.is_file() or env.is_symlink():
        raise SystemExit("Configured .env must be a regular file")
    for line in env.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        if re.search(r"KEY|TOKEN|SECRET|PASSWORD", key, re.I):
            value = value.strip().strip('"\'')
            if len(value) > 6:
                secrets.append(value.encode())

bundle_dir = root / "web" / "dist"
if not bundle_dir.is_dir():
    raise SystemExit("Build the frontend before packaging so bundles can be scanned.")
bundle_files = [
    Path(parent, name)
    for parent, folders, names in os.walk(bundle_dir, followlinks=False)
    for name in sorted(names)
    if not Path(parent, name).is_symlink()
]
if not bundle_files:
    raise SystemExit("Frontend production bundle is empty; bundle secret scan cannot run.")
log_files = []
for parent, folders, names in os.walk(root, followlinks=False):
    folders[:] = sorted(
        name for name in folders
        if name not in {"node_modules", ".angular", ".git", ".cache", "__pycache__", "dist"}
        and not Path(parent, name).is_symlink()
    )
    log_files.extend(
        Path(parent, name) for name in names
        if name.lower().endswith(".log") and not Path(parent, name).is_symlink()
    )
for artifact in [*bundle_files, *log_files]:
    data = artifact.read_bytes()
    if any(secret in data for secret in secrets):
        raise SystemExit("Configured secret content detected in a frontend bundle or project log.")
runtime_artifact_secret_scan = "passed"

env_bytes = None
env_equal = None
if args.include_env:
    if not env.is_file():
        raise SystemExit("Configured .env is missing")
    try:
        with zipfile.ZipFile(args.original_archive.resolve()) as original_zip:
            original_env = original_zip.read("StickLaughStudio/.env")
    except (OSError, KeyError, zipfile.BadZipFile) as error:
        raise SystemExit(
            "Original archive does not contain a readable StickLaughStudio/.env"
        ) from error
    env_bytes = env.read_bytes()
    env_equal = env_bytes == original_env
    if not env_equal:
        raise SystemExit(
            "Configured .env differs byte-for-byte from the supplied original archive"
        )

entries = {}
payload = []
lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
for folder, manifest_name in [("", "package.json"), ("web", "web/package.json")]:
    manifest = json.loads((root / manifest_name).read_text(encoding="utf-8"))
    locked = lock["packages"][folder]
    for field in ["dependencies", "devDependencies"]:
        if manifest.get(field, {}) != locked.get(field, {}):
            raise SystemExit(f"Manifest/lockfile mismatch: {manifest_name} {field}")

for item_path in files:
    data = item_path.read_bytes()
    archive_name = "StickLaughStudio/" + item_path.relative_to(root).as_posix()
    if any(secret in data for secret in secrets):
        raise SystemExit(
            "Secret content detected; archive was not written: "
            + str(item_path.relative_to(root))
        )
    entries[archive_name] = {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    payload.append((archive_name, data))

if env_bytes is not None:
    archive_name = "StickLaughStudio/.env"
    entries[archive_name] = {
        "bytes": len(env_bytes),
        "sha256": hashlib.sha256(env_bytes).hexdigest(),
    }
    payload.append((archive_name, env_bytes))

required = [
    "package.json",
    "package-lock.json",
    "server/index.mjs",
    "server/capability-discovery.mjs",
    "renderer/index.tsx",
    "renderer/draw.mjs",
    "renderer/engine.mjs",
    "shared/schema.mjs",
    "shared/scene-graph.mjs",
    "shared/visual-spec-schema.mjs",
    "shared/asset-ready-visual.mjs",
    "shared/raster-asset.mjs",
    "shared/raster-asset-schema.mjs",
    "shared/visual-capability-manifest.mjs",
    "shared/svg-path.mjs",
    "shared/geometry-library.mjs",
    "shared/capability-compiler.mjs",
    "tests/capability-compiler.test.mjs",
    "tests/capability-discovery.test.mjs",
    "tests/scene-graph.test.mjs",
    "tests/visual-geometry.test.mjs",
    "tests/point12-asset-ready.test.mjs",
    "tests/point13-asset-factory.test.mjs",
    "tests/point14-asset-providers.test.mjs",
    "tests/point13-png-fixture.mjs",
    "server/asset-factory.mjs",
    "server/asset-providers.mjs",
    "docs/POINT13-ASSET-FACTORY-PIPELINE.md",
    "docs/POINT14-PROVIDER-RESOLUTION.md",
    "scripts/smoke-point13-assets.mjs",
    "scripts/smoke-point14-assets.mjs",
    "examples/point12-asset-ready-visuals.json",
    "docs/POINT12-ASSET-READY-SCHEMA-VALIDATION.md",
    "scripts/render-point12-fixtures.mjs",
    "scripts/check-point12-raster.py",
    "docs/POINT7-CAPABILITY-COMPILER.md",
    "docs/POINT9-ENTITY-SCENE-GRAPH.md",
    "docs/POINT10-STRUCTURED-VISUAL-GEOMETRY.md",
    "docs/POINT11-PARAMETRIC-SHAPE-COMPONENTS.md",
    "web/package.json",
    "web/src/main.ts",
    "assets/sfx/manifest.json",
    "scripts/setup.mjs",
]
point12_fixtures = json.loads(
    (root / "examples" / "point12-asset-ready-visuals.json").read_text(encoding="utf-8")
)
required.extend([
    "examples/point12-raster-fixtures/manifest.json",
    *[
        f"examples/point12-raster-fixtures/{fixture['id']}.png"
        for fixture in point12_fixtures
    ],
])
if args.include_env:
    required.append(".env")
if not all("StickLaughStudio/" + item in entries for item in required):
    raise SystemExit("Required cumulative project source paths are missing")

manifest = json.loads((root / "assets/sfx/manifest.json").read_text(encoding="utf-8"))
for asset in manifest:
    if "StickLaughStudio/assets/sfx/" + asset["file"] not in entries:
        raise SystemExit("Required audio fixture missing: " + asset["file"])

dest.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(dest, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
    for name, data in payload:
        zipped.writestr(name, data)
    zipped.writestr("StickLaughStudio/CHECKPOINT.md", notes)
    zipped.writestr(
        "StickLaughStudio/CHECKPOINT_FILES.json",
        json.dumps(entries, indent=2),
    )

with zipfile.ZipFile(dest) as zipped:
    if zipped.testzip() is not None:
        raise SystemExit("Packaged archive CRC verification failed")
    names = zipped.namelist()
    if not all(not name.startswith("/") and ".." not in Path(name).parts for name in names):
        raise SystemExit("Unsafe path detected after packaging")
    if any("/node_modules/" in name for name in names):
        raise SystemExit("node_modules found in package")
    if ("StickLaughStudio/.env" in names) != args.include_env:
        raise SystemExit(".env inclusion does not match the requested package mode")
    for name, metadata in entries.items():
        if hashlib.sha256(zipped.read(name)).hexdigest() != metadata["sha256"]:
            raise SystemExit("Packaged source checksum mismatch: " + name)
    if env_bytes is not None and zipped.read("StickLaughStudio/.env") != env_bytes:
        raise SystemExit("Packaged .env does not match the configured project file")

report = {
    "file": dest.name,
    "bytes": dest.stat().st_size,
    "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
    "sourceFiles": len(entries),
    "zipIntegrity": "passed",
    "requiredContents": "passed",
    "manifestLockConsistency": "passed",
    "audioFixtures": "passed",
    "configuredSecretScan": "passed",
    "frontendBundleAndLogSecretScan": runtime_artifact_secret_scan,
    "environmentIncluded": args.include_env,
    "environmentByteEqualToOriginal": env_equal,
    "excluded": ["node_modules", "caches", "generated media/jobs", "previous ZIPs"],
    "checkpoint": "read CHECKPOINT.md",
}
dest.with_suffix(".verification.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)
print(json.dumps(report))