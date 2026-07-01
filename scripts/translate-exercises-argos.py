"""Local English-to-Spanish translation worker used by translate-exercises-es.ts."""

from __future__ import annotations

import json
import importlib.util
import os
from pathlib import Path
import sys
import types
from typing import Any


def configure_lightweight_runtime() -> None:
    os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")
    os.environ.setdefault("ARGOS_DEVICE_TYPE", "cpu")

    # Argos imports Stanza at module load even when MiniSBD is selected. Provide
    # a minimal unavailable-backend marker so Stanza/PyTorch are not required.
    if importlib.util.find_spec("stanza") is None:
        stanza = types.ModuleType("stanza")

        class DownloadMethod:
            REUSE_RESOURCES = "reuse_resources"

        def unavailable_pipeline(*_args: Any, **_kwargs: Any) -> None:
            raise RuntimeError("Stanza is unavailable; ARGOS_CHUNK_TYPE must be MINISBD")

        stanza.DownloadMethod = DownloadMethod  # type: ignore[attr-defined]
        stanza.Pipeline = unavailable_pipeline  # type: ignore[attr-defined]
        sys.modules["stanza"] = stanza


def load_argos() -> tuple[Any, Any]:
    configure_lightweight_runtime()
    try:
        import argostranslate.package as package
        import argostranslate.translate as translate
    except ImportError:
        print(
            "Argos Translate is not installed. Run: pnpm translate:setup",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return package, translate


def ensure_english_spanish_model(package: Any, translate: Any) -> None:
    languages = translate.get_installed_languages()
    english = next((language for language in languages if language.code == "en"), None)
    spanish = next((language for language in languages if language.code == "es"), None)
    if english and spanish and english.get_translation(spanish):
        return

    local_model = (
        Path(__file__).resolve().parent.parent
        / "artifacts"
        / "translate-en_es-1_0.argosmodel"
    )
    if local_model.exists():
        print("Installing the downloaded Argos English→Spanish model...", file=sys.stderr)
        package.install_from_path(local_model)
        return

    print("Downloading the Argos English→Spanish model (one-time setup)...", file=sys.stderr)
    package.update_package_index()
    model = next(
        (
            candidate
            for candidate in package.get_available_packages()
            if candidate.from_code == "en" and candidate.to_code == "es"
        ),
        None,
    )
    if model is None:
        raise RuntimeError("No English-to-Spanish Argos model is available")
    package.install_from_path(model.download())


def translate_text(value: str | None, translate: Any) -> str | None:
    if value is None:
        return None
    # The source stores one exercise step per line; translate them independently
    # to preserve the exact step structure in the Spanish result.
    return "\n".join(
        translate.translate(line, "en", "es") if line.strip() else ""
        for line in value.split("\n")
    ).strip()


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    package, translate = load_argos()
    ensure_english_spanish_model(package, translate)
    rows = json.load(sys.stdin)
    if not isinstance(rows, list):
        raise ValueError("Expected a JSON array")

    output = []
    for index, row in enumerate(rows, start=1):
        print(f"  translating {index}/{len(rows)} {row['name']}", file=sys.stderr)
        output.append(
            {
                "id": row["id"],
                "name_es": translate_text(row["name"], translate),
                "description_es": translate_text(row.get("description"), translate),
                "instructions_es": translate_text(row.get("instructions"), translate),
            }
        )

    json.dump(output, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
