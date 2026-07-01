"""Installs the lightweight Argos runtime without optional Stanza/PyTorch."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def run(*arguments: str) -> None:
    subprocess.check_call([sys.executable, "-m", "pip", "install", *arguments])


def main() -> None:
    run("-r", str(ROOT / "scripts" / "requirements-translate.txt"))
    # This project uses MiniSBD, so the optional Stanza/SpaCy backends and their
    # large PyTorch dependency are unnecessary.
    run("--no-deps", "argostranslate==1.11.0")


if __name__ == "__main__":
    main()

