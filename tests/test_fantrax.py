from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fantasy_basketball.fantrax import FantraxClient


class StubFantraxClient(FantraxClient):
    def _get(self, endpoint, params, cache_name):  # type: ignore[override]
        return {
            "draftPicks": [
                {"pick": 1, "teamId": "team-1", "playerId": "player-1", "bid": 5},
                {"pick": 2, "teamId": "team-1"},
            ]
        }


class FantraxTests(unittest.TestCase):
    def test_preserves_historical_slot_without_player_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            client = StubFantraxClient(Path(directory))
            _, picks = client.draft_results("2021-22", "league")

        self.assertEqual(2, len(picks))
        self.assertEqual("player-1", picks[0].player_id)
        self.assertIsNone(picks[1].player_id)


if __name__ == "__main__":
    unittest.main()
