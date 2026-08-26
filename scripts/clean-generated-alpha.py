#!/usr/bin/env python3
"""Remove low-opacity generation halos without changing opaque asset pixels."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: clean-generated-alpha.py INPUT_RGBA OUTPUT_PNG")
    source_path, output_path = map(Path, sys.argv[1:])
    rgba = np.asarray(Image.open(source_path).convert("RGBA")).copy()
    alpha = rgba[:, :, 3].astype(np.float32)

    # Generated opaque pixels peak at 254. The broad glow is carried by much
    # lower alpha values. Smoothstep retains a narrow antialiased silhouette.
    low, high = 224.0, 252.0
    t = np.clip((alpha - low) / (high - low), 0.0, 1.0)
    cleaned = (t * t * (3.0 - 2.0 * t) * 255.0).astype(np.uint8)
    rgba[:, :, 3] = cleaned
    rgba[cleaned == 0, :3] = 0

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = Image.fromarray(rgba, "RGBA")
    result.save(output_path, optimize=True)

    # Human-review preview; the checkerboard is not part of the asset.
    cell = 32
    preview = Image.new("RGB", result.size, "#f5f0e8")
    draw = ImageDraw.Draw(preview)
    for y in range(0, result.height, cell):
        for x in range(0, result.width, cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#e6ded2")
    preview.paste(result, (0, 0), result)
    preview.save(output_path.with_name(output_path.stem + "-preview.jpg"), quality=92, optimize=True)


if __name__ == "__main__":
    main()
