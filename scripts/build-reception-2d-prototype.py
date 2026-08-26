#!/usr/bin/env python3
"""Build a same-canvas 2.5D reception proof from an approved master image.

This deliberately keeps every extracted layer at the source dimensions. The
prototype duplicates pixels from the approved master rather than regenerating
objects, so recomposition cannot drift because of scale or perspective changes.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


def polygon_mask(size: tuple[int, int], points: list[tuple[int, int]], blur: int = 1) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur)) if blur else mask


def extract(source: Image.Image, mask: Image.Image) -> Image.Image:
    layer = source.copy()
    layer.putalpha(mask)
    return layer


def contain(image: Image.Image, width: int, height: int) -> Image.Image:
    scale = min(width / image.width, height / image.height)
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)


def checker(size: tuple[int, int], cell: int = 24) -> Image.Image:
    out = Image.new("RGB", size, "#f4efe7")
    draw = ImageDraw.Draw(out)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#e7dfd3")
    return out


def layer_card(layer: Image.Image, label: str, card_size: tuple[int, int]) -> Image.Image:
    card = checker(card_size)
    preview = contain(layer, card_size[0], card_size[1] - 44)
    card.paste(preview, ((card.width - preview.width) // 2, 36), preview)
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((8, 6, card.width - 8, 34), radius=12, fill="#fffaf2")
    draw.text((20, 13), label, fill="#3b352e")
    return card


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: build-reception-2d-prototype.py MASTER FISH OUTPUT_DIR")

    master_path, fish_path, output_path = map(Path, sys.argv[1:])
    output_path.mkdir(parents=True, exist_ok=True)
    master = Image.open(master_path).convert("RGBA")
    fish_source = Image.open(fish_path).convert("RGBA")
    width, height = master.size
    if (width, height) != (1448, 1086):
        raise SystemExit(f"unexpected master size: {width}x{height}")

    # Masks are authored once in master-image pixel coordinates. They remain
    # same-canvas assets; no crop origin needs to be carried into the renderer.
    counter_mask = polygon_mask(
        master.size,
        [(703, 500), (723, 455), (805, 404), (912, 389), (987, 430),
         (1015, 508), (994, 625), (955, 666), (858, 692), (757, 672),
         (705, 625)],
        blur=2,
    )
    sofa_mask = polygon_mask(
        master.size,
        [(80, 520), (153, 477), (339, 492), (444, 547), (456, 706),
         (386, 790), (156, 791), (72, 702)],
        blur=2,
    )
    front_wall_mask = polygon_mask(
        master.size,
        [(0, 598), (48, 654), (87, 747), (144, 831), (237, 872),
         (493, 878), (508, 1018), (374, 1058), (0, 947)],
        blur=2,
    )
    right_wall_mask = polygon_mask(
        master.size,
        [(883, 821), (935, 774), (1183, 756), (1418, 654), (1448, 675),
         (1448, 1019), (1266, 1043), (885, 1004)],
        blur=2,
    )
    wall_mask = Image.new("L", master.size, 0)
    wall_mask = Image.fromarray(
        __import__("numpy").maximum(
            __import__("numpy").array(front_wall_mask),
            __import__("numpy").array(right_wall_mask),
        ).astype("uint8")
    )

    layers = {
        "counter-foreground.png": extract(master, counter_mask),
        "sofa-foreground.png": extract(master, sofa_mask),
        "front-wall.png": extract(master, wall_mask),
    }
    master.save(output_path / "background-master.png", optimize=True)
    master.save(output_path / "background-master.webp", "WEBP", quality=86, method=6)
    counter_mask.save(output_path / "counter-mask.png", optimize=True)
    sofa_mask.save(output_path / "sofa-mask.png", optimize=True)
    wall_mask.save(output_path / "wall-mask.png", optimize=True)
    for name, layer in layers.items():
        layer.save(output_path / name, optimize=True)
        layer.save(output_path / name.replace(".png", ".webp"), "WEBP", quality=90, method=6)
    fish_source.save(output_path / "fish-fizz.png", optimize=True)

    # A deliberately coarse semantic hit map: stable colors are IDs, not UI.
    hit_map = Image.new("RGB", master.size, (0, 0, 0))
    hit = ImageDraw.Draw(hit_map)
    hit.polygon([(703, 500), (723, 455), (805, 404), (912, 389), (1015, 508),
                 (994, 625), (955, 666), (858, 692), (757, 672), (705, 625)], fill=(255, 82, 82))
    hit.polygon([(80, 520), (153, 477), (339, 492), (456, 547), (456, 706),
                 (386, 790), (156, 791), (72, 702)], fill=(82, 204, 126))
    hit.polygon([(838, 105), (1074, 91), (1082, 322), (842, 346)], fill=(82, 138, 255))
    hit_map.save(output_path / "hit-map.png", optimize=True)

    anchors = {
        "formatVersion": "1.0",
        "canvas": {"width": width, "height": height, "viewYaw": 45},
        "entrance": {"x": 697, "y": 944, "facing": "north-east"},
        "receptionQueue": {"x": 826, "y": 731, "facing": "north"},
        "receptionStaff": {"x": 790, "y": 468, "facing": "south-east"},
        "waitingSeat": {"x": 286, "y": 626, "facing": "south-east"},
        "walkablePath": [[697, 944], [742, 824], [826, 731], [884, 684], [798, 535], [790, 468]],
        "occluders": ["counter", "sofa", "front-wall"],
    }
    (output_path / "anchors.json").write_text(json.dumps(anchors, ensure_ascii=False, indent=2) + "\n")

    # Layer contact sheet for human review.
    cards = [
        layer_card(master, "1  母图 / 背景", (620, 500)),
        layer_card(layers["counter-foreground.png"], "2  前台遮挡层", (620, 500)),
        layer_card(layers["sofa-foreground.png"], "3  沙发遮挡层", (620, 500)),
        layer_card(layers["front-wall.png"], "4  前墙遮挡 / 虚化层", (620, 500)),
    ]
    sheet = Image.new("RGB", (1280, 1040), "#e9dfd1")
    for index, card in enumerate(cards):
        sheet.paste(card, (20 + (index % 2) * 630, 20 + (index // 2) * 510))
    sheet.save(output_path / "layer-contact-sheet.jpg", quality=91, optimize=True)

    # Animated proof: the fish changes depth only at semantic path boundaries.
    fish = contain(fish_source, 150, 150)
    route = [(697, 930), (745, 820), (825, 730), (890, 680), (840, 570), (792, 480)]
    frames: list[Image.Image] = []
    segment_frames = 11
    wall_layer = layers["front-wall.png"]
    counter_layer = layers["counter-foreground.png"]
    sofa_layer = layers["sofa-foreground.png"]
    for segment in range(len(route) - 1):
        x0, y0 = route[segment]
        x1, y1 = route[segment + 1]
        for step in range(segment_frames):
            t = step / segment_frames
            ease = 0.5 - 0.5 * math.cos(math.pi * t)
            x = round(x0 + (x1 - x0) * ease)
            y = round(y0 + (y1 - y0) * ease)
            bob = round(math.sin((len(frames) / 4) * math.pi) * 4)
            frame = master.copy()
            # Sofa and wall are always physical foreground occluders.
            frame.alpha_composite(sofa_layer)
            if segment >= 4:
                # Behind the desk: actor first, desk pixels re-applied second.
                frame.alpha_composite(fish, (x - fish.width // 2, y - fish.height + bob))
                frame.alpha_composite(counter_layer)
            else:
                # In the public circulation zone: actor is in front of desk.
                frame.alpha_composite(counter_layer)
                frame.alpha_composite(fish, (x - fish.width // 2, y - fish.height + bob))
            frame.alpha_composite(wall_layer)
            frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=192))
    frames[0].save(
        output_path / "reception-fish-occlusion-demo.gif",
        save_all=True,
        append_images=frames[1:] + list(reversed(frames[1:-1])),
        duration=75,
        loop=0,
        optimize=False,
        disposal=2,
    )

    # A compact static storyboard remains readable in clients that do not play GIFs.
    picks = [0, 11, 22, 33, 44, 54]
    storyboard = Image.new("RGB", (1080, 810), "#e9dfd1")
    for index, pick in enumerate(picks):
        still = frames[min(pick, len(frames) - 1)].convert("RGB")
        still.thumbnail((520, 360), Image.Resampling.LANCZOS)
        x = 20 + (index % 2) * 530
        y = 20 + (index // 2) * 260
        storyboard.paste(still, (x, y))
        ImageDraw.Draw(storyboard).rounded_rectangle((x + 8, y + 8, x + 148, y + 36), 12, fill="#fffaf2")
        labels = ["进入开放入口", "接近前台", "柜台前方", "转入员工区", "柜台开始遮挡", "到达工作位"]
        ImageDraw.Draw(storyboard).text((x + 18, y + 15), labels[index], fill="#3b352e")
    storyboard.save(output_path / "occlusion-storyboard.jpg", quality=90, optimize=True)


if __name__ == "__main__":
    main()
