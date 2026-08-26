"""Split a clean 2x2 asset turnaround into four independent source images.

The splitter performs no synthesis. It crops the four equal panels around the
center gutter and saves them on identical square canvases so a 3D provider can
consume the views as one source set.
"""

import sys
from pathlib import Path

from PIL import Image


VIEWS = (
    "01-front-three-quarter",
    "02-rear-three-quarter",
    "03-left",
    "04-right",
)


if len(sys.argv) != 3:
    raise SystemExit("Usage: split-multiview-grid.py <sheet.png> <output-directory>")

source = Path(sys.argv[1])
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)

sheet = Image.open(source).convert("RGB")
if abs(sheet.width - sheet.height) > 2:
    raise RuntimeError(f"Expected a square 2x2 sheet, got {sheet.size}")

# Generated sheets have a narrow white central gutter. Keeping a small inset
# avoids leaking adjacent panels without altering the depicted asset.
half_x = sheet.width // 2
half_y = sheet.height // 2
inset = max(4, round(min(sheet.size) * 0.01))
boxes = (
    (inset, inset, half_x - inset // 2, half_y - inset // 2),
    (half_x + inset // 2, inset, sheet.width - inset, half_y - inset // 2),
    (inset, half_y + inset // 2, half_x - inset // 2, sheet.height - inset),
    (half_x + inset // 2, half_y + inset // 2, sheet.width - inset, sheet.height - inset),
)

for name, box in zip(VIEWS, boxes):
    panel = sheet.crop(box)
    panel.save(output / f"{name}.png", optimize=True)
    print(name, box, panel.size)
