"""Pillow-based validation for local catalog V1 visual artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Literal

from PIL import Image

POSTER_SIZE = 1024
POSTER_MAX_BYTES = 102400
MOTION_SIZE = (512, 512)
MOTION_FRAME_COUNT = 10
MOTION_FRAME_DURATION_MS = 180
MOTION_MAX_BYTES = 500 * 1024
MOTION_PILOT_SLUGS = (
    "arnold-press-mancuernas",
    "sentadilla-trasera-barra",
    "press-banca-barra",
    "peso-muerto-rumano-barra",
    "jalon-pecho-polea",
    "remo-sentado-polea",
    "elevacion-lateral-mancuernas",
    "curl-biceps-barra-ez",
    "extension-triceps-cuerda",
    "rueda-abdominal-rodillas",
)
AssetKind = Literal["poster", "source"]


def validate_image_file(path: Path, kind: AssetKind) -> list[str]:
    """Return image-format and geometry errors for one catalog asset."""
    try:
        with Image.open(path) as image:
            image_format = image.format
            width, height = image.size
    except (OSError, ValueError):
        return [f"invalid {kind}: {path.name}"]

    if kind == "source":
        if image_format != "PNG":
            return [f"source must be PNG: {path.name}"]
        if width != height:
            return [f"source must be square: {path.name}"]
        if width < POSTER_SIZE:
            return [f"source must be at least {POSTER_SIZE} x {POSTER_SIZE}: {path.name}"]
        return []

    if image_format != "WEBP":
        return [f"poster must be WebP: {path.name}"]
    if width != height or width != POSTER_SIZE:
        return [f"poster must be {POSTER_SIZE} x {POSTER_SIZE}: {path.name}"]
    if path.stat().st_size > POSTER_MAX_BYTES:
        return [f"poster exceeds {POSTER_MAX_BYTES} bytes: {path.name}"]
    return []


def _is_opaque_decoded_frame(image: Image.Image) -> bool:
    return image.mode == "RGB" or (
        image.mode == "RGBA" and image.getchannel("A").getextrema() == (255, 255)
    )


def validate_motion_file(path: Path) -> list[str]:
    """Return binary-contract errors for one animated motion preview."""
    if path.stat().st_size > MOTION_MAX_BYTES:
        return [f"motion preview exceeds {MOTION_MAX_BYTES} bytes: {path.name}"]
    try:
        with Image.open(path) as image:
            if image.format != "WEBP":
                return [f"motion preview must be WebP: {path.name}"]
            if not image.is_animated:
                return [f"motion preview must be animated: {path.name}"]
            if image.size != MOTION_SIZE:
                return [f"motion preview must be 512 x 512: {path.name}"]
            if image.n_frames != MOTION_FRAME_COUNT:
                return [f"motion preview must contain exactly 10 animated frames: {path.name}"]
            durations = [image._get_next()[2] for _ in range(image.n_frames)]
            if any(duration != MOTION_FRAME_DURATION_MS for duration in durations):
                return [f"motion preview frames must use 180 ms: {path.name}"]
            for index in range(image.n_frames):
                image.seek(index)
                if not _is_opaque_decoded_frame(image):
                    return [f"motion preview frames must be RGB or opaque RGBA: {path.name}"]
    except (OSError, ValueError):
        return [f"invalid motion preview: {path.name}"]
    return []


def _path_within(root: Path, value: str) -> Path | None:
    candidate = (root / value.lstrip("/\\")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_catalog_assets(
    manifest: dict[str, object],
    public_root: Path,
    artifacts_root: Path,
    complete: bool,
    motion_artifacts_root: Path | None = None,
    motion_pilot: bool = False,
) -> list[str]:
    """Validate V1 artifact files for reviewed entries, or all entries in complete mode."""
    errors: list[str] = []
    exercises = manifest.get("exercises")
    if not isinstance(exercises, list):
        return ["manifest exercises must be a list"]
    if motion_artifacts_root is None:
        motion_artifacts_root = artifacts_root.parent / "catalog-v1-motion"

    for entry in exercises:
        if not isinstance(entry, dict):
            continue
        status = entry.get("status")
        slug = entry.get("slug")
        assets = entry.get("assets")
        if not isinstance(slug, str):
            errors.append("entry must include slug and assets")
            continue

        motion = entry.get("motion")
        if isinstance(motion, dict):
            preview_value = motion.get("preview")
            preview_hash = motion.get("previewSha256")
            preview_bytes = motion.get("previewBytes")
            source_hash = motion.get("sourceSha256")
            if not isinstance(preview_hash, str) or not preview_hash:
                errors.append(f"missing motion preview digest: {slug}")
            if not isinstance(source_hash, str) or not source_hash:
                errors.append(f"missing motion source digest: {slug}")
            if not isinstance(preview_bytes, int):
                errors.append(f"missing motion preview size: {slug}")
            elif preview_bytes > MOTION_MAX_BYTES:
                errors.append(f"motion preview exceeds {MOTION_MAX_BYTES} bytes: {slug}")
            if not isinstance(preview_value, str):
                errors.append(f"missing motion preview: {slug}")
            else:
                preview_path = _path_within(public_root, preview_value)
                if preview_path is None:
                    errors.append(f"motion preview path escapes public root: {slug}")
                elif not preview_path.exists():
                    errors.append(f"missing motion preview: {slug}")
                elif not preview_path.is_file():
                    errors.append(f"motion preview is not a regular file: {slug}")
                else:
                    errors.extend(validate_motion_file(preview_path))
                    if preview_path.stat().st_size != preview_bytes:
                        errors.append(f"motion preview size mismatch: {slug}")
                    if isinstance(preview_hash, str) and preview_hash and _digest(preview_path) != preview_hash:
                        errors.append(f"motion preview digest mismatch: {slug}")

            motion_source_path = _path_within(motion_artifacts_root, f"{slug}/motion-source.png")
            if motion_source_path is None:
                errors.append(f"motion source path escapes artifacts root: {slug}")
            elif not motion_source_path.exists():
                errors.append(f"missing motion source: {slug}")
            elif not motion_source_path.is_file():
                errors.append(f"motion source is not a regular file: {slug}")
            elif isinstance(source_hash, str) and source_hash and _digest(motion_source_path) != source_hash:
                errors.append(f"motion source digest mismatch: {slug}")

        if not complete and status == "draft":
            continue
        if not isinstance(assets, dict):
            errors.append("entry must include slug and assets")
            continue

        poster_value = assets.get("poster")
        poster_hash = assets.get("posterSha256")
        source_hash = assets.get("sourceSha256")
        if not isinstance(poster_hash, str) or not poster_hash:
            errors.append(f"missing poster digest: {slug}")
        if not isinstance(source_hash, str) or not source_hash:
            errors.append(f"missing source digest: {slug}")
        if not isinstance(poster_value, str):
            errors.append(f"missing poster: {slug}")
        else:
            poster_path = _path_within(public_root, poster_value)
            if poster_path is None:
                errors.append(f"poster path escapes public root: {slug}")
            elif not poster_path.exists():
                errors.append(f"missing poster: {slug}")
            elif not poster_path.is_file():
                errors.append(f"poster is not a regular file: {slug}")
            else:
                errors.extend(validate_image_file(poster_path, "poster"))
                if isinstance(poster_hash, str) and poster_hash and _digest(poster_path) != poster_hash:
                    errors.append(f"poster digest mismatch: {slug}")

        source_key = assets.get("sourceObjectKey")
        if not isinstance(source_key, str):
            errors.append(f"missing source metadata: {slug}")
        source_path = _path_within(artifacts_root, f"{slug}/source.png")
        if source_path is None:
            errors.append(f"source path escapes artifacts root: {slug}")
        elif not source_path.exists():
            errors.append(f"missing source: {slug}")
        elif not source_path.is_file():
            errors.append(f"source is not a regular file: {slug}")
        else:
            errors.extend(validate_image_file(source_path, "source"))
            if isinstance(source_hash, str) and source_hash and _digest(source_path) != source_hash:
                errors.append(f"source digest mismatch: {slug}")

    if motion_pilot:
        motion_slugs = {
            entry.get("slug")
            for entry in exercises
            if isinstance(entry, dict) and isinstance(entry.get("motion"), dict)
        }
        if motion_slugs != set(MOTION_PILOT_SLUGS):
            errors.append("motion pilot must contain exactly the 10 selected slugs")
        for entry in exercises:
            if not isinstance(entry, dict) or not isinstance(entry.get("slug"), str):
                continue
            slug = entry["slug"]
            if entry.get("status") != "visual-approved":
                errors.append(f"motion pilot exercise must be visual-approved: {slug}")
            reviews = entry.get("reviews")
            if isinstance(reviews, dict) and "technique" in reviews:
                errors.append(f"motion pilot exercise must not include a technique review: {slug}")
            motion = entry.get("motion")
            if slug not in MOTION_PILOT_SLUGS and isinstance(motion, dict):
                errors.append(f"motion is not selected for pilot: {slug}")
            if slug in MOTION_PILOT_SLUGS and (
                not isinstance(motion, dict) or motion.get("status") != "visual-approved"
            ):
                errors.append(f"motion pilot motion must be visual-approved: {slug}")

    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate catalog V1 exercise visual artifacts.")
    parser.add_argument("--complete", action="store_true", help="Require every manifest entry to have valid artifacts.")
    parser.add_argument("--motion-pilot", action="store_true", help="Require the exact V1 motion pilot.")
    arguments = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    manifest_path = root / "public" / "exercises" / "catalog" / "v1" / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Unable to read catalog V1 manifest: {error}")
        raise SystemExit(1) from error

    errors = validate_catalog_assets(
        manifest,
        root / "public",
        root / ".artifacts" / "exercises" / "catalog-v1",
        arguments.complete,
        root / ".artifacts" / "exercises" / "catalog-v1-motion",
        arguments.motion_pilot,
    )
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    print("Catalog V1 Pillow asset validation is valid.")


if __name__ == "__main__":
    main()
