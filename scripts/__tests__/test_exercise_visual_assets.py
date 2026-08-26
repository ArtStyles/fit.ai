import hashlib
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.exercise_visual_assets import build_contact_sheet, build_poster
from scripts.validate_exercise_visual_assets import validate_catalog_assets, validate_image_file


class ExerciseVisualAssetsTest(unittest.TestCase):
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
