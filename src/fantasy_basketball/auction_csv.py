from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .models import CsvManagerRoster, CsvRosterEntry, ValidationIssue


def _parse_price(value: str) -> Decimal | None:
    cleaned = value.strip().replace("$", "").replace(",", "")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid auction price: {value!r}") from exc


def parse_auction_matrix(
    path: Path,
    season: str,
    expected_roster_size: int,
) -> tuple[list[CsvManagerRoster], list[ValidationIssue]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))

    issues: list[ValidationIssue] = []
    manager_row_index = -1
    price_columns: list[int] = []
    for row_index, row in enumerate(rows):
        current = [index for index, value in enumerate(row) if value.strip() == "$0"]
        if len(current) > len(price_columns):
            manager_row_index = row_index
            price_columns = current

    if manager_row_index < 0 or not price_columns:
        raise ValueError(f"Could not locate manager header row in {path}")

    manager_row = rows[manager_row_index]
    name_columns = [column - 1 for column in price_columns]
    slot_column = name_columns[0] - 1
    rosters: list[CsvManagerRoster] = []
    for name_column in name_columns:
        manager = manager_row[name_column].strip().rstrip("*").strip()
        if not manager:
            raise ValueError(f"Missing manager name in {path} column {name_column + 1}")
        rosters.append(CsvManagerRoster(manager=manager))

    seen_slots: set[int] = set()
    for row in rows[manager_row_index + 1 :]:
        if slot_column < 0 or slot_column >= len(row):
            continue
        try:
            slot = int(row[slot_column].strip())
        except ValueError:
            continue
        if slot < 1 or slot > expected_roster_size:
            continue
        seen_slots.add(slot)
        for roster, name_column, price_column in zip(rosters, name_columns, price_columns):
            source_name = row[name_column].strip() if name_column < len(row) else ""
            price_text = row[price_column] if price_column < len(row) else ""
            try:
                price = _parse_price(price_text)
            except ValueError:
                price = None
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="invalid_price",
                        message=f"Invalid price for {source_name or 'empty roster slot'}",
                        season=season,
                        context={"manager": roster.manager, "slot": slot, "value": price_text},
                    )
                )
            placeholder = source_name.lower() in {"x", "tbd", "n/a", "na"} or not source_name
            roster.entries.append(
                CsvRosterEntry(
                    manager=roster.manager,
                    roster_slot=slot,
                    source_name=source_name,
                    price=price,
                    placeholder=placeholder,
                )
            )

    expected_slots = set(range(1, expected_roster_size + 1))
    if seen_slots != expected_slots:
        issues.append(
            ValidationIssue(
                severity="error",
                code="missing_roster_rows",
                message="CSV does not contain every expected roster row",
                season=season,
                context={"missing_slots": sorted(expected_slots - seen_slots)},
            )
        )
    return rosters, issues
