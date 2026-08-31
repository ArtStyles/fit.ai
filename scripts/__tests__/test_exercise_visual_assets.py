import hashlib
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.exercise_visual_assets import build_contact_sheet, build_poster
from scripts.validate_exercise_visual_assets import (
    CATALOG_V1_EXERCISE_SLUGS,
    MOTION_MAX_BYTES,
    MOTION_PILOT_SLUGS,
    validate_catalog_assets,
    validate_image_file,
    validate_motion_file,
    validate_motion_pilot_manifest,
)


class ExerciseVisualAssetsTest(unittest.TestCase):
    def write_motion_preview(
        self,
        path: Path,
        *,
        size: tuple[int, int] = (512, 512),
        frames: int = 10,
        duration: int = 180,
        mode: str = "RGB",
        alpha: int = 255,
    ) -> None:
        images = [Image.new(mode, size, (index * 20, 40, 80, alpha) if mode == "RGBA" else (index * 20, 40, 80)) for index in range(frames)]
        images[0].save(
            path,
            "WEBP",
            save_all=True,
            append_images=images[1:],
            duration=[duration] * frames,
            loop=0,
            quality=80,
            method=0,
        )

    def test_validates_the_fixed_animated_motion_webp_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            preview = root / "motion-preview.webp"
            self.write_motion_preview(preview)

            self.assertEqual(validate_motion_file(preview), [])

    def test_rejects_transparent_rgba_motion_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            preview = Path(directory) / "transparent-motion.webp"
            self.write_motion_preview(preview, mode="RGBA", alpha=127)

            self.assertEqual(
                validate_motion_file(preview),
                ["motion preview frames must be RGB or opaque RGBA: transparent-motion.webp"],
            )

    def motion_pilot_entries(self, motion_count: int = 10) -> list[dict[str, object]]:
        motion_slugs = set(MOTION_PILOT_SLUGS[:motion_count])
        return [
            {
                "slug": slug,
                "status": "visual-approved",
                "reviews": {},
                **({"motion": {"status": "visual-approved"}} if slug in motion_slugs else {}),
            }
            for slug in CATALOG_V1_EXERCISE_SLUGS
        ]

    def test_motion_pilot_gate_requires_the_full_catalog_and_exact_ten(self):
        all_ten = self.motion_pilot_entries()
        self.assertEqual(validate_motion_pilot_manifest(all_ten), [])

        reduced = [entry for entry in all_ten if entry["slug"] in MOTION_PILOT_SLUGS]
        self.assertIn(
            "motion pilot manifest must contain exactly the 50 supported V1 slugs",
            validate_motion_pilot_manifest(reduced),
        )
        self.assertIn(
            "motion pilot must contain exactly the 10 selected slugs",
            validate_motion_pilot_manifest(self.motion_pilot_entries(9)),
        )

    def test_accepts_opaque_rgba_motion_frames_without_converting_before_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            preview = Path(directory) / "motion-preview.webp"
            self.write_motion_preview(preview, mode="RGBA")

            self.assertEqual(validate_motion_file(preview), [])

    def test_rejects_invalid_motion_preview_format_geometry_frames_timing_size_and_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wrong_format = root / "motion-preview.png"
            wrong_size = root / "wrong-size.webp"
            wrong_frames = root / "wrong-frames.webp"
            wrong_duration = root / "wrong-duration.webp"
            too_large = root / "too-large.webp"
            Image.new("RGB", (512, 512), "#f8f3eb").save(wrong_format, "PNG")
            self.write_motion_preview(wrong_size, size=(511, 512))
            self.write_motion_preview(wrong_frames, frames=9)
            self.write_motion_preview(wrong_duration, duration=200)
            self.write_motion_preview(too_large)
            too_large.write_bytes(too_large.read_bytes() + b"x" * (MOTION_MAX_BYTES + 1))

            self.assertEqual(validate_motion_file(wrong_format), ["motion preview must be WebP: motion-preview.png"])
            self.assertEqual(validate_motion_file(wrong_size), ["motion preview must be 512 x 512: wrong-size.webp"])
            self.assertEqual(validate_motion_file(wrong_frames), ["motion preview must contain exactly 10 animated frames: wrong-frames.webp"])
            self.assertEqual(validate_motion_file(wrong_duration), ["motion preview frames must use 180 ms: wrong-duration.webp"])
            self.assertEqual(validate_motion_file(too_large), [f"motion preview exceeds {MOTION_MAX_BYTES} bytes: too-large.webp"])

            public_root = root / "public"
            artifacts_root = root / "catalog-v1"
            motion_artifacts_root = root / "catalog-v1-motion"
            slug = "sentadilla-trasera-barra"
            poster = public_root / "exercises" / "catalog" / "v1" / slug / "poster.webp"
            source = artifacts_root / slug / "source.png"
            motion_path = public_root / "exercises" / "catalog" / "v1" / slug / "motion-preview.webp"
            motion_source = motion_artifacts_root / slug / "motion-source.png"
            poster.parent.mkdir(parents=True)
            source.parent.mkdir(parents=True)
            motion_source.parent.mkdir(parents=True)
            Image.new("RGB", (1024, 1024), "#f8f3eb").save(poster, "WEBP")
            Image.new("RGB", (1254, 1254), "#f8f3eb").save(source, "PNG")
            self.write_motion_preview(motion_path)
            Image.new("RGB", (300, 200), "#f8f3eb").save(motion_source, "PNG")
            manifest = {"exercises": [{
                "slug": slug,
                "status": "visual-approved",
                "assets": {
                    "poster": f"/exercises/catalog/v1/{slug}/poster.webp",
                    "posterSha256": hashlib.sha256(poster.read_bytes()).hexdigest(),
                    "sourceObjectKey": "v1/archive/remote-identity.png",
                    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                },
                "motion": {
                    "preview": f"/exercises/catalog/v1/{slug}/motion-preview.webp",
                    "previewSha256": "0" * 64,
                    "previewBytes": motion_path.stat().st_size,
                    "sourceSha256": hashlib.sha256(motion_source.read_bytes()).hexdigest(),
                },
            }]}

            self.assertIn(
                f"motion preview digest mismatch: {slug}",
                validate_catalog_assets(manifest, public_root, artifacts_root, False, motion_artifacts_root),
            )

            manifest["exercises"][0]["motion"]["previewSha256"] = hashlib.sha256(motion_path.read_bytes()).hexdigest()
            manifest["exercises"][0]["motion"]["sourceSha256"] = "0" * 64
            self.assertIn(
                f"motion source digest mismatch: {slug}",
                validate_catalog_assets(manifest, public_root, artifacts_root, False, motion_artifacts_root),
            )

    def test_rejects_non_regular_motion_preview_and_source_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public_root = root / "public"
            artifacts_root = root / "catalog-v1"
            motion_artifacts_root = root / "catalog-v1-motion"
            slug = "sentadilla-trasera-barra"
            preview = public_root / "exercises" / "catalog" / "v1" / slug / "motion-preview.webp"
            source = motion_artifacts_root / slug / "motion-source.png"
            preview.parent.mkdir(parents=True)
            source.parent.mkdir(parents=True)
            preview.mkdir()
            source.mkdir()
            manifest = {"exercises": [{
                "slug": slug,
                "status": "draft",
                "motion": {
                    "preview": f"/exercises/catalog/v1/{slug}/motion-preview.webp",
                    "previewSha256": "0" * 64,
                    "previewBytes": 1,
                    "sourceSha256": "0" * 64,
                },
            }]}

            errors = validate_catalog_assets(manifest, public_root, artifacts_root, False, motion_artifacts_root)
            self.assertIn(f"motion preview is not a regular file: {slug}", errors)
            self.assertIn(f"motion source is not a regular file: {slug}", errors)
    def test_builds_bounded_square_webp(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            poster = root / "poster.webp"
            Image.new("RGB", (1254, 1254), "#f8f3eb").save(source)

            digest = build_poster(source, poster)

            with Image.open(poster) as image:
                self.assertEqual(image.format, "WEBP")
                self.assertEqual(image.size, (1024, 1024))
            self.assertLessEqual(poster.stat().st_size, 102400)
            self.assertEqual(digest, hashlib.sha256(poster.read_bytes()).hexdigest())

    def test_builds_one_horizontal_contact_sheet_at_each_requested_size(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            posters = []
            for index, color in enumerate(["#7f1d1d", "#9a3412", "#a16207", "#365314", "#1d4ed8"]):
                poster = root / f"poster-{index}.webp"
                Image.new("RGB", (1024, 1024), color).save(poster, "WEBP")
                posters.append(poster)

            for tile_size in (512, 80):
                sheet = root / f"sheet-{tile_size}.webp"
                build_contact_sheet(posters, sheet, tile_size)
                with Image.open(sheet) as image:
                    self.assertEqual(image.size, (tile_size * 5 + 12 * 4, tile_size))

    def test_builds_a_row_major_contact_sheet_grid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            posters = []
            for index in range(7):
                poster = root / f"poster-{index}.webp"
                Image.new("RGB", (1024, 1024), (20 * index, 40, 80)).save(poster, "WEBP")
                posters.append(poster)

            sheet = root / "grid.webp"
            build_contact_sheet(posters, sheet, 80, columns=3)

            with Image.open(sheet) as image:
                self.assertEqual(image.size, (264, 264))
                for actual, expected in zip(image.getpixel((4, 188)), (120, 40, 80), strict=True):
                    self.assertAlmostEqual(actual, expected, delta=3)

    def test_rejects_non_positive_contact_sheet_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            poster = root / "poster.webp"
            Image.new("RGB", (1024, 1024), "#f8f3eb").save(poster, "WEBP")

            with self.assertRaisesRegex(ValueError, "columns must be positive"):
                build_contact_sheet([poster], root / "grid.webp", 80, columns=0)

            with self.assertRaisesRegex(ValueError, "posters must not be empty"):
                build_contact_sheet([], root / "empty.webp", 80, columns=3)

    def test_rejects_invalid_poster_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            non_square = root / "non-square.png"
            small = root / "small.webp"
            too_large = root / "too-large.webp"
            wrong_format = root / "wrong-format.png"
            Image.new("RGB", (1024, 900), "#f8f3eb").save(non_square)
            Image.new("RGB", (900, 900), "#f8f3eb").save(small, "WEBP")
            Image.new("RGB", (1024, 1024), "#f8f3eb").save(too_large, "WEBP")
            too_large.write_bytes(too_large.read_bytes() + b"x" * 102401)
            Image.new("RGB", (1024, 1024), "#f8f3eb").save(wrong_format, "PNG")

            self.assertEqual(validate_image_file(non_square, "source"), ["source must be square: non-square.png"])
            self.assertEqual(validate_image_file(small, "poster"), ["poster must be 1024 x 1024: small.webp"])
            self.assertEqual(validate_image_file(too_large, "poster"), ["poster exceeds 102400 bytes: too-large.webp"])
            self.assertEqual(validate_image_file(wrong_format, "poster"), ["poster must be WebP: wrong-format.png"])

    def test_validates_the_local_staged_source_path_instead_of_remote_archive_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public_root = root / "public"
            artifacts_root = root / "artifacts"
            slug = "sentadilla-trasera-barra"
            poster = public_root / "exercises" / "catalog" / "v1" / slug / "poster.webp"
            source = artifacts_root / slug / "source.png"
            poster.parent.mkdir(parents=True)
            source.parent.mkdir(parents=True)
            Image.new("RGB", (1024, 1024), "#f8f3eb").save(poster, "WEBP")
            Image.new("RGB", (1254, 1254), "#f8f3eb").save(source, "PNG")
            poster_hash = hashlib.sha256(poster.read_bytes()).hexdigest()
            source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            manifest = {"exercises": [{
                "slug": slug,
                "status": "visual-approved",
                "assets": {
                    "poster": f"/exercises/catalog/v1/{slug}/poster.webp",
                    "posterSha256": poster_hash,
                    "sourceObjectKey": "v1/archive/remote-identity.png",
                    "sourceSha256": source_hash,
                },
            }]}

            self.assertEqual(validate_catalog_assets(manifest, public_root, artifacts_root, False), [])

    def test_requires_hashes_and_regular_asset_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public_root = root / "public"
            artifacts_root = root / "artifacts"
            slug = "sentadilla-trasera-barra"
            poster = public_root / "exercises" / "catalog" / "v1" / slug / "poster.webp"
            source = artifacts_root / slug / "source.png"
            poster.parent.mkdir(parents=True)
            source.parent.mkdir(parents=True)
            Image.new("RGB", (1024, 1024), "#f8f3eb").save(poster, "WEBP")
            Image.new("RGB", (1254, 1254), "#f8f3eb").save(source, "PNG")
            manifest = {"exercises": [{
                "slug": slug,
                "status": "visual-approved",
                "assets": {
                    "poster": f"/exercises/catalog/v1/{slug}/poster.webp",
                    "sourceObjectKey": "v1/archive/remote-identity.png",
                },
            }]}

            errors = validate_catalog_assets(manifest, public_root, artifacts_root, False)
            self.assertIn(f"missing poster digest: {slug}", errors)
            self.assertIn(f"missing source digest: {slug}", errors)

            poster.unlink()
            poster.mkdir()
            errors = validate_catalog_assets(manifest, public_root, artifacts_root, False)
            self.assertIn(f"poster is not a regular file: {slug}", errors)

    def test_partial_validation_checks_every_non_draft_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public_root = root / "public"
            artifacts_root = root / "artifacts"
            slug = "sentadilla-trasera-barra"
            poster = public_root / "exercises" / "catalog" / "v1" / slug / "poster.webp"
            source = artifacts_root / slug / "source.png"
            poster.parent.mkdir(parents=True)
            source.parent.mkdir(parents=True)
            Image.new("RGB", (1024, 1024), "#f8f3eb").save(poster, "WEBP")
            Image.new("RGB", (1254, 1254), "#f8f3eb").save(source, "PNG")
            source_hash = hashlib.sha256(source.read_bytes()).hexdigest()

            for status in ("technique-approved", "published"):
                manifest = {"exercises": [{
                    "slug": slug,
                    "status": status,
                    "assets": {
                        "poster": f"/exercises/catalog/v1/{slug}/poster.webp",
                        "posterSha256": "0" * 64,
                        "sourceSha256": source_hash,
                        "sourceObjectKey": f"v1/{slug}/{source_hash}.png",
                    },
                }]}
                with self.subTest(status=status):
                    self.assertIn(
                        f"poster digest mismatch: {slug}",
                        validate_catalog_assets(manifest, public_root, artifacts_root, False),
                    )
