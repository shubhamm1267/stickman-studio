#!/usr/bin/env python3
"""Measure that Point 12 fixture renders are distinct at playback resolution."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "examples" / "point12-raster-fixtures"
MANIFEST = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
expected = {item["id"] for item in MANIFEST["fixtures"]}
assert len(expected) == 8, f"expected 8 fixture renders; found {len(expected)}"
assert MANIFEST["viewport"] == {"width": 540, "height": 960, "deviceScaleFactor": 1}

images: dict[str, Image.Image] = {}
for item in MANIFEST["fixtures"]:
    path = FIXTURES / item["filename"]
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == item["sha256"], f"SHA-256 mismatch: {path.name}"
    image = Image.open(path).convert("RGB")
    assert image.size == (540, 960), f"wrong playback dimensions for {path.name}: {image.size}"
    crop = image.crop((120, 300, 420, 700))
    background = image.getpixel((10, 10))
    pixels = crop.get_flattened_data()
    foreground = [
        (x, y)
        for y in range(crop.height)
        for x in range(crop.width)
        if max(abs(a - b) for a, b in zip(pixels[y * crop.width + x], background)) > 24
    ]
    assert len(foreground) > 450, f"fixture appears blank at playback size: {path.name}"
    xs, ys = zip(*foreground)
    bounds = (min(xs), min(ys), max(xs), max(ys))
    assert bounds[2] > bounds[0] + 20 and bounds[3] > bounds[1] + 20, (
        f"fixture lacks a readable silhouette: {path.name}"
    )
    assert len(set(pixels)) >= 8, f"fixture lacks visible fill/texture variation: {path.name}"
    images[item["id"]] = crop
    print(
        f"PASS {item['id']}: 540x960, foreground={len(foreground)}, "
        f"bbox={bounds[2]-bounds[0]+1}x{bounds[3]-bounds[1]+1}, colors={len(set(pixels))}"
    )

for index, left in enumerate(sorted(images)):
    for right in sorted(images)[index + 1 :]:
        a = images[left].get_flattened_data()
        b = images[right].get_flattened_data()
        changed = sum(pixel_a != pixel_b for pixel_a, pixel_b in zip(a, b))
        assert changed > 1000, f"{left} and {right} rasterize too similarly ({changed} pixels differ)"

print(f"PASS: all {len(expected)} raster fixtures are nonblank and pairwise distinct.")