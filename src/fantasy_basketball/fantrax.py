from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .models import DraftPick, Player
from .names import fantrax_display_name


class FantraxError(RuntimeError):
    pass


class FantraxClient:
    BASE_URL = "https://www.fantrax.com/fxea/general"

    def __init__(self, cache_dir: Path, refresh: bool = False, timeout: int = 30):
        self.cache_dir = cache_dir
        self.refresh = refresh
        self.timeout = timeout

    def _get(
        self,
        endpoint: str,
        params: dict[str, str],
        cache_name: str,
    ) -> Any:
        cache_path = self.cache_dir / cache_name
        if cache_path.exists() and not self.refresh:
            return json.loads(cache_path.read_text(encoding="utf-8"))

        url = f"{self.BASE_URL}/{endpoint}?{urlencode(params)}"
        request = Request(
            url,
            headers={"User-Agent": "fantasy-basketball-importer/0.1"},
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = response.read().decode("utf-8")
        except Exception as exc:  # urllib raises several transport-specific types
            if cache_path.exists():
                return json.loads(cache_path.read_text(encoding="utf-8"))
            raise FantraxError(f"Unable to fetch {endpoint}: {exc}") from exc

        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise FantraxError(f"Fantrax returned non-JSON data for {endpoint}") from exc

        cache_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = cache_path.with_suffix(cache_path.suffix + ".tmp")
        temp_path.write_text(
            json.dumps(parsed, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(cache_path)
        return parsed

    def player_catalog(self, sport: str) -> dict[str, Player]:
        payload = self._get(
            "getPlayerIds",
            {"sport": sport},
            f"players-{sport.lower()}.json",
        )
        if not isinstance(payload, dict):
            raise FantraxError("getPlayerIds returned an unexpected response shape")
        return {
            player_id: Player(
                fantrax_id=player_id,
                name=fantrax_display_name(str(record["name"])),
            )
            for player_id, record in payload.items()
            if isinstance(record, dict) and record.get("name")
        }

    def league_info(self, season: str, league_id: str) -> dict[str, Any]:
        payload = self._get(
            "getLeagueInfo",
            {"leagueId": league_id, "excludePlayerInfo": "true"},
            f"{season}/league-info.json",
        )
        if not isinstance(payload, dict) or "teamInfo" not in payload:
            raise FantraxError(f"Invalid league info for {season}")
        return payload

    def draft_results(self, season: str, league_id: str) -> tuple[dict[str, Any], list[DraftPick]]:
        payload = self._get(
            "getDraftResults",
            {"leagueId": league_id},
            f"{season}/draft-results.json",
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("draftPicks"), list):
            raise FantraxError(f"Invalid draft results for {season}")

        picks = []
        for raw in payload["draftPicks"]:
            bid = raw.get("bid")
            picks.append(
                DraftPick(
                    pick=int(raw["pick"]),
                    player_id=str(raw["playerId"]) if raw.get("playerId") else None,
                    team_id=str(raw["teamId"]),
                    bid=Decimal(str(bid)) if bid is not None else None,
                    timestamp_ms=int(raw["time"]) if raw.get("time") is not None else None,
                )
            )
        return payload, picks
