from __future__ import annotations

import csv
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Any

from .auction_csv import parse_auction_matrix
from .fantrax import FantraxClient
from .models import ValidationIssue
from .names import load_aliases
from .reconcile import normalize_fantrax_auction, reconcile_csv_season


OUTPUT_FIELDS = [
    "season",
    "league_id",
    "fantrax_pick",
    "roster_slot",
    "team_id",
    "team_name",
    "manager_label",
    "player_key",
    "fantrax_player_id",
    "player_name",
    "source_player_name",
    "price",
    "price_source",
    "match_method",
    "match_confidence",
    "drafted_at_ms",
]


def _team_names(league_info: dict[str, Any]) -> dict[str, str]:
    team_info = league_info.get("teamInfo", {})
    if isinstance(team_info, list):
        return {str(team["id"]): str(team["name"]) for team in team_info}
    return {
        str(team_id): str(team.get("name", ""))
        for team_id, team in team_info.items()
        if isinstance(team, dict)
    }


def _teams(league_info: dict[str, Any]) -> list[dict[str, str | None]]:
    team_info = league_info.get("teamInfo", {})
    values = team_info if isinstance(team_info, list) else team_info.values()
    return sorted(
        [
            {
                "id": str(team["id"]),
                "name": str(team["name"]),
                "division": str(team["division"]) if team.get("division") else None,
            }
            for team in values
            if isinstance(team, dict) and team.get("id") and team.get("name")
        ],
        key=lambda team: str(team["id"]),
    )


def _scoring_rules(league_info: dict[str, Any]) -> list[dict[str, Any]]:
    groups = league_info.get("scoringSystem", {}).get("scoringCategorySettings", [])
    rules = []
    for group in groups:
        for config in group.get("configs", []):
            category = config.get("scoringCategory", {})
            rules.append(
                {
                    "code": category.get("code"),
                    "short_name": category.get("shortName"),
                    "name": category.get("name"),
                    "points": config.get("points"),
                    "position": config.get("position", {}).get("code"),
                }
            )
    return rules


def _decimal_for_csv(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    return value


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with temp_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        for row in sorted(rows, key=lambda item: (item["season"], int(item["fantrax_pick"]))):
            writer.writerow({key: _decimal_for_csv(row.get(key, "")) for key in OUTPUT_FIELDS})
    temp_path.replace(path)


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temp_path.replace(path)


def run_import(
    project_root: Path,
    config_path: Path,
    aliases_path: Path,
    refresh: bool = False,
) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    aliases = load_aliases(aliases_path)
    client = FantraxClient(project_root / "data/cache/fantrax", refresh=refresh)
    players_by_id = client.player_catalog(config["sport"])

    all_rows: list[dict[str, Any]] = []
    all_issues: list[ValidationIssue] = []
    season_reports: list[dict[str, Any]] = []
    league_seasons: list[dict[str, Any]] = []
    history_ids: set[str] = set()

    for season_config in config["seasons"]:
        season = season_config["season"]
        league_id = season_config["league_id"]
        league_info = client.league_info(season, league_id)
        draft_payload, picks = client.draft_results(season, league_id)
        team_names = _team_names(league_info)
        history_id = str(league_info.get("leagueHistoryId", ""))
        if history_id:
            history_ids.add(history_id)

        season_issues: list[ValidationIssue] = []
        season_details: dict[str, Any] = {}
        auction_csv = season_config.get("auction_csv")
        if auction_csv:
            csv_path = project_root / auction_csv
            rosters, csv_issues = parse_auction_matrix(
                csv_path,
                season,
                int(config["expected_roster_size"]),
            )
            rows, reconciliation_issues, season_details = reconcile_csv_season(
                season=season,
                league_id=league_id,
                rosters=rosters,
                picks=picks,
                players_by_id=players_by_id,
                team_names=team_names,
                aliases=aliases,
            )
            season_issues.extend(csv_issues)
            season_issues.extend(reconciliation_issues)
            source = "csv+fantrax"
        elif picks and all(pick.player_id and pick.bid is not None for pick in picks):
            rows, fantrax_issues = normalize_fantrax_auction(
                season,
                league_id,
                picks,
                players_by_id,
                team_names,
            )
            season_issues.extend(fantrax_issues)
            source = "fantrax"
        elif season_config.get("status") == "live" and not picks:
            rows = []
            source = "fantrax_live"
        else:
            rows = []
            source = "unavailable"
            season_issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_auction_price_source",
                    message="Season has neither a CSV nor Fantrax bid values",
                    season=season,
                )
            )

        raw_pick_count = len(picks)
        empty_pick_count = sum(not pick.player_id for pick in picks)
        expected_pick_count = len(team_names) * int(config["expected_roster_size"])
        if picks and raw_pick_count != expected_pick_count:
            season_issues.append(
                ValidationIssue(
                    severity="error",
                    code="fantrax_pick_count_mismatch",
                    message="Fantrax draft pick count does not match teams times roster size",
                    season=season,
                    context={"actual": raw_pick_count, "expected": expected_pick_count},
                )
            )

        all_rows.extend(rows)
        all_issues.extend(season_issues)
        severity_counts = Counter(issue.severity for issue in season_issues)
        prices = [row["price"] for row in rows if row.get("price") is not None]
        rows_by_team: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            rows_by_team.setdefault(str(row["team_id"]), []).append(row)
        team_summaries = []
        for team_id, team_rows in sorted(rows_by_team.items()):
            team_prices = [
                row["price"] for row in team_rows if row.get("price") is not None
            ]
            team_summaries.append(
                {
                    "team_id": team_id,
                    "team_name": team_rows[0]["team_name"],
                    "manager_label": team_rows[0]["manager_label"],
                    "priced_players": len(team_prices),
                    "total_spend": str(sum(team_prices, Decimal("0"))),
                }
            )
        season_reports.append(
            {
                "season": season,
                "league_id": league_id,
                "source": source,
                "team_count": len(team_names),
                "fantrax_slot_count": raw_pick_count,
                "fantrax_player_pick_count": raw_pick_count - empty_pick_count,
                "fantrax_missing_player_id_count": empty_pick_count,
                "normalized_price_count": len(prices),
                "normalized_total_spend": str(sum(prices, Decimal("0"))),
                "spend_delta_from_base_pool": (
                    str(
                        sum(prices, Decimal("0"))
                        - Decimal(str(config["base_budget"])) * len(team_names)
                    )
                    if rows
                    else None
                ),
                "draft_state": draft_payload.get("draftState"),
                "errors": severity_counts["error"],
                "warnings": severity_counts["warning"],
                "team_summaries": team_summaries,
                **season_details,
            }
        )
        league_seasons.append(
            {
                "season": season,
                "league_id": league_id,
                "league_history_id": history_id,
                "season_year": league_info.get("seasonYear"),
                "status": season_config.get("status"),
                "team_count": len(team_names),
                "teams": _teams(league_info),
                "roster": league_info.get("rosterInfo", {}),
                "draft_type": league_info.get("draftType"),
                "draft_settings": league_info.get("draftSettings", {}),
                "scoring_type": league_info.get("scoringSystem", {}).get("type"),
                "scoring_rules": _scoring_rules(league_info),
            }
        )

    if len(history_ids) > 1:
        all_issues.append(
            ValidationIssue(
                severity="error",
                code="league_history_mismatch",
                message="Configured seasons do not share one Fantrax league history ID",
                season="all",
                context={"league_history_ids": sorted(history_ids)},
            )
        )

    output_dir = project_root / "data/normalized"
    report_dir = project_root / "data/reports"
    _write_csv(output_dir / "auction_results.csv", all_rows)
    _write_json(output_dir / "league_seasons.json", league_seasons)
    report = {
        "valid": not any(issue.severity == "error" for issue in all_issues),
        "summary": {
            "normalized_rows": len(all_rows),
            "errors": sum(issue.severity == "error" for issue in all_issues),
            "warnings": sum(issue.severity == "warning" for issue in all_issues),
            "league_history_ids": sorted(history_ids),
        },
        "seasons": season_reports,
        "issues": [issue.to_dict() for issue in all_issues],
    }
    _write_json(report_dir / "import_validation.json", report)
    return report
