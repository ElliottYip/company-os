"""Extract five complete subjects from a generated turnaround sheet.

The generated sheets use a baked neutral checkerboard. This script replaces
only near-neutral bright pixels with a uniform white reference background and
finds the colored connected component nearest each expected panel center, then
centers the complete subject on a uniform square canvas. It does not synthesize
or repaint the character.
"""

import sys
from pathlib import Path

from PIL import Image


VIEWS = ("front", "left", "right", "rear", "top")


def neutralize_background(image):
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue = pixels[x, y]
            if max(red, green, blue) - min(red, green, blue) <= 10 and min(red, green, blue) >= 214:
                pixels[x, y] = (255, 255, 255)


def subject_mask(image):
    output = bytearray(image.width * image.height)
    pixels = image.load()
    for y in range(image.height):
        offset = y * image.width
        for x in range(image.width):
            red, green, blue = pixels[x, y]
            is_neutral_bright = max(red, green, blue) - min(red, green, blue) <= 18 and min(red, green, blue) >= 205
            output[offset + x] = 0 if is_neutral_bright else 1
    return output


def connected_components(mask, width, height):
    components = []
    seen = bytearray(len(mask))
    for start in range(len(mask)):
        if not mask[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        area = 0
        min_x = max_x = start % width
        min_y = max_y = start // width
        while stack:
            current = stack.pop()
            x = current % width
            y = current // width
            area += 1
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            for neighbor in (current - 1, current + 1, current - width, current + width):
                if neighbor < 0 or neighbor >= len(mask) or seen[neighbor] or not mask[neighbor]:
                    continue
                neighbor_x = neighbor % width
                neighbor_y = neighbor // width
                if abs(neighbor_x - x) > 1 or abs(neighbor_y - y) > 1:
                    continue
                seen[neighbor] = 1
                stack.append(neighbor)
        if area >= 500:
            components.append((area, (min_x, min_y, max_x + 1, max_y + 1)))
    return components


if len(sys.argv) != 3:
    raise SystemExit("Usage: split-turnaround.py <sheet.png> <output-directory>")

source = Path(sys.argv[1])
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
sheet = Image.open(source).convert("RGB")
neutralize_background(sheet)
components = connected_components(subject_mask(sheet), sheet.width, sheet.height)
if len(components) < len(VIEWS):
    raise RuntimeError(f"Expected at least five subject components, found {len(components)}")
available = list(components)
for index, view in enumerate(VIEWS):
    expected_x = (index + 0.5) * sheet.width / len(VIEWS)
    component = min(available, key=lambda item: abs(((item[1][0] + item[1][2]) / 2) - expected_x))
    available.remove(component)
    _, (left, top, right, bottom) = component
    padding = 24
    crop_box = (
        max(0, left - padding), max(0, top - padding),
        min(sheet.width, right + padding), min(sheet.height, bottom + padding),
    )
    subject = sheet.crop(crop_box)
    subject.thumbnail((700, 700), Image.Resampling.LANCZOS)
    panel = Image.new("RGB", (768, 768), "white")
    panel.paste(subject, ((panel.width - subject.width) // 2, (panel.height - subject.height) // 2))
    panel.save(output / f"{index + 1:02d}-{view}.png", optimize=True)
    print(view, crop_box, subject.size)
