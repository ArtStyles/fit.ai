import hashlib
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.exercise_visual_assets import build_contact_sheet, build_poster
from scripts.validate_exercise_visual_assets import validate_image_file


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
