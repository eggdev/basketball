from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from functools import lru_cache
from typing import Any

from .models import (
    CsvManagerRoster,
    CsvRosterEntry,
    DraftPick,
    NameMatch,
    Player,
    ValidationIssue,
)
from .names import (
    AliasTarget,
    best_name_match,
    canonical_alias_name,
    player_key,
    score_name,
)


def _assign_managers_to_teams(
    managers: list[CsvManagerRoster],
    team_ids: list[str],
    preliminary: dict[str, set[str]],
    team_player_ids: dict[str, set[str]],
) -> tuple[dict[str, str], dict[str, int]]:
    scores = [
        [len(preliminary[manager.manager] & team_player_ids[team_id]) for team_id in team_ids]
        for manager in managers
    ]

    @lru_cache(maxsize=None)
    def solve(manager_index: int, used_mask: int) -> tuple[int, tuple[int, ...]]:
        if manager_index == len(managers):
            return 0, ()
        best_score = -1
        best_assignment: tuple[int, ...] = ()
        for team_index in range(len(team_ids)):
            if used_mask & (1 << team_index):
                continue
            remainder_score, remainder = solve(
                manager_index + 1,
                used_mask | (1 << team_index),
            )
            candidate_score = scores[manager_index][team_index] + remainder_score
            candidate_assignment = (team_index,) + remainder
            if candidate_score > best_score or (
                candidate_score == best_score and candidate_assignment < best_assignment
            ):
                best_score = candidate_score
                best_assignment = candidate_assignment
        return best_score, best_assignment

    _, assignment = solve(0, 0)
    mapping = {
        manager.manager: team_ids[team_index]
        for manager, team_index in zip(managers, assignment)
    }
    overlaps = {
        manager.manager: scores[manager_index][team_index]
        for manager_index, (manager, team_index) in enumerate(zip(managers, assignment))
    }
    return mapping, overlaps


def _best_roster_assignment(
    season: str,
    entries: list[CsvRosterEntry],
    players: list[Player],
    aliases: dict[tuple[str, str], AliasTarget],
) -> dict[int, NameMatch]:
    score_matrix = [
        [score_name(season, entry.source_name, player, aliases) for player in players]
        for entry in entries
    ]

    @lru_cache(maxsize=None)
    def solve(entry_index: int, used_mask: int) -> tuple[float, tuple[int | None, ...]]:
        if entry_index == len(entries):
            return 0.0, ()
        best_score, remainder = solve(entry_index + 1, used_mask)
        best_assignment: tuple[int | None, ...] = (None,) + remainder
        for player_index in range(len(players)):
            if used_mask & (1 << player_index):
                continue
            match_score = score_matrix[entry_index][player_index][0]
            if match_score < 0.45:
                continue
            remainder_score, remainder = solve(
                entry_index + 1,
                used_mask | (1 << player_index),
            )
            candidate_score = match_score + remainder_score
            candidate_assignment = (player_index,) + remainder
            if candidate_score > best_score:
                best_score = candidate_score
                best_assignment = candidate_assignment
        return best_score, best_assignment

    _, assignment = solve(0, 0)
    matches: dict[int, NameMatch] = {}
    for entry_index, player_index in enumerate(assignment):
        if player_index is None:
            continue
        score, method = score_matrix[entry_index][player_index]
        if score >= 0.72:
            matches[entry_index] = NameMatch(
                player=players[player_index],
                score=score,
                method=method,
            )
    return matches


def reconcile_csv_season(
    season: str,
    league_id: str,
    rosters: list[CsvManagerRoster],
    picks: list[DraftPick],
    players_by_id: dict[str, Player],
    team_names: dict[str, str],
    aliases: dict[tuple[str, str], AliasTarget],
) -> tuple[list[dict[str, Any]], list[ValidationIssue], dict[str, Any]]:
    issues: list[ValidationIssue] = []
    picks_by_team: dict[str, list[DraftPick]] = defaultdict(list)
    pick_by_player: dict[str, DraftPick] = {}
    for pick in picks:
        picks_by_team[pick.team_id].append(pick)
        if pick.player_id:
            pick_by_player[pick.player_id] = pick
    for team_picks in picks_by_team.values():
        team_picks.sort(key=lambda pick: pick.pick)

    drafted_players = [
        players_by_id[pick.player_id]
        for pick in picks
        if pick.player_id and pick.player_id in players_by_id
    ]

    preliminary: dict[str, set[str]] = defaultdict(set)
    for roster in rosters:
        for entry in roster.entries:
            if entry.placeholder:
                continue
            match = best_name_match(
                season,
                entry.source_name,
                drafted_players,
                aliases,
                minimum_score=0.86,
                minimum_margin=0.05,
            )
            if match:
                preliminary[roster.manager].add(match.player.fantrax_id)

    team_ids = sorted(picks_by_team)
    if len(rosters) != len(team_ids):
        issues.append(
            ValidationIssue(
                severity="error",
                code="team_count_mismatch",
                message="CSV manager count does not match Fantrax team count",
                season=season,
                context={"csv_managers": len(rosters), "fantrax_teams": len(team_ids)},
            )
        )
        return [], issues, {"team_mappings": []}

    team_player_ids = {
        team_id: {
            pick.player_id
            for pick in team_picks
            if pick.player_id and pick.player_id in players_by_id
        }
        for team_id, team_picks in picks_by_team.items()
    }
    manager_to_team, overlaps = _assign_managers_to_teams(
        rosters,
        team_ids,
        preliminary,
        team_player_ids,
    )

    rows: list[dict[str, Any]] = []
    team_mappings: list[dict[str, Any]] = []
    for roster in rosters:
        team_id = manager_to_team[roster.manager]
        team_picks = picks_by_team[team_id]
        team_players = [
            players_by_id[pick.player_id]
            for pick in team_picks
            if pick.player_id and pick.player_id in players_by_id
        ]
        overlap = overlaps[roster.manager]
        team_mappings.append(
            {
                "manager": roster.manager,
                "team_id": team_id,
                "team_name": team_names.get(team_id, ""),
                "high_confidence_player_overlap": overlap,
            }
        )
        if overlap < 4:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="low_confidence_team_mapping",
                    message="Manager-to-team mapping has too little player overlap",
                    season=season,
                    context={
                        "manager": roster.manager,
                        "team_id": team_id,
                        "team_name": team_names.get(team_id, ""),
                        "overlap": overlap,
                    },
                )
            )

        named_entries = [entry for entry in roster.entries if not entry.placeholder]
        placeholder_entries = [entry for entry in roster.entries if entry.placeholder]
        matches = _best_roster_assignment(season, named_entries, team_players, aliases)
        matched_ids: set[str] = set()
        matched_pick_numbers: set[int] = set()
        matched_entry_indexes: set[int] = set()
        for entry_index, entry in enumerate(named_entries):
            match = matches.get(entry_index)
            if not match:
                continue
            matched_ids.add(match.player.fantrax_id)
            pick = pick_by_player[match.player.fantrax_id]
            matched_pick_numbers.add(pick.pick)
            matched_entry_indexes.add(entry_index)
            rows.append(
                _normalized_row(
                    season=season,
                    league_id=league_id,
                    team_id=team_id,
                    team_name=team_names.get(team_id, ""),
                    manager=roster.manager,
                    entry=entry,
                    pick=pick,
                    player=match.player,
                    match=match,
                    price_source="csv",
                )
            )

        unmatched_entries = [
            entry
            for index, entry in enumerate(named_entries)
            if index not in matched_entry_indexes
        ]
        unmatched_picks = [
            pick for pick in team_picks if pick.pick not in matched_pick_numbers
        ]
        recoverable_picks = [
            pick
            for pick in unmatched_picks
            if not pick.player_id or pick.player_id not in players_by_id
        ]
        if len(unmatched_entries) == len(recoverable_picks) == 1:
            entry = unmatched_entries.pop()
            pick = recoverable_picks.pop()
            global_match = best_name_match(
                season,
                entry.source_name,
                list(players_by_id.values()),
                aliases,
                minimum_score=0.9,
                minimum_margin=0.05,
            )
            alias_name = canonical_alias_name(season, entry.source_name, aliases)
            canonical_name = (
                alias_name
                or (global_match.player.name if global_match else None)
                or entry.source_name.strip()
            )
            recovered_id = pick.player_id or (
                global_match.player.fantrax_id if global_match else ""
            )
            recovered_player = Player(recovered_id, canonical_name)
            confidence = 1.0 if alias_name else (0.95 if global_match else 0.8)
            method = (
                "alias_historical_id"
                if alias_name and pick.player_id
                else "catalog_team_slot"
                if global_match
                else "source_name_team_slot"
            )
            rows.append(
                _normalized_row(
                    season=season,
                    league_id=league_id,
                    team_id=team_id,
                    team_name=team_names.get(team_id, ""),
                    manager=roster.manager,
                    entry=entry,
                    pick=pick,
                    player=recovered_player,
                    match=NameMatch(recovered_player, confidence, method),
                    price_source="csv",
                )
            )
            matched_pick_numbers.add(pick.pick)
            issues.append(
                ValidationIssue(
                    severity="warning",
                    code="player_recovered_from_team_slot",
                    message="Recovered a player missing from the historical Fantrax catalog",
                    season=season,
                    context={
                        "manager": roster.manager,
                        "source_name": entry.source_name,
                        "player_name": canonical_name,
                        "player_id": recovered_id,
                        "fantrax_pick": pick.pick,
                    },
                )
            )

        for entry in unmatched_entries:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="unmatched_player",
                    message=f"Could not safely match {entry.source_name!r}",
                    season=season,
                    context={
                        "manager": roster.manager,
                        "team_id": team_id,
                        "slot": entry.roster_slot,
                        "source_name": entry.source_name,
                        "team_candidates": [player.name for player in team_players],
                    },
                )
            )

        remaining_picks = [
            pick for pick in team_picks if pick.pick not in matched_pick_numbers
        ]
        known_remaining_picks = [
            pick
            for pick in remaining_picks
            if pick.player_id and pick.player_id in players_by_id
        ]
        for pick in known_remaining_picks:
            player = players_by_id[pick.player_id]
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_csv_price",
                    message="Fantrax drafted player has no usable CSV price",
                    season=season,
                    context={
                        "manager": roster.manager,
                        "team_id": team_id,
                        "player_id": pick.player_id,
                        "player_name": player.name,
                        "fantrax_pick": pick.pick,
                    },
                )
            )

        unknown_remaining_count = len(remaining_picks) - len(known_remaining_picks)
        if unknown_remaining_count > len(placeholder_entries):
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="unresolved_fantrax_slots",
                    message="Historical Fantrax slots could not be paired with CSV players or placeholders",
                    season=season,
                    context={
                        "manager": roster.manager,
                        "unresolved_slots": unknown_remaining_count,
                        "placeholders": len(placeholder_entries),
                    },
                )
            )

        for entry in placeholder_entries:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    code="empty_roster_slot",
                    message="CSV and Fantrax contain an empty historical roster slot",
                    season=season,
                    context={
                        "manager": roster.manager,
                        "slot": entry.roster_slot,
                        "recorded_price": str(entry.price) if entry.price is not None else None,
                    },
                )
            )

    duplicate_ids = sorted(
        identity
        for identity in {row["player_key"] for row in rows}
        if sum(row["player_key"] == identity for row in rows) > 1
    )
    if duplicate_ids:
        issues.append(
            ValidationIssue(
                severity="error",
                code="duplicate_players",
                message="Normalized results contain duplicate players",
                season=season,
                context={"player_keys": duplicate_ids},
            )
        )

    return rows, issues, {"team_mappings": team_mappings}


def _normalized_row(
    *,
    season: str,
    league_id: str,
    team_id: str,
    team_name: str,
    manager: str,
    entry: CsvRosterEntry,
    pick: DraftPick,
    player: Player,
    match: NameMatch,
    price_source: str,
) -> dict[str, Any]:
    return {
        "season": season,
        "league_id": league_id,
        "fantrax_pick": pick.pick,
        "roster_slot": entry.roster_slot,
        "team_id": team_id,
        "team_name": team_name,
        "manager_label": manager,
        "player_key": player_key(player.name),
        "fantrax_player_id": player.fantrax_id,
        "player_name": player.name,
        "source_player_name": entry.source_name,
        "price": entry.price,
        "price_source": price_source,
        "match_method": match.method,
        "match_confidence": round(match.score, 3),
        "drafted_at_ms": pick.timestamp_ms,
    }


def normalize_fantrax_auction(
    season: str,
    league_id: str,
    picks: list[DraftPick],
    players_by_id: dict[str, Player],
    team_names: dict[str, str],
) -> tuple[list[dict[str, Any]], list[ValidationIssue]]:
    rows: list[dict[str, Any]] = []
    issues: list[ValidationIssue] = []
    for pick in picks:
        if not pick.player_id:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_fantrax_player_id",
                    message="Fantrax auction slot has no player ID and no CSV fallback",
                    season=season,
                    context={"pick": pick.pick, "team_id": pick.team_id},
                )
            )
            continue
        player = players_by_id.get(pick.player_id)
        if not player:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_player_catalog_entry",
                    message="Fantrax auction player is absent from the player catalog",
                    season=season,
                    context={"player_id": pick.player_id, "pick": pick.pick},
                )
            )
            continue
        if pick.bid is None:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_fantrax_bid",
                    message="Fantrax auction result has no bid and no CSV source",
                    season=season,
                    context={"player_id": pick.player_id, "pick": pick.pick},
                )
            )
            continue
        rows.append(
            {
                "season": season,
                "league_id": league_id,
                "fantrax_pick": pick.pick,
                "roster_slot": "",
                "team_id": pick.team_id,
                "team_name": team_names.get(pick.team_id, ""),
                "manager_label": "",
                "player_key": player_key(player.name),
                "fantrax_player_id": player.fantrax_id,
                "player_name": player.name,
                "source_player_name": player.name,
                "price": pick.bid,
                "price_source": "fantrax",
                "match_method": "fantrax_id",
                "match_confidence": 1.0,
                "drafted_at_ms": pick.timestamp_ms,
            }
        )
    return rows, issues
