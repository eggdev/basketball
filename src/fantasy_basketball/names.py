from __future__ import annotations

import csv
import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

from .models import NameMatch, Player


SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def fantrax_display_name(value: str) -> str:
    """Convert Fantrax's 'Last, First' names to the usual display order."""
    if "," not in value:
        return value.strip()
    family, given = (part.strip() for part in value.split(",", 1))
    return f"{given} {family}".strip()


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(character for character in value if not unicodedata.combining(character))
    value = value.lower().replace("&", " and ")
    # Fantrax inconsistently retains apostrophes and periods (for example,
    # De'Aaron/DeAaron and T.J./TJ). They do not change player identity.
    value = value.replace("'", "").replace("’", "").replace(".", "")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def without_suffix(value: str) -> str:
    tokens = normalize_name(value).split()
    while tokens and tokens[-1] in SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


def _first_last_tokens(value: str) -> tuple[str, str]:
    tokens = without_suffix(value).split()
    if not tokens:
        return "", ""
    return tokens[0], tokens[-1]


@dataclass(frozen=True)
class AliasTarget:
    season: str
    source: str
    canonical_name: str


def load_aliases(path: Path) -> dict[tuple[str, str], AliasTarget]:
    aliases: dict[tuple[str, str], AliasTarget] = {}
    if not path.exists():
        return aliases
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            season = row["season"].strip()
            source = row["alias"].strip()
            aliases[(season, normalize_name(source))] = AliasTarget(
                season=season,
                source=source,
                canonical_name=row["canonical_name"].strip(),
            )
    return aliases


def _alias_target(
    season: str,
    source_name: str,
    aliases: dict[tuple[str, str], AliasTarget],
) -> str | None:
    key = normalize_name(source_name)
    target = aliases.get((season, key)) or aliases.get(("*", key))
    return target.canonical_name if target else None


def canonical_alias_name(
    season: str,
    source_name: str,
    aliases: dict[tuple[str, str], AliasTarget],
) -> str | None:
    return _alias_target(season, source_name, aliases)


def player_key(value: str) -> str:
    """Provisional cross-season identity until an NBA-wide ID is added."""
    return without_suffix(value).replace(" ", "-")


def score_name(
    season: str,
    source_name: str,
    player: Player,
    aliases: dict[tuple[str, str], AliasTarget],
) -> tuple[float, str]:
    source = normalize_name(source_name)
    canonical = normalize_name(player.name)
    source_base = without_suffix(source_name)
    canonical_base = without_suffix(player.name)

    target = _alias_target(season, source_name, aliases)
    if target and without_suffix(target) == canonical_base:
        return 1.0, "alias"
    if source == canonical:
        return 1.0, "exact"
    if source_base == canonical_base:
        return 0.99, "exact_without_suffix"

    source_tokens = source_base.split()
    canonical_tokens = canonical_base.split()
    first, last = _first_last_tokens(player.name)
    if len(source_tokens) == 1:
        token = source_tokens[0]
        if token == first or token == last:
            return 0.95, "unique_first_or_last"
        if len(token) >= 4 and (first.startswith(token) or last.startswith(token)):
            return 0.88, "name_prefix"

    if len(source_tokens) == len(canonical_tokens) and source_tokens:
        if all(
            candidate.startswith(source_token)
            for source_token, candidate in zip(source_tokens, canonical_tokens)
        ):
            return 0.93, "token_prefix"

    compact_source = source_base.replace(" ", "")
    compact_canonical = canonical_base.replace(" ", "")
    full_ratio = SequenceMatcher(None, compact_source, compact_canonical).ratio()
    edge_ratio = max(
        SequenceMatcher(None, source_base, first).ratio(),
        SequenceMatcher(None, source_base, last).ratio(),
    )
    ratio = max(full_ratio, edge_ratio * 0.94)
    return ratio, "fuzzy"


def best_name_match(
    season: str,
    source_name: str,
    players: list[Player],
    aliases: dict[tuple[str, str], AliasTarget],
    minimum_score: float = 0.0,
    minimum_margin: float = 0.0,
) -> NameMatch | None:
    ranked = sorted(
        (
            (*score_name(season, source_name, player, aliases), player)
            for player in players
        ),
        key=lambda item: (-item[0], item[2].name, item[2].fantrax_id),
    )
    if not ranked or ranked[0][0] < minimum_score:
        return None
    runner_up = ranked[1][0] if len(ranked) > 1 else 0.0
    if ranked[0][0] - runner_up < minimum_margin:
        return None
    score, method, player = ranked[0]
    return NameMatch(player=player, score=score, method=method)
