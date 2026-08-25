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


def _path_within(root: Path, value: str) -> Path | None:
    candidate = (root / value.lstrip("/\\")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_catalog_assets(manifest: dict[str, object], public_root: Path, artifacts_root: Path, complete: bool) -> list[str]:
    """Validate V1 artifact files for reviewed entries, or all entries in complete mode."""
    errors: list[str] = []
    exercises = manifest.get("exercises")
    if not isinstance(exercises, list):
        return ["manifest exercises must be a list"]

    for entry in exercises:
        if not isinstance(entry, dict):
            continue
        status = entry.get("status")
        if not complete and status != "visual-approved":
            continue
        slug = entry.get("slug")
        assets = entry.get("assets")
        if not isinstance(slug, str) or not isinstance(assets, dict):
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

    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate catalog V1 exercise visual artifacts.")
    parser.add_argument("--complete", action="store_true", help="Require every manifest entry to have valid artifacts.")
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
    )
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    print("Catalog V1 Pillow asset validation is valid.")


if __name__ == "__main__":
    main()
