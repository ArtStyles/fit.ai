import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw


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
                expected_indexes = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1]
                actual_indexes = []
                reference_colors = [ImageColor.getrgb(color) for color in colors]
                for frame_index in range(animation.n_frames):
                    animation.seek(frame_index)
                    pixel = animation.convert("RGB").getpixel((256, 256))
                    nearest = min(
                        range(len(reference_colors)),
                        key=lambda color_index: sum(
                            (pixel[channel] - reference_colors[color_index][channel]) ** 2
                            for channel in range(3)
                        ),
                    )
                    actual_indexes.append(nearest)

                self.assertEqual(actual_indexes, expected_indexes)
                self.assertNotIn(5, actual_indexes)

    def test_rejects_a_sheet_without_three_to_two_aspect_ratio(self):
        result = self.run_builder_with_sheet((300, 300))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source sheet must use a 3:2 aspect ratio", result.stderr)

    def test_rejects_a_sheet_that_cannot_form_a_three_by_two_grid(self):
        result = self.run_builder_with_sheet((302, 302))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source sheet dimensions must be divisible by 3 and 2", result.stderr)

    def test_validate_decoded_frame_accepts_only_rgb_or_opaque_rgba(self):
        module = self.load_builder_module()

        module.validate_decoded_frame(Image.new("RGB", (1, 1), "#f8f3eb"))
        module.validate_decoded_frame(Image.new("RGBA", (1, 1), (248, 243, 235, 255)))
        with self.assertRaisesRegex(RuntimeError, "opaque RGBA"):
            module.validate_decoded_frame(Image.new("RGBA", (1, 1), (248, 243, 235, 0)))

    def test_writes_rgb_frames_with_exact_timing_and_size_budget(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory)
            output = self.build_valid_preview(temporary)

            with Image.open(output) as animation:
                self.assertEqual(animation.n_frames, 10)
                durations = [animation._get_next()[2] for _ in range(animation.n_frames)]
                self.assertEqual(durations, [180] * 10)
                for index in range(animation.n_frames):
                    animation.seek(index)
                    self.assertEqual(animation.mode, "RGB")
            self.assertLessEqual(output.stat().st_size, 500 * 1024)

    def test_can_write_a_local_contact_sheet(self):
        repo_root = Path(__file__).resolve().parents[2]
        script = repo_root / "scripts" / "build-exercise-motion-preview.py"
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory)
            source = self.create_valid_sheet(temporary)
            output = temporary / "motion-preview.webp"
            contact_sheet = temporary / "motion-contact-sheet.webp"

            result = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    "--input",
                    str(source),
                    "--output",
                    str(output),
                    "--contact-sheet",
                    str(contact_sheet),
                ],
                capture_output=True,
                check=False,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(contact_sheet.is_file())
            with Image.open(contact_sheet) as image:
                self.assertEqual(image.size, (5 * 256, 2 * 256))

    def test_cli_description_does_not_mention_arnold_press(self):
        repo_root = Path(__file__).resolve().parents[2]
        script = repo_root / "scripts" / "build-exercise-motion-preview.py"

        result = subprocess.run(
            [sys.executable, str(script), "--help"],
            capture_output=True,
            check=False,
            text=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("Arnold Press", result.stdout)

    def build_valid_preview(self, temporary: Path) -> Path:
        repo_root = Path(__file__).resolve().parents[2]
        script = repo_root / "scripts" / "build-exercise-motion-preview.py"
        source = self.create_valid_sheet(temporary)
        output = temporary / "motion-preview.webp"
        result = subprocess.run(
            [sys.executable, str(script), "--input", str(source), "--output", str(output)],
            capture_output=True,
            check=False,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return output

    def create_valid_sheet(self, temporary: Path) -> Path:
        source = temporary / "motion-source.png"
        sheet = Image.new("RGB", (300, 200), "#f8f3eb")
        draw = ImageDraw.Draw(sheet)
        for index, color in enumerate(("#ef6351", "#d94f4f", "#bd3f52", "#8d3f55", "#68435a", "#46465a")):
            column = index % 3
            row = index // 3
            draw.rectangle(
                (column * 100, row * 100, column * 100 + 99, row * 100 + 99),
                fill=color,
            )
        sheet.save(source)
        return source

    def run_builder_with_sheet(self, size: tuple[int, int]) -> subprocess.CompletedProcess[str]:
        repo_root = Path(__file__).resolve().parents[2]
        script = repo_root / "scripts" / "build-exercise-motion-preview.py"
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory)
            source = temporary / "motion-source.png"
            output = temporary / "motion-preview.webp"
            Image.new("RGB", size, "#f8f3eb").save(source)
            return subprocess.run(
                [sys.executable, str(script), "--input", str(source), "--output", str(output)],
                capture_output=True,
                check=False,
                text=True,
            )

    def load_builder_module(self):
        script = Path(__file__).resolve().parents[1] / "build-exercise-motion-preview.py"
        spec = importlib.util.spec_from_file_location("build_exercise_motion_preview", script)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module


if __name__ == "__main__":
    unittest.main()
