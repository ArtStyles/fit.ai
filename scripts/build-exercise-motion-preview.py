import argparse
from pathlib import Path

from PIL import Image


CANVAS_SIZE = (512, 512)
CANVAS_COLOR = (248, 243, 235)
CONTACT_TILE_SIZE = 256
ANIMATION_INDEXES = (0, 1, 2, 3, 4, 3, 2, 1, 0, 1)
FRAME_DURATION_MS = 180
MAX_PREVIEW_BYTES = 500 * 1024


def validate_source_sheet(sheet: Image.Image) -> None:
    if sheet.width % 3 != 0 or sheet.height % 2 != 0:
        raise ValueError("source sheet dimensions must be divisible by 3 and 2")
    if sheet.width * 2 != sheet.height * 3:
        raise ValueError("source sheet must use a 3:2 aspect ratio")


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


def validate_decoded_frame(frame: Image.Image) -> None:
    if frame.mode == "RGB":
        return
    if frame.mode == "RGBA" and frame.getchannel("A").getextrema() == (255, 255):
        return
    raise RuntimeError("motion preview frames must be RGB or opaque RGBA")


def validate_motion_preview(output: Path) -> None:
    if output.stat().st_size > MAX_PREVIEW_BYTES:
        raise RuntimeError("motion preview exceeds the size budget")

    with Image.open(output) as animation:
        if animation.format != "WEBP":
            raise RuntimeError("motion preview must be a WEBP")
        if not animation.is_animated:
            raise RuntimeError("motion preview must be animated")
        if animation.size != CANVAS_SIZE:
            raise RuntimeError("motion preview must use the configured canvas size")
        if animation.n_frames != len(ANIMATION_INDEXES):
            raise RuntimeError("motion preview must contain exactly 10 animated frames")
        durations = [animation._get_next()[2] for _ in range(animation.n_frames)]
        if any(duration != FRAME_DURATION_MS for duration in durations):
            raise RuntimeError("motion preview frames must use the configured duration")
        for index in range(animation.n_frames):
            animation.seek(index)
            validate_decoded_frame(animation)


def build_contact_sheet(frames: list[Image.Image], output: Path) -> None:
    contact_sheet = Image.new("RGB", (5 * CONTACT_TILE_SIZE, 2 * CONTACT_TILE_SIZE), CANVAS_COLOR)
    for index, frame in enumerate(frames):
        tile = frame.convert("RGB").resize(
            (CONTACT_TILE_SIZE, CONTACT_TILE_SIZE), Image.Resampling.LANCZOS
        )
        contact_sheet.paste(tile, ((index % 5) * CONTACT_TILE_SIZE, (index // 5) * CONTACT_TILE_SIZE))

    output.parent.mkdir(parents=True, exist_ok=True)
    contact_sheet.save(output, format="WEBP", quality=86, method=6)


def build_motion_preview(source: Path, output: Path, contact_sheet: Path | None = None) -> None:
    with Image.open(source) as sheet:
        validate_source_sheet(sheet)
        forward_frames = crop_six_frames(sheet)

    # The generated sixth panel is an experimental return pose and can drift back to the
    # starting position. Build a deterministic ping-pong loop from the five verified ascent
    # poses so the transition never jumps directly from start to full extension.
    loop_frames = [forward_frames[index].copy() for index in ANIMATION_INDEXES]
    output.parent.mkdir(parents=True, exist_ok=True)
    loop_frames[0].save(
        output,
        format="WEBP",
        save_all=True,
        append_images=loop_frames[1:],
        duration=[FRAME_DURATION_MS] * len(loop_frames),
        loop=0,
        quality=86,
        method=6,
    )
    validate_motion_preview(output)

    if contact_sheet is not None:
        build_contact_sheet(loop_frames, contact_sheet)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a deterministic Vekira exercise motion preview.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--contact-sheet", type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    build_motion_preview(arguments.input, arguments.output, arguments.contact_sheet)
