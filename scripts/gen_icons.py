#!/usr/bin/env python3
"""Generate LLM Manager app icons (PNG + ICO) — no external tools needed.

Motif: warm-clay rounded square with a cream "hub" ring + center dot —
the Model Hub in one glyph. Analytical AA at 1024px, box-downsampled to
the sizes Tauri bundles. Re-run after brand tweaks: python scripts/gen_icons.py
"""
import os
import struct
import zlib

CLAY_TOP = (222, 132, 103)   # #DE8467
CLAY_BOT = (201, 100, 66)    # #C96442
CREAM = (250, 249, 245)      # #FAF9F5

MASTER = 1024
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")


def write_png(path, size, rows):
    """rows: list of rows, each a list of (r,g,b,a)."""
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter: none
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))
    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def smooth(edge0, edge1, x):
    if edge0 == edge1:
        return 1.0 if x >= edge1 else 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def render_master():
    """Analytical-AA render at MASTER². Returns rows of RGBA."""
    s = MASTER
    inset = 128.0
    radius = 220.0
    ring_r = 268.0
    ring_half = 30.0
    dot_r = 74.0

    def sdf_rounded_rect(x, y):
        # distance from the rounded-rect boundary (<0 inside)
        cx, cy = s / 2, s / 2
        half = s / 2 - inset
        qx = abs(x - cx) - (half - radius)
        qy = abs(y - cy) - (half - radius)
        ax, ay = max(qx, 0.0), max(qy, 0.0)
        outside = (ax * ax + ay * ay) ** 0.5
        inside = min(max(qx, qy), 0.0)
        return outside + inside - radius

    rows = []
    aa = 1.4  # px feather
    cx = cy = s / 2
    for y in range(s):
        row = []
        for x in range(s):
            px, py = x + 0.5, y + 0.5
            rect_a = smooth(aa, -aa, sdf_rounded_rect(px, py))
            if rect_a <= 0.0:
                row.append((0, 0, 0, 0))
                continue
            # vertical clay gradient
            t = (py - inset) / (s - 2 * inset)
            t = max(0.0, min(1.0, t))
            r = int(CLAY_TOP[0] + (CLAY_BOT[0] - CLAY_TOP[0]) * t)
            g = int(CLAY_TOP[1] + (CLAY_BOT[1] - CLAY_TOP[1]) * t)
            b = int(CLAY_TOP[2] + (CLAY_BOT[2] - CLAY_TOP[2]) * t)
            # cream elements
            dist = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
            ring = smooth(ring_half + aa, ring_half - aa, abs(dist - ring_r))
            dot = smooth(aa, -aa, dist - dot_r)
            cream_a = max(ring, dot)
            if cream_a > 0:
                r = int(r + (CREAM[0] - r) * cream_a)
                g = int(g + (CREAM[1] - g) * cream_a)
                b = int(b + (CREAM[2] - b) * cream_a)
            a = int(rect_a * 255)
            row.append((r, g, b, a))
        rows.append(row)
    return rows


def downsample(rows, factor):
    n = len(rows) // factor
    out = []
    for y in range(n):
        row = []
        for x in range(n):
            rs = gs = bs = as_ = 0
            for dy in range(factor):
                src = rows[y * factor + dy]
                for dx in range(factor):
                    r, g, b, a = src[x * factor + dx]
                    rs += r
                    gs += g
                    bs += b
                    as_ += a
            cnt = factor * factor
            row.append((rs // cnt, gs // cnt, bs // cnt, as_ // cnt))
        out.append(row)
    return out


def write_ico(path, pngs):
    """pngs: list of (size, png_bytes). ICO with PNG-compressed entries."""
    count = len(pngs)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = b""
    data = b""
    for size, png in pngs:
        dim = 0 if size >= 256 else size
        entries += struct.pack(
            "<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset
        )
        data += png
        offset += len(png)
    with open(path, "wb") as f:
        f.write(header + entries + data)


def png_bytes(rows, size):
    def chunk(tag, d):
        return (
            struct.pack(">I", len(d)) + tag + d
            + struct.pack(">I", zlib.crc32(tag + d) & 0xFFFFFFFF)
        )
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for px in row:
            raw += bytes(px)
    out = bytearray(b"\x89PNG\r\n\x1a\n")
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    out += chunk(b"IEND", b"")
    return bytes(out)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("rendering master…")
    master = render_master()

    sizes = [512, 256, 128, 64, 48, 32, 16]
    scaled = {}
    for size in sizes:
        factor = MASTER // size
        scaled[size] = downsample(master, factor) if factor > 1 else master
        print(f"  {size}x{size}")

    names = {
        512: "icon.png",
        256: "128x128@2x.png",
        128: "128x128.png",
        32: "32x32.png",
    }
    for size, name in names.items():
        write_png(os.path.join(OUT_DIR, name), size, scaled[size])

    ico_sizes = [256, 128, 64, 48, 32, 16]
    pngs = [(s, png_bytes(scaled[s], s)) for s in ico_sizes]
    write_ico(os.path.join(OUT_DIR, "icon.ico"), pngs)
    print(f"icons written to {os.path.normpath(OUT_DIR)}")


if __name__ == "__main__":
    main()
