"""Darkens the edges of each block of a Kirka block texture (16x16 tiles), so
walls, floors and ceilings of the same block keep their depth in tunnels.

    python scripts/texture-edges.py scripts/textures/rite-dark-base.png src/assets/textures/rite-dark.png

Only fully opaque tiles: ladders, glass and other see-through blocks stay as
they are. Run it on the base texture, never on its own output.
"""

import sys

from PIL import Image

TILES = 16
# Brightness by distance to the block's edge, in pixels of a 32 px tile.
SHADE = [0.42, 0.60, 0.76, 0.88, 0.95]


def darken(src, dst):
    im = Image.open(src).convert("RGBA")
    px = im.load()
    size = im.width // TILES
    scale = size / 32
    for ty in range(TILES):
        for tx in range(TILES):
            x0, y0 = tx * size, ty * size
            if any(px[x0 + x, y0 + y][3] < 255 for y in range(size) for x in range(size)):
                continue
            for y in range(size):
                for x in range(size):
                    d = int(min(x, y, size - 1 - x, size - 1 - y) / scale)
                    if d >= len(SHADE):
                        continue
                    r, g, b, a = px[x0 + x, y0 + y]
                    k = SHADE[d]
                    px[x0 + x, y0 + y] = (round(r * k), round(g * k), round(b * k), a)
    im.save(dst, optimize=True)


if __name__ == "__main__":
    darken(sys.argv[1], sys.argv[2])
