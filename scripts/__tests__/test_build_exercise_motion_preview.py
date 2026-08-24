import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


class BuildExerciseMotionPreviewTest(unittest.TestCase):
    def test_builds_ten_frame_animated_webp_from_six_cell_sheet(self):
        repo_root = Path(__file__).resolve().parents[2]
        script = repo_root / "scripts" / "build-exercise-motion-preview.py"

        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory)
            source = temporary / "motion-source.png"
            output = temporary / "motion-preview.webp"
            sheet = Image.new("RGB", (300, 200), "#f8f3eb")
            draw = ImageDraw.Draw(sheet)
            colors = ["#ef6351", "#d94f4f", "#bd3f52", "#8d3f55", "#68435a", "#46465a"]
            for index, color in enumerate(colors):
                column = index % 3
                row = index // 3
                draw.rectangle(
                    (column * 100, row * 100, column * 100 + 99, row * 100 + 99),
                    fill=color,
                )
            sheet.save(source)

            result = subprocess.run(
                [sys.executable, str(script), "--input", str(source), "--output", str(output)],
                capture_output=True,
                check=False,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            with Image.open(output) as animation:
                self.assertTrue(animation.is_animated)
                self.assertEqual(animation.n_frames, 10)
                self.assertEqual(animation.size, (512, 512))


if __name__ == "__main__":
    unittest.main()
