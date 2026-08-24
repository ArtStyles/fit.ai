import argparse
from pathlib import Path

from PIL import Image


CANVAS_SIZE = (512, 512)
CANVAS_COLOR = (248, 243, 235)


def fit_on_canvas(frame: Image.Image) -> Image.Image:
    image = frame.convert("RGB")
    image.thumbnail(CANVAS_SIZE, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", CANVAS_SIZE, CANVAS_COLOR)
    canvas.paste(
        image,
        ((CANVAS_SIZE[0] - image.width) // 2, (CANVAS_SIZE[1] - image.height) // 2),
    )
    return canvas


def crop_six_frames(sheet: Image.Image) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for index in range(6):
        column = index % 3
        row = index // 3
        left = column * sheet.width // 3
        right = (column + 1) * sheet.width // 3
        top = row * sheet.height // 2
        bottom = (row + 1) * sheet.height // 2
        frames.append(fit_on_canvas(sheet.crop((left, top, right, bottom))))
    return frames


def build_motion_preview(source: Path, output: Path) -> None:
    with Image.open(source) as sheet:
        forward_frames = crop_six_frames(sheet)

    loop_frames = forward_frames + [forward_frames[index].copy() for index in (4, 3, 2, 1)]
    output.parent.mkdir(parents=True, exist_ok=True)
    loop_frames[0].save(
        output,
        format="WEBP",
        save_all=True,
        append_images=loop_frames[1:],
        duration=180,
        loop=0,
        quality=86,
        method=6,
    )

    with Image.open(output) as animation:
        if not animation.is_animated or animation.n_frames != 10:
            raise RuntimeError("motion preview must contain exactly 10 animated frames")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Vekira Arnold Press motion preview.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    build_motion_preview(arguments.input, arguments.output)
