"""Deterministic local build helpers for catalog V1 exercise posters."""

from __future__ import annotations

import argparse
import hashlib
import math
from pathlib import Path

from PIL import Image, ImageOps

POSTER_SIZE = 1024
POSTER_MAX_BYTES = 102400
IVORY = "#f8f3eb"


def build_poster(source: Path, output: Path) -> str:
    """Convert an image source into the bounded V1 WebP poster artifact."""
    with Image.open(source) as image:
        contained = ImageOps.contain(image.convert("RGB"), (POSTER_SIZE, POSTER_SIZE), Image.Resampling.LANCZOS)

    poster = Image.new("RGB", (POSTER_SIZE, POSTER_SIZE), IVORY)
    offset = ((POSTER_SIZE - contained.width) // 2, (POSTER_SIZE - contained.height) // 2)
    poster.paste(contained, offset)
    output.parent.mkdir(parents=True, exist_ok=True)

    for quality in (88, 84, 80, 76, 72):
        poster.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size <= POSTER_MAX_BYTES:
            return hashlib.sha256(output.read_bytes()).hexdigest()

    output.unlink(missing_ok=True)
    raise ValueError(f"unable to create a WebP poster within {POSTER_MAX_BYTES} bytes")


def build_contact_sheet(
    posters: list[Path],
    output: Path,
    tile_size: int,
    columns: int | None = None,
) -> None:
    """Create one unlabelled row-major review sheet from poster files."""
    if tile_size <= 0:
        raise ValueError("tile_size must be positive")
    if columns is not None and columns <= 0:
        raise ValueError("columns must be positive")
    if not posters:
        raise ValueError("posters must not be empty")

    gap = 12
    column_count = min(columns or len(posters), len(posters))
    row_count = math.ceil(len(posters) / column_count)
    width = tile_size * column_count + gap * (column_count - 1)
    height = tile_size * row_count + gap * (row_count - 1)
    contact_sheet = Image.new("RGB", (width, height), IVORY)
    for index, poster_path in enumerate(posters):
        with Image.open(poster_path) as image:
            tile = ImageOps.contain(image.convert("RGB"), (tile_size, tile_size), Image.Resampling.LANCZOS)
        column = index % column_count
        row = index // column_count
        offset_x = column * (tile_size + gap) + (tile_size - tile.width) // 2
        offset_y = row * (tile_size + gap) + (tile_size - tile.height) // 2
        contact_sheet.paste(tile, (offset_x, offset_y))

    output.parent.mkdir(parents=True, exist_ok=True)
    contact_sheet.save(output, "WEBP", quality=88, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build V1 exercise visual artifacts.")
    subcommands = parser.add_subparsers(dest="command", required=True)

    poster_parser = subcommands.add_parser("poster")
    poster_parser.add_argument("--input", required=True, type=Path)
    poster_parser.add_argument("--output", required=True, type=Path)

    sheet_parser = subcommands.add_parser("contact-sheet")
    sheet_parser.add_argument("--tile-size", required=True, type=int)
    sheet_parser.add_argument("--output", required=True, type=Path)
    sheet_parser.add_argument("--columns", type=int)
    sheet_parser.add_argument("posters", nargs="+", type=Path)

    arguments = parser.parse_args()
    if arguments.command == "poster":
        print(build_poster(arguments.input, arguments.output))
    else:
        build_contact_sheet(arguments.posters, arguments.output, arguments.tile_size, arguments.columns)


if __name__ == "__main__":
    main()
