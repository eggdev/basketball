from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class Player:
    fantrax_id: str
    name: str


@dataclass(frozen=True)
class DraftPick:
    pick: int
    player_id: str | None
    team_id: str
    bid: Decimal | None
    timestamp_ms: int | None


@dataclass(frozen=True)
class CsvRosterEntry:
    manager: str
    roster_slot: int
    source_name: str
    price: Decimal | None
    placeholder: bool = False


@dataclass
class CsvManagerRoster:
    manager: str
    entries: list[CsvRosterEntry] = field(default_factory=list)


@dataclass(frozen=True)
class NameMatch:
    player: Player
    score: float
    method: str


@dataclass(frozen=True)
class ValidationIssue:
    severity: str
    code: str
    message: str
    season: str
    context: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "season": self.season,
            "context": self.context,
        }
