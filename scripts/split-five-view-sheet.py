"""Split a 1536x1024 five-view sheet into provider-ready source images."""

import sys
from pathlib import Path

from PIL import Image


VIEWS = (
    ("01-front", (0, 0, 512, 512)),
    ("02-rear", (512, 0, 1024, 512)),
    ("03-left", (1024, 0, 1536, 512)),
    ("04-right", (0, 512, 768, 1024)),
    ("05-front-three-quarter", (768, 512, 1536, 1024)),
)


if len(sys.argv) != 3:
    raise SystemExit("Usage: split-five-view-sheet.py <sheet.png> <output-directory>")

source = Path(sys.argv[1])
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)

sheet = Image.open(source).convert("RGB")
if sheet.size != (1536, 1024):
    raise RuntimeError(f"Expected a 1536x1024 five-view sheet, got {sheet.size}")

for name, box in VIEWS:
    target = output / f"{name}.png"
    sheet.crop(box).save(target, optimize=True)
    print(name, box, Image.open(target).size)
