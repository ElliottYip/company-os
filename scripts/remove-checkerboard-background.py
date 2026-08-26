#!/usr/bin/env python3
"""Turn an edge-connected bright neutral checkerboard into true alpha."""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: remove-checkerboard-background.py INPUT OUTPUT")
    source, output = map(Path, sys.argv[1:])
    rgb = np.asarray(Image.open(source).convert("RGB"))
    height, width, _ = rgb.shape
    channel_range = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    # Image generators often antialias a nominal white/gray checkerboard into
    # several slightly warm neutral values around the subject. A wider neutral
    # range removes that connected fringe while saturated clay pixels remain
    # ineligible. Enclosed whites such as eyes are not edge-connected.
    candidate = (channel_range <= 42) & (rgb.min(axis=2) >= 188)
    background = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        for y in (0, height - 1):
            if candidate[y, x] and not background[y, x]:
                background[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if candidate[y, x] and not background[y, x]:
                background[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= next_y < height and 0 <= next_x < width and candidate[next_y, next_x] and not background[next_y, next_x]:
                background[next_y, next_x] = True
                queue.append((next_y, next_x))

    alpha = np.full((height, width), 255, dtype=np.uint8)
    alpha[background] = 0
    rgba = np.dstack((rgb, alpha))
    rgba[alpha == 0, :3] = 0
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(output, optimize=True)


if __name__ == "__main__":
    main()
