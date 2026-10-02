#!/usr/bin/env python3
"""Render the shared vector geometry with Pillow; no fonts or network required."""
from pathlib import Path
from shutil import copyfile
from PIL import Image, ImageDraw

DESKTOP = Path(__file__).resolve().parents[1]
OUTPUT = DESKTOP / "build/readflow"
SIZES = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
SCALE = 2

# SVG commands are also sampled for the antialiased Pillow render.
LEFT = [("M", 246, 316), ("C", 336, 282, 420, 290, 494, 340),
        ("L", 494, 701), ("C", 418, 650, 334, 642, 246, 677), ("Z",)]
RIGHT = [("M", 530, 340), ("C", 604, 290, 688, 282, 778, 316),
         ("L", 778, 677), ("C", 690, 642, 606, 650, 530, 701), ("Z",)]
LINES = [
    ([("M", 300, 418), ("L", 442, 418)], "#005ec4", 20),
    ([("M", 300, 500), ("L", 442, 500)], "#005ec4", 20),
    ([("M", 300, 582), ("L", 412, 582)], "#005ec4", 20),
    ([("M", 582, 418), ("L", 724, 418)], "#a5d0f8", 20),
    ([("M", 582, 500), ("L", 724, 500)], "#a5d0f8", 20),
    ([("M", 582, 582), ("L", 694, 582)], "#a5d0f8", 20),
    ([("M", 512, 354), ("L", 512, 690)], "#d6ebff", 8),
]


def path_text(commands):
    return " ".join(" ".join(map(str, command)) for command in commands)


def points(commands):
    result = []
    for command in commands:
        op, *v = command
        if op in ("M", "L"):
            result.append((v[0], v[1]))
        elif op == "C":
            x0, y0 = result[-1]
            x1, y1, x2, y2, x3, y3 = v
            for step in range(1, 97):
                t = step / 96
                u = 1 - t
                result.append((u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3,
                               u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3))
    return [(round(x*SCALE), round(y*SCALE)) for x, y in result]


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title">',
           '<title id="title">ReadFlow — reading in parallel</title>',
           '<defs><linearGradient id="blue" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">',
           '<stop stop-color="#1686ee"/><stop offset=".5" stop-color="#0071e3"/><stop offset="1" stop-color="#005ec4"/>',
           '</linearGradient></defs>',
           '<rect x="48" y="48" width="928" height="928" rx="212" fill="url(#blue)"/>']
    for commands in (LEFT, RIGHT):
        svg.append(f'<path d="{path_text(commands)}" fill="#fff"/>')
    for commands, color, width in LINES:
        svg.append(f'<path d="{path_text(commands)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>')
    svg.append('</svg>')
    source = OUTPUT / "readflow.svg"
    source.write_text("\n".join(svg) + "\n")

    length = 1024*SCALE
    canvas = Image.new("RGBA", (length, length))
    gradient = Image.new("RGBA", canvas.size)
    draw = ImageDraw.Draw(gradient)
    colors = [(22, 134, 238), (0, 113, 227), (0, 94, 196)]
    for y in range(length):
        t = max(0, min(1, (y/SCALE - 48)/928)) * 2
        a, b, fraction = (colors[0], colors[1], t) if t < 1 else (colors[1], colors[2], t-1)
        color = tuple(round(v+(w-v)*fraction) for v, w in zip(a, b)) + (255,)
        draw.line((0, y, length, y), fill=color)
    mask = Image.new("L", canvas.size)
    ImageDraw.Draw(mask).rounded_rectangle((48*SCALE, 48*SCALE, 976*SCALE, 976*SCALE), radius=212*SCALE, fill=255)
    canvas.paste(gradient, (0, 0), mask)
    draw = ImageDraw.Draw(canvas)
    for commands in (LEFT, RIGHT):
        draw.polygon(points(commands), fill="white")
    for commands, color, width in LINES:
        line = points(commands)
        draw.line(line, fill=color, width=width*SCALE, joint="curve")
        radius = width*SCALE/2
        for x, y in (line[0], line[-1]):
            draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)
    for size in SIZES:
        canvas.resize((size, size), Image.Resampling.LANCZOS).save(OUTPUT / f"{size}x{size}.png", optimize=True)
    copyfile(OUTPUT / "256x256.png", DESKTOP / "assets/readflow.png")
    copyfile(source, DESKTOP.parent / "web/src/assets/readflow-logo.svg")
    print(f"ReadFlow SVG and {len(SIZES)} PNG sizes generated in {OUTPUT}")


if __name__ == "__main__":
    main()
