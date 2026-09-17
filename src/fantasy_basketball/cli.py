from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import run_import


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate and normalize historical Fantrax auction data."
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Repository root (defaults to the current directory).",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/seasons.json"),
        help="Season configuration path, relative to the project root.",
    )
    parser.add_argument(
        "--aliases",
        type=Path,
        default=Path("config/player_aliases.csv"),
        help="Player alias path, relative to the project root.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh Fantrax API responses instead of using the local cache.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when validation errors remain.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    root = args.project_root.resolve()
    config = args.config if args.config.is_absolute() else root / args.config
    aliases = args.aliases if args.aliases.is_absolute() else root / args.aliases
    report = run_import(root, config, aliases, refresh=args.refresh)
    print(json.dumps(report["summary"], indent=2))
    if args.strict and not report["valid"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
